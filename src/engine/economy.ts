/**
 * Marchlands (Spec v0.3) — Economy, Spatial Adjacency, Construction, Training,
 * Peaceful Annexation, Harvest & Upkeep, Mutiny, Healing & Winter Attrition
 */

import type {
  Coord,
  CoordKey,
  GameState,
  HouseId,
  HouseState,
  ImprovementId,
  KeepState,
  UnitId,
  UnitState,
} from '../types/game.ts';
import {
  AI_DIFFICULTY_CONFIG,
  ANCIENT_WATCHTOWER_COIN_PER_TURN,
  ANCIENT_WATCHTOWER_EVEN_TURN_FAVOR,
  AURELIA_RIVER_ADJ_PASSIVE_COIN,
  BORDER_LEVIES_MAT_DISCOUNT,
  BORDER_LEVIES_MIN_MAT_COST,
  CROWN_ENVOYS_DISCOUNT,
  DEMOLISH_REFUND_RATIO,
  DISBAND_KEEP_REFUND_RATIO,
  FARM_RIVER_BONUS_FOOD,
  FIELD_SURGEONS_HEAL_AMOUNT,
  FORTIFY_EXTRA_HEAL,
  FORTIFICATION_MAX_HP,
  GRANARY_ADJ_BONUS_FOOD,
  HARD_FROST_ATTRITION_DAMAGE,
  IMPROVEMENTS,
  KEEP_BASE_MAX_HP,
  KEEP_BASE_REGEN,
  KEEP_GARRISON_REGEN,
  KEEP_REPAIR_HP_AMOUNT,
  KEEP_REPAIR_MAT_COST,
  KEEP_REPEAT_FIRST_COIN,
  KEEP_REPEAT_SURPLUS_COIN,
  KEEP_REPEAT_SURPLUS_FAVOR,
  KEEP_SPECIALIZATIONS,
  KEEP_TIER1_BASE_COIN,
  KEEP_TIER1_BASE_FOOD,
  KEEP_TIER1_BASE_MAT,
  KEEP_TIER1_FOOD_THRESHOLD,
  KEEP_TIER1_RADIUS,
  KEEP_TIER2_BASE_COIN,
  KEEP_TIER2_BASE_FOOD,
  KEEP_TIER2_BASE_MAT,
  KEEP_TIER2_REPEAT_FOOD_THRESHOLD,
  KEEP_TILE_EXTRA_HEAL,
  LUMBER_MILL_FOREST_BONUS_MAT,
  LUMBER_MILL_FOREST_THRESHOLD,
  MARKET_ADJ_BONUS_COIN,
  MARKET_TOWN_ANNEX_COIN_DISCOUNT,
  MAX_ANNEX_COIN_DISCOUNT,
  MUTINY_TRUE_DAMAGE,
  SEASONS,
  STANDARD_HEAL_AMOUNT,
  TOLL_ROADS_KEEP_COIN,
  UNITS,
  VANE_FOREST_PASSIVE_MAT,
  VILLAGE_ANNEX_COIN_COST,
  VILLAGE_ANNEX_FAVOR_GAIN,
  VILLAGE_ANNEX_FOOD_COST,
  WAR_CAMP_MAX_PER_HOUSE,
  WAR_CAMP_MAX_PER_KEEP,
} from '../data/index.ts';
import { chebyshevDist, coordKey, getNeighbors } from './coords.ts';
import { autoRehomeOrphans, claimKeepTerritory } from './capture.ts';
import { permanentlyRevealRadius, recomputeHouseFog } from './fog.ts';
import { getUnitMaxMovement } from './movement.ts';
import {
  addFavor,
  addLifetimeCoin,
  allocateSettlementName,
  appendChronicle,
  getHouseKeeps,
  getHouseUnits,
  getKeepArmyCap,
  getKeepAt,
  getKeepPalisadeCap,
  getKeepSupportedUnitIds,
  getSeason,
  getUnitAt,
  houseHasActiveEffect,
  houseHasDecree,
} from './stateHelpers.ts';

export interface TileYield {
  readonly food: number;
  readonly materials: number;
  readonly coin: number;
}

/**
 * Computes exact per-turn Food / Materials / Coin yield of an owned tile,
 * including spatial adjacency, Keep specialization, decrees, seasons, and events.
 */
export function computeTileYield(state: GameState, tileKey: CoordKey): TileYield {
  const tile = state.tiles[tileKey];
  if (!tile || tile.ownerHouseId === null) {
    return { food: 0, materials: 0, coin: 0 };
  }

  const houseId = tile.ownerHouseId;
  const house = state.houses[houseId];
  if (!house) return { food: 0, materials: 0, coin: 0 };

  const keep = tile.keepId ? state.keeps[tile.keepId] : null;
  const season = SEASONS[getSeason(state.turnNumber)];
  const neighbors = getNeighbors(tile.x, tile.y, state.gridSize).map(
    (n) => state.tiles[coordKey(n.x, n.y)]!,
  );

  let food = 0;
  let materials = 0;
  let coin = 0;

  // House Vane passive: +1 Materials from untouched Forest tiles (Forester's Lodge preserves Forest)
  if (houseId === 'vane' && tile.terrain === 'forest') {
    materials += VANE_FOREST_PASSIVE_MAT;
  }

  const imp = tile.improvement;
  if (imp !== null) {
    const def = IMPROVEMENTS[imp];
    food += def.baseFood;
    materials += def.baseMaterials;
    coin += def.baseCoin;

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

      if (houseHasDecree(house, 'decree_crop_rotation')) {
        food += 1;
      }
      if (keep && keep.specialization === 'granary_seat') {
        food += KEEP_SPECIALIZATIONS.granary_seat.farmFoodBonus;
      }
      food += season.farmFoodDelta;
      if (houseHasActiveEffect(state, houseId, 'evt_blight')) {
        food -= 1;
      }
      food = Math.max(0, food);
    } else if (imp === 'foresters_lodge') {
      const adjGranaries = neighbors.filter(
        (n) => n.ownerHouseId === houseId && n.improvement === 'granary',
      ).length;
      food += adjGranaries * GRANARY_ADJ_BONUS_FOOD;
      if (houseHasDecree(house, 'decree_crop_rotation')) {
        food += 1;
      }
      food += season.forestersLodgeFoodDelta;
    } else if (imp === 'lumber_mill') {
      const adjForests = neighbors.filter((n) => n.terrain === 'forest').length;
      if (adjForests >= LUMBER_MILL_FOREST_THRESHOLD) {
        materials += LUMBER_MILL_FOREST_BONUS_MAT;
      }
      if (houseHasDecree(house, 'decree_coppice_forestry')) {
        materials += 1;
      }
      if (houseHasActiveEffect(state, houseId, 'evt_timber_boom')) {
        materials += 1;
      }
    } else if (imp === 'market') {
      const adjFarmOrRiver = neighbors.filter(
        (n) => n.terrain === 'river' || (n.ownerHouseId === houseId && n.improvement === 'farm'),
      ).length;
      coin += adjFarmOrRiver * MARKET_ADJ_BONUS_COIN;
      if (keep && keep.specialization === 'market_town') {
        coin += KEEP_SPECIALIZATIONS.market_town.marketCoinBonus;
      }
      if (houseHasActiveEffect(state, houseId, 'evt_fair_season')) {
        coin += 2;
      }
    } else if (imp === 'granary') {
      food += season.granaryFoodDelta;
    }
  }

  return { food, materials, coin };
}

/**
 * Computes total per-turn Food / Materials / Coin yield for a Keep and its claimed territory.
 */
export function computeKeepYield(state: GameState, keepId: string): TileYield {
  const keep = state.keeps[keepId];
  if (!keep) return { food: 0, materials: 0, coin: 0 };
  const house = state.houses[keep.ownerHouseId];
  if (!house) return { food: 0, materials: 0, coin: 0 };

  let food = keep.tier === 2 ? KEEP_TIER2_BASE_FOOD : KEEP_TIER1_BASE_FOOD;
  let materials = keep.tier === 2 ? KEEP_TIER2_BASE_MAT : KEEP_TIER1_BASE_MAT;
  let coin = keep.tier === 2 ? KEEP_TIER2_BASE_COIN : KEEP_TIER1_BASE_COIN;

  if (keep.specialization === 'market_town') {
    coin += KEEP_SPECIALIZATIONS.market_town.coinPerTurn;
  } else if (keep.specialization === 'granary_seat') {
    food += KEEP_SPECIALIZATIONS.granary_seat.foodPerTurn;
  }

  if (houseHasDecree(house, 'decree_toll_roads')) {
    coin += TOLL_ROADS_KEEP_COIN;
  }

  for (const tile of Object.values(state.tiles)) {
    if (tile.keepId === keepId && tile.ownerHouseId === keep.ownerHouseId) {
      const ty = computeTileYield(state, tile.key);
      food += ty.food;
      materials += ty.materials;
      coin += ty.coin;
    }
  }

  return { food, materials, coin };
}

/**
 * Returns true if `keepId`'s territory has a Smithy adjacent to both an
 * Iron Mine (or Deep Smeltery) and a Lumber Mill owned by the Keep's owner.
 */
export function keepHasSmithyCombo(state: GameState, keepId: string): boolean {
  const keep = state.keeps[keepId];
  if (!keep) return false;

  for (const tile of Object.values(state.tiles)) {
    if (
      tile.keepId === keepId &&
      tile.ownerHouseId === keep.ownerHouseId &&
      tile.improvement === 'smithy'
    ) {
      const neighbors = getNeighbors(tile.x, tile.y, state.gridSize).map(
        (n) => state.tiles[coordKey(n.x, n.y)]!,
      );
      const hasOre = neighbors.some(
        (n) =>
          n.ownerHouseId === keep.ownerHouseId &&
          (n.improvement === 'iron_mine' || n.improvement === 'deep_smeltery'),
      );
      const hasMill = neighbors.some(
        (n) => n.ownerHouseId === keep.ownerHouseId && n.improvement === 'lumber_mill',
      );
      if (hasOre && hasMill) return true;
    }
  }
  return false;
}

export function getImprovementCost(houseId: HouseId, improvementId: ImprovementId): number {
  const def = IMPROVEMENTS[improvementId];
  if (houseId === 'ironhelm' && def.ironhelmMatCost !== null) {
    return def.ironhelmMatCost;
  }
  return def.matCost;
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
  if (tile.ownerHouseId !== houseId || tile.keepId === null) return false;
  if (tile.improvement !== null) return false;
  if (getKeepAt(state, tileKey) !== null) return false;
  if (tile.landmark !== 'none' && !tile.landmarkCleared) return false;

  const def = IMPROVEMENTS[improvementId];
  if (def.houseId !== null && def.houseId !== houseId) return false;
  if (def.requiredDecreeId !== null && !houseHasDecree(house, def.requiredDecreeId)) return false;

  const cost = getImprovementCost(houseId, improvementId);
  if (house.resources.materials < cost) return false;

  if (!def.validTerrains.includes(tile.terrain)) return false;

  // Iron deposit check (Deep Smeltery allows bare Mountain for Ironhelm)
  if (def.requiresIronDeposit) {
    const bareMountainOk = def.allowsBareMountainForOwner && tile.terrain === 'mountain';
    if (!tile.hasIronDeposit && !bareMountainOk) return false;
  }

  // Per-Keep Palisade Cap (Ruling 3.1)
  if (improvementId === 'palisade') {
    const keep = state.keeps[tile.keepId];
    if (!keep) return false;
    const currentPalisades = Object.values(state.tiles).filter(
      (t) => t.keepId === keep.id && t.improvement === 'palisade',
    ).length;
    if (currentPalisades >= getKeepPalisadeCap(keep)) return false;
  }

  // War Camp Limits: max 1/Keep, max 2/House (Ruling 2.2)
  if (improvementId === 'war_camp') {
    const inThisKeep = Object.values(state.tiles).filter(
      (t) => t.keepId === tile.keepId && t.improvement === 'war_camp',
    ).length;
    if (inThisKeep >= WAR_CAMP_MAX_PER_KEEP) return false;

    const inHouse = Object.values(state.tiles).filter(
      (t) => t.ownerHouseId === houseId && t.improvement === 'war_camp',
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
  const def = IMPROVEMENTS[improvementId];
  const cost = getImprovementCost(houseId, improvementId);

  let nextState: GameState = {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        resources: {
          ...house.resources,
          materials: house.resources.materials - cost,
        },
      },
    },
    tiles: {
      ...state.tiles,
      [tileKey]: {
        ...tile,
        improvement: improvementId,
        fortificationHp: def.isFortification ? FORTIFICATION_MAX_HP : null,
      },
    },
  };

  if (improvementId === 'watchtower' || improvementId === 'signal_bastion') {
    nextState = recomputeHouseFog(nextState, houseId);
  }
  if (improvementId === 'war_camp') {
    nextState = autoRehomeOrphans(nextState, houseId);
  }

  return nextState;
}

export function getUnitMatCost(house: HouseState, unitId: UnitId): number {
  const base = UNITS[unitId].matCost;
  if (
    (unitId === 'militia' || unitId === 'spearman') &&
    houseHasDecree(house, 'decree_border_levies')
  ) {
    return Math.max(BORDER_LEVIES_MIN_MAT_COST, base - BORDER_LEVIES_MAT_DISCOUNT);
  }
  return base;
}

export function getUnitUpkeep(house: HouseState, unitId: UnitId): number {
  const base = UNITS[unitId].coinUpkeep;
  if (houseHasDecree(house, 'decree_supply_lines')) {
    return Math.max(0, base - 1);
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
  if (def.isEventOnly) return false;
  if (def.houseId !== null && def.houseId !== houseId) return false;
  if (def.requiredDecreeId !== null && !houseHasDecree(house, def.requiredDecreeId)) return false;
  if (def.requiresSmithyCombo && !keepHasSmithyCombo(state, keepId)) return false;

  // Keep center tile must be unoccupied (Ruling 2.3)
  if (getUnitAt(state, keep.tileKey) !== null) return false;

  // Army Cap check
  const cap = getKeepArmyCap(state, keepId);
  const used = getKeepSupportedUnitIds(state, keepId).length;
  if (used >= cap) return false;

  const cost = getUnitMatCost(house, unitId);
  if (house.resources.materials < cost) return false;

  return true;
}

/**
 * Trains a unit at `keepId` with summoning sickness (hasMoved=true, hasAttacked=true,
 * spawnedOnTurn=state.turnNumber).
 */
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
  const cost = getUnitMatCost(house, unitId);
  const newUnitId = `unit_${state.nextUnitSeq}`;

  const unit: UnitState = {
    id: newUnitId,
    houseId,
    typeId: unitId,
    homeKeepId: keepId,
    tileKey: keep.tileKey,
    x: keep.x,
    y: keep.y,
    hp: def.maxHp,
    maxHp: def.maxHp,
    remainingMovement: 0,
    hasMoved: true,
    hasAttacked: true,
    spawnedOnTurn: state.turnNumber,
    isMutinied: false,
    damagedSinceLastTurn: false,
    xp: 0,
    isFortified: false,
  };

  let nextState: GameState = {
    ...state,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        resources: {
          ...house.resources,
          materials: house.resources.materials - cost,
        },
      },
    },
    units: {
      ...state.units,
      [newUnitId]: unit,
    },
    nextUnitSeq: state.nextUnitSeq + 1,
  };

  nextState = recomputeHouseFog(nextState, houseId);
  return nextState;
}

/**
 * Ruling 1.3: Peaceful Frontier Village Annexation cost with Crown Envoys & Market Town discounts.
 */
export function getPeacefulAnnexCost(
  state: GameState,
  houseId: HouseId,
): { coin: number; food: number } {
  const house = state.houses[houseId];
  const hasEnvoys = house ? houseHasDecree(house, 'decree_crown_envoys') : false;
  const hasMarketTown = getHouseKeeps(state, houseId).some(
    (k) => k.specialization === 'market_town',
  );

  let coinDiscount = 0;
  if (hasEnvoys) coinDiscount += CROWN_ENVOYS_DISCOUNT;
  if (hasMarketTown) coinDiscount += MARKET_TOWN_ANNEX_COIN_DISCOUNT;
  coinDiscount = Math.min(MAX_ANNEX_COIN_DISCOUNT, coinDiscount);

  const coin = Math.round(VILLAGE_ANNEX_COIN_COST * (1 - coinDiscount));
  const food = hasEnvoys
    ? Math.floor(VILLAGE_ANNEX_FOOD_COST * (1 - CROWN_ENVOYS_DISCOUNT))
    : VILLAGE_ANNEX_FOOD_COST;

  return { coin, food };
}

/**
 * Ruling 1.3: Finds the closest friendly Keep (Chebyshev) with foodProgress >= requiredFood,
 * tie-breaking by highest foodProgress, then keep.id.
 */
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

export function canAnnexVillage(
  state: GameState,
  houseId: HouseId,
  tileKey: CoordKey,
): boolean {
  const house = state.houses[houseId];
  const tile = state.tiles[tileKey];
  if (!house || house.isEliminated || !tile) return false;
  if (tile.landmark !== 'frontier_village' || tile.villageHp === null || tile.villageHp <= 0) {
    return false;
  }

  // Condition 3: Village tile unoccupied
  if (getUnitAt(state, tileKey) !== null) return false;

  // Condition 1 & 2: >= 1 friendly unit adjacent, 0 enemy units adjacent
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

export function annexVillage(
  state: GameState,
  houseId: HouseId,
  tileKey: CoordKey,
): GameState {
  if (!canAnnexVillage(state, houseId, tileKey)) return state;
  const tile = state.tiles[tileKey]!;
  const { coin, food } = getPeacefulAnnexCost(state, houseId);
  const foodKeep = findAnnexFoodKeep(state, houseId, tile, food)!;

  let house = state.houses[houseId]!;
  const { name, updatedHouse: namedHouse } = allocateSettlementName(house);
  house = addFavor(namedHouse, VILLAGE_ANNEX_FAVOR_GAIN);
  house = {
    ...house,
    resources: {
      ...house.resources,
      coin: house.resources.coin - coin,
    },
    writProgress: {
      ...house.writProgress,
      writ_annex: (house.writProgress.writ_annex ?? 0) + 1,
    },
  };

  const keepId = `keep_${state.nextKeepSeq}`;
  const newKeep: KeepState = {
    id: keepId,
    name,
    ownerHouseId: houseId,
    tileKey,
    x: tile.x,
    y: tile.y,
    tier: 1,
    isCapital: false,
    specialization: 'none',
    keepHp: KEEP_BASE_MAX_HP,
    maxKeepHp: KEEP_BASE_MAX_HP,
    damagedLastRound: false,
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
      [foodKeep.id]: {
        ...foodKeep,
        foodProgress: foodKeep.foodProgress - food,
      },
      [keepId]: newKeep,
    },
    houses: {
      ...state.houses,
      [houseId]: house,
    },
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

/**
 * Start-of-turn Harvest & Upkeep Phase for `houseId`:
 * - Resets unit movement/attack flags & refreshes movement
 * - Regenerates unhit Keeps
 * - Tallies Keep yields + Ancient Watchtower occupation yields + Hard AI bonus
 * - Applies Coin milestones, unit upkeep, and Coin bankruptcy Mutiny
 * - Advances per-Keep Food Growth Bars (Tier 1 -> Tier 2 + specialization/draft;
 *   Tier 2 repeat 1st = +5 Coin + Draft, 2nd+ = Royal Surplus +10 Coin +2 Favor)
 */
export function processHarvestAndUpkeep(state: GameState, houseId: HouseId): GameState {
  let house = state.houses[houseId];
  if (!house || house.isEliminated) return state;

  // 1. Reset unit flags & audienceUsedThisTurn
  const nextUnits: Record<string, UnitState> = { ...state.units };
  for (const [uid, u] of Object.entries(nextUnits)) {
    if (u.houseId !== houseId) continue;
    nextUnits[uid] = {
      ...u,
      hasMoved: false,
      hasAttacked: false,
      isMutinied: false,
      remainingMovement: getUnitMaxMovement(state, u),
    };
  }

  let nextState: GameState = {
    ...state,
    units: nextUnits,
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        audienceUsedThisTurn: false,
      },
    },
  };

  // 2. Regenerate unhit Keeps & collect Keep yields
  const keeps = getHouseKeeps(nextState, houseId).sort((a, b) => a.id.localeCompare(b.id));
  const nextKeeps: Record<string, KeepState> = { ...nextState.keeps };
  let totalMatIncome = 0;
  let totalCoinIncome = 0;
  const keepFoodGains: Record<string, number> = {};

  for (const keep of keeps) {
    const y = computeKeepYield(nextState, keep.id);
    totalMatIncome += y.materials;
    totalCoinIncome += y.coin;
    keepFoodGains[keep.id] = y.food;

    const regen = keep.specialization === 'garrison' ? KEEP_GARRISON_REGEN : KEEP_BASE_REGEN;
    const nextHp = keep.damagedLastRound
      ? keep.keepHp
      : Math.min(keep.maxKeepHp, keep.keepHp + regen);

    nextKeeps[keep.id] = {
      ...keep,
      keepHp: nextHp,
      damagedLastRound: false,
    };
  }

  // AI difficulty economy multiplier (Easy 0.85x, Normal 1.0x, Hard 1.15x)
  if (!house.isHuman) {
    const mult = AI_DIFFICULTY_CONFIG[nextState.difficulty].economyMultiplier;
    if (mult !== 1.0) {
      totalMatIncome = Math.round(totalMatIncome * mult);
      totalCoinIncome = Math.round(totalCoinIncome * mult);
    }
  }

  // 3. Ancient Watchtower occupation yields (+2 Coin every turn, +1 Favor on even turns)
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

  house = nextState.houses[houseId]!;
  house = addLifetimeCoin(house, totalCoinIncome + watchtowerCoin);
  house = addFavor(house, watchtowerFavor);
  house = {
    ...house,
    resources: {
      ...house.resources,
      materials: house.resources.materials + totalMatIncome,
    },
  };

  // 4. Unit Upkeep & Coin Bankruptcy Mutiny (Ruling 4.1)
  const houseUnits = getHouseUnits(nextState, houseId);
  let totalUpkeep = 0;
  for (const u of houseUnits) {
    totalUpkeep += getUnitUpkeep(house, u.typeId);
  }

  let mutinyChronicleTarget: { tileKey: CoordKey; unitType: UnitId; disbanded: boolean } | null =
    null;

  if (house.resources.coin - totalUpkeep < 0) {
    house = {
      ...house,
      resources: { ...house.resources, coin: 0 },
    };
    // Highest-upkeep unit suffers Mutiny (8 true damage + -25% Atk for 1 turn)
    if (houseUnits.length > 0) {
      const sorted = [...houseUnits].sort((a, b) => {
        const upDiff = getUnitUpkeep(house, b.typeId) - getUnitUpkeep(house, a.typeId);
        if (upDiff !== 0) return upDiff;
        return a.id.localeCompare(b.id);
      });
      const victim = sorted[0]!;
      const hpAfter = victim.hp - MUTINY_TRUE_DAMAGE;
      const unitsCopy = { ...nextState.units };
      if (hpAfter <= 0) {
        delete unitsCopy[victim.id];
        mutinyChronicleTarget = {
          tileKey: victim.tileKey,
          unitType: victim.typeId,
          disbanded: true,
        };
      } else {
        unitsCopy[victim.id] = {
          ...victim,
          hp: hpAfter,
          isMutinied: true,
        };
        mutinyChronicleTarget = {
          tileKey: victim.tileKey,
          unitType: victim.typeId,
          disbanded: false,
        };
      }
      nextState = { ...nextState, units: unitsCopy };
    }
  } else {
    house = {
      ...house,
      resources: { ...house.resources, coin: house.resources.coin - totalUpkeep },
    };
  }

  // 5. Per-Keep Food Growth Bar progression & Tier-2 level-ups / repeat milestones
  const upgradedKeepIds: string[] = [];
  for (const keep of keeps) {
    let currKeep = nextKeeps[keep.id]!;
    let foodProgress = currKeep.foodProgress + (keepFoodGains[keep.id] ?? 0);

    if (currKeep.tier === 1 && foodProgress >= KEEP_TIER1_FOOD_THRESHOLD) {
      foodProgress -= KEEP_TIER1_FOOD_THRESHOLD;
      currKeep = {
        ...currKeep,
        tier: 2,
        foodProgress,
      };
      house = {
        ...house,
        pendingSpecializationKeepIds: [...house.pendingSpecializationKeepIds, currKeep.id],
        pendingDraftCount: house.pendingDraftCount + 1,
      };
      upgradedKeepIds.push(currKeep.id);
    } else if (currKeep.tier === 2) {
      const threshold =
        currKeep.specialization === 'granary_seat'
          ? KEEP_SPECIALIZATIONS.granary_seat.repeatFoodThreshold
          : KEEP_TIER2_REPEAT_FOOD_THRESHOLD;

      while (foodProgress >= threshold) {
        foodProgress -= threshold;
        if (currKeep.repeatMilestonesClaimed === 0) {
          // 1st repeat: +5 Coin + Draft
          house = addLifetimeCoin(house, KEEP_REPEAT_FIRST_COIN);
          house = { ...house, pendingDraftCount: house.pendingDraftCount + 1 };
        } else {
          // 2nd+ repeat: Royal Surplus (+10 Coin, +2 Favor, no draft)
          house = addLifetimeCoin(house, KEEP_REPEAT_SURPLUS_COIN);
          house = addFavor(house, KEEP_REPEAT_SURPLUS_FAVOR);
        }
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
    keeps: nextKeeps,
    houses: {
      ...nextState.houses,
      [houseId]: house,
    },
  };

  // Expand sticky 5x5 borders for any newly upgraded Tier-2 Keeps
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

  if (mutinyChronicleTarget) {
    if (mutinyChronicleTarget.disbanded) {
      nextState = autoRehomeOrphans(nextState, houseId);
    }
    nextState = appendChronicle(nextState, {
      type: 'mutiny',
      actorHouseId: houseId,
      targetHouseId: null,
      tileKey: mutinyChronicleTarget.tileKey,
      summary: mutinyChronicleTarget.disbanded
        ? `Mutiny! Unpaid ${mutinyChronicleTarget.unitType} disbanded.`
        : `Mutiny! Unpaid ${mutinyChronicleTarget.unitType} took ${MUTINY_TRUE_DAMAGE} damage (-25% Atk).`,
      isPublic: false,
    });
  }

  nextState = recomputeHouseFog(nextState, houseId);
  return nextState;
}

/**
 * End-of-turn stationary healing & Winter attrition for `houseId`.
 */
export function processEndOfTurnHealingAndAttrition(
  state: GameState,
  houseId: HouseId,
): GameState {
  const house = state.houses[houseId];
  if (!house || house.isEliminated) return state;

  const season = SEASONS[getSeason(state.turnNumber)];
  const hasChirurgeons = houseHasDecree(house, 'decree_field_surgeons');
  const winterAttrition =
    season.winterAttritionDamage > 0
      ? houseHasActiveEffect(state, houseId, 'evt_hard_frost')
        ? HARD_FROST_ATTRITION_DAMAGE
        : season.winterAttritionDamage
      : 0;

  const nextUnits: Record<string, UnitState> = { ...state.units };
  let changed = false;

  for (const [uid, u] of Object.entries(nextUnits)) {
    if (u.houseId !== houseId) continue;
    let hp = u.hp;

    // Stationary healing: did not move and either didn't attack or fortified in place
    if (
      !u.hasMoved &&
      (!u.hasAttacked || u.isFortified) &&
      u.spawnedOnTurn !== state.turnNumber &&
      u.homeKeepId !== 'orphaned'
    ) {
      let heal = hasChirurgeons ? FIELD_SURGEONS_HEAL_AMOUNT : STANDARD_HEAL_AMOUNT;
      if (u.isFortified) {
        heal += FORTIFY_EXTRA_HEAL;
      }
      const keep = getKeepAt(state, u.tileKey);
      if (keep && keep.ownerHouseId === houseId) {
        heal += KEEP_TILE_EXTRA_HEAL;
      }
      hp = Math.min(u.maxHp, hp + heal);
    }

    // Winter attrition outside own House's territory (cannot drop below 1 HP)
    if (winterAttrition > 0) {
      const tile = state.tiles[u.tileKey];
      if (tile && tile.ownerHouseId !== houseId) {
        hp = Math.max(1, hp - winterAttrition);
      }
    }

    if (hp !== u.hp || u.damagedSinceLastTurn) {
      nextUnits[uid] = { ...u, hp, damagedSinceLastTurn: false };
      changed = true;
    }
  }

  return changed ? { ...state, units: nextUnits } : state;
}

// ============================================================================
// Tactical Stance (Fortify), Demolish, Disband & Keep Field Repair
// ============================================================================

export function canFortifyUnit(state: GameState, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  if (unit.isFortified || unit.hasAttacked) return false;
  if (unit.spawnedOnTurn === state.turnNumber) return false;
  return true;
}

/**
 * Entrenches a unit for the remainder of the turn (+15% Defense until it moves or attacks;
 * +2 extra stationary heal at turn end if it did not move this turn).
 */
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
  if (tile.ownerHouseId !== houseId || tile.improvement === null) return false;
  return true;
}

/**
 * Clears an owned tile improvement, refunding 25% of its Material cost so players
 * can re-optimize adjacency layouts as territories expand and decrees unlock.
 */
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
        resources: {
          ...house.resources,
          materials: house.resources.materials + refund,
        },
      },
    },
    tiles: {
      ...state.tiles,
      [tileKey]: {
        ...tile,
        improvement: null,
        fortificationHp: null,
      },
    },
  };

  if (impId === 'watchtower' || impId === 'signal_bastion') {
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
  if (!unit || !house || unit.houseId !== houseId) return 0;
  const keep = getKeepAt(state, unit.tileKey);
  if (!keep || keep.ownerHouseId !== houseId) return 0;
  const cost = getUnitMatCost(house, unit.typeId);
  return Math.floor(cost * DISBAND_KEEP_REFUND_RATIO);
}

export function canDisbandUnit(state: GameState, houseId: HouseId, unitId: string): boolean {
  const unit = state.units[unitId];
  return unit !== undefined && unit.houseId === houseId;
}

/**
 * Disbands a friendly unit to free up Army Cap (refunding 25% Materials if standing on a friendly Keep).
 */
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
        resources: {
          ...house.resources,
          materials: house.resources.materials + refund,
        },
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
  if (house.resources.materials < KEEP_REPAIR_MAT_COST) return false;
  return true;
}

/**
 * Spends 6 Materials to immediately restore +8 Keep Garrison HP.
 */
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
    keeps: {
      ...state.keeps,
      [keepId]: {
        ...keep,
        keepHp: nextHp,
      },
    },
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
