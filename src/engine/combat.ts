/**
 * Marchlands (Spec v2.0) — Deterministic Combat, Class Tactical Actions,
 * Fortification Warfare, Lord-Commander Skills & Siege Engine
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
  BEACON_MARK_ATK_BONUS,
  BODKIN_COUNTER_MULT,
  BONUS_SUM_MAX,
  BONUS_SUM_MIN,
  CAVALRY_CHARGE_ATK_BONUS,
  CAVALRY_CHARGE_MIN_OPEN_TILES,
  CAVALRY_CHARGE_MOBILE_VANGUARD_BONUS,
  COMBAT_DAMAGE_SCALE,
  COMMANDER_AURA_ATK_BONUS,
  COMMANDER_AURA_DEF_BONUS,
  COMMANDER_LEVEL2_XP,
  COMMANDER_LEVEL3_XP,
  COMMANDER_RANSOM_COIN,
  COMMANDER_RANSOM_FAVOR,
  COMMANDER_SKILL_COOLDOWN,
  COMMANDER_WOUNDED_TURNS,
  CORVUS_PLUNDER_MULTIPLIER,
  COUNTER_ADVANTAGE_MULT,
  COUNTER_MATCHUPS,
  CROSSBOW_ARMOR_PIERCE_DEF_THRESHOLD,
  FLANKING_ATK_BONUS,
  FORTIFICATION_DEFENSE,
  FORTIFY_DEF_BONUS,
  GOLDEN_BANNER_COIN_COST,
  GOLDEN_BANNER_HEAL,
  HIGH_SEAT_ATTACK,
  HIGH_SEAT_CAPTURE_HP,
  HIGH_SEAT_DEF_BONUS,
  HIGH_SEAT_DEFENSE,
  HIGH_SEAT_MAX_HP,
  HILLS_DOWNHILL_ATK_BONUS,
  HOLD_THE_LINE_DEF_BONUS,
  HOLD_THE_LINE_HEAL,
  HOUSES,
  IMPROVEMENTS,
  KEEP_ARROW_SLITS_RANGE,
  KEEP_DEF_BONUS,
  KEEP_GARRISON_DEFENSE,
  KEEP_TIER1_ATTACK,
  KEEP_TIER1_MAX_HP,
  KEEP_TIER1_RADIUS,
  KEEP_TIER2_ATTACK,
  KEEP_TIER2_MAX_HP,
  KEEP_TIER2_RADIUS,
  KEEP_TIER3_ATTACK,
  LONGBOWMAN_TERRAIN_ATK_BONUS,
  MAX_COVER_DEF_BONUS,
  MAX_COVER_STONE_CURTAIN_BONUS,
  MUTINY_ATK_PENALTY,
  NON_SIEGE_STRUCTURE_DAMAGE_MULT,
  OATHSWORN_WALL_DEF_BONUS,
  OUTLAW_CAMP_BOUNTY_COIN,
  OUTLAW_CAMP_BOUNTY_IRON,
  OUTPOST_DEF_BONUS,
  OUTPOST_DEFENSE,
  OUTPOST_MAX_HP,
  OVERWATCH_BODKIN_DAMAGE_MULT,
  OVERWATCH_DAMAGE_MULT,
  PALISADE_LV1_STACK_DEF,
  PALISADE_LV2_STACK_DEF,
  PHALANX_FORTIFY_DEF_BONUS,
  PILLAGE_BASE_COIN,
  PILLAGE_MAT_RATIO,
  QUARRY_ADJ_FORT_DEF_BONUS,
  RAIDERS_HORN_PILLAGE_HEAL,
  RIVER_ATTACK_PENALTY,
  SALVAGE_CREWS_CAMP_IRON,
  SALVAGE_CREWS_IRON_REWARD,
  SALVAGE_CREWS_MAT_REWARD,
  SIGNAL_BASTION_LV1_ATK_BONUS,
  SIGNAL_BASTION_LV2_ATK_BONUS,
  STANDING_CORPS_ATK_BONUS,
  STANDING_CORPS_DEF_BONUS,
  SUPPLY_SEVERED_ATK_PENALTY,
  SUPPLY_SEVERED_DEF_PENALTY,
  TERRAINS,
  TREBUCHET_GRAND_BOMBARDMENT_SPLASH,
  UNITS,
  VETERANCY_HP_PER_RANK,
  VETERANCY_RANK1_XP,
  VETERANCY_RANK2_XP,
  VILLAGE_ATTACK,
  VILLAGE_DEF_BONUS,
  VILLAGE_DEFENSE,
  VILLAGE_MAX_HP,
  VILLAGE_SEIZE_FAVOR_PENALTY,
  VILLAGE_SEIZE_KEEP_HP,
  WALL_MELEE_SPIKE_DAMAGE,
  WALL_RANGED_DAMAGE_MULT,
  WARDENS_VOLLEY_ATK_BONUS,
  WATCHTOWER_LV1_STACK_DEF,
  WATCHTOWER_LV2_STACK_DEF,
  WATCHTOWER_RANGED_ATK_BONUS,
  XP_COMBAT_KILL,
  XP_COMBAT_SURVIVE,
  XP_STRUCTURE_CAPTURE,
} from '../data/index.ts';
import { chebyshevDist, coordKey, getNeighbors, inBounds } from './coords.ts';
import {
  autoRehomeOrphans,
  captureKeep,
  captureOrDestroyOutpost,
  claimKeepTerritory,
} from './capture.ts';
import { permanentlyRevealRadius, recomputeHouseFog } from './fog.ts';
import {
  addFavor,
  addLifetimeCoin,
  allocateSettlementName,
  appendChronicle,
  getCommanderUnit,
  getKeepAt,
  getOutpostAt,
  getSeason,
  getUnitAt,
  hasCommanderTrait,
  houseHasDecree,
  isAdjacentToFriendlyCommander,
  unitHasHonor,
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
  readonly chargeTriggered: boolean;
  readonly shieldPushTriggered: boolean;
  readonly isFlanked: boolean;
  readonly defenderFortified: boolean;
  readonly defenderCoverPct: number;
  readonly attackerRank: 0 | 1 | 2;
  readonly defenderRank: 0 | 1 | 2;
}

export function getUnitRank(xp: number): 0 | 1 | 2 {
  if (xp >= VETERANCY_RANK2_XP) return 2;
  if (xp >= VETERANCY_RANK1_XP) return 1;
  return 0;
}

function applyUnitXp(
  unit: UnitState,
  xpGain: number,
  house: GameState['houses'][string] | undefined,
): {
  readonly unit: UnitState;
  readonly promotedTo: 1 | 2 | null;
} {
  if (unit.isCommander) {
    return { unit, promotedTo: null };
  }
  const scaledXp = houseHasDecree(house, 'decree_standing_corps')
    ? Math.ceil(xpGain * 1.5)
    : xpGain;
  const prevRank = getUnitRank(unit.xp);
  const nextXp = unit.xp + scaledXp;
  const nextRank = getUnitRank(nextXp);
  const rankDelta = nextRank - prevRank;
  if (rankDelta > 0) {
    const hpBoost = rankDelta * VETERANCY_HP_PER_RANK;
    return {
      unit: {
        ...unit,
        xp: nextXp,
        maxHp: unit.maxHp + hpBoost,
        hp: Math.min(unit.maxHp + hpBoost, unit.hp + hpBoost),
      },
      promotedTo: nextRank as 1 | 2,
    };
  }
  return { unit: { ...unit, xp: nextXp }, promotedTo: null };
}

function grantCommanderXp(state: GameState, houseId: HouseId, xpGain: number): GameState {
  const cmd = state.commanders[houseId];
  const house = state.houses[houseId];
  if (!cmd || !house || cmd.unitId === null) return state;

  const nextXp = cmd.xp + xpGain;
  let nextLevel = cmd.level;
  let pendingTrait = house.pendingCommanderTrait;
  if (nextLevel === 1 && nextXp >= COMMANDER_LEVEL2_XP) {
    nextLevel = 2;
    pendingTrait = true;
  } else if (nextLevel === 2 && nextXp >= COMMANDER_LEVEL3_XP) {
    nextLevel = 3;
    pendingTrait = true;
  }

  let nextUnits = state.units;
  if (nextLevel > cmd.level && state.units[cmd.unitId]) {
    const cu = state.units[cmd.unitId]!;
    const hpBoost = (nextLevel - cmd.level) * 3;
    nextUnits = {
      ...state.units,
      [cmd.unitId]: {
        ...cu,
        maxHp: cu.maxHp + hpBoost,
        hp: Math.min(cu.maxHp + hpBoost, cu.hp + hpBoost),
      },
    };
  }

  return {
    ...state,
    units: nextUnits,
    commanders: {
      ...state.commanders,
      [houseId]: {
        ...cmd,
        xp: nextXp,
        level: nextLevel,
      },
    },
    houses: {
      ...state.houses,
      [houseId]: {
        ...house,
        pendingCommanderTrait: pendingTrait,
      },
    },
  };
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
  if (attackerClass === 'ranged' && defenderClass === 'infantry' && attackerHasBodkin) {
    return BODKIN_COUNTER_MULT;
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
 * Ranged units gain +1 range on Hills OR friendly Watchtower; Vane Warden's Volley grants +1 range.
 */
export function getUnitAttackRange(state: GameState, unit: UnitState): number {
  const def = UNITS[unit.typeId];
  const tile = state.tiles[unit.tileKey];
  let range = def.range;
  if (def.unitClass === 'ranged') {
    if (
      tile?.terrain === 'hills' ||
      (tile?.ownerHouseId === unit.houseId && tile.improvement === 'watchtower')
    ) {
      range += 1;
    }
    if (unit.overwatchRangeBonusUntilTurn >= state.turnNumber) {
      range += 1;
    }
  }
  return range;
}

/**
 * Mountain tiles block ranged LOS unless attacker is on Hills or a friendly Watchtower.
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
  if (originTile?.terrain === 'hills' || originTile?.improvement === 'watchtower') {
    return true;
  }

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
 * Spec v2.0 Additive Fortification Cover:
 * Palisade (+0.20/+0.30) and Watchtower (+0.20/+0.30) stack ON TOP of terrain cover,
 * capped at 0.60 (0.70 with Stone Curtain). Stone Quarry adjacency adds +0.10 to Forts/Keeps.
 */
export function getTileTerrainOrFortDefBonus(
  state: GameState,
  tile: TileState,
  defenderHouseId: HouseId,
): number {
  const house = state.houses[defenderHouseId];
  const hasStoneCurtain = houseHasDecree(house, 'decree_stone_curtain');
  const cap = hasStoneCurtain ? MAX_COVER_STONE_CURTAIN_BONUS : MAX_COVER_DEF_BONUS;

  let cover = TERRAINS[tile.terrain].defBonus;

  if (tile.landmark === 'ancient_watchtower') {
    cover = Math.max(cover, ANCIENT_WATCHTOWER_DEF_BONUS);
  }

  const isFriendlyWall = tile.ownerHouseId === defenderHouseId && tile.improvement === 'palisade';
  const isFriendlyTower = tile.ownerHouseId === defenderHouseId && tile.improvement === 'watchtower';
  const keep = getKeepAt(state, tile.key);
  const isFriendlyKeep = keep !== null && keep.ownerHouseId === defenderHouseId;
  const outpost = getOutpostAt(state, tile.key);
  const isFriendlyOutpost = outpost !== null && outpost.ownerHouseId === defenderHouseId;

  if (isFriendlyWall) {
    cover += tile.improvementLevel === 2 ? PALISADE_LV2_STACK_DEF : PALISADE_LV1_STACK_DEF;
  } else if (isFriendlyTower) {
    cover += tile.improvementLevel === 2 ? WATCHTOWER_LV2_STACK_DEF : WATCHTOWER_LV1_STACK_DEF;
  } else if (isFriendlyKeep) {
    cover = Math.max(cover, KEEP_DEF_BONUS);
  } else if (isFriendlyOutpost) {
    cover = Math.max(cover, OUTPOST_DEF_BONUS);
  }

  // Adjacent friendly Stone Quarry / Mason Works boosts Forts & Keeps by +10%
  if (isFriendlyWall || isFriendlyTower || isFriendlyKeep) {
    const nearQuarry = getNeighbors(tile.x, tile.y, state.gridSize).some((n) => {
      const nt = state.tiles[coordKey(n.x, n.y)];
      return nt?.ownerHouseId === defenderHouseId && nt.improvement === 'stone_quarry';
    });
    if (nearQuarry) {
      cover += QUARRY_ADJ_FORT_DEF_BONUS;
    }
  }

  return Math.min(cap, cover);
}

function isTargetBeaconMarked(state: GameState, defender: UnitState): boolean {
  for (const cmd of Object.values(state.commanders)) {
    if (
      cmd.markedTargetUnitId === defender.id &&
      cmd.skillActiveUntilTurn >= state.turnNumber &&
      cmd.houseId !== defender.houseId
    ) {
      return true;
    }
  }
  return false;
}

export function isTargetFlanked(
  state: GameState,
  attacker: UnitState,
  defender: UnitState,
): boolean {
  if (defender.typeId === 'vanguard_spearman') return false;
  // Fortified Phalanx Spearmen and defenders on friendly Walls are immune to flanking
  if (UNITS[defender.typeId].unitClass === 'spearman' && defender.isFortified) return false;
  const defTile = state.tiles[defender.tileKey];
  if (defTile?.ownerHouseId === defender.houseId && defTile.improvement === 'palisade') {
    return false;
  }
  for (const n of getNeighbors(defender.x, defender.y, state.gridSize)) {
    const other = getUnitAt(state, coordKey(n.x, n.y));
    if (other && other.houseId === attacker.houseId && other.id !== attacker.id) {
      return true;
    }
  }
  return false;
}

function isCavalryCharging(attacker: UnitState): boolean {
  return (
    UNITS[attacker.typeId].unitClass === 'cavalry' &&
    attacker.movedOpenTilesThisTurn >= CAVALRY_CHARGE_MIN_OPEN_TILES
  );
}

export function getUnitAtkBonusSum(
  state: GameState,
  attacker: UnitState,
  isFlanked: boolean,
  defenderTile?: TileState,
  defenderHouseId?: HouseId,
  isPrimaryAttack = true,
  isStructureTarget = false,
): number {
  const house = state.houses[attacker.houseId];
  const def = UNITS[attacker.typeId];
  const atkTile = state.tiles[attacker.tileKey]!;
  let sum = 0;

  // Hills downhill (+15%) & unbridged River attack (-25%)
  if (defenderTile) {
    if (atkTile.terrain === 'hills' && defenderTile.terrain !== 'hills') {
      sum += HILLS_DOWNHILL_ATK_BONUS;
    }
    if (
      atkTile.terrain === 'river' &&
      !(
        atkTile.ownerHouseId === attacker.houseId &&
        (atkTile.improvement === 'stone_bridge' || atkTile.improvement === 'river_tollhouse')
      )
    ) {
      sum += RIVER_ATTACK_PENALTY;
    }
  }

  // Watchtower ranged attack bonus (+15%)
  if (
    def.unitClass === 'ranged' &&
    atkTile.ownerHouseId === attacker.houseId &&
    atkTile.improvement === 'watchtower'
  ) {
    sum += WATCHTOWER_RANGED_ATK_BONUS;
  }

  // Longbowman terrain bonus
  if (
    attacker.typeId === 'longbowman' &&
    (atkTile.terrain === 'forest' || atkTile.terrain === 'hills')
  ) {
    sum += LONGBOWMAN_TERRAIN_ATK_BONUS;
  }

  // Adjacent friendly Signal Bastion (+15% Lv1, +20% Lv2)
  let bastionBonus = 0;
  for (const n of getNeighbors(attacker.x, attacker.y, state.gridSize)) {
    const nt = state.tiles[coordKey(n.x, n.y)];
    if (nt?.ownerHouseId === attacker.houseId && nt.improvement === 'signal_bastion') {
      bastionBonus = Math.max(
        bastionBonus,
        nt.improvementLevel === 2 ? SIGNAL_BASTION_LV2_ATK_BONUS : SIGNAL_BASTION_LV1_ATK_BONUS,
      );
    }
  }
  sum += bastionBonus;

  // Flanking
  if (isFlanked) {
    sum += FLANKING_ATK_BONUS;
  }

  // Cavalry Lance Charge
  if (isPrimaryAttack && isCavalryCharging(attacker)) {
    sum += CAVALRY_CHARGE_ATK_BONUS;
    if (houseHasDecree(house, 'decree_mobile_vanguard')) {
      sum += CAVALRY_CHARGE_MOBILE_VANGUARD_BONUS;
    }
    if (unitHasHonor(attacker, 'honor_shock_lancer')) {
      sum += 0.15;
    }
  }

  // Lord-Commander passive aura (+10%, +10% extra with Vanguard trait on primary offense)
  if (isAdjacentToFriendlyCommander(state, attacker)) {
    sum += COMMANDER_AURA_ATK_BONUS;
    if (isPrimaryAttack && hasCommanderTrait(state, attacker.houseId, 'trait_vanguard')) {
      sum += 0.10;
    }
  }

  // House Vane Warden's Volley active buff (+15% from Forest/Hills)
  const cmd = state.commanders[attacker.houseId];
  const cmdUnit = getCommanderUnit(state, attacker.houseId);
  if (
    attacker.houseId === 'vane' &&
    cmd &&
    cmd.skillActiveUntilTurn >= state.turnNumber &&
    cmdUnit &&
    chebyshevDist(attacker.x, attacker.y, cmdUnit.x, cmdUnit.y) <= 2 &&
    (atkTile.terrain === 'forest' || atkTile.terrain === 'hills')
  ) {
    sum += WARDENS_VOLLEY_ATK_BONUS;
  }

  // Doctrine: Standing Corps (+15% for Rank 1+)
  if (houseHasDecree(house, 'decree_standing_corps') && getUnitRank(attacker.xp) >= 1) {
    sum += STANDING_CORPS_ATK_BONUS;
  }

  // Doctrine: Hardened Marchers (+15% during Winter)
  if (houseHasDecree(house, 'decree_hardened_marchers') && getSeason(state.turnNumber) === 'winter') {
    sum += 0.15;
  }

  // Doctrine: Iron Sovereign (+10% vs Houses with strictly higher Favor)
  if (defenderHouseId && houseHasDecree(house, 'decree_iron_sovereign')) {
    const defHouse = state.houses[defenderHouseId];
    if (defHouse && house && defHouse.favor > house.favor) {
      sum += 0.10;
    }
  }

  // Battle Honors
  if (unitHasHonor(attacker, 'honor_shock_blade')) sum += 0.15;
  if (unitHasHonor(attacker, 'honor_phalanx_master')) sum += 0.15;
  if (unitHasHonor(attacker, 'honor_marksman')) sum += 0.15;
  if (unitHasHonor(attacker, 'honor_rapid_crew')) sum += 0.15;
  if (isStructureTarget && unitHasHonor(attacker, 'honor_wallbreaker')) sum += 0.25;

  // Penalties
  if (attacker.homeKeepId === 'orphaned') {
    sum += SUPPLY_SEVERED_ATK_PENALTY;
  }
  if (attacker.isMutinied) {
    sum += MUTINY_ATK_PENALTY;
  }

  return clampBonusSum(sum);
}

export function getUnitDefBonusSum(
  state: GameState,
  defender: UnitState,
  attackerHouseId?: HouseId,
  ignoreCover = false,
): number {
  const house = state.houses[defender.houseId];
  const def = UNITS[defender.typeId];
  const defTile = state.tiles[defender.tileKey]!;

  let sum = ignoreCover ? 0 : getTileTerrainOrFortDefBonus(state, defTile, defender.houseId);

  // Oathsworn Halberdier: +40% when on or adjacent to friendly Keep/Wall/Watchtower/Outpost
  if (defender.typeId === 'oathsworn_halberdier') {
    const isFortOrKeep = (t: TileState): boolean => {
      if (t.ownerHouseId !== defender.houseId) return false;
      if (t.improvement === 'palisade' || t.improvement === 'watchtower') return true;
      const k = getKeepAt(state, t.key);
      if (k && k.ownerHouseId === defender.houseId) return true;
      const o = getOutpostAt(state, t.key);
      return o !== null && o.ownerHouseId === defender.houseId;
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

  // House Vane Warden's Enclave (Lv2 Forester's Lodge): +10% Def adjacent
  if (defender.houseId === 'vane') {
    const nearEnclave = getNeighbors(defender.x, defender.y, state.gridSize).some((n) => {
      const nt = state.tiles[coordKey(n.x, n.y)];
      return (
        nt?.ownerHouseId === 'vane' &&
        nt.improvement === 'foresters_lodge' &&
        nt.improvementLevel === 2
      );
    });
    if (nearEnclave) sum += 0.10;
  }

  // Garrison Seat specialization: +10% inside territory
  if (defTile.keepId !== null) {
    const keep = state.keeps[defTile.keepId];
    if (keep && keep.ownerHouseId === defender.houseId && keep.specialization === 'garrison') {
      sum += 0.10;
    }
  }

  // Lord-Commander aura (+10% Def, +15% extra with Castellan trait near Keep/Wall/Outpost)
  if (isAdjacentToFriendlyCommander(state, defender)) {
    sum += COMMANDER_AURA_DEF_BONUS;
    if (hasCommanderTrait(state, defender.houseId, 'trait_castellan')) {
      const nearStrongpoint =
        defTile.improvement === 'palisade' ||
        getKeepAt(state, defTile.key)?.ownerHouseId === defender.houseId ||
        getOutpostAt(state, defTile.key)?.ownerHouseId === defender.houseId ||
        getNeighbors(defender.x, defender.y, state.gridSize).some((n) => {
          const nt = state.tiles[coordKey(n.x, n.y)];
          return (
            nt?.ownerHouseId === defender.houseId &&
            (nt.improvement === 'palisade' ||
              getKeepAt(state, nt.key) !== null ||
              getOutpostAt(state, nt.key) !== null)
          );
        });
      if (nearStrongpoint) sum += 0.15;
    }
  }

  // Ironhelm Hold the Line active buff
  if (defender.commanderBuffUntilTurn >= state.turnNumber && defender.houseId === 'ironhelm') {
    sum += HOLD_THE_LINE_DEF_BONUS;
  }

  // Fortify / Phalanx Brace
  if (defender.isFortified) {
    sum += def.unitClass === 'spearman' ? PHALANX_FORTIFY_DEF_BONUS : FORTIFY_DEF_BONUS;
  }

  // Doctrines
  if (houseHasDecree(house, 'decree_standing_corps') && getUnitRank(defender.xp) >= 1) {
    sum += STANDING_CORPS_DEF_BONUS;
  }
  if (attackerHouseId && houseHasDecree(house, 'decree_iron_sovereign')) {
    const atkHouse = state.houses[attackerHouseId];
    if (atkHouse && house && atkHouse.favor > house.favor) {
      sum += 0.10;
    }
  }

  // Battle Honors
  if (unitHasHonor(defender, 'honor_stalwart')) sum += 0.15;
  if (unitHasHonor(defender, 'honor_pike_wall')) sum += 0.15;
  if (unitHasHonor(defender, 'honor_high_watch')) sum += 0.15;
  if (unitHasHonor(defender, 'honor_barded_steed')) sum += 0.20;
  if (unitHasHonor(defender, 'honor_heavy_mantlet')) sum += 0.25;

  if (defender.homeKeepId === 'orphaned') {
    sum += SUPPLY_SEVERED_DEF_PENALTY;
  }

  return clampBonusSum(sum);
}

/**
 * Checks whether a defender can be pushed onto `(px, py)` by Infantry Shield Push.
 */
function canPushDefenderTo(state: GameState, defender: UnitState, px: number, py: number): boolean {
  if (!inBounds(px, py, state.gridSize)) return false;
  const k = coordKey(px, py);
  const tile = state.tiles[k];
  if (!tile || tile.terrain === 'mountain') return false;
  const def = UNITS[defender.typeId];
  if (tile.terrain === 'forest' && def.unitClass === 'cavalry' && defender.typeId !== 'dusk_outrider') {
    return false;
  }
  if (getUnitAt(state, k) !== null) return false;
  const keep = getKeepAt(state, k);
  if (keep && keep.ownerHouseId !== defender.houseId && keep.keepHp > 0) return false;
  const outpost = getOutpostAt(state, k);
  if (outpost && outpost.ownerHouseId !== defender.houseId && outpost.hp > 0) return false;
  if (tile.landmark === 'frontier_village' && tile.villageHp !== null && tile.villageHp > 0) return false;
  if (tile.landmark === 'outlaw_camp' && tile.banditHp !== null && tile.banditHp > 0) return false;
  if (tile.landmark === 'high_seat' && tile.highSeatHp !== null && tile.highSeatHp > 0) return false;
  if (tile.improvement === 'palisade' && tile.ownerHouseId !== defender.houseId) return false;
  return true;
}

function getShieldPushDest(
  state: GameState,
  attacker: UnitState,
  defender: UnitState,
): CoordKey | null {
  if (UNITS[attacker.typeId].unitClass !== 'infantry') return null;
  if (defender.isCommander) return null;
  if (unitHasHonor(defender, 'honor_iron_guard')) return null;
  if (UNITS[defender.typeId].unitClass === 'spearman' && defender.isFortified) return null;
  if (getKeepAt(state, defender.tileKey) !== null) return null;

  const dx = Math.sign(defender.x - attacker.x);
  const dy = Math.sign(defender.y - attacker.y);
  if (dx === 0 && dy === 0) return null;
  const px = defender.x + dx;
  const py = defender.y + dy;
  return canPushDefenderTo(state, defender, px, py) ? coordKey(px, py) : null;
}

export function previewUnitCombat(
  state: GameState,
  attackerId: string,
  defenderId: string,
): CombatPreview | null {
  const attacker = state.units[attackerId];
  const defender = state.units[defenderId];
  if (!attacker || !defender || attacker.houseId === defender.houseId) return null;

  const atkDef = UNITS[attacker.typeId];
  if (atkDef.requiresDeploy && !attacker.isDeployed) return null;

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
    houseHasDecree(atkHouse, 'decree_bodkin_volleys'),
  );
  const defCounter = getCounterMultiplier(
    defDef.unitClass,
    atkDef.unitClass,
    houseHasDecree(defHouse, 'decree_bodkin_volleys'),
  );

  const defTile = state.tiles[defender.tileKey]!;
  const atkTile = state.tiles[attacker.tileKey]!;
  const beaconMarked = isTargetBeaconMarked(state, defender);
  const flanked = isTargetFlanked(state, attacker, defender);

  let atkBonus = getUnitAtkBonusSum(
    state,
    attacker,
    flanked,
    defTile,
    defender.houseId,
    true,
    false,
  );
  if (beaconMarked) {
    atkBonus = clampBonusSum(atkBonus + BEACON_MARK_ATK_BONUS);
  }

  const defCover = beaconMarked
    ? 0
    : getTileTerrainOrFortDefBonus(state, defTile, defender.houseId);
  const defBonus = getUnitDefBonusSum(state, defender, attacker.houseId, beaconMarked);

  // Armor piercing (Crossbowman 30% vs Def >= 5; Deadeye honor +15%)
  let pierceRatio =
    defDef.defense >= CROSSBOW_ARMOR_PIERCE_DEF_THRESHOLD ? atkDef.armorPiercingRatio : 0;
  if (unitHasHonor(attacker, 'honor_deadeye')) {
    pierceRatio += 0.15;
  }
  const effectiveBaseDef = defDef.defense * Math.max(0.4, 1 - pierceRatio);

  const effAtk = atkDef.attack * (attacker.hp / attacker.maxHp) * (1 + atkBonus) * atkCounter;
  const effDef = effectiveBaseDef * (defender.hp / defender.maxHp) * (1 + defBonus) * defCounter;

  let rawPrimary = computeCombatDamage(effAtk, effDef);
  // Wall ranged damage reduction (-25%) & Iron Guard (-15% ranged dmg)
  if (atkDef.unitClass === 'ranged') {
    if (!beaconMarked && defTile.ownerHouseId === defender.houseId && defTile.improvement === 'palisade') {
      rawPrimary = Math.max(1, Math.round(rawPrimary * WALL_RANGED_DAMAGE_MULT));
    }
    if (unitHasHonor(defender, 'honor_iron_guard')) {
      rawPrimary = Math.max(1, Math.round(rawPrimary * 0.85));
    }
  }

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

  if (
    defenderHpAfter > 0 &&
    defDef.range === 1 &&
    dist === 1 &&
    atkDef.unitClass !== 'siege'
  ) {
    // Spearman Brace: vs melee cavalry always, OR vs ANY melee attacker when Fortified in Phalanx
    const isBrace =
      defDef.unitClass === 'spearman' &&
      atkDef.range === 1 &&
      (atkDef.unitClass === 'cavalry' || defender.isFortified);
    braceTriggered = isBrace;

    const retHpRatio = isBrace ? defender.hp / defender.maxHp : defenderHpAfter / defender.maxHp;
    let retAtkBonus = getUnitAtkBonusSum(
      state,
      defender,
      false,
      atkTile,
      attacker.houseId,
      false,
      false,
    );
    if (isBrace && unitHasHonor(defender, 'honor_pike_wall')) {
      retAtkBonus = clampBonusSum(retAtkBonus + 0.10);
    }
    const retDefBonus = getUnitDefBonusSum(state, attacker, defender.houseId, false);

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

  const shieldPushTriggered =
    defenderHpAfter > 0 &&
    attackerHpAfter > 0 &&
    dist === 1 &&
    primaryRes.damage > retaliationDamage &&
    getShieldPushDest(state, attacker, defender) !== null;

  return {
    attackerDamage: primaryRes.damage,
    retaliationDamage,
    attackerHpAfter,
    defenderHpAfter,
    defenderDestroyed: defenderHpAfter <= 0,
    attackerDestroyed: attackerHpAfter <= 0,
    oneShotProtectionTriggered: ospTriggered,
    braceTriggered,
    chargeTriggered: isCavalryCharging(attacker),
    shieldPushTriggered,
    isFlanked: flanked,
    defenderFortified: defender.isFortified,
    defenderCoverPct: Math.round(defCover * 100),
    attackerRank: getUnitRank(attacker.xp),
    defenderRank: getUnitRank(defender.xp),
  };
}

function consumeUnitAttack(unit: UnitState): UnitState {
  return {
    ...unit,
    hasAttacked: true,
    isFortified: false,
    isOverwatch: false,
    movedOpenTilesThisTurn: 0,
    remainingMovement: unit.typeId === 'dusk_outrider' ? unit.remainingMovement : 0,
  };
}

function handleCommanderDefeated(
  state: GameState,
  woundedHouseId: HouseId,
  slayerHouseId: HouseId,
  tileKey: CoordKey,
): GameState {
  const cmd = state.commanders[woundedHouseId];
  const slayer = state.houses[slayerHouseId];
  if (!cmd || !slayer) return state;

  const coinMult = houseHasDecree(slayer, 'decree_iron_sovereign') ? 2 : 1;
  const ransomCoin = COMMANDER_RANSOM_COIN * coinMult;
  let updatedSlayer = addLifetimeCoin(slayer, ransomCoin);
  updatedSlayer = addFavor(updatedSlayer, COMMANDER_RANSOM_FAVOR);
  updatedSlayer = {
    ...updatedSlayer,
    stats: {
      ...updatedSlayer.stats,
      commandersWounded: updatedSlayer.stats.commandersWounded + 1,
    },
  };

  let nextState: GameState = {
    ...state,
    commanders: {
      ...state.commanders,
      [woundedHouseId]: {
        ...cmd,
        unitId: null,
        woundedTurnsRemaining: COMMANDER_WOUNDED_TURNS,
        markedTargetUnitId: null,
      },
    },
    houses: {
      ...state.houses,
      [slayerHouseId]: updatedSlayer,
    },
  };

  nextState = appendChronicle(nextState, {
    type: 'commander_wounded',
    actorHouseId: slayerHouseId,
    targetHouseId: woundedHouseId,
    tileKey,
    summary: `${HOUSES[woundedHouseId].commanderName} wounded! House ${slayerHouseId} claimed ${ransomCoin} Coin & +${COMMANDER_RANSOM_FAVOR} Favor ransom.`,
    isPublic: true,
  });

  return nextState;
}


function awardKillSpoils(
  house: GameState['houses'][string],
  victimTypeId: UnitState['typeId'],
): GameState['houses'][string] {
  const hasSalvage = houseHasDecree(house, 'decree_salvage_crews');
  const matGain = hasSalvage ? SALVAGE_CREWS_MAT_REWARD : 0;
  const ironGain = hasSalvage && UNITS[victimTypeId].ironCost > 0 ? SALVAGE_CREWS_IRON_REWARD : 0;
  return {
    ...house,
    resources: {
      ...house.resources,
      materials: house.resources.materials + matGain,
      iron: house.resources.iron + ironGain,
    },
    stats: {
      ...house.stats,
      unitsDestroyed: house.stats.unitsDestroyed + 1,
    },
    writProgress: {
      ...house.writProgress,
      writ_victories: (house.writProgress.writ_victories ?? 0) + 1,
    },
  };
}

export function attackUnit(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.units[attackerId];
  const defender = state.units[defenderId];
  if (!attacker || !defender || attacker.hasAttacked) return state;

  const preview = previewUnitCombat(state, attackerId, defenderId);
  if (!preview) return state;

  const nextUnits: Record<string, UnitState> = { ...state.units };
  const nextHouses = { ...state.houses };
  const promotions: Array<{
    houseId: HouseId;
    unitId: string;
    tileKey: CoordKey;
    unitName: string;
    rank: 1 | 2;
  }> = [];

  let defenderWasCommander = false;
  let attackerWasCommander = false;

  if (preview.defenderDestroyed) {
    delete nextUnits[defenderId];
    defenderWasCommander = defender.isCommander;
    nextHouses[attacker.houseId] = awardKillSpoils(
      nextHouses[attacker.houseId]!,
      defender.typeId,
    );
  } else {
    let pushedKey = defender.tileKey;
    let pushedX = defender.x;
    let pushedY = defender.y;
    let clearStates = false;
    if (preview.shieldPushTriggered) {
      const dest = getShieldPushDest(state, attacker, defender);
      if (dest) {
        const dt = state.tiles[dest]!;
        pushedKey = dest;
        pushedX = dt.x;
        pushedY = dt.y;
        clearStates = true;
      }
    }

    if (preview.attackerDestroyed) {
      const defProm = applyUnitXp(
        {
          ...defender,
          tileKey: pushedKey,
          x: pushedX,
          y: pushedY,
          hp: preview.defenderHpAfter,
          damagedSinceLastTurn: true,
          isFortified: clearStates ? false : defender.isFortified,
          isOverwatch: clearStates ? false : defender.isOverwatch,
          isDeployed: clearStates ? false : defender.isDeployed,
        },
        XP_COMBAT_KILL,
        nextHouses[defender.houseId],
      );
      nextUnits[defenderId] = defProm.unit;
      if (defProm.promotedTo) {
        promotions.push({
          houseId: defender.houseId,
          unitId: defenderId,
          tileKey: pushedKey,
          unitName: UNITS[defender.typeId].name,
          rank: defProm.promotedTo,
        });
      }
    } else {
      nextUnits[defenderId] = {
        ...defender,
        tileKey: pushedKey,
        x: pushedX,
        y: pushedY,
        hp: preview.defenderHpAfter,
        damagedSinceLastTurn: true,
        isFortified: clearStates ? false : defender.isFortified,
        isOverwatch: clearStates ? false : defender.isOverwatch,
        isDeployed: clearStates ? false : defender.isDeployed,
      };
    }
  }

  if (preview.attackerDestroyed) {
    delete nextUnits[attackerId];
    attackerWasCommander = attacker.isCommander;
    nextHouses[defender.houseId] = awardKillSpoils(
      nextHouses[defender.houseId]!,
      attacker.typeId,
    );
  } else {
    const consumed = consumeUnitAttack(attacker);
    const atkXp = preview.defenderDestroyed ? XP_COMBAT_KILL : XP_COMBAT_SURVIVE;
    let hpAfter = preview.attackerHpAfter;
    if (preview.defenderDestroyed && unitHasHonor(attacker, 'honor_raider')) {
      hpAfter = Math.min(consumed.maxHp, hpAfter + 3);
    }
    const atkProm = applyUnitXp(
      {
        ...consumed,
        hp: hpAfter,
        damagedSinceLastTurn: preview.retaliationDamage > 0 ? true : consumed.damagedSinceLastTurn,
      },
      atkXp,
      nextHouses[attacker.houseId],
    );
    nextUnits[attackerId] = atkProm.unit;
    if (atkProm.promotedTo) {
      promotions.push({
        houseId: attacker.houseId,
        unitId: attackerId,
        tileKey: attacker.tileKey,
        unitName: UNITS[attacker.typeId].name,
        rank: atkProm.promotedTo,
      });
    }
  }

  // Trebuchet splash damage (Grand Bombardment: 3, Rapid Crew honor: +2)
  if (attacker.typeId === 'trebuchet') {
    const splashBase =
      (houseHasDecree(nextHouses[attacker.houseId], 'decree_grand_bombardment')
        ? TREBUCHET_GRAND_BOMBARDMENT_SPLASH
        : 0) + (unitHasHonor(attacker, 'honor_rapid_crew') ? 2 : 0);
    if (splashBase > 0) {
      for (const n of getNeighbors(defender.x, defender.y, state.gridSize)) {
        const nk = coordKey(n.x, n.y);
        const adjU = Object.values(nextUnits).find((u) => u.tileKey === nk && u.houseId !== attacker.houseId);
        if (adjU) {
          nextUnits[adjU.id] = {
            ...adjU,
            hp: Math.max(1, adjU.hp - splashBase),
            damagedSinceLastTurn: true,
          };
        }
      }
    }
  }

  // Queue Battle Honor selection for promoted non-commander units
  for (const prom of promotions) {
    const h = nextHouses[prom.houseId]!;
    if (!h.pendingHonorUnitIds.includes(prom.unitId)) {
      nextHouses[prom.houseId] = {
        ...h,
        pendingHonorUnitIds: [...h.pendingHonorUnitIds, prom.unitId],
      };
    }
  }

  let nextState: GameState = {
    ...state,
    units: nextUnits,
    houses: nextHouses,
  };

  // Grant Lord-Commander XP if Commander fought or led an adjacent victorious combat
  if (preview.defenderDestroyed) {
    if (attacker.isCommander || isAdjacentToFriendlyCommander(state, attacker)) {
      nextState = grantCommanderXp(nextState, attacker.houseId, 2);
    }
  } else if (attacker.isCommander || isAdjacentToFriendlyCommander(state, attacker)) {
    nextState = grantCommanderXp(nextState, attacker.houseId, 1);
  }

  if (defenderWasCommander) {
    nextState = handleCommanderDefeated(nextState, defender.houseId, attacker.houseId, defender.tileKey);
  }
  if (attackerWasCommander) {
    nextState = handleCommanderDefeated(nextState, attacker.houseId, defender.houseId, attacker.tileKey);
  }

  nextState = appendChronicle(nextState, {
    type: preview.defenderDestroyed ? 'unit_destroyed' : 'combat',
    actorHouseId: attacker.houseId,
    targetHouseId: defender.houseId,
    tileKey: defender.tileKey,
    summary: `${UNITS[attacker.typeId].name} (${attacker.houseId}) struck ${UNITS[defender.typeId].name} (${defender.houseId}) for ${preview.attackerDamage} dmg${preview.retaliationDamage > 0 ? ` (took ${preview.retaliationDamage})` : ''}${preview.shieldPushTriggered ? ' [Pushed]' : ''}.`,
    isPublic: false,
  });

  for (const prom of promotions) {
    const label = prom.rank === 2 ? 'Veteran' : 'Seasoned';
    nextState = appendChronicle(nextState, {
      type: 'unit_promoted',
      actorHouseId: prom.houseId,
      targetHouseId: null,
      tileKey: prom.tileKey,
      summary: `${prom.unitName} earned ${label} rank (+2 Max HP & Battle Honor).`,
      isPublic: false,
    });
  }

  if (preview.defenderDestroyed || preview.shieldPushTriggered) {
    nextState = autoRehomeOrphans(nextState, defender.houseId);
    nextState = recomputeHouseFog(nextState, defender.houseId);
  }
  if (preview.attackerDestroyed) {
    nextState = autoRehomeOrphans(nextState, attacker.houseId);
    nextState = recomputeHouseFog(nextState, attacker.houseId);
  }

  return nextState;
}


// ============================================================================
// Ranged Overwatch & Trebuchet Deploy (Class Tactical Actions)
// ============================================================================

export function canActivateOverwatch(state: GameState, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit || unit.hasAttacked || unit.isOverwatch) return false;
  if (unit.spawnedOnTurn === state.turnNumber) return false;
  return UNITS[unit.typeId].unitClass === 'ranged';
}

export function activateOverwatch(state: GameState, unitId: string): GameState {
  if (!canActivateOverwatch(state, unitId)) return state;
  const unit = state.units[unitId]!;
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: {
        ...unit,
        isOverwatch: true,
        hasAttacked: true,
        remainingMovement: 0,
      },
    },
  };
}

/**
 * Triggered when `movedUnitId` enters `destKey`. First qualifying enemy Overwatch unit
 * (in deterministic unit.id order) with active visibility, range, and LOS fires an
 * automatic reaction shot and clears `isOverwatch`.
 */
export function resolveOverwatchOnUnitMove(
  state: GameState,
  movedUnitId: string,
): { readonly state: GameState; readonly triggered: boolean; readonly unitDied: boolean } {
  const target = state.units[movedUnitId];
  if (!target) return { state, triggered: false, unitDied: false };

  // Solis Lv2 Solar Citadel Spire cancels enemy Overwatch within 2 tiles of the moving unit
  const watchers = Object.values(state.units)
    .filter((u) => u.houseId !== target.houseId && u.isOverwatch)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const watcher of watchers) {
    const watcherFog = state.fog[watcher.houseId];
    if (!watcherFog || watcherFog[target.tileKey] !== 'visible') continue;

    // Check if watcher is suppressed by Solis Lv2 Signal Bastion within 2 tiles
    const suppressed = Object.values(state.tiles).some(
      (t) =>
        t.ownerHouseId === target.houseId &&
        t.improvement === 'signal_bastion' &&
        t.improvementLevel === 2 &&
        chebyshevDist(t.x, t.y, watcher.x, watcher.y) <= 2,
    );
    if (suppressed) continue;

    const dist = chebyshevDist(watcher.x, watcher.y, target.x, target.y);
    const range = getUnitAttackRange(state, watcher);
    if (dist < 1 || dist > range) continue;
    if (!hasLineOfSight(state, watcher.x, watcher.y, target.x, target.y)) continue;

    const wDef = UNITS[watcher.typeId];
    const tDef = UNITS[target.typeId];
    const wHouse = state.houses[watcher.houseId]!;
    const tHouse = state.houses[target.houseId]!;
    const hasBodkin = houseHasDecree(wHouse, 'decree_bodkin_volleys');
    const atkCounter = getCounterMultiplier(wDef.unitClass, tDef.unitClass, hasBodkin);
    const defCounter = getCounterMultiplier(
      tDef.unitClass,
      wDef.unitClass,
      houseHasDecree(tHouse, 'decree_bodkin_volleys'),
    );

    const defTile = state.tiles[target.tileKey]!;
    const atkBonus = getUnitAtkBonusSum(state, watcher, false, defTile, target.houseId, true, false);
    const defBonus = getUnitDefBonusSum(state, target, watcher.houseId, false);
    let pierceRatio =
      tDef.defense >= CROSSBOW_ARMOR_PIERCE_DEF_THRESHOLD ? wDef.armorPiercingRatio : 0;
    if (unitHasHonor(watcher, 'honor_deadeye')) pierceRatio += 0.15;
    const effBaseDef = tDef.defense * Math.max(0.4, 1 - pierceRatio);

    const effAtk = wDef.attack * (watcher.hp / watcher.maxHp) * (1 + atkBonus) * atkCounter;
    const effDef = effBaseDef * (target.hp / target.maxHp) * (1 + defBonus) * defCounter;
    let mult = hasBodkin ? OVERWATCH_BODKIN_DAMAGE_MULT : OVERWATCH_DAMAGE_MULT;
    if (unitHasHonor(watcher, 'honor_deadeye')) mult += 0.15;

    let rawDmg = Math.max(1, Math.round(computeCombatDamage(effAtk, effDef) * mult));
    if (defTile.ownerHouseId === target.houseId && defTile.improvement === 'palisade') {
      rawDmg = Math.max(1, Math.round(rawDmg * WALL_RANGED_DAMAGE_MULT));
    }
    if (unitHasHonor(target, 'honor_iron_guard')) {
      rawDmg = Math.max(1, Math.round(rawDmg * 0.85));
    }

    const res = applyOneShotProtection(rawDmg, target.hp, target.maxHp, wDef.range, atkCounter);
    const hpAfter = Math.max(0, target.hp - res.damage);
    const nextUnits = { ...state.units };
    const nextHouses = { ...state.houses };

    nextUnits[watcher.id] = { ...watcher, isOverwatch: false };
    let unitDied = false;
    if (hpAfter <= 0) {
      delete nextUnits[target.id];
      unitDied = true;
      nextHouses[watcher.houseId] = awardKillSpoils(nextHouses[watcher.houseId]!, target.typeId);
    } else {
      nextUnits[target.id] = { ...target, hp: hpAfter, damagedSinceLastTurn: true };
    }

    let nextState: GameState = {
      ...state,
      units: nextUnits,
      houses: nextHouses,
    };
    if (unitDied && target.isCommander) {
      nextState = handleCommanderDefeated(nextState, target.houseId, watcher.houseId, target.tileKey);
    }
    nextState = appendChronicle(nextState, {
      type: 'overwatch_shot',
      actorHouseId: watcher.houseId,
      targetHouseId: target.houseId,
      tileKey: target.tileKey,
      summary: `Overwatch! ${wDef.name} (${watcher.houseId}) ambushed ${tDef.name} for ${res.damage} dmg.`,
      isPublic: false,
    });
    if (unitDied) {
      nextState = autoRehomeOrphans(nextState, target.houseId);
      nextState = recomputeHouseFog(nextState, target.houseId);
    }
    return { state: nextState, triggered: true, unitDied };
  }

  return { state, triggered: false, unitDied: false };
}

export function canDeployTrebuchet(state: GameState, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit || !UNITS[unit.typeId].requiresDeploy) return false;
  if (unit.isDeployed || unit.hasAttacked) return false;
  if (unit.spawnedOnTurn === state.turnNumber) return false;
  return true;
}

export function deployTrebuchet(state: GameState, unitId: string): GameState {
  if (!canDeployTrebuchet(state, unitId)) return state;
  const unit = state.units[unitId]!;
  const freeDeploy =
    isAdjacentToFriendlyCommander(state, unit) &&
    hasCommanderTrait(state, unit.houseId, 'trait_siege_master');
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: {
        ...unit,
        isDeployed: true,
        hasAttacked: freeDeploy ? unit.hasAttacked : true,
        remainingMovement: 0,
      },
    },
  };
}

// ============================================================================
// Lord-Commander Active Command Skills (5 House Skills, 4-Turn Cooldown)
// ============================================================================

export function canUseCommanderSkill(
  state: GameState,
  houseId: HouseId,
  targetUnitId?: string,
): boolean {
  const cmd = state.commanders[houseId];
  const house = state.houses[houseId];
  if (!cmd || !house || house.isEliminated || !cmd.unitId) return false;
  if (cmd.skillCooldown > 0) return false;
  const cmdUnit = state.units[cmd.unitId];
  if (!cmdUnit) return false;

  const skillId = HOUSES[houseId].commanderSkillId;
  if (skillId === 'golden_banner') {
    return house.resources.coin >= GOLDEN_BANNER_COIN_COST;
  }
  if (skillId === 'beacon_mark') {
    if (!targetUnitId) return false;
    const target = state.units[targetUnitId];
    if (!target || target.houseId === houseId) return false;
    if ((state.fog[houseId]?.[target.tileKey] ?? 'unexplored') !== 'visible') return false;
    return chebyshevDist(cmdUnit.x, cmdUnit.y, target.x, target.y) <= 3;
  }
  return true;
}

export function useCommanderSkill(
  state: GameState,
  houseId: HouseId,
  targetUnitId?: string,
): GameState {
  if (!canUseCommanderSkill(state, houseId, targetUnitId)) return state;
  const cmd = state.commanders[houseId]!;
  const cmdUnit = state.units[cmd.unitId!]!;
  const house = state.houses[houseId]!;
  const houseDef = HOUSES[houseId];
  const skillId = houseDef.commanderSkillId;

  const nextUnits: Record<string, UnitState> = { ...state.units };
  let nextHouse = house;
  let markedTargetUnitId: string | null = null;
  let skillActiveUntilTurn = state.turnNumber;
  let nextState = state;

  if (skillId === 'wardens_volley') {
    // Reworked House Vane skill: reveals 7x7; allies within 2 tiles ignore Forest move cost
    // & gain +15% Forest/Hills Atk; ranged allies within 2 tiles gain +1 Range & arm Overwatch even after acting.
    nextState = permanentlyRevealRadius(nextState, houseId, cmdUnit.x, cmdUnit.y, 3);
    for (const [uid, u] of Object.entries(nextUnits)) {
      if (u.houseId !== houseId) continue;
      if (chebyshevDist(u.x, u.y, cmdUnit.x, cmdUnit.y) <= 2) {
        const isRanged = UNITS[u.typeId].unitClass === 'ranged';
        nextUnits[uid] = {
          ...u,
          isOverwatch: isRanged ? true : u.isOverwatch,
          overwatchRangeBonusUntilTurn: isRanged
            ? state.turnNumber + 1
            : u.overwatchRangeBonusUntilTurn,
          commanderBuffUntilTurn: state.turnNumber,
        };
      }
    }
  } else if (skillId === 'hold_the_line') {
    // Ironhelm: adjacent allies immediately Fortify (even if acted), +25% Def until next turn, +4 HP
    skillActiveUntilTurn = state.turnNumber + 1;
    for (const [uid, u] of Object.entries(nextUnits)) {
      if (u.houseId !== houseId) continue;
      if (chebyshevDist(u.x, u.y, cmdUnit.x, cmdUnit.y) <= 1) {
        nextUnits[uid] = {
          ...u,
          isFortified: true,
          hp: Math.min(u.maxHp, u.hp + HOLD_THE_LINE_HEAL),
          commanderBuffUntilTurn: state.turnNumber + 1,
        };
      }
    }
  } else if (skillId === 'golden_banner') {
    // Aurelia: spend 6 Coin to heal adjacent allies +7 HP and clear Mutiny
    nextHouse = {
      ...house,
      resources: {
        ...house.resources,
        coin: house.resources.coin - GOLDEN_BANNER_COIN_COST,
      },
    };
    for (const [uid, u] of Object.entries(nextUnits)) {
      if (u.houseId !== houseId) continue;
      if (chebyshevDist(u.x, u.y, cmdUnit.x, cmdUnit.y) <= 1) {
        nextUnits[uid] = {
          ...u,
          hp: Math.min(u.maxHp, u.hp + GOLDEN_BANNER_HEAL),
          isMutinied: false,
        };
      }
    }
  } else if (skillId === 'raiders_horn') {
    // Corvus: adjacent allies gain +1 Movement and ignore ZoC this turn; pillaging heals +6 HP
    for (const [uid, u] of Object.entries(nextUnits)) {
      if (u.houseId !== houseId) continue;
      if (chebyshevDist(u.x, u.y, cmdUnit.x, cmdUnit.y) <= 1) {
        nextUnits[uid] = {
          ...u,
          remainingMovement: u.remainingMovement + 1,
          commanderBuffUntilTurn: state.turnNumber,
        };
      }
    }
  } else if (skillId === 'beacon_mark' && targetUnitId) {
    // Solis: mark visible enemy within 3 tiles (ignores cover & +20% Atk against it this turn)
    markedTargetUnitId = targetUnitId;
  }

  nextState = {
    ...nextState,
    units: nextUnits,
    houses: {
      ...nextState.houses,
      [houseId]: nextHouse,
    },
    commanders: {
      ...nextState.commanders,
      [houseId]: {
        ...cmd,
        skillCooldown: COMMANDER_SKILL_COOLDOWN,
        skillActiveUntilTurn,
        markedTargetUnitId,
      },
    },
  };

  nextState = appendChronicle(nextState, {
    type: 'commander_skill',
    actorHouseId: houseId,
    targetHouseId: null,
    tileKey: cmdUnit.tileKey,
    summary: `${houseDef.commanderName} invoked ${houseDef.commanderSkillName}!`,
    isPublic: false,
  });

  return nextState;
}


// ============================================================================
// Siege, Keep Attacks, Keep Arrow Slits, High Seat, Outpost, Village, Camp, Raze & Pillage
// ============================================================================

function getStructureBaseAttack(state: GameState, attacker: UnitState): number {
  const def = UNITS[attacker.typeId];
  let base = def.structureAttack ?? def.attack;
  if (def.unitClass === 'siege') {
    if (
      (attacker.typeId === 'siege_ram' || attacker.typeId === 'sapper_crew') &&
      houseHasDecree(state.houses[attacker.houseId], 'decree_grand_bombardment')
    ) {
      base += 2;
    }
    if (unitHasHonor(attacker, 'honor_breacher')) base += 2;
    if (
      isAdjacentToFriendlyCommander(state, attacker) &&
      hasCommanderTrait(state, attacker.houseId, 'trait_siege_master')
    ) {
      base += 2;
    }
  }
  return base;
}

export function attackKeep(state: GameState, attackerId: string, keepId: string): GameState {
  const attacker = state.units[attackerId];
  const keep = state.keeps[keepId];
  if (!attacker || !keep || attacker.hasAttacked || keep.ownerHouseId === attacker.houseId) {
    return state;
  }
  const atkDef = UNITS[attacker.typeId];
  if (atkDef.requiresDeploy && !attacker.isDeployed) return state;

  const dist = chebyshevDist(attacker.x, attacker.y, keep.x, keep.y);
  const atkRange = getUnitAttackRange(state, attacker);
  if (dist > atkRange || !hasLineOfSight(state, attacker.x, attacker.y, keep.x, keep.y)) {
    return state;
  }

  const garrisonUnit = getUnitAt(state, keep.tileKey);
  if (garrisonUnit && garrisonUnit.houseId !== attacker.houseId) return state;

  const keepTile = state.tiles[keep.tileKey]!;
  const baseAtk = getStructureBaseAttack(state, attacker);
  const atkBonus = getUnitAtkBonusSum(
    state,
    attacker,
    false,
    keepTile,
    keep.ownerHouseId,
    true,
    true,
  );
  const keepDefBonus = getTileTerrainOrFortDefBonus(state, keepTile, keep.ownerHouseId);

  const effAtk = baseAtk * (attacker.hp / attacker.maxHp) * (1 + atkBonus);
  const effDef = KEEP_GARRISON_DEFENSE * (keep.keepHp / keep.maxKeepHp) * (1 + keepDefBonus);

  let damage = computeCombatDamage(effAtk, effDef);
  if (atkDef.unitClass !== 'siege') {
    damage = Math.max(1, Math.round(damage * NON_SIEGE_STRUCTURE_DAMAGE_MULT));
  }

  const keepHpAfter = Math.max(0, keep.keepHp - damage);
  let attackerHpAfter = attacker.hp;

  if (keepHpAfter > 0 && dist === 1 && atkDef.unitClass !== 'siege') {
    const keepAtk =
      keep.tier === 3 ? KEEP_TIER3_ATTACK : keep.tier === 2 ? KEEP_TIER2_ATTACK : KEEP_TIER1_ATTACK;
    const retEffAtk = keepAtk * (keepHpAfter / keep.maxKeepHp);
    const retDefBonus = getUnitDefBonusSum(state, attacker, keep.ownerHouseId, false);
    const retEffDef = atkDef.defense * (attacker.hp / attacker.maxHp) * (1 + retDefBonus);
    const rawRet = computeCombatDamage(retEffAtk, retEffDef);
    const retRes = applyOneShotProtection(rawRet, attacker.hp, attacker.maxHp, 1, 1.0);
    attackerHpAfter = Math.max(0, attacker.hp - retRes.damage);
  }

  const nextUnits: Record<string, UnitState> = { ...state.units };
  const nextHouses = { ...state.houses };
  let attackerWasCommander = false;

  if (attackerHpAfter <= 0) {
    delete nextUnits[attackerId];
    attackerWasCommander = attacker.isCommander;
  } else {
    const consumed = consumeUnitAttack(attacker);
    const keepXp = keepHpAfter <= 0 ? XP_STRUCTURE_CAPTURE : XP_COMBAT_SURVIVE;
    const prom = applyUnitXp(
      {
        ...consumed,
        hp: attackerHpAfter,
        damagedSinceLastTurn: attackerHpAfter < attacker.hp ? true : consumed.damagedSinceLastTurn,
      },
      keepXp,
      nextHouses[attacker.houseId],
    );
    nextUnits[attackerId] = prom.unit;
    if (prom.promotedTo) {
      const h = nextHouses[attacker.houseId]!;
      if (!h.pendingHonorUnitIds.includes(attackerId)) {
        nextHouses[attacker.houseId] = {
          ...h,
          pendingHonorUnitIds: [...h.pendingHonorUnitIds, attackerId],
        };
      }
    }
  }

  let nextState: GameState = {
    ...state,
    units: nextUnits,
    houses: nextHouses,
    keeps: {
      ...state.keeps,
      [keepId]: {
        ...keep,
        keepHp: keepHpAfter,
        damagedLastRound: true,
      },
    },
  };

  if (attackerWasCommander) {
    nextState = handleCommanderDefeated(nextState, attacker.houseId, keep.ownerHouseId, attacker.tileKey);
  }

  if (keepHpAfter <= 0) {
    nextState = captureKeep(nextState, keepId, attacker.houseId);
    if (attacker.isCommander || isAdjacentToFriendlyCommander(state, attacker)) {
      nextState = grantCommanderXp(nextState, attacker.houseId, 2);
    }
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
 * Tier-3 Grand Citadel active Range-2 Arrow Slits volley (once per turn, 6 Atk, zero retaliation).
 */
export function canFireKeepGarrisonVolley(
  state: GameState,
  keepId: string,
  targetUnitId: string,
): boolean {
  const keep = state.keeps[keepId];
  const target = state.units[targetUnitId];
  if (!keep || !target || keep.tier < 3 || keep.garrisonVolleyUsedThisTurn) return false;
  if (target.houseId === keep.ownerHouseId) return false;
  if ((state.fog[keep.ownerHouseId]?.[target.tileKey] ?? 'unexplored') !== 'visible') return false;
  const dist = chebyshevDist(keep.x, keep.y, target.x, target.y);
  if (dist < 1 || dist > KEEP_ARROW_SLITS_RANGE) return false;
  return hasLineOfSight(state, keep.x, keep.y, target.x, target.y);
}

export function fireKeepGarrisonVolley(
  state: GameState,
  keepId: string,
  targetUnitId: string,
): GameState {
  if (!canFireKeepGarrisonVolley(state, keepId, targetUnitId)) return state;
  const keep = state.keeps[keepId]!;
  const target = state.units[targetUnitId]!;
  const tDef = UNITS[target.typeId];
  const effAtk = KEEP_TIER3_ATTACK * (keep.keepHp / keep.maxKeepHp);
  const defBonus = getUnitDefBonusSum(state, target, keep.ownerHouseId, false);
  const effDef = tDef.defense * (target.hp / target.maxHp) * (1 + defBonus);
  const rawDmg = computeCombatDamage(effAtk, effDef);
  const res = applyOneShotProtection(rawDmg, target.hp, target.maxHp, KEEP_ARROW_SLITS_RANGE, 1.0);
  const hpAfter = Math.max(0, target.hp - res.damage);

  const nextUnits = { ...state.units };
  const nextHouses = { ...state.houses };
  let killed = false;
  if (hpAfter <= 0) {
    delete nextUnits[targetUnitId];
    killed = true;
    nextHouses[keep.ownerHouseId] = awardKillSpoils(nextHouses[keep.ownerHouseId]!, target.typeId);
  } else {
    nextUnits[targetUnitId] = { ...target, hp: hpAfter, damagedSinceLastTurn: true };
  }

  let nextState: GameState = {
    ...state,
    units: nextUnits,
    houses: nextHouses,
    keeps: {
      ...state.keeps,
      [keepId]: { ...keep, garrisonVolleyUsedThisTurn: true },
    },
  };

  if (killed && target.isCommander) {
    nextState = handleCommanderDefeated(nextState, target.houseId, keep.ownerHouseId, target.tileKey);
  }
  nextState = appendChronicle(nextState, {
    type: 'garrison_volley',
    actorHouseId: keep.ownerHouseId,
    targetHouseId: target.houseId,
    tileKey: target.tileKey,
    summary: `${keep.name} arrow slits struck ${tDef.name} for ${res.damage} dmg.`,
    isPublic: false,
  });
  if (killed) {
    nextState = autoRehomeOrphans(nextState, target.houseId);
    nextState = recomputeHouseFog(nextState, target.houseId);
  }
  return nextState;
}


/**
 * Attacking the Neutral Central Ruined High Seat (42 HP -> converts to Tier-2 Keep with balanced prestige yield).
 */
export function attackHighSeat(
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
    tile.landmark !== 'high_seat' ||
    tile.highSeatHp === null ||
    tile.highSeatHp <= 0
  ) {
    return state;
  }
  const atkDef = UNITS[attacker.typeId];
  if (atkDef.requiresDeploy && !attacker.isDeployed) return state;

  const dist = chebyshevDist(attacker.x, attacker.y, tile.x, tile.y);
  const atkRange = getUnitAttackRange(state, attacker);
  if (dist > atkRange || !hasLineOfSight(state, attacker.x, attacker.y, tile.x, tile.y)) {
    return state;
  }

  const baseAtk = getStructureBaseAttack(state, attacker);
  const atkBonus = getUnitAtkBonusSum(state, attacker, false, tile, undefined, true, true);
  const effAtk = baseAtk * (attacker.hp / attacker.maxHp) * (1 + atkBonus);
  const effDef =
    HIGH_SEAT_DEFENSE * (tile.highSeatHp / HIGH_SEAT_MAX_HP) * (1 + HIGH_SEAT_DEF_BONUS);
  let damage = computeCombatDamage(effAtk, effDef);
  if (atkDef.unitClass !== 'siege') {
    damage = Math.max(1, Math.round(damage * NON_SIEGE_STRUCTURE_DAMAGE_MULT));
  }

  const hpAfter = Math.max(0, tile.highSeatHp - damage);
  let attackerHpAfter = attacker.hp;
  if (hpAfter > 0 && dist === 1 && atkDef.unitClass !== 'siege') {
    const retEffAtk = HIGH_SEAT_ATTACK * (hpAfter / HIGH_SEAT_MAX_HP);
    const retDefBonus = getUnitDefBonusSum(state, attacker, undefined, false);
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
    nextUnits[attackerId] = applyUnitXp(
      {
        ...consumed,
        hp: attackerHpAfter,
        damagedSinceLastTurn: attackerHpAfter < attacker.hp ? true : consumed.damagedSinceLastTurn,
      },
      hpAfter <= 0 ? XP_STRUCTURE_CAPTURE : XP_COMBAT_SURVIVE,
      state.houses[attacker.houseId],
    ).unit;
  }

  if (hpAfter > 0) {
    let nextState: GameState = {
      ...state,
      units: nextUnits,
      tiles: {
        ...state.tiles,
        [tileKey]: { ...tile, highSeatHp: hpAfter, highSeatDamagedLastRound: true },
      },
    };
    if (attackerHpAfter <= 0) {
      if (attacker.isCommander) {
        const cmd = nextState.commanders[attacker.houseId]!;
        nextState = {
          ...nextState,
          commanders: {
            ...nextState.commanders,
            [attacker.houseId]: { ...cmd, unitId: null, woundedTurnsRemaining: COMMANDER_WOUNDED_TURNS },
          },
        };
      }
      nextState = autoRehomeOrphans(nextState, attacker.houseId);
      nextState = recomputeHouseFog(nextState, attacker.houseId);
    }
    return nextState;
  }

  // High Seat seized -> becomes Tier-2 Keep with balanced prestige bonus
  const isFirstCapture = state.highSeatFirstCapturedBy === null;
  const house = state.houses[attacker.houseId]!;
  const keepId = `keep_${state.nextKeepSeq}`;
  const newKeep: KeepState = {
    id: keepId,
    name: 'The High Seat',
    ownerHouseId: attacker.houseId,
    tileKey,
    x: tile.x,
    y: tile.y,
    tier: 2,
    isCapital: false,
    isHighSeat: true,
    specialization: 'none',
    citadelCharter: 'none',
    keepHp: HIGH_SEAT_CAPTURE_HP,
    maxKeepHp: KEEP_TIER2_MAX_HP,
    damagedLastRound: true,
    garrisonVolleyUsedThisTurn: true,
    foodProgress: 0,
    repeatMilestonesClaimed: 0,
  };

  if (attackerHpAfter > 0 && atkDef.range === 1 && nextUnits[attackerId]) {
    nextUnits[attackerId] = { ...nextUnits[attackerId]!, tileKey, x: tile.x, y: tile.y };
  }

  let nextState: GameState = {
    ...state,
    units: nextUnits,
    highSeatFirstCapturedBy: isFirstCapture ? attacker.houseId : state.highSeatFirstCapturedBy,
    tiles: {
      ...state.tiles,
      [tileKey]: {
        ...tile,
        landmark: 'none',
        landmarkCleared: true,
        highSeatHp: null,
        highSeatDamagedLastRound: false,
      },
    },
    keeps: { ...state.keeps, [keepId]: newKeep },
    houses: {
      ...state.houses,
      [attacker.houseId]: {
        ...house,
        pendingSpecializationKeepIds: [...house.pendingSpecializationKeepIds, keepId],
        stats: {
          ...house.stats,
          highSeatCaptured: house.stats.highSeatCaptured + (isFirstCapture ? 1 : 0),
        },
      },
    },
    nextKeepSeq: state.nextKeepSeq + 1,
  };

  nextState = claimKeepTerritory(nextState, keepId);
  nextState = permanentlyRevealRadius(nextState, attacker.houseId, tile.x, tile.y, KEEP_TIER2_RADIUS);
  nextState = autoRehomeOrphans(nextState, attacker.houseId);
  nextState = recomputeHouseFog(nextState, attacker.houseId);
  nextState = appendChronicle(nextState, {
    type: 'high_seat_captured',
    actorHouseId: attacker.houseId,
    targetHouseId: null,
    tileKey,
    summary: `House ${attacker.houseId} claimed the Ruined High Seat (+3 Coin/t, +1 Favor even turns)!`,
    isPublic: true,
  });

  return nextState;
}


/**
 * Attacking an enemy Frontier Outpost.
 */
export function attackOutpost(state: GameState, attackerId: string, outpostId: string): GameState {
  const attacker = state.units[attackerId];
  const outpost = state.outposts[outpostId];
  if (!attacker || !outpost || attacker.hasAttacked || outpost.ownerHouseId === attacker.houseId) {
    return state;
  }
  const atkDef = UNITS[attacker.typeId];
  if (atkDef.requiresDeploy && !attacker.isDeployed) return state;

  const dist = chebyshevDist(attacker.x, attacker.y, outpost.x, outpost.y);
  const atkRange = getUnitAttackRange(state, attacker);
  if (dist > atkRange || !hasLineOfSight(state, attacker.x, attacker.y, outpost.x, outpost.y)) {
    return state;
  }
  const garrison = getUnitAt(state, outpost.tileKey);
  if (garrison && garrison.houseId !== attacker.houseId) return state;

  const tile = state.tiles[outpost.tileKey]!;
  const baseAtk = getStructureBaseAttack(state, attacker);
  const atkBonus = getUnitAtkBonusSum(state, attacker, false, tile, outpost.ownerHouseId, true, true);
  const effAtk = baseAtk * (attacker.hp / attacker.maxHp) * (1 + atkBonus);
  const effDef = OUTPOST_DEFENSE * (outpost.hp / OUTPOST_MAX_HP) * (1 + OUTPOST_DEF_BONUS);
  let damage = computeCombatDamage(effAtk, effDef);
  if (atkDef.unitClass !== 'siege') {
    damage = Math.max(1, Math.round(damage * NON_SIEGE_STRUCTURE_DAMAGE_MULT));
  }

  const hpAfter = Math.max(0, outpost.hp - damage);
  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [attackerId]: consumeUnitAttack(attacker),
    },
    outposts: {
      ...state.outposts,
      [outpostId]: { ...outpost, hp: hpAfter, damagedLastRound: true },
    },
  };

  if (hpAfter <= 0) {
    nextState = captureOrDestroyOutpost(nextState, outpostId, attacker.houseId);
  }
  return nextState;
}


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
  const atkDef = UNITS[attacker.typeId];
  if (atkDef.requiresDeploy && !attacker.isDeployed) return state;

  const dist = chebyshevDist(attacker.x, attacker.y, tile.x, tile.y);
  const atkRange = getUnitAttackRange(state, attacker);
  if (dist > atkRange || !hasLineOfSight(state, attacker.x, attacker.y, tile.x, tile.y)) {
    return state;
  }

  const baseAtk = getStructureBaseAttack(state, attacker);
  const atkBonus = getUnitAtkBonusSum(state, attacker, false, tile, undefined, true, true);
  const villageDefBonus = Math.max(TERRAINS[tile.terrain].defBonus, VILLAGE_DEF_BONUS);

  const effAtk = baseAtk * (attacker.hp / attacker.maxHp) * (1 + atkBonus);
  const effDef = VILLAGE_DEFENSE * (tile.villageHp / VILLAGE_MAX_HP) * (1 + villageDefBonus);
  const damage = computeCombatDamage(effAtk, effDef);
  const villageHpAfter = Math.max(0, tile.villageHp - damage);

  let attackerHpAfter = attacker.hp;
  if (villageHpAfter > 0 && dist === 1 && atkDef.unitClass !== 'siege') {
    const retEffAtk = VILLAGE_ATTACK * (villageHpAfter / VILLAGE_MAX_HP);
    const retDefBonus = getUnitDefBonusSum(state, attacker, undefined, false);
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
    nextUnits[attackerId] = applyUnitXp(
      {
        ...consumed,
        hp: attackerHpAfter,
        damagedSinceLastTurn: attackerHpAfter < attacker.hp ? true : consumed.damagedSinceLastTurn,
      },
      villageHpAfter <= 0 ? XP_STRUCTURE_CAPTURE : XP_COMBAT_SURVIVE,
      state.houses[attacker.houseId],
    ).unit;
  }

  if (villageHpAfter > 0) {
    let nextState: GameState = {
      ...state,
      units: nextUnits,
      tiles: {
        ...state.tiles,
        [tileKey]: { ...tile, villageHp: villageHpAfter, villageDamagedLastRound: true },
      },
    };
    if (attackerHpAfter <= 0) {
      if (attacker.isCommander) {
        const cmd = nextState.commanders[attacker.houseId]!;
        nextState = {
          ...nextState,
          commanders: {
            ...nextState.commanders,
            [attacker.houseId]: { ...cmd, unitId: null, woundedTurnsRemaining: COMMANDER_WOUNDED_TURNS },
          },
        };
      }
      nextState = autoRehomeOrphans(nextState, attacker.houseId);
      nextState = recomputeHouseFog(nextState, attacker.houseId);
    }
    return nextState;
  }

  const house = state.houses[attacker.houseId]!;
  const { name, updatedHouse: namedHouse } = allocateSettlementName(house);
  const favorPenalty = houseHasDecree(house, 'decree_iron_sovereign')
    ? 0
    : VILLAGE_SEIZE_FAVOR_PENALTY;
  const penalizedHouse = addFavor(namedHouse, -favorPenalty);
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
    isHighSeat: false,
    specialization: 'none',
    citadelCharter: 'none',
    keepHp: VILLAGE_SEIZE_KEEP_HP,
    maxKeepHp: KEEP_TIER1_MAX_HP,
    damagedLastRound: true,
    garrisonVolleyUsedThisTurn: false,
    foodProgress: 0,
    repeatMilestonesClaimed: 0,
  };

  if (attackerHpAfter > 0 && atkDef.range === 1 && nextUnits[attackerId]) {
    nextUnits[attackerId] = { ...nextUnits[attackerId]!, tileKey, x: tile.x, y: tile.y };
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
    keeps: { ...state.keeps, [keepId]: newKeep },
    houses: { ...state.houses, [attacker.houseId]: finalHouse },
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
    summary: `House ${attacker.houseId} violently seized ${name} (${VILLAGE_SEIZE_KEEP_HP}/${KEEP_TIER1_MAX_HP} HP${favorPenalty > 0 ? `, -${favorPenalty} Favor` : ''}).`,
    isPublic: true,
  });

  return nextState;
}


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
  const atkDef = UNITS[attacker.typeId];
  if (atkDef.requiresDeploy && !attacker.isDeployed) return state;

  const dist = chebyshevDist(attacker.x, attacker.y, tile.x, tile.y);
  const atkRange = getUnitAttackRange(state, attacker);
  if (dist > atkRange || !hasLineOfSight(state, attacker.x, attacker.y, tile.x, tile.y)) {
    return state;
  }

  const atkHouse = state.houses[attacker.houseId]!;
  const atkCounter = getCounterMultiplier(
    atkDef.unitClass,
    BANDIT_CLASS,
    houseHasDecree(atkHouse, 'decree_bodkin_volleys'),
  );
  const defCounter = getCounterMultiplier(BANDIT_CLASS, atkDef.unitClass, false);

  const atkBonus = getUnitAtkBonusSum(state, attacker, false, tile, undefined, true, false);
  const banditDefBonus = TERRAINS[tile.terrain].defBonus;
  const effAtk = atkDef.attack * (attacker.hp / attacker.maxHp) * (1 + atkBonus) * atkCounter;
  const effDef =
    BANDIT_DEFENSE * (tile.banditHp / BANDIT_MAX_HP) * (1 + banditDefBonus) * defCounter;
  const damage = computeCombatDamage(effAtk, effDef);
  const banditHpAfter = Math.max(0, tile.banditHp - damage);

  let attackerHpAfter = attacker.hp;
  if (banditHpAfter > 0 && dist === 1 && atkDef.unitClass !== 'siege') {
    const retEffAtk = BANDIT_ATTACK * (banditHpAfter / BANDIT_MAX_HP) * defCounter;
    const retDefBonus = getUnitDefBonusSum(state, attacker, undefined, false);
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
    nextUnits[attackerId] = applyUnitXp(
      {
        ...consumed,
        hp: attackerHpAfter,
        damagedSinceLastTurn: attackerHpAfter < attacker.hp ? true : consumed.damagedSinceLastTurn,
      },
      banditHpAfter <= 0 ? XP_COMBAT_KILL : XP_COMBAT_SURVIVE,
      atkHouse,
    ).unit;
  }

  if (banditHpAfter > 0) {
    let nextState: GameState = {
      ...state,
      units: nextUnits,
      tiles: { ...state.tiles, [tileKey]: { ...tile, banditHp: banditHpAfter } },
    };
    if (attackerHpAfter <= 0) {
      if (attacker.isCommander) {
        const cmd = nextState.commanders[attacker.houseId]!;
        nextState = {
          ...nextState,
          commanders: {
            ...nextState.commanders,
            [attacker.houseId]: { ...cmd, unitId: null, woundedTurnsRemaining: COMMANDER_WOUNDED_TURNS },
          },
        };
      }
      nextState = autoRehomeOrphans(nextState, attacker.houseId);
      nextState = recomputeHouseFog(nextState, attacker.houseId);
    }
    return nextState;
  }

  const bountyMult = attacker.houseId === 'corvus' ? CORVUS_PLUNDER_MULTIPLIER : 1;
  const coinReward = OUTLAW_CAMP_BOUNTY_COIN * bountyMult;
  const hasSalvage = houseHasDecree(atkHouse, 'decree_salvage_crews');
  const salvageMat = hasSalvage ? SALVAGE_CREWS_MAT_REWARD : 0;
  const ironReward = OUTLAW_CAMP_BOUNTY_IRON + (hasSalvage ? SALVAGE_CREWS_CAMP_IRON : 0);

  let updatedHouse = addLifetimeCoin(atkHouse, coinReward);
  updatedHouse = {
    ...updatedHouse,
    resources: {
      ...updatedHouse.resources,
      materials: updatedHouse.resources.materials + salvageMat,
      iron: updatedHouse.resources.iron + ironReward,
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
    nextUnits[attackerId] = { ...nextUnits[attackerId]!, tileKey, x: tile.x, y: tile.y };
  }

  let nextState: GameState = {
    ...state,
    units: nextUnits,
    tiles: {
      ...state.tiles,
      [tileKey]: { ...tile, landmarkCleared: true, banditHp: null },
    },
    houses: { ...state.houses, [attacker.houseId]: updatedHouse },
  };

  if (attacker.isCommander || isAdjacentToFriendlyCommander(state, attacker)) {
    nextState = grantCommanderXp(nextState, attacker.houseId, 2);
  }
  nextState = recomputeHouseFog(nextState, attacker.houseId);
  nextState = appendChronicle(nextState, {
    type: 'camp_cleared',
    actorHouseId: attacker.houseId,
    targetHouseId: null,
    tileKey,
    summary: `House ${attacker.houseId} cleared an Outlaw Camp (+${coinReward} Coin, +${ironReward} Iron).`,
    isPublic: false,
  });

  return nextState;
}


/**
 * Raze an unmanned enemy Palisade, Stone Wall, Watchtower, Bastion, or Stone Bridge.
 * Non-siege deals 50% damage and takes 2 spike damage in melee vs Palisades/Stone Walls.
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
    tile.improvement === null ||
    !IMPROVEMENTS[tile.improvement].isFortification ||
    tile.fortificationHp === null ||
    tile.fortificationHp <= 0
  ) {
    return state;
  }
  if (getUnitAt(state, tileKey) !== null) return state;

  const atkDef = UNITS[attacker.typeId];
  if (atkDef.requiresDeploy && !attacker.isDeployed) return state;

  const dist = chebyshevDist(attacker.x, attacker.y, tile.x, tile.y);
  const atkRange = getUnitAttackRange(state, attacker);
  if (dist > atkRange || !hasLineOfSight(state, attacker.x, attacker.y, tile.x, tile.y)) {
    return state;
  }

  const baseAtk = getStructureBaseAttack(state, attacker);
  const atkBonus = getUnitAtkBonusSum(state, attacker, false, tile, tile.ownerHouseId, true, true);
  const effAtk = baseAtk * (attacker.hp / attacker.maxHp) * (1 + atkBonus);
  const effDef = FORTIFICATION_DEFENSE + (tile.improvementLevel === 2 ? 2 : 0);

  let damage = computeCombatDamage(effAtk, effDef);
  if (atkDef.unitClass !== 'siege') {
    damage = Math.max(1, Math.round(damage * NON_SIEGE_STRUCTURE_DAMAGE_MULT));
  }

  const fortHpAfter = Math.max(0, tile.fortificationHp - damage);
  const razed = fortHpAfter <= 0;

  let attackerHpAfter = attacker.hp;
  if (
    tile.improvement === 'palisade' &&
    dist === 1 &&
    atkDef.unitClass !== 'siege'
  ) {
    attackerHpAfter = Math.max(1, attacker.hp - WALL_MELEE_SPIKE_DAMAGE);
  }

  const nextHouses = { ...state.houses };
  if (razed) {
    const atkHouse = nextHouses[attacker.houseId]!;
    nextHouses[attacker.houseId] = {
      ...atkHouse,
      writProgress: {
        ...atkHouse.writProgress,
        writ_raze: (atkHouse.writProgress.writ_raze ?? 0) + 1,
      },
    };
  }

  const consumed = consumeUnitAttack(attacker);
  const nextTile: TileState = razed
    ? {
        ...tile,
        improvement: null,
        improvementLevel: 1,
        fortificationHp: null,
        // Border-projected Watchtower tile reverts to neutral once razed
        ownerHouseId: tile.keepId === null && tile.outpostId === null ? null : tile.ownerHouseId,
      }
    : { ...tile, fortificationHp: fortHpAfter };

  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [attackerId]: {
        ...consumed,
        hp: attackerHpAfter,
        damagedSinceLastTurn: attackerHpAfter < attacker.hp ? true : consumed.damagedSinceLastTurn,
      },
    },
    tiles: { ...state.tiles, [tileKey]: nextTile },
    houses: nextHouses,
  };

  if (razed) {
    nextState = recomputeHouseFog(nextState, tile.ownerHouseId);
    nextState = appendChronicle(nextState, {
      type: 'raze',
      actorHouseId: attacker.houseId,
      targetHouseId: tile.ownerHouseId,
      tileKey,
      summary: `House ${attacker.houseId} razed an enemy ${IMPROVEMENTS[tile.improvement].name}.`,
      isPublic: false,
    });
  }

  return nextState;
}


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
  const house = state.houses[unit.houseId]!;

  const corvusMult = unit.houseId === 'corvus' ? CORVUS_PLUNDER_MULTIPLIER : 1;
  const sovMult = houseHasDecree(house, 'decree_iron_sovereign') ? 2 : 1;
  const levelBonus = tile.improvementLevel === 2 ? 2 : 1;

  const matGain = Math.floor(impDef.matCost * PILLAGE_MAT_RATIO) * corvusMult * levelBonus;
  const coinGain = PILLAGE_BASE_COIN * corvusMult * sovMult * levelBonus;
  const ironGain = impDef.ironCost > 0 ? Math.max(1, Math.floor(impDef.ironCost * 0.5)) : 0;

  let updatedHouse = addLifetimeCoin(house, coinGain);
  updatedHouse = {
    ...updatedHouse,
    resources: {
      ...updatedHouse.resources,
      materials: updatedHouse.resources.materials + matGain,
      iron: updatedHouse.resources.iron + ironGain,
    },
  };

  let unitAfter = consumeUnitAttack(unit);
  // Corvus Raider's Horn heals pillaging unit +6 HP
  if (unit.houseId === 'corvus' && unit.commanderBuffUntilTurn >= state.turnNumber) {
    unitAfter = { ...unitAfter, hp: Math.min(unitAfter.maxHp, unitAfter.hp + RAIDERS_HORN_PILLAGE_HEAL) };
  }

  let nextState: GameState = {
    ...state,
    units: { ...state.units, [unitId]: unitAfter },
    tiles: {
      ...state.tiles,
      [tile.key]: { ...tile, improvement: null, improvementLevel: 1 },
    },
    houses: { ...state.houses, [unit.houseId]: updatedHouse },
  };

  if (tile.improvement === 'signal_bastion') {
    nextState = recomputeHouseFog(nextState, ownerHouseId);
  }

  nextState = appendChronicle(nextState, {
    type: 'pillage',
    actorHouseId: unit.houseId,
    targetHouseId: ownerHouseId,
    tileKey: tile.key,
    summary: `House ${unit.houseId} pillaged ${impDef.name} (+${matGain} Mat, +${coinGain} Coin${ironGain > 0 ? `, +${ironGain} Iron` : ''}).`,
    isPublic: false,
  });

  return nextState;
}

export const activateCommanderSkill = useCommanderSkill;


