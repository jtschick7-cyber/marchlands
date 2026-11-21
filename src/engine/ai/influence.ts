/**
 * Marchlands (Spec v2.0) — Fog-Honest Spatial Influence, Threat, Value & Frontier Maps
 *
 * Optimized for 34x34 (1,156 tiles) by computing frontier distances against enemy
 * Keep & Outpost centers and populating Threat sparsely around visible enemies &
 * Tier-3 Citadel arrow slits.
 */

import type {
  CoordKey,
  GameState,
  HouseId,
  TileThreat,
  UnitClass,
  UnitState,
} from '../../types/game.ts';
import {
  IMPROVEMENTS,
  KEEP_ARROW_SLITS_RANGE,
  KEEP_TIER3_ATTACK,
  UNITS,
} from '../../data/index.ts';
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
  { key: 'vsCavalry', unitClass: 'cavalry', defense: 6 },
  { key: 'vsRanged', unitClass: 'ranged', defense: 2 },
  { key: 'vsInfantry', unitClass: 'infantry', defense: 6 },
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
    case 'commander':
      return threat.vsInfantry;
  }
}

export function getMaxThreatOnTile(threat: TileThreat | undefined): number {
  if (!threat) return 0;
  return Math.max(threat.vsSpearman, threat.vsCavalry, threat.vsRanged, threat.vsInfantry);
}

export function buildInfluenceMaps(state: GameState, houseId: HouseId): InfluenceMaps {
  const fog = state.fog[houseId] ?? {};
  const threatMap: Record<CoordKey, TileThreat> = {};
  const valueMap: Record<CoordKey, number> = {};
  const frontierMap: Record<CoordKey, number> = {};

  const visibleEnemyUnits: UnitState[] = [];
  for (const u of Object.values(state.units)) {
    if (u.houseId !== houseId && fog[u.tileKey] === 'visible') {
      visibleEnemyUnits.push(u);
    }
  }

  // Fast frontier anchors: known enemy Keeps & Outposts (O(15) instead of O(300) enemy tiles)
  const enemyAnchors: Array<{ x: number; y: number; radius: number }> = [];
  for (const k of Object.values(state.keeps)) {
    if (k.ownerHouseId !== houseId && (fog[k.tileKey] ?? 'unexplored') !== 'unexplored') {
      enemyAnchors.push({ x: k.x, y: k.y, radius: k.tier });
    }
  }
  for (const o of Object.values(state.outposts)) {
    if (o.ownerHouseId !== houseId && (fog[o.tileKey] ?? 'unexplored') !== 'unexplored') {
      enemyAnchors.push({ x: o.x, y: o.y, radius: 1 });
    }
  }

  for (const tile of Object.values(state.tiles)) {
    const status = fog[tile.key] ?? 'unexplored';
    if (status === 'unexplored') {
      valueMap[tile.key] = 0;
    } else {
      let val = 0;
      if (tile.improvement !== null) {
        const imp = IMPROVEMENTS[tile.improvement];
        val +=
          imp.baseFood * 2 +
          imp.baseMaterials * 2 +
          imp.baseIron * 5 +
          imp.baseCoin * 2 +
          (imp.isFortification ? 4 : 0) +
          (tile.improvementLevel === 2 ? 6 : 0);
      }
      const keep = getKeepAt(state, tile.key);
      if (keep) {
        val += keep.tier === 3 ? 55 : keep.tier === 2 ? 40 : 28;
      }
      if (tile.landmark === 'high_seat' && tile.highSeatHp !== null && tile.highSeatHp > 0) {
        val += 36;
      } else if (tile.landmark === 'frontier_village' && tile.villageHp !== null && tile.villageHp > 0) {
        val += 24;
      } else if (tile.landmark === 'relic_ruin' && !tile.landmarkCleared) {
        val += 15;
      } else if (tile.landmark === 'ancient_watchtower') {
        val += tile.revealedByHouseIds.includes(houseId) ? 9 : 18;
      } else if (tile.landmark === 'outlaw_camp' && tile.banditHp !== null && tile.banditHp > 0) {
        val += 14;
      }
      if (tile.hasIronDeposit) {
        val += 14;
      }
      valueMap[tile.key] = val;
    }

    if (enemyAnchors.length === 0) {
      frontierMap[tile.key] = 99;
    } else {
      let minD = 99;
      for (const a of enemyAnchors) {
        const d = Math.max(0, chebyshevDist(tile.x, tile.y, a.x, a.y) - a.radius);
        if (d < minD) minD = d;
      }
      frontierMap[tile.key] = minD;
    }
  }

  const ensureThreat = (k: CoordKey): TileThreat => {
    let entry = threatMap[k];
    if (!entry) {
      entry = { vsSpearman: 0, vsCavalry: 0, vsRanged: 0, vsInfantry: 0 };
      threatMap[k] = entry;
    }
    return entry;
  };

  // 4-class Threat Map from visible enemy units (including active Overwatch threat)
  for (const enemy of visibleEnemyUnits) {
    const enemyDef = UNITS[enemy.typeId];
    const enemyHouse = state.houses[enemy.houseId];
    const hasBodkin = enemyHouse ? houseHasDecree(enemyHouse, 'decree_bodkin_volleys') : false;
    const maxMov = enemy.isOverwatch ? 0 : getUnitMaxMovement(state, enemy);
    const range = getUnitAttackRange(state, enemy);
    const threatRadius = maxMov + range;

    const atkBonus = getUnitAtkBonusSum(state, enemy, false);
    const baseEffAtk = enemyDef.attack * (enemy.hp / enemy.maxHp) * (1 + atkBonus);

    for (const c of getTilesInRadius(enemy.x, enemy.y, threatRadius, state.gridSize)) {
      const k = coordKey(c.x, c.y);
      const tile = state.tiles[k]!;
      if (tile.terrain === 'mountain') continue;

      const tileDefBonus = getTileTerrainOrFortDefBonus(state, tile, houseId);
      const entry = ensureThreat(k);

      for (const canon of CANONICAL_DEFENDERS) {
        const atkCounter = getCounterMultiplier(enemyDef.unitClass, canon.unitClass, hasBodkin);
        const defCounter = getCounterMultiplier(canon.unitClass, enemyDef.unitClass, false);
        const effAtk = baseEffAtk * atkCounter;
        const effDef = canon.defense * (1 + tileDefBonus) * defCounter;
        let dmg = computeCombatDamage(effAtk, effDef);
        if (enemy.isOverwatch) {
          dmg = Math.round(dmg * 1.15); // Discourage blundering into active Overwatch
        }
        if (dmg > entry[canon.key]) {
          entry[canon.key] = dmg;
        }
      }
    }
  }

  // Threat from enemy Tier-3 Citadel Arrow Slits (Range 2)
  for (const k of Object.values(state.keeps)) {
    if (k.ownerHouseId === houseId || k.tier < 3) continue;
    if ((fog[k.tileKey] ?? 'unexplored') === 'unexplored') continue;
    const effAtk = KEEP_TIER3_ATTACK * (k.keepHp / k.maxKeepHp);
    for (const c of getTilesInRadius(k.x, k.y, KEEP_ARROW_SLITS_RANGE, state.gridSize)) {
      const tk = coordKey(c.x, c.y);
      const tile = state.tiles[tk]!;
      if (tile.terrain === 'mountain') continue;
      const entry = ensureThreat(tk);
      const cover = getTileTerrainOrFortDefBonus(state, tile, houseId);
      for (const canon of CANONICAL_DEFENDERS) {
        const dmg = computeCombatDamage(effAtk, canon.defense * (1 + cover));
        if (dmg > entry[canon.key]) entry[canon.key] = dmg;
      }
    }
  }

  return { threatMap, valueMap, frontierMap, visibleEnemyUnits };
}
