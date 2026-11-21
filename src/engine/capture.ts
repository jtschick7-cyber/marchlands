/**
 * Marchlands (Spec v2.0) — Keep & Outpost Capture, Sticky Borders, Orphan & Manual Re-homing
 */

import type {
  CoordKey,
  GameState,
  HouseId,
  KeepState,
  OutpostState,
  TileState,
  UnitState,
} from '../types/game.ts';
import {
  IMPROVEMENTS,
  MANDATE_COOLDOWN_TURNS,
  OUTPOST_MAX_HP,
  OUTPOST_RADIUS,
  UNITS,
} from '../data/index.ts';
import { coordKey, getTilesInRadius } from './coords.ts';
import { recomputeHouseFog } from './fog.ts';
import { getIndexedKeepTiles, getIndexedOutpostTiles, getSpatialIndex } from './spatialIndex.ts';
import {
  appendChronicle,
  getHouseKeeps,
  getHouseOutpostCap,
  getHouseOutposts,
  getKeepArmyCap,
  getKeepAt,
  getKeepRadius,
  getKeepSupportedUnitIds,
} from './stateHelpers.ts';

/**
 * First-Claim Lock: Claims surrounding tiles within the Keep's radius (3x3 / 5x5 / 7x7)
 * ONLY where tile.keepId === null && tile.outpostId === null && tile.ownerHouseId === null.
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
    if (tile.keepId === null && tile.outpostId === null && tile.ownerHouseId === null) {
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
 * First-Claim Lock for Frontier Outposts (3x3 sticky claim on unowned tiles).
 */
export function claimOutpostTerritory(state: GameState, outpostId: string): GameState {
  const outpost = state.outposts[outpostId];
  if (!outpost) return state;

  const nextTiles: Record<CoordKey, TileState> = { ...state.tiles };
  let changed = false;

  for (const c of getTilesInRadius(outpost.x, outpost.y, OUTPOST_RADIUS, state.gridSize)) {
    const k = coordKey(c.x, c.y);
    const tile = nextTiles[k]!;
    if (tile.keepId === null && tile.outpostId === null && tile.ownerHouseId === null) {
      nextTiles[k] = {
        ...tile,
        outpostId,
        ownerHouseId: outpost.ownerHouseId,
      };
      changed = true;
    }
  }

  return changed ? { ...state, tiles: nextTiles } : state;
}

/**
 * Automatically re-homes any 'orphaned' units belonging to `houseId` into remaining
 * friendly Keeps with open Army Cap slots (highest Material + Iron value first).
 */
export function autoRehomeOrphans(state: GameState, houseId: HouseId): GameState {
  const orphanedUnits = (getSpatialIndex(state).unitsByOwner[houseId] ?? [])
    .filter((u) => u.homeKeepId === 'orphaned')
    .sort((a, b) => {
      const valA = UNITS[a.typeId].matCost + UNITS[a.typeId].ironCost * 2;
      const valB = UNITS[b.typeId].matCost + UNITS[b.typeId].ironCost * 2;
      return valB !== valA ? valB - valA : a.id.localeCompare(b.id);
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
 * Transfers a neutralized Keep to `newOwnerHouseId`, restores keepHp to half maxKeepHp,
 * preserves specialization & citadel charter, converts faction-unique buildings,
 * and handles orphan re-homing or House elimination.
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
    garrisonVolleyUsedThisTurn: true,
    foodProgress: 0,
  };

  const nextTiles: Record<CoordKey, TileState> = { ...state.tiles };
  for (const tile of getIndexedKeepTiles(state, keepId)) {
    let nextImprovement = tile.improvement;
    let nextLevel = tile.improvementLevel;
    let nextFortHp = tile.fortificationHp;
    if (nextImprovement !== null) {
      const impDef = IMPROVEMENTS[nextImprovement];
      if (impDef.houseId !== null && impDef.houseId !== newOwnerHouseId) {
        nextImprovement = impDef.convertsToOnCapture;
        nextLevel = 1;
        if (nextImprovement === null) {
          nextFortHp = null;
        } else {
          nextFortHp = IMPROVEMENTS[nextImprovement].maxFortificationHp;
        }
      }
    }
    nextTiles[tile.key] = {
      ...tile,
      ownerHouseId: newOwnerHouseId,
      improvement: nextImprovement,
      improvementLevel: nextLevel,
      fortificationHp: nextFortHp,
    };
  }

  const nextKeeps: Record<string, KeepState> = {
    ...state.keeps,
    [keepId]: updatedKeep,
  };

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

  // Previous owner: elimination check or orphan re-homing
  const remainingPrevKeeps = getHouseKeeps(nextState, prevOwnerHouseId);
  if (remainingPrevKeeps.length === 0) {
    const prevHouse = nextState.houses[prevOwnerHouseId]!;
    const filteredUnits: Record<string, UnitState> = {};
    for (const [uid, u] of Object.entries(nextState.units)) {
      if (u.houseId !== prevOwnerHouseId) {
        filteredUnits[uid] = u;
      }
    }
    // Remove all Outposts and border-projected watchtowers owned by the eliminated House
    const filteredOutposts: Record<string, OutpostState> = {};
    const eliminatedOutpostIds = new Set<string>();
    for (const [oid, o] of Object.entries(nextState.outposts)) {
      if (o.ownerHouseId === prevOwnerHouseId) {
        eliminatedOutpostIds.add(oid);
      } else {
        filteredOutposts[oid] = o;
      }
    }
    const cleanedTiles: Record<CoordKey, TileState> = { ...nextState.tiles };
    for (const [tk, t] of Object.entries(cleanedTiles)) {
      if (
        (t.outpostId !== null && eliminatedOutpostIds.has(t.outpostId)) ||
        (t.ownerHouseId === prevOwnerHouseId && t.keepId === null)
      ) {
        cleanedTiles[tk] = {
          ...t,
          ownerHouseId: null,
          outpostId: null,
          improvement: null,
          improvementLevel: 1,
          fortificationHp: null,
        };
      }
    }

    const prevCmd = nextState.commanders[prevOwnerHouseId];
    nextState = {
      ...nextState,
      tiles: cleanedTiles,
      outposts: filteredOutposts,
      units: filteredUnits,
      commanders: prevCmd
        ? {
            ...nextState.commanders,
            [prevOwnerHouseId]: { ...prevCmd, unitId: null, woundedTurnsRemaining: 0 },
          }
        : nextState.commanders,
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

  // Immediately break Regent's Mandate if the Claimant loses ANY Keep to a rival!
  if (nextState.crown.claimantHouseId === prevOwnerHouseId) {
    nextState = {
      ...nextState,
      crown: {
        ...nextState.crown,
        claimantHouseId: null,
        claimStartTurn: null,
        claimCooldowns: {
          ...nextState.crown.claimCooldowns,
          [prevOwnerHouseId]: nextState.turnNumber + MANDATE_COOLDOWN_TURNS,
        },
      },
    };
    nextState = appendChronicle(nextState, {
      type: 'mandate_broken',
      actorHouseId: prevOwnerHouseId,
      targetHouseId: newOwnerHouseId,
      tileKey: keep.tileKey,
      summary: `House ${prevOwnerHouseId}'s claim to the Regent's Mandate has broken after losing ${keep.name}!`,
      isPublic: true,
    });
  }

  nextState = autoRehomeOrphans(nextState, newOwnerHouseId);
  nextState = recomputeHouseFog(nextState, newOwnerHouseId);
  if (!nextState.houses[prevOwnerHouseId]?.isEliminated) {
    nextState = recomputeHouseFog(nextState, prevOwnerHouseId);
  }

  return nextState;
}

/**
 * Transfers a neutralized Frontier Outpost to `newOwnerHouseId` (if below Outpost cap),
 * otherwise destroys the Outpost and frees its 3x3 tiles.
 */
export function captureOrDestroyOutpost(
  state: GameState,
  outpostId: string,
  newOwnerHouseId: HouseId,
): GameState {
  const outpost = state.outposts[outpostId];
  if (!outpost || outpost.ownerHouseId === newOwnerHouseId) return state;

  const prevOwnerHouseId = outpost.ownerHouseId;
  const attackerHouse = state.houses[newOwnerHouseId];
  const canTake =
    attackerHouse !== undefined &&
    getHouseOutposts(state, newOwnerHouseId).length < getHouseOutpostCap(attackerHouse);

  const nextTiles: Record<CoordKey, TileState> = { ...state.tiles };
  const outpostTiles = getIndexedOutpostTiles(state, outpostId);

  if (canTake) {
    const updatedOutpost: OutpostState = {
      ...outpost,
      ownerHouseId: newOwnerHouseId,
      hp: Math.floor(OUTPOST_MAX_HP / 2),
      damagedLastRound: true,
    };
    for (const tile of outpostTiles) {
      let nextImp = tile.improvement;
      let nextLevel = tile.improvementLevel;
      let nextFortHp = tile.fortificationHp;
      if (nextImp !== null) {
        const def = IMPROVEMENTS[nextImp];
        if (def.houseId !== null && def.houseId !== newOwnerHouseId) {
          nextImp = def.convertsToOnCapture;
          nextLevel = 1;
          nextFortHp = nextImp ? IMPROVEMENTS[nextImp].maxFortificationHp : null;
        }
      }
      nextTiles[tile.key] = {
        ...tile,
        ownerHouseId: newOwnerHouseId,
        improvement: nextImp,
        improvementLevel: nextLevel,
        fortificationHp: nextFortHp,
      };
    }
    let nextState: GameState = {
      ...state,
      tiles: nextTiles,
      outposts: { ...state.outposts, [outpostId]: updatedOutpost },
    };
    nextState = appendChronicle(nextState, {
      type: 'outpost_captured',
      actorHouseId: newOwnerHouseId,
      targetHouseId: prevOwnerHouseId,
      tileKey: outpost.tileKey,
      summary: `${outpost.name} captured by House ${newOwnerHouseId}.`,
      isPublic: false,
    });
    nextState = recomputeHouseFog(nextState, newOwnerHouseId);
    nextState = recomputeHouseFog(nextState, prevOwnerHouseId);
    return nextState;
  }

  // Attacker at Outpost cap -> destroy Outpost and clear its 3x3 territory
  const nextOutposts = { ...state.outposts };
  delete nextOutposts[outpostId];
  for (const tile of outpostTiles) {
    nextTiles[tile.key] = {
      ...tile,
      ownerHouseId: null,
      outpostId: null,
      improvement: null,
      improvementLevel: 1,
      fortificationHp: null,
    };
  }

  let nextState: GameState = {
    ...state,
    tiles: nextTiles,
    outposts: nextOutposts,
  };
  nextState = appendChronicle(nextState, {
    type: 'outpost_captured',
    actorHouseId: newOwnerHouseId,
    targetHouseId: prevOwnerHouseId,
    tileKey: outpost.tileKey,
    summary: `${outpost.name} razed by House ${newOwnerHouseId}.`,
    isPublic: false,
  });
  nextState = recomputeHouseFog(nextState, prevOwnerHouseId);
  return nextState;
}

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
