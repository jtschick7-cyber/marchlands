/**
 * Marchlands (Spec v0.3) — Turn Lifecycle, Undo Commit Points & Fog-Filtered Recap
 */

import type {
  ChronicleEvent,
  CoordKey,
  Difficulty,
  GameState,
  HouseId,
  TileState,
} from '../types/game.ts';
import { SEASONS, VILLAGE_MAX_HP, VILLAGE_REGEN } from '../data/index.ts';
import { checkWritCompletion, evaluateRegentsMandate, publishCrownWrits } from './crown.ts';
import { openNextPendingModal } from './draftAndSpec.ts';
import {
  processEndOfTurnHealingAndAttrition,
  processHarvestAndUpkeep,
} from './economy.ts';
import { triggerSeasonalEvent } from './events.ts';
import { computeScore } from './scoring.ts';
import { getHouseKeeps, getHouseUnits, getSeason } from './stateHelpers.ts';
import { checkVictory } from './victory.ts';

/**
 * Regenerates unhit Neutral Frontier Villages (+3 HP up to 12) at the start of a new round.
 */
function regenerateNeutralVillages(state: GameState): GameState {
  const nextTiles: Record<CoordKey, TileState> = { ...state.tiles };
  let changed = false;

  for (const [k, t] of Object.entries(nextTiles)) {
    if (t.landmark === 'frontier_village' && t.villageHp !== null && t.villageHp > 0) {
      if (t.villageDamagedLastRound) {
        nextTiles[k] = { ...t, villageDamagedLastRound: false };
        changed = true;
      } else if (t.villageHp < VILLAGE_MAX_HP) {
        nextTiles[k] = {
          ...t,
          villageHp: Math.min(VILLAGE_MAX_HP, t.villageHp + VILLAGE_REGEN),
        };
        changed = true;
      }
    }
  }

  return changed ? { ...state, tiles: nextTiles } : state;
}

/**
 * Ends the active House's turn, evaluates Writs/Mandate/Victory, advances round
 * (publishing Writs & Seasonal Events on new rounds), and runs Harvest & Upkeep
 * for the next living House.
 */
export function endHouseTurn(
  state: GameState,
  difficultyByHouse?: Partial<Record<HouseId, Difficulty>>,
): GameState {
  if (state.phase === 'game_over') return state;

  const endingHouseId = state.activeHouseId;
  let nextState = processEndOfTurnHealingAndAttrition(state, endingHouseId);
  nextState = checkWritCompletion(nextState, endingHouseId);
  nextState = evaluateRegentsMandate(nextState, endingHouseId);

  if (nextState.phase === 'game_over') {
    return nextState;
  }

  // Find next living House in turn order
  const order = nextState.houseOrder;
  const currentIdx = order.indexOf(endingHouseId);
  let nextHouseId: HouseId | null = null;
  let wrapped = false;

  for (let offset = 1; offset <= order.length; offset++) {
    const idx = (currentIdx + offset) % order.length;
    if (idx <= currentIdx) {
      wrapped = true;
    }
    const cand = order[idx]!;
    if (!nextState.houses[cand]?.isEliminated) {
      nextHouseId = cand;
      break;
    }
  }

  nextState = checkVictory(nextState, wrapped);
  if (nextState.phase === 'game_over' || nextHouseId === null) {
    return nextState;
  }

  if (wrapped) {
    nextState = {
      ...nextState,
      turnNumber: nextState.turnNumber + 1,
    };
    nextState = regenerateNeutralVillages(nextState);
    nextState = publishCrownWrits(nextState);
    nextState = triggerSeasonalEvent(nextState);
  }

  nextState = {
    ...nextState,
    activeHouseId: nextHouseId,
    difficulty: difficultyByHouse?.[nextHouseId] ?? nextState.difficulty,
  };

  nextState = processHarvestAndUpkeep(nextState, nextHouseId);
  nextState = openNextPendingModal(nextState, nextHouseId);

  return nextState;
}

// ============================================================================
// Undo Commit Points (Ruling 6.4)
// ============================================================================

export type PlayerActionType =
  | 'move'
  | 'build'
  | 'train'
  | 'rehome'
  | 'crown_grant'
  | 'attack'
  | 'attack_keep'
  | 'attack_village'
  | 'attack_camp'
  | 'raze'
  | 'pillage'
  | 'annex'
  | 'draft'
  | 'specialize'
  | 'event_choice'
  | 'writ_tithe'
  | 'end_turn';

const ALWAYS_COMMIT_ACTIONS = new Set<PlayerActionType>([
  'attack',
  'attack_keep',
  'attack_village',
  'attack_camp',
  'raze',
  'pillage',
  'annex',
  'draft',
  'specialize',
  'event_choice',
  'writ_tithe',
  'end_turn',
]);

/**
 * Ruling 6.4: Returns true if the transition from `prevState` to `nextState`
 * creates a Commit Point (clearing the undo stack).
 */
export function isCommitPoint(
  prevState: GameState,
  nextState: GameState,
  actionType: PlayerActionType,
  viewerHouseId: HouseId,
): boolean {
  // 2, 4, 5, 7: Actions that always commit
  if (ALWAYS_COMMIT_ACTIONS.has(actionType)) return true;

  // 6: Any PRNG consumption commits
  if (nextState.rngCounter !== prevState.rngCounter) return true;

  // 1a: Revealed tile set grew
  const prevRevealed = prevState.houses[viewerHouseId]?.stats.tilesRevealed ?? 0;
  const nextRevealed = nextState.houses[viewerHouseId]?.stats.tilesRevealed ?? 0;
  if (nextRevealed > prevRevealed) return true;

  // 1b: A new enemy unit, enemy improvement, or landmark became visible
  const prevFog = prevState.fog[viewerHouseId] ?? {};
  const nextFog = nextState.fog[viewerHouseId] ?? {};
  for (const [k, status] of Object.entries(nextFog)) {
    if (status !== 'visible' || prevFog[k] === 'visible') continue;
    const tile = nextState.tiles[k]!;
    if (tile.landmark !== 'none') return true;
    if (tile.ownerHouseId !== null && tile.ownerHouseId !== viewerHouseId && tile.improvement !== null) {
      return true;
    }
    const enemyUnit = Object.values(nextState.units).some(
      (u) => u.tileKey === k && u.houseId !== viewerHouseId,
    );
    if (enemyUnit) return true;
  }

  // 3: A unit entered a Relic Ruin, Ancient Watchtower, or Outlaw Camp tile
  if (actionType === 'move') {
    for (const [uid, u] of Object.entries(nextState.units)) {
      const prevU = prevState.units[uid];
      if (prevU && prevU.tileKey !== u.tileKey) {
        const dest = nextState.tiles[u.tileKey];
        if (
          dest &&
          (dest.landmark === 'relic_ruin' ||
            dest.landmark === 'ancient_watchtower' ||
            dest.landmark === 'outlaw_camp')
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

// ============================================================================
// Fog-Filtered "Previously in the March..." Recap (GDD §9)
// ============================================================================

export interface RecapLine {
  readonly text: string;
  readonly tileKey: CoordKey | null;
}

export interface RecapSummary {
  readonly yourRealm: readonly RecapLine[];
  readonly sinceYouLastRuled: readonly RecapLine[];
  readonly threats: readonly RecapLine[];
  readonly awaitingYourWord: readonly RecapLine[];
}

/**
 * Builds a 4-section fog-honest campaign recap for `viewerHouseId` since `sinceTurn`.
 */
export function buildRecap(
  state: GameState,
  viewerHouseId: HouseId,
  sinceTurn: number,
): RecapSummary {
  const house = state.houses[viewerHouseId];
  const fog = state.fog[viewerHouseId] ?? {};
  const season = getSeason(state.turnNumber);

  const yourRealm: RecapLine[] = [];
  const sinceYouLastRuled: RecapLine[] = [];
  const threats: RecapLine[] = [];
  const awaitingYourWord: RecapLine[] = [];

  if (!house) {
    return { yourRealm, sinceYouLastRuled, threats, awaitingYourWord };
  }

  // 1. Your Realm
  const keeps = getHouseKeeps(state, viewerHouseId);
  const units = getHouseUnits(state, viewerHouseId);
  const score = computeScore(state, viewerHouseId, false).total;
  yourRealm.push({
    text: `Turn ${state.turnNumber} (${SEASONS[season].name}) — ${keeps.length} Keeps, ${units.length} Units, ${house.favor} Favor, Score ${score}.`,
    tileKey: keeps[0]?.tileKey ?? null,
  });

  // Next season warning 1 turn ahead
  if (state.turnNumber % 3 === 0) {
    const nextSeason = getSeason(state.turnNumber + 1);
    yourRealm.push({
      text: `${SEASONS[nextSeason].name} (${SEASONS[nextSeason].subtitle}) begins next turn.`,
      tileKey: null,
    });
  }

  // 2. Since You Last Ruled (fog-filtered ChronicleEvents)
  const isEventVisible = (e: ChronicleEvent): boolean => {
    if (e.isPublic) return true;
    if (e.actorHouseId === viewerHouseId || e.targetHouseId === viewerHouseId) return true;
    if (e.tileKey !== null && fog[e.tileKey] === 'visible') return true;
    return false;
  };

  for (const e of state.chronicle) {
    if (e.turnNumber < sinceTurn) continue;
    if (!isEventVisible(e)) continue;
    sinceYouLastRuled.push({ text: e.summary, tileKey: e.tileKey });
  }

  // 3. Threats (visible enemy units near own territory or rival Mandate Claimant)
  if (state.crown.claimantHouseId && state.crown.claimantHouseId !== viewerHouseId) {
    threats.push({
      text: `House ${state.crown.claimantHouseId} holds the Regent's Mandate claim!`,
      tileKey: null,
    });
  }
  for (const u of Object.values(state.units)) {
    if (u.houseId === viewerHouseId) continue;
    if (fog[u.tileKey] !== 'visible') continue;
    const nearKeep = keeps.find(
      (k) => Math.max(Math.abs(k.x - u.x), Math.abs(k.y - u.y)) <= 3,
    );
    if (nearKeep) {
      threats.push({
        text: `Enemy ${u.typeId} (${u.houseId}) spotted near ${nearKeep.name}.`,
        tileKey: u.tileKey,
      });
    }
  }

  // 4. Awaiting Your Word
  if (state.pendingEventChoice && state.pendingEventChoice.houseId === viewerHouseId) {
    awaitingYourWord.push({ text: 'A Frontier Event requires your decision.', tileKey: null });
  }
  for (const kid of house.pendingSpecializationKeepIds) {
    const k = state.keeps[kid];
    if (k) {
      awaitingYourWord.push({
        text: `${k.name} reached Tier 2 — choose a Stronghold Specialization.`,
        tileKey: k.tileKey,
      });
    }
  }
  if (house.pendingDraftCount > 0) {
    awaitingYourWord.push({
      text: `${house.pendingDraftCount} Royal Decree Draft(s) awaiting selection.`,
      tileKey: null,
    });
  }

  return { yourRealm, sinceYouLastRuled, threats, awaitingYourWord };
}
