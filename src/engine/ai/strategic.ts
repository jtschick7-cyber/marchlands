/**
 * Marchlands (Spec v2.0) — Strategic AI Layer (34x34 Scale, High Seat, Iron & Mandate)
 */

import type { AiPlan, AiPosture, CoordKey, GameState, HouseId, KeepState } from '../../types/game.ts';
import {
  AI_DIFFICULTY_CONFIG,
  AI_MUSTER_MIN_UNITS,
  AI_MUSTER_TIMEOUT_TURNS,
  AI_PERSONALITIES,
  AI_POSTURE_HYSTERESIS_TURNS,
  OUTPOST_MIN_KEEP_DIST,
  UNITS,
} from '../../data/index.ts';
import { chebyshevDist, coordKey, getNeighbors } from '../coords.ts';
import {
  getHouseKeeps,
  getHouseOutpostCap,
  getHouseOutposts,
  getHouseUnits,
  getMapPresetConfig,
} from '../stateHelpers.ts';
import { getMaxThreatOnTile, type InfluenceMaps } from './influence.ts';

function pickTargetKeep(
  state: GameState,
  houseId: HouseId,
  influence: InfluenceMaps,
): { keep: KeepState; score: number } | null {
  const fog = state.fog[houseId] ?? {};
  const myKeeps = getHouseKeeps(state, houseId);
  if (myKeeps.length === 0) return null;

  const allEnemyKeeps = Object.values(state.keeps).filter(
    (k) => k.ownerHouseId !== houseId && (fog[k.tileKey] ?? 'unexplored') !== 'unexplored',
  );
  if (allEnemyKeeps.length === 0) return null;

  // When a rival claims the Regent's Mandate, unite strictly against the Claimant's visible Keeps!
  const rivalClaimantId =
    state.crown.claimantHouseId !== null && state.crown.claimantHouseId !== houseId
      ? state.crown.claimantHouseId
      : null;
  const claimantKeeps = rivalClaimantId
    ? allEnemyKeeps.filter((k) => k.ownerHouseId === rivalClaimantId)
    : [];
  const enemyKeeps = claimantKeeps.length > 0 ? claimantKeeps : allEnemyKeeps;

  const scaleFactor = state.gridSize / 22;
  let best: { keep: KeepState; score: number } | null = null;
  for (const ek of enemyKeeps) {
    const rawMinDist = Math.max(
      1,
      Math.min(...myKeeps.map((mk) => chebyshevDist(mk.x, mk.y, ek.x, ek.y))),
    );
    const scaledDist = Math.max(1, rawMinDist / scaleFactor);
    const dmgBonus = (1 - ek.keepHp / Math.max(1, ek.maxKeepHp)) * 95;
    const unoccupiedBonus = influence.visibleEnemyUnits.some(
      (eu) => eu.x === ek.x && eu.y === ek.y,
    )
      ? 0
      : 24;
    const ownerKeepCount = Object.values(state.keeps).filter(
      (k) => k.ownerHouseId === ek.ownerHouseId,
    ).length;
    const finishOffWeakHouseBonus =
      rivalClaimantId === null && ownerKeepCount <= (state.turnNumber >= 100 ? 3 : 2)
        ? state.turnNumber >= 100
          ? 110
          : 55
        : 0;
    const keepVal =
      (ek.tier === 3 ? 65 : ek.tier === 2 ? 48 : 34) +
      (ek.specialization !== 'none' ? 12 : 0) +
      (ek.isHighSeat ? 20 : 0) +
      dmgBonus +
      unoccupiedBonus +
      finishOffWeakHouseBonus +
      (rivalClaimantId === ek.ownerHouseId ? 240 : 0);

    let localThreat = 6 + (ek.keepHp / ek.maxKeepHp) * 10;
    let nearbyDefenders = 0;
    for (const eu of influence.visibleEnemyUnits) {
      if (chebyshevDist(eu.x, eu.y, ek.x, ek.y) <= 2) {
        localThreat += 5;
        nearbyDefenders += 1;
      }
    }
    const undefendedBonus = nearbyDefenders === 0 ? 35 : 0;

    const score = ((keepVal + undefendedBonus) * 6) / (scaledDist * Math.sqrt(scaledDist) * Math.sqrt(localThreat));
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

  // Only scan tiles within Chebyshev distance 5 of targetKeep (O(121) instead of O(1156))
  const minX = Math.max(0, targetKeep.x - 5);
  const maxX = Math.min(state.gridSize - 1, targetKeep.x + 5);
  const minY = Math.max(0, targetKeep.y - 5);
  const maxY = Math.min(state.gridSize - 1, targetKeep.y + 5);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const k = coordKey(x, y);
      const tile = state.tiles[k]!;
      if ((fog[k] ?? 'unexplored') === 'unexplored') continue;
      if (tile.terrain === 'mountain' || tile.terrain === 'river') continue;
      if (tile.ownerHouseId !== null && tile.ownerHouseId !== houseId) continue;

      const dTarget = chebyshevDist(x, y, targetKeep.x, targetKeep.y);
      if (dTarget < 3 || dTarget > 5) continue;

      const threat = getMaxThreatOnTile(influence.threatMap[k]);
      const dHome = nearestMyKeep ? chebyshevDist(x, y, nearestMyKeep.x, nearestMyKeep.y) : 0;
      const score = threat * 4 + dHome * 0.5;

      if (
        score < bestScore ||
        (score === bestScore && bestKey !== null && k.localeCompare(bestKey) < 0)
      ) {
        bestScore = score;
        bestKey = k;
      }
    }
  }

  return bestKey;
}

export function updateStrategicPlan(
  state: GameState,
  houseId: HouseId,
  influence: InfluenceMaps,
): GameState {
  const house = state.houses[houseId];
  if (!house || house.isEliminated) return state;

  const personality = AI_PERSONALITIES[houseId];
  const cfg = getMapPresetConfig(state);
  const prevPlan = house.aiPlan;
  const myKeeps = getHouseKeeps(state, houseId);
  const myUnits = getHouseUnits(state, houseId);

  const keepUnderAttack = myKeeps.some((k) => {
    const urgentHp = k.isCapital ? k.maxKeepHp * 0.72 : k.maxKeepHp * 0.55;
    if (k.damagedLastRound && k.keepHp < urgentHp) return true;
    const nearEnemies = influence.visibleEnemyUnits.filter(
      (eu) => chebyshevDist(eu.x, eu.y, k.x, k.y) <= 2,
    ).length;
    if (nearEnemies < 3) return false;
    const nearFriendlies = myUnits.filter(
      (u) => chebyshevDist(u.x, u.y, k.x, k.y) <= 3,
    ).length;
    return nearEnemies > nearFriendlies;
  });

  const capitalCritical = myKeeps.some(
    (k) => k.isCapital && k.damagedLastRound && k.keepHp < k.maxKeepHp * 0.65,
  );

  // Measure real invading enemy force inside/near our Keeps (avoids 200-tile threat sum inflation!)
  let invaderStrength = 0;
  for (const eu of influence.visibleEnemyUnits) {
    const nearMyKeep = myKeeps.some((k) => chebyshevDist(eu.x, eu.y, k.x, k.y) <= 3);
    if (nearMyKeep) {
      invaderStrength += UNITS[eu.typeId].attack * 2.5;
    }
  }
  const friendlyStrength = myUnits.reduce((s, u) => s + UNITS[u.typeId].attack * 2, 0);

  const targetCandidate = pickTargetKeep(state, houseId, influence);
  const rivalIsClaimant =
    state.crown.claimantHouseId !== null && state.crown.claimantHouseId !== houseId;

  const ongoingDamagedSiege =
    prevPlan?.posture === 'attack' &&
    prevPlan.targetKeepId !== null &&
    state.keeps[prevPlan.targetKeepId] !== undefined &&
    state.keeps[prevPlan.targetKeepId]!.ownerHouseId !== houseId &&
    state.keeps[prevPlan.targetKeepId]!.keepHp < state.keeps[prevPlan.targetKeepId]!.maxKeepHp * 0.85;

  const lateGamePush = state.turnNumber >= 100 && myUnits.length >= 10;

  let posture: AiPosture;
  if (capitalCritical || (keepUnderAttack && !rivalIsClaimant && !lateGamePush)) {
    posture = 'defend';
  } else if (prevPlan && state.turnNumber < prevPlan.postureLockedUntilTurn && !rivalIsClaimant) {
    posture = prevPlan.posture;
  } else {
    const defendScore =
      !rivalIsClaimant &&
      !lateGamePush &&
      invaderStrength * personality.defendSensitivity > friendlyStrength * 0.8 &&
      invaderStrength > 28
        ? 82
        : 0;

    const claimScore =
      state.mode === 'dominion' &&
      !rivalIsClaimant &&
      house.favor >= Math.floor(cfg.mandateMinFavor * 0.85) &&
      myKeeps.length >= Math.max(4, cfg.mandateMinKeeps - 1)
        ? 68 * personality.mandatePriority
        : 0;

    const minAttackUnits = state.gridSize >= 34 ? 5 : 3;
    const attackThreshold = rivalIsClaimant ? 2 : 7 / personality.attackAggression;
    const armyReadyBonus =
      myUnits.length >= Math.max(7, myKeeps.length * 2)
        ? myUnits.length >= 14 || myKeeps.length >= 5
          ? 34
          : 22
        : 0;
    const canAttack =
      targetCandidate !== null &&
      myUnits.length >= minAttackUnits &&
      (targetCandidate.score >= attackThreshold ||
        armyReadyBonus > 0 ||
        ongoingDamagedSiege ||
        lateGamePush ||
        (rivalIsClaimant && targetCandidate.keep.ownerHouseId === state.crown.claimantHouseId));
    const attackScore = canAttack
      ? 66 * personality.attackAggression +
        armyReadyBonus +
        (ongoingDamagedSiege ? 32 : 0) +
        (lateGamePush ? 35 : 0) +
        (rivalIsClaimant ? 90 : 0)
      : 0;

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
      [houseId]: { ...house, aiPlan: nextPlan },
    },
  };
}

export function isMusterReady(state: GameState, houseId: HouseId): boolean {
  const diffCfg = AI_DIFFICULTY_CONFIG[state.difficulty];
  if (!diffCfg.useMusterRule) return true;

  // Never stall to muster when rushing to break a rival's Regent's Mandate claim!
  if (state.crown.claimantHouseId !== null && state.crown.claimantHouseId !== houseId) {
    return true;
  }

  const plan = state.houses[houseId]?.aiPlan;
  if (!plan || plan.posture !== 'attack' || !plan.rallyTileKey) return true;

  const rallyTile = state.tiles[plan.rallyTileKey];
  if (!rallyTile) return true;

  const myUnits = getHouseUnits(state, houseId);
  const needed = Math.min(AI_MUSTER_MIN_UNITS + 1, myUnits.length);

  const nearRally = myUnits.filter(
    (u) => chebyshevDist(u.x, u.y, rallyTile.x, rallyTile.y) <= 2,
  ).length;
  if (nearRally >= needed) return true;

  if (
    plan.rallyStartedTurn !== null &&
    state.turnNumber - plan.rallyStartedTurn >= AI_MUSTER_TIMEOUT_TURNS
  ) {
    return true;
  }

  return myUnits.some(
    (u) => u.damagedSinceLastTurn && chebyshevDist(u.x, u.y, rallyTile.x, rallyTile.y) <= 3,
  );
}

/**
 * Fog-honest deduplicated per-unit destination assignment for 'expand' (or idle) units:
 * Frontier Villages, Ruined High Seat, Relic Ruins, Watchtowers, Outlaw Camps,
 * unowned Iron Ridges (for Outposts), and fog frontiers.
 */
export function assignExpandObjectives(
  state: GameState,
  houseId: HouseId,
): Record<string, CoordKey> {
  const fog = state.fog[houseId] ?? {};
  const house = state.houses[houseId]!;
  const personality = AI_PERSONALITIES[houseId];
  const myUnits = getHouseUnits(state, houseId).sort((a, b) => a.id.localeCompare(b.id));
  const wantsOutpost =
    getHouseOutposts(state, houseId).length < getHouseOutpostCap(house) &&
    house.resources.materials >= 10 &&
    house.resources.coin >= 10;

  const objectives: Array<{ key: CoordKey; x: number; y: number; weight: number }> = [];
  const allKeeps = Object.values(state.keeps);
  const fogFrontierCandidates: Array<{ key: CoordKey; x: number; y: number; weight: number }> = [];

  for (const tile of Object.values(state.tiles)) {
    const status = fog[tile.key] ?? 'unexplored';
    if (status === 'unexplored' || tile.terrain === 'mountain') continue;

    if (tile.landmark === 'frontier_village' && tile.villageHp !== null && tile.villageHp > 0) {
      objectives.push({ key: tile.key, x: tile.x, y: tile.y, weight: 56 * personality.annexPriority });
    } else if (
      tile.landmark === 'high_seat' &&
      tile.highSeatHp !== null &&
      tile.highSeatHp > 0 &&
      myUnits.length >= 4
    ) {
      objectives.push({ key: tile.key, x: tile.x, y: tile.y, weight: 46 });
    } else if (tile.landmark === 'relic_ruin' && !tile.landmarkCleared) {
      objectives.push({ key: tile.key, x: tile.x, y: tile.y, weight: 44 * personality.ruinPriority });
    } else if (tile.landmark === 'ancient_watchtower') {
      const unrevealed = !tile.revealedByHouseIds.includes(houseId);
      const unoccupied = !myUnits.some((u) => u.tileKey === tile.key);
      if (unrevealed || unoccupied) {
        objectives.push({
          key: tile.key,
          x: tile.x,
          y: tile.y,
          weight: (unrevealed ? 40 : 20) * personality.watchtowerPriority,
        });
      }
    } else if (tile.landmark === 'outlaw_camp' && tile.banditHp !== null && tile.banditHp > 0) {
      objectives.push({ key: tile.key, x: tile.x, y: tile.y, weight: 36 * personality.campPriority });
    } else if (
      wantsOutpost &&
      tile.hasIronDeposit &&
      tile.ownerHouseId === null &&
      allKeeps.every((k) => chebyshevDist(k.x, k.y, tile.x, tile.y) >= OUTPOST_MIN_KEEP_DIST)
    ) {
      objectives.push({ key: tile.key, x: tile.x, y: tile.y, weight: 38 * personality.outpostPriority });
    } else if (fogFrontierCandidates.length < 36) {
      const adjUnexplored = getNeighbors(tile.x, tile.y, state.gridSize).some(
        (n) => (fog[coordKey(n.x, n.y)] ?? 'unexplored') === 'unexplored',
      );
      if (adjUnexplored) {
        fogFrontierCandidates.push({ key: tile.key, x: tile.x, y: tile.y, weight: 14 });
      }
    }
  }

  for (const fc of fogFrontierCandidates) objectives.push(fc);

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
