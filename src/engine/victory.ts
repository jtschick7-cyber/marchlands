/**
 * Marchlands (Spec v2.0) — Victory Condition Evaluator
 */

import type { GameState } from '../types/game.ts';
import { rankHousesByScore } from './scoring.ts';
import { appendChronicle, getHouseKeeps, getMapPresetConfig } from './stateHelpers.ts';

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

  // 4. Supremacy Victory (Dominion only, preset-scaled)
  if (nextState.mode === 'dominion') {
    const cfg = getMapPresetConfig(nextState);
    const minKeeps =
      nextState.houseOrder.length <= 4 ? cfg.supremacyMinKeeps4 : cfg.supremacyMinKeeps5;
    const totalOwnedKeeps = living.reduce(
      (sum, hid) => sum + getHouseKeeps(nextState, hid).length,
      0,
    );
    if (totalOwnedKeeps > 0) {
      for (const hid of living) {
        const count = getHouseKeeps(nextState, hid).length;
        if (count >= minKeeps && count / totalOwnedKeeps >= cfg.supremacyKeepShare) {
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

  // 5. Chronicle Score Victory
  if (
    nextState.mode === 'chronicle' &&
    isEndOfFullRound &&
    nextState.turnNumber >= nextState.chronicleLimit
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
      summary: `Chronicle complete (Turn ${nextState.chronicleLimit})! House ${winner} wins by Score.`,
      isPublic: true,
    });
  }

  return nextState;
}
