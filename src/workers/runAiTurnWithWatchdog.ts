/**
 * Marchlands (Spec v0.3) — AI Web Worker Runner with 8,000ms Watchdog
 *
 * Enforces AI_ARCHITECTURE.md §8:
 * If `runAiTurn` exceeds AI_WATCHDOG_MS (8,000ms) or errors, terminate the
 * worker, discard partial results, log an `ai_watchdog_timeout` ChronicleEvent,
 * end that House's turn with no AI actions, and advance cleanly.
 */

import type { GameState, HouseId } from '../types/game.ts';
import { AI_WATCHDOG_MS, HOUSES } from '../data/index.ts';
import { appendChronicle } from '../engine/stateHelpers.ts';
import { endHouseTurn } from '../engine/turn.ts';
import { runAiTurn } from '../engine/utilityAi.ts';
import type { AiWorkerRequest, AiWorkerResponse } from './aiWorker.ts';

export interface WatchdogAiResult {
  readonly state: GameState;
  readonly timedOut: boolean;
}

let activeWorker: Worker | null = null;
let nextRequestId = 1;

function getOrCreateWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!activeWorker) {
    activeWorker = new Worker(new URL('./aiWorker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return activeWorker;
}

export function terminateAiWorker(): void {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }
}

/**
 * Fallback helper when an AI turn exceeds the watchdog timeout or crashes:
 * discards partial state, logs `ai_watchdog_timeout`, and ends the turn.
 */
export function buildWatchdogTimeoutState(state: GameState, houseId: HouseId): GameState {
  const houseName = HOUSES[houseId]?.name ?? houseId;
  const withLog = appendChronicle(state, {
    type: 'ai_watchdog_timeout',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey: null,
    summary: `${houseName} hesitated in council (AI watchdog timeout); their turn ended without action.`,
    isPublic: true,
  });
  return endHouseTurn(withLog);
}

/**
 * Executes a single AI House turn inside the Web Worker bounded by `timeoutMs`
 * (default `AI_WATCHDOG_MS = 8000`).
 */
export function runAiTurnWithWatchdog(
  state: GameState,
  houseId: HouseId,
  timeoutMs = AI_WATCHDOG_MS,
): Promise<WatchdogAiResult> {
  const worker = getOrCreateWorker();
  if (!worker) {
    // Headless / test environment fallback without Web Worker support
    return Promise.resolve({
      state: runAiTurn(state, houseId),
      timedOut: false,
    });
  }

  return new Promise<WatchdogAiResult>((resolve) => {
    const requestId = nextRequestId++;
    let settled = false;

    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      clearTimeout(timer);
    };

    const failAndAdvance = () => {
      if (settled) return;
      settled = true;
      cleanup();
      terminateAiWorker();
      resolve({
        state: buildWatchdogTimeoutState(state, houseId),
        timedOut: true,
      });
    };

    const handleMessage = (event: MessageEvent<AiWorkerResponse>) => {
      if (settled) return;
      if (event.data.requestId !== requestId) return;
      settled = true;
      cleanup();
      if (event.data.state) {
        resolve({ state: event.data.state, timedOut: false });
      } else {
        terminateAiWorker();
        resolve({
          state: buildWatchdogTimeoutState(state, houseId),
          timedOut: true,
        });
      }
    };

    const handleError = () => {
      failAndAdvance();
    };

    const timer = setTimeout(() => {
      failAndAdvance();
    }, timeoutMs);

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    const req: AiWorkerRequest = { requestId, state, houseId };
    worker.postMessage(req);
  });
}
