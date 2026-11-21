/**
 * Marchlands (Spec v2.0) — Ephemeral Sub-Record Spatial Index for Fast 34x34 Queries
 *
 * Strictly ephemeral (never persisted in GameState). WeakMap-cached independently
 * by `state.tiles`, `state.units`, `state.keeps`, and `state.outposts` identity so
 * unit movement, combat, fog, or treasury updates NEVER trigger a 1,156-tile rescan.
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

interface TileIndex {
  readonly tilesByKeepId: Readonly<Record<string, readonly TileState[]>>;
  readonly tilesByOutpostId: Readonly<Record<string, readonly TileState[]>>;
  readonly tilesByOwner: Readonly<Record<string, readonly TileState[]>>;
}

interface UnitIndex {
  readonly unitByTileKey: Readonly<Record<CoordKey, UnitState>>;
  readonly unitsByOwner: Readonly<Record<string, readonly UnitState[]>>;
  readonly unitsByHomeKeepId: Readonly<Record<string, readonly UnitState[]>>;
}

interface KeepIndex {
  readonly keepByTileKey: Readonly<Record<CoordKey, KeepState>>;
  readonly keepsByOwner: Readonly<Record<string, readonly KeepState[]>>;
}

interface OutpostIndex {
  readonly outpostByTileKey: Readonly<Record<CoordKey, OutpostState>>;
  readonly outpostsByOwner: Readonly<Record<string, readonly OutpostState[]>>;
}

export interface SpatialIndex extends TileIndex, UnitIndex, KeepIndex, OutpostIndex {}

const tileIndexCache = new WeakMap<GameState['tiles'], TileIndex>();
const unitIndexCache = new WeakMap<GameState['units'], UnitIndex>();
const keepIndexCache = new WeakMap<GameState['keeps'], KeepIndex>();
const outpostIndexCache = new WeakMap<GameState['outposts'], OutpostIndex>();
const combinedCache = new WeakMap<GameState, SpatialIndex>();

function getTileIndex(tiles: GameState['tiles']): TileIndex {
  let cached = tileIndexCache.get(tiles);
  if (cached) return cached;

  const tilesByKeepId: Record<string, TileState[]> = {};
  const tilesByOutpostId: Record<string, TileState[]> = {};
  const tilesByOwner: Record<string, TileState[]> = {};

  for (const key in tiles) {
    const tile = tiles[key]!;
    if (tile.keepId !== null) {
      (tilesByKeepId[tile.keepId] ??= []).push(tile);
    }
    if (tile.outpostId !== null) {
      (tilesByOutpostId[tile.outpostId] ??= []).push(tile);
    }
    if (tile.ownerHouseId !== null) {
      (tilesByOwner[tile.ownerHouseId] ??= []).push(tile);
    }
  }

  cached = { tilesByKeepId, tilesByOutpostId, tilesByOwner };
  tileIndexCache.set(tiles, cached);
  return cached;
}

function getUnitIndex(units: GameState['units']): UnitIndex {
  let cached = unitIndexCache.get(units);
  if (cached) return cached;

  const unitByTileKey: Record<CoordKey, UnitState> = {};
  const unitsByOwner: Record<string, UnitState[]> = {};
  const unitsByHomeKeepId: Record<string, UnitState[]> = {};

  for (const id in units) {
    const unit = units[id]!;
    unitByTileKey[unit.tileKey] = unit;
    (unitsByOwner[unit.houseId] ??= []).push(unit);
    (unitsByHomeKeepId[unit.homeKeepId] ??= []).push(unit);
  }

  cached = { unitByTileKey, unitsByOwner, unitsByHomeKeepId };
  unitIndexCache.set(units, cached);
  return cached;
}

function getKeepIndex(keeps: GameState['keeps']): KeepIndex {
  let cached = keepIndexCache.get(keeps);
  if (cached) return cached;

  const keepByTileKey: Record<CoordKey, KeepState> = {};
  const keepsByOwner: Record<string, KeepState[]> = {};

  for (const id in keeps) {
    const keep = keeps[id]!;
    keepByTileKey[keep.tileKey] = keep;
    (keepsByOwner[keep.ownerHouseId] ??= []).push(keep);
  }

  cached = { keepByTileKey, keepsByOwner };
  keepIndexCache.set(keeps, cached);
  return cached;
}

function getOutpostIndex(outposts: GameState['outposts']): OutpostIndex {
  let cached = outpostIndexCache.get(outposts);
  if (cached) return cached;

  const outpostByTileKey: Record<CoordKey, OutpostState> = {};
  const outpostsByOwner: Record<string, OutpostState[]> = {};

  for (const id in outposts) {
    const outpost = outposts[id]!;
    outpostByTileKey[outpost.tileKey] = outpost;
    (outpostsByOwner[outpost.ownerHouseId] ??= []).push(outpost);
  }

  cached = { outpostByTileKey, outpostsByOwner };
  outpostIndexCache.set(outposts, cached);
  return cached;
}

export function getSpatialIndex(state: GameState): SpatialIndex {
  let cached = combinedCache.get(state);
  if (cached) return cached;

  const t = getTileIndex(state.tiles);
  const u = getUnitIndex(state.units);
  const k = getKeepIndex(state.keeps);
  const o = getOutpostIndex(state.outposts);

  cached = {
    tilesByKeepId: t.tilesByKeepId,
    tilesByOutpostId: t.tilesByOutpostId,
    tilesByOwner: t.tilesByOwner,
    unitByTileKey: u.unitByTileKey,
    unitsByOwner: u.unitsByOwner,
    unitsByHomeKeepId: u.unitsByHomeKeepId,
    keepByTileKey: k.keepByTileKey,
    keepsByOwner: k.keepsByOwner,
    outpostByTileKey: o.outpostByTileKey,
    outpostsByOwner: o.outpostsByOwner,
  };
  combinedCache.set(state, cached);
  return cached;
}

export function getIndexedHouseTiles(state: GameState, houseId: HouseId): readonly TileState[] {
  return getTileIndex(state.tiles).tilesByOwner[houseId] ?? [];
}

export function getIndexedKeepTiles(state: GameState, keepId: string): readonly TileState[] {
  return getTileIndex(state.tiles).tilesByKeepId[keepId] ?? [];
}

export function getIndexedOutpostTiles(state: GameState, outpostId: string): readonly TileState[] {
  return getTileIndex(state.tiles).tilesByOutpostId[outpostId] ?? [];
}
