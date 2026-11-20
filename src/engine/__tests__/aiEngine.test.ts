import { describe, expect, it } from 'vitest';
import type { GameState } from '../../types/game.ts';
import {
  AI_COMBAT_RESOLUTION_BUDGET,
  MAX_AI_ACTIONS,
  UNITS,
} from '../../data/index.ts';
import { coordKey } from '../coords.ts';
import { createInitialGameState } from '../stateHelpers.ts';
import { buildInfluenceMaps } from '../ai/influence.ts';
import { isMusterReady, updateStrategicPlan } from '../ai/strategic.ts';
import { runAiTurn, runAiTurnWithMetrics } from '../utilityAi.ts';

describe('Step 8: Two-Layer Fog-Honest AI Architecture', () => {
  it('enforces strict fog-honesty in buildInfluenceMaps', () => {
    const state = createInitialGameState({
      seed: 77,
      houseCount: 4,
      mode: 'dominion',
      difficulty: 'normal',
      humanHouseId: null,
    });
    const corvusKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!;
    const hiddenTile = Object.keys(state.fog.vane!).find((k) => state.fog.vane![k] === 'unexplored')!;
    const [hx, hy] = hiddenTile.split(',').map(Number) as [number, number];

    const withHiddenEnemy: GameState = {
      ...state,
      units: {
        u_hidden: {
          id: 'u_hidden',
          houseId: 'corvus',
          typeId: 'knight',
          homeKeepId: corvusKeep.id,
          tileKey: hiddenTile,
          x: hx,
          y: hy,
          hp: UNITS.knight.maxHp,
          maxHp: UNITS.knight.maxHp,
          remainingMovement: 3,
          hasMoved: false,
          hasAttacked: false,
          spawnedOnTurn: 0,
          isMutinied: false,
          damagedSinceLastTurn: false,
          xp: 0,
          isFortified: false,
        },
      },
    };

    const inf = buildInfluenceMaps(withHiddenEnemy, 'vane');
    expect(inf.visibleEnemyUnits).toHaveLength(0);
    expect(inf.threatMap[hiddenTile]!.vsSpearman).toBe(0);
  });

  it('enforces posture hysteresis, emergency defend override, and 3-turn Muster timeout', () => {
    let state = createInitialGameState({
      seed: 88,
      houseCount: 4,
      mode: 'dominion',
      difficulty: 'normal',
      humanHouseId: null,
    });
    const inf = buildInfluenceMaps(state, 'vane');
    state = updateStrategicPlan(state, 'vane', inf);
    expect(state.houses.vane!.aiPlan).not.toBeNull();
    expect(state.houses.vane!.aiPlan!.posture).toBe('expand');

    // Damage Vane's Keep -> immediately overrides hysteresis to 'defend'
    const vaneKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!;
    const damagedKeepState: GameState = {
      ...state,
      keeps: {
        ...state.keeps,
        [vaneKeep.id]: { ...vaneKeep, damagedLastRound: true },
      },
    };
    const defended = updateStrategicPlan(damagedKeepState, 'vane', inf);
    expect(defended.houses.vane!.aiPlan!.posture).toBe('defend');

    // Muster timeout test (3 turns)
    const attackState: GameState = {
      ...state,
      turnNumber: 10,
      houses: {
        ...state.houses,
        vane: {
          ...state.houses.vane!,
          aiPlan: {
            posture: 'attack',
            targetKeepId: Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!.id,
            rallyTileKey: coordKey(10, 10),
            rallyStartedTurn: 10,
            plannedOnTurn: 10,
            postureLockedUntilTurn: 13,
          },
        },
      },
      units: {
        u1: {
          id: 'u1',
          houseId: 'vane',
          typeId: 'spearman',
          homeKeepId: vaneKeep.id,
          tileKey: coordKey(vaneKeep.x, vaneKeep.y),
          x: vaneKeep.x,
          y: vaneKeep.y,
          hp: 22,
          maxHp: 22,
          remainingMovement: 2,
          hasMoved: false,
          hasAttacked: false,
          spawnedOnTurn: 1,
          isMutinied: false,
          damagedSinceLastTurn: false,
          xp: 0,
          isFortified: false,
        },
      },
    };
    expect(isMusterReady(attackState, 'vane')).toBe(false);
    expect(isMusterReady({ ...attackState, turnNumber: 13 }, 'vane')).toBe(true);
  });

  it('runs deterministic 5-House AI-vs-AI rounds within combat & economy budgets', () => {
    const run10Rounds = (seed: number) => {
      let s = createInitialGameState({
        seed,
        houseCount: 5,
        mode: 'dominion',
        difficulty: 'normal',
        humanHouseId: null,
      });

      while (s.turnNumber <= 10 && s.phase !== 'game_over') {
        const res = runAiTurnWithMetrics(s, s.activeHouseId);
        expect(res.metrics.combatResolutionsUsed).toBeLessThanOrEqual(AI_COMBAT_RESOLUTION_BUDGET);
        expect(res.metrics.economyActionsUsed).toBeLessThanOrEqual(MAX_AI_ACTIONS);
        s = res.state;

        // Verify core invariants every AI turn
        for (const h of Object.values(s.houses)) {
          expect(h.resources.materials).toBeGreaterThanOrEqual(0);
          expect(h.resources.coin).toBeGreaterThanOrEqual(0);
          expect(h.favor).toBeGreaterThanOrEqual(0);
        }
        expect(s.pendingDraftChoices).toBeNull();
        expect(s.pendingEventChoice).toBeNull();
      }
      return s;
    };

    const runA = run10Rounds(303);
    const runB = run10Rounds(303);
    expect(runA).toEqual(runB);
    expect(JSON.parse(JSON.stringify(runA))).toEqual(runA);
    // Ensure AIs actually built improvements and trained units
    expect(Object.keys(runA.units).length).toBeGreaterThan(0);
    expect(Object.values(runA.tiles).some((t) => t.improvement !== null)).toBe(true);

    // Smoke test canonical single entry point runAiTurn
    const single = runAiTurn(
      createInitialGameState({
        seed: 404,
        houseCount: 4,
        mode: 'chronicle',
        difficulty: 'easy',
        humanHouseId: null,
      }),
      'vane',
    );
    expect(single.activeHouseId).toBe('ironhelm');
  });
});
