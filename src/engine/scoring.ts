/**
 * Marchlands (Spec v0.3) — Chronicle & Live HUD Scoring Engine
 *
 * Pure function reading house.stats counters directly (BALANCE_MODEL.md §6).
 */

import type { GameState, HouseId } from '../types/game.ts';
import {
  SCORE_COIN_PER_TREASURY_PT,
  SCORE_PER_CAMP,
  SCORE_PER_DECREE,
  SCORE_PER_KEEP,
  SCORE_PER_KEEP_CAPTURED,
  SCORE_PER_LIFETIME_FAVOR,
  SCORE_PER_RUIN,
  SCORE_PER_TIER2_KEEP_EXTRA,
  SCORE_PER_TILE,
  SCORE_PER_UNIT_DESTROYED,
  SCORE_PER_WATCHTOWER,
  SCORE_TILES_PER_EXPLORATION_PT,
} from '../data/index.ts';
import { getHouseKeeps } from './stateHelpers.ts';

export interface ScoreBreakdown {
  readonly territory: number;
  readonly keeps: number;
  readonly decrees: number;
  readonly military: number;
  readonly exploration: number;
  readonly landmarks: number;
  readonly crown: number;
  readonly treasury: number;
  readonly total: number;
}

export function computeScore(
  state: GameState,
  houseId: HouseId,
  isGameEnd = false,
): ScoreBreakdown {
  const house = state.houses[houseId];
  if (!house) {
    return {
      territory: 0,
      keeps: 0,
      decrees: 0,
      military: 0,
      exploration: 0,
      landmarks: 0,
      crown: 0,
      treasury: 0,
      total: 0,
    };
  }

  let ownedTiles = 0;
  for (const tile of Object.values(state.tiles)) {
    if (tile.ownerHouseId === houseId) ownedTiles += 1;
  }

  const keepsList = getHouseKeeps(state, houseId);
  const tier2Count = keepsList.filter((k) => k.tier === 2).length;

  const territory = ownedTiles * SCORE_PER_TILE;
  const keeps = keepsList.length * SCORE_PER_KEEP + tier2Count * SCORE_PER_TIER2_KEEP_EXTRA;
  const decrees =
    Math.max(0, house.decreeIds.length - house.startingDecreeCount) * SCORE_PER_DECREE;
  const military =
    house.stats.unitsDestroyed * SCORE_PER_UNIT_DESTROYED +
    house.stats.keepsCaptured * SCORE_PER_KEEP_CAPTURED;
  const exploration = Math.floor(house.stats.tilesRevealed / SCORE_TILES_PER_EXPLORATION_PT);
  const landmarks =
    house.stats.ruinsExplored * SCORE_PER_RUIN +
    house.stats.campsCleared * SCORE_PER_CAMP +
    house.stats.watchtowersReached * SCORE_PER_WATCHTOWER;
  const crown = house.stats.lifetimeFavor * SCORE_PER_LIFETIME_FAVOR;
  const treasury = isGameEnd
    ? Math.floor(house.resources.coin / SCORE_COIN_PER_TREASURY_PT)
    : 0;

  return {
    territory,
    keeps,
    decrees,
    military,
    exploration,
    landmarks,
    crown,
    treasury,
    total:
      territory + keeps + decrees + military + exploration + landmarks + crown + treasury,
  };
}

/**
 * Ranks Houses in descending order of score, breaking ties deterministically:
 * More Keeps -> higher lifetimeCoinEarned -> House turn order.
 */
export function rankHousesByScore(
  state: GameState,
  isGameEnd = true,
  onlyLiving = false,
): HouseId[] {
  const list = state.houseOrder.filter((id) => !onlyLiving || !state.houses[id]?.isEliminated);
  const scores: Record<string, number> = {};
  const keepCounts: Record<string, number> = {};
  for (const id of list) {
    scores[id] = computeScore(state, id, isGameEnd).total;
    keepCounts[id] = getHouseKeeps(state, id).length;
  }

  return [...list].sort((a, b) => {
    const scoreDiff = (scores[b] ?? 0) - (scores[a] ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const keepDiff = (keepCounts[b] ?? 0) - (keepCounts[a] ?? 0);
    if (keepDiff !== 0) return keepDiff;
    const coinDiff =
      (state.houses[b]?.lifetimeCoinEarned ?? 0) - (state.houses[a]?.lifetimeCoinEarned ?? 0);
    if (coinDiff !== 0) return coinDiff;
    return state.houseOrder.indexOf(a) - state.houseOrder.indexOf(b);
  });
}
