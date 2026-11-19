/**
 * Marchlands (Spec v0.3) — Tier-2 Keep Specializations & Royal Decree Drafting
 */

import type {
  DecreeCategory,
  DecreeId,
  GameState,
  HouseId,
  HouseState,
  KeepSpecialization,
} from '../types/game.ts';
import {
  DECREE_IDS,
  DECREES,
  DRAFT_CATEGORY_FALLBACK_ORDER,
  EXHAUSTED_POOL_COIN,
  EXHAUSTED_POOL_MATERIALS,
  KEEP_GARRISON_MAX_HP,
  KEEP_SPECIALIZATIONS,
} from '../data/index.ts';
import { autoRehomeOrphans } from './capture.ts';
import { recomputeHouseFog } from './fog.ts';
import { pickOne } from './prng.ts';
import { appendChronicle } from './stateHelpers.ts';

/**
 * Returns all unowned eligible decrees for `house`, honoring `excludedHouseIds`.
 */
export function getEligibleUnownedDecrees(house: HouseState): DecreeId[] {
  return DECREE_IDS.filter(
    (id) =>
      !house.decreeIds.includes(id) &&
      !(DECREES[id].excludedHouseIds?.includes(house.id) ?? false),
  );
}

/**
 * Ruling 5.1 (Draft Category Guarantee):
 * Draws up to 3 unowned eligible decrees: 1 Infrastructure, 1 Military, 1 Doctrine.
 * When a category is exhausted, fills from remaining categories in priority order
 * Doctrine -> Infrastructure -> Military, with zero duplicates in one hand.
 */
export function rollDraftHand(
  state: GameState,
  houseId: HouseId,
): { hand: DecreeId[]; nextRngCounter: number } {
  const house = state.houses[houseId];
  if (!house) return { hand: [], nextRngCounter: state.rngCounter };

  const eligible = getEligibleUnownedDecrees(house);
  if (eligible.length === 0) {
    return { hand: [], nextRngCounter: state.rngCounter };
  }

  const byCat: Record<DecreeCategory, DecreeId[]> = {
    infrastructure: [],
    military: [],
    doctrine: [],
  };
  for (const id of eligible) {
    byCat[DECREES[id].category].push(id);
  }

  const hand: DecreeId[] = [];
  let counter = state.rngCounter;

  const takeFromCategory = (cat: DecreeCategory): boolean => {
    const pool = byCat[cat];
    if (pool.length === 0) return false;
    const draw = pickOne(state.rngSeed, counter, pool);
    counter = draw.nextCounter;
    hand.push(draw.value);
    const idx = pool.indexOf(draw.value);
    if (idx >= 0) pool.splice(idx, 1);
    return true;
  };

  const primarySlots: readonly DecreeCategory[] = ['infrastructure', 'military', 'doctrine'];
  for (const slot of primarySlots) {
    if (takeFromCategory(slot)) continue;
    // Fallback order: Doctrine -> Infrastructure -> Military
    for (const fb of DRAFT_CATEGORY_FALLBACK_ORDER) {
      if (takeFromCategory(fb)) break;
    }
  }

  return { hand, nextRngCounter: counter };
}

/**
 * Opens the next pending modal for a human House in canonical priority:
 * 1. pendingEventChoice -> 'event_modal'
 * 2. pendingSpecializationKeepIds -> 'specialization_modal'
 * 3. pendingDraftCount -> 'draft_modal' (or auto-Windfall if pool exhausted)
 * 4. Otherwise -> 'player_command' (or 'ai_turn' for AI).
 */
export function openNextPendingModal(state: GameState, houseId: HouseId): GameState {
  if (state.phase === 'game_over') return state;
  const house = state.houses[houseId];
  if (!house || house.isEliminated) return state;

  if (!house.isHuman) {
    return { ...state, phase: 'ai_turn' };
  }

  if (state.pendingEventChoice && state.pendingEventChoice.houseId === houseId) {
    return { ...state, phase: 'event_modal' };
  }

  if (house.pendingSpecializationKeepIds.length > 0) {
    return { ...state, phase: 'specialization_modal' };
  }

  if (house.pendingDraftCount > 0) {
    if (state.pendingDraftChoices && state.pendingDraftChoices.length > 0) {
      return { ...state, phase: 'draft_modal' };
    }

    const eligible = getEligibleUnownedDecrees(house);
    if (eligible.length === 0) {
      // Ruling 5.2: Exhausted eligible pool -> Royal Treasury Windfall (+15 Coin, +10 Mat per trigger)
      const count = house.pendingDraftCount;
      const updatedHouse: HouseState = {
        ...house,
        pendingDraftCount: 0,
        resources: {
          materials: house.resources.materials + EXHAUSTED_POOL_MATERIALS * count,
          coin: house.resources.coin + EXHAUSTED_POOL_COIN * count,
        },
      };
      return {
        ...state,
        phase: 'player_command',
        pendingDraftChoices: null,
        houses: { ...state.houses, [houseId]: updatedHouse },
      };
    }

    const { hand, nextRngCounter } = rollDraftHand(state, houseId);
    return {
      ...state,
      phase: 'draft_modal',
      rngCounter: nextRngCounter,
      pendingDraftChoices: hand,
    };
  }

  return {
    ...state,
    phase: 'player_command',
    pendingDraftChoices: null,
  };
}

/**
 * Ruling 1.4: Permanently applies a Tier-2 Keep specialization.
 */
export function applyKeepSpecialization(
  state: GameState,
  houseId: HouseId,
  keepId: string,
  specialization: Exclude<KeepSpecialization, 'none'>,
): GameState {
  const house = state.houses[houseId];
  const keep = state.keeps[keepId];
  if (!house || !keep || keep.ownerHouseId !== houseId || keep.tier !== 2) {
    return state;
  }
  if (keep.specialization !== 'none') return state;

  const specDef = KEEP_SPECIALIZATIONS[specialization];
  const hpBonus = specialization === 'garrison' ? KEEP_GARRISON_MAX_HP - keep.maxKeepHp : 0;

  const updatedKeep = {
    ...keep,
    specialization,
    maxKeepHp: specDef.maxKeepHp,
    keepHp: Math.min(specDef.maxKeepHp, keep.keepHp + hpBonus),
  };

  const remainingPending = house.pendingSpecializationKeepIds.filter((id) => id !== keepId);

  let nextState: GameState = {
    ...state,
    keeps: {
      ...state.keeps,
      [keepId]: updatedKeep,
    },
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        pendingSpecializationKeepIds: remainingPending,
      },
    },
  };

  if (specialization === 'garrison') {
    nextState = autoRehomeOrphans(nextState, houseId);
  }

  nextState = appendChronicle(nextState, {
    type: 'keep_specialized',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey: keep.tileKey,
    summary: `${keep.name} specialized as a ${specDef.name}.`,
    isPublic: true,
  });

  if (house.isHuman) {
    nextState = openNextPendingModal(nextState, houseId);
  }

  return nextState;
}

/**
 * Enacts a selected Royal Decree from the active draft hand (or synchronous AI draft).
 */
export function selectDecree(
  state: GameState,
  houseId: HouseId,
  decreeId: DecreeId,
): GameState {
  const house = state.houses[houseId];
  if (!house || house.pendingDraftCount <= 0) return state;
  if (house.decreeIds.includes(decreeId)) return state;
  if (DECREES[decreeId].excludedHouseIds?.includes(houseId)) return state;

  if (house.isHuman && state.pendingDraftChoices && !state.pendingDraftChoices.includes(decreeId)) {
    return state;
  }

  const updatedHouse: HouseState = {
    ...house,
    decreeIds: [...house.decreeIds, decreeId],
    pendingDraftCount: house.pendingDraftCount - 1,
  };

  let nextState: GameState = {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: updatedHouse,
    },
    pendingDraftChoices: null,
  };

  if (decreeId === 'decree_highland_scouts') {
    nextState = recomputeHouseFog(nextState, houseId);
  }

  nextState = appendChronicle(nextState, {
    type: 'decree_enacted',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey: null,
    summary: `House ${houseId} enacted ${DECREES[decreeId].title}.`,
    isPublic: false,
  });

  if (house.isHuman) {
    nextState = openNextPendingModal(nextState, houseId);
  }

  return nextState;
}
