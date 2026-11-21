/**
 * Marchlands (Spec v2.0) — AI Single Entry Point (`runAiTurn`)
 *
 * Execution order:
 * 1. Resolve any start-of-turn pending synchronous AI decisions (specs/charters/traits/honors/doctrines)
 * 2. Strategic layer (`updateStrategicPlan`)
 * 3. Tactical layer (`runTacticalLayer`: Arrow Slits, Commander skills, beam search, Outposts, Reinforce)
 * 4. Economy layer (`runEconomyLayer`: <= MAX_AI_ACTIONS = 16)
 * 5. End turn (`endHouseTurn`)
 */

import type { Difficulty, GameState, HouseId } from '../types/game.ts';
import { endHouseTurn } from './turn.ts';
import { buildInfluenceMaps } from './ai/influence.ts';
import { updateStrategicPlan } from './ai/strategic.ts';
import { runTacticalLayer, type TacticalMetrics } from './ai/tactical.ts';
import { resolvePendingAiDecisions, runEconomyLayer } from './ai/economy.ts';

export interface AiTurnMetrics extends TacticalMetrics {
  readonly economyActionsUsed: number;
}

export interface AiTurnExecution {
  readonly state: GameState;
  readonly metrics: AiTurnMetrics;
}

/**
 * Executes a full deterministic, fog-honest AI turn for `houseId` and returns
 * both the updated GameState and guardrail/coordination telemetry.
 */
export function runAiTurnWithMetrics(
  state: GameState,
  houseId: HouseId,
  difficultyByHouse?: Partial<Record<HouseId, Difficulty>>,
): AiTurnExecution {
  if (state.phase === 'game_over' || state.activeHouseId !== houseId) {
    return {
      state,
      metrics: {
        combatResolutionsUsed: 0,
        totalKills: 0,
        focusFireKills: 0,
        attackersCount: 0,
        singleAttackerDiedOnRetaliation: false,
        singleAttackerUnitId: null,
        oneShotProtectionTriggers: 0,
        braceTriggers: 0,
        commanderSkillsUsed: 0,
        outpostsFounded: 0,
        reinforcesUsed: 0,
        economyActionsUsed: 0,
      },
    };
  }

  const house = state.houses[houseId];
  if (!house || house.isEliminated) {
    return {
      state: endHouseTurn(state, difficultyByHouse),
      metrics: {
        combatResolutionsUsed: 0,
        totalKills: 0,
        focusFireKills: 0,
        attackersCount: 0,
        singleAttackerDiedOnRetaliation: false,
        singleAttackerUnitId: null,
        oneShotProtectionTriggers: 0,
        braceTriggers: 0,
        commanderSkillsUsed: 0,
        outpostsFounded: 0,
        reinforcesUsed: 0,
        economyActionsUsed: 0,
      },
    };
  }

  let cur: GameState =
    difficultyByHouse?.[houseId] && difficultyByHouse[houseId] !== state.difficulty
      ? { ...state, difficulty: difficultyByHouse[houseId]! }
      : state;

  // Build fog-honest influence maps
  const influence = buildInfluenceMaps(cur, houseId);

  // 0. Resolve any pending start-of-turn specializations/drafts synchronously
  cur = resolvePendingAiDecisions(cur, houseId, influence);

  // 1. Strategic layer
  cur = updateStrategicPlan(cur, houseId, influence);

  // 2. Tactical layer
  const prevKeepsRef = cur.keeps;
  const prevOutpostsRef = cur.outposts;
  const tactical = runTacticalLayer(cur, houseId, influence);
  cur = tactical.state;

  // 3. Economy layer (only rebuild influence maps if Keeps/Outposts changed during combat)
  const postCombatInfluence =
    cur.keeps !== prevKeepsRef || cur.outposts !== prevOutpostsRef
      ? buildInfluenceMaps(cur, houseId)
      : influence;
  const econ = runEconomyLayer(cur, houseId, postCombatInfluence);
  cur = econ.state;

  // 4. End turn
  cur = endHouseTurn(cur, difficultyByHouse);

  return {
    state: cur,
    metrics: {
      ...tactical.metrics,
      economyActionsUsed: econ.actionsUsed,
    },
  };
}

/**
 * Canonical single entry point: `runAiTurn(state, houseId) -> GameState`.
 */
export function runAiTurn(state: GameState, houseId: HouseId): GameState {
  return runAiTurnWithMetrics(state, houseId).state;
}
