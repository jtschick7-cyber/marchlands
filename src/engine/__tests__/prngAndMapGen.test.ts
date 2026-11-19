import { describe, expect, it } from 'vitest';
import { createRng, mulberry32At, nextInt, shuffleArray } from '../prng.ts';
import { mapGen, validateGeneratedMap } from '../mapGen.ts';

describe('Mulberry32 PRNG', () => {
  it('is 100% deterministic for identical (seed, counter) inputs', () => {
    for (let i = 0; i < 50; i++) {
      expect(mulberry32At(12345, i)).toBe(mulberry32At(12345, i));
      const v = mulberry32At(12345, i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32At(12345, 0)).not.toBe(mulberry32At(12346, 0));
  });

  it('produces integers within inclusive [min, max] bounds and shuffles immutably', () => {
    const rng = createRng(999);
    for (let i = 0; i < 100; i++) {
      const n = rng.nextInt(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
    expect(rng.getCounter()).toBe(100);

    const draw = nextInt(42, 0, 1, 10);
    expect(draw.nextCounter).toBe(1);
    expect(draw.value).toBeGreaterThanOrEqual(1);
    expect(draw.value).toBeLessThanOrEqual(10);

    const original = [1, 2, 3, 4, 5, 6];
    const shuffled = shuffleArray(42, 0, original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...shuffled.value].sort((a, b) => a - b)).toEqual(original);
  });
});

describe('mapGen(seed, houseCount)', () => {
  it('is 100% deterministic and JSON-serializable for identical seeds', () => {
    const a = mapGen(2026, 5);
    const b = mapGen(2026, 5);
    expect(a).toEqual(b);

    const roundTripped = JSON.parse(JSON.stringify(a.tiles));
    expect(roundTripped).toEqual(a.tiles);
  });

  it('passes all v0.3 fairness guarantees across 500 consecutive 4-House seeds', () => {
    let strictCount = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const res = mapGen(seed, 4);
      const report = validateGeneratedMap(
        res.tiles,
        res.capitals,
        res.houseOrder,
        res.relaxationLevel,
      );
      expect(report.valid, `seed=${seed} failed: ${report.failures.join('; ')}`).toBe(true);
      if (res.relaxationLevel === 0) strictCount += 1;
    }
    // Expect virtually all seeds to pass with zero relaxation
    expect(strictCount).toBeGreaterThanOrEqual(495);
  });

  it('passes all v0.3 fairness guarantees across 500 consecutive 5-House seeds', () => {
    let strictCount = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const res = mapGen(seed, 5);
      const report = validateGeneratedMap(
        res.tiles,
        res.capitals,
        res.houseOrder,
        res.relaxationLevel,
      );
      expect(report.valid, `seed=${seed} failed: ${report.failures.join('; ')}`).toBe(true);
      if (res.relaxationLevel === 0) strictCount += 1;
    }
    // Expect virtually all seeds to pass with zero relaxation
    expect(strictCount).toBeGreaterThanOrEqual(495);
  });
});
