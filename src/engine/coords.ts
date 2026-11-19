/**
 * Marchlands (Spec v0.3) — Grid Coordinate & Chebyshev Distance Helpers
 */

import type { Coord, CoordKey } from '../types/game.ts';
import { GRID_SIZE } from '../data/constants.ts';

export function coordKey(x: number, y: number): CoordKey {
  return `${x},${y}`;
}

export function parseCoordKey(key: CoordKey): Coord {
  const comma = key.indexOf(',');
  return {
    x: Number(key.slice(0, comma)),
    y: Number(key.slice(comma + 1)),
  };
}

export function inBounds(x: number, y: number, gridSize = GRID_SIZE): boolean {
  return x >= 0 && y >= 0 && x < gridSize && y < gridSize;
}

export function chebyshevDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function getNeighbors(x: number, y: number, gridSize = GRID_SIZE): Coord[] {
  const out: Coord[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(nx, ny, gridSize)) {
        out.push({ x: nx, y: ny });
      }
    }
  }
  return out;
}

export function getTilesInRadius(
  cx: number,
  cy: number,
  radius: number,
  gridSize = GRID_SIZE,
): Coord[] {
  const out: Coord[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (inBounds(nx, ny, gridSize)) {
        out.push({ x: nx, y: ny });
      }
    }
  }
  return out;
}
