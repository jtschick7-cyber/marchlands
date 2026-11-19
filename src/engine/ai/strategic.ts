/**
 * Marchlands (Spec v0.3) — Strategic AI Layer
 *
 * Updates `house.aiPlan` once per turn with posture hysteresis, target Keep
 * selection, rally point placement, Muster Rule (with 3-turn timeout &
 * engage-if-attacked), and deduplicated fog-honest 'expand' objective assignment.
 */

import type { AiPlan, AiPosture, CoordKey, GameState, HouseId, KeepState } from '../../types/game.ts';
import {
  AI_DIFFICULTY_CONFIG,
  AI_MUSTER_MIN_UNITS,
  AI_MUSTER_TIMEOUT_TURNS,
  AI_PERSONALITIES,
  AI_POSTURE_HYSTERESIS_TURNS,
  MANDATE_MIN_KEEPS,
  UNITS,
} from '../../data/index.ts';
import { chebyshevDist, coordKey, getNeighbors } from '../coords.ts';
import { getHouseKeeps, getHouseUnits } from '../stateHelpers.ts';
import { getMaxThreatOnTile, type InfluenceMaps } from './influence.ts';

function pickTargetKeep(
  state: GameState,
  houseId: HouseId,
  influence: InfluenceMaps,
): { keep: KeepState; score: number } | null {
  const fog = state.fog[houseId] ?? {};
  const myKeeps = getHouseKeeps(state, houseId);
  if (myKeeps.length === 0) return null;

  const enemyKeeps = Object.values(state.keeps).filter(
    (k) => k.ownerHouseId !== houseId && (fog[k.tileKey] ?? 'unexplored') !== 'unexplored',
  );
  if (enemyKeeps.length === 0) return null;

  let best: { keep: KeepState; score: number } | null = null;
  for (const ek of enemyKeeps) {
    const minDist = Math.max(
      1,
      Math.min(...myKeeps.map((mk) => chebyshevDist(mk.x, mk.y, ek.x, ek.y))),
    );
    const keepVal =
      (ek.tier === 2 ? 45 : 30) +
      (ek.specialization !== 'none' ? 12 : 0) +
      (state.crown.claimantHouseId === ek.ownerHouseId ? 90 : 0);

    // Estimate defensive strength from threat near keep + keep HP ratio
    let localThreat = 8 + (ek.keepHp / ek.maxKeepHp) * 10;
    for (const eu of influence.visibleEnemyUnits) {
      if (chebyshevDist(eu.x, eu.y, ek.x, ek.y) <= 2) {
        localThreat += 8;
      }
    }

    const score = (keepVal * 10) / (minDist * localThreat);
    if (
      !best ||
      score > best.score ||
      (score === best.score && ek.id.localeCompare(best.keep.id) < 0)
    ) {
      best = { keep: ek, score };
    }
  }

  return best;
}

function pickRallyPoint(
  state: GameState,
  houseId: HouseId,
  targetKeep: KeepState,
  influence: InfluenceMaps,
): CoordKey | null {
  const fog = state.fog[houseId] ?? {};
  const myKeeps = getHouseKeeps(state, houseId);
  const nearestMyKeep = myKeeps.sort(
    (a, b) =>
      chebyshevDist(a.x, a.y, targetKeep.x, targetKeep.y) -
      chebyshevDist(b.x, b.y, targetKeep.x, targetKeep.y),
  )[0];

  let bestKey: CoordKey | null = null;
  let bestScore = Infinity;

  for (const tile of Object.values(state.tiles)) {
    if ((fog[tile.key] ?? 'unexplored') === 'unexplored') continue;
    if (tile.terrain === 'mountain' || tile.terrain === 'river') continue;
    if (tile.ownerHouseId !== null && tile.ownerHouseId !== houseId) continue;

    const dTarget = chebyshevDist(tile.x, tile.y, targetKeep.x, targetKeep.y);
    if (dTarget < 3 || dTarget > 5) continue;

    const threat = getMaxThreatOnTile(influence.threatMap[tile.key]);
    const dHome = nearestMyKeep
      ? chebyshevDist(tile.x, tile.y, nearestMyKeep.x, nearestMyKeep.y)
      : 0;
    const score = threat * 4 + dHome * 0.5;

    if (
      score < bestScore ||
      (score === bestScore && bestKey !== null && tile.key.localeCompare(bestKey) < 0)
    ) {
      bestScore = score;
      bestKey = tile.key;
    }
  }

  return bestKey;
}

/**
 * Updates `house.aiPlan` at the start of `houseId`'s turn.
 */
export function updateStrategicPlan(
  state: GameState,
  houseId: HouseId,
  influence: InfluenceMaps,
): GameState {
  const house = state.houses[houseId];
  if (!house || house.isEliminated) return state;

  const personality = AI_PERSONALITIES[houseId];
  const prevPlan = house.aiPlan;
  const myKeeps = getHouseKeeps(state, houseId);
  const myUnits = getHouseUnits(state, houseId);

  // Check emergency 'defend' override: owned Keep damaged or enemies within 2 tiles of owned Keep
  const keepUnderAttack =
    myKeeps.some((k) => k.damagedLastRound) ||
    myKeeps.some((k) =>
      influence.visibleEnemyUnits.some((eu) => chebyshevDist(eu.x, eu.y, k.x, k.y) <= 2),
    );

  // Sum enemy threat on own territory vs nearby friendly strength
  let territoryThreat = 0;
  for (const tile of Object.values(state.tiles)) {
    if (tile.ownerHouseId === houseId) {
      territoryThreat += getMaxThreatOnTile(influence.threatMap[tile.key]);
    }
  }
  const friendlyStrength = myUnits.reduce((s, u) => s + UNITS[u.typeId].attack * 2, 0);

  const targetCandidate = pickTargetKeep(state, houseId, influence);
  const rivalIsClaimant =
    state.crown.claimantHouseId !== null && state.crown.claimantHouseId !== houseId;

  let posture: AiPosture;
  if (keepUnderAttack) {
    posture = 'defend';
  } else if (prevPlan && state.turnNumber < prevPlan.postureLockedUntilTurn) {
    posture = prevPlan.posture;
  } else {
    const defendScore =
      territoryThreat * personality.defendSensitivity > friendlyStrength * 1.4 &&
      territoryThreat > 15
        ? 85
        : 0;

    const claimScore =
      state.mode === 'dominion' &&
      house.favor >= 22 &&
      myKeeps.length >= MANDATE_MIN_KEEPS
        ? 75 * personality.mandatePriority
        : 0;

    const attackThreshold = rivalIsClaimant ? 8 : 16 / personality.attackAggression;
    const canAttack =
      targetCandidate !== null &&
      myUnits.length >= 2 &&
      (targetCandidate.score >= attackThreshold ||
        (rivalIsClaimant && targetCandidate.keep.ownerHouseId === state.crown.claimantHouseId));
    const attackScore = canAttack ? 60 * personality.attackAggression + (rivalIsClaimant ? 30 : 0) : 0;

    const expandScore = 50;

    if (defendScore >= claimScore && defendScore >= attackScore && defendScore >= expandScore) {
      posture = 'defend';
    } else if (claimScore >= attackScore && claimScore >= expandScore) {
      posture = 'claim';
    } else if (attackScore >= expandScore) {
      posture = 'attack';
    } else {
      posture = 'expand';
    }
  }

  let targetKeepId: string | null = null;
  let rallyTileKey: CoordKey | null = null;
  let rallyStartedTurn: number | null = null;

  if (posture === 'attack' && targetCandidate) {
    targetKeepId = targetCandidate.keep.id;
    const sameTarget = prevPlan?.posture === 'attack' && prevPlan.targetKeepId === targetKeepId;
    rallyTileKey =
      sameTarget && prevPlan.rallyTileKey
        ? prevPlan.rallyTileKey
        : pickRallyPoint(state, houseId, targetCandidate.keep, influence);
    rallyStartedTurn = sameTarget
      ? (prevPlan.rallyStartedTurn ?? state.turnNumber)
      : state.turnNumber;
  } else if (posture === 'attack' && !targetCandidate) {
    posture = 'expand';
  }

  const postureChanged = prevPlan?.posture !== posture;
  const nextPlan: AiPlan = {
    posture,
    targetKeepId,
    rallyTileKey,
    rallyStartedTurn,
    plannedOnTurn: state.turnNumber,
    postureLockedUntilTurn: postureChanged
      ? state.turnNumber + AI_POSTURE_HYSTERESIS_TURNS
      : (prevPlan?.postureLockedUntilTurn ?? state.turnNumber + AI_POSTURE_HYSTERESIS_TURNS),
  };

  return {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        aiPlan: nextPlan,
      },
    },
  };
}

/**
 * Checks whether an attacking AI House's Muster Rule is satisfied so units advance on targetKeep.
 */
export function isMusterReady(state: GameState, houseId: HouseId): boolean {
  const diffCfg = AI_DIFFICULTY_CONFIG[state.difficulty];
  if (!diffCfg.useMusterRule) return true;

  const plan = state.houses[houseId]?.aiPlan;
  if (!plan || plan.posture !== 'attack' || !plan.rallyTileKey) return true;

  const rallyTile = state.tiles[plan.rallyTileKey];
  if (!rallyTile) return true;

  const myUnits = getHouseUnits(state, houseId);
  const needed = Math.min(AI_MUSTER_MIN_UNITS, myUnits.length);

  // 1. >= 3 friendly units (or full army if < 3) within 2 tiles of rallyPoint
  const nearRally = myUnits.filter(
    (u) => chebyshevDist(u.x, u.y, rallyTile.x, rallyTile.y) <= 2,
  ).length;
  if (nearRally >= needed) return true;

  // 2. 3-turn muster timeout
  if (
    plan.rallyStartedTurn !== null &&
    state.turnNumber - plan.rallyStartedTurn >= AI_MUSTER_TIMEOUT_TURNS
  ) {
    return true;
  }

  // 3. Engage-if-attacked: any friendly unit within 3 tiles of rallyPoint took combat damage
  const attackedNearRally = myUnits.some(
    (u) =>
      u.damagedSinceLastTurn && chebyshevDist(u.x, u.y, rallyTile.x, rallyTile.y) <= 3,
  );
  if (attackedNearRally) return true;

  return false;
}

/**
 * Fog-honest deduplicated per-unit destination assignment for 'expand' (or idle) units:
 * 1. Frontier Villages, 2. Relic Ruins, 3. Ancient Watchtowers, 4. Outlaw Camps, 5. Fog frontier.
 */
export function assignExpandObjectives(
  state: GameState,
  houseId: HouseId,
): Record<string, CoordKey> {
  const fog = state.fog[houseId] ?? {};
  const personality = AI_PERSONALITIES[houseId];
  const myUnits = getHouseUnits(state, houseId).sort((a, b) => a.id.localeCompare(b.id));

  const objectives: Array<{ key: CoordKey; x: number; y: number; weight: number }> = [];

  for (const tile of Object.values(state.tiles)) {
    const status = fog[tile.key] ?? 'unexplored';
    if (status === 'unexplored' || tile.terrain === 'mountain') continue;

    if (tile.landmark === 'frontier_village' && tile.villageHp !== null && tile.villageHp > 0) {
      objectives.push({ key: tile.key, x: tile.x, y: tile.y, weight: 50 * personality.annexPriority });
    } else if (tile.landmark === 'relic_ruin' && !tile.landmarkCleared) {
      objectives.push({ key: tile.key, x: tile.x, y: tile.y, weight: 42 * personality.ruinPriority });
    } else if (tile.landmark === 'ancient_watchtower') {
      const unrevealed = !tile.revealedByHouseIds.includes(houseId);
      const unoccupied = !myUnits.some((u) => u.tileKey === tile.key);
      if (unrevealed || unoccupied) {
        objectives.push({
          key: tile.key,
          x: tile.x,
          y: tile.y,
          weight: (unrevealed ? 38 : 22) * personality.watchtowerPriority,
        });
      }
    } else if (tile.landmark === 'outlaw_camp' && tile.banditHp !== null && tile.banditHp > 0) {
      objectives.push({ key: tile.key, x: tile.x, y: tile.y, weight: 32 * personality.campPriority });
    } else {
      // Fog frontier tile: explored/visible passable tile adjacent to >= 1 unexplored tile
      const adjUnexplored = getNeighbors(tile.x, tile.y, state.gridSize).some(
        (n) => (fog[coordKey(n.x, n.y)] ?? 'unexplored') === 'unexplored',
      );
      if (adjUnexplored) {
        objectives.push({ key: tile.key, x: tile.x, y: tile.y, weight: 14 });
      }
    }
  }

  const assigned: Record<string, CoordKey> = {};
  const claimedKeys = new Set<CoordKey>();

  for (const u of myUnits) {
    let bestKey: CoordKey | null = null;
    let bestScore = -Infinity;

    for (const obj of objectives) {
      if (claimedKeys.has(obj.key)) continue;
      const dist = Math.max(1, chebyshevDist(u.x, u.y, obj.x, obj.y));
      const score = obj.weight / (dist + 1);
      if (
        score > bestScore ||
        (score === bestScore && bestKey !== null && obj.key.localeCompare(bestKey) < 0)
      ) {
        bestScore = score;
        bestKey = obj.key;
      }
    }

    if (bestKey !== null) {
      assigned[u.id] = bestKey;
      claimedKeys.add(bestKey);
    }
  }

  return assigned;
}
