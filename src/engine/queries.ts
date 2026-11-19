/**
 * Marchlands (Spec v0.3) — Headless Read-Only UI Query Helpers
 *
 * Keeps 100% of game math (income, combat targets, build yield previews,
 * supremacy shares, undo commit reasons) inside src/engine/ so React
 * components never compute game rules.
 */

import type {
  CoordKey,
  GameState,
  HouseId,
  ImprovementId,
  KeepState,
  UnitState,
} from '../types/game.ts';
import {
  ANCIENT_WATCHTOWER_COIN_PER_TURN,
  FARM_RIVER_BONUS_FOOD,
  GRANARY_ADJ_BONUS_FOOD,
  IMPROVEMENTS,
  KEEP_SPECIALIZATIONS,
  KEEP_TIER1_FOOD_THRESHOLD,
  KEEP_TIER2_REPEAT_FOOD_THRESHOLD,
  LUMBER_MILL_FOREST_BONUS_MAT,
  LUMBER_MILL_FOREST_THRESHOLD,
  MARKET_ADJ_BONUS_COIN,
  PALISADE_CAP_GARRISON,
  PALISADE_CAP_TIER1,
  PALISADE_CAP_TIER2,
  SUPREMACY_KEEP_SHARE,
  SUPREMACY_MIN_KEEPS,
  UNITS,
  VILLAGE_MAX_HP,
} from '../data/index.ts';
import {
  getCounterMultiplier,
  getUnitAttackRange,
  hasLineOfSight,
  previewUnitCombat,
  type CombatPreview,
} from './combat.ts';
import { chebyshevDist, coordKey, getNeighbors } from './coords.ts';
import {
  canBuildImprovement,
  computeKeepYield,
  computeTileYield,
  getImprovementCost,
  getUnitUpkeep,
  type TileYield,
} from './economy.ts';
import {
  getHouseKeeps,
  getHouseUnits,
  getKeepAt,
  getKeepPalisadeCap,
  getUnitAt,
  houseHasDecree,
} from './stateHelpers.ts';
import { isCommitPoint, type PlayerActionType } from './turn.ts';

export interface HouseNetIncome {
  readonly food: number;
  readonly materials: number;
  readonly grossCoin: number;
  readonly upkeep: number;
  readonly netCoin: number;
}

export function computeHouseNetIncome(state: GameState, houseId: HouseId): HouseNetIncome {
  const house = state.houses[houseId];
  if (!house || house.isEliminated) {
    return { food: 0, materials: 0, grossCoin: 0, upkeep: 0, netCoin: 0 };
  }

  let food = 0;
  let materials = 0;
  let grossCoin = 0;

  for (const keep of getHouseKeeps(state, houseId)) {
    const y = computeKeepYield(state, keep.id);
    food += y.food;
    materials += y.materials;
    grossCoin += y.coin;
  }

  // Ancient Watchtower occupation income
  for (const unit of getHouseUnits(state, houseId)) {
    const tile = state.tiles[unit.tileKey];
    if (tile && tile.landmark === 'ancient_watchtower') {
      grossCoin += ANCIENT_WATCHTOWER_COIN_PER_TURN;
    }
  }

  const upkeep = getHouseUnits(state, houseId).reduce(
    (sum, u) => sum + getUnitUpkeep(house, u.typeId),
    0,
  );

  return {
    food,
    materials,
    grossCoin,
    upkeep,
    netCoin: grossCoin - upkeep,
  };
}

export function getKeepFoodThreshold(keep: KeepState): number {
  if (keep.tier === 1) return KEEP_TIER1_FOOD_THRESHOLD;
  if (keep.specialization === 'granary_seat') {
    return KEEP_SPECIALIZATIONS.granary_seat.repeatFoodThreshold;
  }
  return KEEP_TIER2_REPEAT_FOOD_THRESHOLD;
}

export interface SupremacyStats {
  readonly ownedKeeps: number;
  readonly totalKeeps: number;
  readonly percent: number;
  readonly requiredKeeps: number;
}

export function getSupremacyStats(state: GameState, houseId: HouseId): SupremacyStats {
  const allKeeps = Object.values(state.keeps);
  const ownedKeeps = allKeeps.filter((k) => k.ownerHouseId === houseId).length;
  const totalKeeps = allKeeps.length;
  const percent = totalKeeps > 0 ? Math.round((ownedKeeps / totalKeeps) * 100) : 0;
  const requiredKeeps = Math.max(
    SUPREMACY_MIN_KEEPS,
    Math.ceil(totalKeeps * SUPREMACY_KEEP_SHARE),
  );
  return { ownedKeeps, totalKeeps, percent, requiredKeeps };
}

export type AttackTargetKind = 'unit' | 'keep' | 'village' | 'camp' | 'fortification';

export interface AttackTargetInfo {
  readonly tileKey: CoordKey;
  readonly kind: AttackTargetKind;
  readonly label: string;
  readonly unitId: string | null;
  readonly keepId: string | null;
  readonly preview: CombatPreview | null;
  readonly counterStatus: 'advantage' | 'disadvantage' | 'neutral';
  readonly structureHp: number | null;
  readonly structureMaxHp: number | null;
}

export function getUnitAttackTargets(
  state: GameState,
  unitId: string,
): AttackTargetInfo[] {
  const attacker = state.units[unitId];
  if (!attacker || attacker.hasAttacked) return [];

  const house = state.houses[attacker.houseId];
  if (!house) return [];

  const attackerDef = UNITS[attacker.typeId];
  const range = getUnitAttackRange(state, attacker);
  const fog = state.fog[attacker.houseId] ?? {};
  const hasBodkin = houseHasDecree(house, 'decree_fletcher_volleys');
  const results: AttackTargetInfo[] = [];

  for (const tile of Object.values(state.tiles)) {
    const dist = chebyshevDist(attacker.x, attacker.y, tile.x, tile.y);
    if (dist < 1 || dist > range) continue;
    if (fog[tile.key] !== 'visible') continue;
    if (range > 1 && !hasLineOfSight(state, attacker.x, attacker.y, tile.x, tile.y)) {
      continue;
    }

    // 1. Enemy unit
    const occ = getUnitAt(state, tile.key);
    if (occ && occ.houseId !== attacker.houseId) {
      const defDef = UNITS[occ.typeId];
      const atkMult = getCounterMultiplier(attackerDef.unitClass, defDef.unitClass, hasBodkin);
      const defHouse = state.houses[occ.houseId];
      const defBodkin = defHouse ? houseHasDecree(defHouse, 'decree_fletcher_volleys') : false;
      const defMult = getCounterMultiplier(defDef.unitClass, attackerDef.unitClass, defBodkin);
      const counterStatus =
        atkMult > 1.0 ? 'advantage' : defMult > 1.0 ? 'disadvantage' : 'neutral';

      results.push({
        tileKey: tile.key,
        kind: 'unit',
        label: defDef.name,
        unitId: occ.id,
        keepId: null,
        preview: previewUnitCombat(state, attacker.id, occ.id),
        counterStatus,
        structureHp: null,
        structureMaxHp: null,
      });
      continue;
    }

    if (occ) continue; // Friendly unit on tile

    // 2. Unoccupied enemy Keep
    const keep = getKeepAt(state, tile.key);
    if (keep && keep.ownerHouseId !== attacker.houseId) {
      results.push({
        tileKey: tile.key,
        kind: 'keep',
        label: keep.name,
        unitId: null,
        keepId: keep.id,
        preview: null,
        counterStatus: 'neutral',
        structureHp: keep.keepHp,
        structureMaxHp: keep.maxKeepHp,
      });
      continue;
    }

    // 3. Neutral Frontier Village
    if (tile.landmark === 'frontier_village' && tile.villageHp !== null && tile.villageHp > 0) {
      results.push({
        tileKey: tile.key,
        kind: 'village',
        label: 'Frontier Village',
        unitId: null,
        keepId: null,
        preview: null,
        counterStatus: 'neutral',
        structureHp: tile.villageHp,
        structureMaxHp: VILLAGE_MAX_HP,
      });
      continue;
    }

    // 4. Outlaw Camp
    if (tile.landmark === 'outlaw_camp' && !tile.landmarkCleared && tile.banditHp !== null && tile.banditHp > 0) {
      results.push({
        tileKey: tile.key,
        kind: 'camp',
        label: 'Outlaw Camp',
        unitId: null,
        keepId: null,
        preview: null,
        counterStatus: 'neutral',
        structureHp: tile.banditHp,
        structureMaxHp: 18,
      });
      continue;
    }

    // 5. Unmanned enemy fortification (Palisade / Watchtower)
    if (
      tile.ownerHouseId !== null &&
      tile.ownerHouseId !== attacker.houseId &&
      (tile.improvement === 'palisade' || tile.improvement === 'watchtower') &&
      tile.fortificationHp !== null &&
      tile.fortificationHp > 0
    ) {
      results.push({
        tileKey: tile.key,
        kind: 'fortification',
        label: IMPROVEMENTS[tile.improvement].name,
        unitId: null,
        keepId: null,
        preview: null,
        counterStatus: 'neutral',
        structureHp: tile.fortificationHp,
        structureMaxHp: 12,
      });
    }
  }

  return results;
}

export interface BuildPreviewInfo {
  readonly improvementId: ImprovementId;
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
  const matCost = getImprovementCost(houseId, improvementId);
  const canBuild = canBuildImprovement(state, houseId, tileKey, improvementId);
  const tile = state.tiles[tileKey];

  if (!tile) {
    return {
      improvementId,
      matCost,
      canBuild: false,
      deltaYield: { food: 0, materials: 0, coin: 0 },
      adjacencyCallouts: [],
    };
  }

  const before = computeTileYield(state, tileKey);
  const simulatedState: GameState = {
    ...state,
    tiles: {
      ...state.tiles,
      [tileKey]: { ...tile, improvement: improvementId },
    },
  };
  const after = computeTileYield(simulatedState, tileKey);
  const deltaYield: TileYield = {
    food: after.food - before.food,
    materials: after.materials - before.materials,
    coin: after.coin - before.coin,
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
    const hasIron = neighbors.some(
      (n) =>
        n.ownerHouseId === houseId &&
        (n.improvement === 'iron_mine' || n.improvement === 'deep_smeltery'),
    );
    const hasMill = neighbors.some(
      (n) => n.ownerHouseId === houseId && n.improvement === 'lumber_mill',
    );
    if (hasIron && hasMill) {
      callouts.push('FORGE ACTIVE — Unlocks Heavy Cavalry at this Keep');
    }
  }
  if (improvementId === 'market') {
    const adjBonus =
      neighbors.filter(
        (n) =>
          n.terrain === 'river' ||
          (n.ownerHouseId === houseId && n.improvement === 'farm'),
      ).length * MARKET_ADJ_BONUS_COIN;
    if (adjBonus > 0) {
      callouts.push(`+${adjBonus} Coin (Trade Crossroads)`);
    }
  }
  if (improvementId === 'granary') {
    const adjFarms = neighbors.filter(
      (n) => n.ownerHouseId === houseId && n.improvement === 'farm',
    ).length;
    if (adjFarms > 0) {
      callouts.push(`+${adjFarms * GRANARY_ADJ_BONUS_FOOD} Food to neighboring Farms`);
    }
  }
  if (improvementId === 'palisade') {
    callouts.push('Blocks enemy movement | +30% Def to defenders');
  }
  if (improvementId === 'foresters_lodge') {
    callouts.push('Preserves Forest (+1 Mat Passive)');
  }
  if (improvementId === 'deep_smeltery') {
    callouts.push('Operates on bare Mountain & counts as Iron Mine for Smithy');
  }
  if (improvementId === 'river_tollhouse') {
    callouts.push('Acts as a bridge for friendly units');
  }
  if (improvementId === 'war_camp') {
    callouts.push('Raises this Keep Army Cap by +1');
  }
  if (improvementId === 'signal_bastion') {
    callouts.push('Reveals 5x5 fog & grants +20% Atk adjacent');
  }

  return {
    improvementId,
    matCost,
    canBuild,
    deltaYield,
    adjacencyCallouts: callouts,
  };
}

export function getNextIdleUnit(
  state: GameState,
  houseId: HouseId,
  currentUnitId: string | null,
): UnitState | null {
  const idle = getHouseUnits(state, houseId)
    .filter((u) => !u.hasMoved || !u.hasAttacked)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (idle.length === 0) return null;
  if (!currentUnitId) return idle[0]!;
  const idx = idle.findIndex((u) => u.id === currentUnitId);
  return idle[(idx + 1) % idle.length]!;
}

export function getKeepPalisadeCount(state: GameState, keepId: string): {
  current: number;
  max: number;
} {
  const keep = state.keeps[keepId];
  if (!keep) return { current: 0, max: PALISADE_CAP_TIER1 };
  const current = Object.values(state.tiles).filter(
    (t) => t.keepId === keepId && t.improvement === 'palisade',
  ).length;
  const max =
    keep.specialization === 'garrison'
      ? PALISADE_CAP_GARRISON
      : keep.tier === 2
        ? PALISADE_CAP_TIER2
        : getKeepPalisadeCap(keep);
  return { current, max };
}

export function getCommitPointReason(
  prevState: GameState,
  nextState: GameState,
  actionType: PlayerActionType,
  viewerHouseId: HouseId,
): string | null {
  if (!isCommitPoint(prevState, nextState, actionType, viewerHouseId)) {
    return null;
  }
  if (
    actionType === 'attack' ||
    actionType === 'attack_keep' ||
    actionType === 'attack_village' ||
    actionType === 'attack_camp' ||
    actionType === 'raze' ||
    actionType === 'pillage'
  ) {
    return 'Blood was drawn';
  }
  if (actionType === 'end_turn') {
    return 'A new turn has begun';
  }
  if (
    actionType === 'annex' ||
    actionType === 'draft' ||
    actionType === 'specialize' ||
    actionType === 'event_choice' ||
    actionType === 'writ_tithe'
  ) {
    return 'Action cannot be undone';
  }
  if (nextState.rngCounter !== prevState.rngCounter) {
    return 'The die is cast';
  }
  return 'New ground was revealed';
}
