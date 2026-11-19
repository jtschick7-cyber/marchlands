/**
 * Marchlands (Spec v0.3) — Dedicated AI Web Worker
 *
 * Runs `runAiTurn` off the main UI thread so 60fps pan/zoom and touch
 * responsiveness are preserved during AI turns.
 */

import type { GameState, HouseId } from '../types/game.ts';
import { runAiTurn } from '../engine/utilityAi.ts';

export interface AiWorkerRequest {
  readonly requestId: number;
  readonly state: GameState;
  readonly houseId: HouseId;
}

export interface AiWorkerResponse {
  readonly requestId: number;
  readonly state?: GameState;
  readonly error?: string;
}

self.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const { requestId, state, houseId } = event.data;
  try {
    const nextState = runAiTurn(state, houseId);
    const response: AiWorkerResponse = { requestId, state: nextState };
    self.postMessage(response);
  } catch (err) {
    const response: AiWorkerResponse = {
      requestId,
      error: err instanceof Error ? err.message : 'AI worker error',
    };
    self.postMessage(response);
  }
};
