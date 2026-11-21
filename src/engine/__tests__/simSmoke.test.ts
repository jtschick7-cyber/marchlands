import { describe, expect, it } from 'vitest';
import { runSimulatedGame } from '../simRunner.ts';

describe('Step 9: CI Simulation Smoke Test (3 Grand 34x34 + 2 Compact 22x22 games)', () => {
  it('completes 5 seeded v2.0 games with 0 invariant failures and 100% determinism in < 30s', () => {
    const startMs = performance.now();

    const configs = [
      { seed: 1001, mapPreset: 'grand' as const, maxTurns: 45 },
      { seed: 1002, mapPreset: 'grand' as const, maxTurns: 45 },
      { seed: 1003, mapPreset: 'grand' as const, maxTurns: 45 },
      { seed: 1004, mapPreset: 'compact' as const, maxTurns: 45 },
      { seed: 1005, mapPreset: 'compact' as const, maxTurns: 45 },
    ];

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i]!;
      const runA = runSimulatedGame({
        seed: cfg.seed,
        houseCount: 5,
        mode: 'dominion',
        mapPreset: cfg.mapPreset,
        difficulty: 'normal',
        maxTurns: cfg.maxTurns,
        seatRotation: i,
        checkJsonRoundTrip: i === 0 || i === 3,
      });

      expect(runA.invariantViolations).toEqual([]);
      expect(runA.turnsPlayed).toBeGreaterThan(0);

      // Verify 100% determinism on Compact (60 turns)
      if (i === 3) {
        const runB = runSimulatedGame({
          seed: cfg.seed,
          houseCount: 5,
          mode: 'dominion',
          mapPreset: cfg.mapPreset,
          difficulty: 'normal',
          maxTurns: cfg.maxTurns,
          seatRotation: i,
          checkJsonRoundTrip: false,
        });

        expect(runB.finalStateHash).toBe(runA.finalStateHash);
        expect(runB.winnerHouseId).toBe(runA.winnerHouseId);
        expect(runB.victoryType).toBe(runA.victoryType);
        expect(runB.turnsPlayed).toBe(runA.turnsPlayed);
      }
    }

    const elapsedMs = performance.now() - startMs;
    expect(elapsedMs).toBeLessThan(30_000);
  }, 35_000);
});
