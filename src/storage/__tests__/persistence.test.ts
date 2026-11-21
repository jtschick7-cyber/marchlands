import { describe, expect, it } from 'vitest';
import { KEEP_TIER1_FOOD_THRESHOLD, MAP_PRESETS } from '../../data/index.ts';
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

describe('Step 10 (v2.0): Persistence Validation, Export/Import & AI Watchdog', () => {
  const sampleState = createInitialGameState({
    seed: 1001,
    houseCount: 4,
    mode: 'dominion',
    mapPreset: 'grand',
    difficulty: 'normal',
    humanHouseId: 'vane',
  });

  it('exports and re-imports a valid Spec v2.0 GameState cleanly', () => {
    const json = exportSaveJson(sampleState, 'slot_1');
    const parsed = importSaveJson(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.state.specVersion).toBe('2.0');
      expect(parsed.data.state.gridSize).toBe(34);
      expect(parsed.data.state.mapPreset).toBe('grand');
      expect(parsed.data.state.rngSeed).toBe(1001);
      expect(parsed.data.metadata.slotId).toBe('slot_1');
      expect(parsed.data.metadata.houseId).toBe('vane');
      expect(parsed.data.metadata.mode).toBe('dominion');
      expect(parsed.data.metadata.mapPreset).toBe('grand');
      expect('savedAtIso' in parsed.data.state).toBe(false);
    }
  });

  it('rejects v0.3 saves, mismatched specVersion, invalid gridSize, and malformed JSON gracefully', () => {
    const legacyV03 = { ...sampleState, specVersion: '0.3' };
    const res1 = validateGameStatePayload(legacyV03);
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.error).toContain('specVersion');
    }

    const badGrid = { ...sampleState, gridSize: 99 };
    expect(validateGameStatePayload(badGrid).ok).toBe(false);

    const res2 = importSaveJson('{ not valid json');
    expect(res2.ok).toBe(false);

    const res3 = validateGameStatePayload({ specVersion: '2.0', version: 2 });
    expect(res3.ok).toBe(false);
  });

  it('builds SaveMetadata outside GameState with ISO timestamp and mapPreset', () => {
    const meta = buildSaveMetadata('autosave', sampleState);
    expect(meta.slotId).toBe('autosave');
    expect(meta.turnNumber).toBe(1);
    expect(meta.houseId).toBe('vane');
    expect(meta.mode).toBe('dominion');
    expect(meta.mapPreset).toBe('grand');
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

  it('headless query helpers return accurate 4-resource net income, thresholds, and supremacy stats', () => {
    const income = computeHouseNetIncome(sampleState, 'vane');
    expect(income.food).toBeGreaterThanOrEqual(2);
    expect(income.materials).toBeGreaterThanOrEqual(2);
    expect(income.iron).toBeGreaterThanOrEqual(0);
    expect(income.grossCoin).toBeGreaterThanOrEqual(2);

    const keep = Object.values(sampleState.keeps).find((k) => k.ownerHouseId === 'vane')!;
    expect(getKeepFoodThreshold(keep)).toBe(KEEP_TIER1_FOOD_THRESHOLD);

    const sup = getSupremacyStats(sampleState, 'vane');
    expect(sup.ownedKeeps).toBe(1);
    expect(sup.totalKeeps).toBe(4);
    expect(sup.requiredKeeps).toBe(MAP_PRESETS.grand.supremacyMinKeeps4);
  });
});
