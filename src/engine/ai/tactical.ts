/**
 * Marchlands (Spec v0.3) — Tactical AI Layer (Lightweight Beam Search + Canonical Replay)
 *
 * Operates on a stripped-down TacticalSimState (zero full GameState cloning),
 * enforces the 2,000 combat resolution budget, top-K candidate pruning,
 * difficulty-scaled beam width, threat avoidance, and replays the chosen plan
 * through canonical engine reducers.
 */

import type { CoordKey, GameState, HouseId, KeepSpecialization, UnitId } from '../../types/game.ts';
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
  IMPROVEMENTS,
  KEEP_DEF_BONUS,
  KEEP_GARRISON_ATTACK,
  KEEP_GARRISON_DEFENSE,
  KEEP_MASONRY_DEF_BONUS,
  MASONRY_SIEGE_DAMAGE_REDUCTION,
  TERRAINS,
  UNITS,
  VILLAGE_ATTACK,
  VILLAGE_DEF_BONUS,
  VILLAGE_DEFENSE,
  VILLAGE_MAX_HP,
} from '../../data/index.ts';
import { chebyshevDist, coordKey } from '../coords.ts';
import {
  applyOneShotProtection,
  attackKeep,
  attackOutlawCamp,
  attackUnit,
  attackVillage,
  canPillageTile,
  computeCombatDamage,
  getCounterMultiplier,
  getTileTerrainOrFortDefBonus,
  hasLineOfSight,
  pillageTile,
  previewUnitCombat,
  razeFortification,
} from '../combat.ts';
import { getReachableTiles, moveUnit } from '../movement.ts';
import { mulberry32At } from '../prng.ts';
import { getHouseKeeps, getHouseUnits, houseHasDecree } from '../stateHelpers.ts';
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
  hasMoved: boolean;
  hasAttacked: boolean;
  isOrphaned: boolean;
  isMutinied: boolean;
}

interface SimKeep {
  id: string;
  ownerId: HouseId;
  x: number;
  y: number;
  keepHp: number;
  maxKeepHp: number;
  specialization: KeepSpecialization;
}

interface SimFort {
  hp: number;
  ownerId: HouseId;
  type: 'palisade' | 'watchtower';
}

interface TacticalSimState {
  units: Record<string, SimUnit>;
  keeps: Record<string, SimKeep>;
  villages: Record<CoordKey, number>;
  camps: Record<CoordKey, number>;
  forts: Record<CoordKey, SimFort>;
}

type TacticalActionKind =
  | 'hold'
  | 'move'
  | 'attack_unit'
  | 'attack_keep'
  | 'attack_village'
  | 'attack_camp'
  | 'raze'
  | 'pillage';

interface PlannedUnitAction {
  readonly unitId: string;
  readonly moveTo: CoordKey | null;
  readonly kind: TacticalActionKind;
  readonly targetId: string | null; // unitId or keepId or tileKey
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
}

export interface TacticalResult {
  readonly state: GameState;
  readonly metrics: TacticalMetrics;
}

function getUnitValue(typeId: UnitId): number {
  const def = UNITS[typeId];
  return (def.matCost || 10) + 4 * def.coinUpkeep;
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
      hasMoved: u.hasMoved,
      hasAttacked: u.hasAttacked,
      isOrphaned: u.homeKeepId === 'orphaned',
      isMutinied: u.isMutinied,
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
      hasMoved: eu.hasMoved,
      hasAttacked: eu.hasAttacked,
      isOrphaned: eu.homeKeepId === 'orphaned',
      isMutinied: eu.isMutinied,
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
        keepHp: k.keepHp,
        maxKeepHp: k.maxKeepHp,
        specialization: k.specialization,
      };
    }
  }

  const villages: Record<CoordKey, number> = {};
  const camps: Record<CoordKey, number> = {};
  const forts: Record<CoordKey, SimFort> = {};

  for (const t of Object.values(state.tiles)) {
    if ((fog[t.key] ?? 'unexplored') === 'unexplored') continue;
    if (t.landmark === 'frontier_village' && t.villageHp !== null && t.villageHp > 0) {
      villages[t.key] = t.villageHp;
    } else if (t.landmark === 'outlaw_camp' && t.banditHp !== null && t.banditHp > 0) {
      camps[t.key] = t.banditHp;
    }
    if (
      t.ownerHouseId !== null &&
      t.ownerHouseId !== houseId &&
      (t.improvement === 'palisade' || t.improvement === 'watchtower') &&
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

  return { units, keeps, villages, camps, forts };
}

function cloneSimState(sim: TacticalSimState): TacticalSimState {
  const units: Record<string, SimUnit> = {};
  for (const [k, u] of Object.entries(sim.units)) units[k] = { ...u };
  const keeps: Record<string, SimKeep> = {};
  for (const [k, kp] of Object.entries(sim.keeps)) keeps[k] = { ...kp };
  const forts: Record<string, SimFort> = {};
  for (const [k, f] of Object.entries(sim.forts)) forts[k] = { ...f };
  return {
    units,
    keeps,
    villages: { ...sim.villages },
    camps: { ...sim.camps },
    forts,
  };
}

function getSimUnitRange(state: GameState, u: SimUnit): number {
  const def = UNITS[u.typeId];
  const tile = state.tiles[coordKey(u.x, u.y)];
  if (def.unitClass === 'ranged' && tile?.terrain === 'hills') {
    return def.range + TERRAINS.hills.rangedBonusRange;
  }
  return def.range;
}

/**
 * Heuristic unit priority order for beam search (AI_ARCHITECTURE.md §3):
 * Ranged -> Siege -> Melee finishers -> Cavalry -> Remaining melee.
 */
function getUnitOrderPriority(u: SimUnit): number {
  const cls = UNITS[u.typeId].unitClass;
  if (cls === 'ranged') return 0;
  if (cls === 'siege') return 1;
  if (cls === 'cavalry') return 3;
  return 2;
}

/**
 * Simulates a single PlannedUnitAction on `sim`, returning the incremental combat score delta.
 */
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
      // Ensure no other unit currently occupies dest in sim
      const occupied = Object.values(sim.units).some(
        (other) => other.id !== u.id && other.hp > 0 && other.x === destTile.x && other.y === destTile.y,
      );
      if (!occupied) {
        u.x = destTile.x;
        u.y = destTile.y;
        u.hasMoved = true;
      }
    }
  }

  if (action.kind === 'hold' || action.kind === 'move' || action.targetId === null) {
    return 0;
  }

  const atkDef = UNITS[u.typeId];
  const atkHouse = baseState.houses[houseId]!;
  const hasVet = houseHasDecree(atkHouse, 'decree_veteran_drill');
  const hasBodkin = houseHasDecree(atkHouse, 'decree_fletcher_volleys');
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
      houseHasDecree(defHouse, 'decree_fletcher_volleys'),
    );

    const atkBonus = (hasVet ? 0.15 : 0) + (u.isOrphaned ? -0.25 : 0) + (u.isMutinied ? -0.25 : 0);
    const defTile = baseState.tiles[coordKey(target.x, target.y)]!;
    const defBonus =
      getTileTerrainOrFortDefBonus(baseState, defTile, target.houseId) +
      (target.isOrphaned ? -0.25 : 0);

    const effAtk = atkDef.attack * (u.hp / u.maxHp) * (1 + atkBonus) * atkCounter;
    const effDef = defDef.defense * (target.hp / target.maxHp) * (1 + defBonus) * defCounter;
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
    const killBonus = target.hp <= 0 ? 3 * getUnitValue(target.typeId) : 0;
    const focusFireSynergy = alreadyDamagedThisTurn
      ? AI_SIM_FOCUS_FIRE_BONUS + (target.hp <= 0 ? AI_SIM_FOCUS_KILL_BONUS : 0)
      : 0;
    const claimantBonus =
      baseState.crown.claimantHouseId === target.houseId ? 15 : 0;
    const ownDeathPenalty = u.hp <= 0 ? 3 * getUnitValue(u.typeId) : 0;
    return killBonus + focusFireSynergy + dmgRes.damage + claimantBonus - 2 * retDmg - ownDeathPenalty;
  }

  if (action.kind === 'attack_keep') {
    const keep = sim.keeps[action.targetId];
    if (!keep || keep.keepHp <= 0 || keep.ownerId === houseId) return 0;
    const dist = chebyshevDist(u.x, u.y, keep.x, keep.y);
    if (dist > getSimUnitRange(baseState, u)) return 0;

    budget.used += 1;
    const defHouse = baseState.houses[keep.ownerId]!;
    const hasMasonry = houseHasDecree(defHouse, 'decree_masonry_reinforcement');
    const baseAtk = atkDef.structureAttack ?? atkDef.attack;
    const effAtk = baseAtk * (u.hp / u.maxHp) * (1 + (hasVet ? 0.15 : 0));
    const keepDefBonus = hasMasonry ? KEEP_MASONRY_DEF_BONUS : KEEP_DEF_BONUS;
    const effDef = KEEP_GARRISON_DEFENSE * (keep.keepHp / keep.maxKeepHp) * (1 + keepDefBonus);
    let dmg = computeCombatDamage(effAtk, effDef);
    if (atkDef.unitClass === 'siege' && hasMasonry) {
      dmg = Math.max(1, Math.round(dmg * (1 - MASONRY_SIEGE_DAMAGE_REDUCTION)));
    }
    keep.keepHp = Math.max(0, keep.keepHp - dmg);
    u.hasAttacked = true;

    let retDmg = 0;
    if (keep.keepHp > 0 && dist === 1 && atkDef.unitClass !== 'siege') {
      const retEffAtk = KEEP_GARRISON_ATTACK * (keep.keepHp / keep.maxKeepHp);
      const retEffDef = atkDef.defense * (u.hp / u.maxHp);
      retDmg = computeCombatDamage(retEffAtk, retEffDef);
      u.hp = Math.max(0, u.hp - retDmg);
    }

    const captureBonus = keep.keepHp <= 0 ? 80 : 0;
    const claimantBonus = baseState.crown.claimantHouseId === keep.ownerId ? 25 : 0;
    return 4 * dmg + captureBonus + claimantBonus - 2 * retDmg;
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

    return 2.5 * dmg + (after <= 0 ? 45 : 0) - 2 * retDmg;
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

    return (dmg + (after <= 0 ? 35 : 0)) * personality.campPriority - 2 * retDmg;
  }

  if (action.kind === 'raze') {
    const fort = sim.forts[action.targetId];
    if (!fort || fort.hp <= 0) return 0;
    budget.used += 1;
    const baseAtk = atkDef.structureAttack ?? atkDef.attack;
    const dmg = computeCombatDamage(baseAtk * (u.hp / u.maxHp), FORTIFICATION_DEFENSE);
    fort.hp = Math.max(0, fort.hp - dmg);
    u.hasAttacked = true;
    return dmg * 1.5 + (fort.hp <= 0 ? 18 : 0);
  }

  if (action.kind === 'pillage') {
    const tile = baseState.tiles[coordKey(u.x, u.y)];
    if (!tile || tile.improvement === null) return 0;
    u.hasAttacked = true;
    return (IMPROVEMENTS[tile.improvement].matCost + 6) * personality.pillagePriority;
  }

  return 0;
}

/**
 * Generates top-K pruned candidate actions for a single unit from its current reachable tiles.
 */
function generateUnitCandidates(
  state: GameState,
  sim: TacticalSimState,
  houseId: HouseId,
  unitId: string,
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

  const reachable = getReachableTiles(state, unitId);
  const positions: Array<{ key: CoordKey; isMove: boolean }> = [
    { key: coordKey(simUnit.x, simUnit.y), isMove: false },
  ];

  // Add reachable positions (excluding tiles occupied in current sim)
  const sortedKeys = Object.keys(reachable).sort();
  for (const k of sortedKeys) {
    const t = state.tiles[k]!;
    const occ = Object.values(sim.units).some(
      (o) => o.id !== unitId && o.hp > 0 && o.x === t.x && o.y === t.y,
    );
    if (!occ) {
      positions.push({ key: k, isMove: true });
    }
  }

  const candidates: PlannedUnitAction[] = [];

  for (const pos of positions) {
    const posTile = state.tiles[pos.key]!;
    const threat = ignoreThreat
      ? 0
      : getUnitClassThreat(influence.threatMap[pos.key], unitDef.unitClass);

    const adjTargetKeep =
      plan?.posture === 'attack' &&
      targetKeep !== null &&
      chebyshevDist(posTile.x, posTile.y, targetKeep.x, targetKeep.y) <= 1;

    // Treat tiles where threat >= current HP as forbidden except when attacking target Keep
    if (!ignoreThreat && threat >= simUnit.hp && !adjTargetKeep && pos.isMove) {
      continue;
    }

    const threatPenalty = 1.5 * personality.riskAversion * (threat / Math.max(1, simUnit.hp)) * 12;

    // Progress score toward goal
    let posScore = -threatPenalty;
    if (goalTile) {
      const prevDist = chebyshevDist(simUnit.x, simUnit.y, goalTile.x, goalTile.y);
      const nextDist = chebyshevDist(posTile.x, posTile.y, goalTile.x, goalTile.y);
      posScore += (prevDist - nextDist) * 6;
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

    // Keep ranged units behind melee (slight penalty for stepping adjacent to enemies)
    if (unitDef.unitClass === 'ranged') {
      const adjEnemy = Object.values(sim.units).some(
        (eu) =>
          eu.houseId !== houseId &&
          eu.hp > 0 &&
          chebyshevDist(posTile.x, posTile.y, eu.x, eu.y) === 1,
      );
      if (adjEnemy) posScore -= 10;
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

    const effRange =
      unitDef.unitClass === 'ranged' && posTile.terrain === 'hills'
        ? unitDef.range + TERRAINS.hills.rangedBonusRange
        : unitDef.range;

    // Attack visible enemy units
    for (const eu of Object.values(sim.units)) {
      if (eu.houseId === houseId || eu.hp <= 0) continue;
      const dist = chebyshevDist(posTile.x, posTile.y, eu.x, eu.y);
      if (dist > effRange || !hasLineOfSight(state, posTile.x, posTile.y, eu.x, eu.y)) continue;
      const woundedBonus = (1 - eu.hp / eu.maxHp) * AI_FOCUS_FIRE_WOUNDED_BONUS;
      const damagedThisTurn = eu.hp < (state.units[eu.id]?.hp ?? eu.maxHp);
      const focusBonus = damagedThisTurn ? AI_SAME_TURN_FOCUS_BONUS : 0;
      const hasAllyFollowUp =
        !damagedThisTurn &&
        Object.values(sim.units).some(
          (ally) =>
            ally.houseId === houseId &&
            ally.id !== unitId &&
            ally.hp > 0 &&
            !ally.hasAttacked &&
            chebyshevDist(ally.x, ally.y, eu.x, eu.y) <=
              UNITS[ally.typeId].range + (ally.hasMoved ? 0 : UNITS[ally.typeId].movement),
        );
      const allyBonus = hasAllyFollowUp ? AI_ALLY_FOLLOWUP_BONUS : 0;
      const claimantBonus = state.crown.claimantHouseId === eu.houseId ? 15 : 0;
      const counterMult = getCounterMultiplier(unitDef.unitClass, UNITS[eu.typeId].unitClass, false);
      const est = posScore + 18 * counterMult + woundedBonus + focusBonus + allyBonus + claimantBonus;
      candidates.push({
        unitId,
        moveTo: pos.isMove ? pos.key : null,
        kind: 'attack_unit',
        targetId: eu.id,
        localScore: est,
      });
    }

    // Attack enemy Keeps (when no enemy unit stands on Keep)
    for (const ek of Object.values(sim.keeps)) {
      if (ek.ownerId === houseId || ek.keepHp <= 0) continue;
      const dist = chebyshevDist(posTile.x, posTile.y, ek.x, ek.y);
      if (dist > effRange || !hasLineOfSight(state, posTile.x, posTile.y, ek.x, ek.y)) continue;
      const keepOccupied = Object.values(sim.units).some(
        (eu) => eu.houseId !== houseId && eu.hp > 0 && eu.x === ek.x && eu.y === ek.y,
      );
      if (keepOccupied) continue;
      const siegeBonus = unitDef.unitClass === 'siege' ? 35 : 0;
      const claimantBonus = state.crown.claimantHouseId === ek.ownerId ? 30 : 0;
      candidates.push({
        unitId,
        moveTo: pos.isMove ? pos.key : null,
        kind: 'attack_keep',
        targetId: ek.id,
        localScore: posScore + 32 + siegeBonus + claimantBonus,
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
        localScore: posScore + 22 * personality.campPriority,
      });
    }

    // Violent seizure of Frontier Village (only if cannot afford peaceful annex or aggressive)
    const house = state.houses[houseId]!;
    if (house.resources.coin < 15 || houseId === 'corvus') {
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
          localScore: posScore + (houseId === 'corvus' ? 24 : 14),
        });
      }
    }

    // Raze unmanned enemy fortifications
    for (const [fk, f] of Object.entries(sim.forts)) {
      if (f.hp <= 0) continue;
      const ft = state.tiles[fk]!;
      const dist = chebyshevDist(posTile.x, posTile.y, ft.x, ft.y);
      if (dist > effRange || !hasLineOfSight(state, posTile.x, posTile.y, ft.x, ft.y)) continue;
      const manned = Object.values(sim.units).some(
        (eu) => eu.hp > 0 && eu.x === ft.x && eu.y === ft.y,
      );
      if (manned) continue;
      candidates.push({
        unitId,
        moveTo: pos.isMove ? pos.key : null,
        kind: 'raze',
        targetId: fk,
        localScore: posScore + (unitDef.unitClass === 'siege' ? 28 : 12),
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

  // Deterministic sort: highest localScore, tie-break by moveTo then targetId
  candidates.sort((a, b) => {
    if (b.localScore !== a.localScore) return b.localScore - a.localScore;
    const mA = a.moveTo ?? '';
    const mB = b.moveTo ?? '';
    if (mA !== mB) return mA.localeCompare(mB);
    return (a.targetId ?? '').localeCompare(b.targetId ?? '');
  });

  // Deduplicate by (kind, targetId) so top-K explores distinct targets rather than
  // K copies of the same target from adjacent tiles
  const deduped: PlannedUnitAction[] = [];
  const seenKeys = new Set<string>();
  for (const c of candidates) {
    const key = c.kind === 'hold' || c.kind === 'move' ? 'reposition' : `${c.kind}:${c.targetId ?? ''}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(c);
  }

  // Keep top K, always retaining at least 1 hold/move candidate
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
 * Executes the Tactical Layer for `houseId`: beam search on TacticalSimState
 * followed by canonical replay through engine reducers.
 */
export function runTacticalLayer(
  state: GameState,
  houseId: HouseId,
  influence: InfluenceMaps,
): TacticalResult {
  const myUnits = getHouseUnits(state, houseId).filter((u) => !u.hasAttacked || u.remainingMovement > 0);
  if (myUnits.length === 0) {
    return {
      state,
      metrics: {
        combatResolutionsUsed: 0,
        totalKills: 0,
        focusFireKills: 0,
        attackersCount: 0,
        singleAttackerDiedOnRetaliation: false,
        singleAttackerUnitId: null,
        oneShotProtectionTriggers: 0,
        braceTriggers: 0,
      },
    };
  }

  const diffCfg = AI_DIFFICULTY_CONFIG[state.difficulty];
  const personality = AI_PERSONALITIES[houseId];
  const plan = state.houses[houseId]?.aiPlan;
  const musterReady = isMusterReady(state, houseId);
  const expandGoals = assignExpandObjectives(state, houseId);

  // Determine per-unit destination goal
  const myKeeps = getHouseKeeps(state, houseId);
  const defendGoal =
    myKeeps.find((k) => k.damagedLastRound)?.tileKey ?? myKeeps[0]?.tileKey ?? null;

  const getGoalForUnit = (unitId: string): CoordKey | null => {
    if (plan?.posture === 'defend') {
      // Move toward nearest visible enemy threatening territory, else threatened Keep
      const u = state.units[unitId]!;
      if (influence.visibleEnemyUnits.length > 0) {
        const nearest = [...influence.visibleEnemyUnits].sort(
          (a, b) => chebyshevDist(u.x, u.y, a.x, a.y) - chebyshevDist(u.x, u.y, b.x, b.y),
        )[0]!;
        return nearest.tileKey;
      }
      return defendGoal;
    }
    if (plan?.posture === 'attack' && plan.targetKeepId) {
      const tk = state.keeps[plan.targetKeepId];
      if (tk) {
        return musterReady || !plan.rallyTileKey ? tk.tileKey : plan.rallyTileKey;
      }
    }
    return expandGoals[unitId] ?? null;
  };

  // Easy difficulty ignores threat map 50% of the time (seeded, never mutates state.rngCounter)
  const ignoreThreat =
    diffCfg.ignoreThreatChance > 0 &&
    mulberry32At(state.rngSeed, state.turnNumber * 31 + state.houseOrder.indexOf(houseId)) <
      diffCfg.ignoreThreatChance;

  const initSim = buildSimState(state, houseId, influence);
  const orderedUnits = myUnits
    .map((u) => initSim.units[u.id]!)
    .sort((a, b) => {
      const pDiff = getUnitOrderPriority(a) - getUnitOrderPriority(b);
      return pDiff !== 0 ? pDiff : a.id.localeCompare(b.id);
    });

  const budget = { used: 0 };

  interface BeamNode {
    sim: TacticalSimState;
    actions: PlannedUnitAction[];
    score: number;
  }

  let beam: BeamNode[] = [{ sim: initSim, actions: [], score: 0 }];

  for (let idx = 0; idx < orderedUnits.length; idx++) {
    const unit = orderedUnits[idx]!;
    const goalKey = getGoalForUnit(unit.id);
    const widthLimit = idx < AI_TACTICAL_MAX_DEPTH ? diffCfg.beamWidth : 1;
    const capLimit = idx < AI_TACTICAL_MAX_DEPTH ? diffCfg.candidateCap : 2;

    const nextBeam: BeamNode[] = [];

    for (const node of beam) {
      if (budget.used >= AI_COMBAT_RESOLUTION_BUDGET) {
        nextBeam.push(node);
        continue;
      }

      const cands = generateUnitCandidates(
        state,
        node.sim,
        houseId,
        unit.id,
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
        if (budget.used >= AI_COMBAT_RESOLUTION_BUDGET && act.kind !== 'hold' && act.kind !== 'move') {
          continue;
        }
        const simCopy = cloneSimState(node.sim);
        const combatDelta = applySimAction(state, simCopy, houseId, act, budget);

        // End-tile threat risk term for this unit
        const uAfter = simCopy.units[unit.id];
        let riskPenalty = 0;
        let progressBonus = 0;
        if (uAfter && uAfter.hp > 0) {
          const endKey = coordKey(uAfter.x, uAfter.y);
          if (!ignoreThreat) {
            const t = getUnitClassThreat(influence.threatMap[endKey], UNITS[uAfter.typeId].unitClass);
            riskPenalty = 1.5 * personality.riskAversion * (t / Math.max(1, uAfter.hp)) * 10;
          }
          if (goalKey) {
            const gt = state.tiles[goalKey]!;
            const startU = state.units[unit.id]!;
            progressBonus =
              (chebyshevDist(startU.x, startU.y, gt.x, gt.y) -
                chebyshevDist(uAfter.x, uAfter.y, gt.x, gt.y)) *
              4;
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

  // Canonical Replay through real engine reducers + track focus-fire / piecemeal metrics
  let curState = state;
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

    if (act.kind === 'attack_unit' && act.targetId && curState.units[act.targetId]) {
      const targetExisted = Boolean(curState.units[act.targetId]);
      attackersCount += 1;
      lastAttackerUnitId = act.unitId;
      if (!attackersPerEnemyUnit[act.targetId]) {
        attackersPerEnemyUnit[act.targetId] = new Set();
      }
      attackersPerEnemyUnit[act.targetId]!.add(act.unitId);

      const preview = previewUnitCombat(curState, act.unitId, act.targetId);
      if (preview?.oneShotProtectionTriggered) {
        oneShotProtectionTriggers += 1;
      }
      if (preview?.braceTriggered) {
        braceTriggers += 1;
      }

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
    },
  };
}
