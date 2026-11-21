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

describe('mapGen(seed, houseCount, customHouseOrder, mapPreset)', () => {
  it('is 100% deterministic and JSON-serializable across compact, standard, and grand presets', () => {
    for (const preset of ['compact', 'standard', 'grand'] as const) {
      const a = mapGen(2026, 5, undefined, preset);
      const b = mapGen(2026, 5, undefined, preset);
      expect(a).toEqual(b);
      expect(JSON.parse(JSON.stringify(a.tiles))).toEqual(a.tiles);

      const highSeats = Object.values(a.tiles).filter((t) => t.landmark === 'high_seat');
      if (preset === 'compact') {
        expect(highSeats).toHaveLength(0);
      } else {
        expect(highSeats).toHaveLength(1);
        expect(highSeats[0]!.highSeatHp).toBe(42);
      }
    }
  });

  it('passes all v2.0 fairness guarantees across 150 Grand (34x34) 5-House seeds', () => {
    let strictCount = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const res = mapGen(seed, 5, undefined, 'grand');
      const report = validateGeneratedMap(
        res.tiles,
        res.capitals,
        res.houseOrder,
        res.relaxationLevel,
        'grand',
      );
      expect(report.valid, `grand seed=${seed} failed: ${report.failures.join('; ')}`).toBe(true);
      if (res.relaxationLevel === 0) strictCount += 1;
    }
    expect(strictCount).toBeGreaterThanOrEqual(140);
  });

  it('passes all v2.0 fairness guarantees across 150 Standard (28x28) & 200 Compact (22x22) seeds', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const res = mapGen(seed, 4, undefined, 'standard');
      const report = validateGeneratedMap(
        res.tiles,
        res.capitals,
        res.houseOrder,
        res.relaxationLevel,
        'standard',
      );
      expect(report.valid, `standard seed=${seed} failed: ${report.failures.join('; ')}`).toBe(true);
    }
    for (let seed = 1; seed <= 200; seed++) {
      const res = mapGen(seed, 5, undefined, 'compact');
      const report = validateGeneratedMap(
        res.tiles,
        res.capitals,
        res.houseOrder,
        res.relaxationLevel,
        'compact',
      );
      expect(report.valid, `compact seed=${seed} failed: ${report.failures.join('; ')}`).toBe(true);
    }
  });
});
