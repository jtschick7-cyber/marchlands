/**
 * Marchlands (Spec v0.3) — The Crown: Royal Favor, Writs, Audience & Regent's Mandate
 */

import type { ActiveWrit, GameState, HouseId, WritId } from '../types/game.ts';
import {
  AUDIENCE_GRANT_AMOUNT,
  AUDIENCE_GRANT_FAVOR,
  AUDIENCE_PETITION_FAVOR,
  AUDIENCE_REROLL_FAVOR,
  CHRONICLE_TURN_LIMIT,
  CROWN_WRITS,
  MANDATE_COOLDOWN_TURNS,
  MANDATE_HOLD_TURNS,
  MANDATE_MIN_FAVOR,
  MANDATE_MIN_KEEPS,
  WRIT_BATCH_SIZE,
  WRIT_IDS,
  WRIT_INTERVAL_TURNS,
  WRIT_NO_REPEAT_PUBLICATIONS,
} from '../data/index.ts';
import { openNextPendingModal, rollDraftHand } from './draftAndSpec.ts';
import { shuffleArray } from './prng.ts';
import {
  addFavor,
  addLifetimeCoin,
  appendChronicle,
  getHouseKeeps,
  getHouseUnits,
} from './stateHelpers.ts';

/**
 * Publishes 3 new Crown Writs at Turn 3 and every 6 turns thereafter.
 * Suppressed on Turn 33 in Chronicle mode so Turn 27 Writs remain active through finale.
 */
export function publishCrownWrits(state: GameState): GameState {
  if (state.turnNumber !== state.crown.nextWritTurn) return state;
  if (state.mode === 'chronicle' && state.turnNumber === CHRONICLE_TURN_LIMIT) {
    return state;
  }

  const recentSet = new Set<WritId>(state.crown.recentWritIds);
  let pool = WRIT_IDS.filter((id) => !recentSet.has(id));
  if (pool.length < WRIT_BATCH_SIZE) {
    pool = [...WRIT_IDS];
  }

  const shuffled = shuffleArray(state.rngSeed, state.rngCounter, pool);
  const chosen = shuffled.value.slice(0, WRIT_BATCH_SIZE);

  const activeWrits: ActiveWrit[] = chosen.map((writId) => ({
    writId,
    publishedTurn: state.turnNumber,
    completedByHouseId: null,
  }));

  const maxRecent = WRIT_BATCH_SIZE * WRIT_NO_REPEAT_PUBLICATIONS;
  const nextRecent = [...state.crown.recentWritIds, ...chosen].slice(-maxRecent);

  // Reset per-window writProgress on all Houses
  const nextHouses = { ...state.houses };
  for (const hid of state.houseOrder) {
    const h = nextHouses[hid];
    if (h) {
      nextHouses[hid] = { ...h, writProgress: {} };
    }
  }

  let nextState: GameState = {
    ...state,
    rngCounter: shuffled.nextCounter,
    houses: nextHouses,
    crown: {
      ...state.crown,
      activeWrits,
      nextWritTurn: state.turnNumber + WRIT_INTERVAL_TURNS,
      recentWritIds: nextRecent,
    },
  };

  const titles = chosen.map((id) => CROWN_WRITS[id].title).join(', ');
  nextState = appendChronicle(nextState, {
    type: 'writ_published',
    actorHouseId: null,
    targetHouseId: null,
    tileKey: null,
    summary: `Crown Writs published: ${titles}.`,
    isPublic: true,
  });

  return nextState;
}

function isWritConditionMet(state: GameState, houseId: HouseId, writId: WritId): boolean {
  const house = state.houses[houseId];
  if (!house || house.isEliminated) return false;

  switch (writId) {
    case 'writ_clear_camp':
      return (house.writProgress.writ_clear_camp ?? 0) >= 1;
    case 'writ_annex':
      return (house.writProgress.writ_annex ?? 0) >= 1;
    case 'writ_watch': {
      const heldWatchtowers = getHouseUnits(state, houseId).filter(
        (u) => state.tiles[u.tileKey]?.landmark === 'ancient_watchtower',
      ).length;
      return heldWatchtowers >= 2;
    }
    case 'writ_strongholds':
      return getHouseKeeps(state, houseId).filter((k) => k.tier === 2).length >= 2;
    case 'writ_victories':
      return (house.writProgress.writ_victories ?? 0) >= 3;
    case 'writ_markets': {
      const markets = Object.values(state.tiles).filter(
        (t) => t.ownerHouseId === houseId && t.improvement === 'market',
      ).length;
      return markets >= 2;
    }
    case 'writ_relics':
      return (house.writProgress.writ_relics ?? 0) >= 2;
    case 'writ_muster':
      return getHouseUnits(state, houseId).length >= 6;
    case 'writ_tithe':
      return false; // Voluntary action via payRegentsTithe
    case 'writ_iron': {
      const mines = Object.values(state.tiles).filter(
        (t) =>
          t.ownerHouseId === houseId &&
          (t.improvement === 'iron_mine' || t.improvement === 'deep_smeltery'),
      ).length;
      return mines >= 2;
    }
    case 'writ_raze':
      return (house.writProgress.writ_raze ?? 0) >= 1;
    case 'writ_capture':
      return (house.writProgress.writ_capture ?? 0) >= 1;
  }
}

/**
 * Checks all uncompleted active Writs at the end of `houseId`'s turn.
 */
export function checkWritCompletion(state: GameState, houseId: HouseId): GameState {
  const house = state.houses[houseId];
  if (!house || house.isEliminated) return state;

  let nextState = state;
  const updatedWrits = [...state.crown.activeWrits];
  let anyCompleted = false;

  for (let i = 0; i < updatedWrits.length; i++) {
    const w = updatedWrits[i]!;
    if (w.completedByHouseId !== null) continue;
    if (!isWritConditionMet(nextState, houseId, w.writId)) continue;

    const def = CROWN_WRITS[w.writId];
    updatedWrits[i] = { ...w, completedByHouseId: houseId };
    anyCompleted = true;

    let currHouse = nextState.houses[houseId]!;
    currHouse = addFavor(currHouse, def.rewardFavor);
    currHouse = addLifetimeCoin(currHouse, def.rewardCoin);
    currHouse = {
      ...currHouse,
      resources: {
        ...currHouse.resources,
        materials: currHouse.resources.materials + def.rewardMaterials,
      },
    };

    nextState = {
      ...nextState,
      houses: { ...nextState.houses, [houseId]: currHouse },
      crown: { ...nextState.crown, activeWrits: updatedWrits },
    };

    nextState = appendChronicle(nextState, {
      type: 'writ_completed',
      actorHouseId: houseId,
      targetHouseId: null,
      tileKey: null,
      summary: `House ${houseId} fulfilled "${def.title}" (+${def.rewardFavor} Favor).`,
      isPublic: true,
    });
  }

  return anyCompleted ? nextState : state;
}

/**
 * Voluntary action for `writ_tithe`: pay 20 Coin -> +3 Favor.
 */
export function canPayRegentsTithe(state: GameState, houseId: HouseId): boolean {
  const house = state.houses[houseId];
  if (!house || house.isEliminated) return false;
  const writ = state.crown.activeWrits.find(
    (w) => w.writId === 'writ_tithe' && w.completedByHouseId === null,
  );
  if (!writ) return false;
  return house.resources.coin >= CROWN_WRITS.writ_tithe.titheCoinCost;
}

export function payRegentsTithe(state: GameState, houseId: HouseId): GameState {
  if (!canPayRegentsTithe(state, houseId)) return state;
  const def = CROWN_WRITS.writ_tithe;
  let house = state.houses[houseId]!;
  house = {
    ...house,
    resources: { ...house.resources, coin: house.resources.coin - def.titheCoinCost },
  };
  house = addFavor(house, def.rewardFavor);

  const updatedWrits = state.crown.activeWrits.map((w) =>
    w.writId === 'writ_tithe' ? { ...w, completedByHouseId: houseId } : w,
  );

  let nextState: GameState = {
    ...state,
    houses: { ...state.houses, [houseId]: house },
    crown: { ...state.crown, activeWrits: updatedWrits },
  };

  nextState = appendChronicle(nextState, {
    type: 'writ_completed',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey: null,
    summary: `House ${houseId} paid the Regent's Tithe (+${def.rewardFavor} Favor).`,
    isPublic: true,
  });

  return nextState;
}

// ============================================================================
// Crown Audience Actions (Max 1/turn per House)
// ============================================================================

export function performRoyalReroll(state: GameState, houseId: HouseId): GameState {
  const house = state.houses[houseId];
  if (
    !house ||
    house.audienceUsedThisTurn ||
    house.favor < AUDIENCE_REROLL_FAVOR ||
    state.pendingDraftChoices === null
  ) {
    return state;
  }

  const { hand, nextRngCounter } = rollDraftHand(state, houseId);
  return {
    ...state,
    rngCounter: nextRngCounter,
    pendingDraftChoices: hand,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        favor: house.favor - AUDIENCE_REROLL_FAVOR,
        audienceUsedThisTurn: true,
      },
    },
  };
}

export function performPetitionCharter(state: GameState, houseId: HouseId): GameState {
  const house = state.houses[houseId];
  if (!house || house.audienceUsedThisTurn || house.favor < AUDIENCE_PETITION_FAVOR) {
    return state;
  }

  let nextState: GameState = {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        favor: house.favor - AUDIENCE_PETITION_FAVOR,
        audienceUsedThisTurn: true,
        pendingDraftCount: house.pendingDraftCount + 1,
      },
    },
  };

  if (house.isHuman) {
    nextState = openNextPendingModal(nextState, houseId);
  }
  return nextState;
}

export function performCrownGrant(
  state: GameState,
  houseId: HouseId,
  resource: 'materials' | 'coin',
): GameState {
  const house = state.houses[houseId];
  if (!house || house.audienceUsedThisTurn || house.favor < AUDIENCE_GRANT_FAVOR) {
    return state;
  }

  let updatedHouse = {
    ...house,
    favor: house.favor - AUDIENCE_GRANT_FAVOR,
    audienceUsedThisTurn: true,
  };

  if (resource === 'materials') {
    updatedHouse = {
      ...updatedHouse,
      resources: {
        ...updatedHouse.resources,
        materials: updatedHouse.resources.materials + AUDIENCE_GRANT_AMOUNT,
      },
    };
  } else {
    updatedHouse = addLifetimeCoin(updatedHouse, AUDIENCE_GRANT_AMOUNT);
  }

  let nextState: GameState = {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: updatedHouse,
    },
  };

  if (updatedHouse.isHuman && updatedHouse.pendingDraftCount > 0) {
    nextState = openNextPendingModal(nextState, houseId);
  }

  return nextState;
}

// ============================================================================
// Regent's Mandate (Dominion Mode Only)
// ============================================================================

export function evaluateRegentsMandate(state: GameState, houseId: HouseId): GameState {
  if (state.mode !== 'dominion' || state.phase === 'game_over') return state;
  const house = state.houses[houseId];
  if (!house || house.isEliminated) return state;

  const keepCount = getHouseKeeps(state, houseId).length;
  const qualifies = house.favor >= MANDATE_MIN_FAVOR && keepCount >= MANDATE_MIN_KEEPS;

  if (state.crown.claimantHouseId === houseId) {
    if (!qualifies) {
      let nextState: GameState = {
        ...state,
        crown: {
          ...state.crown,
          claimantHouseId: null,
          claimStartTurn: null,
          claimCooldowns: {
            ...state.crown.claimCooldowns,
            [houseId]: state.turnNumber + MANDATE_COOLDOWN_TURNS,
          },
        },
      };
      nextState = appendChronicle(nextState, {
        type: 'mandate_broken',
        actorHouseId: houseId,
        targetHouseId: null,
        tileKey: null,
        summary: `House ${houseId}'s claim to the Regent's Mandate has broken!`,
        isPublic: true,
      });
      return nextState;
    }

    const startTurn = state.crown.claimStartTurn ?? state.turnNumber;
    if (state.turnNumber - startTurn >= MANDATE_HOLD_TURNS) {
      let nextState: GameState = {
        ...state,
        winnerHouseId: houseId,
        victoryType: 'mandate',
        phase: 'game_over',
      };
      nextState = appendChronicle(nextState, {
        type: 'mandate_won',
        actorHouseId: houseId,
        targetHouseId: null,
        tileKey: null,
        summary: `House ${houseId} has secured the Regent's Mandate and rules the Marchlands!`,
        isPublic: true,
      });
      return nextState;
    }

    return state;
  }

  // No current claimant: check if houseId claims now
  if (state.crown.claimantHouseId === null && qualifies) {
    const cooldownUntil = state.crown.claimCooldowns[houseId] ?? 0;
    if (state.turnNumber >= cooldownUntil) {
      let nextState: GameState = {
        ...state,
        crown: {
          ...state.crown,
          claimantHouseId: houseId,
          claimStartTurn: state.turnNumber,
        },
      };
      nextState = appendChronicle(nextState, {
        type: 'mandate_claimed',
        actorHouseId: houseId,
        targetHouseId: null,
        tileKey: null,
        summary: `House ${houseId} has claimed the Regent's Mandate! Hold for 3 turns to win.`,
        isPublic: true,
      });
      return nextState;
    }
  }

  return state;
}
