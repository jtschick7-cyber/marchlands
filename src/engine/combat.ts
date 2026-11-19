/**
 * Marchlands (Spec v0.3) — Deterministic Combat, Siege, Raze & Pillage Engine
 */

import type {
  CoordKey,
  GameState,
  HouseId,
  KeepState,
  TileState,
  UnitClass,
  UnitState,
} from '../types/game.ts';
import {
  ANCIENT_WATCHTOWER_DEF_BONUS,
  BANDIT_ATTACK,
  BANDIT_CLASS,
  BANDIT_DEFENSE,
  BANDIT_MAX_HP,
  BODKIN_QUIVERS_COUNTER_MULT,
  BONUS_SUM_MAX,
  BONUS_SUM_MIN,
  COMBAT_DAMAGE_SCALE,
  CORVUS_PLUNDER_MULTIPLIER,
  COUNTER_ADVANTAGE_MULT,
  COUNTER_MATCHUPS,
  FLANKING_ATK_BONUS,
  FORTIFICATION_DEF_BONUS,
  FORTIFICATION_DEFENSE,
  FORTIFICATION_MASONRY_DEF_BONUS,
  HIGHLAND_SCOUTS_CAVALRY_PLAINS_ATK,
  IMPROVEMENTS,
  KEEP_BASE_MAX_HP,
  KEEP_DEF_BONUS,
  KEEP_GARRISON_ATTACK,
  KEEP_GARRISON_DEFENSE,
  KEEP_MASONRY_DEF_BONUS,
  KEEP_TIER1_RADIUS,
  LONGBOWMAN_TERRAIN_ATK_BONUS,
  MASONRY_SIEGE_DAMAGE_REDUCTION,
  MUTINY_ATK_PENALTY,
  OATHSWORN_WALL_DEF_BONUS,
  OUTLAW_CAMP_BOUNTY_COIN,
  PILLAGE_BASE_COIN,
  PILLAGE_MAT_RATIO,
  SALVAGE_CREWS_MAT_REWARD,
  SHIELD_WALL_DEF_BONUS,
  SIGNAL_BASTION_ADJ_ATK_BONUS,
  SUPPLY_SEVERED_ATK_PENALTY,
  SUPPLY_SEVERED_DEF_PENALTY,
  TERRAINS,
  UNITS,
  VETERAN_DRILL_ATK_BONUS,
  VILLAGE_ATTACK,
  VILLAGE_DEF_BONUS,
  VILLAGE_DEFENSE,
  VILLAGE_MAX_HP,
  VILLAGE_SEIZE_FAVOR_PENALTY,
  VILLAGE_SEIZE_KEEP_HP,
} from '../data/index.ts';
import { chebyshevDist, coordKey, getNeighbors } from './coords.ts';
import { autoRehomeOrphans, captureKeep, claimKeepTerritory } from './capture.ts';
import { permanentlyRevealRadius, recomputeHouseFog } from './fog.ts';
import {
  addFavor,
  addLifetimeCoin,
  allocateSettlementName,
  appendChronicle,
  getKeepAt,
  getUnitAt,
  houseHasDecree,
} from './stateHelpers.ts';

export interface CombatPreview {
  readonly attackerDamage: number;
  readonly retaliationDamage: number;
  readonly attackerHpAfter: number;
  readonly defenderHpAfter: number;
  readonly defenderDestroyed: boolean;
  readonly attackerDestroyed: boolean;
  readonly oneShotProtectionTriggered: boolean;
  readonly braceTriggered: boolean;
}

export function clampBonusSum(sum: number): number {
  return Math.max(BONUS_SUM_MIN, Math.min(BONUS_SUM_MAX, sum));
}

export function getCounterMultiplier(
  attackerClass: UnitClass,
  defenderClass: UnitClass,
  attackerHasBodkin: boolean,
): number {
  if (!COUNTER_MATCHUPS[attackerClass].includes(defenderClass)) {
    return 1.0;
  }
  if (attackerClass === 'ranged' && defenderClass === 'spearman' && attackerHasBodkin) {
    return BODKIN_QUIVERS_COUNTER_MULT;
  }
  return COUNTER_ADVANTAGE_MULT;
}

export function computeCombatDamage(effAtk: number, effDef: number): number {
  if (effAtk <= 0) return 1;
  const denom = effAtk + Math.max(0, effDef);
  if (denom <= 0) return 1;
  return Math.max(1, Math.round((effAtk / denom) * effAtk * COMBAT_DAMAGE_SCALE));
}

export function applyOneShotProtection(
  rawDamage: number,
  defenderHpBefore: number,
  defenderMaxHp: number,
  attackerRange: number,
  counterMult: number,
): { damage: number; triggered: boolean } {
  if (
    defenderHpBefore === defenderMaxHp &&
    rawDamage >= defenderHpBefore &&
    !(attackerRange === 1 && counterMult > 1.0)
  ) {
    return { damage: Math.max(0, defenderHpBefore - 1), triggered: true };
  }
  return { damage: rawDamage, triggered: false };
}

/**
 * Ruling 6.1: Ranged units on Hills gain +1 range.
 */
export function getUnitAttackRange(state: GameState, unit: UnitState): number {
  const def = UNITS[unit.typeId];
  const tile = state.tiles[unit.tileKey];
  if (def.unitClass === 'ranged' && tile?.terrain === 'hills') {
    return def.range + TERRAINS.hills.rangedBonusRange;
  }
  return def.range;
}

/**
 * Ruling 6.1: Mountain tiles block ranged LOS unless attacker is on Hills.
 */
export function hasLineOfSight(
  state: GameState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  const dist = chebyshevDist(fromX, fromY, toX, toY);
  if (dist <= 1) return true;

  const originTile = state.tiles[coordKey(fromX, fromY)];
  if (originTile?.terrain === 'hills') return true;

  // Check intermediate tiles along the line segment
  const steps = dist * 2;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.round(fromX + (toX - fromX) * t);
    const y = Math.round(fromY + (toY - fromY) * t);
    if ((x === fromX && y === fromY) || (x === toX && y === toY)) continue;
    const tile = state.tiles[coordKey(x, y)];
    if (tile && TERRAINS[tile.terrain].blocksRangedLos) {
      return false;
    }
  }
  return true;
}

/**
 * Highest single non-stacking terrain or fortification DefBonus for a unit on `tile`.
 */
export function getTileTerrainOrFortDefBonus(
  state: GameState,
  tile: TileState,
  defenderHouseId: HouseId,
): number {
  let best = TERRAINS[tile.terrain].defBonus;

  if (tile.landmark === 'ancient_watchtower') {
    best = Math.max(best, ANCIENT_WATCHTOWER_DEF_BONUS);
  }

  const house = state.houses[defenderHouseId];
  const hasMasonry = house ? houseHasDecree(house, 'decree_masonry_reinforcement') : false;

  if (
    tile.ownerHouseId === defenderHouseId &&
    (tile.improvement === 'palisade' || tile.improvement === 'watchtower')
  ) {
    best = Math.max(best, hasMasonry ? FORTIFICATION_MASONRY_DEF_BONUS : FORTIFICATION_DEF_BONUS);
  }

  const keep = getKeepAt(state, tile.key);
  if (keep && keep.ownerHouseId === defenderHouseId) {
    best = Math.max(best, hasMasonry ? KEEP_MASONRY_DEF_BONUS : KEEP_DEF_BONUS);
  }

  return best;
}

/**
 * Checks whether `defender` is flanked by `attacker` (another unit of attacker's House
 * adjacent to defender; Vanguard Spearman is immune).
 */
export function isTargetFlanked(
  state: GameState,
  attacker: UnitState,
  defender: UnitState,
): boolean {
  if (defender.typeId === 'vanguard_spearman') return false;
  for (const n of getNeighbors(defender.x, defender.y, state.gridSize)) {
    const other = getUnitAt(state, coordKey(n.x, n.y));
    if (other && other.houseId === attacker.houseId && other.id !== attacker.id) {
      return true;
    }
  }
  return false;
}

export function getUnitAtkBonusSum(
  state: GameState,
  attacker: UnitState,
  isFlanked: boolean,
): number {
  const house = state.houses[attacker.houseId];
  const def = UNITS[attacker.typeId];
  const atkTile = state.tiles[attacker.tileKey]!;
  let sum = 0;

  if (house && houseHasDecree(house, 'decree_veteran_drill')) {
    sum += VETERAN_DRILL_ATK_BONUS;
  }

  if (
    attacker.typeId === 'longbowman' &&
    (atkTile.terrain === 'forest' || atkTile.terrain === 'hills')
  ) {
    sum += LONGBOWMAN_TERRAIN_ATK_BONUS;
  }

  // Adjacent friendly Signal Bastion (+0.15)
  const nearBastion = getNeighbors(attacker.x, attacker.y, state.gridSize).some((n) => {
    const nt = state.tiles[coordKey(n.x, n.y)];
    return nt?.ownerHouseId === attacker.houseId && nt.improvement === 'signal_bastion';
  });
  if (nearBastion) {
    sum += SIGNAL_BASTION_ADJ_ATK_BONUS;
  }

  if (isFlanked) {
    sum += FLANKING_ATK_BONUS;
  }

  if (
    house &&
    houseHasDecree(house, 'decree_highland_scouts') &&
    def.unitClass === 'cavalry' &&
    atkTile.terrain === 'plains'
  ) {
    sum += HIGHLAND_SCOUTS_CAVALRY_PLAINS_ATK;
  }

  if (attacker.homeKeepId === 'orphaned') {
    sum += SUPPLY_SEVERED_ATK_PENALTY;
  }

  if (attacker.isMutinied) {
    sum += MUTINY_ATK_PENALTY;
  }

  return clampBonusSum(sum);
}

export function getUnitDefBonusSum(state: GameState, defender: UnitState): number {
  const house = state.houses[defender.houseId];
  const def = UNITS[defender.typeId];
  const defTile = state.tiles[defender.tileKey]!;

  let sum = getTileTerrainOrFortDefBonus(state, defTile, defender.houseId);

  // Locked Shield Wall: +0.20 for spearman & infantry adjacent to another friendly unit
  if (
    house &&
    houseHasDecree(house, 'decree_shield_wall') &&
    (def.unitClass === 'spearman' || def.unitClass === 'infantry')
  ) {
    const hasAdjAlly = getNeighbors(defender.x, defender.y, state.gridSize).some((n) => {
      const other = getUnitAt(state, coordKey(n.x, n.y));
      return other !== null && other.houseId === defender.houseId && other.id !== defender.id;
    });
    if (hasAdjAlly) {
      sum += SHIELD_WALL_DEF_BONUS;
    }
  }

  // Oathsworn Halberdier: +0.40 when on or adjacent to friendly Keep/Palisade/Watchtower
  if (defender.typeId === 'oathsworn_halberdier') {
    const isFortOrKeep = (t: TileState): boolean => {
      if (t.ownerHouseId !== defender.houseId) return false;
      if (t.improvement === 'palisade' || t.improvement === 'watchtower') return true;
      const k = getKeepAt(state, t.key);
      return k !== null && k.ownerHouseId === defender.houseId;
    };
    const nearWallOrKeep =
      isFortOrKeep(defTile) ||
      getNeighbors(defender.x, defender.y, state.gridSize).some((n) =>
        isFortOrKeep(state.tiles[coordKey(n.x, n.y)]!),
      );
    if (nearWallOrKeep) {
      sum += OATHSWORN_WALL_DEF_BONUS;
    }
  }

  // Garrison Seat specialization: +0.10 for friendly units inside its territory
  if (defTile.keepId !== null) {
    const keep = state.keeps[defTile.keepId];
    if (keep && keep.ownerHouseId === defender.houseId && keep.specialization === 'garrison') {
      sum += 0.1;
    }
  }

  if (defender.homeKeepId === 'orphaned') {
    sum += SUPPLY_SEVERED_DEF_PENALTY;
  }

  return clampBonusSum(sum);
}

/**
 * Pure deterministic preview of unit-vs-unit combat (including Spearman Brace & One-Shot Protection).
 */
export function previewUnitCombat(
  state: GameState,
  attackerId: string,
  defenderId: string,
): CombatPreview | null {
  const attacker = state.units[attackerId];
  const defender = state.units[defenderId];
  if (!attacker || !defender || attacker.houseId === defender.houseId) return null;

  const atkDef = UNITS[attacker.typeId];
  const defDef = UNITS[defender.typeId];
  const atkHouse = state.houses[attacker.houseId]!;
  const defHouse = state.houses[defender.houseId]!;

  const dist = chebyshevDist(attacker.x, attacker.y, defender.x, defender.y);
  const atkRange = getUnitAttackRange(state, attacker);
  if (dist > atkRange || !hasLineOfSight(state, attacker.x, attacker.y, defender.x, defender.y)) {
    return null;
  }

  const atkCounter = getCounterMultiplier(
    atkDef.unitClass,
    defDef.unitClass,
    houseHasDecree(atkHouse, 'decree_fletcher_volleys'),
  );
  const defCounter = getCounterMultiplier(
    defDef.unitClass,
    atkDef.unitClass,
    houseHasDecree(defHouse, 'decree_fletcher_volleys'),
  );

  const flanked = isTargetFlanked(state, attacker, defender);
  const atkBonus = getUnitAtkBonusSum(state, attacker, flanked);
  const defBonus = getUnitDefBonusSum(state, defender);

  const effAtk = atkDef.attack * (attacker.hp / attacker.maxHp) * (1 + atkBonus) * atkCounter;
  const effDef = defDef.defense * (defender.hp / defender.maxHp) * (1 + defBonus) * defCounter;

  const rawPrimary = computeCombatDamage(effAtk, effDef);
  const primaryRes = applyOneShotProtection(
    rawPrimary,
    defender.hp,
    defender.maxHp,
    atkDef.range,
    atkCounter,
  );
  const defenderHpAfter = Math.max(0, defender.hp - primaryRes.damage);

  let retaliationDamage = 0;
  let attackerHpAfter = attacker.hp;
  let ospTriggered = primaryRes.triggered;
  let braceTriggered = false;

  // Retaliation: defender survives, melee range (defDef.range === 1 && dist === 1), attacker not siege
  if (
    defenderHpAfter > 0 &&
    defDef.range === 1 &&
    dist === 1 &&
    atkDef.unitClass !== 'siege'
  ) {
    // Spearman "Brace" vs melee Cavalry: uses pre-hit HP ratio
    const isBrace =
      defDef.unitClass === 'spearman' &&
      atkDef.unitClass === 'cavalry' &&
      atkDef.range === 1;
    braceTriggered = isBrace;

    const retHpRatio = isBrace ? defender.hp / defender.maxHp : defenderHpAfter / defender.maxHp;
    const retAtkBonus = getUnitAtkBonusSum(state, defender, false);
    const retDefBonus = getUnitDefBonusSum(state, attacker);

    const retEffAtk = defDef.attack * retHpRatio * (1 + retAtkBonus) * defCounter;
    const retEffDef =
      atkDef.defense * (attacker.hp / attacker.maxHp) * (1 + retDefBonus) * atkCounter;

    const rawRet = computeCombatDamage(retEffAtk, retEffDef);
    const retRes = applyOneShotProtection(
      rawRet,
      attacker.hp,
      attacker.maxHp,
      defDef.range,
      defCounter,
    );
    retaliationDamage = retRes.damage;
    if (retRes.triggered) ospTriggered = true;
    attackerHpAfter = Math.max(0, attacker.hp - retaliationDamage);
  }

  return {
    attackerDamage: primaryRes.damage,
    retaliationDamage,
    attackerHpAfter,
    defenderHpAfter,
    defenderDestroyed: defenderHpAfter <= 0,
    attackerDestroyed: attackerHpAfter <= 0,
    oneShotProtectionTriggered: ospTriggered,
    braceTriggered,
  };
}

function consumeUnitAttack(unit: UnitState): UnitState {
  return {
    ...unit,
    hasAttacked: true,
    remainingMovement: unit.typeId === 'dusk_outrider' ? unit.remainingMovement : 0,
  };
}

/**
 * Executes unit-vs-unit combat, updating HP, removals, Salvage Crews, orphan re-homing, and fog.
 */
export function attackUnit(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.units[attackerId];
  const defender = state.units[defenderId];
  if (!attacker || !defender || attacker.hasAttacked) return state;

  const preview = previewUnitCombat(state, attackerId, defenderId);
  if (!preview) return state;

  const nextUnits: Record<string, UnitState> = { ...state.units };
  const nextHouses = { ...state.houses };

  if (preview.defenderDestroyed) {
    delete nextUnits[defenderId];
    let atkHouse = nextHouses[attacker.houseId]!;
    const salvageMat = houseHasDecree(atkHouse, 'decree_salvage_crews')
      ? SALVAGE_CREWS_MAT_REWARD
      : 0;
    atkHouse = {
      ...atkHouse,
      resources: {
        ...atkHouse.resources,
        materials: atkHouse.resources.materials + salvageMat,
      },
      stats: {
        ...atkHouse.stats,
        unitsDestroyed: atkHouse.stats.unitsDestroyed + 1,
      },
      writProgress: {
        ...atkHouse.writProgress,
        writ_victories: (atkHouse.writProgress.writ_victories ?? 0) + 1,
      },
    };
    nextHouses[attacker.houseId] = atkHouse;
  } else {
    nextUnits[defenderId] = {
      ...defender,
      hp: preview.defenderHpAfter,
      damagedSinceLastTurn: true,
    };
  }

  if (preview.attackerDestroyed) {
    delete nextUnits[attackerId];
    let defHouse = nextHouses[defender.houseId]!;
    const salvageMat = houseHasDecree(defHouse, 'decree_salvage_crews')
      ? SALVAGE_CREWS_MAT_REWARD
      : 0;
    defHouse = {
      ...defHouse,
      resources: {
        ...defHouse.resources,
        materials: defHouse.resources.materials + salvageMat,
      },
      stats: {
        ...defHouse.stats,
        unitsDestroyed: defHouse.stats.unitsDestroyed + 1,
      },
      writProgress: {
        ...defHouse.writProgress,
        writ_victories: (defHouse.writProgress.writ_victories ?? 0) + 1,
      },
    };
    nextHouses[defender.houseId] = defHouse;
  } else {
    const consumed = consumeUnitAttack(attacker);
    nextUnits[attackerId] = {
      ...consumed,
      hp: preview.attackerHpAfter,
      damagedSinceLastTurn:
        preview.retaliationDamage > 0 ? true : consumed.damagedSinceLastTurn,
    };
  }

  let nextState: GameState = {
    ...state,
    units: nextUnits,
    houses: nextHouses,
  };

  nextState = appendChronicle(nextState, {
    type: preview.defenderDestroyed ? 'unit_destroyed' : 'combat',
    actorHouseId: attacker.houseId,
    targetHouseId: defender.houseId,
    tileKey: defender.tileKey,
    summary: `${attacker.typeId} (${attacker.houseId}) struck ${defender.typeId} (${defender.houseId}) for ${preview.attackerDamage} dmg${preview.retaliationDamage > 0 ? ` (took ${preview.retaliationDamage} retaliation)` : ''}.`,
    isPublic: false,
  });

  if (preview.defenderDestroyed) {
    nextState = autoRehomeOrphans(nextState, defender.houseId);
    nextState = recomputeHouseFog(nextState, defender.houseId);
  }
  if (preview.attackerDestroyed) {
    nextState = autoRehomeOrphans(nextState, attacker.houseId);
    nextState = recomputeHouseFog(nextState, attacker.houseId);
  }

  return nextState;
}

/**
 * Executes an attack on an enemy Keep garrison (Ruling 1.1).
 */
export function attackKeep(state: GameState, attackerId: string, keepId: string): GameState {
  const attacker = state.units[attackerId];
  const keep = state.keeps[keepId];
  if (!attacker || !keep || attacker.hasAttacked || keep.ownerHouseId === attacker.houseId) {
    return state;
  }

  const dist = chebyshevDist(attacker.x, attacker.y, keep.x, keep.y);
  const atkRange = getUnitAttackRange(state, attacker);
  if (dist > atkRange || !hasLineOfSight(state, attacker.x, attacker.y, keep.x, keep.y)) {
    return state;
  }

  // Must defeat any enemy unit standing on the Keep tile first
  const garrisonUnit = getUnitAt(state, keep.tileKey);
  if (garrisonUnit && garrisonUnit.houseId !== attacker.houseId) {
    return state;
  }

  const atkDef = UNITS[attacker.typeId];
  const defHouse = state.houses[keep.ownerHouseId]!;
  const hasMasonry = houseHasDecree(defHouse, 'decree_masonry_reinforcement');

  const baseAtk = atkDef.structureAttack ?? atkDef.attack;
  const atkBonus = getUnitAtkBonusSum(state, attacker, false); // No flanking vs Keeps
  const keepDefBonus = hasMasonry ? KEEP_MASONRY_DEF_BONUS : KEEP_DEF_BONUS;

  const effAtk = baseAtk * (attacker.hp / attacker.maxHp) * (1 + atkBonus);
  const effDef = KEEP_GARRISON_DEFENSE * (keep.keepHp / keep.maxKeepHp) * (1 + keepDefBonus);

  let damage = computeCombatDamage(effAtk, effDef);
  if (atkDef.unitClass === 'siege' && hasMasonry) {
    damage = Math.max(1, Math.round(damage * (1 - MASONRY_SIEGE_DAMAGE_REDUCTION)));
  }

  const keepHpAfter = Math.max(0, keep.keepHp - damage);
  let attackerHpAfter = attacker.hp;

  // Keep retaliates against non-siege melee attacks if it survives
  if (keepHpAfter > 0 && dist === 1 && atkDef.unitClass !== 'siege') {
    const retEffAtk = KEEP_GARRISON_ATTACK * (keepHpAfter / keep.maxKeepHp);
    const retDefBonus = getUnitDefBonusSum(state, attacker);
    const retEffDef = atkDef.defense * (attacker.hp / attacker.maxHp) * (1 + retDefBonus);
    const rawRet = computeCombatDamage(retEffAtk, retEffDef);
    const retRes = applyOneShotProtection(rawRet, attacker.hp, attacker.maxHp, 1, 1.0);
    attackerHpAfter = Math.max(0, attacker.hp - retRes.damage);
  }

  const nextUnits: Record<string, UnitState> = { ...state.units };
  if (attackerHpAfter <= 0) {
    delete nextUnits[attackerId];
  } else {
    const consumed = consumeUnitAttack(attacker);
    nextUnits[attackerId] = {
      ...consumed,
      hp: attackerHpAfter,
      damagedSinceLastTurn: attackerHpAfter < attacker.hp ? true : consumed.damagedSinceLastTurn,
    };
  }

  let nextState: GameState = {
    ...state,
    units: nextUnits,
    keeps: {
      ...state.keeps,
      [keepId]: {
        ...keep,
        keepHp: keepHpAfter,
        damagedLastRound: true,
      },
    },
  };

  if (keepHpAfter <= 0) {
    nextState = captureKeep(nextState, keepId, attacker.houseId);
    // Melee advance onto captured Keep tile if attacker survived and tile is unoccupied
    if (
      attackerHpAfter > 0 &&
      atkDef.range === 1 &&
      getUnitAt(nextState, keep.tileKey) === null
    ) {
      const surviving = nextState.units[attackerId];
      if (surviving) {
        nextState = {
          ...nextState,
          units: {
            ...nextState.units,
            [attackerId]: {
              ...surviving,
              tileKey: keep.tileKey,
              x: keep.x,
              y: keep.y,
            },
          },
        };
        nextState = recomputeHouseFog(nextState, attacker.houseId);
      }
    }
  } else if (attackerHpAfter <= 0) {
    nextState = autoRehomeOrphans(nextState, attacker.houseId);
    nextState = recomputeHouseFog(nextState, attacker.houseId);
  }

  return nextState;
}

/**
 * Ruling 1.3: Violent Seizure of an unclaimed Neutral Frontier Village.
 */
export function attackVillage(
  state: GameState,
  attackerId: string,
  tileKey: CoordKey,
): GameState {
  const attacker = state.units[attackerId];
  const tile = state.tiles[tileKey];
  if (
    !attacker ||
    !tile ||
    attacker.hasAttacked ||
    tile.landmark !== 'frontier_village' ||
    tile.villageHp === null ||
    tile.villageHp <= 0
  ) {
    return state;
  }

  const dist = chebyshevDist(attacker.x, attacker.y, tile.x, tile.y);
  const atkRange = getUnitAttackRange(state, attacker);
  if (dist > atkRange || !hasLineOfSight(state, attacker.x, attacker.y, tile.x, tile.y)) {
    return state;
  }

  const atkDef = UNITS[attacker.typeId];
  const baseAtk = atkDef.structureAttack ?? atkDef.attack;
  const atkBonus = getUnitAtkBonusSum(state, attacker, false);
  const villageDefBonus = Math.max(TERRAINS[tile.terrain].defBonus, VILLAGE_DEF_BONUS);

  const effAtk = baseAtk * (attacker.hp / attacker.maxHp) * (1 + atkBonus);
  const effDef = VILLAGE_DEFENSE * (tile.villageHp / VILLAGE_MAX_HP) * (1 + villageDefBonus);
  const damage = computeCombatDamage(effAtk, effDef);
  const villageHpAfter = Math.max(0, tile.villageHp - damage);

  let attackerHpAfter = attacker.hp;
  if (villageHpAfter > 0 && dist === 1 && atkDef.unitClass !== 'siege') {
    const retEffAtk = VILLAGE_ATTACK * (villageHpAfter / VILLAGE_MAX_HP);
    const retDefBonus = getUnitDefBonusSum(state, attacker);
    const retEffDef = atkDef.defense * (attacker.hp / attacker.maxHp) * (1 + retDefBonus);
    const rawRet = computeCombatDamage(retEffAtk, retEffDef);
    const retRes = applyOneShotProtection(rawRet, attacker.hp, attacker.maxHp, 1, 1.0);
    attackerHpAfter = Math.max(0, attacker.hp - retRes.damage);
  }

  const nextUnits: Record<string, UnitState> = { ...state.units };
  if (attackerHpAfter <= 0) {
    delete nextUnits[attackerId];
  } else {
    const consumed = consumeUnitAttack(attacker);
    nextUnits[attackerId] = {
      ...consumed,
      hp: attackerHpAfter,
      damagedSinceLastTurn: attackerHpAfter < attacker.hp ? true : consumed.damagedSinceLastTurn,
    };
  }

  if (villageHpAfter > 0) {
    let nextState: GameState = {
      ...state,
      units: nextUnits,
      tiles: {
        ...state.tiles,
        [tileKey]: {
          ...tile,
          villageHp: villageHpAfter,
          villageDamagedLastRound: true,
        },
      },
    };
    if (attackerHpAfter <= 0) {
      nextState = autoRehomeOrphans(nextState, attacker.houseId);
      nextState = recomputeHouseFog(nextState, attacker.houseId);
    }
    return nextState;
  }

  // Village seized! Convert to damaged Tier-1 Keep at 8/24 HP, -2 Favor
  const house = state.houses[attacker.houseId]!;
  const { name, updatedHouse: namedHouse } = allocateSettlementName(house);
  const penalizedHouse = addFavor(namedHouse, -VILLAGE_SEIZE_FAVOR_PENALTY);
  const finalHouse = {
    ...penalizedHouse,
    writProgress: {
      ...penalizedHouse.writProgress,
      writ_annex: (penalizedHouse.writProgress.writ_annex ?? 0) + 1,
    },
  };

  const keepId = `keep_${state.nextKeepSeq}`;
  const newKeep: KeepState = {
    id: keepId,
    name,
    ownerHouseId: attacker.houseId,
    tileKey,
    x: tile.x,
    y: tile.y,
    tier: 1,
    isCapital: false,
    specialization: 'none',
    keepHp: VILLAGE_SEIZE_KEEP_HP,
    maxKeepHp: KEEP_BASE_MAX_HP,
    damagedLastRound: true,
    foodProgress: 0,
    repeatMilestonesClaimed: 0,
  };

  // Melee advance onto seized village tile if unoccupied
  if (attackerHpAfter > 0 && atkDef.range === 1 && nextUnits[attackerId]) {
    nextUnits[attackerId] = {
      ...nextUnits[attackerId]!,
      tileKey,
      x: tile.x,
      y: tile.y,
    };
  }

  let nextState: GameState = {
    ...state,
    units: nextUnits,
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
      [keepId]: newKeep,
    },
    houses: {
      ...state.houses,
      [attacker.houseId]: finalHouse,
    },
    nextKeepSeq: state.nextKeepSeq + 1,
  };

  nextState = claimKeepTerritory(nextState, keepId);
  nextState = permanentlyRevealRadius(nextState, attacker.houseId, tile.x, tile.y, KEEP_TIER1_RADIUS);
  nextState = autoRehomeOrphans(nextState, attacker.houseId);
  nextState = recomputeHouseFog(nextState, attacker.houseId);
  nextState = appendChronicle(nextState, {
    type: 'village_seized',
    actorHouseId: attacker.houseId,
    targetHouseId: null,
    tileKey,
    summary: `House ${attacker.houseId} violently seized ${name} (8/24 HP, -2 Favor).`,
    isPublic: true,
  });

  return nextState;
}

/**
 * Ruling 6.3: Attacking an Outlaw Camp's Bandit garrison.
 */
export function attackOutlawCamp(
  state: GameState,
  attackerId: string,
  tileKey: CoordKey,
): GameState {
  const attacker = state.units[attackerId];
  const tile = state.tiles[tileKey];
  if (
    !attacker ||
    !tile ||
    attacker.hasAttacked ||
    tile.landmark !== 'outlaw_camp' ||
    tile.banditHp === null ||
    tile.banditHp <= 0
  ) {
    return state;
  }

  const dist = chebyshevDist(attacker.x, attacker.y, tile.x, tile.y);
  const atkRange = getUnitAttackRange(state, attacker);
  if (dist > atkRange || !hasLineOfSight(state, attacker.x, attacker.y, tile.x, tile.y)) {
    return state;
  }

  const atkDef = UNITS[attacker.typeId];
  const atkHouse = state.houses[attacker.houseId]!;
  const atkCounter = getCounterMultiplier(
    atkDef.unitClass,
    BANDIT_CLASS,
    houseHasDecree(atkHouse, 'decree_fletcher_volleys'),
  );
  const defCounter = getCounterMultiplier(BANDIT_CLASS, atkDef.unitClass, false);

  const atkBonus = getUnitAtkBonusSum(state, attacker, false);
  const banditDefBonus = TERRAINS[tile.terrain].defBonus;

  const effAtk = atkDef.attack * (attacker.hp / attacker.maxHp) * (1 + atkBonus) * atkCounter;
  const effDef =
    BANDIT_DEFENSE * (tile.banditHp / BANDIT_MAX_HP) * (1 + banditDefBonus) * defCounter;
  const damage = computeCombatDamage(effAtk, effDef);
  const banditHpAfter = Math.max(0, tile.banditHp - damage);

  let attackerHpAfter = attacker.hp;
  if (banditHpAfter > 0 && dist === 1 && atkDef.unitClass !== 'siege') {
    const retEffAtk = BANDIT_ATTACK * (banditHpAfter / BANDIT_MAX_HP) * defCounter;
    const retDefBonus = getUnitDefBonusSum(state, attacker);
    const retEffDef =
      atkDef.defense * (attacker.hp / attacker.maxHp) * (1 + retDefBonus) * atkCounter;
    const rawRet = computeCombatDamage(retEffAtk, retEffDef);
    const retRes = applyOneShotProtection(rawRet, attacker.hp, attacker.maxHp, 1, defCounter);
    attackerHpAfter = Math.max(0, attacker.hp - retRes.damage);
  }

  const nextUnits: Record<string, UnitState> = { ...state.units };
  if (attackerHpAfter <= 0) {
    delete nextUnits[attackerId];
  } else {
    const consumed = consumeUnitAttack(attacker);
    nextUnits[attackerId] = {
      ...consumed,
      hp: attackerHpAfter,
      damagedSinceLastTurn: attackerHpAfter < attacker.hp ? true : consumed.damagedSinceLastTurn,
    };
  }

  if (banditHpAfter > 0) {
    let nextState: GameState = {
      ...state,
      units: nextUnits,
      tiles: {
        ...state.tiles,
        [tileKey]: { ...tile, banditHp: banditHpAfter },
      },
    };
    if (attackerHpAfter <= 0) {
      nextState = autoRehomeOrphans(nextState, attacker.houseId);
      nextState = recomputeHouseFog(nextState, attacker.houseId);
    }
    return nextState;
  }

  // Camp cleared! Bounty +12 Coin (+24 Corvus), Salvage +4 Mat, melee advance
  const bountyMult = attacker.houseId === 'corvus' ? CORVUS_PLUNDER_MULTIPLIER : 1;
  const coinReward = OUTLAW_CAMP_BOUNTY_COIN * bountyMult;
  const salvageMat = houseHasDecree(atkHouse, 'decree_salvage_crews')
    ? SALVAGE_CREWS_MAT_REWARD
    : 0;

  let updatedHouse = addLifetimeCoin(atkHouse, coinReward);
  updatedHouse = {
    ...updatedHouse,
    resources: {
      ...updatedHouse.resources,
      materials: updatedHouse.resources.materials + salvageMat,
    },
    stats: {
      ...updatedHouse.stats,
      campsCleared: updatedHouse.stats.campsCleared + 1,
    },
    writProgress: {
      ...updatedHouse.writProgress,
      writ_clear_camp: (updatedHouse.writProgress.writ_clear_camp ?? 0) + 1,
    },
  };

  if (attackerHpAfter > 0 && atkDef.range === 1 && nextUnits[attackerId]) {
    nextUnits[attackerId] = {
      ...nextUnits[attackerId]!,
      tileKey,
      x: tile.x,
      y: tile.y,
    };
  }

  let nextState: GameState = {
    ...state,
    units: nextUnits,
    tiles: {
      ...state.tiles,
      [tileKey]: {
        ...tile,
        landmarkCleared: true,
        banditHp: null,
      },
    },
    houses: {
      ...state.houses,
      [attacker.houseId]: updatedHouse,
    },
  };

  nextState = recomputeHouseFog(nextState, attacker.houseId);
  nextState = appendChronicle(nextState, {
    type: 'camp_cleared',
    actorHouseId: attacker.houseId,
    targetHouseId: null,
    tileKey,
    summary: `House ${attacker.houseId} cleared an Outlaw Camp (+${coinReward} Coin).`,
    isPublic: false,
  });

  return nextState;
}

/**
 * Ruling 3.1: Raze an unmanned enemy Palisade or Watchtower (12 HP, 4 Def, 0.00 DefBonus).
 */
export function razeFortification(
  state: GameState,
  attackerId: string,
  tileKey: CoordKey,
): GameState {
  const attacker = state.units[attackerId];
  const tile = state.tiles[tileKey];
  if (
    !attacker ||
    !tile ||
    attacker.hasAttacked ||
    tile.ownerHouseId === null ||
    tile.ownerHouseId === attacker.houseId ||
    (tile.improvement !== 'palisade' && tile.improvement !== 'watchtower') ||
    tile.fortificationHp === null ||
    tile.fortificationHp <= 0
  ) {
    return state;
  }

  // Must be unmanned
  if (getUnitAt(state, tileKey) !== null) return state;

  const dist = chebyshevDist(attacker.x, attacker.y, tile.x, tile.y);
  const atkRange = getUnitAttackRange(state, attacker);
  if (dist > atkRange || !hasLineOfSight(state, attacker.x, attacker.y, tile.x, tile.y)) {
    return state;
  }

  const atkDef = UNITS[attacker.typeId];
  const defHouse = state.houses[tile.ownerHouseId]!;
  const hasMasonry = houseHasDecree(defHouse, 'decree_masonry_reinforcement');

  const baseAtk = atkDef.structureAttack ?? atkDef.attack;
  const atkBonus = getUnitAtkBonusSum(state, attacker, false);
  const effAtk = baseAtk * (attacker.hp / attacker.maxHp) * (1 + atkBonus);
  const effDef = FORTIFICATION_DEFENSE; // 4 Defense, 0.00 DefBonus (unmanned structure)

  let damage = computeCombatDamage(effAtk, effDef);
  if (atkDef.unitClass === 'siege' && hasMasonry) {
    damage = Math.max(1, Math.round(damage * (1 - MASONRY_SIEGE_DAMAGE_REDUCTION)));
  }

  const fortHpAfter = Math.max(0, tile.fortificationHp - damage);
  const razed = fortHpAfter <= 0;

  let nextHouses = state.houses;
  if (razed) {
    const atkHouse = state.houses[attacker.houseId]!;
    nextHouses = {
      ...state.houses,
      [attacker.houseId]: {
        ...atkHouse,
        writProgress: {
          ...atkHouse.writProgress,
          writ_raze: (atkHouse.writProgress.writ_raze ?? 0) + 1,
        },
      },
    };
  }

  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [attackerId]: consumeUnitAttack(attacker),
    },
    tiles: {
      ...state.tiles,
      [tileKey]: razed
        ? { ...tile, improvement: null, fortificationHp: null }
        : { ...tile, fortificationHp: fortHpAfter },
    },
    houses: nextHouses,
  };

  if (razed) {
    nextState = recomputeHouseFog(nextState, tile.ownerHouseId);
    nextState = appendChronicle(nextState, {
      type: 'raze',
      actorHouseId: attacker.houseId,
      targetHouseId: tile.ownerHouseId,
      tileKey,
      summary: `House ${attacker.houseId} razed an enemy ${tile.improvement}.`,
      isPublic: false,
    });
  }

  return nextState;
}

/**
 * Ruling 6.2: Pillage an enemy economic improvement on the unit's current tile.
 */
export function canPillageTile(state: GameState, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit || unit.hasAttacked) return false;
  const tile = state.tiles[unit.tileKey];
  if (!tile || tile.ownerHouseId === null || tile.ownerHouseId === unit.houseId) return false;
  if (tile.improvement === null) return false;
  return IMPROVEMENTS[tile.improvement].isEconomic;
}

export function pillageTile(state: GameState, unitId: string): GameState {
  if (!canPillageTile(state, unitId)) return state;
  const unit = state.units[unitId]!;
  const tile = state.tiles[unit.tileKey]!;
  const impDef = IMPROVEMENTS[tile.improvement!]!;
  const ownerHouseId = tile.ownerHouseId!;

  const mult = unit.houseId === 'corvus' ? CORVUS_PLUNDER_MULTIPLIER : 1;
  const matGain = Math.floor(impDef.matCost * PILLAGE_MAT_RATIO) * mult;
  const coinGain = PILLAGE_BASE_COIN * mult;

  let house = addLifetimeCoin(state.houses[unit.houseId]!, coinGain);
  house = {
    ...house,
    resources: {
      ...house.resources,
      materials: house.resources.materials + matGain,
    },
  };

  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unitId]: consumeUnitAttack(unit),
    },
    tiles: {
      ...state.tiles,
      [tile.key]: {
        ...tile,
        improvement: null,
      },
    },
    houses: {
      ...state.houses,
      [unit.houseId]: house,
    },
  };

  if (tile.improvement === 'signal_bastion') {
    nextState = recomputeHouseFog(nextState, ownerHouseId);
  }

  nextState = appendChronicle(nextState, {
    type: 'pillage',
    actorHouseId: unit.houseId,
    targetHouseId: ownerHouseId,
    tileKey: tile.key,
    summary: `House ${unit.houseId} pillaged ${impDef.name} (+${matGain} Mat, +${coinGain} Coin).`,
    isPublic: false,
  });

  return nextState;
}
