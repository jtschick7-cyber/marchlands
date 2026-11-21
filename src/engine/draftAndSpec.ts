/**
 * Marchlands (Spec v2.0) — Exclusive Doctrine Pairs, Tier-2 Specializations,
 * Tier-3 Citadel Charters, Branching Battle Honors & Commander Marshal Traits
 */

import type {
  BattleHonorId,
  CitadelCharter,
  CommanderTraitId,
  DecreeId,
  DecreePairId,
  GameState,
  HouseId,
  HouseState,
  KeepSpecialization,
} from '../types/game.ts';
import {
  BATTLE_HONORS,
  CITADEL_CHARTERS,
  COMMANDER_TRAITS,
  DECREE_PAIR_IDS,
  DECREE_PAIRS,
  DECREES,
  EXHAUSTED_POOL_COIN,
  EXHAUSTED_POOL_IRON,
  EXHAUSTED_POOL_MATERIALS,
  IMPROVEMENTS,
  KEEP_SPECIALIZATIONS,
  KEEP_STONE_CURTAIN_HP_MULT,
  PALISADE_LV2_HP,
  UNITS,
  WATCHTOWER_LV2_HP,
  getBattleHonorChoices,
  getCommanderTraitChoicesForLevel,
} from '../data/index.ts';
import { autoRehomeOrphans } from './capture.ts';
import { recomputeHouseFog } from './fog.ts';
import { pickOne } from './prng.ts';
import { getIndexedHouseTiles, getIndexedKeepTiles } from './spatialIndex.ts';
import { appendChronicle, computeKeepMaxHp, getHouseKeeps } from './stateHelpers.ts';

/**
 * Returns all unclaimed Doctrine Pairs (neither side enacted nor locked).
 */
export function getUnclaimedDoctrinePairs(house: HouseState): DecreePairId[] {
  return DECREE_PAIR_IDS.filter((pairId) => {
    const [a, b] = DECREE_PAIRS[pairId].options;
    return (
      !house.decreeIds.includes(a) &&
      !house.decreeIds.includes(b) &&
      !house.lockedDecreeIds.includes(a) &&
      !house.lockedDecreeIds.includes(b)
    );
  });
}

export function getEligibleUnownedDecrees(house: HouseState): DecreeId[] {
  const out: DecreeId[] = [];
  for (const pairId of getUnclaimedDoctrinePairs(house)) {
    const [a, b] = DECREE_PAIRS[pairId].options;
    out.push(a, b);
  }
  return out;
}

/**
 * Draws one unclaimed Doctrine Pair (presenting its 2 mutually exclusive options [A, B]).
 * If `excludePairId` is provided (e.g. Royal Reroll) and another pair exists, prefers a different pair.
 */
export function rollDraftHand(
  state: GameState,
  houseId: HouseId,
  excludePairId?: DecreePairId,
): { hand: DecreeId[]; nextRngCounter: number } {
  const house = state.houses[houseId];
  if (!house) return { hand: [], nextRngCounter: state.rngCounter };

  let pairs = getUnclaimedDoctrinePairs(house);
  if (pairs.length === 0) {
    return { hand: [], nextRngCounter: state.rngCounter };
  }
  if (excludePairId && pairs.length > 1) {
    pairs = pairs.filter((p) => p !== excludePairId);
  }

  const draw = pickOne(state.rngSeed, state.rngCounter, pairs);
  const [optA, optB] = DECREE_PAIRS[draw.value].options;
  return { hand: [optA, optB], nextRngCounter: draw.nextCounter };
}

/**
 * Opens the next pending modal for a human House in canonical priority:
 * 1. event_modal -> 2. specialization_modal -> 3. citadel_modal ->
 * 4. commander_trait_modal -> 5. honor_modal -> 6. draft_modal -> 7. player_command
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

  if (house.pendingCitadelKeepIds.length > 0) {
    return { ...state, phase: 'citadel_modal' };
  }

  if (house.pendingCommanderTrait) {
    return { ...state, phase: 'commander_trait_modal' };
  }

  // Prune any dead units from pendingHonorUnitIds
  const validHonorUnits = house.pendingHonorUnitIds.filter((uid) => state.units[uid] !== undefined);
  if (validHonorUnits.length !== house.pendingHonorUnitIds.length) {
    state = {
      ...state,
      houses: {
        ...state.houses,
        [houseId]: { ...house, pendingHonorUnitIds: validHonorUnits },
      },
    };
  }
  if (validHonorUnits.length > 0) {
    return { ...state, phase: 'honor_modal' };
  }

  if (house.pendingDraftCount > 0) {
    if (state.pendingDraftChoices && state.pendingDraftChoices.length > 0) {
      return { ...state, phase: 'draft_modal' };
    }

    const pairs = getUnclaimedDoctrinePairs(house);
    if (pairs.length === 0) {
      const count = house.pendingDraftCount;
      const updatedHouse: HouseState = {
        ...house,
        pendingDraftCount: 0,
        resources: {
          materials: house.resources.materials + EXHAUSTED_POOL_MATERIALS * count,
          iron: house.resources.iron + EXHAUSTED_POOL_IRON * count,
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

export function applyKeepSpecialization(
  state: GameState,
  houseId: HouseId,
  keepId: string,
  specialization: Exclude<KeepSpecialization, 'none'>,
): GameState {
  const house = state.houses[houseId];
  const keep = state.keeps[keepId];
  if (!house || !keep || keep.ownerHouseId !== houseId || keep.tier < 2) {
    return state;
  }
  if (keep.specialization !== 'none') return state;

  const specDef = KEEP_SPECIALIZATIONS[specialization];
  const draftKeep = { ...keep, specialization };
  const newMaxHp = computeKeepMaxHp(draftKeep, house);
  const hpBonus = Math.max(0, newMaxHp - keep.maxKeepHp);

  const updatedKeep = {
    ...draftKeep,
    maxKeepHp: newMaxHp,
    keepHp: Math.min(newMaxHp, keep.keepHp + hpBonus),
  };

  const remainingPending = house.pendingSpecializationKeepIds.filter((id) => id !== keepId);

  let nextState: GameState = {
    ...state,
    keeps: { ...state.keeps, [keepId]: updatedKeep },
    houses: {
      ...state.houses,
      [houseId]: { ...house, pendingSpecializationKeepIds: remainingPending },
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

export function applyCitadelCharter(
  state: GameState,
  houseId: HouseId,
  keepId: string,
  charter: Exclude<CitadelCharter, 'none'>,
): GameState {
  const house = state.houses[houseId];
  const keep = state.keeps[keepId];
  if (!house || !keep || keep.ownerHouseId !== houseId || keep.tier !== 3) {
    return state;
  }
  if (keep.citadelCharter !== 'none') return state;

  const charterDef = CITADEL_CHARTERS[charter];
  const remainingPending = house.pendingCitadelKeepIds.filter((id) => id !== keepId);

  const nextTiles = { ...state.tiles };
  if (charter === 'royal_bastion') {
    const stoneCurtainMult = house.decreeIds.includes('decree_stone_curtain')
      ? KEEP_STONE_CURTAIN_HP_MULT
      : 1.0;
    for (const tile of getIndexedKeepTiles(state, keepId)) {
      if (tile.ownerHouseId !== houseId) continue;
      if (tile.improvement === 'palisade' && tile.improvementLevel === 1) {
        nextTiles[tile.key] = {
          ...tile,
          improvementLevel: 2,
          fortificationHp: Math.round(PALISADE_LV2_HP * stoneCurtainMult),
        };
      } else if (tile.improvement === 'watchtower' && tile.improvementLevel === 1) {
        nextTiles[tile.key] = {
          ...tile,
          improvementLevel: 2,
          fortificationHp: Math.round(WATCHTOWER_LV2_HP * stoneCurtainMult),
        };
      }
    }
  }

  let nextState: GameState = {
    ...state,
    tiles: charter === 'royal_bastion' ? nextTiles : state.tiles,
    keeps: {
      ...state.keeps,
      [keepId]: { ...keep, citadelCharter: charter },
    },
    houses: {
      ...state.houses,
      [houseId]: { ...house, pendingCitadelKeepIds: remainingPending },
    },
  };

  nextState = appendChronicle(nextState, {
    type: 'citadel_chartered',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey: keep.tileKey,
    summary: `${keep.name} established the ${charterDef.name} Citadel Charter.`,
    isPublic: true,
  });

  if (house.isHuman) {
    nextState = openNextPendingModal(nextState, houseId);
  }
  return nextState;
}

export function applyBattleHonor(
  state: GameState,
  houseId: HouseId,
  unitId: string,
  honorId: BattleHonorId,
): GameState {
  const house = state.houses[houseId];
  const unit = state.units[unitId];
  if (!house || !unit || unit.houseId !== houseId || unit.isCommander) return state;

  const def = UNITS[unit.typeId];
  if (def.unitClass === 'commander') return state;
  const honorDef = BATTLE_HONORS[honorId];
  if (honorDef.unitClass !== def.unitClass) return state;
  if (unit.battleHonors.includes(honorId)) return state;

  const targetRank = (unit.battleHonors.length + 1) as 1 | 2;
  if (targetRank > 2) return state;
  const choices = getBattleHonorChoices(def.unitClass, targetRank);
  if (!choices.includes(honorId)) return state;

  const extraHp = honorId === 'honor_bulwark' ? 4 : 0;
  const updatedUnit = {
    ...unit,
    battleHonors: [...unit.battleHonors, honorId],
    maxHp: unit.maxHp + extraHp,
    hp: Math.min(unit.maxHp + extraHp, unit.hp + extraHp),
  };

  const remaining = house.pendingHonorUnitIds.filter((id) => id !== unitId);
  let nextState: GameState = {
    ...state,
    units: { ...state.units, [unitId]: updatedUnit },
    houses: {
      ...state.houses,
      [houseId]: { ...house, pendingHonorUnitIds: remaining },
    },
  };

  if (honorId === 'honor_high_watch' || honorId === 'honor_outrider') {
    nextState = recomputeHouseFog(nextState, houseId);
  }

  if (house.isHuman) {
    nextState = openNextPendingModal(nextState, houseId);
  }
  return nextState;
}

export function applyCommanderTrait(
  state: GameState,
  houseId: HouseId,
  traitId: CommanderTraitId,
): GameState {
  const house = state.houses[houseId];
  const cmd = state.commanders[houseId];
  if (!house || !cmd || !house.pendingCommanderTrait) return state;

  const nextLevelSlot = (cmd.traits.length + 2) as 2 | 3;
  if (nextLevelSlot > cmd.level || nextLevelSlot > 3) return state;
  const validChoices = getCommanderTraitChoicesForLevel(nextLevelSlot);
  if (!validChoices.includes(traitId)) return state;

  const updatedTraits = [...cmd.traits, traitId];
  const stillPending = updatedTraits.length + 1 < cmd.level;

  let nextState: GameState = {
    ...state,
    commanders: {
      ...state.commanders,
      [houseId]: { ...cmd, traits: updatedTraits },
    },
    houses: {
      ...state.houses,
      [houseId]: { ...house, pendingCommanderTrait: stillPending },
    },
  };

  nextState = appendChronicle(nextState, {
    type: 'unit_promoted',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey: cmd.unitId ? (state.units[cmd.unitId]?.tileKey ?? null) : null,
    summary: `Commander mastered ${COMMANDER_TRAITS[traitId].title}.`,
    isPublic: false,
  });

  if (house.isHuman) {
    nextState = openNextPendingModal(nextState, houseId);
  }
  return nextState;
}

/**
 * Enacts one side of an unclaimed Doctrine Pair and permanently locks its opposite.
 */
export function selectDecree(
  state: GameState,
  houseId: HouseId,
  decreeId: DecreeId,
): GameState {
  const house = state.houses[houseId];
  if (!house || house.pendingDraftCount <= 0) return state;
  if (house.decreeIds.includes(decreeId) || house.lockedDecreeIds.includes(decreeId)) return state;

  if (house.isHuman && state.pendingDraftChoices && !state.pendingDraftChoices.includes(decreeId)) {
    return state;
  }

  const def = DECREES[decreeId];
  const updatedHouse: HouseState = {
    ...house,
    decreeIds: [...house.decreeIds, decreeId],
    lockedDecreeIds: [...house.lockedDecreeIds, def.oppositeId],
    pendingDraftCount: house.pendingDraftCount - 1,
  };

  let nextState: GameState = {
    ...state,
    houses: { ...state.houses, [houseId]: updatedHouse },
    pendingDraftChoices: null,
  };

  // Immediate retroactive effects
  if (decreeId === 'decree_stone_curtain') {
    const nextKeeps = { ...nextState.keeps };
    for (const k of getHouseKeeps(nextState, houseId)) {
      const newMax = computeKeepMaxHp(k, updatedHouse);
      const gain = Math.max(0, newMax - k.maxKeepHp);
      nextKeeps[k.id] = { ...k, maxKeepHp: newMax, keepHp: Math.min(newMax, k.keepHp + gain) };
    }
    const nextTiles = { ...nextState.tiles };
    for (const t of getIndexedHouseTiles(nextState, houseId)) {
      if (t.improvement && IMPROVEMENTS[t.improvement].isFortification && t.fortificationHp !== null) {
        const boost = Math.round(t.fortificationHp * (KEEP_STONE_CURTAIN_HP_MULT - 1));
        nextTiles[t.key] = { ...t, fortificationHp: t.fortificationHp + boost };
      }
    }
    nextState = { ...nextState, keeps: nextKeeps, tiles: nextTiles };
  } else if (decreeId === 'decree_border_wardens') {
    nextState = recomputeHouseFog(nextState, houseId);
  } else if (decreeId === 'decree_feudal_levies') {
    nextState = autoRehomeOrphans(nextState, houseId);
  }

  nextState = appendChronicle(nextState, {
    type: 'decree_enacted',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey: null,
    summary: `House ${houseId} enacted ${def.title} (locked ${DECREES[def.oppositeId].title}).`,
    isPublic: false,
  });

  if (house.isHuman) {
    nextState = openNextPendingModal(nextState, houseId);
  }
  return nextState;
}
