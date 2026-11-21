/**
 * Marchlands (Spec v2.0) — Tactical AI Layer (Lightweight Beam Search + Class Tactics + Commanders)
 *
 * Operates on a stripped-down TacticalSimState (zero full GameState cloning),
 * caches reachable BFS tiles per unit, enforces the 2,000 combat resolution budget,
 * top-K candidate pruning, difficulty-scaled beam width, threat avoidance,
 * Lord-Commander active skills, Tier-3 Arrow Slits volleys, Trebuchet Deploy,
 * Ranged Overwatch, Phalanx Fortify, Paid Field Reinforce, and Outpost founding.
 */

import type {
  CoordKey,
  GameState,
  HouseId,
  KeepSpecialization,
  UnitId,
} from '../../types/game.ts';
import {
  AI_ALLY_FOLLOWUP_BONUS,
  AI_COMBAT_RESOLUTION_BUDGET,
  AI_DIFFICULTY_CONFIG,
  AI_FOCUS_FIRE_WOUNDED_BONUS,
  AI_PERSONALITIES,
  AI_SAME_TURN_FOCUS_BONUS,
  AI_SIM_FOCUS_FIRE_BONUS,
  AI_SIM_FOCUS_KILL_BONUS,
  AI_TACTICAL_MAX_DEPTH,
  BANDIT_ATTACK,
  BANDIT_CLASS,
  BANDIT_DEFENSE,
  BANDIT_MAX_HP,
  FORTIFICATION_DEFENSE,
  HIGH_SEAT_ATTACK,
  HIGH_SEAT_DEF_BONUS,
  HIGH_SEAT_DEFENSE,
  HIGH_SEAT_MAX_HP,
  HOUSES,
  IMPROVEMENTS,
  KEEP_DEF_BONUS,
  KEEP_GARRISON_DEFENSE,
  KEEP_TIER1_ATTACK,
  KEEP_TIER2_ATTACK,
  KEEP_TIER3_ATTACK,
  NON_SIEGE_STRUCTURE_DAMAGE_MULT,
  OUTPOST_DEF_BONUS,
  OUTPOST_DEFENSE,
  OUTPOST_MAX_HP,
  STANDING_CORPS_ATK_BONUS,
  STANDING_CORPS_DEF_BONUS,
  TERRAINS,
  UNITS,
  VILLAGE_ATTACK,
  VILLAGE_DEF_BONUS,
  VILLAGE_DEFENSE,
  VILLAGE_MAX_HP,
  WALL_MELEE_SPIKE_DAMAGE,
} from '../../data/index.ts';
import { chebyshevDist, coordKey, getNeighbors } from '../coords.ts';
import {
  activateCommanderSkill,
  activateOverwatch,
  applyOneShotProtection,
  attackHighSeat,
  attackKeep,
  attackOutlawCamp,
  attackOutpost,
  attackUnit,
  attackVillage,
  canActivateOverwatch,
  canDeployTrebuchet,
  canFireKeepGarrisonVolley,
  canPillageTile,
  canUseCommanderSkill,
  computeCombatDamage,
  deployTrebuchet,
  fireKeepGarrisonVolley,
  getCounterMultiplier,
  getTileTerrainOrFortDefBonus,
  getUnitRank,
  hasLineOfSight,
  pillageTile,
  previewUnitCombat,
  razeFortification,
} from '../combat.ts';
import {
  buildOutpost,
  canBuildOutpost,
  canFortifyUnit,
  canReinforceUnit,
  fortifyUnit,
  reinforceUnit,
} from '../economy.ts';
import { getReachableTiles, moveUnit } from '../movement.ts';
import { mulberry32At } from '../prng.ts';
import {
  getCommanderUnit,
  getHouseKeeps,
  getHouseUnits,
  getKeepAt,
  houseHasDecree,
} from '../stateHelpers.ts';
import { getUnitClassThreat, type InfluenceMaps } from './influence.ts';
import { assignExpandObjectives, isMusterReady } from './strategic.ts';

interface SimUnit {
  id: string;
  houseId: HouseId;
  typeId: UnitId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  rank: 0 | 1 | 2;
  hasMoved: boolean;
  hasAttacked: boolean;
  isOrphaned: boolean;
  isMutinied: boolean;
  isDeployed: boolean;
  isOverwatch: boolean;
  isCommander: boolean;
}

interface SimKeep {
  id: string;
  ownerId: HouseId;
  x: number;
  y: number;
  tier: 1 | 2 | 3;
  keepHp: number;
  maxKeepHp: number;
  specialization: KeepSpecialization;
}

interface SimOutpost {
  id: string;
  ownerId: HouseId;
  x: number;
  y: number;
  hp: number;
}

interface SimFort {
  hp: number;
  ownerId: HouseId;
  type: 'palisade' | 'watchtower' | 'stone_bridge' | 'signal_bastion';
}

interface TacticalSimState {
  units: Record<string, SimUnit>;
  keeps: Record<string, SimKeep>;
  outposts: Record<string, SimOutpost>;
  villages: Record<CoordKey, number>;
  camps: Record<CoordKey, number>;
  highSeat: { tileKey: CoordKey; hp: number } | null;
  forts: Record<CoordKey, SimFort>;
}

type TacticalActionKind =
  | 'hold'
  | 'move'
  | 'attack_unit'
  | 'attack_keep'
  | 'attack_high_seat'
  | 'attack_outpost'
  | 'attack_village'
  | 'attack_camp'
  | 'raze'
  | 'pillage'
  | 'deploy'
  | 'overwatch'
  | 'fortify';

interface PlannedUnitAction {
  readonly unitId: string;
  readonly moveTo: CoordKey | null;
  readonly kind: TacticalActionKind;
  readonly targetId: string | null;
  readonly localScore: number;
}

export interface TacticalMetrics {
  readonly combatResolutionsUsed: number;
  readonly totalKills: number;
  readonly focusFireKills: number;
  readonly attackersCount: number;
  readonly singleAttackerDiedOnRetaliation: boolean;
  readonly singleAttackerUnitId: string | null;
  readonly oneShotProtectionTriggers: number;
  readonly braceTriggers: number;
  readonly commanderSkillsUsed: number;
  readonly outpostsFounded: number;
  readonly reinforcesUsed: number;
}

export interface TacticalResult {
  readonly state: GameState;
  readonly metrics: TacticalMetrics;
}

function getUnitValue(typeId: UnitId): number {
  const def = UNITS[typeId];
  if (def.unitClass === 'commander') return 36;
  return (def.matCost || 10) + def.ironCost * 4 + 3 * def.coinUpkeep;
}

function buildSimState(
  state: GameState,
  houseId: HouseId,
  influence: InfluenceMaps,
): TacticalSimState {
  const fog = state.fog[houseId] ?? {};
  const units: Record<string, SimUnit> = {};

  for (const u of getHouseUnits(state, houseId)) {
    units[u.id] = {
      id: u.id,
      houseId: u.houseId,
      typeId: u.typeId,
      x: u.x,
      y: u.y,
      hp: u.hp,
      maxHp: u.maxHp,
      rank: getUnitRank(u.xp),
      hasMoved: u.hasMoved,
      hasAttacked: u.hasAttacked,
      isOrphaned: u.homeKeepId === 'orphaned',
      isMutinied: u.isMutinied,
      isDeployed: u.isDeployed,
      isOverwatch: u.isOverwatch,
      isCommander: u.isCommander,
    };
  }
  for (const eu of influence.visibleEnemyUnits) {
    units[eu.id] = {
      id: eu.id,
      houseId: eu.houseId,
      typeId: eu.typeId,
      x: eu.x,
      y: eu.y,
      hp: eu.hp,
      maxHp: eu.maxHp,
      rank: getUnitRank(eu.xp),
      hasMoved: eu.hasMoved,
      hasAttacked: eu.hasAttacked,
      isOrphaned: eu.homeKeepId === 'orphaned',
      isMutinied: eu.isMutinied,
      isDeployed: eu.isDeployed,
      isOverwatch: eu.isOverwatch,
      isCommander: eu.isCommander,
    };
  }

  const keeps: Record<string, SimKeep> = {};
  for (const k of Object.values(state.keeps)) {
    if (k.ownerHouseId === houseId || (fog[k.tileKey] ?? 'unexplored') !== 'unexplored') {
      keeps[k.id] = {
        id: k.id,
        ownerId: k.ownerHouseId,
        x: k.x,
        y: k.y,
        tier: k.tier,
        keepHp: k.keepHp,
        maxKeepHp: k.maxKeepHp,
        specialization: k.specialization,
      };
    }
  }

  const outposts: Record<string, SimOutpost> = {};
  for (const o of Object.values(state.outposts)) {
    if (o.ownerHouseId === houseId || (fog[o.tileKey] ?? 'unexplored') !== 'unexplored') {
      outposts[o.id] = {
        id: o.id,
        ownerId: o.ownerHouseId,
        x: o.x,
        y: o.y,
        hp: o.hp,
      };
    }
  }

  const villages: Record<CoordKey, number> = {};
  const camps: Record<CoordKey, number> = {};
  const forts: Record<CoordKey, SimFort> = {};
  let highSeat: { tileKey: CoordKey; hp: number } | null = null;

  for (const t of Object.values(state.tiles)) {
    if ((fog[t.key] ?? 'unexplored') === 'unexplored') continue;
    if (t.landmark === 'high_seat' && t.highSeatHp !== null && t.highSeatHp > 0) {
      highSeat = { tileKey: t.key, hp: t.highSeatHp };
    } else if (t.landmark === 'frontier_village' && t.villageHp !== null && t.villageHp > 0) {
      villages[t.key] = t.villageHp;
    } else if (t.landmark === 'outlaw_camp' && t.banditHp !== null && t.banditHp > 0) {
      camps[t.key] = t.banditHp;
    }
    if (
      t.ownerHouseId !== null &&
      t.ownerHouseId !== houseId &&
      (t.improvement === 'palisade' ||
        t.improvement === 'watchtower' ||
        t.improvement === 'stone_bridge' ||
        t.improvement === 'signal_bastion') &&
      t.fortificationHp !== null &&
      t.fortificationHp > 0
    ) {
      forts[t.key] = {
        hp: t.fortificationHp,
        ownerId: t.ownerHouseId,
        type: t.improvement,
      };
    }
  }

  return { units, keeps, outposts, villages, camps, highSeat, forts };
}

/**
 * Minimal structural-sharing clone for a single tactical beam action (100% deterministic,
 * avoids cloning untouched Keeps/Outposts/Forts/Units on every beam branch).
 */
function cloneSimStateForAction(
  sim: TacticalSimState,
  action: PlannedUnitAction,
): TacticalSimState {
  const srcUnit = sim.units[action.unitId];
  const nextUnits: Record<string, SimUnit> = { ...sim.units };
  if (srcUnit) nextUnits[action.unitId] = { ...srcUnit };

  if (action.kind === 'attack_unit' && action.targetId && sim.units[action.targetId]) {
    nextUnits[action.targetId] = { ...sim.units[action.targetId]! };
    return { ...sim, units: nextUnits };
  }
  if (action.kind === 'attack_keep' && action.targetId && sim.keeps[action.targetId]) {
    return {
      ...sim,
      units: nextUnits,
      keeps: { ...sim.keeps, [action.targetId]: { ...sim.keeps[action.targetId]! } },
    };
  }
  if (action.kind === 'attack_outpost' && action.targetId && sim.outposts[action.targetId]) {
    return {
      ...sim,
      units: nextUnits,
      outposts: { ...sim.outposts, [action.targetId]: { ...sim.outposts[action.targetId]! } },
    };
  }
  if (action.kind === 'attack_village' && action.targetId) {
    return { ...sim, units: nextUnits, villages: { ...sim.villages } };
  }
  if (action.kind === 'attack_camp' && action.targetId) {
    return { ...sim, units: nextUnits, camps: { ...sim.camps } };
  }
  if (action.kind === 'attack_high_seat' && sim.highSeat) {
    return { ...sim, units: nextUnits, highSeat: { ...sim.highSeat } };
  }
  if (action.kind === 'raze' && action.targetId && sim.forts[action.targetId]) {
    return {
      ...sim,
      units: nextUnits,
      forts: { ...sim.forts, [action.targetId]: { ...sim.forts[action.targetId]! } },
    };
  }
  return { ...sim, units: nextUnits };
}

function getSimUnitRange(state: GameState, u: SimUnit): number {
  const real = state.units[u.id];
  const def = UNITS[u.typeId];
  const tile = state.tiles[coordKey(u.x, u.y)];
  let range = def.range;
  if (def.unitClass === 'ranged') {
    if (tile?.terrain === 'hills') range += TERRAINS.hills.rangedBonusRange;
    if (
      tile?.ownerHouseId === u.houseId &&
      (tile.improvement === 'watchtower' || tile.improvement === 'signal_bastion')
    ) {
      range += 1;
    }
    if (real && real.overwatchRangeBonusUntilTurn !== null && state.turnNumber <= real.overwatchRangeBonusUntilTurn) {
      range += 1;
    }
  }
  return range;
}

/**
 * Heuristic unit priority order for beam search:
 * Ranged -> Melee -> Cavalry -> Commander -> Siege.
 * Placing Siege LAST allows Ranged/Melee/Cavalry to clear defenders standing ON an enemy Keep
 * first, so Rams/Trebuchets/Sappers can immediately smash the exposed Keep on the same turn!
 */
function getUnitOrderPriority(u: SimUnit): number {
  const cls = UNITS[u.typeId].unitClass;
  if (cls === 'ranged') return 0;
  if (cls === 'infantry' || cls === 'spearman') return 1;
  if (cls === 'cavalry') return 2;
  if (cls === 'commander') return 3;
  return 4; // siege
}

function applySimAction(
  baseState: GameState,
  sim: TacticalSimState,
  houseId: HouseId,
  action: PlannedUnitAction,
  budget: { used: number },
): number {
  const u = sim.units[action.unitId];
  if (!u || u.hp <= 0) return 0;

  // Move
  if (action.moveTo !== null) {
    const destTile = baseState.tiles[action.moveTo];
    if (destTile) {
      const occupied = Object.values(sim.units).some(
        (other) => other.id !== u.id && other.hp > 0 && other.x === destTile.x && other.y === destTile.y,
      );
      if (!occupied) {
        u.x = destTile.x;
        u.y = destTile.y;
        u.hasMoved = true;
        u.isDeployed = false;
        u.isOverwatch = false;
      }
    }
  }

  if (action.kind === 'hold' || action.kind === 'move') {
    return 0;
  }

  if (action.kind === 'deploy') {
    u.isDeployed = true;
    u.hasAttacked = true;
    return 24;
  }
  if (action.kind === 'overwatch') {
    u.isOverwatch = true;
    u.hasAttacked = true;
    return 14;
  }
  if (action.kind === 'fortify') {
    u.hasAttacked = true;
    return UNITS[u.typeId].unitClass === 'spearman' ? 12 : 8;
  }

  if (action.targetId === null) return 0;

  const atkDef = UNITS[u.typeId];
  const atkHouse = baseState.houses[houseId]!;
  const hasStanding = houseHasDecree(atkHouse, 'decree_standing_corps');
  const hasBodkin = houseHasDecree(atkHouse, 'decree_bodkin_volleys');
  const hasGrandBombard = houseHasDecree(atkHouse, 'decree_grand_bombardment');
  const personality = AI_PERSONALITIES[houseId];

  if (action.kind === 'attack_unit') {
    const target = sim.units[action.targetId];
    if (!target || target.hp <= 0) return 0;
    const dist = chebyshevDist(u.x, u.y, target.x, target.y);
    if (dist > getSimUnitRange(baseState, u)) return 0;

    budget.used += 1;
    const defDef = UNITS[target.typeId];
    const defHouse = baseState.houses[target.houseId]!;
    const atkCounter = getCounterMultiplier(atkDef.unitClass, defDef.unitClass, hasBodkin);
    const defCounter = getCounterMultiplier(
      defDef.unitClass,
      atkDef.unitClass,
      houseHasDecree(defHouse, 'decree_bodkin_volleys'),
    );

    const atkBonus =
      (hasStanding && u.rank >= 1 ? STANDING_CORPS_ATK_BONUS : 0) +
      (u.isOrphaned ? -0.25 : 0) +
      (u.isMutinied ? -0.25 : 0);
    const defTile = baseState.tiles[coordKey(target.x, target.y)]!;
    const defStanding = houseHasDecree(defHouse, 'decree_standing_corps') && target.rank >= 1
      ? STANDING_CORPS_DEF_BONUS
      : 0;
    const defBonus =
      getTileTerrainOrFortDefBonus(baseState, defTile, target.houseId) +
      defStanding +
      (target.isOrphaned ? -0.25 : 0);

    const baseDefVal =
      atkDef.armorPiercingRatio > 0 && defDef.defense >= 5
        ? defDef.defense * (1 - atkDef.armorPiercingRatio)
        : defDef.defense;

    const effAtk = atkDef.attack * (u.hp / u.maxHp) * (1 + atkBonus) * atkCounter;
    const effDef = baseDefVal * (target.hp / target.maxHp) * (1 + defBonus) * defCounter;
    const rawDmg = computeCombatDamage(effAtk, effDef);
    const dmgRes = applyOneShotProtection(rawDmg, target.hp, target.maxHp, atkDef.range, atkCounter);
    const prevTargetHp = target.hp;
    target.hp = Math.max(0, target.hp - dmgRes.damage);
    u.hasAttacked = true;

    let retDmg = 0;
    if (target.hp > 0 && defDef.range === 1 && dist === 1 && atkDef.unitClass !== 'siege') {
      const isBrace = defDef.unitClass === 'spearman' && atkDef.unitClass === 'cavalry';
      const retRatio = isBrace ? prevTargetHp / target.maxHp : target.hp / target.maxHp;
      const retEffAtk = defDef.attack * retRatio * defCounter;
      const atkTile = baseState.tiles[coordKey(u.x, u.y)]!;
      const atkDefBonus = getTileTerrainOrFortDefBonus(baseState, atkTile, houseId);
      const retEffDef = atkDef.defense * (u.hp / u.maxHp) * (1 + atkDefBonus) * atkCounter;
      const rawRet = computeCombatDamage(retEffAtk, retEffDef);
      const retRes = applyOneShotProtection(rawRet, u.hp, u.maxHp, 1, defCounter);
      retDmg = retRes.damage;
      u.hp = Math.max(0, u.hp - retDmg);
    }

    const alreadyDamagedThisTurn = prevTargetHp < (baseState.units[target.id]?.hp ?? target.maxHp);
    const targetOnEnemyKeep = Object.values(sim.keeps).some(
      (k) => k.ownerId !== houseId && k.keepHp > 0 && k.x === target.x && k.y === target.y,
    );
    const keepGarrisonBonus = targetOnEnemyKeep ? (target.hp <= 0 ? 72 : 30) : 0;
    const killBonus = target.hp <= 0 ? 3 * getUnitValue(target.typeId) : 0;
    const focusFireSynergy = alreadyDamagedThisTurn
      ? AI_SIM_FOCUS_FIRE_BONUS + (target.hp <= 0 ? AI_SIM_FOCUS_KILL_BONUS : 0)
      : 0;
    const claimantBonus = baseState.crown.claimantHouseId === target.houseId ? 24 : 0;
    const ownDeathPenalty = u.hp <= 0 ? (u.isCommander ? 120 : 3 * getUnitValue(u.typeId)) : 0;
    return (
      killBonus +
      keepGarrisonBonus +
      focusFireSynergy +
      dmgRes.damage +
      claimantBonus -
      2 * retDmg -
      ownDeathPenalty
    );
  }

  if (action.kind === 'attack_keep') {
    const keep = sim.keeps[action.targetId];
    if (!keep || keep.keepHp <= 0 || keep.ownerId === houseId) return 0;
    const dist = chebyshevDist(u.x, u.y, keep.x, keep.y);
    if (dist > getSimUnitRange(baseState, u)) return 0;

    budget.used += 1;
    let baseAtk = atkDef.structureAttack ?? atkDef.attack;
    if (hasGrandBombard && (u.typeId === 'sapper_crew' || u.typeId === 'siege_ram')) {
      baseAtk += 2;
    }
    const effAtk = baseAtk * (u.hp / u.maxHp);
    const effDef = KEEP_GARRISON_DEFENSE * (keep.keepHp / keep.maxKeepHp) * (1 + KEEP_DEF_BONUS);
    let dmg = computeCombatDamage(effAtk, effDef);
    if (atkDef.unitClass !== 'siege') {
      dmg = Math.max(1, Math.round(dmg * NON_SIEGE_STRUCTURE_DAMAGE_MULT));
    }
    keep.keepHp = Math.max(0, keep.keepHp - dmg);
    u.hasAttacked = true;

    let retDmg = 0;
    if (keep.keepHp > 0 && dist === 1 && atkDef.unitClass !== 'siege') {
      const kAtk = keep.tier === 3 ? KEEP_TIER3_ATTACK : keep.tier === 2 ? KEEP_TIER2_ATTACK : KEEP_TIER1_ATTACK;
      const retEffAtk = kAtk * (keep.keepHp / keep.maxKeepHp);
      const retEffDef = atkDef.defense * (u.hp / u.maxHp);
      retDmg = computeCombatDamage(retEffAtk, retEffDef);
      u.hp = Math.max(0, u.hp - retDmg);
    }

    const captureBonus = keep.keepHp <= 0 ? 180 : 0;
    const claimantBonus = baseState.crown.claimantHouseId === keep.ownerId ? 45 : 0;
    const ownDeathPenalty = u.hp <= 0 ? (u.isCommander ? 110 : 2.2 * getUnitValue(u.typeId)) : 0;
    return 5.5 * dmg + captureBonus + claimantBonus - 1.8 * retDmg - ownDeathPenalty;
  }

  if (action.kind === 'attack_high_seat') {
    if (!sim.highSeat || sim.highSeat.hp <= 0 || sim.highSeat.tileKey !== action.targetId) return 0;
    const tile = baseState.tiles[sim.highSeat.tileKey]!;
    const dist = chebyshevDist(u.x, u.y, tile.x, tile.y);
    if (dist > getSimUnitRange(baseState, u)) return 0;

    budget.used += 1;
    const baseAtk = atkDef.structureAttack ?? atkDef.attack;
    const effAtk = baseAtk * (u.hp / u.maxHp);
    const effDef =
      HIGH_SEAT_DEFENSE * (sim.highSeat.hp / HIGH_SEAT_MAX_HP) * (1 + HIGH_SEAT_DEF_BONUS);
    let dmg = computeCombatDamage(effAtk, effDef);
    if (atkDef.unitClass !== 'siege') {
      dmg = Math.max(1, Math.round(dmg * NON_SIEGE_STRUCTURE_DAMAGE_MULT));
    }
    sim.highSeat.hp = Math.max(0, sim.highSeat.hp - dmg);
    u.hasAttacked = true;

    let retDmg = 0;
    if (sim.highSeat.hp > 0 && dist === 1 && atkDef.unitClass !== 'siege') {
      const retEffAtk = HIGH_SEAT_ATTACK * (sim.highSeat.hp / HIGH_SEAT_MAX_HP);
      const retEffDef = atkDef.defense * (u.hp / u.maxHp);
      retDmg = computeCombatDamage(retEffAtk, retEffDef);
      u.hp = Math.max(0, u.hp - retDmg);
    }

    return 3.5 * dmg + (sim.highSeat.hp <= 0 ? 85 : 0) - 2 * retDmg;
  }

  if (action.kind === 'attack_outpost') {
    const out = sim.outposts[action.targetId];
    if (!out || out.hp <= 0 || out.ownerId === houseId) return 0;
    const dist = chebyshevDist(u.x, u.y, out.x, out.y);
    if (dist > getSimUnitRange(baseState, u)) return 0;

    budget.used += 1;
    const baseAtk = atkDef.structureAttack ?? atkDef.attack;
    const effAtk = baseAtk * (u.hp / u.maxHp);
    const effDef = OUTPOST_DEFENSE * (out.hp / OUTPOST_MAX_HP) * (1 + OUTPOST_DEF_BONUS);
    let dmg = computeCombatDamage(effAtk, effDef);
    if (atkDef.unitClass !== 'siege') {
      dmg = Math.max(1, Math.round(dmg * NON_SIEGE_STRUCTURE_DAMAGE_MULT));
    }
    out.hp = Math.max(0, out.hp - dmg);
    u.hasAttacked = true;
    return 3 * dmg + (out.hp <= 0 ? 45 : 0);
  }

  if (action.kind === 'attack_village') {
    const vHp = sim.villages[action.targetId];
    if (vHp === undefined || vHp <= 0) return 0;
    const tile = baseState.tiles[action.targetId]!;
    const dist = chebyshevDist(u.x, u.y, tile.x, tile.y);
    if (dist > getSimUnitRange(baseState, u)) return 0;

    budget.used += 1;
    const baseAtk = atkDef.structureAttack ?? atkDef.attack;
    const effAtk = baseAtk * (u.hp / u.maxHp);
    const effDef = VILLAGE_DEFENSE * (vHp / VILLAGE_MAX_HP) * (1 + VILLAGE_DEF_BONUS);
    const dmg = computeCombatDamage(effAtk, effDef);
    const after = Math.max(0, vHp - dmg);
    sim.villages[action.targetId] = after;
    u.hasAttacked = true;

    let retDmg = 0;
    if (after > 0 && dist === 1 && atkDef.unitClass !== 'siege') {
      const retEffAtk = VILLAGE_ATTACK * (after / VILLAGE_MAX_HP);
      const retEffDef = atkDef.defense * (u.hp / u.maxHp);
      retDmg = computeCombatDamage(retEffAtk, retEffDef);
      u.hp = Math.max(0, u.hp - retDmg);
    }

    return 2.5 * dmg + (after <= 0 ? 52 : 0) - 2 * retDmg;
  }

  if (action.kind === 'attack_camp') {
    const cHp = sim.camps[action.targetId];
    if (cHp === undefined || cHp <= 0) return 0;
    const tile = baseState.tiles[action.targetId]!;
    const dist = chebyshevDist(u.x, u.y, tile.x, tile.y);
    if (dist > getSimUnitRange(baseState, u)) return 0;

    budget.used += 1;
    const atkCounter = getCounterMultiplier(atkDef.unitClass, BANDIT_CLASS, hasBodkin);
    const defCounter = getCounterMultiplier(BANDIT_CLASS, atkDef.unitClass, false);
    const effAtk = atkDef.attack * (u.hp / u.maxHp) * atkCounter;
    const effDef = BANDIT_DEFENSE * (cHp / BANDIT_MAX_HP) * defCounter;
    const dmg = computeCombatDamage(effAtk, effDef);
    const after = Math.max(0, cHp - dmg);
    sim.camps[action.targetId] = after;
    u.hasAttacked = true;

    let retDmg = 0;
    if (after > 0 && dist === 1 && atkDef.unitClass !== 'siege') {
      const retEffAtk = BANDIT_ATTACK * (after / BANDIT_MAX_HP) * defCounter;
      const retEffDef = atkDef.defense * (u.hp / u.maxHp) * atkCounter;
      retDmg = computeCombatDamage(retEffAtk, retEffDef);
      u.hp = Math.max(0, u.hp - retDmg);
    }

    return (dmg + (after <= 0 ? 38 : 0)) * personality.campPriority - 2 * retDmg;
  }

  if (action.kind === 'raze') {
    const fort = sim.forts[action.targetId];
    if (!fort || fort.hp <= 0) return 0;
    budget.used += 1;
    const baseAtk = atkDef.structureAttack ?? atkDef.attack;
    let dmg = computeCombatDamage(baseAtk * (u.hp / u.maxHp), FORTIFICATION_DEFENSE);
    if (atkDef.unitClass !== 'siege') {
      dmg = Math.max(1, Math.round(dmg * NON_SIEGE_STRUCTURE_DAMAGE_MULT));
    }
    fort.hp = Math.max(0, fort.hp - dmg);
    u.hasAttacked = true;
    const spikeDmg =
      fort.type === 'palisade' && atkDef.unitClass !== 'siege' && atkDef.range === 1
        ? WALL_MELEE_SPIKE_DAMAGE
        : 0;
    if (spikeDmg > 0) u.hp = Math.max(0, u.hp - spikeDmg);
    return dmg * 1.6 + (fort.hp <= 0 ? 20 : 0) - 2 * spikeDmg;
  }

  if (action.kind === 'pillage') {
    const tile = baseState.tiles[coordKey(u.x, u.y)];
    if (!tile || tile.improvement === null) return 0;
    u.hasAttacked = true;
    return (IMPROVEMENTS[tile.improvement].matCost + 6) * personality.pillagePriority;
  }

  return 0;
}

function generateUnitCandidates(
  state: GameState,
  sim: TacticalSimState,
  houseId: HouseId,
  unitId: string,
  reachableKeys: readonly CoordKey[],
  influence: InfluenceMaps,
  goalTileKey: CoordKey | null,
  ignoreThreat: boolean,
  candidateCap: number,
): PlannedUnitAction[] {
  const realUnit = state.units[unitId];
  const simUnit = sim.units[unitId];
  if (!realUnit || !simUnit || simUnit.hp <= 0) return [];

  const unitDef = UNITS[simUnit.typeId];
  const personality = AI_PERSONALITIES[houseId];
  const plan = state.houses[houseId]?.aiPlan;
  const targetKeep = plan?.targetKeepId ? sim.keeps[plan.targetKeepId] : null;
  const goalTile = goalTileKey ? state.tiles[goalTileKey] : null;

  // Build O(1) occupied tile lookup & split enemy/ally lists once per call
  const simOccupied = new Set<CoordKey>();
  const simEnemies: SimUnit[] = [];
  const simAllies: SimUnit[] = [];
  let commanderSim: SimUnit | null = null;
  for (const o of Object.values(sim.units)) {
    if (o.hp <= 0) continue;
    if (o.id !== unitId) simOccupied.add(coordKey(o.x, o.y));
    if (o.houseId !== houseId) {
      simEnemies.push(o);
    } else if (o.id !== unitId) {
      simAllies.push(o);
      if (o.isCommander) commanderSim = o;
    }
  }
  const simEnemyKeeps = Object.values(sim.keeps).filter((k) => k.ownerId !== houseId && k.keepHp > 0);
  const simEnemyOutposts = Object.values(sim.outposts).filter(
    (o) => o.ownerId !== houseId && o.hp > 0,
  );

  const curKey = coordKey(simUnit.x, simUnit.y);
  const positions: Array<{ key: CoordKey; isMove: boolean }> = [{ key: curKey, isMove: false }];
  for (const k of reachableKeys) {
    if (!simOccupied.has(k)) {
      positions.push({ key: k, isMove: true });
    }
  }

  const standingOnFriendlyKeep =
    getKeepAt(state, curKey)?.ownerHouseId === houseId &&
    !simEnemies.some((eu) => chebyshevDist(eu.x, eu.y, simUnit.x, simUnit.y) <= 2);

  const candidates: PlannedUnitAction[] = [];

  for (const pos of positions) {
    const posTile = state.tiles[pos.key]!;
    const threat = ignoreThreat
      ? 0
      : getUnitClassThreat(influence.threatMap[pos.key], unitDef.unitClass);

    const isAttackPosture = plan?.posture === 'attack';
    const inAssaultZone =
      isAttackPosture &&
      targetKeep !== null &&
      chebyshevDist(posTile.x, posTile.y, targetKeep.x, targetKeep.y) <= Math.max(4, unitDef.range + 1);

    // Protect Lord-Commander strictly from lethal tiles; allow besiegers into assault zone
    const lethalThreshold = simUnit.isCommander ? Math.ceil(simUnit.hp * 0.72) : simUnit.hp;
    if (!ignoreThreat && threat >= lethalThreshold && !inAssaultZone && pos.isMove) {
      continue;
    }

    const threatWeight = simUnit.isCommander ? 2.4 : isAttackPosture ? 0.65 : 1.35;
    const threatPenalty =
      threatWeight * personality.riskAversion * (threat / Math.max(1, simUnit.hp)) * 12;

    let posScore = -threatPenalty;
    if (goalTile) {
      const prevDist = chebyshevDist(simUnit.x, simUnit.y, goalTile.x, goalTile.y);
      const nextDist = chebyshevDist(posTile.x, posTile.y, goalTile.x, goalTile.y);
      const approachWeight = isAttackPosture
        ? unitDef.unitClass === 'siege'
          ? 12
          : 9
        : 6;
      posScore += (prevDist - nextDist) * approachWeight;
    }

    // Encourage stepping off friendly Keep center so Keep can train new units!
    if (standingOnFriendlyKeep && pos.isMove) {
      posScore += 18;
    } else if (!standingOnFriendlyKeep && pos.isMove && getKeepAt(state, pos.key)?.ownerHouseId === houseId) {
      posScore -= 10;
    }

    // Lord-Commander aura cohesion: stay adjacent to allies
    if (simUnit.isCommander) {
      const adjAllies = simAllies.filter(
        (a) => chebyshevDist(posTile.x, posTile.y, a.x, a.y) <= 1,
      ).length;
      posScore += Math.min(3, adjAllies) * 5;
    } else if (commanderSim && chebyshevDist(posTile.x, posTile.y, commanderSim.x, commanderSim.y) <= 1) {
      posScore += 3;
    }

    // Landmark arrival bonuses
    if (posTile.landmark === 'relic_ruin' && !posTile.landmarkCleared) {
      posScore += 28 * personality.ruinPriority;
    } else if (
      posTile.landmark === 'ancient_watchtower' &&
      !posTile.revealedByHouseIds.includes(houseId)
    ) {
      posScore += 24 * personality.watchtowerPriority;
    }

    // Terrain cover bonus for ranged / ranged-siege (Trebuchet) staying off melee edge
    if (unitDef.range >= 2) {
      const adjEnemy = simEnemies.some(
        (eu) => chebyshevDist(posTile.x, posTile.y, eu.x, eu.y) === 1,
      );
      if (adjEnemy) posScore -= 12;
      if (
        unitDef.unitClass === 'ranged' &&
        (posTile.terrain === 'hills' ||
          (posTile.ownerHouseId === houseId &&
            (posTile.improvement === 'watchtower' || posTile.improvement === 'signal_bastion')))
      ) {
        posScore += 5;
      }
    }

    // Hold / Move-only candidate
    candidates.push({
      unitId,
      moveTo: pos.isMove ? pos.key : null,
      kind: pos.isMove ? 'move' : 'hold',
      targetId: null,
      localScore: posScore,
    });

    if (simUnit.hasAttacked) continue;

    // Trebuchet requires Deploy before firing!
    if (unitDef.requiresDeploy) {
      const isCurrentlyDeployed = simUnit.isDeployed && !pos.isMove;
      if (!isCurrentlyDeployed) {
        // Check if deploying here puts an enemy Keep, Outpost, High Seat, Fort, or unit within range 3
        const hasRange3Target =
          simEnemyKeeps.some((ek) => chebyshevDist(posTile.x, posTile.y, ek.x, ek.y) <= unitDef.range) ||
          simEnemyOutposts.some((eo) => chebyshevDist(posTile.x, posTile.y, eo.x, eo.y) <= unitDef.range) ||
          (sim.highSeat !== null &&
            sim.highSeat.hp > 0 &&
            chebyshevDist(
              posTile.x,
              posTile.y,
              state.tiles[sim.highSeat.tileKey]!.x,
              state.tiles[sim.highSeat.tileKey]!.y,
            ) <= unitDef.range) ||
          simEnemies.some((eu) => chebyshevDist(posTile.x, posTile.y, eu.x, eu.y) <= unitDef.range);
        if (hasRange3Target) {
          candidates.push({
            unitId,
            moveTo: pos.isMove ? pos.key : null,
            kind: 'deploy',
            targetId: null,
            localScore: posScore + 34,
          });
        }
        continue; // Cannot attack while undeployed
      }
    }

    let effRange = unitDef.range;
    if (unitDef.unitClass === 'ranged') {
      if (posTile.terrain === 'hills') effRange += TERRAINS.hills.rangedBonusRange;
      if (
        posTile.ownerHouseId === houseId &&
        (posTile.improvement === 'watchtower' || posTile.improvement === 'signal_bastion')
      ) {
        effRange += 1;
      }
      if (
        realUnit.overwatchRangeBonusUntilTurn !== null &&
        state.turnNumber <= realUnit.overwatchRangeBonusUntilTurn
      ) {
        effRange += 1;
      }
    }

    // Class defensive stance actions when holding/moving near enemies
    if (unitDef.unitClass === 'ranged' && !pos.isMove && canActivateOverwatch(state, unitId)) {
      const enemyApproaching = simEnemies.some(
        (eu) => chebyshevDist(posTile.x, posTile.y, eu.x, eu.y) <= effRange + 2,
      );
      if (enemyApproaching) {
        candidates.push({
          unitId,
          moveTo: null,
          kind: 'overwatch',
          targetId: null,
          localScore: posScore + 15,
        });
      }
    } else if (
      (unitDef.unitClass === 'spearman' || unitDef.unitClass === 'infantry') &&
      !pos.isMove &&
      canFortifyUnit(state, unitId) &&
      threat > 0
    ) {
      candidates.push({
        unitId,
        moveTo: null,
        kind: 'fortify',
        targetId: null,
        localScore: posScore + (unitDef.unitClass === 'spearman' ? 14 : 9),
      });
    }

    // Attack visible enemy units
    for (const eu of simEnemies) {
      const dist = chebyshevDist(posTile.x, posTile.y, eu.x, eu.y);
      if (dist > effRange || !hasLineOfSight(state, posTile.x, posTile.y, eu.x, eu.y)) continue;
      const woundedBonus = (1 - eu.hp / eu.maxHp) * AI_FOCUS_FIRE_WOUNDED_BONUS;
      const damagedThisTurn = eu.hp < (state.units[eu.id]?.hp ?? eu.maxHp);
      const focusBonus = damagedThisTurn ? AI_SAME_TURN_FOCUS_BONUS : 0;
      const hasAllyFollowUp =
        !damagedThisTurn &&
        simAllies.some(
          (ally) =>
            !ally.hasAttacked &&
            chebyshevDist(ally.x, ally.y, eu.x, eu.y) <=
              UNITS[ally.typeId].range + (ally.hasMoved ? 0 : UNITS[ally.typeId].movement),
        );
      const allyBonus = hasAllyFollowUp ? AI_ALLY_FOLLOWUP_BONUS : 0;
      const claimantBonus = state.crown.claimantHouseId === eu.houseId ? 24 : 0;
      const counterMult = getCounterMultiplier(unitDef.unitClass, UNITS[eu.typeId].unitClass, false);
      const cmdTargetBonus = eu.isCommander ? 16 : 0;
      const onEnemyKeepBonus = simEnemyKeeps.some((ek) => ek.x === eu.x && ek.y === eu.y) ? 38 : 0;
      const est =
        posScore +
        18 * counterMult +
        woundedBonus +
        focusBonus +
        allyBonus +
        claimantBonus +
        cmdTargetBonus +
        onEnemyKeepBonus;
      candidates.push({
        unitId,
        moveTo: pos.isMove ? pos.key : null,
        kind: 'attack_unit',
        targetId: eu.id,
        localScore: est,
      });
    }

    // Attack enemy Keeps (when unoccupied by enemy unit)
    for (const ek of simEnemyKeeps) {
      const dist = chebyshevDist(posTile.x, posTile.y, ek.x, ek.y);
      if (dist > effRange || !hasLineOfSight(state, posTile.x, posTile.y, ek.x, ek.y)) continue;
      if (simEnemies.some((eu) => eu.x === ek.x && eu.y === ek.y)) continue;
      const siegeBonus = unitDef.unitClass === 'siege' ? 82 : 0;
      const finishBonus = ek.keepHp <= 30 ? 44 : 0;
      const claimantBonus = state.crown.claimantHouseId === ek.ownerId ? 54 : 0;
      candidates.push({
        unitId,
        moveTo: pos.isMove ? pos.key : null,
        kind: 'attack_keep',
        targetId: ek.id,
        localScore: posScore + 52 + siegeBonus + finishBonus + claimantBonus,
      });
    }

    // Attack Central Ruined High Seat
    if (sim.highSeat && sim.highSeat.hp > 0) {
      const hst = state.tiles[sim.highSeat.tileKey]!;
      const dist = chebyshevDist(posTile.x, posTile.y, hst.x, hst.y);
      if (dist <= effRange && hasLineOfSight(state, posTile.x, posTile.y, hst.x, hst.y)) {
        candidates.push({
          unitId,
          moveTo: pos.isMove ? pos.key : null,
          kind: 'attack_high_seat',
          targetId: sim.highSeat.tileKey,
          localScore: posScore + 30 + (unitDef.unitClass === 'siege' ? 30 : 0),
        });
      }
    }

    // Attack enemy Frontier Outposts
    for (const eo of simEnemyOutposts) {
      const dist = chebyshevDist(posTile.x, posTile.y, eo.x, eo.y);
      if (dist > effRange || !hasLineOfSight(state, posTile.x, posTile.y, eo.x, eo.y)) continue;
      if (simEnemies.some((eu) => eu.x === eo.x && eu.y === eo.y)) continue;
      candidates.push({
        unitId,
        moveTo: pos.isMove ? pos.key : null,
        kind: 'attack_outpost',
        targetId: eo.id,
        localScore: posScore + 26 + (unitDef.unitClass === 'siege' ? 24 : 0),
      });
    }

    // Attack Outlaw Camps
    for (const [ck, cHp] of Object.entries(sim.camps)) {
      if (cHp <= 0) continue;
      const ct = state.tiles[ck]!;
      const dist = chebyshevDist(posTile.x, posTile.y, ct.x, ct.y);
      if (dist > effRange || !hasLineOfSight(state, posTile.x, posTile.y, ct.x, ct.y)) continue;
      candidates.push({
        unitId,
        moveTo: pos.isMove ? pos.key : null,
        kind: 'attack_camp',
        targetId: ck,
        localScore: posScore + 24 * personality.campPriority,
      });
    }

    // Violent seizure of Frontier Village (when low Coin or aggressive Corvus / Iron Sovereign)
    const house = state.houses[houseId]!;
    if (
      house.resources.coin < 18 ||
      houseId === 'corvus' ||
      houseHasDecree(house, 'decree_iron_sovereign')
    ) {
      for (const [vk, vHp] of Object.entries(sim.villages)) {
        if (vHp <= 0) continue;
        const vt = state.tiles[vk]!;
        const dist = chebyshevDist(posTile.x, posTile.y, vt.x, vt.y);
        if (dist > effRange || !hasLineOfSight(state, posTile.x, posTile.y, vt.x, vt.y)) continue;
        candidates.push({
          unitId,
          moveTo: pos.isMove ? pos.key : null,
          kind: 'attack_village',
          targetId: vk,
          localScore: posScore + (houseId === 'corvus' ? 24 : 15),
        });
      }
    }

    // Raze unmanned enemy fortifications (heavily favored for Siege units & wall breaches near target Keep!)
    for (const [fk, f] of Object.entries(sim.forts)) {
      if (f.hp <= 0) continue;
      const ft = state.tiles[fk]!;
      const dist = chebyshevDist(posTile.x, posTile.y, ft.x, ft.y);
      if (dist > effRange || !hasLineOfSight(state, posTile.x, posTile.y, ft.x, ft.y)) continue;
      if (simOccupied.has(fk) || (simUnit.x === ft.x && simUnit.y === ft.y)) continue;
      const blocksSiege =
        targetKeep !== null && chebyshevDist(ft.x, ft.y, targetKeep.x, targetKeep.y) <= 3;
      const razeScore =
        unitDef.unitClass === 'siege'
          ? blocksSiege
            ? 44
            : 32
          : blocksSiege
            ? 20
            : 8;
      candidates.push({
        unitId,
        moveTo: pos.isMove ? pos.key : null,
        kind: 'raze',
        targetId: fk,
        localScore: posScore + razeScore,
      });
    }

    // Pillage enemy economic improvement
    if (
      posTile.ownerHouseId !== null &&
      posTile.ownerHouseId !== houseId &&
      posTile.improvement !== null &&
      IMPROVEMENTS[posTile.improvement].isEconomic
    ) {
      candidates.push({
        unitId,
        moveTo: pos.isMove ? pos.key : null,
        kind: 'pillage',
        targetId: pos.key,
        localScore: posScore + 18 * personality.pillagePriority,
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.localScore !== a.localScore) return b.localScore - a.localScore;
    const mA = a.moveTo ?? '';
    const mB = b.moveTo ?? '';
    if (mA !== mB) return mA.localeCompare(mB);
    return (a.targetId ?? '').localeCompare(b.targetId ?? '');
  });

  const deduped: PlannedUnitAction[] = [];
  const seenKeys = new Set<string>();
  for (const c of candidates) {
    const key =
      c.kind === 'hold' || c.kind === 'move' ? 'reposition' : `${c.kind}:${c.targetId ?? ''}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(c);
  }

  const pruned = deduped.slice(0, candidateCap);
  if (!pruned.some((c) => c.kind === 'hold' || c.kind === 'move')) {
    const bestMove = deduped.find((c) => c.kind === 'hold' || c.kind === 'move');
    if (bestMove) {
      if (pruned.length >= candidateCap) {
        pruned[pruned.length - 1] = bestMove;
      } else {
        pruned.push(bestMove);
      }
    }
  }

  return pruned;
}

/**
 * Fires Tier-3 Grand Citadel Arrow Slits volleys on visible enemies within Range 2.
 */
function fireTier3CitadelVolleys(state: GameState, houseId: HouseId): GameState {
  let cur = state;
  for (const keep of getHouseKeeps(cur, houseId)) {
    if (keep.tier < 3 || keep.garrisonVolleyUsedThisTurn) continue;
    const targets = Object.values(cur.units)
      .filter((u) => canFireKeepGarrisonVolley(cur, keep.id, u.id))
      .sort((a, b) => {
        // Prioritize low HP (killable), Commander, Siege, then id
        const scoreA = (a.isCommander ? 30 : 0) + (UNITS[a.typeId].unitClass === 'siege' ? 20 : 0) + (a.maxHp - a.hp);
        const scoreB = (b.isCommander ? 30 : 0) + (UNITS[b.typeId].unitClass === 'siege' ? 20 : 0) + (b.maxHp - b.hp);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a.id.localeCompare(b.id);
      });
    if (targets.length > 0) {
      cur = fireKeepGarrisonVolley(cur, keep.id, targets[0]!.id);
    }
  }
  return cur;
}

/**
 * Evaluates & fires the House Lord-Commander's active skill if tactically valuable.
 */
function maybeFireCommanderSkill(
  state: GameState,
  houseId: HouseId,
  influence: InfluenceMaps,
  phase: 'pre' | 'post',
): { state: GameState; used: boolean } {
  const cmdUnit = getCommanderUnit(state, houseId);
  if (!cmdUnit) return { state, used: false };
  const skillId = HOUSES[houseId].commanderSkillId;

  if (phase === 'pre') {
    if (skillId === 'beacon_mark') {
      const targets = influence.visibleEnemyUnits
        .filter((eu) => canUseCommanderSkill(state, houseId, eu.id))
        .sort((a, b) => {
          const vA = (a.isCommander ? 40 : 0) + a.hp;
          const vB = (b.isCommander ? 40 : 0) + b.hp;
          return vB !== vA ? vB - vA : a.id.localeCompare(b.id);
        });
      if (targets.length > 0) {
        return { state: activateCommanderSkill(state, houseId, targets[0]!.id), used: true };
      }
    } else if (skillId === 'wardens_volley' && canUseCommanderSkill(state, houseId)) {
      const enemyNear = influence.visibleEnemyUnits.some(
        (eu) => chebyshevDist(eu.x, eu.y, cmdUnit.x, cmdUnit.y) <= 4,
      );
      if (enemyNear) {
        return { state: activateCommanderSkill(state, houseId), used: true };
      }
    } else if (skillId === 'golden_banner' && canUseCommanderSkill(state, houseId)) {
      const house = state.houses[houseId]!;
      const woundedNearby = getHouseUnits(state, houseId).filter(
        (u) => chebyshevDist(u.x, u.y, cmdUnit.x, cmdUnit.y) <= 1 && u.hp <= u.maxHp - 5,
      );
      if (house.resources.coin >= 10 && woundedNearby.length >= 2) {
        return { state: activateCommanderSkill(state, houseId), used: true };
      }
    } else if (skillId === 'raiders_horn' && canUseCommanderSkill(state, houseId)) {
      const enemyNear = influence.visibleEnemyUnits.some(
        (eu) => chebyshevDist(eu.x, eu.y, cmdUnit.x, cmdUnit.y) <= 4,
      );
      if (enemyNear) {
        return { state: activateCommanderSkill(state, houseId), used: true };
      }
    }
  } else {
    // Post-beam: Ironhelm 'hold_the_line' fortifies adjacent allies even after acting!
    if (skillId === 'hold_the_line' && canUseCommanderSkill(state, houseId)) {
      const adjUnits = getHouseUnits(state, houseId).filter(
        (u) => chebyshevDist(u.x, u.y, cmdUnit.x, cmdUnit.y) <= 1,
      );
      const anyWounded = adjUnits.some((u) => u.hp <= u.maxHp - 4);
      const enemyNear = influence.visibleEnemyUnits.some(
        (eu) => chebyshevDist(eu.x, eu.y, cmdUnit.x, cmdUnit.y) <= 3,
      );
      if (anyWounded || (enemyNear && adjUnits.length >= 2)) {
        return { state: activateCommanderSkill(state, houseId), used: true };
      }
    }
  }

  return { state, used: false };
}

/**
 * Post-beam opportunistic unit field actions: Found Frontier Outpost & Paid Field Reinforce.
 */
function runPostBeamUnitFieldActions(
  state: GameState,
  houseId: HouseId,
): { state: GameState; outpostsFounded: number; reinforcesUsed: number } {
  let cur = state;
  let outpostsFounded = 0;
  let reinforcesUsed = 0;

  // 1. Found Frontier Outpost on/next to unowned Iron Deposits
  const unitsSorted = getHouseUnits(cur, houseId).sort((a, b) => a.id.localeCompare(b.id));
  for (const u of unitsSorted) {
    const liveU = cur.units[u.id];
    if (!liveU || liveU.hasAttacked) continue;

    // Prefer Iron deposit tile or adjacent to an Iron deposit
    const candidates: Array<{ key: CoordKey; priority: number }> = [];
    const checkKeys: CoordKey[] = [
      liveU.tileKey,
      ...getNeighbors(liveU.x, liveU.y, cur.gridSize).map((n) => coordKey(n.x, n.y)),
    ];
    for (const tk of checkKeys) {
      if (!canBuildOutpost(cur, liveU.id, tk)) continue;
      const t = cur.tiles[tk]!;
      let prio = 0;
      if (t.hasIronDeposit) prio += 30;
      else if (
        getNeighbors(t.x, t.y, cur.gridSize).some(
          (n) => cur.tiles[coordKey(n.x, n.y)]?.hasIronDeposit && cur.tiles[coordKey(n.x, n.y)]?.ownerHouseId === null,
        )
      ) {
        prio += 24;
      }
      if (prio > 0) candidates.push({ key: tk, priority: prio });
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : a.key.localeCompare(b.key)));
      const next = buildOutpost(cur, liveU.id, candidates[0]!.key);
      if (next !== cur) {
        cur = next;
        outpostsFounded += 1;
      }
    }
  }

  // 2. Paid Field Reinforce for wounded Commander or valuable veteran/heavy units
  for (const u of getHouseUnits(cur, houseId).sort((a, b) => {
    const scoreA = (a.isCommander ? 100 : 0) + getUnitValue(a.typeId) + (a.maxHp - a.hp);
    const scoreB = (b.isCommander ? 100 : 0) + getUnitValue(b.typeId) + (b.maxHp - b.hp);
    return scoreB !== scoreA ? scoreB - scoreA : a.id.localeCompare(b.id);
  })) {
    const liveU = cur.units[u.id];
    if (!liveU || !canReinforceUnit(cur, liveU.id)) continue;
    const hpRatio = liveU.hp / liveU.maxHp;
    const shouldReinforce =
      (liveU.isCommander && hpRatio <= 0.68) ||
      (getUnitRank(liveU.xp) >= 1 && hpRatio <= 0.55) ||
      (UNITS[liveU.typeId].ironCost > 0 && hpRatio <= 0.50) ||
      hpRatio <= 0.38;
    if (shouldReinforce) {
      const house = cur.houses[houseId]!;
      if (house.resources.coin >= 8) {
        const next = reinforceUnit(cur, liveU.id);
        if (next !== cur) {
          cur = next;
          reinforcesUsed += 1;
        }
      }
    }
  }

  return { state: cur, outpostsFounded, reinforcesUsed };
}

export function runTacticalLayer(
  state: GameState,
  houseId: HouseId,
  influence: InfluenceMaps,
): TacticalResult {
  let curState = fireTier3CitadelVolleys(state, houseId);
  let commanderSkillsUsed = 0;

  const preSkill = maybeFireCommanderSkill(curState, houseId, influence, 'pre');
  curState = preSkill.state;
  if (preSkill.used) commanderSkillsUsed += 1;

  const myUnits = getHouseUnits(curState, houseId).filter(
    (u) => !u.hasAttacked || u.remainingMovement > 0,
  );
  if (myUnits.length === 0) {
    const postSkill = maybeFireCommanderSkill(curState, houseId, influence, 'post');
    curState = postSkill.state;
    if (postSkill.used) commanderSkillsUsed += 1;
    return {
      state: curState,
      metrics: {
        combatResolutionsUsed: 0,
        totalKills: 0,
        focusFireKills: 0,
        attackersCount: 0,
        singleAttackerDiedOnRetaliation: false,
        singleAttackerUnitId: null,
        oneShotProtectionTriggers: 0,
        braceTriggers: 0,
        commanderSkillsUsed,
        outpostsFounded: 0,
        reinforcesUsed: 0,
      },
    };
  }

  const diffCfg = AI_DIFFICULTY_CONFIG[curState.difficulty];
  const personality = AI_PERSONALITIES[houseId];
  const plan = curState.houses[houseId]?.aiPlan;
  const musterReady = isMusterReady(curState, houseId);
  const expandGoals = assignExpandObjectives(curState, houseId);

  const myKeeps = getHouseKeeps(curState, houseId);
  const defendGoal =
    myKeeps.find((k) => k.damagedLastRound)?.tileKey ?? myKeeps[0]?.tileKey ?? null;

  const getGoalForUnit = (unitId: string): CoordKey | null => {
    if (plan?.posture === 'defend') {
      const u = curState.units[unitId]!;
      if (influence.visibleEnemyUnits.length > 0) {
        const nearest = [...influence.visibleEnemyUnits].sort(
          (a, b) => chebyshevDist(u.x, u.y, a.x, a.y) - chebyshevDist(u.x, u.y, b.x, b.y),
        )[0]!;
        return nearest.tileKey;
      }
      return defendGoal;
    }
    if (plan?.posture === 'attack' && plan.targetKeepId) {
      const tk = curState.keeps[plan.targetKeepId];
      if (tk) {
        return musterReady || !plan.rallyTileKey ? tk.tileKey : plan.rallyTileKey;
      }
    }
    return expandGoals[unitId] ?? null;
  };

  const ignoreThreat =
    diffCfg.ignoreThreatChance > 0 &&
    mulberry32At(curState.rngSeed, curState.turnNumber * 31 + curState.houseOrder.indexOf(houseId)) <
      diffCfg.ignoreThreatChance;

  const initSim = buildSimState(curState, houseId, influence);
  const targetKeepObj = plan?.targetKeepId ? curState.keeps[plan.targetKeepId] : null;
  const frontlineDistByUnitId: Record<string, number> = {};
  for (const u of myUnits) {
    let minD = targetKeepObj ? chebyshevDist(u.x, u.y, targetKeepObj.x, targetKeepObj.y) : 99;
    for (const eu of influence.visibleEnemyUnits) {
      const d = chebyshevDist(u.x, u.y, eu.x, eu.y);
      if (d < minD) minD = d;
    }
    frontlineDistByUnitId[u.id] = minD;
  }

  const orderedUnits = myUnits
    .map((u) => initSim.units[u.id]!)
    .sort((a, b) => {
      const frontA = (frontlineDistByUnitId[a.id] ?? 99) <= 5 ? 0 : 1;
      const frontB = (frontlineDistByUnitId[b.id] ?? 99) <= 5 ? 0 : 1;
      if (frontA !== frontB) return frontA - frontB;
      const pDiff = getUnitOrderPriority(a) - getUnitOrderPriority(b);
      if (pDiff !== 0) return pDiff;
      const dDiff = (frontlineDistByUnitId[a.id] ?? 99) - (frontlineDistByUnitId[b.id] ?? 99);
      return dDiff !== 0 ? dDiff : a.id.localeCompare(b.id);
    });

  // Precompute reachable keys ONCE per unit (eliminates redundant BFS across beam nodes)
  const reachableByUnitId: Record<string, readonly CoordKey[]> = {};
  for (const u of orderedUnits) {
    reachableByUnitId[u.id] = Object.keys(getReachableTiles(curState, u.id)).sort();
  }

  const budget = { used: 0 };

  interface BeamNode {
    sim: TacticalSimState;
    actions: PlannedUnitAction[];
    score: number;
  }

  let beam: BeamNode[] = [{ sim: initSim, actions: [], score: 0 }];
  const isAttackCommitment = plan?.posture === 'attack' && musterReady;

  for (let idx = 0; idx < orderedUnits.length; idx++) {
    const unit = orderedUnits[idx]!;
    const goalKey = getGoalForUnit(unit.id);
    const isFrontline = (frontlineDistByUnitId[unit.id] ?? 99) <= 5;
    const widthLimit = idx < AI_TACTICAL_MAX_DEPTH ? diffCfg.beamWidth : 1;
    const capLimit = idx < AI_TACTICAL_MAX_DEPTH || isFrontline ? diffCfg.candidateCap : 2;
    const reachableKeys = reachableByUnitId[unit.id] ?? [];

    const nextBeam: BeamNode[] = [];

    for (const node of beam) {
      if (budget.used >= AI_COMBAT_RESOLUTION_BUDGET) {
        nextBeam.push(node);
        continue;
      }

      const cands = generateUnitCandidates(
        curState,
        node.sim,
        houseId,
        unit.id,
        reachableKeys,
        influence,
        goalKey,
        ignoreThreat,
        capLimit,
      );

      if (cands.length === 0) {
        nextBeam.push(node);
        continue;
      }

      for (const act of cands) {
        if (
          budget.used >= AI_COMBAT_RESOLUTION_BUDGET &&
          act.kind !== 'hold' &&
          act.kind !== 'move'
        ) {
          continue;
        }
        const simCopy = cloneSimStateForAction(node.sim, act);
        const combatDelta = applySimAction(curState, simCopy, houseId, act, budget);

        const uAfter = simCopy.units[unit.id];
        let riskPenalty = 0;
        let progressBonus = 0;
        if (uAfter && uAfter.hp > 0) {
          const endKey = coordKey(uAfter.x, uAfter.y);
          if (!ignoreThreat) {
            const t = getUnitClassThreat(influence.threatMap[endKey], UNITS[uAfter.typeId].unitClass);
            const rWeight = uAfter.isCommander ? 2.2 : isAttackCommitment ? 0.65 : 1.35;
            riskPenalty =
              rWeight *
              personality.riskAversion *
              (t / Math.max(1, uAfter.hp)) *
              10;
          }
          if (goalKey) {
            const gt = curState.tiles[goalKey]!;
            const startU = curState.units[unit.id]!;
            const pWeight = isAttackCommitment
              ? UNITS[uAfter.typeId].unitClass === 'siege'
                ? 10
                : 8
              : 5;
            progressBonus =
              (chebyshevDist(startU.x, startU.y, gt.x, gt.y) -
                chebyshevDist(uAfter.x, uAfter.y, gt.x, gt.y)) *
              pWeight;
          }
        }

        nextBeam.push({
          sim: simCopy,
          actions: [...node.actions, act],
          score: node.score + combatDelta + progressBonus - riskPenalty,
        });
      }
    }

    nextBeam.sort((a, b) => b.score - a.score);
    beam = nextBeam.slice(0, widthLimit);
  }

  const bestPlan = beam[0]?.actions ?? [];

  // Canonical Replay through real engine reducers
  const attackersPerEnemyUnit: Record<string, Set<string>> = {};
  let totalKills = 0;
  let focusFireKills = 0;
  let attackersCount = 0;
  let singleAttackerDiedOnRetaliation = false;
  let lastAttackerUnitId: string | null = null;
  let oneShotProtectionTriggers = 0;
  let braceTriggers = 0;

  for (const act of bestPlan) {
    if (!curState.units[act.unitId]) continue;

    if (act.moveTo !== null) {
      curState = moveUnit(curState, act.unitId, act.moveTo);
    }

    if (!curState.units[act.unitId]) continue;

    if (act.kind === 'deploy' && canDeployTrebuchet(curState, act.unitId)) {
      curState = deployTrebuchet(curState, act.unitId);
    } else if (act.kind === 'overwatch' && canActivateOverwatch(curState, act.unitId)) {
      curState = activateOverwatch(curState, act.unitId);
    } else if (act.kind === 'fortify' && canFortifyUnit(curState, act.unitId)) {
      curState = fortifyUnit(curState, act.unitId);
    } else if (act.kind === 'attack_unit' && act.targetId && curState.units[act.targetId]) {
      const targetExisted = Boolean(curState.units[act.targetId]);
      attackersCount += 1;
      lastAttackerUnitId = act.unitId;
      if (!attackersPerEnemyUnit[act.targetId]) {
        attackersPerEnemyUnit[act.targetId] = new Set();
      }
      attackersPerEnemyUnit[act.targetId]!.add(act.unitId);

      const preview = previewUnitCombat(curState, act.unitId, act.targetId);
      if (preview?.oneShotProtectionTriggered) oneShotProtectionTriggers += 1;
      if (preview?.braceTriggered) braceTriggers += 1;

      curState = attackUnit(curState, act.unitId, act.targetId);

      if (targetExisted && !curState.units[act.targetId]) {
        totalKills += 1;
        if (attackersPerEnemyUnit[act.targetId]!.size >= 2) {
          focusFireKills += 1;
        }
      }
      if (!curState.units[act.unitId] && attackersCount === 1) {
        singleAttackerDiedOnRetaliation = true;
      }
    } else if (act.kind === 'attack_keep' && act.targetId && curState.keeps[act.targetId]) {
      attackersCount += 1;
      lastAttackerUnitId = act.unitId;
      curState = attackKeep(curState, act.unitId, act.targetId);
      if (!curState.units[act.unitId] && attackersCount === 1) {
        singleAttackerDiedOnRetaliation = true;
      }
    } else if (act.kind === 'attack_high_seat' && act.targetId) {
      attackersCount += 1;
      lastAttackerUnitId = act.unitId;
      curState = attackHighSeat(curState, act.unitId, act.targetId);
      if (!curState.units[act.unitId] && attackersCount === 1) {
        singleAttackerDiedOnRetaliation = true;
      }
    } else if (act.kind === 'attack_outpost' && act.targetId && curState.outposts[act.targetId]) {
      attackersCount += 1;
      lastAttackerUnitId = act.unitId;
      curState = attackOutpost(curState, act.unitId, act.targetId);
    } else if (act.kind === 'attack_village' && act.targetId) {
      attackersCount += 1;
      lastAttackerUnitId = act.unitId;
      curState = attackVillage(curState, act.unitId, act.targetId);
      if (!curState.units[act.unitId] && attackersCount === 1) {
        singleAttackerDiedOnRetaliation = true;
      }
    } else if (act.kind === 'attack_camp' && act.targetId) {
      attackersCount += 1;
      lastAttackerUnitId = act.unitId;
      curState = attackOutlawCamp(curState, act.unitId, act.targetId);
      if (!curState.units[act.unitId] && attackersCount === 1) {
        singleAttackerDiedOnRetaliation = true;
      }
    } else if (act.kind === 'raze' && act.targetId) {
      attackersCount += 1;
      lastAttackerUnitId = act.unitId;
      curState = razeFortification(curState, act.unitId, act.targetId);
    } else if (act.kind === 'pillage' && canPillageTile(curState, act.unitId)) {
      attackersCount += 1;
      lastAttackerUnitId = act.unitId;
      curState = pillageTile(curState, act.unitId);
    }
  }

  // Post-beam Commander skill (e.g., Ironhelm Hold the Line!) & Outpost / Field Reinforce
  const postSkill = maybeFireCommanderSkill(curState, houseId, influence, 'post');
  curState = postSkill.state;
  if (postSkill.used) commanderSkillsUsed += 1;

  const fieldActs = runPostBeamUnitFieldActions(curState, houseId);
  curState = fieldActs.state;

  return {
    state: curState,
    metrics: {
      combatResolutionsUsed: budget.used,
      totalKills,
      focusFireKills,
      attackersCount,
      singleAttackerDiedOnRetaliation: attackersCount === 1 && singleAttackerDiedOnRetaliation,
      singleAttackerUnitId: attackersCount === 1 ? lastAttackerUnitId : null,
      oneShotProtectionTriggers,
      braceTriggers,
      commanderSkillsUsed,
      outpostsFounded: fieldActs.outpostsFounded,
      reinforcesUsed: fieldActs.reinforcesUsed,
    },
  };
}
