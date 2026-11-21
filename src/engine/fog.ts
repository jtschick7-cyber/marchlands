/**
 * Marchlands (Spec v2.0) — Fog of War Engine
 *
 * Fog is strictly per-House ('unexplored' | 'explored' | 'visible') and honest
 * for both human and AI players. Uses spatial indexing for fast 34x34 updates.
 */

import type {
  CoordKey,
  FogStatus,
  GameState,
  HouseId,
  KeepState,
  OutpostState,
  UnitState,
} from '../types/game.ts';
import {
  BASE_KEEP_SIGHT,
  OUTPOST_SIGHT,
  PEAK_BEACON_SIGHT_RADIUS,
  SEASONS,
  SIGNAL_BASTION_SIGHT_RADIUS,
  UNITS,
  WATCHTOWER_SIGHT_RADIUS,
} from '../data/index.ts';
import { coordKey, getTilesInRadius } from './coords.ts';
import { getIndexedHouseTiles, getSpatialIndex } from './spatialIndex.ts';
import { getSeason, houseHasDecree, unitHasHonor } from './stateHelpers.ts';

export function getUnitSightRadius(state: GameState, unit: UnitState): number {
  const season = SEASONS[getSeason(state.turnNumber)];
  let sight = UNITS[unit.typeId].sight;
  if (unit.houseId === 'solis') sight += 1;
  if (unitHasHonor(unit, 'honor_high_watch') || unitHasHonor(unit, 'honor_outrider')) {
    sight += 1;
  }
  sight += season.unitSightDelta;
  return Math.max(1, sight);
}

export function getKeepSightRadius(keep: KeepState): number {
  let sight = keep.tier === 3 ? BASE_KEEP_SIGHT + 1 : BASE_KEEP_SIGHT;
  if (keep.ownerHouseId === 'solis') sight += 1;
  return sight;
}

export function getOutpostSightRadius(outpost: OutpostState): number {
  return OUTPOST_SIGHT + (outpost.ownerHouseId === 'solis' ? 1 : 0);
}

export function recomputeHouseFog(state: GameState, houseId: HouseId): GameState {
  const prevFog = state.fog[houseId];
  const house = state.houses[houseId];
  if (!prevFog || !house) return state;

  const nextFog: Record<CoordKey, FogStatus> = {};
  for (const [k, status] of Object.entries(prevFog)) {
    nextFog[k] = status === 'visible' ? 'explored' : status;
  }

  let newlyRevealed = 0;
  const markVisible = (k: CoordKey) => {
    if (nextFog[k] === 'unexplored') {
      newlyRevealed += 1;
    }
    nextFog[k] = 'visible';
  };

  const watchtowerBonus = houseHasDecree(house, 'decree_border_wardens') ? 1 : 0;

  // 1. Owned territory tiles & sight buildings
  for (const tile of getIndexedHouseTiles(state, houseId)) {
    markVisible(tile.key);
    if (tile.improvement === 'watchtower') {
      const r = WATCHTOWER_SIGHT_RADIUS + watchtowerBonus;
      for (const c of getTilesInRadius(tile.x, tile.y, r, state.gridSize)) {
        markVisible(coordKey(c.x, c.y));
      }
    } else if (tile.improvement === 'signal_bastion') {
      const r = SIGNAL_BASTION_SIGHT_RADIUS + watchtowerBonus;
      for (const c of getTilesInRadius(tile.x, tile.y, r, state.gridSize)) {
        markVisible(coordKey(c.x, c.y));
      }
    } else if (tile.improvement === 'peak_beacon') {
      for (const c of getTilesInRadius(tile.x, tile.y, PEAK_BEACON_SIGHT_RADIUS, state.gridSize)) {
        markVisible(coordKey(c.x, c.y));
      }
    }
  }

  const idx = getSpatialIndex(state);

  // 2. Friendly Keeps
  for (const keep of idx.keepsByOwner[houseId] ?? []) {
    const radius = getKeepSightRadius(keep);
    for (const c of getTilesInRadius(keep.x, keep.y, radius, state.gridSize)) {
      markVisible(coordKey(c.x, c.y));
    }
  }

  // 3. Friendly Frontier Outposts
  for (const outpost of idx.outpostsByOwner[houseId] ?? []) {
    const radius = getOutpostSightRadius(outpost);
    for (const c of getTilesInRadius(outpost.x, outpost.y, radius, state.gridSize)) {
      markVisible(coordKey(c.x, c.y));
    }
  }

  // 4. Friendly Units
  for (const unit of idx.unitsByOwner[houseId] ?? []) {
    const radius = getUnitSightRadius(state, unit);
    for (const c of getTilesInRadius(unit.x, unit.y, radius, state.gridSize)) {
      markVisible(coordKey(c.x, c.y));
    }
  }

  return {
    ...state,
    fog: {
      ...state.fog,
      [houseId]: nextFog,
    },
    houses: {
      ...state.houses,
      [houseId]:
        newlyRevealed > 0
          ? {
              ...house,
              stats: {
                ...house.stats,
                tilesRevealed: house.stats.tilesRevealed + newlyRevealed,
              },
            }
          : house,
    },
  };
}

export function permanentlyRevealRadius(
  state: GameState,
  houseId: HouseId,
  cx: number,
  cy: number,
  radius: number,
): GameState {
  const prevFog = state.fog[houseId];
  const house = state.houses[houseId];
  if (!prevFog || !house) return state;

  const nextFog: Record<CoordKey, FogStatus> = { ...prevFog };
  let newlyRevealed = 0;

  for (const c of getTilesInRadius(cx, cy, radius, state.gridSize)) {
    const k = coordKey(c.x, c.y);
    if (nextFog[k] === 'unexplored') {
      nextFog[k] = 'explored';
      newlyRevealed += 1;
    }
  }

  if (newlyRevealed === 0) return state;

  return {
    ...state,
    fog: {
      ...state.fog,
      [houseId]: nextFog,
    },
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        stats: {
          ...house.stats,
          tilesRevealed: house.stats.tilesRevealed + newlyRevealed,
        },
      },
    },
  };
}
