/**
 * Marchlands (Spec v2.0) — Headless Read-Only UI Query Helpers
 *
 * Keeps 100% of game math inside src/engine/ so React components never compute game rules.
 */

import type {
  CoordKey,
  GameState,
  HouseId,
  ImprovementId,
  UnitState,
} from '../types/game.ts';
import {
  ANCIENT_WATCHTOWER_COIN_PER_TURN,
  BANDIT_MAX_HP,
  FARM_RIVER_BONUS_FOOD,
  GRANARY_ADJ_BONUS_FOOD,
  HIGH_SEAT_MAX_HP,
  IMPROVEMENTS,
  LUMBER_MILL_FOREST_BONUS_MAT,
  LUMBER_MILL_FOREST_THRESHOLD,
  MARKET_ADJ_BONUS_COIN,
  OUTPOST_MAX_HP,
  UNITS,
  VETERANCY_RANK1_XP,
  VETERANCY_RANK2_XP,
  VILLAGE_MAX_HP,
} from '../data/index.ts';
import {
  canActivateOverwatch,
  canDeployTrebuchet,
  canFireKeepGarrisonVolley,
  canPillageTile,
  canUseCommanderSkill,
  getCounterMultiplier,
  getTileTerrainOrFortDefBonus,
  getUnitAttackRange,
  getUnitRank,
  hasLineOfSight,
  previewUnitCombat,
  type CombatPreview,
} from './combat.ts';
import { chebyshevDist, coordKey, getNeighbors, getTilesInRadius } from './coords.ts';
import {
  canBuildImprovement,
  canBuildOutpost,
  canBuildRoad,
  canClearTimber,
  canFortifyUnit,
  canRallyCommanderEarly,
  canReinforceUnit,
  canRepairKeep,
  canUpgradeImprovement,
  canUpgradeKeepToTier3,
  computeKeepYield,
  computeNonKeepOwnedYield,
  computeTileYield,
  getImprovementCosts,
  getImprovementUpgradeCosts,
  getKeepFoodThreshold,
  getReinforceCost,
  getRoadCost,
  getUnitUpkeep,
  keepHasBarracks,
  keepHasSiegeWorkshop,
  keepHasSmithy,
  keepHasSmithyCombo,
  keepHasTrebuchetYard,
  type ResourceCost,
  type TileYield,
} from './economy.ts';
import { getReachableTiles } from './movement.ts';
import { getIndexedKeepTiles } from './spatialIndex.ts';
import {
  getHouseKeeps,
  getHouseOutpostCap,
  getHouseOutposts,
  getHouseUnits,
  getKeepArmyCap,
  getKeepAt,
  getKeepSupportedUnitIds,
  getKeepWallCap,
  getKeepWatchtowerCap,
  getMapPresetConfig,
  getOutpostAt,
  getUnitAt,
  houseHasDecree,
} from './stateHelpers.ts';
import { isCommitPoint, type PlayerActionType } from './turn.ts';

export { getKeepFoodThreshold };

export interface HouseNetIncome {
  readonly food: number;
  readonly materials: number;
  readonly iron: number;
  readonly grossCoin: number;
  readonly unitUpkeep: number;
  readonly buildingUpkeep: number;
  readonly upkeep: number;
  readonly netCoin: number;
}

export function computeHouseNetIncome(state: GameState, houseId: HouseId): HouseNetIncome {
  const house = state.houses[houseId];
  if (!house || house.isEliminated) {
    return {
      food: 0,
      materials: 0,
      iron: 0,
      grossCoin: 0,
      unitUpkeep: 0,
      buildingUpkeep: 0,
      upkeep: 0,
      netCoin: 0,
    };
  }

  let food = 0;
  let materials = 0;
  let iron = 0;
  let grossCoin = 0;
  let buildingUpkeep = 0;

  for (const keep of getHouseKeeps(state, houseId)) {
    const y = computeKeepYield(state, keep.id);
    food += y.food;
    materials += y.materials;
    iron += y.iron;
    grossCoin += y.coin;
    buildingUpkeep += y.coinUpkeep;
  }

  const nonKeep = computeNonKeepOwnedYield(state, houseId);
  materials += nonKeep.materials;
  iron += nonKeep.iron;
  grossCoin += nonKeep.coin;
  buildingUpkeep += nonKeep.coinUpkeep;

  for (const unit of getHouseUnits(state, houseId)) {
    const tile = state.tiles[unit.tileKey];
    if (tile && tile.landmark === 'ancient_watchtower') {
      grossCoin += ANCIENT_WATCHTOWER_COIN_PER_TURN;
    }
  }

  const unitUpkeep = getHouseUnits(state, houseId).reduce(
    (sum, u) => sum + getUnitUpkeep(house, u.typeId, state.keeps[u.homeKeepId]),
    0,
  );
  const upkeep = unitUpkeep + buildingUpkeep;

  return {
    food,
    materials,
    iron,
    grossCoin,
    unitUpkeep,
    buildingUpkeep,
    upkeep,
    netCoin: grossCoin - upkeep,
  };
}

export interface SupremacyStats {
  readonly ownedKeeps: number;
  readonly totalKeeps: number;
  readonly percent: number;
  readonly requiredKeeps: number;
}

export function getSupremacyStats(state: GameState, houseId: HouseId): SupremacyStats {
  const cfg = getMapPresetConfig(state);
  const allKeeps = Object.values(state.keeps);
  const ownedKeeps = allKeeps.filter((k) => k.ownerHouseId === houseId).length;
  const totalKeeps = allKeeps.length;
  const percent = totalKeeps > 0 ? Math.round((ownedKeeps / totalKeeps) * 100) : 0;
  const minKeeps =
    state.houseOrder.length <= 4 ? cfg.supremacyMinKeeps4 : cfg.supremacyMinKeeps5;
  const requiredKeeps = Math.max(minKeeps, Math.ceil(totalKeeps * cfg.supremacyKeepShare));
  return { ownedKeeps, totalKeeps, percent, requiredKeeps };
}

export type AttackTargetKind =
  | 'unit'
  | 'keep'
  | 'high_seat'
  | 'outpost'
  | 'village'
  | 'camp'
  | 'fortification';

export interface AttackTargetInfo {
  readonly tileKey: CoordKey;
  readonly kind: AttackTargetKind;
  readonly label: string;
  readonly unitId: string | null;
  readonly keepId: string | null;
  readonly outpostId: string | null;
  readonly preview: CombatPreview | null;
  readonly counterStatus: 'advantage' | 'disadvantage' | 'neutral';
  readonly structureHp: number | null;
  readonly structureMaxHp: number | null;
}

export function getUnitAttackTargets(state: GameState, unitId: string): AttackTargetInfo[] {
  const attacker = state.units[unitId];
  if (!attacker || attacker.hasAttacked) return [];

  const house = state.houses[attacker.houseId];
  if (!house) return [];

  const attackerDef = UNITS[attacker.typeId];
  if (attackerDef.requiresDeploy && !attacker.isDeployed) return [];

  const range = getUnitAttackRange(state, attacker);
  const fog = state.fog[attacker.houseId] ?? {};
  const hasBodkin = houseHasDecree(house, 'decree_bodkin_volleys');
  const results: AttackTargetInfo[] = [];

  for (const c of getTilesInRadius(attacker.x, attacker.y, range, state.gridSize)) {
    const dist = chebyshevDist(attacker.x, attacker.y, c.x, c.y);
    if (dist < 1 || dist > range) continue;
    const key = coordKey(c.x, c.y);
    if (fog[key] !== 'visible') continue;
    if (range > 1 && !hasLineOfSight(state, attacker.x, attacker.y, c.x, c.y)) continue;
    const tile = state.tiles[key]!;

    // 1. Enemy unit
    const occ = getUnitAt(state, key);
    if (occ && occ.houseId !== attacker.houseId) {
      const defDef = UNITS[occ.typeId];
      const atkMult = getCounterMultiplier(attackerDef.unitClass, defDef.unitClass, hasBodkin);
      const defHouse = state.houses[occ.houseId];
      const defBodkin = defHouse ? houseHasDecree(defHouse, 'decree_bodkin_volleys') : false;
      const defMult = getCounterMultiplier(defDef.unitClass, attackerDef.unitClass, defBodkin);
      const counterStatus =
        atkMult > 1.0 ? 'advantage' : defMult > 1.0 ? 'disadvantage' : 'neutral';

      results.push({
        tileKey: key,
        kind: 'unit',
        label: defDef.name,
        unitId: occ.id,
        keepId: null,
        outpostId: null,
        preview: previewUnitCombat(state, attacker.id, occ.id),
        counterStatus,
        structureHp: null,
        structureMaxHp: null,
      });
      continue;
    }
    if (occ) continue;

    // 2. Unoccupied enemy Keep
    const keep = getKeepAt(state, key);
    if (keep && keep.ownerHouseId !== attacker.houseId) {
      results.push({
        tileKey: key,
        kind: 'keep',
        label: keep.name,
        unitId: null,
        keepId: keep.id,
        outpostId: null,
        preview: null,
        counterStatus: 'neutral',
        structureHp: keep.keepHp,
        structureMaxHp: keep.maxKeepHp,
      });
      continue;
    }

    // 3. Unoccupied enemy Outpost
    const outpost = getOutpostAt(state, key);
    if (outpost && outpost.ownerHouseId !== attacker.houseId) {
      results.push({
        tileKey: key,
        kind: 'outpost',
        label: outpost.name,
        unitId: null,
        keepId: null,
        outpostId: outpost.id,
        preview: null,
        counterStatus: 'neutral',
        structureHp: outpost.hp,
        structureMaxHp: OUTPOST_MAX_HP,
      });
      continue;
    }

    // 4. Neutral Central High Seat
    if (tile.landmark === 'high_seat' && tile.highSeatHp !== null && tile.highSeatHp > 0) {
      results.push({
        tileKey: key,
        kind: 'high_seat',
        label: 'Ruined High Seat',
        unitId: null,
        keepId: null,
        outpostId: null,
        preview: null,
        counterStatus: 'neutral',
        structureHp: tile.highSeatHp,
        structureMaxHp: HIGH_SEAT_MAX_HP,
      });
      continue;
    }

    // 5. Neutral Frontier Village
    if (tile.landmark === 'frontier_village' && tile.villageHp !== null && tile.villageHp > 0) {
      results.push({
        tileKey: key,
        kind: 'village',
        label: 'Frontier Village',
        unitId: null,
        keepId: null,
        outpostId: null,
        preview: null,
        counterStatus: 'neutral',
        structureHp: tile.villageHp,
        structureMaxHp: VILLAGE_MAX_HP,
      });
      continue;
    }

    // 6. Outlaw Camp
    if (
      tile.landmark === 'outlaw_camp' &&
      !tile.landmarkCleared &&
      tile.banditHp !== null &&
      tile.banditHp > 0
    ) {
      results.push({
        tileKey: key,
        kind: 'camp',
        label: 'Outlaw Camp',
        unitId: null,
        keepId: null,
        outpostId: null,
        preview: null,
        counterStatus: 'neutral',
        structureHp: tile.banditHp,
        structureMaxHp: BANDIT_MAX_HP,
      });
      continue;
    }

    // 7. Unmanned enemy Fortification
    if (
      tile.ownerHouseId !== null &&
      tile.ownerHouseId !== attacker.houseId &&
      tile.improvement !== null &&
      IMPROVEMENTS[tile.improvement].isFortification &&
      tile.fortificationHp !== null &&
      tile.fortificationHp > 0
    ) {
      const impDef = IMPROVEMENTS[tile.improvement];
      const maxHp =
        tile.improvementLevel === 2 && impDef.upgrade?.maxFortificationHp
          ? impDef.upgrade.maxFortificationHp
          : (impDef.maxFortificationHp ?? 14);
      results.push({
        tileKey: key,
        kind: 'fortification',
        label:
          tile.improvementLevel === 2 && impDef.upgrade ? impDef.upgrade.name : impDef.name,
        unitId: null,
        keepId: null,
        outpostId: null,
        preview: null,
        counterStatus: 'neutral',
        structureHp: tile.fortificationHp,
        structureMaxHp: maxHp,
      });
    }
  }

  return results;
}

export function getKeepVolleyTargets(state: GameState, keepId: string): UnitState[] {
  const keep = state.keeps[keepId];
  if (!keep || keep.tier < 3 || keep.garrisonVolleyUsedThisTurn) return [];
  const targets: UnitState[] = [];
  for (const c of getTilesInRadius(keep.x, keep.y, 2, state.gridSize)) {
    const u = getUnitAt(state, coordKey(c.x, c.y));
    if (u && canFireKeepGarrisonVolley(state, keepId, u.id)) {
      targets.push(u);
    }
  }
  return targets;
}

export interface BuildPreviewInfo {
  readonly improvementId: ImprovementId;
  readonly costs: ResourceCost;
  readonly matCost: number;
  readonly canBuild: boolean;
  readonly deltaYield: TileYield;
  readonly adjacencyCallouts: readonly string[];
}

export function previewImprovementOnTile(
  state: GameState,
  houseId: HouseId,
  tileKey: CoordKey,
  improvementId: ImprovementId,
): BuildPreviewInfo {
  const costs = getImprovementCosts(state, houseId, improvementId);
  const canBuild = canBuildImprovement(state, houseId, tileKey, improvementId);
  const tile = state.tiles[tileKey];

  if (!tile) {
    return {
      improvementId,
      costs,
      matCost: costs.materials,
      canBuild: false,
      deltaYield: { food: 0, materials: 0, iron: 0, coin: 0, coinUpkeep: 0 },
      adjacencyCallouts: [],
    };
  }

  const before = computeTileYield(state, tileKey);
  const simulatedState: GameState = {
    ...state,
    tiles: {
      ...state.tiles,
      [tileKey]: { ...tile, ownerHouseId: houseId, improvement: improvementId, improvementLevel: 1 },
    },
  };
  const after = computeTileYield(simulatedState, tileKey);
  const deltaYield: TileYield = {
    food: after.food - before.food,
    materials: after.materials - before.materials,
    iron: after.iron - before.iron,
    coin: after.coin - before.coin,
    coinUpkeep: after.coinUpkeep - before.coinUpkeep,
  };

  const neighbors = getNeighbors(tile.x, tile.y, state.gridSize).map(
    (c) => state.tiles[coordKey(c.x, c.y)]!,
  );
  const callouts: string[] = [];

  if (improvementId === 'farm' && neighbors.some((n) => n.terrain === 'river')) {
    callouts.push(`+${FARM_RIVER_BONUS_FOOD} Food (River Irrigation)`);
  }
  if (
    improvementId === 'lumber_mill' &&
    neighbors.filter((n) => n.terrain === 'forest').length >= LUMBER_MILL_FOREST_THRESHOLD
  ) {
    callouts.push(`+${LUMBER_MILL_FOREST_BONUS_MAT} Materials (Deep Timber)`);
  }
  if (improvementId === 'smithy') {
    const hasOre = neighbors.some(
      (n) =>
        n.ownerHouseId === houseId &&
        (n.improvement === 'iron_mine' || n.improvement === 'deep_smeltery'),
    );
    const hasFuel = neighbors.some(
      (n) =>
        n.ownerHouseId === houseId &&
        (n.improvement === 'lumber_mill' || n.improvement === 'stone_quarry'),
    );
    if (hasOre && hasFuel) {
      callouts.push('FORGE ACTIVE — Unlocks Knights / Gilded Lancers at this Keep');
    } else {
      callouts.push('Place next to Iron Mine/Smeltery & Lumber Mill/Quarry for Heavy Cavalry');
    }
  }
  if (improvementId === 'market') {
    const adjBonus =
      neighbors.filter(
        (n) =>
          n.terrain === 'river' ||
          (n.ownerHouseId === houseId &&
            (n.improvement === 'farm' || n.improvement === 'stone_bridge')),
      ).length * MARKET_ADJ_BONUS_COIN;
    if (adjBonus > 0) callouts.push(`+${adjBonus} Coin (Trade Crossroads)`);
  }
  if (improvementId === 'granary') {
    const adjFarms = neighbors.filter(
      (n) => n.ownerHouseId === houseId && n.improvement === 'farm',
    ).length;
    if (adjFarms > 0) callouts.push(`+${adjFarms * GRANARY_ADJ_BONUS_FOOD} Food to adj Farms`);
    callouts.push('Satisfies Keep Winter Provisioning');
  }
  if (improvementId === 'palisade') {
    callouts.push('+20% stacking Def | Blocks diagonals when linked | -25% ranged dmg');
  }
  if (improvementId === 'watchtower') {
    callouts.push('7x7 vision | +1 Ranged Reach & +15% Atk | Winter shelter');
  }
  if (improvementId === 'barracks') {
    callouts.push('Unlocks Archers, Men-at-Arms & Barracks signature unit at this Keep');
  }
  if (improvementId === 'siege_workshop') {
    callouts.push('Unlocks Siege Ram (+2 HP) at this Keep; Lv2 unlocks Trebuchet');
  }

  return {
    improvementId,
    costs,
    matCost: costs.materials,
    canBuild,
    deltaYield,
    adjacencyCallouts: callouts,
  };
}

export function canUnitAct(state: GameState, unit: UnitState): boolean {
  if (unit.isFortified || unit.isOverwatch) return false;
  if (
    unit.remainingMovement > 0 &&
    (!unit.hasAttacked || unit.typeId === 'dusk_outrider') &&
    Object.keys(getReachableTiles(state, unit.id)).length > 0
  ) {
    return true;
  }
  if (!unit.hasAttacked) {
    if (getUnitAttackTargets(state, unit.id).length > 0) return true;
    if (canPillageTile(state, unit.id)) return true;
    if (canDeployTrebuchet(state, unit.id)) return true;
  }
  return false;
}

export function getActionableUnits(
  state: GameState,
  houseId: HouseId,
  skippedUnitIds?: readonly string[],
): UnitState[] {
  const skipped = skippedUnitIds && skippedUnitIds.length > 0 ? new Set(skippedUnitIds) : null;
  return getHouseUnits(state, houseId)
    .filter((u) => (!skipped || !skipped.has(u.id)) && canUnitAct(state, u))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getNextIdleUnit(
  state: GameState,
  houseId: HouseId,
  currentUnitId: string | null,
  skippedUnitIds?: readonly string[],
): UnitState | null {
  const idle = getActionableUnits(state, houseId, skippedUnitIds);
  if (idle.length === 0) return null;
  if (!currentUnitId) return idle[0]!;
  const idx = idle.findIndex((u) => u.id === currentUnitId);
  return idle[(idx + 1) % idle.length]!;
}

export function getUnitRankLabel(xp: number): {
  readonly rank: 0 | 1 | 2;
  readonly title: string;
  readonly nextXp: number | null;
} {
  const rank = getUnitRank(xp);
  if (rank === 2) return { rank: 2, title: 'Veteran', nextXp: null };
  if (rank === 1) return { rank: 1, title: 'Seasoned', nextXp: VETERANCY_RANK2_XP };
  return { rank: 0, title: 'Recruit', nextXp: VETERANCY_RANK1_XP };
}

export interface TileInspectInfo {
  readonly yieldNow: TileYield;
  readonly defBonusPct: number;
  readonly moveCostLabel: string;
  readonly canUpgrade: boolean;
  readonly upgradeCosts: ResourceCost | null;
  readonly canRoad: boolean;
  readonly roadCost: number;
  readonly canClear: boolean;
}

export function getTileInspectInfo(
  state: GameState,
  tileKey: CoordKey,
  viewerHouseId: HouseId,
): TileInspectInfo {
  const tile = state.tiles[tileKey];
  if (!tile) {
    return {
      yieldNow: { food: 0, materials: 0, iron: 0, coin: 0, coinUpkeep: 0 },
      defBonusPct: 0,
      moveCostLabel: '—',
      canUpgrade: false,
      upgradeCosts: null,
      canRoad: false,
      roadCost: 0,
      canClear: false,
    };
  }
  const defHouse = tile.ownerHouseId ?? viewerHouseId;
  const defBonusPct = Math.round(getTileTerrainOrFortDefBonus(state, tile, defHouse) * 100);
  const yieldNow = computeTileYield(state, tileKey);
  const moveCostLabel =
    tile.terrain === 'mountain'
      ? 'Impassable'
      : tile.hasRoad || tile.terrain === 'plains'
        ? '1 MP'
        : '2 MP';

  return {
    yieldNow,
    defBonusPct,
    moveCostLabel,
    canUpgrade: canUpgradeImprovement(state, viewerHouseId, tileKey),
    upgradeCosts:
      tile.improvement !== null
        ? getImprovementUpgradeCosts(state, viewerHouseId, tile.improvement)
        : null,
    canRoad: canBuildRoad(state, viewerHouseId, tileKey),
    roadCost: getRoadCost(state.houses[viewerHouseId]),
    canClear: canClearTimber(state, viewerHouseId, tileKey),
  };
}

export interface KeepInspectInfo {
  readonly keepYield: TileYield;
  readonly usedCap: number;
  readonly maxCap: number;
  readonly foodThreshold: number;
  readonly hasBarracks: boolean;
  readonly hasSmithy: boolean;
  readonly hasSmithyCombo: boolean;
  readonly hasSiegeWorkshop: boolean;
  readonly hasTrebuchetYard: boolean;
  readonly canRepair: boolean;
  readonly canUpgradeTier3: boolean;
  readonly volleyTargets: readonly UnitState[];
}

export function getKeepInspectInfo(
  state: GameState,
  houseId: HouseId,
  keepId: string,
): KeepInspectInfo | null {
  const keep = state.keeps[keepId];
  if (!keep) return null;
  return {
    keepYield: computeKeepYield(state, keepId),
    usedCap: getKeepSupportedUnitIds(state, keepId).length,
    maxCap: getKeepArmyCap(state, keepId),
    foodThreshold: getKeepFoodThreshold(keep),
    hasBarracks: keepHasBarracks(state, keepId),
    hasSmithy: keepHasSmithy(state, keepId),
    hasSmithyCombo: keepHasSmithyCombo(state, keepId),
    hasSiegeWorkshop: keepHasSiegeWorkshop(state, keepId),
    hasTrebuchetYard: keepHasTrebuchetYard(state, keepId),
    canRepair: canRepairKeep(state, houseId, keepId),
    canUpgradeTier3: canUpgradeKeepToTier3(state, houseId, keepId),
    volleyTargets: keep.ownerHouseId === houseId ? getKeepVolleyTargets(state, keepId) : [],
  };
}

export function getKeepPalisadeCount(state: GameState, keepId: string): {
  current: number;
  max: number;
} {
  const keep = state.keeps[keepId];
  if (!keep) return { current: 0, max: 3 };
  const current = getIndexedKeepTiles(state, keepId).filter((t) => t.improvement === 'palisade').length;
  return { current, max: getKeepWallCap(keep) };
}

export function getKeepWatchtowerCount(state: GameState, keepId: string): {
  current: number;
  max: number;
} {
  const keep = state.keeps[keepId];
  if (!keep) return { current: 0, max: 2 };
  const current = getIndexedKeepTiles(state, keepId).filter((t) => t.improvement === 'watchtower').length;
  return { current, max: getKeepWatchtowerCap(keep) };
}

export function getHouseOutpostStats(state: GameState, houseId: HouseId): {
  current: number;
  max: number;
} {
  return {
    current: getHouseOutposts(state, houseId).length,
    max: getHouseOutpostCap(state.houses[houseId]),
  };
}

export function getUnitActionFlags(state: GameState, unitId: string): {
  readonly canFortify: boolean;
  readonly canOverwatch: boolean;
  readonly canDeploy: boolean;
  readonly canReinforce: boolean;
  readonly reinforceCost: ResourceCost;
  readonly canPillage: boolean;
  readonly canFoundOutpostHere: boolean;
  readonly canUseSkill: boolean;
} {
  const u = state.units[unitId];
  if (!u) {
    return {
      canFortify: false,
      canOverwatch: false,
      canDeploy: false,
      canReinforce: false,
      reinforceCost: { materials: 0, iron: 0, coin: 0 },
      canPillage: false,
      canFoundOutpostHere: false,
      canUseSkill: false,
    };
  }
  return {
    canFortify: canFortifyUnit(state, unitId),
    canOverwatch: canActivateOverwatch(state, unitId),
    canDeploy: canDeployTrebuchet(state, unitId),
    canReinforce: canReinforceUnit(state, unitId),
    reinforceCost: getReinforceCost(state, unitId),
    canPillage: canPillageTile(state, unitId),
    canFoundOutpostHere: canBuildOutpost(state, unitId, u.tileKey),
    canUseSkill: u.isCommander && canUseCommanderSkill(state, u.houseId),
  };
}

export function getCommitPointReason(
  prevState: GameState,
  nextState: GameState,
  actionType: PlayerActionType,
  viewerHouseId: HouseId,
): string | null {
  if (!isCommitPoint(prevState, nextState, actionType, viewerHouseId)) return null;
  if (
    actionType === 'attack' ||
    actionType === 'attack_keep' ||
    actionType === 'attack_high_seat' ||
    actionType === 'attack_outpost' ||
    actionType === 'attack_village' ||
    actionType === 'attack_camp' ||
    actionType === 'garrison_volley' ||
    actionType === 'raze' ||
    actionType === 'pillage'
  ) {
    return 'Blood was drawn';
  }
  if (actionType === 'end_turn') return 'A new turn has begun';
  if (nextState.rngCounter !== prevState.rngCounter) return 'The die is cast';
  if (
    actionType === 'annex' ||
    actionType === 'clear_timber' ||
    actionType === 'build_outpost' ||
    actionType === 'upgrade_keep_t3' ||
    actionType === 'commander_skill' ||
    actionType === 'draft' ||
    actionType === 'specialize' ||
    actionType === 'citadel' ||
    actionType === 'honor' ||
    actionType === 'commander_trait' ||
    actionType === 'event_choice' ||
    actionType === 'writ_tithe'
  ) {
    return 'Action cannot be undone';
  }
  return 'New ground was revealed';
}

export { canRallyCommanderEarly };
