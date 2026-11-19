/**
 * Marchlands (Spec v0.3) — Keep Capture, Sticky Borders, Orphan Re-homing & Manual Re-homing
 */

import type { CoordKey, GameState, HouseId, KeepState, TileState, UnitState } from '../types/game.ts';
import { IMPROVEMENTS, UNITS } from '../data/index.ts';
import { coordKey, getTilesInRadius } from './coords.ts';
import { recomputeHouseFog } from './fog.ts';
import {
  appendChronicle,
  getHouseKeeps,
  getKeepArmyCap,
  getKeepAt,
  getKeepRadius,
  getKeepSupportedUnitIds,
} from './stateHelpers.ts';

/**
 * Ruling 1.2 (First-Claim Lock): Claims surrounding tiles within the Keep's
 * radius ONLY where tile.keepId === null. Never steals tiles from another Keep.
 */
export function claimKeepTerritory(state: GameState, keepId: string): GameState {
  const keep = state.keeps[keepId];
  if (!keep) return state;

  const radius = getKeepRadius(keep);
  const nextTiles: Record<CoordKey, TileState> = { ...state.tiles };
  let changed = false;

  for (const c of getTilesInRadius(keep.x, keep.y, radius, state.gridSize)) {
    const k = coordKey(c.x, c.y);
    const tile = nextTiles[k]!;
    if (tile.keepId === null) {
      nextTiles[k] = {
        ...tile,
        keepId,
        ownerHouseId: keep.ownerHouseId,
      };
      changed = true;
    }
  }

  return changed ? { ...state, tiles: nextTiles } : state;
}

/**
 * Ruling 2.1: Automatically re-homes any 'orphaned' units belonging to `houseId`
 * into remaining friendly Keeps with open Army Cap slots (highest Material Cost first).
 */
export function autoRehomeOrphans(state: GameState, houseId: HouseId): GameState {
  const orphanedUnits = Object.values(state.units)
    .filter((u) => u.houseId === houseId && u.homeKeepId === 'orphaned')
    .sort((a, b) => {
      const costDiff = UNITS[b.typeId].matCost - UNITS[a.typeId].matCost;
      return costDiff !== 0 ? costDiff : a.id.localeCompare(b.id);
    });

  if (orphanedUnits.length === 0) return state;

  const friendlyKeeps = getHouseKeeps(state, houseId).sort((a, b) => a.id.localeCompare(b.id));
  if (friendlyKeeps.length === 0) return state;

  const openSlots: Record<string, number> = {};
  for (const k of friendlyKeeps) {
    const cap = getKeepArmyCap(state, k.id);
    const used = getKeepSupportedUnitIds(state, k.id).length;
    openSlots[k.id] = Math.max(0, cap - used);
  }

  const nextUnits: Record<string, UnitState> = { ...state.units };
  let changed = false;

  for (const unit of orphanedUnits) {
    if (!UNITS[unit.typeId].canRehome) {
      delete nextUnits[unit.id];
      changed = true;
      continue;
    }
    const targetKeep = friendlyKeeps.find((k) => (openSlots[k.id] ?? 0) > 0);
    if (targetKeep) {
      nextUnits[unit.id] = {
        ...unit,
        homeKeepId: targetKeep.id,
      };
      openSlots[targetKeep.id] = (openSlots[targetKeep.id] ?? 1) - 1;
      changed = true;
    }
  }

  return changed ? { ...state, units: nextUnits } : state;
}

/**
 * Ruling 1.1 & 2.1: Transfers a neutralized Keep to `newOwnerHouseId`, restores
 * keepHp to Math.floor(maxKeepHp / 2), preserves specialization, transfers owned
 * tiles & converts faction-unique buildings, and re-homes/orphans/eliminates
 * the previous owner.
 */
export function captureKeep(
  state: GameState,
  keepId: string,
  newOwnerHouseId: HouseId,
): GameState {
  const keep = state.keeps[keepId];
  if (!keep || keep.ownerHouseId === newOwnerHouseId) return state;

  const prevOwnerHouseId = keep.ownerHouseId;
  const restoredHp = Math.floor(keep.maxKeepHp / 2);

  const updatedKeep: KeepState = {
    ...keep,
    ownerHouseId: newOwnerHouseId,
    keepHp: restoredHp,
    damagedLastRound: true,
    foodProgress: 0,
  };

  // Transfer all tiles bound to this keepId and convert faction-unique improvements
  const nextTiles: Record<CoordKey, TileState> = { ...state.tiles };
  for (const [k, tile] of Object.entries(nextTiles)) {
    if (tile.keepId !== keepId) continue;
    let nextImprovement = tile.improvement;
    let nextFortHp = tile.fortificationHp;
    if (nextImprovement !== null) {
      const impDef = IMPROVEMENTS[nextImprovement];
      if (impDef.houseId !== null && impDef.houseId !== newOwnerHouseId) {
        nextImprovement = impDef.convertsToOnCapture;
        if (nextImprovement === null) {
          nextFortHp = null;
        }
      }
    }
    nextTiles[k] = {
      ...tile,
      ownerHouseId: newOwnerHouseId,
      improvement: nextImprovement,
      fortificationHp: nextFortHp,
    };
  }

  const nextKeeps: Record<string, KeepState> = {
    ...state.keeps,
    [keepId]: updatedKeep,
  };

  // Update attacker stats & writ progress
  const attackerHouse = state.houses[newOwnerHouseId]!;
  const updatedAttackerHouse = {
    ...attackerHouse,
    stats: {
      ...attackerHouse.stats,
      keepsCaptured: attackerHouse.stats.keepsCaptured + 1,
    },
    writProgress: {
      ...attackerHouse.writProgress,
      writ_capture: (attackerHouse.writProgress.writ_capture ?? 0) + 1,
    },
  };

  let nextState: GameState = {
    ...state,
    tiles: nextTiles,
    keeps: nextKeeps,
    houses: {
      ...state.houses,
      [newOwnerHouseId]: updatedAttackerHouse,
    },
  };

  nextState = appendChronicle(nextState, {
    type: 'keep_captured',
    actorHouseId: newOwnerHouseId,
    targetHouseId: prevOwnerHouseId,
    tileKey: keep.tileKey,
    summary: `${keep.name} captured from ${prevOwnerHouseId} by ${newOwnerHouseId}.`,
    isPublic: true,
  });

  // Handle previous owner's displaced units or House elimination
  const remainingPrevKeeps = getHouseKeeps(nextState, prevOwnerHouseId);
  if (remainingPrevKeeps.length === 0) {
    const prevHouse = nextState.houses[prevOwnerHouseId]!;
    const filteredUnits: Record<string, UnitState> = {};
    for (const [uid, u] of Object.entries(nextState.units)) {
      if (u.houseId !== prevOwnerHouseId) {
        filteredUnits[uid] = u;
      }
    }
    nextState = {
      ...nextState,
      units: filteredUnits,
      houses: {
        ...nextState.houses,
        [prevOwnerHouseId]: {
          ...prevHouse,
          isEliminated: true,
        },
      },
    };
    nextState = appendChronicle(nextState, {
      type: 'house_eliminated',
      actorHouseId: newOwnerHouseId,
      targetHouseId: prevOwnerHouseId,
      tileKey: keep.tileKey,
      summary: `House ${prevOwnerHouseId} has been eliminated.`,
      isPublic: true,
    });
  } else {
    // Mark displaced units as orphaned, disband non-rehomeable (free_company_spearman), then auto-rehome
    const nextUnits: Record<string, UnitState> = { ...nextState.units };
    for (const [uid, u] of Object.entries(nextUnits)) {
      if (u.houseId === prevOwnerHouseId && u.homeKeepId === keepId) {
        if (!UNITS[u.typeId].canRehome) {
          delete nextUnits[uid];
        } else {
          nextUnits[uid] = { ...u, homeKeepId: 'orphaned' };
        }
      }
    }
    nextState = { ...nextState, units: nextUnits };
    nextState = autoRehomeOrphans(nextState, prevOwnerHouseId);
  }

  // Captor might also have orphaned units that can now re-home into the newly captured Keep
  nextState = autoRehomeOrphans(nextState, newOwnerHouseId);

  // Recompute fog for both Houses
  nextState = recomputeHouseFog(nextState, newOwnerHouseId);
  if (!nextState.houses[prevOwnerHouseId]?.isEliminated) {
    nextState = recomputeHouseFog(nextState, prevOwnerHouseId);
  }

  return nextState;
}

/**
 * Ruling 2.3: Manual Keep Re-Homing.
 * Returns true if `unitId` can manually re-home onto the friendly Keep it is standing on.
 */
export function canRehomeUnitManually(state: GameState, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  if (!UNITS[unit.typeId].canRehome) return false;
  const keep = getKeepAt(state, unit.tileKey);
  if (!keep || keep.ownerHouseId !== unit.houseId) return false;
  if (unit.homeKeepId === keep.id) return false;
  const cap = getKeepArmyCap(state, keep.id);
  const used = getKeepSupportedUnitIds(state, keep.id).length;
  return used < cap;
}

/**
 * Ruling 2.3: Executes Manual Keep Re-Homing (0 resources, 0 actions, clears 'orphaned').
 */
export function rehomeUnitManually(state: GameState, unitId: string): GameState {
  if (!canRehomeUnitManually(state, unitId)) return state;
  const unit = state.units[unitId]!;
  const keep = getKeepAt(state, unit.tileKey)!;

  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: {
        ...unit,
        homeKeepId: keep.id,
      },
    },
  };
}
