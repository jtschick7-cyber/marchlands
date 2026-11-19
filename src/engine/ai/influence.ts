/**
 * Marchlands (Spec v0.3) — Fog-Honest Spatial Influence, Threat, Value & Frontier Maps
 *
 * Strictly fog-honest:
 * - Enemy units are ONLY observed on tiles where fog[houseId][tileKey] === 'visible'.
 * - Enemy Keeps, improvements, and landmarks are ONLY observed where fog !== 'unexplored'.
 */

import type {
  CoordKey,
  GameState,
  HouseId,
  TileThreat,
  UnitClass,
  UnitState,
} from '../../types/game.ts';
import { IMPROVEMENTS, UNITS } from '../../data/index.ts';
import { chebyshevDist, coordKey, getTilesInRadius } from '../coords.ts';
import {
  computeCombatDamage,
  getCounterMultiplier,
  getTileTerrainOrFortDefBonus,
  getUnitAtkBonusSum,
  getUnitAttackRange,
} from '../combat.ts';
import { getUnitMaxMovement } from '../movement.ts';
import { getKeepAt, houseHasDecree } from '../stateHelpers.ts';

export interface InfluenceMaps {
  readonly threatMap: Record<CoordKey, TileThreat>;
  readonly valueMap: Record<CoordKey, number>;
  readonly frontierMap: Record<CoordKey, number>;
  readonly visibleEnemyUnits: readonly UnitState[];
}

const CANONICAL_DEFENDERS: ReadonlyArray<{
  readonly key: keyof TileThreat;
  readonly unitClass: UnitClass;
  readonly defense: number;
}> = [
  { key: 'vsSpearman', unitClass: 'spearman', defense: 6 },
  { key: 'vsCavalry', unitClass: 'cavalry', defense: 5 },
  { key: 'vsRanged', unitClass: 'ranged', defense: 2 },
  { key: 'vsInfantry', unitClass: 'infantry', defense: 5 },
];

export function getUnitClassThreat(threat: TileThreat | undefined, unitClass: UnitClass): number {
  if (!threat) return 0;
  switch (unitClass) {
    case 'spearman':
      return threat.vsSpearman;
    case 'cavalry':
      return threat.vsCavalry;
    case 'ranged':
    case 'siege':
      return threat.vsRanged;
    case 'infantry':
      return threat.vsInfantry;
  }
}

export function getMaxThreatOnTile(threat: TileThreat | undefined): number {
  if (!threat) return 0;
  return Math.max(threat.vsSpearman, threat.vsCavalry, threat.vsRanged, threat.vsInfantry);
}

/**
 * Builds per-turn fog-honest Threat, Value, and Frontier maps for `houseId`.
 */
export function buildInfluenceMaps(state: GameState, houseId: HouseId): InfluenceMaps {
  const fog = state.fog[houseId] ?? {};
  const threatMap: Record<CoordKey, TileThreat> = {};
  const valueMap: Record<CoordKey, number> = {};
  const frontierMap: Record<CoordKey, number> = {};

  // Collect fog-honest visible enemy units & known enemy tiles
  const visibleEnemyUnits: UnitState[] = [];
  for (const u of Object.values(state.units)) {
    if (u.houseId !== houseId && fog[u.tileKey] === 'visible') {
      visibleEnemyUnits.push(u);
    }
  }

  const enemyTerritoryCoords: Array<{ x: number; y: number }> = [];
  for (const tile of Object.values(state.tiles)) {
    threatMap[tile.key] = { vsSpearman: 0, vsCavalry: 0, vsRanged: 0, vsInfantry: 0 };

    const status = fog[tile.key] ?? 'unexplored';
    if (status === 'unexplored') {
      valueMap[tile.key] = 0;
      continue;
    }

    // Economic & landmark value
    let val = 0;
    if (tile.improvement !== null) {
      const imp = IMPROVEMENTS[tile.improvement];
      val += imp.baseFood * 2 + imp.baseMaterials * 2 + imp.baseCoin * 2 + (imp.isFortification ? 3 : 0);
    }
    const keep = getKeepAt(state, tile.key);
    if (keep) {
      val += keep.tier === 2 ? 35 : 25;
      if (keep.ownerHouseId !== houseId) {
        enemyTerritoryCoords.push({ x: tile.x, y: tile.y });
      }
    } else if (tile.ownerHouseId !== null && tile.ownerHouseId !== houseId) {
      enemyTerritoryCoords.push({ x: tile.x, y: tile.y });
    }

    if (tile.landmark === 'frontier_village' && tile.villageHp !== null && tile.villageHp > 0) {
      val += 22;
    } else if (tile.landmark === 'relic_ruin' && !tile.landmarkCleared) {
      val += 14;
    } else if (tile.landmark === 'ancient_watchtower') {
      val += tile.revealedByHouseIds.includes(houseId) ? 8 : 16;
    } else if (tile.landmark === 'outlaw_camp' && tile.banditHp !== null && tile.banditHp > 0) {
      val += 12;
    }
    if (tile.hasIronDeposit) {
      val += 4;
    }

    valueMap[tile.key] = val;
  }

  // Frontier distance to nearest known enemy territory
  for (const tile of Object.values(state.tiles)) {
    if (enemyTerritoryCoords.length === 0) {
      frontierMap[tile.key] = 99;
    } else {
      let minD = 99;
      for (const ec of enemyTerritoryCoords) {
        const d = chebyshevDist(tile.x, tile.y, ec.x, ec.y);
        if (d < minD) minD = d;
      }
      frontierMap[tile.key] = minD;
    }
  }

  // 4-class Threat Map from visible enemy units
  for (const enemy of visibleEnemyUnits) {
    const enemyDef = UNITS[enemy.typeId];
    const enemyHouse = state.houses[enemy.houseId];
    const hasBodkin = enemyHouse ? houseHasDecree(enemyHouse, 'decree_fletcher_volleys') : false;
    const maxMov = getUnitMaxMovement(state, enemy);
    const range = getUnitAttackRange(state, enemy);
    const threatRadius = maxMov + range;

    const atkBonus = getUnitAtkBonusSum(state, enemy, false);
    const baseEffAtk = enemyDef.attack * (enemy.hp / enemy.maxHp) * (1 + atkBonus);

    for (const c of getTilesInRadius(enemy.x, enemy.y, threatRadius, state.gridSize)) {
      const k = coordKey(c.x, c.y);
      const tile = state.tiles[k]!;
      if (tile.terrain === 'mountain') continue;

      const tileDefBonus = getTileTerrainOrFortDefBonus(state, tile, houseId);
      const entry = threatMap[k]!;

      for (const canon of CANONICAL_DEFENDERS) {
        const atkCounter = getCounterMultiplier(enemyDef.unitClass, canon.unitClass, hasBodkin);
        const defCounter = getCounterMultiplier(canon.unitClass, enemyDef.unitClass, false);
        const effAtk = baseEffAtk * atkCounter;
        const effDef = canon.defense * (1 + tileDefBonus) * defCounter;
        const dmg = computeCombatDamage(effAtk, effDef);
        if (dmg > entry[canon.key]) {
          entry[canon.key] = dmg;
        }
      }
    }
  }

  return {
    threatMap,
    valueMap,
    frontierMap,
    visibleEnemyUnits,
  };
}
