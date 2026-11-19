/**
 * Marchlands (Spec v0.3) — Fog of War Engine
 *
 * Fog is strictly per-House ('unexplored' | 'explored' | 'visible') and honest
 * for both human and AI players.
 */

import type { CoordKey, FogStatus, GameState, HouseId, KeepState, UnitState } from '../types/game.ts';
import {
  BASE_KEEP_SIGHT,
  SEASONS,
  SIGNAL_BASTION_SIGHT_RADIUS,
  UNITS,
  WATCHTOWER_SIGHT_RADIUS,
} from '../data/index.ts';
import { coordKey, getTilesInRadius } from './coords.ts';
import { getSeason, houseHasDecree } from './stateHelpers.ts';

export function getUnitSightRadius(state: GameState, unit: UnitState): number {
  const house = state.houses[unit.houseId];
  const season = SEASONS[getSeason(state.turnNumber)];
  let sight = UNITS[unit.typeId].sight;
  if (unit.houseId === 'solis') {
    sight += 1;
  }
  if (house && houseHasDecree(house, 'decree_highland_scouts')) {
    sight += 1;
  }
  sight += season.unitSightDelta;
  return sight;
}

export function getKeepSightRadius(keep: KeepState): number {
  let sight = BASE_KEEP_SIGHT;
  if (keep.ownerHouseId === 'solis') {
    sight += 1;
  }
  return sight;
}

/**
 * Recomputes active visibility for `houseId`, demoting previously visible tiles
 * to 'explored' and marking all tiles within friendly sight sources as 'visible'.
 * Increments `house.stats.tilesRevealed` for every tile leaving 'unexplored'.
 */
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

  // 1. Owned territory tiles are always visible
  for (const tile of Object.values(state.tiles)) {
    if (tile.ownerHouseId === houseId) {
      markVisible(tile.key);
      if (tile.improvement === 'watchtower') {
        for (const c of getTilesInRadius(tile.x, tile.y, WATCHTOWER_SIGHT_RADIUS, state.gridSize)) {
          markVisible(coordKey(c.x, c.y));
        }
      } else if (tile.improvement === 'signal_bastion') {
        for (const c of getTilesInRadius(
          tile.x,
          tile.y,
          SIGNAL_BASTION_SIGHT_RADIUS,
          state.gridSize,
        )) {
          markVisible(coordKey(c.x, c.y));
        }
      }
    }
  }

  // 2. Friendly Keeps
  for (const keep of Object.values(state.keeps)) {
    if (keep.ownerHouseId !== houseId) continue;
    const radius = getKeepSightRadius(keep);
    for (const c of getTilesInRadius(keep.x, keep.y, radius, state.gridSize)) {
      markVisible(coordKey(c.x, c.y));
    }
  }

  // 3. Friendly Units
  for (const unit of Object.values(state.units)) {
    if (unit.houseId !== houseId) continue;
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

/**
 * Permanently reveals (at least 'explored', preserving 'visible') all tiles
 * within `radius` (Chebyshev) of (cx, cy) for `houseId`.
 */
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
