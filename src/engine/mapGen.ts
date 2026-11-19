/**
 * Marchlands (Spec v0.3) — Deterministic 22x22 Procedural Map Generator
 *
 * Enforces all GDD §8b and EDGE_CASE_RULINGS §8 guarantees:
 * - Deterministic via Mulberry32 PRNG (zero Math.random())
 * - Terrain mix within ±3% (Plains 46%, Forest 22%, Hills 14%, River 10%, Mountain 8%)
 * - 1–2 connected edge-to-edge river paths
 * - Capitals >= 7 Chebyshev apart, >= 3 from map edges
 * - Per-House terrain guarantees + Every-House Farm/Lumber Mill/Smithy geometry
 * - 2 * houseCount + 2 Frontier Villages (villageHp = 12), >= 2 closest per House
 * - 4 Ancient Watchtowers (Hills), 8 Relic Ruins (from 12 w/o replacement),
 *   houseCount + 1 Outlaw Camps (banditHp = 18), 1 Iron per Capital 5x5 + 4–6 extra
 * - 50-attempt retry (seed + attempt) + canonical relaxation order
 */

import type {
  Coord,
  CoordKey,
  HouseId,
  TerrainType,
  TileState,
} from '../types/game.ts';
import {
  BANDIT_MAX_HP,
  GRID_SIZE,
  HOUSE_IDS,
  MAPGEN_CAMP_MIN_CAPITAL_DIST,
  MAPGEN_CAPITAL_MIN_EDGE_DIST,
  MAPGEN_CAPITAL_MIN_SPACING,
  MAPGEN_CORVUS_CAMP_MAX_DIST,
  MAPGEN_EXTRA_IRON_MAX,
  MAPGEN_EXTRA_IRON_MIN,
  MAPGEN_MAX_ATTEMPTS,
  MAPGEN_MIN_VILLAGES_CLOSER_PER_HOUSE,
  MAPGEN_RELIC_RUIN_COUNT,
  MAPGEN_TERRAIN_TARGET_FOREST,
  MAPGEN_TERRAIN_TARGET_HILLS,
  MAPGEN_TERRAIN_TARGET_MOUNTAIN,
  MAPGEN_TERRAIN_TARGET_PLAINS,
  MAPGEN_TERRAIN_TARGET_RIVER,
  MAPGEN_TERRAIN_TOLERANCE,
  MAPGEN_VILLAGE_MIN_CAPITAL_DIST,
  MAPGEN_VILLAGE_MIN_VILLAGE_DIST,
  MAPGEN_WATCHTOWER_COUNT,
  RELIC_RUIN_IDS,
  VILLAGE_MAX_HP,
} from '../data/index.ts';
import { chebyshevDist, coordKey, getNeighbors, getTilesInRadius, inBounds } from './coords.ts';
import { createRng, type SeededRng } from './prng.ts';

export type RelaxationLevel = 0 | 1 | 2 | 3;

export interface MapGenResult {
  readonly tiles: Record<CoordKey, TileState>;
  readonly capitals: Readonly<Record<string, Coord>>;
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
    revealedByHouseIds: [],
    firstVisitedByHouseId: null,
    ownerHouseId: null,
    keepId: null,
    improvement: null,
    fortificationHp: null,
  };
}

/**
 * Places `houseCount` capitals in [3..18] at Chebyshev distance >= 7 from each other.
 */
function placeCapitals(rng: SeededRng, houseOrder: readonly HouseId[]): Record<string, Coord> | null {
  const count = houseOrder.length;
  const minCoord = MAPGEN_CAPITAL_MIN_EDGE_DIST;
  const maxCoord = GRID_SIZE - 1 - MAPGEN_CAPITAL_MIN_EDGE_DIST; // 18
  const center = (GRID_SIZE - 1) / 2; // 10.5

  // Strategy 1: Jittered angular ring around map center (high success rate & balanced geometry)
  for (let tries = 0; tries < 40; tries++) {
    const baseAngle = rng.next() * Math.PI * 2;
    const coords: Coord[] = [];
    let ok = true;
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (i * Math.PI * 2) / count + (rng.next() - 0.5) * 0.45;
      const radius = 6.8 + rng.next() * 2.2;
      const x = Math.max(minCoord, Math.min(maxCoord, Math.round(center + Math.cos(angle) * radius)));
      const y = Math.max(minCoord, Math.min(maxCoord, Math.round(center + Math.sin(angle) * radius)));
      if (coords.some((c) => chebyshevDist(c.x, c.y, x, y) < MAPGEN_CAPITAL_MIN_SPACING)) {
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

  // Strategy 2: Random rejection sampling fallback
  for (let tries = 0; tries < 40; tries++) {
    const coords: Coord[] = [];
    for (let i = 0; i < count; i++) {
      let placed = false;
      for (let p = 0; p < 60; p++) {
        const x = rng.nextInt(minCoord, maxCoord);
        const y = rng.nextInt(minCoord, maxCoord);
        if (coords.every((c) => chebyshevDist(c.x, c.y, x, y) >= MAPGEN_CAPITAL_MIN_SPACING)) {
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

/**
 * Picks a river waypoint adjacent to a capital (distance 1 for Aurelia, distance 1 or 2 for others).
 */
function pickCapitalRiverWaypoint(
  rng: SeededRng,
  cap: Coord,
  isAurelia: boolean,
  capitalSet: Set<CoordKey>,
): Coord {
  const candidates: Coord[] = [];
  const radius = isAurelia ? 1 : 2;
  for (const c of getTilesInRadius(cap.x, cap.y, radius)) {
    const dist = chebyshevDist(c.x, c.y, cap.x, cap.y);
    if (dist === 0) continue;
    if (isAurelia && dist !== 1) continue;
    if (!isAurelia && dist !== 2) continue;
    if (capitalSet.has(coordKey(c.x, c.y))) continue;
    candidates.push(c);
  }
  return rng.pick(candidates);
}

/**
 * Routes a 4-connected meandering path from `start` to `end`, avoiding `blocked` tiles.
 */
function routeRiverSegment(
  rng: SeededRng,
  start: Coord,
  end: Coord,
  blocked: Set<CoordKey>,
): Coord[] {
  const path: Coord[] = [start];
  let cx = start.x;
  let cy = start.y;
  const visited = new Set<CoordKey>([coordKey(cx, cy)]);
  const maxSteps = GRID_SIZE * 4;

  for (let step = 0; step < maxSteps && (cx !== end.x || cy !== end.y); step++) {
    const dx = end.x - cx;
    const dy = end.y - cy;
    const dirs: Coord[] = [
      { x: cx + 1, y: cy },
      { x: cx - 1, y: cy },
      { x: cx, y: cy + 1 },
      { x: cx, y: cy - 1 },
    ].filter((n) => inBounds(n.x, n.y) && !blocked.has(coordKey(n.x, n.y)));

    if (dirs.length === 0) break;

    const unvisited = dirs.filter((n) => !visited.has(coordKey(n.x, n.y)));
    const pool = unvisited.length > 0 ? unvisited : dirs;

    // Score each neighbor by Manhattan distance reduction + small random jitter
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

/**
 * Generates 2 connected edge-to-edge rivers passing near capitals so every House
 * can satisfy its river-adjacent Plains guarantee and Aurelia has River in its 3x3.
 */
function generateRivers(
  rng: SeededRng,
  tiles: Record<CoordKey, TileState>,
  capitals: Record<string, Coord>,
  houseOrder: readonly HouseId[],
): void {
  const capitalSet = new Set<CoordKey>(
    houseOrder.map((h) => coordKey(capitals[h]!.x, capitals[h]!.y)),
  );

  // Randomly orient the two rivers either W->E (split capitals by y) or N->S (split by x)
  // so each river stays compact (~22-28 tiles) and total river share hits 10% ± 3% cleanly.
  const horizontal = rng.next() < 0.5;

  if (horizontal) {
    const byY = [...houseOrder].sort((a, b) => capitals[a]!.y - capitals[b]!.y);
    const split = Math.ceil(byY.length / 2);
    const north = byY.slice(0, split);
    const south = byY.slice(split);

    for (const group of [north, south]) {
      const wps = group
        .map((h) => pickCapitalRiverWaypoint(rng, capitals[h]!, h === 'aurelia', capitalSet))
        .sort((a, b) => a.x - b.x);
      const start: Coord = {
        x: 0,
        y: Math.max(1, Math.min(GRID_SIZE - 2, wps[0]!.y + rng.nextInt(-1, 1))),
      };
      const end: Coord = {
        x: GRID_SIZE - 1,
        y: Math.max(1, Math.min(GRID_SIZE - 2, wps[wps.length - 1]!.y + rng.nextInt(-1, 1))),
      };
      const pts = [start, ...wps, end];
      for (let i = 0; i < pts.length - 1; i++) {
        const seg = routeRiverSegment(rng, pts[i]!, pts[i + 1]!, capitalSet);
        for (const c of seg) {
          tiles[coordKey(c.x, c.y)]!.terrain = 'river';
        }
      }
    }
  } else {
    const byX = [...houseOrder].sort((a, b) => capitals[a]!.x - capitals[b]!.x);
    const split = Math.ceil(byX.length / 2);
    const west = byX.slice(0, split);
    const east = byX.slice(split);

    for (const group of [west, east]) {
      const wps = group
        .map((h) => pickCapitalRiverWaypoint(rng, capitals[h]!, h === 'aurelia', capitalSet))
        .sort((a, b) => a.y - b.y);
      const start: Coord = {
        x: Math.max(1, Math.min(GRID_SIZE - 2, wps[0]!.x + rng.nextInt(-1, 1))),
        y: 0,
      };
      const end: Coord = {
        x: Math.max(1, Math.min(GRID_SIZE - 2, wps[wps.length - 1]!.x + rng.nextInt(-1, 1))),
        y: GRID_SIZE - 1,
      };
      const pts = [start, ...wps, end];
      for (let i = 0; i < pts.length - 1; i++) {
        const seg = routeRiverSegment(rng, pts[i]!, pts[i + 1]!, capitalSet);
        for (const c of seg) {
          tiles[coordKey(c.x, c.y)]!.terrain = 'river';
        }
      }
    }
  }
}

/**
 * Seeds organic terrain clusters (Forest, Hills, Mountain) on non-river, non-capital tiles.
 */
function growTerrainClusters(
  rng: SeededRng,
  tiles: Record<CoordKey, TileState>,
  capitalSet: Set<CoordKey>,
): void {
  const total = GRID_SIZE * GRID_SIZE;
  const targetForest = Math.round(total * MAPGEN_TERRAIN_TARGET_FOREST);
  const targetHills = Math.round(total * MAPGEN_TERRAIN_TARGET_HILLS);
  const targetMountain = Math.round(total * MAPGEN_TERRAIN_TARGET_MOUNTAIN);

  const grow = (terrain: TerrainType, targetCount: number, seedCount: number) => {
    let placed = 0;
    const frontier: Coord[] = [];

    for (let s = 0; s < seedCount; s++) {
      for (let t = 0; t < 40; t++) {
        const x = rng.nextInt(0, GRID_SIZE - 1);
        const y = rng.nextInt(0, GRID_SIZE - 1);
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
    while (placed < targetCount && guard < 2000) {
      guard += 1;
      if (frontier.length === 0) {
        const x = rng.nextInt(0, GRID_SIZE - 1);
        const y = rng.nextInt(0, GRID_SIZE - 1);
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
      const candidates = getNeighbors(curr.x, curr.y).filter((n) => {
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

  grow('mountain', targetMountain, 6);
  grow('hills', targetHills, 10);
  grow('forest', targetForest, 14);
}

/**
 * Checks whether a Capital's 5x5 satisfies the Capital Smithy Geometry Guarantee:
 * Iron Deposit (hills/mountain) adj to Smithy slot (plains/hills, non-capital)
 * adj to distinct Lumber Mill slot (plains/hills, non-capital), all in 5x5.
 */
export function hasValidCapitalSmithyGeometry(
  tiles: Record<CoordKey, TileState>,
  cap: Coord,
): boolean {
  const capKey = coordKey(cap.x, cap.y);
  const in5x5 = getTilesInRadius(cap.x, cap.y, 2);
  const in5x5Keys = new Set<CoordKey>(in5x5.map((c) => coordKey(c.x, c.y)));

  const ironTiles = in5x5.filter((c) => {
    const t = tiles[coordKey(c.x, c.y)]!;
    return t.hasIronDeposit && (t.terrain === 'hills' || t.terrain === 'mountain');
  });

  for (const iron of ironTiles) {
    const ironKey = coordKey(iron.x, iron.y);
    for (const s of getNeighbors(iron.x, iron.y)) {
      const sKey = coordKey(s.x, s.y);
      if (!in5x5Keys.has(sKey) || sKey === capKey || sKey === ironKey) continue;
      const sTile = tiles[sKey]!;
      if (sTile.terrain !== 'plains' && sTile.terrain !== 'hills') continue;

      for (const l of getNeighbors(s.x, s.y)) {
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

/**
 * Enforces all per-House capital 3x3 and 5x5 terrain & Smithy geometry guarantees,
 * returning the set of protected tile keys that must not be altered during terrain balancing.
 */
function enforceCapitalGuarantees(
  rng: SeededRng,
  tiles: Record<CoordKey, TileState>,
  capitals: Record<string, Coord>,
  houseOrder: readonly HouseId[],
): Set<CoordKey> {
  const protectedKeys = new Set<CoordKey>();

  for (const houseId of houseOrder) {
    const cap = capitals[houseId]!;
    const capKey = coordKey(cap.x, cap.y);
    tiles[capKey]!.terrain = 'plains';
    protectedKeys.add(capKey);

    const ring3 = getTilesInRadius(cap.x, cap.y, 1).filter((c) => coordKey(c.x, c.y) !== capKey);
    const ring5 = getTilesInRadius(cap.x, cap.y, 2).filter((c) => coordKey(c.x, c.y) !== capKey);
    const ring5Outer = ring5.filter((c) => chebyshevDist(c.x, c.y, cap.x, cap.y) === 2);

    // Protect existing river tiles in 5x5 so rivers remain connected
    for (const c of ring5) {
      const k = coordKey(c.x, c.y);
      if (tiles[k]!.terrain === 'river') {
        protectedKeys.add(k);
      }
    }

    // 1. Every House: >= 1 river-adjacent Plains tile in 3x3
    let riverAdjPlains = ring3.find((c) => {
      const k = coordKey(c.x, c.y);
      return (
        tiles[k]!.terrain === 'plains' &&
        getNeighbors(c.x, c.y).some((n) => tiles[coordKey(n.x, n.y)]!.terrain === 'river')
      );
    });
    if (!riverAdjPlains) {
      const riverAdjCandidates = ring3.filter(
        (c) =>
          tiles[coordKey(c.x, c.y)]!.terrain !== 'river' &&
          getNeighbors(c.x, c.y).some((n) => tiles[coordKey(n.x, n.y)]!.terrain === 'river'),
      );
      if (riverAdjCandidates.length > 0) {
        riverAdjPlains = rng.pick(riverAdjCandidates);
        tiles[coordKey(riverAdjPlains.x, riverAdjPlains.y)]!.terrain = 'plains';
      }
    }
    if (riverAdjPlains) {
      protectedKeys.add(coordKey(riverAdjPlains.x, riverAdjPlains.y));
    }

    // 2. Every House: >= 1 Plains tile adjacent to >= 2 Forests in 3x3
    const millPlains = ring3.find((c) => {
      const k = coordKey(c.x, c.y);
      if (tiles[k]!.terrain !== 'plains') return false;
      const adjForests = getNeighbors(c.x, c.y).filter(
        (n) => tiles[coordKey(n.x, n.y)]!.terrain === 'forest',
      );
      return adjForests.length >= 2;
    });

    if (!millPlains) {
      const candidatePlains = rng.shuffle(
        ring3.filter((c) => {
          const k = coordKey(c.x, c.y);
          return tiles[k]!.terrain !== 'river';
        }),
      );
      for (const p of candidatePlains) {
        const pKey = coordKey(p.x, p.y);
        const adjModifiable = getNeighbors(p.x, p.y).filter((n) => {
          const nk = coordKey(n.x, n.y);
          return (
            nk !== capKey &&
            tiles[nk]!.terrain !== 'river' &&
            !protectedKeys.has(nk)
          );
        });
        const existingForests = getNeighbors(p.x, p.y).filter(
          (n) => tiles[coordKey(n.x, n.y)]!.terrain === 'forest',
        );
        if (existingForests.length + adjModifiable.length >= 2) {
          tiles[pKey]!.terrain = 'plains';
          protectedKeys.add(pKey);
          let need = 2 - existingForests.length;
          for (const f of existingForests) {
            protectedKeys.add(coordKey(f.x, f.y));
          }
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
      for (const n of getNeighbors(millPlains.x, millPlains.y)) {
        const nk = coordKey(n.x, n.y);
        if (tiles[nk]!.terrain === 'forest' && kept < 2) {
          protectedKeys.add(nk);
          kept += 1;
        }
      }
    }

    // 3. Faction-specific 5x5 guarantees
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

    // 4. Guaranteed 1 Iron Deposit in 5x5 + Capital Smithy Geometry Guarantee
    const in5x5Keys = new Set<CoordKey>(ring5.map((c) => coordKey(c.x, c.y)));
    let placedIron = false;

    // Try existing hills/mountain in 5x5 first
    const existingOreCandidates = rng.shuffle(
      ring5.filter((c) => {
        const t = tiles[coordKey(c.x, c.y)]!;
        return t.terrain === 'hills' || t.terrain === 'mountain';
      }),
    );

    const tryPlaceSmithyTriple = (ironCoord: Coord, forceTerrain: boolean): boolean => {
      const ironKey = coordKey(ironCoord.x, ironCoord.y);
      const sCandidates = rng.shuffle(
        getNeighbors(ironCoord.x, ironCoord.y).filter((s) => {
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
          getNeighbors(s.x, s.y).filter((l) => {
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

          // Commit the triple
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
        ring5Outer.filter((c) => !protectedKeys.has(coordKey(c.x, c.y)) && tiles[coordKey(c.x, c.y)]!.terrain !== 'river'),
      );
      for (const c of modifiable) {
        if (tryPlaceSmithyTriple(c, true)) {
          break;
        }
      }
    }
  }

  return protectedKeys;
}

/**
 * Places 2 * houseCount + 2 Frontier Villages with >= 2 strictly closest to each capital.
 */
function placeFrontierVillages(
  rng: SeededRng,
  tiles: Record<CoordKey, TileState>,
  capitals: Record<string, Coord>,
  houseOrder: readonly HouseId[],
): boolean {
  const placed: Coord[] = [];
  const capCoords = houseOrder.map((h) => ({ houseId: h, coord: capitals[h]! }));

  const isEligible = (x: number, y: number): boolean => {
    const t = tiles[coordKey(x, y)]!;
    if (t.terrain === 'mountain' || t.terrain === 'river') return false;
    if (t.landmark !== 'none' || t.hasIronDeposit) return false;
    if (capCoords.some((c) => chebyshevDist(x, y, c.coord.x, c.coord.y) < MAPGEN_VILLAGE_MIN_CAPITAL_DIST)) {
      return false;
    }
    if (placed.some((v) => chebyshevDist(x, y, v.x, v.y) < MAPGEN_VILLAGE_MIN_VILLAGE_DIST)) {
      return false;
    }
    return true;
  };

  // Phase 1: 2 strictly closest villages per House
  for (const houseId of houseOrder) {
    const myCap = capitals[houseId]!;
    const candidates: Coord[] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (!isEligible(x, y)) continue;
        const myDist = chebyshevDist(x, y, myCap.x, myCap.y);
        const strictlyClosest = capCoords.every(
          (other) =>
            other.houseId === houseId || myDist < chebyshevDist(x, y, other.coord.x, other.coord.y),
        );
        if (strictlyClosest) {
          candidates.push({ x, y });
        }
      }
    }

    // Prefer closer ring (4..6) first so villages are reachable early, then any Voronoi tile
    const shuffled = rng.shuffle(candidates).sort((a, b) => {
      const da = chebyshevDist(a.x, a.y, myCap.x, myCap.y);
      const db = chebyshevDist(b.x, b.y, myCap.x, myCap.y);
      return da - db;
    });

    let countForHouse = 0;
    for (const c of shuffled) {
      if (countForHouse >= MAPGEN_MIN_VILLAGES_CLOSER_PER_HOUSE) break;
      if (!isEligible(c.x, c.y)) continue;
      const tile = tiles[coordKey(c.x, c.y)]!;
      tile.landmark = 'frontier_village';
      tile.villageHp = VILLAGE_MAX_HP;
      placed.push(c);
      countForHouse += 1;
    }

    if (countForHouse < MAPGEN_MIN_VILLAGES_CLOSER_PER_HOUSE) {
      return false;
    }
  }

  // Phase 2: 2 additional contested villages
  const totalTarget = 2 * houseOrder.length + 2;
  const remainingCandidates: Coord[] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (isEligible(x, y)) {
        remainingCandidates.push({ x, y });
      }
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

/**
 * Places 4 Ancient Watchtowers (on Hills), houseCount + 1 Outlaw Camps (with Bandit),
 * 4–6 extra Iron Deposits (at least half adjacent to Outlaw Camps), and 8 Relic Ruins.
 */
function placeLandmarksAndExtraIron(
  rng: SeededRng,
  tiles: Record<CoordKey, TileState>,
  capitals: Record<string, Coord>,
  houseOrder: readonly HouseId[],
  protectedKeys: Set<CoordKey>,
): boolean {
  const capCoords = houseOrder.map((h) => capitals[h]!);
  const inAnyCap5x5 = (x: number, y: number): boolean =>
    capCoords.some((c) => chebyshevDist(x, y, c.x, c.y) <= 2);

  // 1. 4 Ancient Watchtowers (on Hills, well-spaced)
  const watchtowers: Coord[] = [];
  const hillCandidates: Coord[] = [];
  const fallbackPlains: Coord[] = [];
  for (let y = 1; y < GRID_SIZE - 1; y++) {
    for (let x = 1; x < GRID_SIZE - 1; x++) {
      const k = coordKey(x, y);
      const t = tiles[k]!;
      if (t.landmark !== 'none' || t.hasIronDeposit || inAnyCap5x5(x, y)) continue;
      if (t.terrain === 'hills') {
        hillCandidates.push({ x, y });
      } else if (t.terrain === 'plains' && !protectedKeys.has(k)) {
        fallbackPlains.push({ x, y });
      }
    }
  }

  const pickWatchtower = (pool: Coord[], minSpacing: number) => {
    for (const c of rng.shuffle(pool)) {
      if (watchtowers.length >= MAPGEN_WATCHTOWER_COUNT) break;
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
  pickWatchtower(hillCandidates, 5);
  pickWatchtower(hillCandidates, 3);
  pickWatchtower(fallbackPlains, 3);
  if (watchtowers.length < MAPGEN_WATCHTOWER_COUNT) return false;

  // 2. houseCount + 1 Outlaw Camps (>= 4 from any capital; >= 1 within 6 of Corvus if present)
  const campTarget = houseOrder.length + 1;
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
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
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
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
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

  // 3. Extra Iron Deposits: 4–6 outside all capital 5x5s, at least half adjacent to an Outlaw Camp
  const extraIronCount = rng.nextInt(MAPGEN_EXTRA_IRON_MIN, MAPGEN_EXTRA_IRON_MAX);
  const minCampAdjIron = Math.ceil(extraIronCount / 2);
  let extraIronPlaced = 0;

  for (const camp of rng.shuffle(camps)) {
    if (extraIronPlaced >= minCampAdjIron) break;
    const adj = rng.shuffle(
      getNeighbors(camp.x, camp.y).filter((n) => {
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
    // Prefer existing hills/mountain
    const preferred = adj.find((n) => {
      const tt = tiles[coordKey(n.x, n.y)]!.terrain;
      return tt === 'hills' || tt === 'mountain';
    });
    const chosen = preferred ?? adj[0];
    if (chosen) {
      const ck = coordKey(chosen.x, chosen.y);
      const ct = tiles[ck]!;
      if (ct.terrain !== 'hills' && ct.terrain !== 'mountain') {
        ct.terrain = 'hills';
      }
      ct.hasIronDeposit = true;
      protectedKeys.add(ck);
      extraIronPlaced += 1;
    }
  }

  const extraIronCandidates: Coord[] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
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
  if (extraIronPlaced < MAPGEN_EXTRA_IRON_MIN) return false;

  // 4. 8 Relic Ruins drawn from 12 without replacement
  const drawnRuinIds = rng.shuffle(RELIC_RUIN_IDS).slice(0, MAPGEN_RELIC_RUIN_COUNT);
  const ruinCandidates: Coord[] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
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
    if (ruinsPlaced.length >= MAPGEN_RELIC_RUIN_COUNT) break;
    if (ruinsPlaced.some((r) => chebyshevDist(r.x, r.y, c.x, c.y) < 3)) continue;
    const k = coordKey(c.x, c.y);
    const t = tiles[k]!;
    t.landmark = 'relic_ruin';
    t.relicRuinId = drawnRuinIds[ruinsPlaced.length]!;
    protectedKeys.add(k);
    ruinsPlaced.push(c);
  }
  if (ruinsPlaced.length < MAPGEN_RELIC_RUIN_COUNT) return false;

  return true;
}

/**
 * Gently adjusts unprotected non-river, non-landmark, non-iron tiles so terrain mix
 * falls cleanly within ±3% of targets without breaking any capital or river guarantees.
 */
function balanceTerrainMix(
  rng: SeededRng,
  tiles: Record<CoordKey, TileState>,
  protectedKeys: Set<CoordKey>,
): void {
  const total = GRID_SIZE * GRID_SIZE;
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
  const nonRiverTypes: Array<Exclude<TerrainType, 'river'>> = ['forest', 'hills', 'mountain', 'plains'];

  for (let pass = 0; pass < 3; pass++) {
    for (const needType of nonRiverTypes) {
      const minAllowed = Math.ceil(total * (getTerrainTarget(needType) - MAPGEN_TERRAIN_TOLERANCE));
      if (counts[needType] >= minAllowed) continue;

      for (const tile of shuffledMutable) {
        if (counts[needType] >= targets[needType]) break;
        const cur = tile.terrain;
        if (cur === needType || cur === 'river') continue;
        const curTarget = targets[cur];
        if (counts[cur] > curTarget) {
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
        // Convert to whichever terrain is furthest below its target
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

/**
 * Independent full validator checking every Spec v0.3 mapGen guarantee.
 */
export function validateGeneratedMap(
  tiles: Record<CoordKey, TileState>,
  capitals: Readonly<Record<string, Coord>>,
  houseOrder: readonly HouseId[],
  relaxationLevel: RelaxationLevel = 0,
): MapValidationReport {
  const failures: string[] = [];
  const total = GRID_SIZE * GRID_SIZE;
  const allTiles = Object.values(tiles);

  if (allTiles.length !== total) {
    failures.push(`Expected ${total} tiles, got ${allTiles.length}`);
  }

  // 1. Terrain Mix (±3%) — relaxed at level >= 1
  if (relaxationLevel < 1) {
    const counts: Record<TerrainType, number> = {
      plains: 0,
      forest: 0,
      hills: 0,
      mountain: 0,
      river: 0,
    };
    for (const t of allTiles) counts[t.terrain] += 1;
    const types: TerrainType[] = ['plains', 'forest', 'hills', 'river', 'mountain'];
    for (const tt of types) {
      const share = counts[tt] / total;
      const target = getTerrainTarget(tt);
      if (Math.abs(share - target) > MAPGEN_TERRAIN_TOLERANCE) {
        failures.push(
          `Terrain ${tt} share ${(share * 100).toFixed(1)}% outside ${(target * 100).toFixed(0)}%±3%`,
        );
      }
    }
  }

  // 2. Capitals spacing >= 7, edge >= 3
  const capList = houseOrder.map((h) => ({ houseId: h, coord: capitals[h]! }));
  for (let i = 0; i < capList.length; i++) {
    const a = capList[i]!.coord;
    if (
      a.x < MAPGEN_CAPITAL_MIN_EDGE_DIST ||
      a.x > GRID_SIZE - 1 - MAPGEN_CAPITAL_MIN_EDGE_DIST ||
      a.y < MAPGEN_CAPITAL_MIN_EDGE_DIST ||
      a.y > GRID_SIZE - 1 - MAPGEN_CAPITAL_MIN_EDGE_DIST
    ) {
      failures.push(`Capital ${capList[i]!.houseId} too close to edge: (${a.x},${a.y})`);
    }
    for (let j = i + 1; j < capList.length; j++) {
      const b = capList[j]!.coord;
      if (chebyshevDist(a.x, a.y, b.x, b.y) < MAPGEN_CAPITAL_MIN_SPACING) {
        failures.push(`Capitals ${capList[i]!.houseId} and ${capList[j]!.houseId} closer than 7`);
      }
    }
  }

  // 3. Per-House & Every-House capital terrain guarantees + Smithy geometry
  const camps = allTiles.filter((t) => t.landmark === 'outlaw_camp');
  for (const { houseId, coord: cap } of capList) {
    const capKey = coordKey(cap.x, cap.y);
    const ring3 = getTilesInRadius(cap.x, cap.y, 1).filter((c) => coordKey(c.x, c.y) !== capKey);
    const ring5 = getTilesInRadius(cap.x, cap.y, 2).filter((c) => coordKey(c.x, c.y) !== capKey);

    const hasRiverAdjPlains = ring3.some(
      (c) =>
        tiles[coordKey(c.x, c.y)]!.terrain === 'plains' &&
        getNeighbors(c.x, c.y).some((n) => tiles[coordKey(n.x, n.y)]!.terrain === 'river'),
    );
    if (!hasRiverAdjPlains) {
      failures.push(`${houseId}: missing river-adjacent Plains in 3x3`);
    }

    const has2ForestAdjPlains = ring3.some(
      (c) =>
        tiles[coordKey(c.x, c.y)]!.terrain === 'plains' &&
        getNeighbors(c.x, c.y).filter((n) => tiles[coordKey(n.x, n.y)]!.terrain === 'forest')
          .length >= 2,
    );
    if (!has2ForestAdjPlains) {
      failures.push(`${houseId}: missing Plains adjacent to 2 Forests in 3x3`);
    }

    const ironIn5x5 = ring5.filter((c) => tiles[coordKey(c.x, c.y)]!.hasIronDeposit).length;
    if (ironIn5x5 < 1) {
      failures.push(`${houseId}: missing Iron Deposit in 5x5`);
    }

    // Smithy geometry: NEVER relaxed for Aurelia; relaxed for others at level >= 3
    if (houseId === 'aurelia' || relaxationLevel < 3) {
      if (!hasValidCapitalSmithyGeometry(tiles, cap)) {
        failures.push(`${houseId}: invalid Capital Smithy geometry in 5x5`);
      }
    }

    if (houseId === 'vane') {
      const forests = ring5.filter((c) => tiles[coordKey(c.x, c.y)]!.terrain === 'forest').length;
      if (forests < 3) failures.push(`vane: only ${forests} Forest tiles in 5x5 (need >= 3)`);
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
      if (!hasNearbyCamp) failures.push('corvus: missing Outlaw Camp within 6 tiles');
    }
    if (houseId === 'solis') {
      const hills = ring5.filter((c) => tiles[coordKey(c.x, c.y)]!.terrain === 'hills').length;
      if (hills < 2) failures.push(`solis: only ${hills} Hills tiles in 5x5 (need >= 2)`);
    }
  }

  // 4. Frontier Villages (NEVER relaxed)
  const villages = allTiles.filter((t) => t.landmark === 'frontier_village');
  const expectedVillages = 2 * houseOrder.length + 2;
  if (villages.length !== expectedVillages) {
    failures.push(`Expected ${expectedVillages} Frontier Villages, got ${villages.length}`);
  }
  for (let i = 0; i < villages.length; i++) {
    const v = villages[i]!;
    if (v.villageHp !== VILLAGE_MAX_HP) {
      failures.push(`Village at ${v.key} has villageHp=${v.villageHp} (expected ${VILLAGE_MAX_HP})`);
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
    if (closestCount < MAPGEN_MIN_VILLAGES_CLOSER_PER_HOUSE) {
      failures.push(`${houseId}: only ${closestCount} closest villages (need >= 2)`);
    }
  }

  // 5. Watchtowers, Relic Ruins, Outlaw Camps, Extra Iron Deposits
  const watchtowers = allTiles.filter((t) => t.landmark === 'ancient_watchtower');
  if (watchtowers.length !== MAPGEN_WATCHTOWER_COUNT) {
    failures.push(`Expected ${MAPGEN_WATCHTOWER_COUNT} Watchtowers, got ${watchtowers.length}`);
  }
  for (const w of watchtowers) {
    if (w.terrain !== 'hills') failures.push(`Watchtower at ${w.key} not on hills`);
  }

  const ruins = allTiles.filter((t) => t.landmark === 'relic_ruin');
  if (ruins.length !== MAPGEN_RELIC_RUIN_COUNT) {
    failures.push(`Expected ${MAPGEN_RELIC_RUIN_COUNT} Relic Ruins, got ${ruins.length}`);
  }
  const ruinIdSet = new Set(ruins.map((r) => r.relicRuinId).filter((id) => id !== null));
  if (ruinIdSet.size !== MAPGEN_RELIC_RUIN_COUNT) {
    failures.push(`Expected ${MAPGEN_RELIC_RUIN_COUNT} unique Relic Ruin IDs, got ${ruinIdSet.size}`);
  }

  const expectedCamps = houseOrder.length + 1;
  if (camps.length !== expectedCamps) {
    failures.push(`Expected ${expectedCamps} Outlaw Camps, got ${camps.length}`);
  }
  for (const camp of camps) {
    if (camp.banditHp !== BANDIT_MAX_HP) {
      failures.push(`Outlaw Camp at ${camp.key} missing banditHp=${BANDIT_MAX_HP}`);
    }
    for (const c of capList) {
      if (chebyshevDist(camp.x, camp.y, c.coord.x, c.coord.y) < MAPGEN_CAMP_MIN_CAPITAL_DIST) {
        failures.push(`Outlaw Camp at ${camp.key} closer than 4 to capital ${c.houseId}`);
      }
    }
  }

  const extraIron = allTiles.filter(
    (t) =>
      t.hasIronDeposit &&
      !capList.some((c) => chebyshevDist(t.x, t.y, c.coord.x, c.coord.y) <= 2),
  );
  if (extraIron.length < MAPGEN_EXTRA_IRON_MIN || extraIron.length > MAPGEN_EXTRA_IRON_MAX) {
    failures.push(
      `Expected ${MAPGEN_EXTRA_IRON_MIN}-${MAPGEN_EXTRA_IRON_MAX} extra Iron Deposits, got ${extraIron.length}`,
    );
  }
  const campAdjIron = extraIron.filter((t) =>
    getNeighbors(t.x, t.y).some((n) => tiles[coordKey(n.x, n.y)]!.landmark === 'outlaw_camp'),
  );
  if (campAdjIron.length < Math.ceil(extraIron.length / 2)) {
    failures.push(
      `Only ${campAdjIron.length}/${extraIron.length} extra Iron Deposits adjacent to an Outlaw Camp`,
    );
  }

  return { valid: failures.length === 0, failures };
}

function generateAttempt(
  attemptSeed: number,
  houseOrder: readonly HouseId[],
): { tiles: Record<CoordKey, TileState>; capitals: Record<string, Coord>; rngCounter: number } | null {
  const rng = createRng(attemptSeed, 0);

  const tiles: Record<CoordKey, TileState> = {};
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const k = coordKey(x, y);
      tiles[k] = createEmptyTile(x, y, 'plains');
    }
  }

  const capitals = placeCapitals(rng, houseOrder);
  if (!capitals) return null;

  const capitalSet = new Set<CoordKey>(
    houseOrder.map((h) => coordKey(capitals[h]!.x, capitals[h]!.y)),
  );

  generateRivers(rng, tiles, capitals, houseOrder);
  growTerrainClusters(rng, tiles, capitalSet);
  const protectedKeys = enforceCapitalGuarantees(rng, tiles, capitals, houseOrder);

  if (!placeFrontierVillages(rng, tiles, capitals, houseOrder)) {
    return null;
  }
  if (!placeLandmarksAndExtraIron(rng, tiles, capitals, houseOrder, protectedKeys)) {
    return null;
  }

  balanceTerrainMix(rng, tiles, protectedKeys);

  return { tiles, capitals, rngCounter: rng.getCounter() };
}

/**
 * Deterministic 22x22 map generator enforcing all Spec v0.3 guarantees
 * with 50-attempt retry (seed + attempt) and canonical relaxation order.
 */
export function mapGen(
  seed: number,
  houseCount: 4 | 5 = 5,
  customHouseOrder?: readonly HouseId[],
): MapGenResult {
  const houseOrder: readonly HouseId[] =
    customHouseOrder && customHouseOrder.length === houseCount
      ? customHouseOrder
      : HOUSE_IDS.slice(0, houseCount);

  // First 50 attempts at strict relaxationLevel = 0
  for (let attempt = 0; attempt < MAPGEN_MAX_ATTEMPTS; attempt++) {
    const res = generateAttempt(seed + attempt, houseOrder);
    if (!res) continue;
    const report = validateGeneratedMap(res.tiles, res.capitals, houseOrder, 0);
    if (report.valid) {
      return {
        tiles: res.tiles,
        capitals: res.capitals,
        houseOrder,
        attemptsUsed: attempt + 1,
        relaxationLevel: 0,
        rngCounter: res.rngCounter,
      };
    }
  }

  // Canonical relaxation order after 50 attempts:
  // (1) terrain mix tolerance, (2) Corvus camp distance, (3) non-Aurelia Smithy geometry.
  // NEVER relax Frontier Village guarantee or Aurelia's Smithy geometry.
  for (const level of [1, 2, 3] as const) {
    for (let attempt = 0; attempt < MAPGEN_MAX_ATTEMPTS; attempt++) {
      const res = generateAttempt(seed + MAPGEN_MAX_ATTEMPTS * level + attempt, houseOrder);
      if (!res) continue;
      const report = validateGeneratedMap(res.tiles, res.capitals, houseOrder, level);
      if (report.valid) {
        return {
          tiles: res.tiles,
          capitals: res.capitals,
          houseOrder,
          attemptsUsed: MAPGEN_MAX_ATTEMPTS + attempt + 1,
          relaxationLevel: level,
          rngCounter: res.rngCounter,
        };
      }
    }
  }

  throw new Error(`mapGen failed to satisfy non-relaxable guarantees for seed=${seed}`);
}
