/**
 * Marchlands (Spec v2.0) — Turn Lifecycle, Undo Commit Points & Fog-Filtered Recap
 */

import type {
  ChronicleEvent,
  CoordKey,
  Difficulty,
  GameState,
  HouseId,
  TileState,
} from '../types/game.ts';
import {
  HIGH_SEAT_MAX_HP,
  HIGH_SEAT_REGEN,
  SEASONS,
  VILLAGE_MAX_HP,
  VILLAGE_REGEN,
} from '../data/index.ts';
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

function regenerateNeutralStructures(state: GameState): GameState {
  const nextTiles: Record<CoordKey, TileState> = { ...state.tiles };
  let changed = false;

  for (const [k, t] of Object.entries(nextTiles)) {
    if (t.landmark === 'frontier_village' && t.villageHp !== null && t.villageHp > 0) {
      if (t.villageDamagedLastRound) {
        nextTiles[k] = { ...t, villageDamagedLastRound: false };
        changed = true;
      } else if (t.villageHp < VILLAGE_MAX_HP) {
        nextTiles[k] = { ...t, villageHp: Math.min(VILLAGE_MAX_HP, t.villageHp + VILLAGE_REGEN) };
        changed = true;
      }
    } else if (t.landmark === 'high_seat' && t.highSeatHp !== null && t.highSeatHp > 0) {
      if (t.highSeatDamagedLastRound) {
        nextTiles[k] = { ...t, highSeatDamagedLastRound: false };
        changed = true;
      } else if (t.highSeatHp < HIGH_SEAT_MAX_HP) {
        nextTiles[k] = {
          ...t,
          highSeatHp: Math.min(HIGH_SEAT_MAX_HP, t.highSeatHp + HIGH_SEAT_REGEN),
        };
        changed = true;
      }
    }
  }

  return changed ? { ...state, tiles: nextTiles } : state;
}

export function endHouseTurn(
  state: GameState,
  difficultyByHouse?: Partial<Record<HouseId, Difficulty>>,
): GameState {
  if (state.phase === 'game_over') return state;

  const endingHouseId = state.activeHouseId;
  let nextState = processEndOfTurnHealingAndAttrition(state, endingHouseId);
  nextState = checkWritCompletion(nextState, endingHouseId);
  nextState = evaluateRegentsMandate(nextState, endingHouseId);

  if (nextState.phase === 'game_over') return nextState;

  const order = nextState.houseOrder;
  const currentIdx = order.indexOf(endingHouseId);
  let nextHouseId: HouseId | null = null;
  let wrapped = false;

  for (let offset = 1; offset <= order.length; offset++) {
    const idx = (currentIdx + offset) % order.length;
    if (idx <= currentIdx) wrapped = true;
    const cand = order[idx]!;
    if (!nextState.houses[cand]?.isEliminated) {
      nextHouseId = cand;
      break;
    }
  }

  nextState = checkVictory(nextState, wrapped);
  if (nextState.phase === 'game_over' || nextHouseId === null) return nextState;

  if (wrapped) {
    nextState = { ...nextState, turnNumber: nextState.turnNumber + 1 };
    nextState = regenerateNeutralStructures(nextState);
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

export type PlayerActionType =
  | 'move'
  | 'build'
  | 'upgrade_improvement'
  | 'build_road'
  | 'clear_timber'
  | 'build_outpost'
  | 'train'
  | 'rehome'
  | 'fortify'
  | 'overwatch'
  | 'deploy'
  | 'reinforce'
  | 'commander_skill'
  | 'rally_commander'
  | 'garrison_volley'
  | 'upgrade_keep_t3'
  | 'demolish'
  | 'disband'
  | 'repair_keep'
  | 'crown_grant'
  | 'attack'
  | 'attack_keep'
  | 'attack_high_seat'
  | 'attack_outpost'
  | 'attack_village'
  | 'attack_camp'
  | 'raze'
  | 'pillage'
  | 'annex'
  | 'draft'
  | 'specialize'
  | 'citadel'
  | 'honor'
  | 'commander_trait'
  | 'event_choice'
  | 'writ_tithe'
  | 'end_turn';

const ALWAYS_COMMIT_ACTIONS = new Set<PlayerActionType>([
  'attack',
  'attack_keep',
  'attack_high_seat',
  'attack_outpost',
  'attack_village',
  'attack_camp',
  'garrison_volley',
  'commander_skill',
  'raze',
  'pillage',
  'annex',
  'clear_timber',
  'build_outpost',
  'upgrade_keep_t3',
  'draft',
  'specialize',
  'citadel',
  'honor',
  'commander_trait',
  'event_choice',
  'writ_tithe',
  'end_turn',
]);

export function isCommitPoint(
  prevState: GameState,
  nextState: GameState,
  actionType: PlayerActionType,
  viewerHouseId: HouseId,
): boolean {
  if (ALWAYS_COMMIT_ACTIONS.has(actionType)) return true;
  if (nextState.rngCounter !== prevState.rngCounter) return true;

  // Overwatch shot fired during move commits
  if (nextState.nextChronicleSeq > prevState.nextChronicleSeq) {
    const recent = nextState.chronicle[nextState.chronicle.length - 1];
    if (recent?.type === 'overwatch_shot') return true;
  }

  const prevRevealed = prevState.houses[viewerHouseId]?.stats.tilesRevealed ?? 0;
  const nextRevealed = nextState.houses[viewerHouseId]?.stats.tilesRevealed ?? 0;
  if (nextRevealed > prevRevealed) return true;

  const prevFog = prevState.fog[viewerHouseId] ?? {};
  const nextFog = nextState.fog[viewerHouseId] ?? {};
  for (const [k, status] of Object.entries(nextFog)) {
    if (status !== 'visible' || prevFog[k] === 'visible') continue;
    const tile = nextState.tiles[k]!;
    if (tile.landmark !== 'none') return true;
    if (tile.ownerHouseId !== null && tile.ownerHouseId !== viewerHouseId && tile.improvement !== null) {
      return true;
    }
    if (Object.values(nextState.units).some((u) => u.tileKey === k && u.houseId !== viewerHouseId)) {
      return true;
    }
  }

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

  if (!house) return { yourRealm, sinceYouLastRuled, threats, awaitingYourWord };

  const keeps = getHouseKeeps(state, viewerHouseId);
  const units = getHouseUnits(state, viewerHouseId);
  const score = computeScore(state, viewerHouseId, false).total;
  yourRealm.push({
    text: `Turn ${state.turnNumber} (${SEASONS[season].name}) — ${keeps.length} Keeps, ${units.length} Units, ${house.resources.iron} Iron, ${house.favor} Favor, Score ${score}.`,
    tileKey: keeps[0]?.tileKey ?? null,
  });

  if (state.turnNumber % 3 === 0) {
    const nextSeason = getSeason(state.turnNumber + 1);
    yourRealm.push({
      text: `${SEASONS[nextSeason].name} (${SEASONS[nextSeason].subtitle}) begins next turn.`,
      tileKey: null,
    });
  }

  const isEventVisible = (e: ChronicleEvent): boolean => {
    if (e.isPublic) return true;
    if (e.actorHouseId === viewerHouseId || e.targetHouseId === viewerHouseId) return true;
    return e.tileKey !== null && fog[e.tileKey] === 'visible';
  };

  for (const e of state.chronicle) {
    if (e.turnNumber < sinceTurn) continue;
    if (!isEventVisible(e)) continue;
    sinceYouLastRuled.push({ text: e.summary, tileKey: e.tileKey });
  }

  if (state.crown.claimantHouseId && state.crown.claimantHouseId !== viewerHouseId) {
    threats.push({
      text: `House ${state.crown.claimantHouseId} holds the Regent's Mandate claim!`,
      tileKey: null,
    });
  }
  for (const u of Object.values(state.units)) {
    if (u.houseId === viewerHouseId || fog[u.tileKey] !== 'visible') continue;
    const nearKeep = keeps.find(
      (k) => Math.max(Math.abs(k.x - u.x), Math.abs(k.y - u.y)) <= 4,
    );
    if (nearKeep) {
      threats.push({
        text: `Enemy ${u.typeId} (${u.houseId}) spotted near ${nearKeep.name}.`,
        tileKey: u.tileKey,
      });
    }
  }

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
  for (const kid of house.pendingCitadelKeepIds) {
    const k = state.keeps[kid];
    if (k) {
      awaitingYourWord.push({
        text: `${k.name} rose to Tier 3 — choose a Citadel Charter.`,
        tileKey: k.tileKey,
      });
    }
  }
  if (house.pendingDraftCount > 0) {
    awaitingYourWord.push({
      text: `${house.pendingDraftCount} Royal Doctrine Pair(s) awaiting selection.`,
      tileKey: null,
    });
  }

  return { yourRealm, sinceYouLastRuled, threats, awaitingYourWord };
}
