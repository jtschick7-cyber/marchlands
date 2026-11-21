/**
 * Marchlands (Spec v2.0) — Movement, Roads, Wall Linking, ZoC,
 * Overwatch Triggering, Charge Tracking & Landmark Discovery
 */

import type { CoordKey, GameState, KeepState, TileState, UnitState } from '../types/game.ts';
import {
  ANCIENT_WATCHTOWER_REVEAL_RADIUS,
  HOUSES,
  RELIC_RUINS,
  SEASONS,
  TERRAINS,
  UNITS,
} from '../data/index.ts';
import { chebyshevDist, coordKey, getNeighbors } from './coords.ts';
import { resolveOverwatchOnUnitMove } from './combat.ts';
import { permanentlyRevealRadius, recomputeHouseFog } from './fog.ts';
import { getIndexedKeepTiles } from './spatialIndex.ts';
import {
  addLifetimeCoin,
  appendChronicle,
  getHouseKeeps,
  getKeepAt,
  getOutpostAt,
  getSeason,
  getUnitAt,
  hasCommanderTrait,
  houseHasDecree,
  unitHasHonor,
} from './stateHelpers.ts';

/**
 * Computes a unit's full starting Movement Points for the current turn.
 */
export function getUnitMaxMovement(state: GameState, unit: UnitState): number {
  const def = UNITS[unit.typeId];
  const house = state.houses[unit.houseId];
  const season = SEASONS[getSeason(state.turnNumber)];
  const startTile = state.tiles[unit.tileKey];

  let mov = unit.isCommander ? HOUSES[unit.houseId].commanderMovement : def.movement;

  if (unit.isCommander && hasCommanderTrait(state, unit.houseId, 'trait_vanguard')) {
    mov += 1;
  }

  // Mobile Vanguard: +1 Mov for Infantry starting on Plains; +1 bonus if starting on Road
  if (houseHasDecree(house, 'decree_mobile_vanguard')) {
    if (def.unitClass === 'infantry' && startTile?.terrain === 'plains') {
      mov += 1;
    }
    if (startTile?.hasRoad) {
      mov += 1;
    }
  }

  // Royal Road Network: +1 Mov when starting turn on a Road
  if (houseHasDecree(house, 'decree_royal_roads') && startTile?.hasRoad) {
    mov += 1;
  }

  // Corvus Lv2 War Camp (Reaver Stockade): +1 Mov for units starting in its Keep territory
  if (unit.houseId === 'corvus' && startTile?.keepId) {
    const hasLv2Camp = getIndexedKeepTiles(state, startTile.keepId).some(
      (t) => t.ownerHouseId === 'corvus' && t.improvement === 'war_camp' && t.improvementLevel === 2,
    );
    if (hasLv2Camp) mov += 1;
  }

  // Gilded Lancer: +1 Mov near a River
  if (unit.typeId === 'gilded_lancer') {
    const nearRiver =
      startTile?.terrain === 'river' ||
      getNeighbors(unit.x, unit.y, state.gridSize).some(
        (n) => state.tiles[coordKey(n.x, n.y)]?.terrain === 'river',
      );
    if (nearRiver) mov += 1;
  }

  // Battle Honors
  if (
    unitHasHonor(unit, 'honor_march_guard') ||
    unitHasHonor(unit, 'honor_skirmisher') ||
    unitHasHonor(unit, 'honor_field_engineer')
  ) {
    mov += 1;
  }

  // Winter: -1 Movement (min 1), ignored by Hardened Marchers
  if (season.unitMovementDelta < 0 && !houseHasDecree(house, 'decree_hardened_marchers')) {
    mov += season.unitMovementDelta;
  }

  return Math.max(1, mov);
}

/**
 * Returns the Movement Point cost for `unit` to enter `destTile`, or `null` if impassable.
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

  // Roads reduce cost to 1 across Plains, Hills, and Forests (enabling cavalry roads through forests)
  if (destTile.hasRoad && destTile.terrain !== 'river') {
    return 1;
  }

  if (destTile.terrain === 'forest') {
    if (unit.typeId === 'dusk_outrider') return 1;
    // House Vane Warden's Volley: allies within 2 tiles ignore Forest move penalty
    if (unit.houseId === 'vane' && unit.commanderBuffUntilTurn >= state.turnNumber) {
      return 1;
    }
    if (def.unitClass === 'cavalry') return null;
    return terrainDef.moveCost;
  }

  if (destTile.terrain === 'hills') {
    return unitHasHonor(unit, 'honor_outrider') ? 1 : terrainDef.moveCost;
  }

  if (destTile.terrain === 'river') {
    if (
      destTile.ownerHouseId === unit.houseId &&
      (destTile.improvement === 'river_tollhouse' || destTile.improvement === 'stone_bridge')
    ) {
      return 1;
    }
    return SEASONS[getSeason(state.turnNumber)].riverMoveCost;
  }

  return terrainDef.moveCost;
}

export function isTilePassableForUnit(
  state: GameState,
  unit: UnitState,
  destTile: TileState,
): boolean {
  if (getTileMoveCost(state, unit, destTile) === null) return false;

  const occ = getUnitAt(state, destTile.key);
  if (occ !== null) return false;

  const keep = getKeepAt(state, destTile.key);
  if (keep !== null && keep.ownerHouseId !== unit.houseId && keep.keepHp > 0) {
    return false;
  }

  const outpost = getOutpostAt(state, destTile.key);
  if (outpost !== null && outpost.ownerHouseId !== unit.houseId && outpost.hp > 0) {
    return false;
  }

  if (
    destTile.landmark === 'frontier_village' &&
    destTile.villageHp !== null &&
    destTile.villageHp > 0
  ) {
    return false;
  }

  if (
    destTile.landmark === 'high_seat' &&
    destTile.highSeatHp !== null &&
    destTile.highSeatHp > 0
  ) {
    return false;
  }

  if (
    destTile.landmark === 'outlaw_camp' &&
    destTile.banditHp !== null &&
    destTile.banditHp > 0
  ) {
    return false;
  }

  if (destTile.improvement === 'palisade' && destTile.ownerHouseId !== unit.houseId) {
    return false;
  }

  return true;
}

/**
 * Ruling 2.1: Orthogonal Wall Linking — diagonal step from (cx, cy) to (nx, ny) is blocked
 * if BOTH orthogonal shoulder tiles contain intact enemy Palisades/Stone Walls.
 */
export function isDiagonalWallBlocked(
  state: GameState,
  unit: UnitState,
  cx: number,
  cy: number,
  nx: number,
  ny: number,
): boolean {
  if (Math.abs(nx - cx) !== 1 || Math.abs(ny - cy) !== 1) return false;
  const s1 = state.tiles[coordKey(nx, cy)];
  const s2 = state.tiles[coordKey(cx, ny)];
  const isEnemyWall = (t: TileState | undefined): boolean =>
    t !== undefined &&
    t.improvement === 'palisade' &&
    t.ownerHouseId !== null &&
    t.ownerHouseId !== unit.houseId;
  return isEnemyWall(s1) && isEnemyWall(s2);
}

/**
 * Zone of Control: entering adjacent to an enemy unit, Keep, or Outpost stops movement.
 * Corvus Raider's Horn ignores ZoC; Dusk Outrider ignores ZoC unless adjacent to a Fortified Phalanx Spearman.
 */
export function isInEnemyZoC(
  state: GameState,
  unit: UnitState,
  x: number,
  y: number,
): boolean {
  if (unit.houseId === 'corvus' && unit.commanderBuffUntilTurn >= state.turnNumber) {
    return false;
  }
  const isOutrider = unit.typeId === 'dusk_outrider';

  for (const n of getNeighbors(x, y, state.gridSize)) {
    const nk = coordKey(n.x, n.y);
    const other = getUnitAt(state, nk);
    if (other !== null && other.houseId !== unit.houseId) {
      if (!isOutrider) return true;
      // Fortified Spearman Phalanx locks ZoC even against Dusk Outriders
      if (UNITS[other.typeId].unitClass === 'spearman' && other.isFortified) {
        return true;
      }
    }
    if (!isOutrider) {
      const keep = getKeepAt(state, nk);
      if (keep !== null && keep.ownerHouseId !== unit.houseId) return true;
      const outpost = getOutpostAt(state, nk);
      if (outpost !== null && outpost.ownerHouseId !== unit.houseId) return true;
    }
  }
  return false;
}

export interface ReachableTileMeta {
  readonly remainingMovement: number;
  readonly openTilesMoved: number;
}

export function getReachableTileDetails(
  state: GameState,
  unitId: string,
): Record<CoordKey, ReachableTileMeta> {
  const unit = state.units[unitId];
  if (!unit) return {};
  if (unit.remainingMovement <= 0) return {};
  if (unit.hasAttacked && unit.typeId !== 'dusk_outrider') return {};

  const best: Record<CoordKey, ReachableTileMeta> = {};
  const queue: Array<{ x: number; y: number; rem: number; steps: number; openSteps: number }> = [
    { x: unit.x, y: unit.y, rem: unit.remainingMovement, steps: 0, openSteps: 0 },
  ];
  const visitedBest: Record<CoordKey, number> = {
    [unit.tileKey]: unit.remainingMovement,
  };

  while (queue.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i]!.rem > queue[bestIdx]!.rem) bestIdx = i;
    }
    const curr = queue.splice(bestIdx, 1)[0]!;
    const currKey = coordKey(curr.x, curr.y);
    if (curr.rem < (visitedBest[currKey] ?? -1)) continue;

    if (curr.steps > 0 && isInEnemyZoC(state, unit, curr.x, curr.y)) {
      continue;
    }

    for (const n of getNeighbors(curr.x, curr.y, state.gridSize)) {
      if (isDiagonalWallBlocked(state, unit, curr.x, curr.y, n.x, n.y)) continue;
      const nk = coordKey(n.x, n.y);
      const destTile = state.tiles[nk]!;
      if (!isTilePassableForUnit(state, unit, destTile)) continue;

      const cost = getTileMoveCost(state, unit, destTile);
      if (cost === null) continue;

      let nextRem: number;
      if (cost <= curr.rem) {
        nextRem = curr.rem - cost;
      } else if (curr.steps === 0 && !unit.hasMoved) {
        nextRem = 0;
      } else {
        continue;
      }

      if (isInEnemyZoC(state, unit, n.x, n.y)) {
        nextRem = 0;
      }

      const isOpen = destTile.terrain === 'plains' || destTile.hasRoad;
      const nextOpenSteps = isOpen ? curr.openSteps + 1 : 0;

      const prev = best[nk];
      if (!prev || nextRem > prev.remainingMovement || (nextRem === prev.remainingMovement && nextOpenSteps > prev.openTilesMoved)) {
        best[nk] = { remainingMovement: nextRem, openTilesMoved: nextOpenSteps };
      }

      if (nextRem > (visitedBest[nk] ?? -1)) {
        visitedBest[nk] = nextRem;
        if (nextRem > 0) {
          queue.push({
            x: n.x,
            y: n.y,
            rem: nextRem,
            steps: curr.steps + 1,
            openSteps: nextOpenSteps,
          });
        }
      }
    }
  }

  return best;
}

export function getReachableTiles(
  state: GameState,
  unitId: string,
): Record<CoordKey, number> {
  const details = getReachableTileDetails(state, unitId);
  const out: Record<CoordKey, number> = {};
  for (const [k, meta] of Object.entries(details)) {
    out[k] = meta.remainingMovement;
  }
  return out;
}

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

  let nextTile: TileState = { ...tile, landmarkCleared: true };
  let nextUnit: UnitState = { ...unit };
  let nextKeeps = state.keeps;

  const grantNearestKeepFood = (amount: number) => {
    const keep = findNearestFriendlyKeep(state, houseId, tile.x, tile.y);
    if (keep) {
      nextKeeps = {
        ...nextKeeps,
        [keep.id]: { ...keep, foodProgress: keep.foodProgress + amount },
      };
    }
  };

  let extraRevealRadius = 0;

  switch (ruinId) {
    case 'ruin_sunken_armory':
      house = {
        ...house,
        resources: {
          ...house.resources,
          materials: house.resources.materials + 12,
          iron: house.resources.iron + 4,
        },
      };
      break;
    case 'ruin_tax_vault':
      house = addLifetimeCoin(house, 22);
      break;
    case 'ruin_monastic_cellar':
      grantNearestKeepFood(18);
      break;
    case 'ruin_charter_archive':
      house = { ...house, pendingDraftCount: house.pendingDraftCount + 1 };
      break;
    case 'ruin_surveyors_cairn':
      extraRevealRadius = 5; // 11x11
      break;
    case 'ruin_mercenary_cache':
      house = addLifetimeCoin(house, 12);
      house = {
        ...house,
        resources: {
          ...house.resources,
          materials: house.resources.materials + 8,
          iron: house.resources.iron + 2,
        },
      };
      break;
    case 'ruin_apothecary_shrine':
      nextUnit = { ...nextUnit, hp: nextUnit.maxHp };
      grantNearestKeepFood(8);
      break;
    case 'ruin_iron_foundry':
      house = {
        ...house,
        resources: {
          ...house.resources,
          materials: house.resources.materials + 8,
          iron: house.resources.iron + 5,
        },
      };
      nextTile = { ...nextTile, hasIronDeposit: true };
      break;
    case 'ruin_wayfarer_tomb':
      house = addLifetimeCoin(house, 14);
      nextUnit = {
        ...nextUnit,
        hasMoved: false,
        remainingMovement: getUnitMaxMovement(state, nextUnit),
      };
      break;
    case 'ruin_seed_vault':
      grantNearestKeepFood(14);
      house = addLifetimeCoin(house, 8);
      break;
    case 'ruin_beacon_rotunda':
      extraRevealRadius = 4; // 9x9
      house = addLifetimeCoin(house, 10);
      break;
    case 'ruin_war_council_hall':
      house = addLifetimeCoin(house, 6);
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

export function moveUnit(state: GameState, unitId: string, destKey: CoordKey): GameState {
  const unit = state.units[unitId];
  if (!unit) return state;

  const details = getReachableTileDetails(state, unitId);
  const meta = details[destKey];
  if (meta === undefined) return state;

  const destTile = state.tiles[destKey]!;
  const movedUnit: UnitState = {
    ...unit,
    tileKey: destKey,
    x: destTile.x,
    y: destTile.y,
    remainingMovement: meta.remainingMovement,
    hasMoved: true,
    isFortified: false,
    isOverwatch: false,
    isDeployed: false,
    movedOpenTilesThisTurn: unit.movedOpenTilesThisTurn + meta.openTilesMoved,
  };

  let nextState: GameState = {
    ...state,
    units: { ...state.units, [unitId]: movedUnit },
  };

  nextState = recomputeHouseFog(nextState, unit.houseId);

  // Trigger enemy Ranged Overwatch if moving into watched visible tile
  const owRes = resolveOverwatchOnUnitMove(nextState, unitId);
  nextState = owRes.state;
  if (owRes.unitDied) {
    return nextState;
  }

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
          stats: { ...house.stats, watchtowersReached: house.stats.watchtowersReached + 1 },
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

  if (currentDest.landmark === 'relic_ruin' && !currentDest.landmarkCleared) {
    nextState = resolveRelicRuin(nextState, unitId, destKey);
  }

  return nextState;
}
