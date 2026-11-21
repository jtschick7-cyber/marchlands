/**
 * Marchlands (Spec v2.0) — The Crown: Royal Favor, Writs, Audience & Regent's Mandate
 */

import type { ActiveWrit, GameState, HouseId, HouseState, WritId } from '../types/game.ts';
import {
  AUDIENCE_GRANT_AMOUNT,
  AUDIENCE_GRANT_FAVOR,
  AUDIENCE_IRON_AMOUNT,
  AUDIENCE_IRON_FAVOR,
  AUDIENCE_PETITION_FAVOR,
  AUDIENCE_REROLL_FAVOR,
  CROWN_WRITS,
  DECREES,
  MANDATE_COOLDOWN_TURNS,
  WRIT_BATCH_SIZE,
  WRIT_IDS,
  WRIT_INTERVAL_TURNS,
  WRIT_NO_REPEAT_PUBLICATIONS,
} from '../data/index.ts';
import { openNextPendingModal, rollDraftHand } from './draftAndSpec.ts';
import { shuffleArray } from './prng.ts';
import { getIndexedHouseTiles } from './spatialIndex.ts';
import {
  addFavor,
  addLifetimeCoin,
  appendChronicle,
  getHouseKeeps,
  getHouseUnits,
  getMapPresetConfig,
  houseHasDecree,
} from './stateHelpers.ts';

export function getAudienceCost(house: HouseState | undefined, baseCost: number): number {
  return houseHasDecree(house, 'decree_regents_envoy') ? Math.max(1, baseCost - 1) : baseCost;
}

export function publishCrownWrits(state: GameState): GameState {
  if (state.turnNumber !== state.crown.nextWritTurn) return state;
  if (state.mode === 'chronicle' && state.turnNumber >= state.chronicleLimit) {
    return state;
  }

  const recentSet = new Set<WritId>(state.crown.recentWritIds);
  let pool = WRIT_IDS.filter((id) => !recentSet.has(id));
  if (pool.length < WRIT_BATCH_SIZE) pool = [...WRIT_IDS];

  const shuffled = shuffleArray(state.rngSeed, state.rngCounter, pool);
  const chosen = shuffled.value.slice(0, WRIT_BATCH_SIZE);

  const activeWrits: ActiveWrit[] = chosen.map((writId) => ({
    writId,
    publishedTurn: state.turnNumber,
    completedByHouseId: null,
  }));

  const maxRecent = WRIT_BATCH_SIZE * WRIT_NO_REPEAT_PUBLICATIONS;
  const nextRecent = [...state.crown.recentWritIds, ...chosen].slice(-maxRecent);

  const nextHouses = { ...state.houses };
  for (const hid of state.houseOrder) {
    const h = nextHouses[hid];
    if (h) nextHouses[hid] = { ...h, writProgress: {} };
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
    case 'writ_watch':
      return (
        getHouseUnits(state, houseId).filter(
          (u) => state.tiles[u.tileKey]?.landmark === 'ancient_watchtower',
        ).length >= 2
      );
    case 'writ_strongholds':
      return getHouseKeeps(state, houseId).filter((k) => k.tier >= 2).length >= 2;
    case 'writ_victories':
      return (house.writProgress.writ_victories ?? 0) >= 3;
    case 'writ_markets':
      return (
        getIndexedHouseTiles(state, houseId).filter((t) => t.improvement === 'market').length >= 2
      );
    case 'writ_relics':
      return (house.writProgress.writ_relics ?? 0) >= 2;
    case 'writ_muster':
      return getHouseUnits(state, houseId).length >= 8;
    case 'writ_tithe':
      return false;
    case 'writ_iron':
      return (
        getIndexedHouseTiles(state, houseId).filter(
          (t) => t.improvement === 'iron_mine' || t.improvement === 'deep_smeltery',
        ).length >= 2
      );
    case 'writ_raze':
      return (house.writProgress.writ_raze ?? 0) >= 1;
    case 'writ_capture':
      return (house.writProgress.writ_capture ?? 0) >= 1;
  }
}

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
    const favorGain = houseHasDecree(currHouse, 'decree_regents_envoy')
      ? Math.ceil(def.rewardFavor * 1.5)
      : def.rewardFavor;
    currHouse = addFavor(currHouse, favorGain);
    currHouse = addLifetimeCoin(currHouse, def.rewardCoin);
    currHouse = {
      ...currHouse,
      resources: {
        ...currHouse.resources,
        materials: currHouse.resources.materials + def.rewardMaterials,
        iron: currHouse.resources.iron + def.rewardIron,
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
      summary: `House ${houseId} fulfilled "${def.title}" (+${favorGain} Favor${def.rewardIron > 0 ? `, +${def.rewardIron} Iron` : ''}).`,
      isPublic: true,
    });
  }

  return anyCompleted ? nextState : state;
}

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
  const favorGain = houseHasDecree(house, 'decree_regents_envoy')
    ? Math.ceil(def.rewardFavor * 1.5)
    : def.rewardFavor;
  house = {
    ...house,
    resources: { ...house.resources, coin: house.resources.coin - def.titheCoinCost },
  };
  house = addFavor(house, favorGain);

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
    summary: `House ${houseId} paid the Regent's Tithe (+${favorGain} Favor).`,
    isPublic: true,
  });

  return nextState;
}

export function performRoyalReroll(state: GameState, houseId: HouseId): GameState {
  const house = state.houses[houseId];
  const cost = getAudienceCost(house, AUDIENCE_REROLL_FAVOR);
  if (
    !house ||
    house.audienceUsedThisTurn ||
    house.favor < cost ||
    state.pendingDraftChoices === null ||
    state.pendingDraftChoices.length === 0
  ) {
    return state;
  }

  const currentPairId = DECREES[state.pendingDraftChoices[0]!].pairId;
  const { hand, nextRngCounter } = rollDraftHand(state, houseId, currentPairId);
  return {
    ...state,
    rngCounter: nextRngCounter,
    pendingDraftChoices: hand,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        favor: house.favor - cost,
        audienceUsedThisTurn: true,
      },
    },
  };
}

export function performPetitionCharter(state: GameState, houseId: HouseId): GameState {
  const house = state.houses[houseId];
  const cost = getAudienceCost(house, AUDIENCE_PETITION_FAVOR);
  if (!house || house.audienceUsedThisTurn || house.favor < cost) {
    return state;
  }

  let nextState: GameState = {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        favor: house.favor - cost,
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
  resource: 'materials' | 'coin' | 'iron',
): GameState {
  const house = state.houses[houseId];
  const baseCost = resource === 'iron' ? AUDIENCE_IRON_FAVOR : AUDIENCE_GRANT_FAVOR;
  const cost = getAudienceCost(house, baseCost);
  if (!house || house.audienceUsedThisTurn || house.favor < cost) {
    return state;
  }

  let updatedHouse = {
    ...house,
    favor: house.favor - cost,
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
  } else if (resource === 'iron') {
    updatedHouse = {
      ...updatedHouse,
      resources: {
        ...updatedHouse.resources,
        iron: updatedHouse.resources.iron + AUDIENCE_IRON_AMOUNT,
      },
    };
  } else {
    updatedHouse = addLifetimeCoin(updatedHouse, AUDIENCE_GRANT_AMOUNT);
  }

  let nextState: GameState = {
    ...state,
    houses: { ...state.houses, [houseId]: updatedHouse },
  };

  if (updatedHouse.isHuman && updatedHouse.pendingDraftCount > 0) {
    nextState = openNextPendingModal(nextState, houseId);
  }
  return nextState;
}

export function evaluateRegentsMandate(state: GameState, houseId: HouseId): GameState {
  if (state.mode !== 'dominion' || state.phase === 'game_over') return state;
  const house = state.houses[houseId];
  if (!house || house.isEliminated) return state;

  const cfg = getMapPresetConfig(state);
  const keeps = getHouseKeeps(state, houseId);
  const tier3Count = keeps.filter((k) => k.tier === 3).length;
  const qualifies =
    house.favor >= cfg.mandateMinFavor &&
    keeps.length >= cfg.mandateMinKeeps &&
    tier3Count >= cfg.mandateMinTier3Citadels;

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
    if (state.turnNumber - startTurn >= cfg.mandateHoldTurns) {
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
        summary: `House ${houseId} claimed the Regent's Mandate! Hold for ${cfg.mandateHoldTurns} turns to win.`,
        isPublic: true,
      });
      return nextState;
    }
  }

  return state;
}
