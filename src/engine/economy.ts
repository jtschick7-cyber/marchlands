/**
 * Marchlands (Spec v2.0) — 4-Resource Economy, Level-2 Upgrades, Roads, Clear Timber,
 * Frontier Outposts, Local Military Unlocks, Keep Tier 3, Winter Provisioning & Paid Reinforce
 */

import type {
  Coord,
  CoordKey,
  GameState,
  HouseId,
  HouseState,
  ImprovementId,
  KeepState,
  OutpostState,
  TileState,
  UnitId,
  UnitState,
} from '../types/game.ts';
import {
  AI_DIFFICULTY_CONFIG,
  ANCIENT_WATCHTOWER_COIN_PER_TURN,
  ANCIENT_WATCHTOWER_EVEN_TURN_FAVOR,
  AURELIA_RIVER_ADJ_PASSIVE_COIN,
  BASTION_STONE_CURTAIN_BONUS,
  BASTION_VOLLEY_DAMAGE,
  CHARTERED_GUILDS_ANNEX_DISCOUNT,
  CLEAR_TIMBER_COIN_COST,
  CLEAR_TIMBER_MAT_GAIN,
  COMMANDER_BASE_HP,
  COMMANDER_EARLY_RALLY_COIN,
  COMMANDER_EARLY_RALLY_MAX_TURNS,
  DEMOLISH_REFUND_RATIO,
  DISBAND_KEEP_REFUND_RATIO,
  FARM_RIVER_BONUS_FOOD,
  FEUDAL_LEVIES_MAT_DISCOUNT,
  FEUDAL_LEVIES_MIN_MAT_COST,
  FIELD_SURGEONS_HEAL_BONUS,
  FORTIFY_EXTRA_HEAL,
  GRANARY_ADJ_BONUS_FOOD,
  HARD_FROST_ATTRITION_DAMAGE,
  HIGH_SEAT_BONUS_COIN,
  HIGH_SEAT_EVEN_TURN_FAVOR,
  HOUSES,
  IMPROVEMENTS,
  KEEP_GARRISON_REGEN_BONUS,
  KEEP_REPAIR_HP_AMOUNT,
  KEEP_REPAIR_MAT_COST,
  KEEP_REPEAT_SURPLUS_COIN,
  KEEP_REPEAT_SURPLUS_FAVOR,
  KEEP_SPECIALIZATIONS,
  KEEP_STONE_CURTAIN_HP_MULT,
  KEEP_TIER1_BASE_COIN,
  KEEP_TIER1_BASE_FOOD,
  KEEP_TIER1_BASE_MAT,
  KEEP_TIER1_FOOD_THRESHOLD,
  KEEP_TIER1_MAX_HP,
  KEEP_TIER1_RADIUS,
  KEEP_TIER1_REGEN,
  KEEP_TIER2_BASE_COIN,
  KEEP_TIER2_BASE_FOOD,
  KEEP_TIER2_BASE_MAT,
  KEEP_TIER2_FOOD_THRESHOLD,
  KEEP_TIER2_REGEN,
  KEEP_TIER3_BASE_COIN,
  KEEP_TIER3_BASE_FOOD,
  KEEP_TIER3_BASE_MAT,
  KEEP_TIER3_IRON_COST,
  KEEP_TIER3_REGEN,
  KEEP_TIER3_REPEAT_FOOD_THRESHOLD,
  KEEP_TILE_EXTRA_HEAL,
  LUMBER_MILL_FOREST_BONUS_MAT,
  LUMBER_MILL_FOREST_THRESHOLD,
  MARKET_ADJ_BONUS_COIN,
  MARKET_TOWN_ANNEX_COIN_DISCOUNT,
  MAX_ANNEX_COIN_DISCOUNT,
  MUTINY_TRUE_DAMAGE,
  OUTPOST_COIN_COST,
  OUTPOST_MAT_COST,
  OUTPOST_MAX_HP,
  OUTPOST_MIN_KEEP_DIST,
  OUTPOST_MIN_OUTPOST_DIST,
  OUTPOST_RADIUS,
  OUTPOST_REGEN,
  REINFORCE_HEAL_AMOUNT,
  REINFORCE_HEAVY_COIN,
  REINFORCE_HEAVY_IRON,
  REINFORCE_STANDARD_COIN,
  REINFORCE_STANDARD_MAT,
  REINFORCE_SURGEONS_HEAL_AMOUNT,
  ROAD_MAT_COST,
  ROAD_ROYAL_NETWORK_MAT_COST,
  SEASONS,
  STANDARD_HEAL_AMOUNT,
  UNITS,
  VANE_FOREST_PASSIVE_MAT,
  VETERANCY_HP_PER_RANK,
  VETERANCY_RANK1_XP,
  VILLAGE_ANNEX_COIN_COST,
  VILLAGE_ANNEX_FAVOR_GAIN,
  VILLAGE_ANNEX_FOOD_COST,
  WAR_CAMP_MAX_PER_HOUSE,
  WAR_CAMP_MAX_PER_KEEP,
} from '../data/index.ts';
import { chebyshevDist, coordKey, getNeighbors } from './coords.ts';
import {
  autoRehomeOrphans,
  claimKeepTerritory,
  claimOutpostTerritory,
} from './capture.ts';
import { applyOneShotProtection } from './combat.ts';
import { permanentlyRevealRadius, recomputeHouseFog } from './fog.ts';
import { getUnitMaxMovement } from './movement.ts';
import {
  getIndexedHouseTiles,
  getIndexedKeepTiles,
} from './spatialIndex.ts';
import {
  addFavor,
  addLifetimeCoin,
  allocateSettlementName,
  appendChronicle,
  computeKeepMaxHp,
  getHouseKeeps,
  getHouseOutpostCap,
  getHouseOutposts,
  getHouseUnits,
  getKeepArmyCap,
  getKeepAt,
  getKeepSupportedUnitIds,
  getKeepWallCap,
  getKeepWatchtowerCap,
  getOutpostAt,
  getSeason,
  getUnitAt,
  hasCommanderTrait,
  houseHasActiveEffect,
  houseHasDecree,
  isAdjacentToFriendlyCommander,
} from './stateHelpers.ts';

export interface TileYield {
  readonly food: number;
  readonly materials: number;
  readonly iron: number;
  readonly coin: number;
  readonly coinUpkeep: number;
}

export interface ResourceCost {
  readonly materials: number;
  readonly iron: number;
  readonly coin: number;
}

export function getKeepFoodThreshold(keep: KeepState): number {
  const mult =
    keep.specialization !== 'none'
      ? KEEP_SPECIALIZATIONS[keep.specialization].growthThresholdMultiplier
      : 1.0;
  if (keep.tier === 1) return KEEP_TIER1_FOOD_THRESHOLD;
  if (keep.tier === 2) return Math.round(KEEP_TIER2_FOOD_THRESHOLD * mult);
  return Math.round(KEEP_TIER3_REPEAT_FOOD_THRESHOLD * mult);
}

/**
 * Computes exact per-turn Food / Materials / Iron / Coin yield & Coin upkeep of an owned tile.
 */
export function computeTileYield(
  state: GameState,
  tileKey: CoordKey,
  tileOverride?: TileState,
): TileYield {
  const tile = tileOverride ?? state.tiles[tileKey];
  if (!tile || tile.ownerHouseId === null) {
    return { food: 0, materials: 0, iron: 0, coin: 0, coinUpkeep: 0 };
  }

  const houseId = tile.ownerHouseId;
  const house = state.houses[houseId];
  if (!house) return { food: 0, materials: 0, iron: 0, coin: 0, coinUpkeep: 0 };

  const keep = tile.keepId ? state.keeps[tile.keepId] : null;
  const season = SEASONS[getSeason(state.turnNumber)];
  const neighbors = getNeighbors(tile.x, tile.y, state.gridSize).map(
    (n) => state.tiles[coordKey(n.x, n.y)]!,
  );

  let food = 0;
  let materials = 0;
  let iron = 0;
  let coin = 0;
  let coinUpkeep = 0;

  // House Vane passive: +1 Materials from Forest tiles
  if (houseId === 'vane' && tile.terrain === 'forest') {
    materials += VANE_FOREST_PASSIVE_MAT;
  }

  const imp = tile.improvement;
  if (imp !== null) {
    const def = IMPROVEMENTS[imp];
    const isLv2 = tile.improvementLevel === 2 && def.upgrade !== null;
    food += isLv2 ? def.upgrade!.baseFood : def.baseFood;
    materials += isLv2 ? def.upgrade!.baseMaterials : def.baseMaterials;
    iron += isLv2 ? def.upgrade!.baseIron : def.baseIron;
    coin += isLv2 ? def.upgrade!.baseCoin : def.baseCoin;
    coinUpkeep += isLv2 ? def.upgrade!.coinUpkeep : def.coinUpkeep;

    // Grand Exchange Tier-3 Citadel Charter: -1 Coin upkeep on buildings inside territory
    if (keep?.citadelCharter === 'grand_exchange') {
      coinUpkeep = Math.max(0, coinUpkeep - 1);
    }

    // House Aurelia passive: +1 Coin per river-adjacent tile improvement
    if (houseId === 'aurelia' && neighbors.some((n) => n.terrain === 'river')) {
      coin += AURELIA_RIVER_ADJ_PASSIVE_COIN;
    }

    if (imp === 'farm') {
      if (neighbors.some((n) => n.terrain === 'river')) {
        food += FARM_RIVER_BONUS_FOOD;
      }
      const adjGranaries = neighbors.filter(
        (n) => n.ownerHouseId === houseId && n.improvement === 'granary',
      ).length;
      food += adjGranaries * GRANARY_ADJ_BONUS_FOOD;
      const adjFisheries = neighbors.filter(
        (n) => n.ownerHouseId === houseId && n.improvement === 'river_fishery',
      ).length;
      food += adjFisheries;
      if (keep?.specialization === 'granary_seat') {
        food += KEEP_SPECIALIZATIONS.granary_seat.farmFoodBonus;
      }
      food += season.farmFoodDelta;
      if (houseHasActiveEffect(state, houseId, 'evt_blight')) {
        food -= 1;
      }
      food = Math.max(0, food);
    } else if (imp === 'logging_camp') {
      food += season.loggingCampFoodDelta;
      if (houseHasActiveEffect(state, houseId, 'evt_timber_boom')) {
        materials += 1;
      }
    } else if (imp === 'foresters_lodge') {
      const adjGranaries = neighbors.filter(
        (n) => n.ownerHouseId === houseId && n.improvement === 'granary',
      ).length;
      food += adjGranaries * GRANARY_ADJ_BONUS_FOOD;
      food += season.forestersLodgeFoodDelta;
    } else if (imp === 'lumber_mill') {
      const adjForests = neighbors.filter((n) => n.terrain === 'forest').length;
      if (adjForests >= LUMBER_MILL_FOREST_THRESHOLD) {
        materials += LUMBER_MILL_FOREST_BONUS_MAT;
      }
      if (isLv2 && neighbors.some((n) => n.terrain === 'river')) {
        materials += 1;
      }
      const adjWatermills = neighbors.filter(
        (n) =>
          n.ownerHouseId === houseId &&
          n.improvement === 'river_fishery' &&
          n.improvementLevel === 2,
      ).length;
      materials += adjWatermills;
      if (houseHasDecree(house, 'decree_royal_extraction')) {
        materials += 1;
      }
      if (houseHasActiveEffect(state, houseId, 'evt_timber_boom')) {
        materials += 1;
      }
    } else if (imp === 'stone_quarry') {
      if (keep?.specialization === 'forge_seat') materials += 1;
      if (houseHasDecree(house, 'decree_royal_extraction')) materials += 1;
    } else if (imp === 'iron_mine' || imp === 'deep_smeltery') {
      if (keep?.specialization === 'forge_seat') iron += 1;
      if (houseHasDecree(house, 'decree_royal_extraction')) iron += 1;
    } else if (imp === 'market') {
      const adjTrade = neighbors.filter(
        (n) =>
          n.terrain === 'river' ||
          (n.ownerHouseId === houseId &&
            (n.improvement === 'farm' ||
              n.improvement === 'stone_bridge' ||
              (isLv2 && n.improvement !== null && n.improvementLevel === 2))),
      ).length;
      coin += adjTrade * MARKET_ADJ_BONUS_COIN;
      if (keep?.specialization === 'market_town') {
        coin += KEEP_SPECIALIZATIONS.market_town.marketCoinBonus;
      }
      if (houseHasDecree(house, 'decree_chartered_guilds')) {
        coin += 2;
      }
      if (houseHasActiveEffect(state, houseId, 'evt_fair_season')) {
        coin += 2;
      }
    } else if (imp === 'granary') {
      food += season.granaryFoodDelta;
    }
  }

  return { food, materials, iron, coin, coinUpkeep };
}

/**
 * Computes total per-turn Food / Materials / Iron / Coin yield & upkeep for a Keep and its tiles.
 */
export function computeKeepYield(state: GameState, keepId: string): TileYield {
  const keep = state.keeps[keepId];
  if (!keep) return { food: 0, materials: 0, iron: 0, coin: 0, coinUpkeep: 0 };

  let food =
    keep.tier === 3
      ? KEEP_TIER3_BASE_FOOD
      : keep.tier === 2
        ? KEEP_TIER2_BASE_FOOD
        : KEEP_TIER1_BASE_FOOD;
  let materials =
    keep.tier === 3
      ? KEEP_TIER3_BASE_MAT
      : keep.tier === 2
        ? KEEP_TIER2_BASE_MAT
        : KEEP_TIER1_BASE_MAT;
  let iron = 0;
  let coin =
    keep.tier === 3
      ? KEEP_TIER3_BASE_COIN
      : keep.tier === 2
        ? KEEP_TIER2_BASE_COIN
        : KEEP_TIER1_BASE_COIN;
  let coinUpkeep = 0;

  if (keep.specialization !== 'none') {
    const sp = KEEP_SPECIALIZATIONS[keep.specialization];
    food += sp.foodPerTurn;
    iron += sp.ironPerTurn;
    coin += sp.coinPerTurn;
  }
  if (keep.citadelCharter === 'grand_exchange') {
    coin += 8;
  }
  if (keep.isHighSeat) {
    coin += HIGH_SEAT_BONUS_COIN;
  }

  for (const tile of getIndexedKeepTiles(state, keepId)) {
    if (tile.ownerHouseId !== keep.ownerHouseId) continue;
    const ty = computeTileYield(state, tile.key);
    food += ty.food;
    materials += ty.materials;
    iron += ty.iron;
    coin += ty.coin;
    coinUpkeep += ty.coinUpkeep;
  }

  return { food, materials, iron, coin, coinUpkeep };
}

export function computeNonKeepOwnedYield(state: GameState, houseId: HouseId): TileYield {
  let food = 0;
  let materials = 0;
  let iron = 0;
  let coin = 0;
  let coinUpkeep = 0;

  for (const tile of getIndexedHouseTiles(state, houseId)) {
    if (tile.keepId !== null) continue;
    const ty = computeTileYield(state, tile.key);
    food += ty.food;
    materials += ty.materials;
    iron += ty.iron;
    coin += ty.coin;
    coinUpkeep += ty.coinUpkeep;
  }

  return { food, materials, iron, coin, coinUpkeep };
}

// ============================================================================
// Local Military Building Checks (Per-Keep Unit Unlocks)
// ============================================================================

export function keepHasBarracks(state: GameState, keepId: string): boolean {
  const keep = state.keeps[keepId];
  if (!keep) return false;
  return getIndexedKeepTiles(state, keepId).some(
    (t) => t.ownerHouseId === keep.ownerHouseId && t.improvement === 'barracks',
  );
}

export function keepHasSmithy(state: GameState, keepId: string): boolean {
  const keep = state.keeps[keepId];
  if (!keep) return false;
  return getIndexedKeepTiles(state, keepId).some(
    (t) => t.ownerHouseId === keep.ownerHouseId && t.improvement === 'smithy',
  );
}

export function keepHasSmithyCombo(state: GameState, keepId: string): boolean {
  const keep = state.keeps[keepId];
  if (!keep) return false;

  for (const tile of getIndexedKeepTiles(state, keepId)) {
    if (tile.ownerHouseId !== keep.ownerHouseId || tile.improvement !== 'smithy') continue;
    const neighbors = getNeighbors(tile.x, tile.y, state.gridSize).map(
      (n) => state.tiles[coordKey(n.x, n.y)]!,
    );
    const hasOre = neighbors.some(
      (n) =>
        n.ownerHouseId === keep.ownerHouseId &&
        (n.improvement === 'iron_mine' || n.improvement === 'deep_smeltery'),
    );
    const hasTimberOrStone = neighbors.some(
      (n) =>
        n.ownerHouseId === keep.ownerHouseId &&
        (n.improvement === 'lumber_mill' || n.improvement === 'stone_quarry'),
    );
    if (hasOre && hasTimberOrStone) return true;
  }
  return false;
}

export function keepHasSiegeWorkshop(state: GameState, keepId: string): boolean {
  const keep = state.keeps[keepId];
  if (!keep) return false;
  return getIndexedKeepTiles(state, keepId).some(
    (t) => t.ownerHouseId === keep.ownerHouseId && t.improvement === 'siege_workshop',
  );
}

export function keepHasTrebuchetYard(state: GameState, keepId: string): boolean {
  const keep = state.keeps[keepId];
  if (!keep) return false;
  return getIndexedKeepTiles(state, keepId).some(
    (t) =>
      t.ownerHouseId === keep.ownerHouseId &&
      t.improvementLevel === 2 &&
      (t.improvement === 'smithy' || t.improvement === 'siege_workshop'),
  );
}

export function keepMeetsUnitRequirement(
  state: GameState,
  keepId: string,
  unitId: UnitId,
): boolean {
  const req = UNITS[unitId].localRequirement;
  switch (req) {
    case 'none':
      return true;
    case 'barracks':
      return keepHasBarracks(state, keepId);
    case 'barracks_and_smithy':
      return keepHasBarracks(state, keepId) && keepHasSmithy(state, keepId);
    case 'smithy_combo':
      return keepHasSmithyCombo(state, keepId);
    case 'siege_workshop':
      return keepHasSiegeWorkshop(state, keepId);
    case 'trebuchet_yard':
      return keepHasTrebuchetYard(state, keepId);
  }
}

// ============================================================================
// Improvement Construction, Level-2 Upgrades, Roads, Clear Timber & Outposts
// ============================================================================

export function getImprovementCosts(
  state: GameState,
  houseId: HouseId,
  improvementId: ImprovementId,
): ResourceCost {
  const house = state.houses[houseId];
  const def = IMPROVEMENTS[improvementId];
  let materials =
    houseId === 'ironhelm' && def.ironhelmMatCost !== null ? def.ironhelmMatCost : def.matCost;
  let iron = def.ironCost;
  const coin = def.coinCost;

  if (improvementId === 'watchtower' && houseHasDecree(house, 'decree_border_wardens')) {
    materials = Math.max(2, materials - 2);
  }
  if (
    (improvementId === 'smithy' || improvementId === 'siege_workshop') &&
    houseHasDecree(house, 'decree_royal_extraction')
  ) {
    iron = Math.max(0, iron - 2);
  }
  return { materials, iron, coin };
}

export function getImprovementCost(houseId: HouseId, improvementId: ImprovementId): number {
  const def = IMPROVEMENTS[improvementId];
  if (houseId === 'ironhelm' && def.ironhelmMatCost !== null) return def.ironhelmMatCost;
  return def.matCost;
}

function getEffectiveKeepTierForTile(state: GameState, houseId: HouseId, tile: TileState): number {
  if (tile.keepId && state.keeps[tile.keepId]) {
    return state.keeps[tile.keepId]!.tier;
  }
  // Outpost or border-projected tile uses House's highest Keep tier (max 2 for outposts unless T3 exists)
  const keeps = getHouseKeeps(state, houseId);
  return keeps.reduce((m, k) => Math.max(m, k.tier), 1);
}

function getMaxFortificationHpForHouse(
  house: HouseState | undefined,
  improvementId: ImprovementId,
  level: 1 | 2,
): number | null {
  const def = IMPROVEMENTS[improvementId];
  const base =
    level === 2 && def.upgrade ? def.upgrade.maxFortificationHp : def.maxFortificationHp;
  if (base === null) return null;
  return houseHasDecree(house, 'decree_stone_curtain')
    ? Math.round(base * KEEP_STONE_CURTAIN_HP_MULT)
    : base;
}

export function canBuildImprovement(
  state: GameState,
  houseId: HouseId,
  tileKey: CoordKey,
  improvementId: ImprovementId,
): boolean {
  const house = state.houses[houseId];
  const tile = state.tiles[tileKey];
  if (!house || house.isEliminated || !tile) return false;
  if (tile.improvement !== null) return false;
  if (getKeepAt(state, tileKey) !== null || getOutpostAt(state, tileKey) !== null) return false;
  if (tile.landmark !== 'none' && !tile.landmarkCleared) return false;

  const def = IMPROVEMENTS[improvementId];
  if (def.houseId !== null && def.houseId !== houseId) return false;

  // Ownership check: owned tile, OR Watchtower 1 tile outside friendly border
  const isOwned = tile.ownerHouseId === houseId;
  const canProjectOutside =
    !isOwned &&
    tile.ownerHouseId === null &&
    def.allowOneTileOutsideBorder &&
    getNeighbors(tile.x, tile.y, state.gridSize).some(
      (n) => state.tiles[coordKey(n.x, n.y)]?.ownerHouseId === houseId,
    );

  if (!isOwned && !canProjectOutside) return false;

  // Military buildings must belong to an actual Keep (not an Outpost)
  if (def.isMilitaryBuilding && tile.keepId === null) return false;

  // Keep tier gate
  const tier = getEffectiveKeepTierForTile(state, houseId, tile);
  if (tier < def.minKeepTier) return false;

  const costs = getImprovementCosts(state, houseId, improvementId);
  if (
    house.resources.materials < costs.materials ||
    house.resources.iron < costs.iron ||
    house.resources.coin < costs.coin
  ) {
    return false;
  }

  if (!def.validTerrains.includes(tile.terrain)) return false;

  if (def.requiresIronDeposit) {
    const bareMountainOk = def.allowsBareMountainForOwner && tile.terrain === 'mountain';
    if (!tile.hasIronDeposit && !bareMountainOk) return false;
    // Cap House Ironhelm bare-mountain Deep Smelteries to 2 per Keep (unlimited on real Iron Deposits)
    if (improvementId === 'deep_smeltery' && !tile.hasIronDeposit) {
      if (!tile.keepId) return false;
      const bareSmelteries = getIndexedKeepTiles(state, tile.keepId).filter(
        (t) => t.improvement === 'deep_smeltery' && !t.hasIronDeposit,
      ).length;
      if (bareSmelteries >= 2) return false;
    }
  }

  // Per-Keep Wall Cap
  if (improvementId === 'palisade' && tile.keepId) {
    const keep = state.keeps[tile.keepId];
    if (!keep) return false;
    const count = getIndexedKeepTiles(state, keep.id).filter(
      (t) => t.improvement === 'palisade',
    ).length;
    if (count >= getKeepWallCap(keep)) return false;
  }

  // Per-Keep Watchtower / Signal Bastion Cap (or house-wide border cap)
  if (improvementId === 'watchtower' || improvementId === 'signal_bastion') {
    if (tile.keepId && state.keeps[tile.keepId]) {
      const keep = state.keeps[tile.keepId]!;
      const count = getIndexedKeepTiles(state, keep.id).filter(
        (t) => t.improvement === 'watchtower' || t.improvement === 'signal_bastion',
      ).length;
      if (count >= getKeepWatchtowerCap(keep)) return false;
    } else if (canProjectOutside) {
      const totalBorderTowers = getIndexedHouseTiles(state, houseId).filter(
        (t) =>
          (t.improvement === 'watchtower' || t.improvement === 'signal_bastion') &&
          t.keepId === null &&
          t.outpostId === null,
      ).length;
      if (totalBorderTowers >= getHouseKeeps(state, houseId).length * 2) return false;
    }
  }

  // War Camp Limits: 1/Keep, 3/House
  if (improvementId === 'war_camp') {
    if (!tile.keepId) return false;
    const inKeep = getIndexedKeepTiles(state, tile.keepId).filter(
      (t) => t.improvement === 'war_camp',
    ).length;
    if (inKeep >= WAR_CAMP_MAX_PER_KEEP) return false;
    const inHouse = getIndexedHouseTiles(state, houseId).filter(
      (t) => t.improvement === 'war_camp',
    ).length;
    if (inHouse >= WAR_CAMP_MAX_PER_HOUSE) return false;
  }

  return true;
}

export function buildImprovement(
  state: GameState,
  houseId: HouseId,
  tileKey: CoordKey,
  improvementId: ImprovementId,
): GameState {
  if (!canBuildImprovement(state, houseId, tileKey, improvementId)) return state;
  const house = state.houses[houseId]!;
  const tile = state.tiles[tileKey]!;
  const costs = getImprovementCosts(state, houseId, improvementId);
  const fortHp = getMaxFortificationHpForHouse(house, improvementId, 1);

  let nextState: GameState = {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        resources: {
          materials: house.resources.materials - costs.materials,
          iron: house.resources.iron - costs.iron,
          coin: house.resources.coin - costs.coin,
        },
      },
    },
    tiles: {
      ...state.tiles,
      [tileKey]: {
        ...tile,
        ownerHouseId: houseId,
        improvement: improvementId,
        improvementLevel: 1,
        fortificationHp: fortHp,
      },
    },
  };

  if (
    improvementId === 'watchtower' ||
    improvementId === 'signal_bastion' ||
    improvementId === 'peak_beacon'
  ) {
    nextState = recomputeHouseFog(nextState, houseId);
  }
  if (improvementId === 'war_camp') {
    nextState = autoRehomeOrphans(nextState, houseId);
  }

  return nextState;
}

export function getImprovementUpgradeCosts(
  state: GameState,
  houseId: HouseId,
  improvementId: ImprovementId,
): ResourceCost | null {
  const upg = IMPROVEMENTS[improvementId].upgrade;
  if (!upg) return null;
  const house = state.houses[houseId];
  let iron = upg.ironCost;
  if (improvementId === 'palisade' && houseHasDecree(house, 'decree_stone_curtain')) {
    iron = Math.max(0, iron - 2);
  }
  return {
    materials: upg.matCost,
    iron,
    coin: upg.coinCost,
  };
}

export function canUpgradeImprovement(
  state: GameState,
  houseId: HouseId,
  tileKey: CoordKey,
): boolean {
  const house = state.houses[houseId];
  const tile = state.tiles[tileKey];
  if (!house || house.isEliminated || !tile) return false;
  if (tile.ownerHouseId !== houseId || tile.improvement === null || tile.improvementLevel >= 2) {
    return false;
  }
  const def = IMPROVEMENTS[tile.improvement];
  if (!def.upgrade) return false;

  const tier = getEffectiveKeepTierForTile(state, houseId, tile);
  if (tier < def.upgrade.minKeepTier) return false;

  const costs = getImprovementUpgradeCosts(state, houseId, tile.improvement);
  if (!costs) return false;
  return (
    house.resources.materials >= costs.materials &&
    house.resources.iron >= costs.iron &&
    house.resources.coin >= costs.coin
  );
}

export function upgradeImprovement(
  state: GameState,
  houseId: HouseId,
  tileKey: CoordKey,
): GameState {
  if (!canUpgradeImprovement(state, houseId, tileKey)) return state;
  const house = state.houses[houseId]!;
  const tile = state.tiles[tileKey]!;
  const impId = tile.improvement!;
  const upg = IMPROVEMENTS[impId].upgrade!;
  const costs = getImprovementUpgradeCosts(state, houseId, impId)!;
  const nextFortHp = getMaxFortificationHpForHouse(house, impId, 2);

  let nextState: GameState = {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        resources: {
          materials: house.resources.materials - costs.materials,
          iron: house.resources.iron - costs.iron,
          coin: house.resources.coin - costs.coin,
        },
      },
    },
    tiles: {
      ...state.tiles,
      [tileKey]: {
        ...tile,
        improvementLevel: 2,
        fortificationHp: nextFortHp,
      },
    },
  };

  nextState = appendChronicle(nextState, {
    type: 'improvement_upgraded',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey,
    summary: `Upgraded ${IMPROVEMENTS[impId].name} to ${upg.name}.`,
    isPublic: false,
  });

  return nextState;
}

export function getRoadCost(house: HouseState | undefined): number {
  return houseHasDecree(house, 'decree_royal_roads')
    ? ROAD_ROYAL_NETWORK_MAT_COST
    : ROAD_MAT_COST;
}

export function canBuildRoad(state: GameState, houseId: HouseId, tileKey: CoordKey): boolean {
  const house = state.houses[houseId];
  const tile = state.tiles[tileKey];
  if (!house || house.isEliminated || !tile) return false;
  if (tile.ownerHouseId !== houseId || tile.hasRoad) return false;
  if (tile.terrain === 'mountain' || tile.terrain === 'river') return false;
  return house.resources.materials >= getRoadCost(house);
}

export function buildRoad(state: GameState, houseId: HouseId, tileKey: CoordKey): GameState {
  if (!canBuildRoad(state, houseId, tileKey)) return state;
  const house = state.houses[houseId]!;
  const tile = state.tiles[tileKey]!;
  const cost = getRoadCost(house);
  return {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        resources: { ...house.resources, materials: house.resources.materials - cost },
      },
    },
    tiles: {
      ...state.tiles,
      [tileKey]: { ...tile, hasRoad: true },
    },
  };
}

export function canClearTimber(state: GameState, houseId: HouseId, tileKey: CoordKey): boolean {
  const house = state.houses[houseId];
  const tile = state.tiles[tileKey];
  if (!house || house.isEliminated || !tile) return false;
  if (tile.ownerHouseId !== houseId || tile.terrain !== 'forest' || tile.improvement !== null) {
    return false;
  }
  if (tile.landmark !== 'none' && !tile.landmarkCleared) return false;
  return house.resources.coin >= CLEAR_TIMBER_COIN_COST;
}

export function clearTimber(state: GameState, houseId: HouseId, tileKey: CoordKey): GameState {
  if (!canClearTimber(state, houseId, tileKey)) return state;
  const house = state.houses[houseId]!;
  const tile = state.tiles[tileKey]!;
  return {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        resources: {
          ...house.resources,
          coin: house.resources.coin - CLEAR_TIMBER_COIN_COST,
          materials: house.resources.materials + CLEAR_TIMBER_MAT_GAIN,
        },
      },
    },
    tiles: {
      ...state.tiles,
      [tileKey]: { ...tile, terrain: 'plains' },
    },
  };
}

export function canBuildOutpost(
  state: GameState,
  unitId: string,
  tileKey: CoordKey,
): boolean {
  const unit = state.units[unitId];
  const tile = state.tiles[tileKey];
  if (!unit || !tile || unit.hasAttacked) return false;
  if (UNITS[unit.typeId].unitClass === 'siege') return false;
  const house = state.houses[unit.houseId];
  if (!house || house.isEliminated) return false;
  if (getHouseOutposts(state, unit.houseId).length >= getHouseOutpostCap(house)) return false;
  if (
    house.resources.materials < OUTPOST_MAT_COST ||
    house.resources.coin < OUTPOST_COIN_COST
  ) {
    return false;
  }
  if (chebyshevDist(unit.x, unit.y, tile.x, tile.y) > 1) return false;
  if (tile.ownerHouseId !== null || tile.keepId !== null || tile.outpostId !== null) return false;
  if (tile.terrain === 'mountain' || tile.terrain === 'river') return false;
  if (tile.landmark !== 'none' && !tile.landmarkCleared) return false;

  for (const k of Object.values(state.keeps)) {
    if (chebyshevDist(k.x, k.y, tile.x, tile.y) < OUTPOST_MIN_KEEP_DIST) return false;
  }
  for (const o of Object.values(state.outposts)) {
    if (chebyshevDist(o.x, o.y, tile.x, tile.y) < OUTPOST_MIN_OUTPOST_DIST) return false;
  }
  return true;
}

export function buildOutpost(state: GameState, unitId: string, tileKey: CoordKey): GameState {
  if (!canBuildOutpost(state, unitId, tileKey)) return state;
  const unit = state.units[unitId]!;
  const tile = state.tiles[tileKey]!;
  const house = state.houses[unit.houseId]!;
  const outpostId = `outpost_${state.nextOutpostSeq}`;
  const num = house.outpostsFoundedCount + 1;
  const outpost: OutpostState = {
    id: outpostId,
    name: `${HOUSES[unit.houseId].name.replace('House ', '')} Outpost ${num}`,
    ownerHouseId: unit.houseId,
    tileKey,
    x: tile.x,
    y: tile.y,
    hp: OUTPOST_MAX_HP,
    maxHp: OUTPOST_MAX_HP,
    damagedLastRound: false,
  };

  let nextState: GameState = {
    ...state,
    outposts: { ...state.outposts, [outpostId]: outpost },
    nextOutpostSeq: state.nextOutpostSeq + 1,
    units: {
      ...state.units,
      [unitId]: { ...unit, hasAttacked: true, remainingMovement: 0 },
    },
    houses: {
      ...state.houses,
      [unit.houseId]: {
        ...house,
        outpostsFoundedCount: num,
        resources: {
          ...house.resources,
          materials: house.resources.materials - OUTPOST_MAT_COST,
          coin: house.resources.coin - OUTPOST_COIN_COST,
        },
      },
    },
  };

  nextState = claimOutpostTerritory(nextState, outpostId);
  nextState = permanentlyRevealRadius(nextState, unit.houseId, tile.x, tile.y, OUTPOST_RADIUS + 1);
  nextState = recomputeHouseFog(nextState, unit.houseId);
  nextState = appendChronicle(nextState, {
    type: 'outpost_founded',
    actorHouseId: unit.houseId,
    targetHouseId: null,
    tileKey,
    summary: `House ${unit.houseId} established ${outpost.name}.`,
    isPublic: false,
  });

  return nextState;
}

// ============================================================================
// Unit Costs, Training, Tier-3 Citadel Upgrade & Active Field Reinforce
// ============================================================================

export function getUnitTrainingCosts(
  state: GameState,
  houseId: HouseId,
  keepId: string,
  unitId: UnitId,
): { readonly materials: number; readonly iron: number } {
  const house = state.houses[houseId];
  const keep = state.keeps[keepId];
  const def = UNITS[unitId];
  let materials = def.matCost;
  let iron = def.ironCost;

  // Feudal Levy Muster: Tier-1 units -2 Mat
  if (
    houseHasDecree(house, 'decree_feudal_levies') &&
    (unitId === 'militia' || unitId === 'spearman' || unitId === 'archer' || unitId === 'sapper_crew')
  ) {
    materials = Math.max(FEUDAL_LEVIES_MIN_MAT_COST, materials - FEUDAL_LEVIES_MAT_DISCOUNT);
  }

  const keepTiles = keep ? getIndexedKeepTiles(state, keepId) : [];

  // Highland Pasture: Cavalry -2 Mat
  if (
    def.unitClass === 'cavalry' &&
    keepTiles.some((t) => t.ownerHouseId === houseId && t.improvement === 'highland_pasture')
  ) {
    materials = Math.max(4, materials - 2);
  }

  // Forge Seat specialization: -2 Iron
  if (keep?.specialization === 'forge_seat') {
    iron = Math.max(0, iron - KEEP_SPECIALIZATIONS.forge_seat.unitIronDiscount);
  }

  // Grand Foundry (Lv2 Smithy): -2 Iron
  if (
    keepTiles.some(
      (t) => t.ownerHouseId === houseId && t.improvement === 'smithy' && t.improvementLevel === 2,
    )
  ) {
    iron = Math.max(0, iron - 2);
  }

  // Royal Engine Yard (Lv2 Siege Workshop): Siege -2 Mat & -2 Iron
  if (
    def.unitClass === 'siege' &&
    keepTiles.some(
      (t) =>
        t.ownerHouseId === houseId &&
        t.improvement === 'siege_workshop' &&
        t.improvementLevel === 2,
    )
  ) {
    materials = Math.max(4, materials - 2);
    iron = Math.max(0, iron - 2);
  }

  return { materials, iron };
}

export function getUnitMatCost(house: HouseState, unitId: UnitId): number {
  const base = UNITS[unitId].matCost;
  if (
    houseHasDecree(house, 'decree_feudal_levies') &&
    (unitId === 'militia' || unitId === 'spearman' || unitId === 'archer' || unitId === 'sapper_crew')
  ) {
    return Math.max(FEUDAL_LEVIES_MIN_MAT_COST, base - FEUDAL_LEVIES_MAT_DISCOUNT);
  }
  return base;
}

export function getUnitUpkeep(
  _house: HouseState,
  unitId: UnitId,
  homeKeep?: KeepState | null,
): number {
  let base = UNITS[unitId].coinUpkeep;
  if (homeKeep?.citadelCharter === 'high_armory' && base > 0) {
    const minUpk = UNITS[unitId].ironCost > 0 ? 1 : 0;
    base = Math.max(minUpk, base - 1);
  }
  return base;
}

export function canTrainUnit(
  state: GameState,
  houseId: HouseId,
  keepId: string,
  unitId: UnitId,
): boolean {
  const house = state.houses[houseId];
  const keep = state.keeps[keepId];
  if (!house || house.isEliminated || !keep || keep.ownerHouseId !== houseId) return false;

  const def = UNITS[unitId];
  if (def.isEventOnly || def.isCommanderUnit) return false;
  if (def.houseId !== null && def.houseId !== houseId) return false;
  if (!keepMeetsUnitRequirement(state, keepId, unitId)) return false;

  if (getUnitAt(state, keep.tileKey) !== null) return false;

  const cap = getKeepArmyCap(state, keepId);
  const used = getKeepSupportedUnitIds(state, keepId).length;
  if (used >= cap) return false;

  const costs = getUnitTrainingCosts(state, houseId, keepId, unitId);
  return house.resources.materials >= costs.materials && house.resources.iron >= costs.iron;
}

export function trainUnit(
  state: GameState,
  houseId: HouseId,
  keepId: string,
  unitId: UnitId,
): GameState {
  if (!canTrainUnit(state, houseId, keepId, unitId)) return state;
  const house = state.houses[houseId]!;
  const keep = state.keeps[keepId]!;
  const def = UNITS[unitId];
  const costs = getUnitTrainingCosts(state, houseId, keepId, unitId);
  const keepTiles = getIndexedKeepTiles(state, keepId);
  const newUnitId = `unit_${state.nextUnitSeq}`;

  let maxHp = def.maxHp;
  let startXp = 0;

  if (
    def.unitClass === 'siege' &&
    keepTiles.some((t) => t.ownerHouseId === houseId && t.improvement === 'siege_workshop')
  ) {
    maxHp += 2;
  }
  if (keep.citadelCharter === 'high_armory') {
    maxHp += 2;
  }
  if (
    keepTiles.some(
      (t) => t.ownerHouseId === houseId && t.improvement === 'barracks' && t.improvementLevel === 2,
    )
  ) {
    startXp += 2;
  }
  if (
    def.unitClass === 'cavalry' &&
    keepTiles.some(
      (t) =>
        t.ownerHouseId === houseId &&
        t.improvement === 'highland_pasture' &&
        t.improvementLevel === 2,
    )
  ) {
    startXp += 1;
  }

  let queueHonor = false;
  if (keep.citadelCharter === 'war_college') {
    startXp = Math.max(startXp, VETERANCY_RANK1_XP);
    maxHp += VETERANCY_HP_PER_RANK;
    queueHonor = true;
  }

  const unit: UnitState = {
    id: newUnitId,
    houseId,
    typeId: unitId,
    homeKeepId: keepId,
    tileKey: keep.tileKey,
    x: keep.x,
    y: keep.y,
    hp: maxHp,
    maxHp,
    remainingMovement: 0,
    hasMoved: true,
    hasAttacked: true,
    spawnedOnTurn: state.turnNumber,
    isMutinied: false,
    damagedSinceLastTurn: false,
    xp: startXp,
    isFortified: false,
    isOverwatch: false,
    isDeployed: false,
    isCommander: false,
    movedOpenTilesThisTurn: 0,
    battleHonors: [],
    overwatchRangeBonusUntilTurn: 0,
    commanderBuffUntilTurn: 0,
  };

  let nextState: GameState = {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        pendingHonorUnitIds: queueHonor
          ? [...house.pendingHonorUnitIds, newUnitId]
          : house.pendingHonorUnitIds,
        resources: {
          ...house.resources,
          materials: house.resources.materials - costs.materials,
          iron: house.resources.iron - costs.iron,
        },
      },
    },
    units: { ...state.units, [newUnitId]: unit },
    nextUnitSeq: state.nextUnitSeq + 1,
  };

  nextState = recomputeHouseFog(nextState, houseId);
  return nextState;
}

export function canUpgradeKeepToTier3(
  state: GameState,
  houseId: HouseId,
  keepId: string,
): boolean {
  const house = state.houses[houseId];
  const keep = state.keeps[keepId];
  if (!house || house.isEliminated || !keep || keep.ownerHouseId !== houseId) return false;
  if (keep.tier !== 2) return false;
  const threshold = getKeepFoodThreshold(keep);
  return keep.foodProgress >= threshold && house.resources.iron >= KEEP_TIER3_IRON_COST;
}

export function upgradeKeepToTier3(
  state: GameState,
  houseId: HouseId,
  keepId: string,
): GameState {
  if (!canUpgradeKeepToTier3(state, houseId, keepId)) return state;
  const house = state.houses[houseId]!;
  const keep = state.keeps[keepId]!;
  const threshold = getKeepFoodThreshold(keep);
  const hadAnyTier3 = getHouseKeeps(state, houseId).some((k) => k.tier === 3);

  const upgradedKeepBase: KeepState = {
    ...keep,
    tier: 3,
    foodProgress: keep.foodProgress - threshold,
  };
  const newMaxHp = computeKeepMaxHp(upgradedKeepBase, house);
  const hpGain = Math.max(0, newMaxHp - keep.maxKeepHp);
  const upgradedKeep: KeepState = {
    ...upgradedKeepBase,
    maxKeepHp: newMaxHp,
    keepHp: Math.min(newMaxHp, keep.keepHp + hpGain),
  };

  let nextState: GameState = {
    ...state,
    keeps: { ...state.keeps, [keepId]: upgradedKeep },
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        resources: { ...house.resources, iron: house.resources.iron - KEEP_TIER3_IRON_COST },
        pendingCitadelKeepIds: [...house.pendingCitadelKeepIds, keepId],
        pendingDraftCount: house.pendingDraftCount + (hadAnyTier3 ? 0 : 1),
      },
    },
  };

  nextState = claimKeepTerritory(nextState, keepId);
  nextState = autoRehomeOrphans(nextState, houseId);
  nextState = recomputeHouseFog(nextState, houseId);
  nextState = appendChronicle(nextState, {
    type: 'keep_upgraded',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey: keep.tileKey,
    summary: `${keep.name} rose into a Tier-3 Grand Citadel!`,
    isPublic: true,
  });

  return nextState;
}

export function getReinforceCost(state: GameState, unitId: string): ResourceCost {
  const unit = state.units[unitId];
  if (!unit) return { materials: 0, iron: 0, coin: 0 };
  const house = state.houses[unit.houseId];
  const def = UNITS[unit.typeId];
  const isHeavy = def.ironCost > 0 || unit.isCommander;
  let coin = isHeavy ? REINFORCE_HEAVY_COIN : REINFORCE_STANDARD_COIN;
  let materials = isHeavy ? 0 : REINFORCE_STANDARD_MAT;
  const iron = isHeavy && !unit.isCommander ? REINFORCE_HEAVY_IRON : 0;

  if (houseHasDecree(house, 'decree_standing_corps')) {
    coin = Math.max(1, Math.round(coin * 0.75));
  }
  if (
    isAdjacentToFriendlyCommander(state, unit) &&
    hasCommanderTrait(state, unit.houseId, 'trait_quartermaster')
  ) {
    coin = 0;
    materials = 0;
  }
  return { materials, iron, coin };
}

export function canReinforceUnit(state: GameState, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit || unit.hasAttacked || unit.hp >= unit.maxHp) return false;
  if (unit.spawnedOnTurn === state.turnNumber || unit.homeKeepId === 'orphaned') return false;
  const house = state.houses[unit.houseId];
  if (!house || house.isEliminated) return false;

  // Must be in friendly territory OR within 1 tile of friendly Keep, Outpost, or Lord-Commander
  const tile = state.tiles[unit.tileKey];
  const inSupply =
    tile?.ownerHouseId === unit.houseId ||
    isAdjacentToFriendlyCommander(state, unit) ||
    getHouseKeeps(state, unit.houseId).some((k) => chebyshevDist(k.x, k.y, unit.x, unit.y) <= 1) ||
    getHouseOutposts(state, unit.houseId).some((o) => chebyshevDist(o.x, o.y, unit.x, unit.y) <= 1);
  if (!inSupply) return false;

  const cost = getReinforceCost(state, unitId);
  return (
    house.resources.materials >= cost.materials &&
    house.resources.iron >= cost.iron &&
    house.resources.coin >= cost.coin
  );
}

export function reinforceUnit(state: GameState, unitId: string): GameState {
  if (!canReinforceUnit(state, unitId)) return state;
  const unit = state.units[unitId]!;
  const house = state.houses[unit.houseId]!;
  const cost = getReinforceCost(state, unitId);
  const heal = houseHasDecree(house, 'decree_field_surgeons')
    ? REINFORCE_SURGEONS_HEAL_AMOUNT
    : REINFORCE_HEAL_AMOUNT;
  const nextHp = Math.min(unit.maxHp, unit.hp + heal);

  let nextState: GameState = {
    ...state,
    houses: {
      ...state.houses,
      [unit.houseId]: {
        ...house,
        resources: {
          materials: house.resources.materials - cost.materials,
          iron: house.resources.iron - cost.iron,
          coin: house.resources.coin - cost.coin,
        },
      },
    },
    units: {
      ...state.units,
      [unitId]: {
        ...unit,
        hp: nextHp,
        hasAttacked: true,
        remainingMovement: 0,
      },
    },
  };

  nextState = appendChronicle(nextState, {
    type: 'unit_reinforced',
    actorHouseId: unit.houseId,
    targetHouseId: null,
    tileKey: unit.tileKey,
    summary: `Reinforced ${UNITS[unit.typeId].name} (+${nextHp - unit.hp} HP).`,
    isPublic: false,
  });

  return nextState;
}

// ============================================================================
// Peaceful Frontier Village Annexation
// ============================================================================

export function getPeacefulAnnexCost(
  state: GameState,
  houseId: HouseId,
): { coin: number; food: number } {
  const house = state.houses[houseId];
  const hasGuilds = houseHasDecree(house, 'decree_chartered_guilds');
  const hasMarketTown = getHouseKeeps(state, houseId).some(
    (k) => k.specialization === 'market_town',
  );

  let coinDiscount = 0;
  if (hasGuilds) coinDiscount += CHARTERED_GUILDS_ANNEX_DISCOUNT;
  if (hasMarketTown) coinDiscount += MARKET_TOWN_ANNEX_COIN_DISCOUNT;
  coinDiscount = Math.min(MAX_ANNEX_COIN_DISCOUNT, coinDiscount);

  const coin = Math.round(VILLAGE_ANNEX_COIN_COST * (1 - coinDiscount));
  const food = hasGuilds
    ? Math.floor(VILLAGE_ANNEX_FOOD_COST * (1 - CHARTERED_GUILDS_ANNEX_DISCOUNT))
    : VILLAGE_ANNEX_FOOD_COST;

  return { coin, food };
}

export function findAnnexFoodKeep(
  state: GameState,
  houseId: HouseId,
  villageCoord: Coord,
  requiredFood: number,
): KeepState | null {
  const eligible = getHouseKeeps(state, houseId).filter((k) => k.foodProgress >= requiredFood);
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => {
    const da = chebyshevDist(a.x, a.y, villageCoord.x, villageCoord.y);
    const db = chebyshevDist(b.x, b.y, villageCoord.x, villageCoord.y);
    if (da !== db) return da - db;
    if (b.foodProgress !== a.foodProgress) return b.foodProgress - a.foodProgress;
    return a.id.localeCompare(b.id);
  });
  return eligible[0]!;
}

export function canAnnexVillage(state: GameState, houseId: HouseId, tileKey: CoordKey): boolean {
  const house = state.houses[houseId];
  const tile = state.tiles[tileKey];
  if (!house || house.isEliminated || !tile) return false;
  if (tile.landmark !== 'frontier_village' || tile.villageHp === null || tile.villageHp <= 0) {
    return false;
  }
  if (getUnitAt(state, tileKey) !== null) return false;

  let hasFriendlyAdj = false;
  for (const n of getNeighbors(tile.x, tile.y, state.gridSize)) {
    const u = getUnitAt(state, coordKey(n.x, n.y));
    if (!u) continue;
    if (u.houseId === houseId) hasFriendlyAdj = true;
    else return false;
  }
  if (!hasFriendlyAdj) return false;

  const { coin, food } = getPeacefulAnnexCost(state, houseId);
  if (house.resources.coin < coin) return false;
  if (findAnnexFoodKeep(state, houseId, tile, food) === null) return false;

  return true;
}

export function annexVillage(state: GameState, houseId: HouseId, tileKey: CoordKey): GameState {
  if (!canAnnexVillage(state, houseId, tileKey)) return state;
  const tile = state.tiles[tileKey]!;
  const { coin, food } = getPeacefulAnnexCost(state, houseId);
  const foodKeep = findAnnexFoodKeep(state, houseId, tile, food)!;

  let house = state.houses[houseId]!;
  const { name, updatedHouse: namedHouse } = allocateSettlementName(house);
  house = addFavor(namedHouse, VILLAGE_ANNEX_FAVOR_GAIN);
  house = {
    ...house,
    resources: { ...house.resources, coin: house.resources.coin - coin },
    writProgress: {
      ...house.writProgress,
      writ_annex: (house.writProgress.writ_annex ?? 0) + 1,
    },
  };

  const keepId = `keep_${state.nextKeepSeq}`;
  const baseMaxHp = houseHasDecree(house, 'decree_stone_curtain')
    ? Math.round(KEEP_TIER1_MAX_HP * KEEP_STONE_CURTAIN_HP_MULT)
    : KEEP_TIER1_MAX_HP;
  const newKeep: KeepState = {
    id: keepId,
    name,
    ownerHouseId: houseId,
    tileKey,
    x: tile.x,
    y: tile.y,
    tier: 1,
    isCapital: false,
    isHighSeat: false,
    specialization: 'none',
    citadelCharter: 'none',
    keepHp: baseMaxHp,
    maxKeepHp: baseMaxHp,
    damagedLastRound: false,
    garrisonVolleyUsedThisTurn: false,
    foodProgress: 0,
    repeatMilestonesClaimed: 0,
  };

  let nextState: GameState = {
    ...state,
    tiles: {
      ...state.tiles,
      [tileKey]: {
        ...tile,
        landmark: 'none',
        landmarkCleared: true,
        villageHp: null,
        villageDamagedLastRound: false,
      },
    },
    keeps: {
      ...state.keeps,
      [foodKeep.id]: { ...foodKeep, foodProgress: foodKeep.foodProgress - food },
      [keepId]: newKeep,
    },
    houses: { ...state.houses, [houseId]: house },
    nextKeepSeq: state.nextKeepSeq + 1,
  };

  nextState = claimKeepTerritory(nextState, keepId);
  nextState = permanentlyRevealRadius(nextState, houseId, tile.x, tile.y, KEEP_TIER1_RADIUS);
  nextState = autoRehomeOrphans(nextState, houseId);
  nextState = recomputeHouseFog(nextState, houseId);
  nextState = appendChronicle(nextState, {
    type: 'village_annexed',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey,
    summary: `House ${houseId} peacefully annexed ${name} (+1 Favor).`,
    isPublic: true,
  });

  return nextState;
}

// ============================================================================
// Lord-Commander Recovery, Harvest & Upkeep, Winter Provisioning & Bastion Volley
// ============================================================================

function respawnLordCommander(state: GameState, houseId: HouseId): GameState {
  const cmd = state.commanders[houseId];
  if (!cmd || cmd.unitId !== null) return state;
  const keeps = getHouseKeeps(state, houseId);
  if (keeps.length === 0) return state;
  const capital = keeps.find((k) => k.isCapital) ?? keeps.sort((a, b) => a.id.localeCompare(b.id))[0]!;

  let spawnKey: CoordKey | null;
  if (getUnitAt(state, capital.tileKey) === null) {
    spawnKey = capital.tileKey;
  } else {
    const candidates = getIndexedKeepTiles(state, capital.id)
      .filter((t) => t.terrain !== 'mountain' && getUnitAt(state, t.key) === null)
      .sort((a, b) => {
        const da = chebyshevDist(a.x, a.y, capital.x, capital.y);
        const db = chebyshevDist(b.x, b.y, capital.x, capital.y);
        return da !== db ? da - db : a.key.localeCompare(b.key);
      });
    spawnKey = candidates[0]?.key ?? null;
  }
  if (!spawnKey) return state;

  const tile = state.tiles[spawnKey]!;
  const maxHp = COMMANDER_BASE_HP + (cmd.level - 1) * 3;
  const unitId = `unit_${state.nextUnitSeq}`;
  const unit: UnitState = {
    id: unitId,
    houseId,
    typeId: 'lord_commander',
    homeKeepId: 'commander',
    tileKey: spawnKey,
    x: tile.x,
    y: tile.y,
    hp: maxHp,
    maxHp,
    remainingMovement: 0,
    hasMoved: true,
    hasAttacked: true,
    spawnedOnTurn: state.turnNumber,
    isMutinied: false,
    damagedSinceLastTurn: false,
    xp: 0,
    isFortified: false,
    isOverwatch: false,
    isDeployed: false,
    isCommander: true,
    movedOpenTilesThisTurn: 0,
    battleHonors: [],
    overwatchRangeBonusUntilTurn: 0,
    commanderBuffUntilTurn: 0,
  };

  let nextState: GameState = {
    ...state,
    units: { ...state.units, [unitId]: unit },
    nextUnitSeq: state.nextUnitSeq + 1,
    commanders: {
      ...state.commanders,
      [houseId]: {
        ...cmd,
        unitId,
        woundedTurnsRemaining: 0,
      },
    },
  };
  nextState = recomputeHouseFog(nextState, houseId);
  nextState = appendChronicle(nextState, {
    type: 'commander_rallied',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey: spawnKey,
    summary: `${HOUSES[houseId].commanderName} has recovered and returned to ${capital.name}!`,
    isPublic: false,
  });
  return nextState;
}

export function canRallyCommanderEarly(state: GameState, houseId: HouseId): boolean {
  const cmd = state.commanders[houseId];
  const house = state.houses[houseId];
  if (!cmd || !house || house.isEliminated || cmd.unitId !== null) return false;
  if (cmd.woundedTurnsRemaining <= 0 || cmd.woundedTurnsRemaining > COMMANDER_EARLY_RALLY_MAX_TURNS) {
    return false;
  }
  return house.resources.coin >= COMMANDER_EARLY_RALLY_COIN;
}

export function rallyCommanderEarly(state: GameState, houseId: HouseId): GameState {
  if (!canRallyCommanderEarly(state, houseId)) return state;
  const house = state.houses[houseId]!;
  let nextState: GameState = {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        resources: { ...house.resources, coin: house.resources.coin - COMMANDER_EARLY_RALLY_COIN },
      },
    },
  };
  nextState = respawnLordCommander(nextState, houseId);
  return nextState;
}

export function processHarvestAndUpkeep(state: GameState, houseId: HouseId): GameState {
  let house = state.houses[houseId];
  if (!house || house.isEliminated) return state;

  // 1. Reset unit flags, Overwatch expiry, Charge counter & Commander cooldowns
  const nextUnits: Record<string, UnitState> = { ...state.units };
  for (const [uid, u] of Object.entries(nextUnits)) {
    if (u.houseId !== houseId) continue;
    nextUnits[uid] = {
      ...u,
      hasMoved: false,
      hasAttacked: false,
      isMutinied: false,
      isOverwatch: false,
      movedOpenTilesThisTurn: 0,
      remainingMovement: getUnitMaxMovement(state, u),
    };
  }

  let nextCommanders = state.commanders;
  let shouldRespawnCmd = false;
  const cmd = state.commanders[houseId];
  if (cmd) {
    const nextCd = Math.max(0, cmd.skillCooldown - 1);
    const nextWounded =
      cmd.unitId === null && cmd.woundedTurnsRemaining > 0
        ? cmd.woundedTurnsRemaining - 1
        : cmd.woundedTurnsRemaining;
    if (cmd.unitId === null && cmd.woundedTurnsRemaining > 0 && nextWounded === 0) {
      shouldRespawnCmd = true;
    }
    nextCommanders = {
      ...state.commanders,
      [houseId]: {
        ...cmd,
        skillCooldown: nextCd,
        woundedTurnsRemaining: nextWounded,
        markedTargetUnitId: null,
      },
    };
  }

  let nextState: GameState = {
    ...state,
    units: nextUnits,
    commanders: nextCommanders,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        audienceUsedThisTurn: false,
      },
    },
  };

  if (shouldRespawnCmd) {
    nextState = respawnLordCommander(nextState, houseId);
  }

  // 2. Regenerate unhit Keeps, Outposts, and Mason Works / Royal Bastion fortifications
  const keeps = getHouseKeeps(nextState, houseId).sort((a, b) => a.id.localeCompare(b.id));
  const nextKeeps: Record<string, KeepState> = { ...nextState.keeps };
  let totalMatIncome = 0;
  let totalIronIncome = 0;
  let totalCoinIncome = 0;
  let totalBuildingUpkeep = 0;
  let extraFavor = 0;
  const keepFoodGains: Record<string, number> = {};

  for (const keep of keeps) {
    const y = computeKeepYield(nextState, keep.id);
    totalMatIncome += y.materials;
    totalIronIncome += y.iron;
    totalCoinIncome += y.coin;
    totalBuildingUpkeep += y.coinUpkeep;
    keepFoodGains[keep.id] = y.food;

    if (keep.isHighSeat && nextState.turnNumber % 2 === 0) {
      extraFavor += HIGH_SEAT_EVEN_TURN_FAVOR;
    }

    const baseRegen =
      keep.tier === 3 ? KEEP_TIER3_REGEN : keep.tier === 2 ? KEEP_TIER2_REGEN : KEEP_TIER1_REGEN;
    const regen = baseRegen + (keep.specialization === 'garrison' ? KEEP_GARRISON_REGEN_BONUS : 0);
    const nextHp = keep.damagedLastRound
      ? keep.keepHp
      : Math.min(keep.maxKeepHp, keep.keepHp + regen);

    nextKeeps[keep.id] = {
      ...keep,
      keepHp: nextHp,
      damagedLastRound: false,
      garrisonVolleyUsedThisTurn: false,
    };
  }

  // Non-keep owned tiles (Outposts & border-projected Watchtowers) + Outpost regen
  const nonKeepYield = computeNonKeepOwnedYield(nextState, houseId);
  totalMatIncome += nonKeepYield.materials;
  totalIronIncome += nonKeepYield.iron;
  totalCoinIncome += nonKeepYield.coin;
  totalBuildingUpkeep += nonKeepYield.coinUpkeep;

  const nextOutposts: Record<string, OutpostState> = { ...nextState.outposts };
  for (const o of getHouseOutposts(nextState, houseId)) {
    nextOutposts[o.id] = {
      ...o,
      hp: o.damagedLastRound ? o.hp : Math.min(o.maxHp, o.hp + OUTPOST_REGEN),
      damagedLastRound: false,
    };
  }

  // Auto-repair fortifications adjacent to Mason Works (Lv2 Stone Quarry) or inside Royal Bastion Citadel
  // Also check Aurelia Lv2 Grand Customhouse (+1 Favor every 4 turns per Keep if adj to Market/Guildhall)
  let tilesUpdated = false;
  const customhouseFavorKeepIds = new Set<string>();
  const nextTiles: Record<CoordKey, TileState> = { ...nextState.tiles };
  for (const tile of getIndexedHouseTiles(nextState, houseId)) {
    if (
      tile.improvement === 'river_tollhouse' &&
      tile.improvementLevel === 2 &&
      nextState.turnNumber % 4 === 0
    ) {
      const keepBucket = tile.keepId ?? 'outpost';
      if (!customhouseFavorKeepIds.has(keepBucket)) {
        const adjMarket = getNeighbors(tile.x, tile.y, nextState.gridSize).some((n) => {
          const nt = nextState.tiles[coordKey(n.x, n.y)];
          return nt?.ownerHouseId === houseId && nt.improvement === 'market';
        });
        if (adjMarket) {
          extraFavor += 1;
          customhouseFavorKeepIds.add(keepBucket);
        }
      }
    }

    if (tile.improvement && IMPROVEMENTS[tile.improvement].isFortification && tile.fortificationHp !== null) {
      const maxFort = getMaxFortificationHpForHouse(
        nextState.houses[houseId],
        tile.improvement,
        tile.improvementLevel,
      );
      if (maxFort !== null && tile.fortificationHp < maxFort) {
        let repair = 0;
        if (tile.keepId && nextKeeps[tile.keepId]?.citadelCharter === 'royal_bastion') {
          repair += 3;
        }
        const adjMason = getNeighbors(tile.x, tile.y, nextState.gridSize).some((n) => {
          const nt = nextState.tiles[coordKey(n.x, n.y)];
          return (
            nt?.ownerHouseId === houseId &&
            nt.improvement === 'stone_quarry' &&
            nt.improvementLevel === 2
          );
        });
        if (adjMason) repair += 2;
        if (repair > 0) {
          nextTiles[tile.key] = {
            ...tile,
            fortificationHp: Math.min(maxFort, tile.fortificationHp + repair),
          };
          tilesUpdated = true;
        }
      }
    }
  }

  // AI difficulty economy multiplier
  if (!house.isHuman) {
    const mult = AI_DIFFICULTY_CONFIG[nextState.difficulty].economyMultiplier;
    if (mult !== 1.0) {
      totalMatIncome = Math.round(totalMatIncome * mult);
      totalCoinIncome = Math.round(totalCoinIncome * mult);
    }
  }

  // 3. Ancient Watchtower occupation yields
  let watchtowerCoin = 0;
  let watchtowerFavor = 0;
  for (const u of getHouseUnits(nextState, houseId)) {
    const tile = nextState.tiles[u.tileKey];
    if (tile?.landmark === 'ancient_watchtower') {
      watchtowerCoin += ANCIENT_WATCHTOWER_COIN_PER_TURN;
      if (nextState.turnNumber % 2 === 0) {
        watchtowerFavor += ANCIENT_WATCHTOWER_EVEN_TURN_FAVOR;
      }
    }
  }
  if (watchtowerFavor > 0 && houseHasDecree(nextState.houses[houseId], 'decree_regents_envoy')) {
    watchtowerFavor = Math.ceil(watchtowerFavor * 1.5);
  }

  house = nextState.houses[houseId]!;
  house = addLifetimeCoin(house, totalCoinIncome + watchtowerCoin);
  house = addFavor(house, watchtowerFavor + extraFavor);
  house = {
    ...house,
    resources: {
      ...house.resources,
      materials: house.resources.materials + totalMatIncome,
      iron: house.resources.iron + totalIronIncome,
    },
  };

  // 4. Unit Wages + Building Coin Upkeep & Bankruptcy Mutiny
  const houseUnits = getHouseUnits(nextState, houseId);
  let totalUnitUpkeep = 0;
  for (const u of houseUnits) {
    const hk = u.homeKeepId ? nextKeeps[u.homeKeepId] : null;
    totalUnitUpkeep += getUnitUpkeep(house, u.typeId, hk);
  }
  const totalUpkeep = totalUnitUpkeep + totalBuildingUpkeep;

  let mutinyTarget: { tileKey: CoordKey; unitType: UnitId; disbanded: boolean } | null = null;
  if (house.resources.coin - totalUpkeep < 0) {
    house = { ...house, resources: { ...house.resources, coin: 0 } };
    // Highest-upkeep non-Commander unit suffers Mutiny (adjacent to Commander shields from Mutiny!)
    const eligible = houseUnits
      .filter((u) => !u.isCommander && !isAdjacentToFriendlyCommander(nextState, u))
      .sort((a, b) => {
        const upDiff = getUnitUpkeep(house, b.typeId) - getUnitUpkeep(house, a.typeId);
        return upDiff !== 0 ? upDiff : a.id.localeCompare(b.id);
      });
    const victim = eligible[0];
    if (victim) {
      const hpAfter = victim.hp - MUTINY_TRUE_DAMAGE;
      const unitsCopy = { ...nextState.units };
      if (hpAfter <= 0) {
        delete unitsCopy[victim.id];
        mutinyTarget = { tileKey: victim.tileKey, unitType: victim.typeId, disbanded: true };
      } else {
        unitsCopy[victim.id] = { ...victim, hp: hpAfter, isMutinied: true };
        mutinyTarget = { tileKey: victim.tileKey, unitType: victim.typeId, disbanded: false };
      }
      nextState = { ...nextState, units: unitsCopy };
    }
  } else {
    house = {
      ...house,
      resources: { ...house.resources, coin: house.resources.coin - totalUpkeep },
    };
  }

  // 5. Per-Keep Food Growth Bar progression (Tier 1 -> Tier 2 auto; Tier 2 holds >=90 for Iron upgrade; Tier 3 repeats)
  const upgradedKeepIds: string[] = [];
  const hadAnyTier2Before = keeps.some((k) => k.tier >= 2);
  let grantedFirstTier2Draft = hadAnyTier2Before;

  for (const keep of keeps) {
    let currKeep = nextKeeps[keep.id]!;
    let foodProgress = currKeep.foodProgress + (keepFoodGains[keep.id] ?? 0);

    if (currKeep.tier === 1 && foodProgress >= KEEP_TIER1_FOOD_THRESHOLD) {
      foodProgress -= KEEP_TIER1_FOOD_THRESHOLD;
      const t2Base: KeepState = { ...currKeep, tier: 2, foodProgress };
      const newMaxHp = computeKeepMaxHp(t2Base, house);
      const hpGain = Math.max(0, newMaxHp - currKeep.maxKeepHp);
      currKeep = {
        ...t2Base,
        maxKeepHp: newMaxHp,
        keepHp: Math.min(newMaxHp, currKeep.keepHp + hpGain),
      };
      const addDraft = !grantedFirstTier2Draft ? 1 : 0;
      if (addDraft > 0) grantedFirstTier2Draft = true;
      house = {
        ...house,
        pendingSpecializationKeepIds: [...house.pendingSpecializationKeepIds, currKeep.id],
        pendingDraftCount: house.pendingDraftCount + addDraft,
      };
      upgradedKeepIds.push(currKeep.id);
    } else if (currKeep.tier === 3) {
      const threshold = getKeepFoodThreshold(currKeep);
      while (foodProgress >= threshold) {
        foodProgress -= threshold;
        house = addLifetimeCoin(house, KEEP_REPEAT_SURPLUS_COIN);
        house = addFavor(house, KEEP_REPEAT_SURPLUS_FAVOR);
        currKeep = {
          ...currKeep,
          repeatMilestonesClaimed: currKeep.repeatMilestonesClaimed + 1,
        };
      }
      currKeep = { ...currKeep, foodProgress };
    } else {
      currKeep = { ...currKeep, foodProgress };
    }

    nextKeeps[keep.id] = currKeep;
  }

  nextState = {
    ...nextState,
    tiles: tilesUpdated ? nextTiles : nextState.tiles,
    keeps: nextKeeps,
    outposts: nextOutposts,
    houses: { ...nextState.houses, [houseId]: house },
  };

  for (const keepId of upgradedKeepIds) {
    nextState = claimKeepTerritory(nextState, keepId);
    nextState = autoRehomeOrphans(nextState, houseId);
    const k = nextState.keeps[keepId]!;
    nextState = appendChronicle(nextState, {
      type: 'keep_upgraded',
      actorHouseId: houseId,
      targetHouseId: null,
      tileKey: k.tileKey,
      summary: `${k.name} grew to a Tier-2 Stronghold.`,
      isPublic: true,
    });
  }

  if (mutinyTarget) {
    if (mutinyTarget.disbanded) {
      nextState = autoRehomeOrphans(nextState, houseId);
    }
    nextState = appendChronicle(nextState, {
      type: 'mutiny',
      actorHouseId: houseId,
      targetHouseId: null,
      tileKey: mutinyTarget.tileKey,
      summary: mutinyTarget.disbanded
        ? `Mutiny! Unpaid ${UNITS[mutinyTarget.unitType].name} disbanded.`
        : `Mutiny! Unpaid ${UNITS[mutinyTarget.unitType].name} took ${MUTINY_TRUE_DAMAGE} damage (-25% Atk).`,
      isPublic: false,
    });
  }

  nextState = recomputeHouseFog(nextState, houseId);
  return nextState;
}

function isKeepWinterProvisioned(state: GameState, keepId: string): boolean {
  const keep = state.keeps[keepId];
  if (!keep) return true;
  if (keep.specialization === 'granary_seat') return true;
  const keepTiles = getIndexedKeepTiles(state, keepId);
  if (
    keepTiles.some(
      (t) =>
        t.ownerHouseId === keep.ownerHouseId &&
        (t.improvement === 'granary' ||
          (t.improvement === 'farm' && t.improvementLevel === 2)),
    )
  ) {
    return true;
  }
  return computeKeepYield(state, keepId).food >= 2;
}

function isUnitWinterSheltered(state: GameState, unit: UnitState): boolean {
  const house = state.houses[unit.houseId];
  const tile = state.tiles[unit.tileKey];
  // Standing on own Keep or Outpost always shelters
  if (getKeepAt(state, unit.tileKey)?.ownerHouseId === unit.houseId) return true;
  if (getOutpostAt(state, unit.tileKey)?.ownerHouseId === unit.houseId) return true;
  // Adjacent to friendly Commander shields from Winter attrition
  if (unit.isCommander || isAdjacentToFriendlyCommander(state, unit)) return true;

  // Within 1 tile of friendly Watchtower or Outpost, or within Stone Silo / Winter Granaries radius
  const granaryExtra = houseHasDecree(house, 'decree_winter_granaries') ? 1 : 0;
  for (const t of getIndexedHouseTiles(state, unit.houseId)) {
    const d = chebyshevDist(t.x, t.y, unit.x, unit.y);
    if (t.improvement === 'watchtower' && d <= 1) return true;
    if (t.improvement === 'granary') {
      const r = (t.improvementLevel === 2 ? 2 : 1) + granaryExtra;
      if (d <= r) return true;
    }
  }
  for (const o of getHouseOutposts(state, unit.houseId)) {
    if (chebyshevDist(o.x, o.y, unit.x, unit.y) <= 1) return true;
  }

  // Own territory shelters IF the unit's home Keep is provisioned for Winter
  if (tile?.ownerHouseId === unit.houseId) {
    if (unit.homeKeepId === 'commander' || unit.homeKeepId === 'free_company') return true;
    return isKeepWinterProvisioned(state, unit.homeKeepId);
  }

  return false;
}

/**
 * End-of-turn Stone Bastion Tower border volleys, passive healing & Winter Provisioning attrition.
 */
export function processEndOfTurnHealingAndAttrition(
  state: GameState,
  houseId: HouseId,
): GameState {
  const house = state.houses[houseId];
  if (!house || house.isEliminated) return state;

  let nextState = state;

  // 1. Stone Bastion Tower (Watchtower Lv2) automatic border volleys
  const bastionDmg =
    BASTION_VOLLEY_DAMAGE +
    (houseHasDecree(house, 'decree_stone_curtain') ? BASTION_STONE_CURTAIN_BONUS : 0);
  const fog = nextState.fog[houseId] ?? {};
  const bastionTiles = getIndexedHouseTiles(nextState, houseId).filter(
    (t) => t.improvement === 'watchtower' && t.improvementLevel === 2,
  );
  if (bastionTiles.length > 0) {
    const unitsCopy = { ...nextState.units };
    let bastionHit = false;
    for (const bt of bastionTiles) {
      const adjEnemies = getNeighbors(bt.x, bt.y, nextState.gridSize)
        .map((n) => unitsCopy[getUnitAt(nextState, coordKey(n.x, n.y))?.id ?? ''])
        .filter((u): u is UnitState => u !== undefined && u.houseId !== houseId && fog[u.tileKey] === 'visible')
        .sort((a, b) => (a.hp !== b.hp ? a.hp - b.hp : a.id.localeCompare(b.id)));
      const target = adjEnemies[0];
      if (!target) continue;
      const res = applyOneShotProtection(bastionDmg, target.hp, target.maxHp, 2, 1.0);
      const hpAfter = Math.max(0, target.hp - res.damage);
      bastionHit = true;
      if (hpAfter <= 0) {
        delete unitsCopy[target.id];
      } else {
        unitsCopy[target.id] = { ...target, hp: hpAfter, damagedSinceLastTurn: true };
      }
    }
    if (bastionHit) {
      nextState = { ...nextState, units: unitsCopy };
    }
  }

  // 2. Stationary passive healing & Winter Provisioning attrition
  const season = SEASONS[getSeason(nextState.turnNumber)];
  const hasSurgeons = houseHasDecree(house, 'decree_field_surgeons');
  const hasHardened = houseHasDecree(house, 'decree_hardened_marchers');
  const hasWinterGranaries = houseHasDecree(house, 'decree_winter_granaries');
  const baseWinterAttr =
    season.winterAttritionDamage > 0
      ? houseHasActiveEffect(nextState, houseId, 'evt_hard_frost')
        ? HARD_FROST_ATTRITION_DAMAGE
        : season.winterAttritionDamage
      : 0;
  const winterAttrition = hasHardened ? Math.floor(baseWinterAttr / 2) : baseWinterAttr;

  const nextUnits: Record<string, UnitState> = { ...nextState.units };
  let changed = false;

  for (const [uid, u] of Object.entries(nextUnits)) {
    if (u.houseId !== houseId) continue;
    let hp = u.hp;
    const isWinter = season.winterAttritionDamage > 0;
    const sheltered = !isWinter || isUnitWinterSheltered(nextState, u);

    if (
      !u.hasMoved &&
      (!u.hasAttacked || u.isFortified) &&
      u.spawnedOnTurn !== nextState.turnNumber &&
      u.homeKeepId !== 'orphaned' &&
      sheltered
    ) {
      let heal = STANDARD_HEAL_AMOUNT + (hasSurgeons ? FIELD_SURGEONS_HEAL_BONUS : 0);
      if (u.isFortified) heal += FORTIFY_EXTRA_HEAL;
      const keep = getKeepAt(nextState, u.tileKey);
      const outpost = getOutpostAt(nextState, u.tileKey);
      if (
        (keep && keep.ownerHouseId === houseId) ||
        (outpost && outpost.ownerHouseId === houseId)
      ) {
        heal += KEEP_TILE_EXTRA_HEAL;
      }
      if (hasWinterGranaries) {
        const nearGranary = getIndexedHouseTiles(nextState, houseId).some(
          (t) =>
            t.improvement === 'granary' &&
            chebyshevDist(t.x, t.y, u.x, u.y) <= (t.improvementLevel === 2 ? 3 : 2),
        );
        if (nearGranary) heal += 2;
      }
      hp = Math.min(u.maxHp, hp + heal);
    }

    if (winterAttrition > 0 && !sheltered) {
      hp = Math.max(1, hp - winterAttrition);
    }

    if (hp !== u.hp || u.damagedSinceLastTurn) {
      nextUnits[uid] = { ...u, hp, damagedSinceLastTurn: false };
      changed = true;
    }
  }

  return changed ? { ...nextState, units: nextUnits } : nextState;
}

// ============================================================================
// Tactical Stance (Fortify / Phalanx), Demolish, Disband & Keep Repair
// ============================================================================

export function canFortifyUnit(state: GameState, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit || unit.isFortified || unit.hasAttacked) return false;
  if (unit.spawnedOnTurn === state.turnNumber) return false;
  return true;
}

export function fortifyUnit(state: GameState, unitId: string): GameState {
  if (!canFortifyUnit(state, unitId)) return state;
  const unit = state.units[unitId]!;
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: {
        ...unit,
        isFortified: true,
        hasAttacked: true,
        remainingMovement: 0,
      },
    },
  };
}

export function getDemolishRefund(houseId: HouseId, improvementId: ImprovementId): number {
  const cost = getImprovementCost(houseId, improvementId);
  return Math.floor(cost * DEMOLISH_REFUND_RATIO);
}

export function canDemolishImprovement(
  state: GameState,
  houseId: HouseId,
  tileKey: CoordKey,
): boolean {
  const tile = state.tiles[tileKey];
  const house = state.houses[houseId];
  if (!tile || !house || house.isEliminated) return false;
  return tile.ownerHouseId === houseId && tile.improvement !== null;
}

export function demolishImprovement(
  state: GameState,
  houseId: HouseId,
  tileKey: CoordKey,
): GameState {
  if (!canDemolishImprovement(state, houseId, tileKey)) return state;
  const tile = state.tiles[tileKey]!;
  const house = state.houses[houseId]!;
  const impId = tile.improvement!;
  const refund = getDemolishRefund(houseId, impId);

  let nextState: GameState = {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        resources: { ...house.resources, materials: house.resources.materials + refund },
      },
    },
    tiles: {
      ...state.tiles,
      [tileKey]: {
        ...tile,
        improvement: null,
        improvementLevel: 1,
        fortificationHp: null,
        ownerHouseId: tile.keepId === null && tile.outpostId === null ? null : tile.ownerHouseId,
      },
    },
  };

  if (impId === 'watchtower' || impId === 'signal_bastion' || impId === 'peak_beacon') {
    nextState = recomputeHouseFog(nextState, houseId);
  }
  if (impId === 'war_camp') {
    nextState = autoRehomeOrphans(nextState, houseId);
  }
  nextState = appendChronicle(nextState, {
    type: 'improvement_demolished',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey,
    summary: `Cleared ${IMPROVEMENTS[impId].name} (+${refund} Mat salvaged).`,
    isPublic: false,
  });

  return nextState;
}

export function getDisbandRefund(state: GameState, houseId: HouseId, unitId: string): number {
  const unit = state.units[unitId];
  const house = state.houses[houseId];
  if (!unit || !house || unit.houseId !== houseId || unit.isCommander) return 0;
  const keep = getKeepAt(state, unit.tileKey);
  if (!keep || keep.ownerHouseId !== houseId) return 0;
  const cost = getUnitMatCost(house, unit.typeId);
  return Math.floor(cost * DISBAND_KEEP_REFUND_RATIO);
}

export function canDisbandUnit(state: GameState, houseId: HouseId, unitId: string): boolean {
  const unit = state.units[unitId];
  return unit !== undefined && unit.houseId === houseId && !unit.isCommander;
}

export function disbandUnit(state: GameState, houseId: HouseId, unitId: string): GameState {
  if (!canDisbandUnit(state, houseId, unitId)) return state;
  const unit = state.units[unitId]!;
  const house = state.houses[houseId]!;
  const refund = getDisbandRefund(state, houseId, unitId);

  const nextUnits = { ...state.units };
  delete nextUnits[unitId];

  let nextState: GameState = {
    ...state,
    units: nextUnits,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        resources: { ...house.resources, materials: house.resources.materials + refund },
      },
    },
  };

  nextState = autoRehomeOrphans(nextState, houseId);
  nextState = recomputeHouseFog(nextState, houseId);
  nextState = appendChronicle(nextState, {
    type: 'unit_disbanded',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey: unit.tileKey,
    summary: `Disbanded ${UNITS[unit.typeId].name}${refund > 0 ? ` (+${refund} Mat recovered)` : ''}.`,
    isPublic: false,
  });

  return nextState;
}

export function canRepairKeep(state: GameState, houseId: HouseId, keepId: string): boolean {
  const house = state.houses[houseId];
  const keep = state.keeps[keepId];
  if (!house || house.isEliminated || !keep || keep.ownerHouseId !== houseId) return false;
  if (keep.keepHp >= keep.maxKeepHp) return false;
  return house.resources.materials >= KEEP_REPAIR_MAT_COST;
}

export function repairKeep(state: GameState, houseId: HouseId, keepId: string): GameState {
  if (!canRepairKeep(state, houseId, keepId)) return state;
  const house = state.houses[houseId]!;
  const keep = state.keeps[keepId]!;
  const nextHp = Math.min(keep.maxKeepHp, keep.keepHp + KEEP_REPAIR_HP_AMOUNT);

  let nextState: GameState = {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        resources: {
          ...house.resources,
          materials: house.resources.materials - KEEP_REPAIR_MAT_COST,
        },
      },
    },
    keeps: { ...state.keeps, [keepId]: { ...keep, keepHp: nextHp } },
  };

  nextState = appendChronicle(nextState, {
    type: 'keep_repaired',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey: keep.tileKey,
    summary: `Repaired ${keep.name} fortifications (+${nextHp - keep.keepHp} HP).`,
    isPublic: false,
  });

  return nextState;
}
