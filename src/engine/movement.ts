/**
 * Marchlands (Spec v0.3) — Movement, Terrain Costs, Zone of Control & Landmark Discovery
 */

import type { CoordKey, GameState, KeepState, TileState, UnitState } from '../types/game.ts';
import {
  ANCIENT_WATCHTOWER_REVEAL_RADIUS,
  RELIC_RUINS,
  SEASONS,
  TERRAINS,
  UNITS,
} from '../data/index.ts';
import { chebyshevDist, coordKey, getNeighbors } from './coords.ts';
import { permanentlyRevealRadius, recomputeHouseFog } from './fog.ts';
import {
  addLifetimeCoin,
  appendChronicle,
  getHouseKeeps,
  getKeepAt,
  getSeason,
  getUnitAt,
  houseHasDecree,
} from './stateHelpers.ts';

/**
 * Computes a unit's full starting Movement Points for the current turn.
 */
export function getUnitMaxMovement(state: GameState, unit: UnitState): number {
  const def = UNITS[unit.typeId];
  const house = state.houses[unit.houseId];
  const season = SEASONS[getSeason(state.turnNumber)];

  let mov = def.movement;

  // Forced March: +1 Movement for infantry and spearman
  if (
    house &&
    houseHasDecree(house, 'decree_forced_march') &&
    (def.unitClass === 'infantry' || def.unitClass === 'spearman')
  ) {
    mov += 1;
  }

  // Gilded Lancer: +1 Movement when starting turn near a river (on or adjacent to river)
  if (unit.typeId === 'gilded_lancer') {
    const startTile = state.tiles[unit.tileKey];
    const nearRiver =
      startTile?.terrain === 'river' ||
      getNeighbors(unit.x, unit.y, state.gridSize).some(
        (n) => state.tiles[coordKey(n.x, n.y)]?.terrain === 'river',
      );
    if (nearRiver) {
      mov += 1;
    }
  }

  // Winter: -1 Movement (minimum 1)
  mov += season.unitMovementDelta;

  return Math.max(1, mov);
}

/**
 * Returns the Movement Point cost for `unit` to enter `destTile`, or `null` if impassable by terrain.
 */
export function getTileMoveCost(
  state: GameState,
  unit: UnitState,
  destTile: TileState,
): number | null {
  const def = UNITS[unit.typeId];
  const terrainDef = TERRAINS[destTile.terrain];

  if (terrainDef.moveCost === null) {
    return null; // Mountain
  }

  if (destTile.terrain === 'forest') {
    if (unit.typeId === 'dusk_outrider') {
      return 1; // Dusk Outrider ignores forest penalties
    }
    if (def.unitClass === 'cavalry') {
      return null; // Standard cavalry cannot enter Forest
    }
    return terrainDef.moveCost;
  }

  if (destTile.terrain === 'river') {
    if (destTile.improvement === 'river_tollhouse' && destTile.ownerHouseId === unit.houseId) {
      return 1; // Aurelia bridge for friendly units
    }
    return SEASONS[getSeason(state.turnNumber)].riverMoveCost;
  }

  return terrainDef.moveCost;
}

/**
 * Returns true if `unit` can legally enter `destTile` (ignoring movement budget).
 */
export function isTilePassableForUnit(
  state: GameState,
  unit: UnitState,
  destTile: TileState,
): boolean {
  if (getTileMoveCost(state, unit, destTile) === null) return false;

  // Cannot enter tile occupied by any unit
  const occ = getUnitAt(state, destTile.key);
  if (occ !== null) return false;

  // Cannot enter enemy Keep while keepHp > 0
  const keep = getKeepAt(state, destTile.key);
  if (keep !== null && keep.ownerHouseId !== unit.houseId && keep.keepHp > 0) {
    return false;
  }

  // Cannot enter unclaimed Frontier Village while villageHp > 0
  if (
    destTile.landmark === 'frontier_village' &&
    destTile.villageHp !== null &&
    destTile.villageHp > 0
  ) {
    return false;
  }

  // Cannot enter active Outlaw Camp while banditHp > 0
  if (
    destTile.landmark === 'outlaw_camp' &&
    destTile.banditHp !== null &&
    destTile.banditHp > 0
  ) {
    return false;
  }

  // Cannot enter intact enemy Palisade
  if (destTile.improvement === 'palisade' && destTile.ownerHouseId !== unit.houseId) {
    return false;
  }

  return true;
}

/**
 * Ruling 6.2: Returns true if (x, y) is adjacent to any enemy unit or enemy Keep.
 * Dusk Outrider ignores ZoC.
 */
export function isInEnemyZoC(
  state: GameState,
  unit: UnitState,
  x: number,
  y: number,
): boolean {
  if (unit.typeId === 'dusk_outrider') return false;

  for (const n of getNeighbors(x, y, state.gridSize)) {
    const nk = coordKey(n.x, n.y);
    const other = getUnitAt(state, nk);
    if (other !== null && other.houseId !== unit.houseId) {
      return true;
    }
    const keep = getKeepAt(state, nk);
    if (keep !== null && keep.ownerHouseId !== unit.houseId) {
      return true;
    }
  }
  return false;
}

/**
 * Computes all reachable destination tiles for `unitId` this turn via Dijkstra,
 * enforcing terrain costs, ZoC stopping, minimum-move rule, and action order
 * (no move after attack except Dusk Outrider disengage).
 *
 * Returns a map of `destTileKey -> remainingMovementAfterMove`.
 */
export function getReachableTiles(
  state: GameState,
  unitId: string,
): Record<CoordKey, number> {
  const unit = state.units[unitId];
  if (!unit) return {};
  if (unit.remainingMovement <= 0) return {};
  if (unit.hasAttacked && unit.typeId !== 'dusk_outrider') return {};

  const bestRemaining: Record<CoordKey, number> = {};
  const queue: Array<{ x: number; y: number; rem: number; steps: number }> = [
    { x: unit.x, y: unit.y, rem: unit.remainingMovement, steps: 0 },
  ];

  // Track best remaining at start so we don't revisit start
  const visitedBest: Record<CoordKey, number> = {
    [unit.tileKey]: unit.remainingMovement,
  };

  while (queue.length > 0) {
    // Pop node with highest remaining movement (Dijkstra)
    let bestIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i]!.rem > queue[bestIdx]!.rem) {
        bestIdx = i;
      }
    }
    const curr = queue.splice(bestIdx, 1)[0]!;
    const currKey = coordKey(curr.x, curr.y);
    if (curr.rem < (visitedBest[currKey] ?? -1)) continue;

    // If we entered ZoC on a non-start step, movement stops here
    if (curr.steps > 0 && isInEnemyZoC(state, unit, curr.x, curr.y)) {
      continue;
    }

    for (const n of getNeighbors(curr.x, curr.y, state.gridSize)) {
      const nk = coordKey(n.x, n.y);
      const destTile = state.tiles[nk]!;
      if (!isTilePassableForUnit(state, unit, destTile)) continue;

      const cost = getTileMoveCost(state, unit, destTile);
      if (cost === null) continue;

      let nextRem: number;
      if (cost <= curr.rem) {
        nextRem = curr.rem - cost;
      } else if (curr.steps === 0 && !unit.hasMoved) {
        // Minimum-Move Rule: unmoved unit can always enter 1 adjacent passable tile
        nextRem = 0;
      } else {
        continue;
      }

      // Entering ZoC consumes all remaining movement
      if (isInEnemyZoC(state, unit, n.x, n.y)) {
        nextRem = 0;
      }

      if (bestRemaining[nk] === undefined || nextRem > bestRemaining[nk]!) {
        bestRemaining[nk] = nextRem;
      }

      if (nextRem > (visitedBest[nk] ?? -1)) {
        visitedBest[nk] = nextRem;
        if (nextRem > 0) {
          queue.push({ x: n.x, y: n.y, rem: nextRem, steps: curr.steps + 1 });
        }
      }
    }
  }

  return bestRemaining;
}

/**
 * Finds the nearest friendly Keep (Chebyshev) to (x, y), tie-breaking by keep.id.
 */
function findNearestFriendlyKeep(
  state: GameState,
  houseId: UnitState['houseId'],
  x: number,
  y: number,
): KeepState | null {
  const keeps = getHouseKeeps(state, houseId);
  if (keeps.length === 0) return null;
  keeps.sort((a, b) => {
    const da = chebyshevDist(a.x, a.y, x, y);
    const db = chebyshevDist(b.x, b.y, x, y);
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
  return keeps[0]!;
}

/**
 * Applies Relic Ruin discovery reward when `unit` steps onto an unexplored Relic Ruin.
 */
function resolveRelicRuin(state: GameState, unitId: string, tileKey: CoordKey): GameState {
  const tile = state.tiles[tileKey];
  const unit = state.units[unitId];
  if (!tile || !unit || tile.landmark !== 'relic_ruin' || tile.landmarkCleared || !tile.relicRuinId) {
    return state;
  }

  const ruinId = tile.relicRuinId;
  const ruinDef = RELIC_RUINS[ruinId];
  const houseId = unit.houseId;
  let house = state.houses[houseId]!;

  let nextTile: TileState = {
    ...tile,
    landmarkCleared: true,
  };
  let nextUnit: UnitState = { ...unit };
  let nextKeeps = state.keeps;

  const grantNearestKeepFood = (amount: number) => {
    const keep = findNearestFriendlyKeep(state, houseId, tile.x, tile.y);
    if (keep) {
      nextKeeps = {
        ...nextKeeps,
        [keep.id]: {
          ...keep,
          foodProgress: keep.foodProgress + amount,
        },
      };
    }
  };

  let extraRevealRadius = 0;

  switch (ruinId) {
    case 'ruin_sunken_armory':
      house = {
        ...house,
        resources: { ...house.resources, materials: house.resources.materials + 14 },
      };
      break;
    case 'ruin_tax_vault':
      house = addLifetimeCoin(house, 18);
      break;
    case 'ruin_monastic_cellar':
      grantNearestKeepFood(14);
      break;
    case 'ruin_charter_archive':
      house = { ...house, pendingDraftCount: house.pendingDraftCount + 1 };
      break;
    case 'ruin_surveyors_cairn':
      extraRevealRadius = 4; // 9x9
      break;
    case 'ruin_mercenary_cache':
      house = addLifetimeCoin(house, 10);
      house = {
        ...house,
        resources: { ...house.resources, materials: house.resources.materials + 8 },
      };
      break;
    case 'ruin_apothecary_shrine':
      nextUnit = { ...nextUnit, hp: nextUnit.maxHp };
      grantNearestKeepFood(5);
      break;
    case 'ruin_iron_foundry':
      house = {
        ...house,
        resources: { ...house.resources, materials: house.resources.materials + 16 },
      };
      nextTile = { ...nextTile, hasIronDeposit: true };
      break;
    case 'ruin_wayfarer_tomb':
      house = addLifetimeCoin(house, 12);
      nextUnit = {
        ...nextUnit,
        hasMoved: false,
        remainingMovement: getUnitMaxMovement(state, nextUnit),
      };
      break;
    case 'ruin_seed_vault':
      grantNearestKeepFood(10);
      house = addLifetimeCoin(house, 6);
      break;
    case 'ruin_beacon_rotunda':
      extraRevealRadius = 3; // 7x7
      house = addLifetimeCoin(house, 8);
      break;
    case 'ruin_war_council_hall':
      house = addLifetimeCoin(house, 5);
      house = { ...house, pendingDraftCount: house.pendingDraftCount + 1 };
      break;
  }

  house = {
    ...house,
    stats: {
      ...house.stats,
      ruinsExplored: house.stats.ruinsExplored + 1,
    },
    writProgress: {
      ...house.writProgress,
      writ_relics: (house.writProgress.writ_relics ?? 0) + 1,
    },
  };

  let nextState: GameState = {
    ...state,
    tiles: { ...state.tiles, [tileKey]: nextTile },
    units: { ...state.units, [unitId]: nextUnit },
    keeps: nextKeeps,
    houses: { ...state.houses, [houseId]: house },
  };

  if (extraRevealRadius > 0) {
    nextState = permanentlyRevealRadius(nextState, houseId, tile.x, tile.y, extraRevealRadius);
  }

  nextState = appendChronicle(nextState, {
    type: 'ruin_explored',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey,
    summary: `House ${houseId} explored ${ruinDef.title} (${ruinDef.rewardSummary}).`,
    isPublic: false,
  });

  return nextState;
}

/**
 * Executes a legal move for `unitId` to `destKey`, updating fog and triggering
 * Ancient Watchtower / Relic Ruin discovery effects.
 */
export function moveUnit(state: GameState, unitId: string, destKey: CoordKey): GameState {
  const unit = state.units[unitId];
  if (!unit) return state;

  const reachable = getReachableTiles(state, unitId);
  const remAfter = reachable[destKey];
  if (remAfter === undefined) return state;

  const destTile = state.tiles[destKey]!;
  const movedUnit: UnitState = {
    ...unit,
    tileKey: destKey,
    x: destTile.x,
    y: destTile.y,
    remainingMovement: remAfter,
    hasMoved: true,
    isFortified: false,
  };

  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unitId]: movedUnit,
    },
  };

  // Recompute active fog
  nextState = recomputeHouseFog(nextState, unit.houseId);

  // Ruling 6.6: Ancient Watchtower per-House 7x7 reveal + first-overall +10 Landmark score
  const currentDest = nextState.tiles[destKey]!;
  if (
    currentDest.landmark === 'ancient_watchtower' &&
    !currentDest.revealedByHouseIds.includes(unit.houseId)
  ) {
    const isFirstOverall = currentDest.firstVisitedByHouseId === null;
    const updatedTile: TileState = {
      ...currentDest,
      revealedByHouseIds: [...currentDest.revealedByHouseIds, unit.houseId],
      firstVisitedByHouseId: isFirstOverall ? unit.houseId : currentDest.firstVisitedByHouseId,
    };
    const house = nextState.houses[unit.houseId]!;
    const updatedHouse = isFirstOverall
      ? {
          ...house,
          stats: {
            ...house.stats,
            watchtowersReached: house.stats.watchtowersReached + 1,
          },
        }
      : house;

    nextState = {
      ...nextState,
      tiles: { ...nextState.tiles, [destKey]: updatedTile },
      houses: { ...nextState.houses, [unit.houseId]: updatedHouse },
    };
    nextState = permanentlyRevealRadius(
      nextState,
      unit.houseId,
      destTile.x,
      destTile.y,
      ANCIENT_WATCHTOWER_REVEAL_RADIUS,
    );
    nextState = appendChronicle(nextState, {
      type: 'watchtower_reached',
      actorHouseId: unit.houseId,
      targetHouseId: null,
      tileKey: destKey,
      summary: `House ${unit.houseId} reached an Ancient Watchtower.`,
      isPublic: false,
    });
  }

  // Relic Ruin discovery
  if (currentDest.landmark === 'relic_ruin' && !currentDest.landmarkCleared) {
    nextState = resolveRelicRuin(nextState, unitId, destKey);
  }

  return nextState;
}
