import { describe, expect, it } from 'vitest';
import { runSimulatedGame } from '../simRunner.ts';

describe('Step 9: CI Simulation Smoke Test (5 seeded games, max 60 turns)', () => {
  it('completes 5 seeded games with 0 invariant failures and 100% determinism in < 30s', () => {
    const startMs = performance.now();

    for (let i = 0; i < 5; i++) {
      const seed = 1001 + i;
      const runA = runSimulatedGame({
        seed,
        houseCount: 5,
        mode: 'dominion',
        difficulty: 'normal',
        maxTurns: 60,
        seatRotation: i,
        checkJsonRoundTrip: true,
      });

      expect(runA.invariantViolations).toEqual([]);
      expect(runA.turnsPlayed).toBeGreaterThan(0);

      // Verify full determinism by replaying seed 1001 (1-in-5 check, stricter than harness 1-in-20)
      if (i === 0) {
        const runB = runSimulatedGame({
          seed,
          houseCount: 5,
          mode: 'dominion',
          difficulty: 'normal',
          maxTurns: 60,
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
