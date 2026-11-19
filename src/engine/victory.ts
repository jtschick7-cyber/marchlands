/**
 * Marchlands (Spec v0.3) — Victory Condition Evaluator (Ruling 7.2)
 *
 * Strict priority order at the end of each House's turn:
 * 1. Elimination check (human eliminated -> Defeat immediately)
 * 2. Conquest (1 living House remaining — both Dominion & Chronicle)
 * 3. Regent's Mandate (Dominion only — evaluated in crown.ts)
 * 4. Supremacy (>= 65% of all owned Keeps AND >= 5 Keeps — Dominion only)
 * 5. Chronicle Score (Chronicle only, after final House finishes Turn 33)
 */

import type { GameState } from '../types/game.ts';
import {
  CHRONICLE_TURN_LIMIT,
  SUPREMACY_KEEP_SHARE,
  SUPREMACY_MIN_KEEPS,
} from '../data/index.ts';
import { rankHousesByScore } from './scoring.ts';
import { appendChronicle, getHouseKeeps } from './stateHelpers.ts';

export function checkVictory(state: GameState, isEndOfFullRound: boolean): GameState {
  if (state.phase === 'game_over') return state;

  // 1. Elimination Check
  let nextState = state;
  const nextHouses = { ...nextState.houses };
  let elimChanged = false;
  for (const hid of nextState.houseOrder) {
    const h = nextHouses[hid];
    if (h && !h.isEliminated && getHouseKeeps(nextState, hid).length === 0) {
      nextHouses[hid] = { ...h, isEliminated: true };
      elimChanged = true;
    }
  }
  if (elimChanged) {
    nextState = { ...nextState, houses: nextHouses };
  }

  // Player Defeat check (both Dominion & Chronicle)
  if (nextState.humanHouseId !== null && nextState.houses[nextState.humanHouseId]?.isEliminated) {
    nextState = {
      ...nextState,
      phase: 'game_over',
      winnerHouseId: null,
      victoryType: 'defeat',
    };
    return appendChronicle(nextState, {
      type: 'victory',
      actorHouseId: null,
      targetHouseId: nextState.humanHouseId,
      tileKey: null,
      summary: `House ${nextState.humanHouseId} has fallen. Defeat.`,
      isPublic: true,
    });
  }

  // 2. Conquest Victory
  const living = nextState.houseOrder.filter((id) => !nextState.houses[id]?.isEliminated);
  if (living.length === 1) {
    const winner = living[0]!;
    nextState = {
      ...nextState,
      phase: 'game_over',
      winnerHouseId: winner,
      victoryType: 'conquest',
    };
    return appendChronicle(nextState, {
      type: 'victory',
      actorHouseId: winner,
      targetHouseId: null,
      tileKey: null,
      summary: `House ${winner} achieved Conquest Victory!`,
      isPublic: true,
    });
  }

  // 3. Mandate already checked before checkVictory; if won, phase is already 'game_over'

  // 4. Supremacy Victory (Dominion only)
  if (nextState.mode === 'dominion') {
    const totalOwnedKeeps = living.reduce(
      (sum, hid) => sum + getHouseKeeps(nextState, hid).length,
      0,
    );
    if (totalOwnedKeeps > 0) {
      for (const hid of living) {
        const count = getHouseKeeps(nextState, hid).length;
        if (count >= SUPREMACY_MIN_KEEPS && count / totalOwnedKeeps >= SUPREMACY_KEEP_SHARE) {
          nextState = {
            ...nextState,
            phase: 'game_over',
            winnerHouseId: hid,
            victoryType: 'supremacy',
          };
          return appendChronicle(nextState, {
            type: 'victory',
            actorHouseId: hid,
            targetHouseId: null,
            tileKey: null,
            summary: `House ${hid} achieved Territorial Supremacy (${count}/${totalOwnedKeeps} Keeps)!`,
            isPublic: true,
          });
        }
      }
    }
  }

  // 5. Chronicle Score Victory (Chronicle only, after final House finishes Turn 33)
  if (
    nextState.mode === 'chronicle' &&
    isEndOfFullRound &&
    nextState.turnNumber >= CHRONICLE_TURN_LIMIT
  ) {
    const ranked = rankHousesByScore(nextState, true, false);
    const winner = ranked[0]!;
    nextState = {
      ...nextState,
      phase: 'game_over',
      winnerHouseId: winner,
      victoryType: 'score',
    };
    return appendChronicle(nextState, {
      type: 'victory',
      actorHouseId: winner,
      targetHouseId: null,
      tileKey: null,
      summary: `Chronicle complete (Turn ${CHRONICLE_TURN_LIMIT})! House ${winner} wins by Score.`,
      isPublic: true,
    });
  }

  return nextState;
}
