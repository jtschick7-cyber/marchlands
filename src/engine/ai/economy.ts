/**
 * Marchlands (Spec v0.3) — Economy & Synchronous Decision AI Layer
 *
 * Scores building construction, unit training, Peaceful Annexations, voluntary
 * Regent's Tithe, and Crown Audience on a 0–100 utility scale under the shared
 * MAX_AI_ACTIONS = 12 cap and MIN_ACTION_SCORE = 5 floor.
 * Also handles synchronous Keep specializations, Royal Decree drafts, and
 * opportunistic manual Keep re-homing (exempt from MAX_AI_ACTIONS).
 */

import type {
  CoordKey,
  DecreeId,
  GameState,
  HouseId,
  ImprovementId,
  KeepSpecialization,
  UnitId,
} from '../../types/game.ts';
import {
  AI_PERSONALITIES,
  AUDIENCE_GRANT_FAVOR,
  AUDIENCE_PETITION_FAVOR,
  DECREES,
  EXHAUSTED_POOL_COIN,
  EXHAUSTED_POOL_MATERIALS,
  HOUSES,
  IMPROVEMENT_IDS,
  MANDATE_MIN_FAVOR,
  MAX_AI_ACTIONS,
  MIN_ACTION_SCORE,
  UNIT_IDS,
  UNITS,
} from '../../data/index.ts';
import { coordKey, getNeighbors } from '../coords.ts';
import { canRehomeUnitManually, rehomeUnitManually } from '../capture.ts';
import {
  canPayRegentsTithe,
  payRegentsTithe,
  performCrownGrant,
  performPetitionCharter,
} from '../crown.ts';
import {
  applyKeepSpecialization,
  getEligibleUnownedDecrees,
  rollDraftHand,
  selectDecree,
} from '../draftAndSpec.ts';
import {
  annexVillage,
  buildImprovement,
  canAnnexVillage,
  canBuildImprovement,
  canTrainUnit,
  computeKeepYield,
  computeTileYield,
  getImprovementCost,
  getUnitMatCost,
  getUnitUpkeep,
  trainUnit,
} from '../economy.ts';
import {
  getHouseKeeps,
  getHouseUnits,
  getKeepArmyCap,
  getKeepSupportedUnitIds,
} from '../stateHelpers.ts';
import type { InfluenceMaps } from './influence.ts';

function chooseKeepSpecialization(
  state: GameState,
  houseId: HouseId,
  keepId: string,
  influence: InfluenceMaps,
): Exclude<KeepSpecialization, 'none'> {
  const personality = AI_PERSONALITIES[houseId];
  const keep = state.keeps[keepId];
  const keeps = getHouseKeeps(state, houseId);
  const frontierDist = keep ? (influence.frontierMap[keep.tileKey] ?? 99) : 99;
  const isFrontier = frontierDist <= 6;

  // Count existing specializations to avoid mono-spam
  const existingGarrison = keeps.filter((k) => k.specialization === 'garrison').length;
  const existingMarket = keeps.filter((k) => k.specialization === 'market_town').length;
  const existingGranary = keeps.filter((k) => k.specialization === 'granary_seat').length;

  let garrisonScore = 50 * personality.specWeights.garrison + (isFrontier ? 18 : 0) - existingGarrison * 12;
  let marketScore =
    50 * personality.specWeights.market_town +
    (state.houses[houseId]!.resources.coin < 15 ? 14 : 0) -
    existingMarket * 14;
  const granaryScore =
    50 * personality.specWeights.granary_seat + (keep?.isCapital ? 8 : 0) - existingGranary * 14;

  if (houseId === 'ironhelm' && existingGarrison === 0) garrisonScore += 25;
  if (houseId === 'aurelia' && existingMarket === 0) marketScore += 25;
  if (houseId === 'corvus') {
    if (isFrontier) garrisonScore += 20;
    else marketScore += 15;
  }

  if (garrisonScore >= marketScore && garrisonScore >= granaryScore) return 'garrison';
  if (marketScore >= granaryScore) return 'market_town';
  return 'granary_seat';
}

function scoreDecreeCard(houseId: HouseId, decreeId: DecreeId): number {
  const personality = AI_PERSONALITIES[houseId];
  const def = DECREES[decreeId];
  let score = 50;

  if (def.category === 'infrastructure') {
    score += 8 * personality.econBuildBias;
    if (decreeId === 'decree_chartered_markets') score += 16 * personality.annexPriority;
    if (decreeId === 'decree_iron_prospecting') score += 14;
    if (decreeId === 'decree_stone_granaries') score += 10;
    if (decreeId === 'decree_timber_palisades') score += 12 * personality.fortificationBias;
    if (decreeId === 'decree_frontier_towers') score += 10 * personality.watchtowerPriority;
  } else if (def.category === 'military') {
    score += 10 * personality.attackAggression;
    if (decreeId === 'decree_sword_guilds') score += 14;
    if (decreeId === 'decree_steel_arbalests') score += 13;
    if (decreeId === 'decree_siege_engineers') score += 12 * personality.attackAggression;
    if (decreeId === 'decree_chivalric_order') score += 10;
  } else {
    // Doctrines
    if (decreeId === 'decree_veteran_drill') score += 20;
    if (decreeId === 'decree_supply_lines') score += 18;
    if (decreeId === 'decree_crop_rotation' || decreeId === 'decree_coppice_forestry') score += 16;
    if (decreeId === 'decree_toll_roads') score += 15 * personality.econBuildBias;
    if (decreeId === 'decree_field_surgeons') score += 14;
    if (decreeId === 'decree_forced_march') score += 13;
    if (decreeId === 'decree_shield_wall') score += 13 * personality.riskAversion;
    if (decreeId === 'decree_border_levies') score += 12;
    if (decreeId === 'decree_crown_envoys') score += 12 * personality.annexPriority;
    if (decreeId === 'decree_salvage_crews') score += 14 * personality.campPriority;
    if (decreeId === 'decree_masonry_reinforcement') score += 14 * personality.fortificationBias;
  }

  return score;
}

/**
 * Synchronously resolves any pending Keep specializations and Royal Decree drafts for an AI House.
 */
export function resolvePendingAiDecisions(
  state: GameState,
  houseId: HouseId,
  influence: InfluenceMaps,
): GameState {
  let cur = state;

  // 1. Specializations first (Ruling 1.4)
  while (true) {
    const house = cur.houses[houseId];
    if (!house || house.isEliminated || house.pendingSpecializationKeepIds.length === 0) break;
    const keepId = house.pendingSpecializationKeepIds[0]!;
    const spec = chooseKeepSpecialization(cur, houseId, keepId, influence);
    const next = applyKeepSpecialization(cur, houseId, keepId, spec);
    if (next === cur) break;
    cur = next;
  }

  // 2. Royal Decree Drafts
  while (true) {
    const house = cur.houses[houseId];
    if (!house || house.isEliminated || house.pendingDraftCount <= 0) break;

    const eligible = getEligibleUnownedDecrees(house);
    if (eligible.length === 0) {
      // Exhausted pool -> Windfall
      const count = house.pendingDraftCount;
      cur = {
        ...cur,
        houses: {
          ...cur.houses,
          [houseId]: {
            ...house,
            pendingDraftCount: 0,
            resources: {
              materials: house.resources.materials + EXHAUSTED_POOL_MATERIALS * count,
              coin: house.resources.coin + EXHAUSTED_POOL_COIN * count,
            },
          },
        },
      };
      break;
    }

    const { hand, nextRngCounter } = rollDraftHand(cur, houseId);
    if (hand.length === 0) break;
    cur = { ...cur, rngCounter: nextRngCounter };

    const bestCard = [...hand].sort((a, b) => {
      const diff = scoreDecreeCard(houseId, b) - scoreDecreeCard(houseId, a);
      return diff !== 0 ? diff : a.localeCompare(b);
    })[0]!;

    const next = selectDecree(cur, houseId, bestCard);
    if (next === cur) break;
    cur = next;
  }

  return cur;
}

/**
 * Opportunistic manual Keep re-homing (exempt from MAX_AI_ACTIONS).
 */
export function runOpportunisticRehoming(state: GameState, houseId: HouseId): GameState {
  let cur = state;
  const units = getHouseUnits(cur, houseId).sort((a, b) => a.id.localeCompare(b.id));
  for (const u of units) {
    if (!canRehomeUnitManually(cur, u.id)) continue;
    const isOrphaned = u.homeKeepId === 'orphaned';
    const homeFull =
      !isOrphaned &&
      getKeepSupportedUnitIds(cur, u.homeKeepId).length >= getKeepArmyCap(cur, u.homeKeepId);
    if (isOrphaned || homeFull) {
      cur = rehomeUnitManually(cur, u.id);
    }
  }
  return cur;
}

type EconomyAction =
  | { kind: 'annex'; tileKey: CoordKey; score: number }
  | { kind: 'train'; keepId: string; unitId: UnitId; score: number }
  | { kind: 'build'; tileKey: CoordKey; improvementId: ImprovementId; score: number }
  | { kind: 'tithe'; score: number }
  | { kind: 'petition'; score: number }
  | { kind: 'grant'; resource: 'materials' | 'coin'; score: number };

function getHouseNetCoinIncome(state: GameState, houseId: HouseId): number {
  const house = state.houses[houseId]!;
  let income = 0;
  for (const k of getHouseKeeps(state, houseId)) {
    income += computeKeepYield(state, k.id).coin;
  }
  let upkeep = 0;
  for (const u of getHouseUnits(state, houseId)) {
    upkeep += getUnitUpkeep(house, u.typeId);
  }
  return income - upkeep;
}

export interface EconomyResult {
  readonly state: GameState;
  readonly actionsUsed: number;
}

/**
 * Runs the unified post-combat economy pass for `houseId` (<= MAX_AI_ACTIONS = 12).
 */
export function runEconomyLayer(
  state: GameState,
  houseId: HouseId,
  influence: InfluenceMaps,
): EconomyResult {
  let cur = runOpportunisticRehoming(state, houseId);
  cur = resolvePendingAiDecisions(cur, houseId, influence);

  const personality = AI_PERSONALITIES[houseId];
  let actionsUsed = 0;

  while (actionsUsed < MAX_AI_ACTIONS) {
    const house = cur.houses[houseId];
    if (!house || house.isEliminated) break;

    const myKeeps = getHouseKeeps(cur, houseId);
    const myUnits = getHouseUnits(cur, houseId);
    const netCoin = getHouseNetCoinIncome(cur, houseId);
    const posture = house.aiPlan?.posture ?? 'expand';
    const candidates: EconomyAction[] = [];

    // 1. Peaceful Village Annexation
    for (const tile of Object.values(cur.tiles)) {
      if (tile.landmark === 'frontier_village' && canAnnexVillage(cur, houseId, tile.key)) {
        candidates.push({
          kind: 'annex',
          tileKey: tile.key,
          score: Math.min(100, 88 * personality.annexPriority),
        });
      }
    }

    // 2. Unit Training
    const totalArmyCap = myKeeps.reduce((s, k) => s + getKeepArmyCap(cur, k.id), 0);
    const needUnitsFactor =
      myUnits.length < 2
        ? 26
        : myUnits.length < Math.ceil(totalArmyCap * 0.7)
          ? 14
          : 0;
    const postureMilBonus = posture === 'defend' ? 20 : posture === 'attack' ? 16 : 4;
    const hasSiege = myUnits.some((u) => UNITS[u.typeId].unitClass === 'siege');
    const hasRanged = myUnits.some((u) => UNITS[u.typeId].unitClass === 'ranged');

    for (const keep of myKeeps) {
      const frontierDist = influence.frontierMap[keep.tileKey] ?? 99;
      const frontierBonus = frontierDist <= 6 ? 8 : 0;

      for (const uid of UNIT_IDS) {
        if (!canTrainUnit(cur, houseId, keep.id, uid)) continue;
        const def = UNITS[uid];
        const upkeep = getUnitUpkeep(house, uid);

        // Avoid bankruptcy Mutiny!
        if (upkeep > 0 && netCoin - upkeep < 0 && house.resources.coin < 12) {
          continue;
        }

        let score = 38 + needUnitsFactor + postureMilBonus + frontierBonus;
        if (def.houseId === houseId) score += 16; // Prefer faction signature unit
        if (uid === 'men_at_arms' || uid === 'crossbowman' || uid === 'knight') score += 12;
        if (uid === 'spearman') score += 8;
        if (uid === 'militia') score += myUnits.length === 0 ? 10 : -8;
        if (def.unitClass === 'siege') {
          score += posture === 'attack' && !hasSiege ? 22 : -14;
        }
        if (def.unitClass === 'ranged' && !hasRanged) score += 10;

        // Slight efficiency adjustment by cost
        const cost = getUnitMatCost(house, uid);
        score -= cost * 0.3;

        candidates.push({
          kind: 'train',
          keepId: keep.id,
          unitId: uid,
          score: Math.max(0, Math.min(100, score)),
        });
      }
    }

    // 3. Tile Improvement Construction
    const ownedBuildableTiles = Object.values(cur.tiles).filter(
      (t) => t.ownerHouseId === houseId && t.keepId !== null && t.improvement === null,
    );

    const activeWrits = cur.crown.activeWrits.filter((w) => w.completedByHouseId === null);
    const wantsMarketsWrit = activeWrits.some((w) => w.writId === 'writ_markets');
    const wantsIronWrit = activeWrits.some((w) => w.writId === 'writ_iron');

    for (const tile of ownedBuildableTiles) {
      const baseYield = computeTileYield(cur, tile.key);
      const frontierDist = influence.frontierMap[tile.key] ?? 99;
      const neighbors = getNeighbors(tile.x, tile.y, cur.gridSize).map(
        (n) => cur.tiles[coordKey(n.x, n.y)]!,
      );

      for (const impId of IMPROVEMENT_IDS) {
        if (!canBuildImprovement(cur, houseId, tile.key, impId)) continue;
        const cost = getImprovementCost(houseId, impId);

        // Compute fast yield gain by temporarily simulating tile improvement
        const simTile = { ...tile, improvement: impId };
        const simState: GameState = {
          ...cur,
          tiles: { ...cur.tiles, [tile.key]: simTile },
        };
        const afterYield = computeTileYield(simState, tile.key);
        const dFood = afterYield.food - baseYield.food;
        const dMat = afterYield.materials - baseYield.materials;
        const dCoin = afterYield.coin - baseYield.coin;

        let score = 20 + (dFood * 7 + dMat * 8 + dCoin * 7) * personality.econBuildBias - cost * 0.8;

        // Need coin? Boost coin producers
        if (netCoin <= 2 && dCoin > 0) score += 16;

        // Special building bonuses
        if (impId === HOUSES[houseId].uniqueImprovementId) score += 12;
        if (impId === 'war_camp') score += 26;
        if (impId === 'smithy') {
          const hasOre = neighbors.some(
            (n) =>
              n.ownerHouseId === houseId &&
              (n.improvement === 'iron_mine' || n.improvement === 'deep_smeltery'),
          );
          const hasMill = neighbors.some(
            (n) => n.ownerHouseId === houseId && n.improvement === 'lumber_mill',
          );
          score += hasOre && hasMill ? 30 : -12;
        }
        if (impId === 'market' && wantsMarketsWrit) score += 14 * personality.writPriority;
        if ((impId === 'iron_mine' || impId === 'deep_smeltery') && wantsIronWrit) {
          score += 14 * personality.writPriority;
        }
        if (impId === 'palisade') {
          score =
            frontierDist <= 4
              ? 36 * personality.fortificationBias + (posture === 'defend' ? 18 : 0)
              : 10;
        } else if (impId === 'watchtower' || impId === 'signal_bastion') {
          score =
            frontierDist <= 6
              ? 38 * personality.watchtowerPriority + (impId === 'signal_bastion' ? 12 : 0)
              : 16;
        }

        // Penalize building when army is empty
        if (myUnits.length === 0 && cur.turnNumber >= 2) {
          score -= 18;
        }

        candidates.push({
          kind: 'build',
          tileKey: tile.key,
          improvementId: impId,
          score: Math.max(0, Math.min(100, score)),
        });
      }
    }

    // 4. Voluntary Regent's Tithe
    if (canPayRegentsTithe(cur, houseId) && house.resources.coin >= 26) {
      candidates.push({
        kind: 'tithe',
        score: Math.min(100, 48 * personality.writPriority + (house.favor >= 20 ? 22 : 0)),
      });
    }

    // 5. Crown Audience (never drop below 30 Favor while pursuing Mandate!)
    if (!house.audienceUsedThisTurn) {
      const pursuingMandate =
        cur.mode === 'dominion' &&
        (cur.crown.claimantHouseId === houseId ||
          (house.favor >= 18 && myKeeps.length >= 3 && personality.mandatePriority >= 1.0));

      const canSpendFavor = (cost: number): boolean =>
        house.favor >= cost && (!pursuingMandate || house.favor - cost >= MANDATE_MIN_FAVOR);

      if (canSpendFavor(AUDIENCE_PETITION_FAVOR) && getEligibleUnownedDecrees(house).length > 0) {
        candidates.push({
          kind: 'petition',
          score: 52,
        });
      }
      if (canSpendFavor(AUDIENCE_GRANT_FAVOR)) {
        if (house.resources.materials < 8) {
          candidates.push({ kind: 'grant', resource: 'materials', score: 46 });
        } else if (house.resources.coin < 8) {
          candidates.push({ kind: 'grant', resource: 'coin', score: 46 });
        }
      }
    }

    if (candidates.length === 0) break;

    // Deterministic tie-breaking
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return JSON.stringify(a).localeCompare(JSON.stringify(b));
    });

    const best = candidates[0]!;
    if (best.score < MIN_ACTION_SCORE) break;

    let next = cur;
    if (best.kind === 'annex') {
      next = annexVillage(cur, houseId, best.tileKey);
    } else if (best.kind === 'train') {
      next = trainUnit(cur, houseId, best.keepId, best.unitId);
    } else if (best.kind === 'build') {
      next = buildImprovement(cur, houseId, best.tileKey, best.improvementId);
    } else if (best.kind === 'tithe') {
      next = payRegentsTithe(cur, houseId);
    } else if (best.kind === 'petition') {
      next = performPetitionCharter(cur, houseId);
    } else if (best.kind === 'grant') {
      next = performCrownGrant(cur, houseId, best.resource);
    }

    if (next === cur) break;
    cur = resolvePendingAiDecisions(next, houseId, influence);
    actionsUsed += 1;
  }

  return { state: cur, actionsUsed };
}
