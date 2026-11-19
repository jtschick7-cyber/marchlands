import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../../engine/stateHelpers.ts';
import {
  computeHouseNetIncome,
  getKeepFoodThreshold,
  getSupremacyStats,
} from '../../engine/queries.ts';
import {
  buildSaveMetadata,
  exportSaveJson,
  importSaveJson,
  validateGameStatePayload,
} from '../persistence.ts';
import { buildWatchdogTimeoutState } from '../../workers/runAiTurnWithWatchdog.ts';

describe('Step 10: Persistence Validation, Export/Import & AI Watchdog', () => {
  const sampleState = createInitialGameState({
    seed: 1001,
    houseCount: 4,
    mode: 'dominion',
    difficulty: 'normal',
    humanHouseId: 'vane',
  });

  it('exports and re-imports a valid Spec v0.3 GameState cleanly', () => {
    const json = exportSaveJson(sampleState, 'slot_1');
    const parsed = importSaveJson(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.state.specVersion).toBe('0.3');
      expect(parsed.data.state.rngSeed).toBe(1001);
      expect(parsed.data.metadata.slotId).toBe('slot_1');
      expect(parsed.data.metadata.houseId).toBe('vane');
      expect(parsed.data.metadata.mode).toBe('dominion');
      // Ensure SaveMetadata is not injected into GameState
      expect('savedAtIso' in parsed.data.state).toBe(false);
    }
  });

  it('rejects mismatched specVersion and malformed JSON gracefully', () => {
    const wrongSpec = { ...sampleState, specVersion: '0.2' };
    const res1 = validateGameStatePayload(wrongSpec);
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.error).toContain('specVersion');
    }

    const res2 = importSaveJson('{ not valid json');
    expect(res2.ok).toBe(false);

    const res3 = validateGameStatePayload({ specVersion: '0.3', version: 1 });
    expect(res3.ok).toBe(false);
  });

  it('builds SaveMetadata outside GameState with ISO timestamp', () => {
    const meta = buildSaveMetadata('autosave', sampleState);
    expect(meta.slotId).toBe('autosave');
    expect(meta.turnNumber).toBe(1);
    expect(meta.houseId).toBe('vane');
    expect(meta.mode).toBe('dominion');
    expect(meta.savedAtIso.length).toBeGreaterThan(10);
  });

  it('buildWatchdogTimeoutState logs ai_watchdog_timeout and advances activeHouseId', () => {
    const activeBefore = sampleState.activeHouseId;
    const after = buildWatchdogTimeoutState(sampleState, activeBefore);
    expect(after.activeHouseId).not.toBe(activeBefore);
    const lastEvent = after.chronicle[after.chronicle.length - 1];
    expect(lastEvent?.type).toBe('ai_watchdog_timeout');
    expect(lastEvent?.actorHouseId).toBe(activeBefore);
  });

  it('headless query helpers return accurate net income, thresholds, and supremacy stats', () => {
    const income = computeHouseNetIncome(sampleState, 'vane');
    expect(income.food).toBeGreaterThanOrEqual(2);
    expect(income.materials).toBeGreaterThanOrEqual(2);
    expect(income.grossCoin).toBeGreaterThanOrEqual(3);

    const keep = Object.values(sampleState.keeps).find((k) => k.ownerHouseId === 'vane')!;
    expect(getKeepFoodThreshold(keep)).toBe(18);

    const sup = getSupremacyStats(sampleState, 'vane');
    expect(sup.ownedKeeps).toBe(1);
    expect(sup.totalKeeps).toBe(4);
    expect(sup.requiredKeeps).toBe(5);
  });
});
