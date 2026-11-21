/**
 * Marchlands (Spec v2.0) — Deterministic Procedural Map Generator (22x22, 28x28, 34x34)
 *
 * Supports Compact (22x22), Standard (28x28), and Grand March (34x34, default):
 * - Deterministic via Mulberry32 PRNG (zero Math.random())
 * - Terrain mix within ±4% (Plains 46%, Forest 22%, Hills 14%, River 10%, Mountain 8%)
 * - Connected edge-to-edge river network (+ tributaries on larger presets)
 * - Preset-scaled Capital spacing, Frontier Villages, Iron Deposits, Watchtowers, Ruins, Outlaw Camps
 * - Central Ruined High Seat on Standard & Grand presets
 * - 50-attempt retry + canonical relaxation order
 */

import type {
  Coord,
  CoordKey,
  HouseId,
  MapPreset,
  MapPresetConfig,
  TerrainType,
  TileState,
} from '../types/game.ts';
import {
  BANDIT_MAX_HP,
  DEFAULT_MAP_PRESET,
  HIGH_SEAT_MAX_HP,
  HOUSE_IDS,
  MAP_PRESETS,
  MAPGEN_CAMP_MIN_CAPITAL_DIST,
  MAPGEN_CORVUS_CAMP_MAX_DIST,
  MAPGEN_MAX_ATTEMPTS,
  MAPGEN_TERRAIN_TARGET_FOREST,
  MAPGEN_TERRAIN_TARGET_HILLS,
  MAPGEN_TERRAIN_TARGET_MOUNTAIN,
  MAPGEN_TERRAIN_TARGET_PLAINS,
  MAPGEN_TERRAIN_TARGET_RIVER,
  MAPGEN_TERRAIN_TOLERANCE,
  MAPGEN_VILLAGE_MIN_CAPITAL_DIST,
  MAPGEN_VILLAGE_MIN_VILLAGE_DIST,
  RELIC_RUIN_IDS,
  VILLAGE_MAX_HP,
} from '../data/index.ts';
import { chebyshevDist, coordKey, getNeighbors, getTilesInRadius, inBounds } from './coords.ts';
import { createRng, type SeededRng } from './prng.ts';

export type RelaxationLevel = 0 | 1 | 2 | 3;

export interface MapGenResult {
  readonly mapPreset: MapPreset;
  readonly gridSize: number;
  readonly tiles: Record<CoordKey, TileState>;
  readonly capitals: Readonly<Record<string, Coord>>;
  readonly highSeatTileKey: CoordKey | null;
  readonly houseOrder: readonly HouseId[];
  readonly attemptsUsed: number;
  readonly relaxationLevel: RelaxationLevel;
  readonly rngCounter: number;
}

export interface MapValidationReport {
  readonly valid: boolean;
  readonly failures: readonly string[];
}

function createEmptyTile(x: number, y: number, terrain: TerrainType = 'plains'): TileState {
  return {
    key: coordKey(x, y),
    x,
    y,
    terrain,
    hasIronDeposit: false,
    landmark: 'none',
    landmarkCleared: false,
    relicRuinId: null,
    villageHp: null,
    villageDamagedLastRound: false,
    banditHp: null,
    highSeatHp: null,
    highSeatDamagedLastRound: false,
    revealedByHouseIds: [],
    firstVisitedByHouseId: null,
    ownerHouseId: null,
    keepId: null,
    outpostId: null,
    improvement: null,
    improvementLevel: 1,
    hasRoad: false,
    fortificationHp: null,
  };
}

function placeCapitals(
  rng: SeededRng,
  houseOrder: readonly HouseId[],
  cfg: MapPresetConfig,
): Record<string, Coord> | null {
  const count = houseOrder.length;
  const gridSize = cfg.gridSize;
  const minCoord = cfg.capitalMinEdgeDist;
  const maxCoord = gridSize - 1 - cfg.capitalMinEdgeDist;
  const center = (gridSize - 1) / 2;
  const ringMin = Math.max(6.5, (gridSize - 2 * minCoord) * 0.36);
  const ringSpan = Math.max(2.0, (gridSize - 2 * minCoord) * 0.14);

  // Strategy 1: Jittered angular ring around center
  for (let tries = 0; tries < 50; tries++) {
    const baseAngle = rng.next() * Math.PI * 2;
    const coords: Coord[] = [];
    let ok = true;
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (i * Math.PI * 2) / count + (rng.next() - 0.5) * 0.4;
      const radius = ringMin + rng.next() * ringSpan;
      const x = Math.max(minCoord, Math.min(maxCoord, Math.round(center + Math.cos(angle) * radius)));
      const y = Math.max(minCoord, Math.min(maxCoord, Math.round(center + Math.sin(angle) * radius)));
      if (coords.some((c) => chebyshevDist(c.x, c.y, x, y) < cfg.capitalMinSpacing)) {
        ok = false;
        break;
      }
      if (cfg.hasHighSeat && chebyshevDist(x, y, Math.floor(center), Math.floor(center)) < 5) {
        ok = false;
        break;
      }
      coords.push({ x, y });
    }
    if (ok) {
      const shuffled = rng.shuffle(coords);
      const out: Record<string, Coord> = {};
      for (let i = 0; i < count; i++) {
        out[houseOrder[i]!] = shuffled[i]!;
      }
      return out;
    }
  }

  // Strategy 2: Random rejection sampling
  for (let tries = 0; tries < 50; tries++) {
    const coords: Coord[] = [];
    for (let i = 0; i < count; i++) {
      let placed = false;
      for (let p = 0; p < 80; p++) {
        const x = rng.nextInt(minCoord, maxCoord);
        const y = rng.nextInt(minCoord, maxCoord);
        if (cfg.hasHighSeat && chebyshevDist(x, y, Math.floor(center), Math.floor(center)) < 5) {
          continue;
        }
        if (coords.every((c) => chebyshevDist(c.x, c.y, x, y) >= cfg.capitalMinSpacing)) {
          coords.push({ x, y });
          placed = true;
          break;
        }
      }
      if (!placed) break;
    }
    if (coords.length === count) {
      const out: Record<string, Coord> = {};
      for (let i = 0; i < count; i++) {
        out[houseOrder[i]!] = coords[i]!;
      }
      return out;
    }
  }

  return null;
}

function pickCapitalRiverWaypoint(
  rng: SeededRng,
  cap: Coord,
  isAurelia: boolean,
  capitalSet: Set<CoordKey>,
  gridSize: number,
): Coord {
  const candidates: Coord[] = [];
  const radius = isAurelia ? 1 : 2;
  for (const c of getTilesInRadius(cap.x, cap.y, radius, gridSize)) {
    const dist = chebyshevDist(c.x, c.y, cap.x, cap.y);
    if (dist === 0) continue;
    if (isAurelia && dist !== 1) continue;
    if (!isAurelia && dist !== 2) continue;
    if (capitalSet.has(coordKey(c.x, c.y))) continue;
    candidates.push(c);
  }
  return rng.pick(candidates);
}

function routeRiverSegment(
  rng: SeededRng,
  start: Coord,
  end: Coord,
  blocked: Set<CoordKey>,
  gridSize: number,
): Coord[] {
  const path: Coord[] = [start];
  let cx = start.x;
  let cy = start.y;
  const visited = new Set<CoordKey>([coordKey(cx, cy)]);
  const maxSteps = gridSize * 4;

  for (let step = 0; step < maxSteps && (cx !== end.x || cy !== end.y); step++) {
    const dx = end.x - cx;
    const dy = end.y - cy;
    const dirs: Coord[] = [
      { x: cx + 1, y: cy },
      { x: cx - 1, y: cy },
      { x: cx, y: cy + 1 },
      { x: cx, y: cy - 1 },
    ].filter((n) => inBounds(n.x, n.y, gridSize) && !blocked.has(coordKey(n.x, n.y)));

    if (dirs.length === 0) break;

    const unvisited = dirs.filter((n) => !visited.has(coordKey(n.x, n.y)));
    const pool = unvisited.length > 0 ? unvisited : dirs;

    const scored = pool.map((n) => {
      const dist = Math.abs(end.x - n.x) + Math.abs(end.y - n.y);
      const axisTie =
        (Math.abs(dx) > Math.abs(dy) && n.x !== cx) ||
        (Math.abs(dy) > Math.abs(dx) && n.y !== cy)
          ? -0.25
          : 0;
      return { coord: n, score: dist + axisTie + rng.next() * 0.85 };
    });
    scored.sort((a, b) => a.score - b.score);

    const next = scored[0]!.coord;
    cx = next.x;
    cy = next.y;
    visited.add(coordKey(cx, cy));
    path.push(next);
  }

  return path;
}

function generateRivers(
  rng: SeededRng,
  tiles: Record<CoordKey, TileState>,
  capitals: Record<string, Coord>,
  houseOrder: readonly HouseId[],
  cfg: MapPresetConfig,
): void {
  const gridSize = cfg.gridSize;
  const blocked = new Set<CoordKey>(
    houseOrder.map((h) => coordKey(capitals[h]!.x, capitals[h]!.y)),
  );
  // Keep exact map center free for High Seat on Standard/Grand
  if (cfg.hasHighSeat) {
    const c = Math.floor(gridSize / 2);
    blocked.add(coordKey(c, c));
  }

  const horizontal = rng.next() < 0.5;
  const riverCoords: Coord[] = [];
  const markRiver = (c: Coord) => {
    const t = tiles[coordKey(c.x, c.y)]!;
    if (t.terrain !== 'river') {
      t.terrain = 'river';
      riverCoords.push(c);
    }
  };

  if (horizontal) {
    const byY = [...houseOrder].sort((a, b) => capitals[a]!.y - capitals[b]!.y);
    const split = Math.ceil(byY.length / 2);
    for (const group of [byY.slice(0, split), byY.slice(split)]) {
      const wps = group
        .map((h) => pickCapitalRiverWaypoint(rng, capitals[h]!, h === 'aurelia', blocked, gridSize))
        .sort((a, b) => a.x - b.x);
      const start: Coord = {
        x: 0,
        y: Math.max(1, Math.min(gridSize - 2, wps[0]!.y + rng.nextInt(-1, 1))),
      };
      const end: Coord = {
        x: gridSize - 1,
        y: Math.max(1, Math.min(gridSize - 2, wps[wps.length - 1]!.y + rng.nextInt(-1, 1))),
      };
      const pts = [start, ...wps, end];
      for (let i = 0; i < pts.length - 1; i++) {
        for (const c of routeRiverSegment(rng, pts[i]!, pts[i + 1]!, blocked, gridSize)) {
          markRiver(c);
        }
      }
    }
  } else {
    const byX = [...houseOrder].sort((a, b) => capitals[a]!.x - capitals[b]!.x);
    const split = Math.ceil(byX.length / 2);
    for (const group of [byX.slice(0, split), byX.slice(split)]) {
      const wps = group
        .map((h) => pickCapitalRiverWaypoint(rng, capitals[h]!, h === 'aurelia', blocked, gridSize))
        .sort((a, b) => a.y - b.y);
      const start: Coord = {
        x: Math.max(1, Math.min(gridSize - 2, wps[0]!.x + rng.nextInt(-1, 1))),
        y: 0,
      };
      const end: Coord = {
        x: Math.max(1, Math.min(gridSize - 2, wps[wps.length - 1]!.x + rng.nextInt(-1, 1))),
        y: gridSize - 1,
      };
      const pts = [start, ...wps, end];
      for (let i = 0; i < pts.length - 1; i++) {
        for (const c of routeRiverSegment(rng, pts[i]!, pts[i + 1]!, blocked, gridSize)) {
          markRiver(c);
        }
      }
    }
  }

  // On larger boards (28x28, 34x34), add connected tributaries until river share approaches ~9.5%
  const targetRiverTiles = Math.round(gridSize * gridSize * 0.095);
  let branchTries = 0;
  while (riverCoords.length < targetRiverTiles && branchTries < 6) {
    branchTries += 1;
    const origin = rng.pick(riverCoords);
    const edgeChoice = rng.nextInt(0, 3);
    const dest: Coord =
      edgeChoice === 0
        ? { x: 0, y: rng.nextInt(2, gridSize - 3) }
        : edgeChoice === 1
          ? { x: gridSize - 1, y: rng.nextInt(2, gridSize - 3) }
          : edgeChoice === 2
            ? { x: rng.nextInt(2, gridSize - 3), y: 0 }
            : { x: rng.nextInt(2, gridSize - 3), y: gridSize - 1 };

    const seg = routeRiverSegment(rng, origin, dest, blocked, gridSize);
    for (const c of seg) {
      if (riverCoords.length >= Math.round(gridSize * gridSize * 0.115)) break;
      markRiver(c);
    }
  }
}

function growTerrainClusters(
  rng: SeededRng,
  tiles: Record<CoordKey, TileState>,
  capitalSet: Set<CoordKey>,
  gridSize: number,
): void {
  const total = gridSize * gridSize;
  const scale = total / (22 * 22);
  const targetForest = Math.round(total * MAPGEN_TERRAIN_TARGET_FOREST);
  const targetHills = Math.round(total * MAPGEN_TERRAIN_TARGET_HILLS);
  const targetMountain = Math.round(total * MAPGEN_TERRAIN_TARGET_MOUNTAIN);

  const grow = (terrain: TerrainType, targetCount: number, seedCount: number) => {
    let placed = 0;
    const frontier: Coord[] = [];

    for (let s = 0; s < seedCount; s++) {
      for (let t = 0; t < 40; t++) {
        const x = rng.nextInt(0, gridSize - 1);
        const y = rng.nextInt(0, gridSize - 1);
        const key = coordKey(x, y);
        if (tiles[key]!.terrain === 'plains' && !capitalSet.has(key)) {
          tiles[key]!.terrain = terrain;
          placed += 1;
          frontier.push({ x, y });
          break;
        }
      }
    }

    let guard = 0;
    const maxGuard = Math.round(2500 * scale);
    while (placed < targetCount && guard < maxGuard) {
      guard += 1;
      if (frontier.length === 0) {
        const x = rng.nextInt(0, gridSize - 1);
        const y = rng.nextInt(0, gridSize - 1);
        const key = coordKey(x, y);
        if (tiles[key]!.terrain === 'plains' && !capitalSet.has(key)) {
          tiles[key]!.terrain = terrain;
          placed += 1;
          frontier.push({ x, y });
        }
        continue;
      }
      const idx = rng.nextInt(0, frontier.length - 1);
      const curr = frontier[idx]!;
      const candidates = getNeighbors(curr.x, curr.y, gridSize).filter((n) => {
        const k = coordKey(n.x, n.y);
        return tiles[k]!.terrain === 'plains' && !capitalSet.has(k);
      });
      if (candidates.length === 0) {
        frontier.splice(idx, 1);
        continue;
      }
      const next = rng.pick(candidates);
      tiles[coordKey(next.x, next.y)]!.terrain = terrain;
      placed += 1;
      frontier.push(next);
    }
  };

  grow('mountain', targetMountain, Math.max(6, Math.round(6 * scale)));
  grow('hills', targetHills, Math.max(10, Math.round(10 * scale)));
  grow('forest', targetForest, Math.max(14, Math.round(14 * scale)));
}

export function hasValidCapitalSmithyGeometry(
  tiles: Record<CoordKey, TileState>,
  cap: Coord,
  gridSize: number,
): boolean {
  const capKey = coordKey(cap.x, cap.y);
  const in5x5 = getTilesInRadius(cap.x, cap.y, 2, gridSize);
  const in5x5Keys = new Set<CoordKey>(in5x5.map((c) => coordKey(c.x, c.y)));

  const ironTiles = in5x5.filter((c) => {
    const t = tiles[coordKey(c.x, c.y)]!;
    return t.hasIronDeposit && (t.terrain === 'hills' || t.terrain === 'mountain');
  });

  for (const iron of ironTiles) {
    const ironKey = coordKey(iron.x, iron.y);
    for (const s of getNeighbors(iron.x, iron.y, gridSize)) {
      const sKey = coordKey(s.x, s.y);
      if (!in5x5Keys.has(sKey) || sKey === capKey || sKey === ironKey) continue;
      const sTile = tiles[sKey]!;
      if (sTile.terrain !== 'plains' && sTile.terrain !== 'hills') continue;

      for (const l of getNeighbors(s.x, s.y, gridSize)) {
        const lKey = coordKey(l.x, l.y);
        if (!in5x5Keys.has(lKey) || lKey === capKey || lKey === ironKey || lKey === sKey) continue;
        const lTile = tiles[lKey]!;
        if (lTile.terrain === 'plains' || lTile.terrain === 'hills') {
          return true;
        }
      }
    }
  }
  return false;
}

function enforceCapitalGuarantees(
  rng: SeededRng,
  tiles: Record<CoordKey, TileState>,
  capitals: Record<string, Coord>,
  houseOrder: readonly HouseId[],
  gridSize: number,
): Set<CoordKey> {
  const protectedKeys = new Set<CoordKey>();

  for (const houseId of houseOrder) {
    const cap = capitals[houseId]!;
    const capKey = coordKey(cap.x, cap.y);
    tiles[capKey]!.terrain = 'plains';
    protectedKeys.add(capKey);

    const ring3 = getTilesInRadius(cap.x, cap.y, 1, gridSize).filter(
      (c) => coordKey(c.x, c.y) !== capKey,
    );
    const ring5 = getTilesInRadius(cap.x, cap.y, 2, gridSize).filter(
      (c) => coordKey(c.x, c.y) !== capKey,
    );
    const ring5Outer = ring5.filter((c) => chebyshevDist(c.x, c.y, cap.x, cap.y) === 2);

    for (const c of ring5) {
      const k = coordKey(c.x, c.y);
      if (tiles[k]!.terrain === 'river') protectedKeys.add(k);
    }

    // 1. River-adjacent Plains in 3x3
    let riverAdjPlains = ring3.find((c) => {
      const k = coordKey(c.x, c.y);
      return (
        tiles[k]!.terrain === 'plains' &&
        getNeighbors(c.x, c.y, gridSize).some((n) => tiles[coordKey(n.x, n.y)]!.terrain === 'river')
      );
    });
    if (!riverAdjPlains) {
      const riverAdjCandidates = ring3.filter(
        (c) =>
          tiles[coordKey(c.x, c.y)]!.terrain !== 'river' &&
          getNeighbors(c.x, c.y, gridSize).some((n) => tiles[coordKey(n.x, n.y)]!.terrain === 'river'),
      );
      if (riverAdjCandidates.length > 0) {
        riverAdjPlains = rng.pick(riverAdjCandidates);
        tiles[coordKey(riverAdjPlains.x, riverAdjPlains.y)]!.terrain = 'plains';
      }
    }
    if (riverAdjPlains) protectedKeys.add(coordKey(riverAdjPlains.x, riverAdjPlains.y));

    // 2. Plains adjacent to >= 2 Forests in 3x3
    const millPlains = ring3.find((c) => {
      const k = coordKey(c.x, c.y);
      if (tiles[k]!.terrain !== 'plains') return false;
      return (
        getNeighbors(c.x, c.y, gridSize).filter((n) => tiles[coordKey(n.x, n.y)]!.terrain === 'forest')
          .length >= 2
      );
    });

    if (!millPlains) {
      const candidatePlains = rng.shuffle(
        ring3.filter((c) => tiles[coordKey(c.x, c.y)]!.terrain !== 'river'),
      );
      for (const p of candidatePlains) {
        const pKey = coordKey(p.x, p.y);
        const adjModifiable = getNeighbors(p.x, p.y, gridSize).filter((n) => {
          const nk = coordKey(n.x, n.y);
          return nk !== capKey && tiles[nk]!.terrain !== 'river' && !protectedKeys.has(nk);
        });
        const existingForests = getNeighbors(p.x, p.y, gridSize).filter(
          (n) => tiles[coordKey(n.x, n.y)]!.terrain === 'forest',
        );
        if (existingForests.length + adjModifiable.length >= 2) {
          tiles[pKey]!.terrain = 'plains';
          protectedKeys.add(pKey);
          let need = 2 - existingForests.length;
          for (const f of existingForests) protectedKeys.add(coordKey(f.x, f.y));
          for (const n of rng.shuffle(adjModifiable)) {
            if (need <= 0) break;
            const nk = coordKey(n.x, n.y);
            if (tiles[nk]!.terrain === 'forest') continue;
            tiles[nk]!.terrain = 'forest';
            protectedKeys.add(nk);
            need -= 1;
          }
          break;
        }
      }
    } else {
      protectedKeys.add(coordKey(millPlains.x, millPlains.y));
      let kept = 0;
      for (const n of getNeighbors(millPlains.x, millPlains.y, gridSize)) {
        const nk = coordKey(n.x, n.y);
        if (tiles[nk]!.terrain === 'forest' && kept < 2) {
          protectedKeys.add(nk);
          kept += 1;
        }
      }
    }

    // 3. Faction terrain guarantees
    if (houseId === 'vane') {
      const forests = ring5.filter((c) => tiles[coordKey(c.x, c.y)]!.terrain === 'forest');
      for (const f of forests.slice(0, 3)) protectedKeys.add(coordKey(f.x, f.y));
      let need = Math.max(0, 3 - forests.length);
      for (const c of rng.shuffle(ring5Outer)) {
        if (need <= 0) break;
        const k = coordKey(c.x, c.y);
        if (protectedKeys.has(k) || tiles[k]!.terrain === 'river' || tiles[k]!.terrain === 'forest') {
          continue;
        }
        tiles[k]!.terrain = 'forest';
        protectedKeys.add(k);
        need -= 1;
      }
    } else if (houseId === 'ironhelm') {
      const mountains = ring5.filter((c) => tiles[coordKey(c.x, c.y)]!.terrain === 'mountain');
      if (mountains.length > 0) {
        protectedKeys.add(coordKey(mountains[0]!.x, mountains[0]!.y));
      } else {
        const slot = rng.shuffle(ring5Outer).find((c) => !protectedKeys.has(coordKey(c.x, c.y)));
        if (slot) {
          const k = coordKey(slot.x, slot.y);
          tiles[k]!.terrain = 'mountain';
          protectedKeys.add(k);
        }
      }
    } else if (houseId === 'solis') {
      const hills = ring5.filter((c) => tiles[coordKey(c.x, c.y)]!.terrain === 'hills');
      for (const h of hills.slice(0, 2)) protectedKeys.add(coordKey(h.x, h.y));
      let need = Math.max(0, 2 - hills.length);
      for (const c of rng.shuffle(ring5Outer)) {
        if (need <= 0) break;
        const k = coordKey(c.x, c.y);
        if (protectedKeys.has(k) || tiles[k]!.terrain === 'river' || tiles[k]!.terrain === 'hills') {
          continue;
        }
        tiles[k]!.terrain = 'hills';
        protectedKeys.add(k);
        need -= 1;
      }
    }

    // 4. Iron Deposit in 5x5 + Capital Smithy Geometry Guarantee
    const in5x5Keys = new Set<CoordKey>(ring5.map((c) => coordKey(c.x, c.y)));
    let placedIron = false;
    const existingOreCandidates = rng.shuffle(
      ring5.filter((c) => {
        const t = tiles[coordKey(c.x, c.y)]!;
        return t.terrain === 'hills' || t.terrain === 'mountain';
      }),
    );

    const tryPlaceSmithyTriple = (ironCoord: Coord, forceTerrain: boolean): boolean => {
      const ironKey = coordKey(ironCoord.x, ironCoord.y);
      const sCandidates = rng.shuffle(
        getNeighbors(ironCoord.x, ironCoord.y, gridSize).filter((s) => {
          const sk = coordKey(s.x, s.y);
          return in5x5Keys.has(sk) && sk !== capKey && sk !== ironKey && tiles[sk]!.terrain !== 'river';
        }),
      );
      for (const s of sCandidates) {
        const sk = coordKey(s.x, s.y);
        const sTile = tiles[sk]!;
        const sOk = sTile.terrain === 'plains' || sTile.terrain === 'hills';
        if (!sOk && (!forceTerrain || protectedKeys.has(sk))) continue;

        const lCandidates = rng.shuffle(
          getNeighbors(s.x, s.y, gridSize).filter((l) => {
            const lk = coordKey(l.x, l.y);
            return (
              in5x5Keys.has(lk) &&
              lk !== capKey &&
              lk !== ironKey &&
              lk !== sk &&
              tiles[lk]!.terrain !== 'river'
            );
          }),
        );
        for (const l of lCandidates) {
          const lk = coordKey(l.x, l.y);
          const lTile = tiles[lk]!;
          const lOk = lTile.terrain === 'plains' || lTile.terrain === 'hills';
          if (!lOk && (!forceTerrain || protectedKeys.has(lk))) continue;

          const ironTile = tiles[ironKey]!;
          if (ironTile.terrain !== 'hills' && ironTile.terrain !== 'mountain') {
            ironTile.terrain = 'hills';
          }
          ironTile.hasIronDeposit = true;
          if (!sOk) sTile.terrain = 'plains';
          if (!lOk) lTile.terrain = 'plains';

          protectedKeys.add(ironKey);
          protectedKeys.add(sk);
          protectedKeys.add(lk);
          return true;
        }
      }
      return false;
    };

    for (const c of existingOreCandidates) {
      if (tryPlaceSmithyTriple(c, false)) {
        placedIron = true;
        break;
      }
    }
    if (!placedIron) {
      for (const c of existingOreCandidates) {
        if (tryPlaceSmithyTriple(c, true)) {
          placedIron = true;
          break;
        }
      }
    }
    if (!placedIron) {
      const modifiable = rng.shuffle(
        ring5Outer.filter(
          (c) => !protectedKeys.has(coordKey(c.x, c.y)) && tiles[coordKey(c.x, c.y)]!.terrain !== 'river',
        ),
      );
      for (const c of modifiable) {
        if (tryPlaceSmithyTriple(c, true)) break;
      }
    }
  }

  return protectedKeys;
}

function placeCentralHighSeat(
  rng: SeededRng,
  tiles: Record<CoordKey, TileState>,
  capitals: Record<string, Coord>,
  houseOrder: readonly HouseId[],
  cfg: MapPresetConfig,
  protectedKeys: Set<CoordKey>,
): CoordKey | null {
  if (!cfg.hasHighSeat) return null;
  const center = Math.floor(cfg.gridSize / 2);
  const capCoords = houseOrder.map((h) => capitals[h]!);
  const candidates = getTilesInRadius(center, center, 2, cfg.gridSize).filter((c) => {
    const k = coordKey(c.x, c.y);
    const t = tiles[k]!;
    return (
      t.terrain !== 'river' &&
      !protectedKeys.has(k) &&
      capCoords.every((cap) => chebyshevDist(c.x, c.y, cap.x, cap.y) >= 5)
    );
  });
  const sorted = rng.shuffle(candidates).sort(
    (a, b) => chebyshevDist(a.x, a.y, center, center) - chebyshevDist(b.x, b.y, center, center),
  );
  const picked = sorted[0];
  if (!picked) return null;

  const key = coordKey(picked.x, picked.y);
  const tile = tiles[key]!;
  tile.terrain = 'hills';
  tile.landmark = 'high_seat';
  tile.highSeatHp = HIGH_SEAT_MAX_HP;
  tile.hasIronDeposit = false;
  protectedKeys.add(key);
  return key;
}

function placeFrontierVillages(
  rng: SeededRng,
  tiles: Record<CoordKey, TileState>,
  capitals: Record<string, Coord>,
  houseOrder: readonly HouseId[],
  cfg: MapPresetConfig,
  highSeatCoord: Coord | null,
): boolean {
  const gridSize = cfg.gridSize;
  const placed: Coord[] = [];
  const capCoords = houseOrder.map((h) => ({ houseId: h, coord: capitals[h]! }));

  const isEligible = (x: number, y: number): boolean => {
    const t = tiles[coordKey(x, y)]!;
    if (t.terrain === 'mountain' || t.terrain === 'river') return false;
    if (t.landmark !== 'none' || t.hasIronDeposit) return false;
    if (
      highSeatCoord &&
      chebyshevDist(x, y, highSeatCoord.x, highSeatCoord.y) < 3
    ) {
      return false;
    }
    if (
      capCoords.some(
        (c) => chebyshevDist(x, y, c.coord.x, c.coord.y) < MAPGEN_VILLAGE_MIN_CAPITAL_DIST,
      )
    ) {
      return false;
    }
    if (placed.some((v) => chebyshevDist(x, y, v.x, v.y) < MAPGEN_VILLAGE_MIN_VILLAGE_DIST)) {
      return false;
    }
    return true;
  };

  for (const houseId of houseOrder) {
    const myCap = capitals[houseId]!;
    const candidates: Coord[] = [];
    for (let y = 1; y < gridSize - 1; y++) {
      for (let x = 1; x < gridSize - 1; x++) {
        if (!isEligible(x, y)) continue;
        const myDist = chebyshevDist(x, y, myCap.x, myCap.y);
        const strictlyClosest = capCoords.every(
          (other) =>
            other.houseId === houseId || myDist < chebyshevDist(x, y, other.coord.x, other.coord.y),
        );
        if (strictlyClosest) candidates.push({ x, y });
      }
    }

    const shuffled = rng.shuffle(candidates).sort((a, b) => {
      const da = chebyshevDist(a.x, a.y, myCap.x, myCap.y);
      const db = chebyshevDist(b.x, b.y, myCap.x, myCap.y);
      return da - db;
    });

    let countForHouse = 0;
    for (const c of shuffled) {
      if (countForHouse >= cfg.minVillagesCloserPerHouse) break;
      if (!isEligible(c.x, c.y)) continue;
      const tile = tiles[coordKey(c.x, c.y)]!;
      tile.landmark = 'frontier_village';
      tile.villageHp = VILLAGE_MAX_HP;
      placed.push(c);
      countForHouse += 1;
    }

    if (countForHouse < cfg.minVillagesCloserPerHouse) return false;
  }

  const totalTarget = cfg.villagesPerHouse * houseOrder.length + cfg.extraContestedVillages;
  const remainingCandidates: Coord[] = [];
  for (let y = 1; y < gridSize - 1; y++) {
    for (let x = 1; x < gridSize - 1; x++) {
      if (isEligible(x, y)) remainingCandidates.push({ x, y });
    }
  }
  for (const c of rng.shuffle(remainingCandidates)) {
    if (placed.length >= totalTarget) break;
    if (!isEligible(c.x, c.y)) continue;
    const tile = tiles[coordKey(c.x, c.y)]!;
    tile.landmark = 'frontier_village';
    tile.villageHp = VILLAGE_MAX_HP;
    placed.push(c);
  }

  return placed.length === totalTarget;
}

function placeLandmarksAndExtraIron(
  rng: SeededRng,
  tiles: Record<CoordKey, TileState>,
  capitals: Record<string, Coord>,
  houseOrder: readonly HouseId[],
  cfg: MapPresetConfig,
  protectedKeys: Set<CoordKey>,
): boolean {
  const gridSize = cfg.gridSize;
  const capCoords = houseOrder.map((h) => capitals[h]!);
  const inAnyCap5x5 = (x: number, y: number): boolean =>
    capCoords.some((c) => chebyshevDist(x, y, c.x, c.y) <= 2);

  // 1. Ancient Watchtowers (on Hills)
  const watchtowers: Coord[] = [];
  const hillCandidates: Coord[] = [];
  const fallbackPlains: Coord[] = [];
  for (let y = 1; y < gridSize - 1; y++) {
    for (let x = 1; x < gridSize - 1; x++) {
      const k = coordKey(x, y);
      const t = tiles[k]!;
      if (t.landmark !== 'none' || t.hasIronDeposit || inAnyCap5x5(x, y)) continue;
      if (t.terrain === 'hills') hillCandidates.push({ x, y });
      else if (t.terrain === 'plains' && !protectedKeys.has(k)) fallbackPlains.push({ x, y });
    }
  }

  const pickWatchtower = (pool: Coord[], minSpacing: number) => {
    for (const c of rng.shuffle(pool)) {
      if (watchtowers.length >= cfg.watchtowerCount) break;
      if (watchtowers.some((w) => chebyshevDist(w.x, w.y, c.x, c.y) < minSpacing)) continue;
      const k = coordKey(c.x, c.y);
      const t = tiles[k]!;
      if (t.landmark !== 'none') continue;
      t.terrain = 'hills';
      t.landmark = 'ancient_watchtower';
      protectedKeys.add(k);
      watchtowers.push(c);
    }
  };
  pickWatchtower(hillCandidates, 6);
  pickWatchtower(hillCandidates, 3);
  pickWatchtower(fallbackPlains, 3);
  if (watchtowers.length < cfg.watchtowerCount) return false;

  // 2. Outlaw Camps
  const campTarget = Math.max(houseOrder.length + 1, cfg.outlawCampCountBase);
  const camps: Coord[] = [];
  const isCampEligible = (x: number, y: number): boolean => {
    const t = tiles[coordKey(x, y)]!;
    if (t.terrain === 'mountain' || t.terrain === 'river') return false;
    if (t.landmark !== 'none' || t.hasIronDeposit) return false;
    if (capCoords.some((c) => chebyshevDist(x, y, c.x, c.y) < MAPGEN_CAMP_MIN_CAPITAL_DIST)) {
      return false;
    }
    if (camps.some((c) => chebyshevDist(x, y, c.x, c.y) < 3)) return false;
    return true;
  };

  if (houseOrder.includes('corvus') && capitals.corvus) {
    const corvusCap = capitals.corvus;
    const corvusCandidates: Coord[] = [];
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const d = chebyshevDist(x, y, corvusCap.x, corvusCap.y);
        if (d >= MAPGEN_CAMP_MIN_CAPITAL_DIST && d <= MAPGEN_CORVUS_CAMP_MAX_DIST && isCampEligible(x, y)) {
          corvusCandidates.push({ x, y });
        }
      }
    }
    if (corvusCandidates.length > 0) {
      const chosen = rng.pick(corvusCandidates);
      const k = coordKey(chosen.x, chosen.y);
      tiles[k]!.landmark = 'outlaw_camp';
      tiles[k]!.banditHp = BANDIT_MAX_HP;
      protectedKeys.add(k);
      camps.push(chosen);
    }
  }

  const allCampCandidates: Coord[] = [];
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (isCampEligible(x, y)) allCampCandidates.push({ x, y });
    }
  }
  for (const c of rng.shuffle(allCampCandidates)) {
    if (camps.length >= campTarget) break;
    if (!isCampEligible(c.x, c.y)) continue;
    const k = coordKey(c.x, c.y);
    tiles[k]!.landmark = 'outlaw_camp';
    tiles[k]!.banditHp = BANDIT_MAX_HP;
    protectedKeys.add(k);
    camps.push(c);
  }
  if (camps.length < campTarget) return false;

  // 3. Extra Contested Iron Deposits (at least half adjacent to Outlaw Camps)
  const extraIronCount = rng.nextInt(cfg.extraIronMin, cfg.extraIronMax);
  const minCampAdjIron = Math.ceil(extraIronCount / 2);
  let extraIronPlaced = 0;

  for (const camp of rng.shuffle(camps)) {
    if (extraIronPlaced >= minCampAdjIron) break;
    const adj = rng.shuffle(
      getNeighbors(camp.x, camp.y, gridSize).filter((n) => {
        const nk = coordKey(n.x, n.y);
        const nt = tiles[nk]!;
        return (
          !inAnyCap5x5(n.x, n.y) &&
          nt.landmark === 'none' &&
          !nt.hasIronDeposit &&
          nt.terrain !== 'river' &&
          !protectedKeys.has(nk)
        );
      }),
    );
    const preferred = adj.find((n) => {
      const tt = tiles[coordKey(n.x, n.y)]!.terrain;
      return tt === 'hills' || tt === 'mountain';
    });
    const chosen = preferred ?? adj[0];
    if (chosen) {
      const ck = coordKey(chosen.x, chosen.y);
      const ct = tiles[ck]!;
      if (ct.terrain !== 'hills' && ct.terrain !== 'mountain') ct.terrain = 'hills';
      ct.hasIronDeposit = true;
      protectedKeys.add(ck);
      extraIronPlaced += 1;
    }
  }

  const extraIronCandidates: Coord[] = [];
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const k = coordKey(x, y);
      const t = tiles[k]!;
      if (
        !inAnyCap5x5(x, y) &&
        t.landmark === 'none' &&
        !t.hasIronDeposit &&
        (t.terrain === 'hills' || t.terrain === 'mountain')
      ) {
        extraIronCandidates.push({ x, y });
      }
    }
  }
  for (const c of rng.shuffle(extraIronCandidates)) {
    if (extraIronPlaced >= extraIronCount) break;
    const k = coordKey(c.x, c.y);
    tiles[k]!.hasIronDeposit = true;
    protectedKeys.add(k);
    extraIronPlaced += 1;
  }
  if (extraIronPlaced < cfg.extraIronMin) return false;

  // 4. Relic Ruins drawn without replacement
  const drawnRuinIds = rng.shuffle(RELIC_RUIN_IDS).slice(0, cfg.relicRuinCount);
  const ruinCandidates: Coord[] = [];
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const t = tiles[coordKey(x, y)]!;
      if (
        t.terrain !== 'mountain' &&
        t.terrain !== 'river' &&
        t.landmark === 'none' &&
        !t.hasIronDeposit &&
        !capCoords.some((c) => chebyshevDist(x, y, c.x, c.y) <= 1)
      ) {
        ruinCandidates.push({ x, y });
      }
    }
  }

  const ruinsPlaced: Coord[] = [];
  for (const c of rng.shuffle(ruinCandidates)) {
    if (ruinsPlaced.length >= cfg.relicRuinCount) break;
    if (ruinsPlaced.some((r) => chebyshevDist(r.x, r.y, c.x, c.y) < 3)) continue;
    const k = coordKey(c.x, c.y);
    const t = tiles[k]!;
    t.landmark = 'relic_ruin';
    t.relicRuinId = drawnRuinIds[ruinsPlaced.length]!;
    protectedKeys.add(k);
    ruinsPlaced.push(c);
  }
  if (ruinsPlaced.length < cfg.relicRuinCount) return false;

  return true;
}

function getTerrainTarget(t: TerrainType): number {
  switch (t) {
    case 'plains':
      return MAPGEN_TERRAIN_TARGET_PLAINS;
    case 'forest':
      return MAPGEN_TERRAIN_TARGET_FOREST;
    case 'hills':
      return MAPGEN_TERRAIN_TARGET_HILLS;
    case 'river':
      return MAPGEN_TERRAIN_TARGET_RIVER;
    case 'mountain':
      return MAPGEN_TERRAIN_TARGET_MOUNTAIN;
  }
}

function balanceTerrainMix(
  rng: SeededRng,
  tiles: Record<CoordKey, TileState>,
  protectedKeys: Set<CoordKey>,
  gridSize: number,
): void {
  const total = gridSize * gridSize;
  const targets: Record<Exclude<TerrainType, 'river'>, number> = {
    plains: Math.round(total * MAPGEN_TERRAIN_TARGET_PLAINS),
    forest: Math.round(total * MAPGEN_TERRAIN_TARGET_FOREST),
    hills: Math.round(total * MAPGEN_TERRAIN_TARGET_HILLS),
    mountain: Math.round(total * MAPGEN_TERRAIN_TARGET_MOUNTAIN),
  };

  const counts: Record<TerrainType, number> = {
    plains: 0,
    forest: 0,
    hills: 0,
    mountain: 0,
    river: 0,
  };
  const mutable: TileState[] = [];
  for (const tile of Object.values(tiles)) {
    counts[tile.terrain] += 1;
    if (
      !protectedKeys.has(tile.key) &&
      tile.terrain !== 'river' &&
      tile.landmark === 'none' &&
      !tile.hasIronDeposit
    ) {
      mutable.push(tile);
    }
  }

  const shuffledMutable = rng.shuffle(mutable);
  const nonRiverTypes: Array<Exclude<TerrainType, 'river'>> = [
    'forest',
    'hills',
    'mountain',
    'plains',
  ];

  for (let pass = 0; pass < 3; pass++) {
    for (const needType of nonRiverTypes) {
      const minAllowed = Math.ceil(total * (getTerrainTarget(needType) - MAPGEN_TERRAIN_TOLERANCE));
      if (counts[needType] >= minAllowed) continue;

      for (const tile of shuffledMutable) {
        if (counts[needType] >= targets[needType]) break;
        const cur = tile.terrain;
        if (cur === needType || cur === 'river') continue;
        if (counts[cur] > targets[cur]) {
          counts[cur] -= 1;
          tile.terrain = needType;
          counts[needType] += 1;
        }
      }
    }

    for (const overType of nonRiverTypes) {
      const maxAllowed = Math.floor(total * (getTerrainTarget(overType) + MAPGEN_TERRAIN_TOLERANCE));
      if (counts[overType] <= maxAllowed) continue;

      for (const tile of shuffledMutable) {
        if (counts[overType] <= maxAllowed) break;
        if (tile.terrain !== overType) continue;
        let bestTarget: Exclude<TerrainType, 'river'> = 'plains';
        let bestDeficit = -Infinity;
        for (const cand of nonRiverTypes) {
          if (cand === overType) continue;
          const deficit = targets[cand] - counts[cand];
          if (deficit > bestDeficit) {
            bestDeficit = deficit;
            bestTarget = cand;
          }
        }
        counts[overType] -= 1;
        tile.terrain = bestTarget;
        counts[bestTarget] += 1;
      }
    }
  }
}

export function validateGeneratedMap(
  tiles: Record<CoordKey, TileState>,
  capitals: Readonly<Record<string, Coord>>,
  houseOrder: readonly HouseId[],
  relaxationLevel: RelaxationLevel = 0,
  mapPreset: MapPreset = DEFAULT_MAP_PRESET,
): MapValidationReport {
  const cfg = MAP_PRESETS[mapPreset];
  const gridSize = cfg.gridSize;
  const failures: string[] = [];
  const total = gridSize * gridSize;
  const allTiles = Object.values(tiles);

  if (allTiles.length !== total) {
    failures.push(`Expected ${total} tiles, got ${allTiles.length}`);
  }

  // 1. Terrain Mix (±4%) — relaxed at level >= 1
  if (relaxationLevel < 1) {
    const counts: Record<TerrainType, number> = {
      plains: 0,
      forest: 0,
      hills: 0,
      mountain: 0,
      river: 0,
    };
    for (const t of allTiles) counts[t.terrain] += 1;
    for (const tt of ['plains', 'forest', 'hills', 'river', 'mountain'] as TerrainType[]) {
      const share = counts[tt] / total;
      const target = getTerrainTarget(tt);
      if (Math.abs(share - target) > MAPGEN_TERRAIN_TOLERANCE) {
        failures.push(
          `Terrain ${tt} share ${(share * 100).toFixed(1)}% outside ${(target * 100).toFixed(0)}%±4%`,
        );
      }
    }
  }

  // 2. Capitals spacing & edges
  const capList = houseOrder.map((h) => ({ houseId: h, coord: capitals[h]! }));
  for (let i = 0; i < capList.length; i++) {
    const a = capList[i]!.coord;
    if (
      a.x < cfg.capitalMinEdgeDist ||
      a.x > gridSize - 1 - cfg.capitalMinEdgeDist ||
      a.y < cfg.capitalMinEdgeDist ||
      a.y > gridSize - 1 - cfg.capitalMinEdgeDist
    ) {
      failures.push(`Capital ${capList[i]!.houseId} too close to edge: (${a.x},${a.y})`);
    }
    for (let j = i + 1; j < capList.length; j++) {
      const b = capList[j]!.coord;
      if (chebyshevDist(a.x, a.y, b.x, b.y) < cfg.capitalMinSpacing) {
        failures.push(
          `Capitals ${capList[i]!.houseId} and ${capList[j]!.houseId} closer than ${cfg.capitalMinSpacing}`,
        );
      }
    }
  }

  // 3. Per-House & Every-House capital guarantees + Smithy geometry
  const camps = allTiles.filter((t) => t.landmark === 'outlaw_camp');
  for (const { houseId, coord: cap } of capList) {
    const capKey = coordKey(cap.x, cap.y);
    const ring3 = getTilesInRadius(cap.x, cap.y, 1, gridSize).filter(
      (c) => coordKey(c.x, c.y) !== capKey,
    );
    const ring5 = getTilesInRadius(cap.x, cap.y, 2, gridSize).filter(
      (c) => coordKey(c.x, c.y) !== capKey,
    );

    const hasRiverAdjPlains = ring3.some(
      (c) =>
        tiles[coordKey(c.x, c.y)]!.terrain === 'plains' &&
        getNeighbors(c.x, c.y, gridSize).some((n) => tiles[coordKey(n.x, n.y)]!.terrain === 'river'),
    );
    if (!hasRiverAdjPlains) failures.push(`${houseId}: missing river-adjacent Plains in 3x3`);

    const has2ForestAdjPlains = ring3.some(
      (c) =>
        tiles[coordKey(c.x, c.y)]!.terrain === 'plains' &&
        getNeighbors(c.x, c.y, gridSize).filter((n) => tiles[coordKey(n.x, n.y)]!.terrain === 'forest')
          .length >= 2,
    );
    if (!has2ForestAdjPlains) failures.push(`${houseId}: missing Plains adj to 2 Forests in 3x3`);

    const ironIn5x5 = ring5.filter((c) => tiles[coordKey(c.x, c.y)]!.hasIronDeposit).length;
    if (ironIn5x5 < 1) failures.push(`${houseId}: missing Iron Deposit in 5x5`);

    if (houseId === 'aurelia' || relaxationLevel < 3) {
      if (!hasValidCapitalSmithyGeometry(tiles, cap, gridSize)) {
        failures.push(`${houseId}: invalid Capital Smithy geometry in 5x5`);
      }
    }

    if (houseId === 'vane') {
      const forests = ring5.filter((c) => tiles[coordKey(c.x, c.y)]!.terrain === 'forest').length;
      if (forests < 3) failures.push(`vane: only ${forests} Forest tiles in 5x5`);
    }
    if (houseId === 'ironhelm') {
      const mountains = ring5.filter((c) => tiles[coordKey(c.x, c.y)]!.terrain === 'mountain').length;
      if (mountains < 1) failures.push('ironhelm: missing Mountain in 5x5');
    }
    if (houseId === 'aurelia') {
      const rivers = ring3.filter((c) => tiles[coordKey(c.x, c.y)]!.terrain === 'river').length;
      if (rivers < 1) failures.push('aurelia: missing River in 3x3');
    }
    if (houseId === 'corvus' && relaxationLevel < 2) {
      const hasNearbyCamp = camps.some(
        (camp) => chebyshevDist(camp.x, camp.y, cap.x, cap.y) <= MAPGEN_CORVUS_CAMP_MAX_DIST,
      );
      if (!hasNearbyCamp) failures.push('corvus: missing Outlaw Camp within 7 tiles');
    }
    if (houseId === 'solis') {
      const hills = ring5.filter((c) => tiles[coordKey(c.x, c.y)]!.terrain === 'hills').length;
      if (hills < 2) failures.push(`solis: only ${hills} Hills tiles in 5x5`);
    }
  }

  // 4. Frontier Villages (NEVER relaxed)
  const villages = allTiles.filter((t) => t.landmark === 'frontier_village');
  const expectedVillages = cfg.villagesPerHouse * houseOrder.length + cfg.extraContestedVillages;
  if (villages.length !== expectedVillages) {
    failures.push(`Expected ${expectedVillages} Frontier Villages, got ${villages.length}`);
  }
  for (let i = 0; i < villages.length; i++) {
    const v = villages[i]!;
    if (v.villageHp !== VILLAGE_MAX_HP) {
      failures.push(`Village at ${v.key} has villageHp=${v.villageHp}`);
    }
    for (const c of capList) {
      if (chebyshevDist(v.x, v.y, c.coord.x, c.coord.y) < MAPGEN_VILLAGE_MIN_CAPITAL_DIST) {
        failures.push(`Village at ${v.key} closer than 4 to capital ${c.houseId}`);
      }
    }
    for (let j = i + 1; j < villages.length; j++) {
      const v2 = villages[j]!;
      if (chebyshevDist(v.x, v.y, v2.x, v2.y) < MAPGEN_VILLAGE_MIN_VILLAGE_DIST) {
        failures.push(`Villages ${v.key} and ${v2.key} closer than 3`);
      }
    }
  }
  for (const { houseId, coord: cap } of capList) {
    let closestCount = 0;
    for (const v of villages) {
      const myDist = chebyshevDist(v.x, v.y, cap.x, cap.y);
      const strictlyClosest = capList.every(
        (o) => o.houseId === houseId || myDist < chebyshevDist(v.x, v.y, o.coord.x, o.coord.y),
      );
      if (strictlyClosest) closestCount += 1;
    }
    if (closestCount < cfg.minVillagesCloserPerHouse) {
      failures.push(
        `${houseId}: only ${closestCount} closest villages (need >= ${cfg.minVillagesCloserPerHouse})`,
      );
    }
  }

  // 5. High Seat, Watchtowers, Relic Ruins, Camps, Extra Iron
  const highSeats = allTiles.filter((t) => t.landmark === 'high_seat');
  if (cfg.hasHighSeat && highSeats.length !== 1) {
    failures.push(`Expected 1 Central High Seat, got ${highSeats.length}`);
  }

  const watchtowers = allTiles.filter((t) => t.landmark === 'ancient_watchtower');
  if (watchtowers.length !== cfg.watchtowerCount) {
    failures.push(`Expected ${cfg.watchtowerCount} Watchtowers, got ${watchtowers.length}`);
  }
  for (const w of watchtowers) {
    if (w.terrain !== 'hills') failures.push(`Watchtower at ${w.key} not on hills`);
  }

  const ruins = allTiles.filter((t) => t.landmark === 'relic_ruin');
  if (ruins.length !== cfg.relicRuinCount) {
    failures.push(`Expected ${cfg.relicRuinCount} Relic Ruins, got ${ruins.length}`);
  }
  const ruinIdSet = new Set(ruins.map((r) => r.relicRuinId).filter((id) => id !== null));
  if (ruinIdSet.size !== cfg.relicRuinCount) {
    failures.push(`Expected ${cfg.relicRuinCount} unique Relic Ruin IDs, got ${ruinIdSet.size}`);
  }

  const expectedCamps = Math.max(houseOrder.length + 1, cfg.outlawCampCountBase);
  if (camps.length !== expectedCamps) {
    failures.push(`Expected ${expectedCamps} Outlaw Camps, got ${camps.length}`);
  }
  for (const camp of camps) {
    if (camp.banditHp !== BANDIT_MAX_HP) {
      failures.push(`Outlaw Camp at ${camp.key} missing banditHp=${BANDIT_MAX_HP}`);
    }
  }

  const extraIron = allTiles.filter(
    (t) =>
      t.hasIronDeposit &&
      !capList.some((c) => chebyshevDist(t.x, t.y, c.coord.x, c.coord.y) <= 2),
  );
  if (extraIron.length < cfg.extraIronMin || extraIron.length > cfg.extraIronMax) {
    failures.push(
      `Expected ${cfg.extraIronMin}-${cfg.extraIronMax} extra Iron Deposits, got ${extraIron.length}`,
    );
  }

  return { valid: failures.length === 0, failures };
}

function generateAttempt(
  attemptSeed: number,
  houseOrder: readonly HouseId[],
  cfg: MapPresetConfig,
): {
  tiles: Record<CoordKey, TileState>;
  capitals: Record<string, Coord>;
  highSeatTileKey: CoordKey | null;
  rngCounter: number;
} | null {
  const rng = createRng(attemptSeed, 0);
  const gridSize = cfg.gridSize;

  const tiles: Record<CoordKey, TileState> = {};
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      tiles[coordKey(x, y)] = createEmptyTile(x, y, 'plains');
    }
  }

  const capitals = placeCapitals(rng, houseOrder, cfg);
  if (!capitals) return null;

  const capitalSet = new Set<CoordKey>(
    houseOrder.map((h) => coordKey(capitals[h]!.x, capitals[h]!.y)),
  );

  generateRivers(rng, tiles, capitals, houseOrder, cfg);
  growTerrainClusters(rng, tiles, capitalSet, gridSize);
  const protectedKeys = enforceCapitalGuarantees(rng, tiles, capitals, houseOrder, gridSize);
  const highSeatTileKey = placeCentralHighSeat(
    rng,
    tiles,
    capitals,
    houseOrder,
    cfg,
    protectedKeys,
  );
  if (cfg.hasHighSeat && highSeatTileKey === null) return null;

  const highSeatCoord = highSeatTileKey
    ? { x: tiles[highSeatTileKey]!.x, y: tiles[highSeatTileKey]!.y }
    : null;

  if (!placeFrontierVillages(rng, tiles, capitals, houseOrder, cfg, highSeatCoord)) {
    return null;
  }
  if (!placeLandmarksAndExtraIron(rng, tiles, capitals, houseOrder, cfg, protectedKeys)) {
    return null;
  }

  balanceTerrainMix(rng, tiles, protectedKeys, gridSize);

  return { tiles, capitals, highSeatTileKey, rngCounter: rng.getCounter() };
}

export function mapGen(
  seed: number,
  houseCount: 4 | 5 = 5,
  customHouseOrder?: readonly HouseId[],
  mapPreset: MapPreset = DEFAULT_MAP_PRESET,
): MapGenResult {
  const cfg = MAP_PRESETS[mapPreset];
  const houseOrder: readonly HouseId[] =
    customHouseOrder && customHouseOrder.length === houseCount
      ? customHouseOrder
      : HOUSE_IDS.slice(0, houseCount);

  for (let attempt = 0; attempt < MAPGEN_MAX_ATTEMPTS; attempt++) {
    const res = generateAttempt(seed + attempt, houseOrder, cfg);
    if (!res) continue;
    const report = validateGeneratedMap(res.tiles, res.capitals, houseOrder, 0, mapPreset);
    if (report.valid) {
      return {
        mapPreset,
        gridSize: cfg.gridSize,
        tiles: res.tiles,
        capitals: res.capitals,
        highSeatTileKey: res.highSeatTileKey,
        houseOrder,
        attemptsUsed: attempt + 1,
        relaxationLevel: 0,
        rngCounter: res.rngCounter,
      };
    }
  }

  for (const level of [1, 2, 3] as const) {
    for (let attempt = 0; attempt < MAPGEN_MAX_ATTEMPTS; attempt++) {
      const res = generateAttempt(seed + MAPGEN_MAX_ATTEMPTS * level + attempt, houseOrder, cfg);
      if (!res) continue;
      const report = validateGeneratedMap(res.tiles, res.capitals, houseOrder, level, mapPreset);
      if (report.valid) {
        return {
          mapPreset,
          gridSize: cfg.gridSize,
          tiles: res.tiles,
          capitals: res.capitals,
          highSeatTileKey: res.highSeatTileKey,
          houseOrder,
          attemptsUsed: MAPGEN_MAX_ATTEMPTS + attempt + 1,
          relaxationLevel: level,
          rngCounter: res.rngCounter,
        };
      }
    }
  }

  throw new Error(
    `mapGen failed to satisfy non-relaxable guarantees for seed=${seed} preset=${mapPreset}`,
  );
}
