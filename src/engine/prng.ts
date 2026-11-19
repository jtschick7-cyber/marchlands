/**
 * Marchlands (Spec v0.3) — Deterministic Seeded Mulberry32 PRNG
 *
 * Math.random() is strictly forbidden anywhere in src/.
 * All randomness derives from (seed, counter) via Mulberry32.
 */

export interface RngResult<T> {
  readonly value: T;
  readonly nextCounter: number;
}

/**
 * Computes a single deterministic float in [0, 1) for a given (seed, counter)
 * using Mulberry32 bit-mixing. O(1) random-access by counter.
 */
export function mulberry32At(seed: number, counter: number): number {
  let state =
    (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul((counter + 1) | 0, 0x85ebca6b)) >>> 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Pure draw of a float in [0, 1), advancing counter by 1.
 */
export function nextRandom(seed: number, counter: number): RngResult<number> {
  return {
    value: mulberry32At(seed, counter),
    nextCounter: counter + 1,
  };
}

/**
 * Pure draw of an integer in [min, max] inclusive, advancing counter by 1.
 */
export function nextInt(
  seed: number,
  counter: number,
  min: number,
  max: number,
): RngResult<number> {
  if (max <= min) {
    return { value: min, nextCounter: counter + 1 };
  }
  const r = mulberry32At(seed, counter);
  return {
    value: min + Math.floor(r * (max - min + 1)),
    nextCounter: counter + 1,
  };
}

/**
 * Pure pick of one element from a non-empty readonly array.
 */
export function pickOne<T>(
  seed: number,
  counter: number,
  items: readonly T[],
): RngResult<T> {
  if (items.length === 0) {
    throw new Error('Cannot pickOne from an empty array');
  }
  const { value: idx, nextCounter } = nextInt(seed, counter, 0, items.length - 1);
  return { value: items[idx]!, nextCounter };
}

/**
 * Pure Fisher-Yates shuffle returning a new array without mutating input.
 */
export function shuffleArray<T>(
  seed: number,
  counter: number,
  items: readonly T[],
): RngResult<T[]> {
  const result = items.slice();
  let c = counter;
  for (let i = result.length - 1; i > 0; i--) {
    const draw = nextInt(seed, c, 0, i);
    c = draw.nextCounter;
    const j = draw.value;
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return { value: result, nextCounter: c };
}

/**
 * Ephemeral cursor wrapper for multi-draw engine routines (e.g., mapGen).
 * Never store an instance of SeededRng inside GameState.
 */
export interface SeededRng {
  next(): number;
  nextInt(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  getCounter(): number;
}

export function createRng(seed: number, initialCounter = 0): SeededRng {
  let counter = initialCounter;
  return {
    next(): number {
      const val = mulberry32At(seed, counter);
      counter += 1;
      return val;
    },
    nextInt(min: number, max: number): number {
      const res = nextInt(seed, counter, min, max);
      counter = res.nextCounter;
      return res.value;
    },
    pick<T>(items: readonly T[]): T {
      const res = pickOne(seed, counter, items);
      counter = res.nextCounter;
      return res.value;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const res = shuffleArray(seed, counter, items);
      counter = res.nextCounter;
      return res.value;
    },
    getCounter(): number {
      return counter;
    },
  };
}
