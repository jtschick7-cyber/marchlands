/**
 * Marchlands (Spec v2.0) — Economy & Synchronous Decision AI Layer
 *
 * Handles:
 * 1. Synchronous AI decision queues:
 *    - Tier-2 Keep Specializations (4 options incl. forge_seat)
 *    - Tier-3 Citadel Charters (4 options)
 *    - Lord-Commander Marshal Traits
 *    - Unit Branching Battle Honors
 *    - Exclusive Royal Doctrine Pairs (A vs B)
 * 2. Post-combat unified economy loop (<= MAX_AI_ACTIONS = 16, MIN_ACTION_SCORE = 5):
 *    - Keep Tier-3 Citadel upgrades, Commander early rally, Peaceful Annexation,
 *      Unit training (Iron + Coin upkeep safe, Siege aware), Building construction,
 *      Level-2 Improvement upgrades, Roads, Keep Repair, Tithe, and Crown Audience (incl. Iron).
 */

import type {
  BattleHonorId,
  CitadelCharter,
  CommanderTraitId,
  CoordKey,
  DecreeId,
  GameState,
  HouseId,
  ImprovementId,
  KeepSpecialization,
  TerrainType,
  UnitId,
} from '../../types/game.ts';
import {
  AI_PERSONALITIES,
  AUDIENCE_GRANT_FAVOR,
  AUDIENCE_IRON_FAVOR,
  AUDIENCE_PETITION_FAVOR,
  EXHAUSTED_POOL_COIN,
  EXHAUSTED_POOL_IRON,
  EXHAUSTED_POOL_MATERIALS,
  HOUSES,
  IMPROVEMENT_IDS,
  IMPROVEMENTS,
  KEEP_TIER2_FOOD_THRESHOLD,
  KEEP_TIER3_IRON_COST,
  MAX_AI_ACTIONS,
  MIN_ACTION_SCORE,
  UNIT_IDS,
  UNITS,
  getBattleHonorChoices,
  getCommanderTraitChoicesForLevel,
} from '../../data/index.ts';
import { coordKey, getNeighbors } from '../coords.ts';
import { canRehomeUnitManually, rehomeUnitManually } from '../capture.ts';
import {
  canPayRegentsTithe,
  getAudienceCost,
  payRegentsTithe,
  performCrownGrant,
  performPetitionCharter,
} from '../crown.ts';
import {
  applyBattleHonor,
  applyCitadelCharter,
  applyCommanderTrait,
  applyKeepSpecialization,
  getUnclaimedDoctrinePairs,
  rollDraftHand,
  selectDecree,
} from '../draftAndSpec.ts';
import {
  annexVillage,
  buildImprovement,
  buildRoad,
  canAnnexVillage,
  canBuildImprovement,
  canBuildRoad,
  canRallyCommanderEarly,
  canRepairKeep,
  canTrainUnit,
  canUpgradeImprovement,
  canUpgradeKeepToTier3,
  computeKeepYield,
  computeNonKeepOwnedYield,
  computeTileYield,
  getImprovementCosts,
  getImprovementUpgradeCosts,
  getUnitTrainingCosts,
  getUnitUpkeep,
  keepHasBarracks,
  keepHasSiegeWorkshop,
  keepHasSmithy,
  rallyCommanderEarly,
  repairKeep,
  trainUnit,
  upgradeImprovement,
  upgradeKeepToTier3,
} from '../economy.ts';
import { getIndexedHouseTiles, getIndexedKeepTiles } from '../spatialIndex.ts';
import {
  getHouseKeeps,
  getHouseUnits,
  getKeepArmyCap,
  getKeepSupportedUnitIds,
  getMapPresetConfig,
  getSeason,
  houseHasDecree,
} from '../stateHelpers.ts';
import type { InfluenceMaps } from './influence.ts';

// Static terrain -> candidate improvements lookup (avoids O(21) checks on every tile)
const IMPS_BY_TERRAIN: Readonly<Record<TerrainType, readonly ImprovementId[]>> = {
  plains: IMPROVEMENT_IDS.filter((id) => IMPROVEMENTS[id].validTerrains.includes('plains')),
  forest: IMPROVEMENT_IDS.filter((id) => IMPROVEMENTS[id].validTerrains.includes('forest')),
  hills: IMPROVEMENT_IDS.filter((id) => IMPROVEMENTS[id].validTerrains.includes('hills')),
  river: IMPROVEMENT_IDS.filter((id) => IMPROVEMENTS[id].validTerrains.includes('river')),
  mountain: IMPROVEMENT_IDS.filter((id) => IMPROVEMENTS[id].validTerrains.includes('mountain')),
};

function chooseKeepSpecialization(
  state: GameState,
  houseId: HouseId,
  keepId: string,
  influence: InfluenceMaps,
): Exclude<KeepSpecialization, 'none'> {
  const personality = AI_PERSONALITIES[houseId];
  const keep = state.keeps[keepId];
  const keeps = getHouseKeeps(state, houseId);
  const house = state.houses[houseId]!;
  const frontierDist = keep ? (influence.frontierMap[keep.tileKey] ?? 99) : 99;
  const isFrontier = frontierDist <= 7;

  const existingGarrison = keeps.filter((k) => k.specialization === 'garrison').length;
  const existingMarket = keeps.filter((k) => k.specialization === 'market_town').length;
  const existingGranary = keeps.filter((k) => k.specialization === 'granary_seat').length;
  const existingForge = keeps.filter((k) => k.specialization === 'forge_seat').length;

  const keepTiles = keep ? getIndexedKeepTiles(state, keepId) : [];
  const hasLocalIron = keepTiles.some((t) => t.hasIronDeposit);
  const hasLocalFarms = keepTiles.filter((t) => t.improvement === 'farm').length >= 1;

  const scores: Array<{ spec: Exclude<KeepSpecialization, 'none'>; score: number }> = [
    {
      spec: 'garrison',
      score:
        50 * personality.specWeights.garrison +
        (isFrontier ? 18 : 0) +
        (houseId === 'ironhelm' && existingGarrison === 0 ? 14 : 0) -
        existingGarrison * 15,
    },
    {
      spec: 'market_town',
      score:
        50 * personality.specWeights.market_town +
        (house.resources.coin < 18 ? 16 : 0) +
        (houseId === 'aurelia' && existingMarket === 0 ? 14 : 0) -
        existingMarket * 15,
    },
    {
      spec: 'granary_seat',
      score:
        50 * personality.specWeights.granary_seat +
        (keep?.isCapital ? 10 : 0) +
        (hasLocalFarms ? 8 : 0) -
        existingGranary * 15,
    },
    {
      spec: 'forge_seat',
      score:
        50 * personality.specWeights.forge_seat +
        (hasLocalIron ? 14 : 0) +
        (house.resources.iron < 5 ? 16 : 0) -
        existingForge * 15,
    },
  ];

  scores.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.spec.localeCompare(b.spec)));
  return scores[0]!.spec;
}

function chooseCitadelCharter(
  state: GameState,
  houseId: HouseId,
  keepId: string,
  influence: InfluenceMaps,
): Exclude<CitadelCharter, 'none'> {
  const personality = AI_PERSONALITIES[houseId];
  const keep = state.keeps[keepId];
  const frontierDist = keep ? (influence.frontierMap[keep.tileKey] ?? 99) : 99;
  const keepTiles = keep ? getIndexedKeepTiles(state, keepId) : [];
  const lv1Forts = keepTiles.filter(
    (t) =>
      t.ownerHouseId === houseId &&
      t.improvementLevel === 1 &&
      (t.improvement === 'palisade' || t.improvement === 'watchtower'),
  ).length;

  const scores: Array<{ charter: Exclude<CitadelCharter, 'none'>; score: number }> = [
    {
      charter: 'royal_bastion',
      score:
        50 * personality.charterWeights.royal_bastion +
        (frontierDist <= 7 ? 10 : 0) +
        Math.min(12, lv1Forts * 3),
    },
    {
      charter: 'high_armory',
      score:
        50 * personality.charterWeights.high_armory +
        (state.houses[houseId]!.resources.iron < 12 ? 14 : 6),
    },
    {
      charter: 'grand_exchange',
      score:
        50 * personality.charterWeights.grand_exchange +
        (state.houses[houseId]!.resources.coin < 24 ? 14 : 4),
    },
    {
      charter: 'war_college',
      score: 50 * personality.charterWeights.war_college + 8,
    },
  ];

  scores.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.charter.localeCompare(b.charter),
  );
  return scores[0]!.charter;
}

function chooseCommanderTrait(
  houseId: HouseId,
  choices: readonly CommanderTraitId[],
): CommanderTraitId {
  const personality = AI_PERSONALITIES[houseId];
  const scored = choices.map((tid) => {
    let score = 50;
    if (tid === 'trait_castellan') score += 14 * personality.fortificationBias;
    if (tid === 'trait_vanguard') score += 14 * personality.attackAggression;
    if (tid === 'trait_siege_master') score += 16 * personality.attackAggression;
    if (tid === 'trait_quartermaster') score += 14 * personality.econBuildBias;
    return { tid, score };
  });
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.tid.localeCompare(b.tid)));
  return scored[0]!.tid;
}

function chooseBattleHonor(
  houseId: HouseId,
  choices: readonly BattleHonorId[],
): BattleHonorId {
  const personality = AI_PERSONALITIES[houseId];
  const scored = choices.map((hid) => {
    let score = 50;
    if (
      hid === 'honor_stalwart' ||
      hid === 'honor_iron_guard' ||
      hid === 'honor_pike_wall' ||
      hid === 'honor_bulwark' ||
      hid === 'honor_high_watch' ||
      hid === 'honor_outrider' ||
      hid === 'honor_barded_steed' ||
      hid === 'honor_heavy_mantlet'
    ) {
      score += 12 * personality.riskAversion + 6 * personality.fortificationBias;
    } else {
      score += 14 * personality.attackAggression;
    }
    return { hid, score };
  });
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.hid.localeCompare(b.hid)));
  return scored[0]!.hid;
}

function scoreDecreeCard(state: GameState, houseId: HouseId, decreeId: DecreeId): number {
  const personality = AI_PERSONALITIES[houseId];
  const house = state.houses[houseId]!;
  let score = 50;

  switch (decreeId) {
    case 'decree_feudal_levies':
      score += 14 + (houseId === 'corvus' || houseId === 'vane' ? 10 : 0);
      break;
    case 'decree_standing_corps':
      score += 16 + (houseId === 'ironhelm' || houseId === 'aurelia' ? 10 : 0);
      break;
    case 'decree_stone_curtain':
      score += 16 * personality.fortificationBias + (houseId === 'ironhelm' || houseId === 'solis' ? 6 : 0);
      break;
    case 'decree_mobile_vanguard':
      score += 15 * personality.attackAggression;
      break;
    case 'decree_chartered_guilds':
      score += 16 * personality.annexPriority + (house.resources.coin < 18 ? 10 : 0);
      break;
    case 'decree_royal_extraction':
      score += 18 * personality.ironPriority + (house.resources.iron < 5 ? 12 : 0);
      break;
    case 'decree_winter_granaries':
      score += 15 * personality.econBuildBias + (houseId === 'vane' || houseId === 'aurelia' ? 8 : 0);
      break;
    case 'decree_hardened_marchers':
      score += 14 * personality.attackAggression + (houseId === 'corvus' ? 6 : 0);
      break;
    case 'decree_regents_envoy':
      score += 16 * personality.mandatePriority * personality.writPriority;
      break;
    case 'decree_iron_sovereign':
      score += 15 * personality.pillagePriority;
      break;
    case 'decree_bodkin_volleys':
      score += 15 * personality.watchtowerPriority + (houseId === 'vane' ? 14 : 0);
      break;
    case 'decree_grand_bombardment':
      score += 16 * personality.attackAggression + (houseId === 'ironhelm' ? 10 : 0);
      break;
    case 'decree_field_surgeons':
      score += 15 * (0.7 + personality.riskAversion);
      break;
    case 'decree_salvage_crews':
      score += 15 * personality.campPriority;
      break;
    case 'decree_border_wardens':
      score += 15 * personality.outpostPriority;
      break;
    case 'decree_royal_roads':
      score += 15 * personality.econBuildBias;
      break;
  }

  return score;
}

/**
 * Synchronously resolves all pending AI decision queues:
 * 1. Tier-2 Specializations
 * 2. Tier-3 Citadel Charters
 * 3. Commander Marshal Traits
 * 4. Unit Battle Honors
 * 5. Exclusive Royal Doctrine Pairs
 */
export function resolvePendingAiDecisions(
  state: GameState,
  houseId: HouseId,
  influence: InfluenceMaps,
): GameState {
  let cur = state;

  // 1. Tier-2 Keep Specializations
  while (true) {
    const house = cur.houses[houseId];
    if (!house || house.isEliminated || house.pendingSpecializationKeepIds.length === 0) break;
    const keepId = house.pendingSpecializationKeepIds[0]!;
    const spec = chooseKeepSpecialization(cur, houseId, keepId, influence);
    const next = applyKeepSpecialization(cur, houseId, keepId, spec);
    if (next === cur) break;
    cur = next;
  }

  // 2. Tier-3 Citadel Charters
  while (true) {
    const house = cur.houses[houseId];
    if (!house || house.isEliminated || house.pendingCitadelKeepIds.length === 0) break;
    const keepId = house.pendingCitadelKeepIds[0]!;
    const charter = chooseCitadelCharter(cur, houseId, keepId, influence);
    const next = applyCitadelCharter(cur, houseId, keepId, charter);
    if (next === cur) break;
    cur = next;
  }

  // 3. Commander Marshal Traits
  while (true) {
    const house = cur.houses[houseId];
    const cmd = cur.commanders[houseId];
    if (!house || !cmd || house.isEliminated || !house.pendingCommanderTrait) break;
    const nextLevelSlot = (cmd.traits.length + 2) as 2 | 3;
    if (nextLevelSlot > cmd.level || nextLevelSlot > 3) break;
    const choices = getCommanderTraitChoicesForLevel(nextLevelSlot);
    const picked = chooseCommanderTrait(houseId, choices);
    const next = applyCommanderTrait(cur, houseId, picked);
    if (next === cur) break;
    cur = next;
  }

  // 4. Unit Battle Honors
  while (true) {
    const house = cur.houses[houseId];
    if (!house || house.isEliminated || house.pendingHonorUnitIds.length === 0) break;
    const unitId = house.pendingHonorUnitIds[0]!;
    const unit = cur.units[unitId];
    if (!unit || unit.isCommander) {
      cur = {
        ...cur,
        houses: {
          ...cur.houses,
          [houseId]: {
            ...house,
            pendingHonorUnitIds: house.pendingHonorUnitIds.filter((id) => id !== unitId),
          },
        },
      };
      continue;
    }
    const uClass = UNITS[unit.typeId].unitClass;
    if (uClass === 'commander' || unit.battleHonors.length >= 2) {
      cur = {
        ...cur,
        houses: {
          ...cur.houses,
          [houseId]: {
            ...house,
            pendingHonorUnitIds: house.pendingHonorUnitIds.filter((id) => id !== unitId),
          },
        },
      };
      continue;
    }
    const targetRank = (unit.battleHonors.length + 1) as 1 | 2;
    const choices = getBattleHonorChoices(uClass, targetRank);
    const picked = chooseBattleHonor(houseId, choices);
    const next = applyBattleHonor(cur, houseId, unitId, picked);
    if (next === cur) break;
    cur = next;
  }

  // 5. Exclusive Royal Doctrine Pairs
  while (true) {
    const house = cur.houses[houseId];
    if (!house || house.isEliminated || house.pendingDraftCount <= 0) break;

    const pairs = getUnclaimedDoctrinePairs(house);
    if (pairs.length === 0) {
      const count = house.pendingDraftCount;
      cur = {
        ...cur,
        houses: {
          ...cur.houses,
          [houseId]: {
            ...house,
            pendingDraftCount: 0,
            resources: {
              materials: house.resources.materials + EXHAUSTED_POOL_MATERIALS * count,
              iron: house.resources.iron + EXHAUSTED_POOL_IRON * count,
              coin: house.resources.coin + EXHAUSTED_POOL_COIN * count,
            },
          },
        },
      };
      break;
    }

    const { hand, nextRngCounter } = rollDraftHand(cur, houseId);
    if (hand.length === 0) break;
    cur = { ...cur, rngCounter: nextRngCounter };

    const bestCard = [...hand].sort((a, b) => {
      const diff = scoreDecreeCard(cur, houseId, b) - scoreDecreeCard(cur, houseId, a);
      return diff !== 0 ? diff : a.localeCompare(b);
    })[0]!;

    const next = selectDecree(cur, houseId, bestCard);
    if (next === cur) break;
    cur = next;
  }

  return cur;
}

/**
 * Opportunistic manual Keep re-homing (exempt from MAX_AI_ACTIONS).
 */
export function runOpportunisticRehoming(state: GameState, houseId: HouseId): GameState {
  let cur = state;
  const units = getHouseUnits(cur, houseId).sort((a, b) => a.id.localeCompare(b.id));
  for (const u of units) {
    if (!canRehomeUnitManually(cur, u.id)) continue;
    const isOrphaned = u.homeKeepId === 'orphaned';
    const homeFull =
      !isOrphaned &&
      getKeepSupportedUnitIds(cur, u.homeKeepId).length >= getKeepArmyCap(cur, u.homeKeepId);
    if (isOrphaned || homeFull) {
      cur = rehomeUnitManually(cur, u.id);
    }
  }
  return cur;
}

type EconomyAction =
  | { kind: 'upgrade_keep_t3'; keepId: string; score: number }
  | { kind: 'rally_commander'; score: number }
  | { kind: 'annex'; tileKey: CoordKey; score: number }
  | { kind: 'train'; keepId: string; unitId: UnitId; score: number }
  | { kind: 'build'; tileKey: CoordKey; improvementId: ImprovementId; score: number }
  | { kind: 'upgrade_imp'; tileKey: CoordKey; score: number }
  | { kind: 'road'; tileKey: CoordKey; score: number }
  | { kind: 'repair_keep'; keepId: string; score: number }
  | { kind: 'tithe'; score: number }
  | { kind: 'petition'; score: number }
  | { kind: 'grant'; resource: 'materials' | 'coin' | 'iron'; score: number };

function getHouseNetEconomy(
  state: GameState,
  houseId: HouseId,
): { netCoin: number; ironPerTurn: number; matPerTurn: number } {
  const house = state.houses[houseId]!;
  let coinIncome = 0;
  let buildingUpkeep = 0;
  let ironIncome = 0;
  let matIncome = 0;

  for (const k of getHouseKeeps(state, houseId)) {
    const ky = computeKeepYield(state, k.id);
    coinIncome += ky.coin;
    buildingUpkeep += ky.coinUpkeep;
    ironIncome += ky.iron;
    matIncome += ky.materials;
  }
  const nonKeep = computeNonKeepOwnedYield(state, houseId);
  coinIncome += nonKeep.coin;
  buildingUpkeep += nonKeep.coinUpkeep;
  ironIncome += nonKeep.iron;
  matIncome += nonKeep.materials;

  let unitUpkeep = 0;
  for (const u of getHouseUnits(state, houseId)) {
    unitUpkeep += getUnitUpkeep(house, u.typeId);
  }
  return {
    netCoin: coinIncome - buildingUpkeep - unitUpkeep,
    ironPerTurn: ironIncome,
    matPerTurn: matIncome,
  };
}

export interface EconomyResult {
  readonly state: GameState;
  readonly actionsUsed: number;
}

export function runEconomyLayer(
  state: GameState,
  houseId: HouseId,
  influence: InfluenceMaps,
): EconomyResult {
  let cur = runOpportunisticRehoming(state, houseId);
  cur = resolvePendingAiDecisions(cur, houseId, influence);

  const personality = AI_PERSONALITIES[houseId];
  const cfg = getMapPresetConfig(cur);
  let actionsUsed = 0;
  let roadsBuiltThisTurn = 0;

  // Pre-collect neutral frontier villages once (only ~16-20 tiles on 34x34)
  const villageKeys = Object.values(cur.tiles)
    .filter((t) => t.landmark === 'frontier_village' && t.villageHp !== null && t.villageHp > 0)
    .map((t) => t.key);

  while (actionsUsed < MAX_AI_ACTIONS) {
    const house = cur.houses[houseId];
    if (!house || house.isEliminated) break;

    const myKeeps = getHouseKeeps(cur, houseId);
    const myUnits = getHouseUnits(cur, houseId);
    const { netCoin, ironPerTurn, matPerTurn } = getHouseNetEconomy(cur, houseId);
    const posture = house.aiPlan?.posture ?? 'expand';
    const season = getSeason(cur.turnNumber);
    const candidates: EconomyAction[] = [];

    // Check if a Tier-2 Keep is nearly ready for Tier-3 Grand Citadel (save Iron!)
    const keepNearlyTier3 = myKeeps.some(
      (k) => k.tier === 2 && k.foodProgress >= Math.round(KEEP_TIER2_FOOD_THRESHOLD * 0.78),
    );

    // 0. Keep Tier-3 Grand Citadel Upgrade (top strategic milestone)
    for (const k of myKeeps) {
      if (canUpgradeKeepToTier3(cur, houseId, k.id)) {
        candidates.push({
          kind: 'upgrade_keep_t3',
          keepId: k.id,
          score: 94,
        });
      }
      if (canRepairKeep(cur, houseId, k.id) && k.keepHp < k.maxKeepHp * 0.7 && house.resources.materials >= 12) {
        candidates.push({
          kind: 'repair_keep',
          keepId: k.id,
          score: 70 + (posture === 'defend' ? 14 : 0),
        });
      }
    }

    // 0b. Early Lord-Commander Rally
    if (canRallyCommanderEarly(cur, houseId) && house.resources.coin >= 20) {
      candidates.push({
        kind: 'rally_commander',
        score: 82,
      });
    }

    // 1. Peaceful Village Annexation
    for (const vk of villageKeys) {
      if (canAnnexVillage(cur, houseId, vk)) {
        candidates.push({
          kind: 'annex',
          tileKey: vk,
          score: Math.min(100, 90 * personality.annexPriority),
        });
      }
    }

    // 2. Unit Training (with Iron budget & Siege awareness)
    const totalArmyCap = myKeeps.reduce((s, k) => s + getKeepArmyCap(cur, k.id), 0);
    const nonCommanderUnits = myUnits.filter((u) => !u.isCommander);
    const needUnitsFactor =
      nonCommanderUnits.length < 2
        ? 30
        : nonCommanderUnits.length < Math.ceil(totalArmyCap * 0.72)
          ? 16
          : 2;
    const postureMilBonus = posture === 'defend' ? 20 : posture === 'attack' ? 18 : 6;
    const siegeCount = myUnits.filter((u) => UNITS[u.typeId].unitClass === 'siege').length;
    const rangedCount = myUnits.filter((u) => UNITS[u.typeId].unitClass === 'ranged').length;
    const cavCount = myUnits.filter((u) => UNITS[u.typeId].unitClass === 'cavalry').length;
    const infCount = myUnits.filter((u) => UNITS[u.typeId].unitClass === 'infantry').length;
    const spearCount = myUnits.filter((u) => UNITS[u.typeId].unitClass === 'spearman').length;
    const armySize = Math.max(1, nonCommanderUnits.length);

    for (const keep of myKeeps) {
      const frontierDist = influence.frontierMap[keep.tileKey] ?? 99;
      const frontierBonus = frontierDist <= 7 ? 8 : 0;

      for (const uid of UNIT_IDS) {
        if (!canTrainUnit(cur, houseId, keep.id, uid)) continue;
        const def = UNITS[uid];
        const costs = getUnitTrainingCosts(cur, houseId, keep.id, uid);
        const upkeep = getUnitUpkeep(house, uid);

        // Avoid bankruptcy Mutiny!
        if (upkeep > 0 && netCoin - upkeep < 0 && house.resources.coin < 14) {
          continue;
        }
        // Preserve Iron for impending Tier-3 Citadel if we have enough units
        if (
          keepNearlyTier3 &&
          costs.iron > 0 &&
          nonCommanderUnits.length >= 4 &&
          house.resources.iron - costs.iron < KEEP_TIER3_IRON_COST &&
          posture !== 'defend'
        ) {
          continue;
        }

        let score = 40 + needUnitsFactor + postureMilBonus + frontierBonus;
        if (def.houseId === houseId) score += 26;
        if (uid === 'men_at_arms') score += infCount / armySize < 0.32 ? 26 : 16;
        if (uid === 'crossbowman') score += rangedCount / armySize < 0.34 ? 26 : 16;
        if (uid === 'knight') score += cavCount / armySize < 0.28 ? 26 : 16;
        if (uid === 'archer') score += rangedCount / armySize < 0.30 ? 20 : 8;
        if (uid === 'spearman') {
          score += spearCount / armySize < 0.35 ? 10 : -8;
        }
        if (uid === 'militia') score += nonCommanderUnits.length === 0 ? 12 : -14;

        // Siege units are vital in v2.0 (non-siege deals reduced structure damage!)
        const desiredSiege = Math.min(4, Math.max(2, Math.floor(nonCommanderUnits.length / 5)));
        if (def.unitClass === 'siege') {
          if (uid === 'trebuchet') {
            score += siegeCount < desiredSiege ? 42 : -12;
          } else if (uid === 'siege_ram') {
            score += siegeCount < desiredSiege && (posture === 'attack' || cur.turnNumber >= 10) ? 38 : -10;
          } else {
            score +=
              siegeCount === 0 && (posture === 'attack' || cur.turnNumber >= 12) && !keepHasSiegeWorkshop(cur, keep.id)
                ? 14
                : -24;
          }
        }
        if (def.unitClass === 'ranged' && rangedCount < Math.max(1, Math.floor(nonCommanderUnits.length / 3))) {
          score += 10;
        }
        if (def.unitClass === 'cavalry' && cavCount < Math.max(1, Math.floor(nonCommanderUnits.length / 4)) && cur.turnNumber >= 10) {
          score += 10;
        }

        const ironPenaltyMult = house.resources.iron >= costs.iron + 6 ? 0.35 : 0.9;
        score -= costs.materials * 0.25 + costs.iron * ironPenaltyMult;

        candidates.push({
          kind: 'train',
          keepId: keep.id,
          unitId: uid,
          score: Math.max(0, Math.min(100, score)),
        });
      }
    }

    // 3. Tile Improvement Construction (using spatial index + terrain-filtered candidates!)
    const ownedTiles = getIndexedHouseTiles(cur, houseId);
    const activeWrits = cur.crown.activeWrits.filter((w) => w.completedByHouseId === null);
    const wantsMarketsWrit = activeWrits.some((w) => w.writId === 'writ_markets');
    const wantsIronWrit = activeWrits.some((w) => w.writId === 'writ_iron');

    if (house.resources.materials >= 4) {
      const ownedEmptyTiles = ownedTiles.filter((t) => t.improvement === null);

      const keepHasB: Record<string, boolean> = {};
      const keepHasSm: Record<string, boolean> = {};
      const keepHasSw: Record<string, boolean> = {};
      const keepGranaries: Record<string, number> = {};
      let houseBarracksCount = 0;
      let houseSmithyCount = 0;
      let houseSiegeWorkshopCount = 0;
      for (const k of myKeeps) {
        keepHasB[k.id] = keepHasBarracks(cur, k.id);
        keepHasSm[k.id] = keepHasSmithy(cur, k.id);
        keepHasSw[k.id] = keepHasSiegeWorkshop(cur, k.id);
        if (keepHasB[k.id]) houseBarracksCount += 1;
        if (keepHasSm[k.id]) houseSmithyCount += 1;
        if (keepHasSw[k.id]) houseSiegeWorkshopCount += 1;
        keepGranaries[k.id] = getIndexedKeepTiles(cur, k.id).filter(
          (t) => t.ownerHouseId === houseId && t.improvement === 'granary',
        ).length;
      }

      for (const tile of ownedEmptyTiles) {
        const terrainImps = IMPS_BY_TERRAIN[tile.terrain];
        const frontierDist = influence.frontierMap[tile.key] ?? 99;
        const keep = tile.keepId ? cur.keeps[tile.keepId] : null;
        let baseYield: ReturnType<typeof computeTileYield> | null = null;
        let neighbors: (typeof tile)[] | null = null;

        for (const impId of terrainImps) {
          const def = IMPROVEMENTS[impId];
          if (def.houseId !== null && def.houseId !== houseId) continue;
          if (
            def.requiresIronDeposit &&
            !tile.hasIronDeposit &&
            !(def.allowsBareMountainForOwner && tile.terrain === 'mountain')
          ) {
            continue;
          }
          if (!canBuildImprovement(cur, houseId, tile.key, impId)) continue;
          const costs = getImprovementCosts(cur, houseId, impId);

          if (def.coinUpkeep > 0 && netCoin - def.coinUpkeep < 0 && house.resources.coin < 14) {
            continue;
          }
          if (
            keepNearlyTier3 &&
            costs.iron > 0 &&
            impId !== 'iron_mine' &&
            impId !== 'deep_smeltery' &&
            house.resources.iron - costs.iron < KEEP_TIER3_IRON_COST
          ) {
            continue;
          }

          if (!baseYield) baseYield = computeTileYield(cur, tile.key);
          const afterYield = computeTileYield(cur, tile.key, { ...tile, improvement: impId });
          const dFood = afterYield.food - baseYield.food;
          const dMat = afterYield.materials - baseYield.materials;
          const dIron = afterYield.iron - baseYield.iron;
          const dCoin =
            afterYield.coin - baseYield.coin - (afterYield.coinUpkeep - baseYield.coinUpkeep);

          const coinWeight = netCoin >= 25 && house.resources.coin >= 160 ? 2 : 7;
          const matWeight = matPerTurn >= 28 && house.resources.materials >= 140 ? 2.5 : 7.5;
          let score =
            18 +
            (dFood * 7 + dMat * matWeight + dIron * 16 * personality.ironPriority + dCoin * coinWeight) *
              personality.econBuildBias -
            costs.materials * 0.6 -
            costs.iron * 2.0;

          if (netCoin <= 3 && dCoin > 0) score += 18;
          if (matPerTurn < 8 && dMat > 0) score += 18;
          if (ironPerTurn < 3 && dIron > 0) score += 24 * personality.ironPriority;
          if (impId === HOUSES[houseId].uniqueImprovementId) score += 10;

          if (impId === 'barracks' && keep && !keepHasB[keep.id]) {
            score = houseBarracksCount === 0 && cur.turnNumber >= 3 ? 78 : frontierDist <= 8 ? 64 : 52;
          } else if (impId === 'smithy' && keep && !keepHasSm[keep.id]) {
            if (!neighbors) {
              neighbors = getNeighbors(tile.x, tile.y, cur.gridSize).map(
                (n) => cur.tiles[coordKey(n.x, n.y)]!,
              );
            }
            const hasOre = neighbors.some(
              (n) =>
                n.ownerHouseId === houseId &&
                (n.improvement === 'iron_mine' || n.improvement === 'deep_smeltery'),
            );
            const hasFuel = neighbors.some(
              (n) =>
                n.ownerHouseId === houseId &&
                (n.improvement === 'lumber_mill' ||
                  n.improvement === 'foresters_lodge' ||
                  n.improvement === 'stone_quarry'),
            );
            const comboBonus = hasOre && hasFuel ? 16 : hasOre ? 8 : 0;
            score = (houseSmithyCount === 0 ? 70 : 54) + comboBonus;
          } else if (impId === 'siege_workshop' && keep && !keepHasSw[keep.id]) {
            score =
              houseSiegeWorkshopCount === 0
                ? posture === 'attack' || cur.turnNumber >= 10
                  ? 74
                  : 58
                : frontierDist <= 8
                  ? 60
                  : 42;
          } else if (impId === 'war_camp') {
            score = 62;
          } else if (impId === 'granary' && keep && (keepGranaries[keep.id] ?? 0) === 0) {
            score += season === 'autumn' || season === 'winter' ? 22 : 12;
          }

          if (impId === 'market' && wantsMarketsWrit) score += 14 * personality.writPriority;
          if ((impId === 'iron_mine' || impId === 'deep_smeltery') && wantsIronWrit) {
            score += 14 * personality.writPriority;
          }

          if (impId === 'palisade') {
            score =
              frontierDist <= 4
                ? 36 * personality.fortificationBias + (posture === 'defend' ? 18 : 0)
                : 6;
          } else if (impId === 'watchtower' || impId === 'signal_bastion') {
            score =
              frontierDist <= 6
                ? 38 * personality.watchtowerPriority + (impId === 'signal_bastion' ? 12 : 0)
                : 14;
          } else if (impId === 'stone_bridge') {
            score = frontierDist <= 8 ? 28 : 10;
          }

          if (nonCommanderUnits.length === 0 && cur.turnNumber >= 2) {
            score -= 20;
          }

          candidates.push({
            kind: 'build',
            tileKey: tile.key,
            improvementId: impId,
            score: Math.max(0, Math.min(100, score)),
          });
        }
      }
    }

    // 4. Level-2 Improvement Upgrades (only scan when affordable)
    if (house.resources.materials >= 10 && house.resources.coin >= 4) {
      for (const tile of ownedTiles) {
        if (tile.improvement === null || tile.improvementLevel !== 1) continue;
        if (!canUpgradeImprovement(cur, houseId, tile.key)) continue;
        const impId = tile.improvement;
        const costs = getImprovementUpgradeCosts(cur, houseId, impId);
        if (!costs) continue;
        if (
          keepNearlyTier3 &&
          costs.iron > 0 &&
          impId !== 'iron_mine' &&
          impId !== 'deep_smeltery' &&
          house.resources.iron - costs.iron < KEEP_TIER3_IRON_COST
        ) {
          continue;
        }

        const beforeY = computeTileYield(cur, tile.key);
        const afterY = computeTileYield(cur, tile.key, { ...tile, improvementLevel: 2 });
        const dFood = afterY.food - beforeY.food;
        const dMat = afterY.materials - beforeY.materials;
        const dIron = afterY.iron - beforeY.iron;
        const dUpkeep = afterY.coinUpkeep - beforeY.coinUpkeep;
        const dCoin = afterY.coin - beforeY.coin - dUpkeep;

        if (dUpkeep > 0 && netCoin - dUpkeep < 0 && house.resources.coin < 14) continue;

        const frontierDist = influence.frontierMap[tile.key] ?? 99;
        let score =
          22 +
          (dFood * 7 + dMat * 7.5 + dIron * 18 * personality.ironPriority + dCoin * 8) *
            personality.econBuildBias -
          costs.materials * 0.5 -
          costs.iron * 2.0;

        if (impId === 'iron_mine' || impId === 'deep_smeltery') score += 22 * personality.ironPriority;
        if (impId === 'smithy') score += 22;
        if (impId === 'siege_workshop') score += posture === 'attack' || cur.turnNumber >= 20 ? 26 : 12;
        if (impId === 'barracks') score += 16;
        if (impId === 'palisade' && frontierDist <= 5) score += 22 * personality.fortificationBias;
        if ((impId === 'watchtower' || impId === 'signal_bastion') && frontierDist <= 6) {
          score += 24 * personality.watchtowerPriority;
        }

        candidates.push({
          kind: 'upgrade_imp',
          tileKey: tile.key,
          score: Math.max(0, Math.min(100, score)),
        });
      }
    }

    // 5. Road Construction (build up to 2 roads/turn when Materials comfortable)
    const roadMatFloor = houseHasDecree(house, 'decree_royal_roads') ? 6 : 14;
    if (roadsBuiltThisTurn < 2 && house.resources.materials >= roadMatFloor && cur.turnNumber >= 6) {
      let bestRoadTile: { key: CoordKey; score: number } | null = null;
      for (const tile of ownedTiles) {
        if (tile.hasRoad || !canBuildRoad(cur, houseId, tile.key)) continue;
        const fd = influence.frontierMap[tile.key] ?? 99;
        if (fd > 9) continue;
        const roughBonus = tile.terrain === 'hills' || tile.terrain === 'forest' ? 14 : 4;
        const score = 20 + roughBonus + (fd <= 5 ? 8 : 0);
        if (
          !bestRoadTile ||
          score > bestRoadTile.score ||
          (score === bestRoadTile.score && tile.key.localeCompare(bestRoadTile.key) < 0)
        ) {
          bestRoadTile = { key: tile.key, score };
        }
      }
      if (bestRoadTile) {
        candidates.push({ kind: 'road', tileKey: bestRoadTile.key, score: bestRoadTile.score });
      }
    }

    // 6. Voluntary Regent's Tithe
    if (canPayRegentsTithe(cur, houseId) && house.resources.coin >= 28) {
      candidates.push({
        kind: 'tithe',
        score: Math.min(100, 50 * personality.writPriority + (house.favor >= 30 ? 20 : 0)),
      });
    }

    // 7. Crown Audience (respect preset Mandate Favor reserve!)
    if (!house.audienceUsedThisTurn) {
      const pursuingMandate =
        cur.mode === 'dominion' &&
        (cur.crown.claimantHouseId === houseId ||
          (house.favor >= Math.floor(cfg.mandateMinFavor * 0.6) &&
            myKeeps.length >= Math.max(3, cfg.mandateMinKeeps - 2) &&
            personality.mandatePriority >= 1.0));

      const canSpendFavor = (baseCost: number): boolean => {
        const cost = getAudienceCost(house, baseCost);
        return (
          house.favor >= cost && (!pursuingMandate || house.favor - cost >= cfg.mandateMinFavor)
        );
      };

      if (canSpendFavor(AUDIENCE_PETITION_FAVOR) && getUnclaimedDoctrinePairs(house).length > 0) {
        candidates.push({ kind: 'petition', score: 56 });
      }
      if (canSpendFavor(AUDIENCE_IRON_FAVOR) && house.resources.iron < 3) {
        candidates.push({ kind: 'grant', resource: 'iron', score: 52 * personality.ironPriority });
      } else if (canSpendFavor(AUDIENCE_GRANT_FAVOR)) {
        if (house.resources.materials < 8) {
          candidates.push({ kind: 'grant', resource: 'materials', score: 46 });
        } else if (house.resources.coin < 8) {
          candidates.push({ kind: 'grant', resource: 'coin', score: 46 });
        }
      }
    }

    if (candidates.length === 0) break;

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return JSON.stringify(a).localeCompare(JSON.stringify(b));
    });

    const best = candidates[0]!;
    if (best.score < MIN_ACTION_SCORE) break;

    let next = cur;
    if (best.kind === 'upgrade_keep_t3') {
      next = upgradeKeepToTier3(cur, houseId, best.keepId);
    } else if (best.kind === 'rally_commander') {
      next = rallyCommanderEarly(cur, houseId);
    } else if (best.kind === 'annex') {
      next = annexVillage(cur, houseId, best.tileKey);
    } else if (best.kind === 'train') {
      next = trainUnit(cur, houseId, best.keepId, best.unitId);
    } else if (best.kind === 'build') {
      next = buildImprovement(cur, houseId, best.tileKey, best.improvementId);
    } else if (best.kind === 'upgrade_imp') {
      next = upgradeImprovement(cur, houseId, best.tileKey);
    } else if (best.kind === 'road') {
      next = buildRoad(cur, houseId, best.tileKey);
      if (next !== cur) roadsBuiltThisTurn += 1;
    } else if (best.kind === 'repair_keep') {
      next = repairKeep(cur, houseId, best.keepId);
    } else if (best.kind === 'tithe') {
      next = payRegentsTithe(cur, houseId);
    } else if (best.kind === 'petition') {
      next = performPetitionCharter(cur, houseId);
    } else if (best.kind === 'grant') {
      next = performCrownGrant(cur, houseId, best.resource);
    }

    if (next === cur) break;
    cur = resolvePendingAiDecisions(next, houseId, influence);
    actionsUsed += 1;
  }

  return { state: cur, actionsUsed };
}
