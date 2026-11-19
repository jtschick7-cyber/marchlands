import { describe, expect, it } from 'vitest';
import type { GameState, KeepState, UnitState } from '../../types/game.ts';
import {
  KEEP_BASE_MAX_HP,
  KEEP_GARRISON_MAX_HP,
  UNITS,
  VILLAGE_SEIZE_KEEP_HP,
} from '../../data/index.ts';
import { coordKey } from '../coords.ts';
import { createInitialGameState, addLifetimeCoin, getKeepArmyCap } from '../stateHelpers.ts';
import { getReachableTiles, moveUnit } from '../movement.ts';
import {
  attackKeep,
  attackUnit,
  attackVillage,
  pillageTile,
  previewUnitCombat,
  razeFortification,
} from '../combat.ts';
import {
  annexVillage,
  buildImprovement,
  canBuildImprovement,
  canTrainUnit,
  computeTileYield,
  keepHasSmithyCombo,
  processEndOfTurnHealingAndAttrition,
  processHarvestAndUpkeep,
  trainUnit,
} from '../economy.ts';
import { captureKeep, claimKeepTerritory, rehomeUnitManually } from '../capture.ts';

function makeTestUnit(
  id: string,
  houseId: UnitState['houseId'],
  typeId: UnitState['typeId'],
  x: number,
  y: number,
  homeKeepId: string,
  overrides: Partial<UnitState> = {},
): UnitState {
  const def = UNITS[typeId];
  return {
    id,
    houseId,
    typeId,
    homeKeepId,
    tileKey: coordKey(x, y),
    x,
    y,
    hp: def.maxHp,
    maxHp: def.maxHp,
    remainingMovement: def.movement,
    hasMoved: false,
    hasAttacked: false,
    spawnedOnTurn: 0,
    isMutinied: false,
    damagedSinceLastTurn: false,
    ...overrides,
  };
}

function makeFlatPlainsState(): GameState {
  const base = createInitialGameState({
    seed: 101,
    houseCount: 4,
    mode: 'dominion',
    difficulty: 'normal',
    humanHouseId: 'vane',
  });
  // Normalize all tiles to clean plains without landmarks for controlled unit tests
  const tiles = { ...base.tiles };
  for (const k of Object.keys(tiles)) {
    tiles[k] = {
      ...tiles[k]!,
      terrain: 'plains',
      hasIronDeposit: false,
      landmark: 'none',
      landmarkCleared: false,
      relicRuinId: null,
      villageHp: null,
      banditHp: null,
      improvement: null,
      fortificationHp: null,
    };
  }
  return {
    ...base,
    turnNumber: 4, // Summer baseline (no Spring/Autumn/Winter deltas)
    tiles,
    units: {},
  };
}

describe('Step 5: Combat Math, Spearman Brace, One-Shot Protection & Siege', () => {
  it('matches verified Plains Spearman Brace trades vs Knight, Gilded Lancer, and Dusk Outrider', () => {
    const state = makeFlatPlainsState();
    const vaneKeepId = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!.id;
    const corvusKeepId = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!.id;

    // 1. Knight (8/5/25) vs Spearman (6/6/22) -> 12 dmg, Spearman braces for 16 retaliation
    const s1: GameState = {
      ...state,
      units: {
        u_atk: makeTestUnit('u_atk', 'corvus', 'knight', 10, 10, corvusKeepId),
        u_def: makeTestUnit('u_def', 'vane', 'spearman', 11, 10, vaneKeepId),
      },
    };
    const p1 = previewUnitCombat(s1, 'u_atk', 'u_def')!;
    expect(p1.attackerDamage).toBe(12);
    expect(p1.retaliationDamage).toBe(16);
    expect(p1.braceTriggered).toBe(true);
    expect(p1.defenderHpAfter).toBe(10);
    expect(p1.attackerHpAfter).toBe(9);

    // 2. Gilded Lancer (9/5/26) vs Spearman (6/6/22) -> 14 dmg, 16 retaliation
    const s2: GameState = {
      ...state,
      units: {
        u_atk: makeTestUnit('u_atk', 'aurelia', 'gilded_lancer', 10, 10, corvusKeepId),
        u_def: makeTestUnit('u_def', 'vane', 'spearman', 11, 10, vaneKeepId),
      },
    };
    const p2 = previewUnitCombat(s2, 'u_atk', 'u_def')!;
    expect(p2.attackerDamage).toBe(14);
    expect(p2.retaliationDamage).toBe(16);

    // 3. Dusk Outrider (7/4/20) vs Spearman (6/6/22) -> 10 dmg, 17 retaliation
    const s3: GameState = {
      ...state,
      units: {
        u_atk: makeTestUnit('u_atk', 'corvus', 'dusk_outrider', 10, 10, corvusKeepId),
        u_def: makeTestUnit('u_def', 'vane', 'spearman', 11, 10, vaneKeepId),
      },
    };
    const p3 = previewUnitCombat(s3, 'u_atk', 'u_def')!;
    expect(p3.attackerDamage).toBe(10);
    expect(p3.retaliationDamage).toBe(17);
  });

  it('enforces One-Shot Protection: ranged never one-shots full-HP, melee counter can', () => {
    const state = makeFlatPlainsState();
    const vaneKeepId = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!.id;
    const corvusKeepId = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!.id;

    // Crossbowman (8 Atk) + Veteran Drill (+15%) + Bodkin Quivers (1.65x) vs full-HP Spearman (or Archer)
    const boostedState: GameState = {
      ...state,
      houses: {
        ...state.houses,
        vane: {
          ...state.houses.vane!,
          decreeIds: ['decree_veteran_drill', 'decree_fletcher_volleys'],
        },
      },
      units: {
        u_xbow: makeTestUnit('u_xbow', 'vane', 'crossbowman', 10, 10, vaneKeepId),
        u_spear: makeTestUnit('u_spear', 'corvus', 'spearman', 12, 10, corvusKeepId),
        u_knight: makeTestUnit('u_knight', 'corvus', 'knight', 5, 5, corvusKeepId),
        u_arch: makeTestUnit('u_arch', 'vane', 'archer', 6, 5, vaneKeepId),
      },
    };

    // Ranged unit with massive bonuses STILL cannot one-shot full-HP Spearman
    const rangedPreview = previewUnitCombat(boostedState, 'u_xbow', 'u_spear')!;
    expect(rangedPreview.defenderHpAfter).toBeGreaterThanOrEqual(1);
    expect(rangedPreview.defenderDestroyed).toBe(false);

    // Melee unit with counter advantage (Knight -> Archer) CAN one-shot full-HP Archer
    const meleeCounterPreview = previewUnitCombat(boostedState, 'u_knight', 'u_arch')!;
    expect(meleeCounterPreview.defenderDestroyed).toBe(true);
    expect(meleeCounterPreview.oneShotProtectionTriggered).toBe(false);
  });

  it('verifies Siege Ram 1-hit raze / 2-hit Keep & Sapper Crew 2-hit raze with zero retaliation', () => {
    const state = makeFlatPlainsState();
    const vaneKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!;
    const corvusKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!;
    const palKey = coordKey(10, 10);

    // Place enemy Palisade with Mortar & Stonework
    const s: GameState = {
      ...state,
      houses: {
        ...state.houses,
        vane: {
          ...state.houses.vane!,
          decreeIds: ['decree_masonry_reinforcement'],
        },
      },
      tiles: {
        ...state.tiles,
        [palKey]: {
          ...state.tiles[palKey]!,
          ownerHouseId: 'vane',
          keepId: vaneKeep.id,
          improvement: 'palisade',
          fortificationHp: 12,
        },
      },
      units: {
        u_ram: makeTestUnit('u_ram', 'corvus', 'siege_ram', 9, 10, corvusKeep.id),
        u_sapper: makeTestUnit('u_sapper', 'corvus', 'sapper_crew', 11, 10, corvusKeep.id),
      },
    };

    // Sapper Crew hits Masonry Palisade for 8 dmg (12 -> 4), 2-hit raze
    const afterSapper1 = razeFortification(s, 'u_sapper', palKey);
    expect(afterSapper1.tiles[palKey]!.fortificationHp).toBe(4);
    expect(afterSapper1.tiles[palKey]!.improvement).toBe('palisade');
    expect(afterSapper1.units.u_sapper!.hp).toBe(18); // zero retaliation

    const afterSapper2 = razeFortification(
      {
        ...afterSapper1,
        units: {
          ...afterSapper1.units,
          u_sapper: { ...afterSapper1.units.u_sapper!, hasAttacked: false },
        },
      },
      'u_sapper',
      palKey,
    );
    expect(afterSapper2.tiles[palKey]!.improvement).toBeNull();

    // Siege Ram 1-hit razes even a Masonry Palisade (12 dmg >= 12 HP)
    const afterRam = razeFortification(s, 'u_ram', palKey);
    expect(afterRam.tiles[palKey]!.improvement).toBeNull();

    // Siege Ram 2-hit neutralizes standard Keep (24 HP -> 11 -> captured at 12 HP)
    const keepTest: GameState = {
      ...state,
      units: {
        u_ram: makeTestUnit(
          'u_ram',
          'corvus',
          'siege_ram',
          vaneKeep.x + 1,
          vaneKeep.y,
          corvusKeep.id,
        ),
      },
    };
    const hit1 = attackKeep(keepTest, 'u_ram', vaneKeep.id);
    expect(hit1.keeps[vaneKeep.id]!.keepHp).toBe(11);
    expect(hit1.units.u_ram!.hp).toBe(24); // zero retaliation

    const hit2 = attackKeep(
      {
        ...hit1,
        units: { ...hit1.units, u_ram: { ...hit1.units.u_ram!, hasAttacked: false } },
      },
      'u_ram',
      vaneKeep.id,
    );
    expect(hit2.keeps[vaneKeep.id]!.ownerHouseId).toBe('corvus');
    expect(hit2.keeps[vaneKeep.id]!.keepHp).toBe(Math.floor(KEEP_BASE_MAX_HP / 2));
  });

  it('enforces Corvus double Pillage loot and Flanking immunity on Vanguard Spearman', () => {
    const state = makeFlatPlainsState();
    const vaneKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!;
    const corvusKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!;
    const farmKey = coordKey(10, 10);

    const s: GameState = {
      ...state,
      tiles: {
        ...state.tiles,
        [farmKey]: {
          ...state.tiles[farmKey]!,
          ownerHouseId: 'vane',
          keepId: vaneKeep.id,
          improvement: 'farm',
        },
      },
      units: {
        u_corvus: makeTestUnit('u_corvus', 'corvus', 'dusk_outrider', 10, 10, corvusKeep.id),
      },
    };

    const pillaged = pillageTile(s, 'u_corvus');
    expect(pillaged.tiles[farmKey]!.improvement).toBeNull();
    // Farm matCost = 6 -> floor(3) * 2 = +6 Mat, baseCoin 3 * 2 = +6 Coin
    expect(pillaged.houses.corvus!.resources.materials).toBe(
      s.houses.corvus!.resources.materials + 6,
    );
    expect(pillaged.houses.corvus!.resources.coin).toBe(s.houses.corvus!.resources.coin + 6);
    // Dusk Outrider keeps remaining movement after pillaging (disengage)
    expect(pillaged.units.u_corvus!.hasAttacked).toBe(true);
    expect(pillaged.units.u_corvus!.remainingMovement).toBe(4);
  });
});

describe('Step 5: Movement, ZoC & Action Order', () => {
  it('enforces ZoC stop, minimum-move rule, and Dusk Outrider ZoC/Forest/disengage exemptions', () => {
    const state = makeFlatPlainsState();
    const vaneKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!;
    const corvusKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!;

    // Place a River in Spring (cost 3) next to a Spearman (mov 2) -> minimum-move lets it enter
    const springState: GameState = {
      ...state,
      turnNumber: 1, // Spring: river cost 3
      tiles: {
        ...state.tiles,
        [coordKey(11, 10)]: { ...state.tiles[coordKey(11, 10)]!, terrain: 'river' },
        [coordKey(10, 11)]: { ...state.tiles[coordKey(10, 11)]!, terrain: 'forest' },
      },
      units: {
        u_spear: makeTestUnit('u_spear', 'vane', 'spearman', 10, 10, vaneKeep.id),
        u_enemy: makeTestUnit('u_enemy', 'corvus', 'spearman', 12, 12, corvusKeep.id),
        u_outrider: makeTestUnit('u_outrider', 'corvus', 'dusk_outrider', 9, 11, corvusKeep.id),
      },
    };

    const spearReach = getReachableTiles(springState, 'u_spear');
    expect(spearReach[coordKey(11, 10)]).toBe(0); // Minimum-move into Spring river

    // Entering (11,11) is adjacent to enemy at (12,12) -> ZoC stops movement (rem = 0)
    expect(spearReach[coordKey(11, 11)]).toBe(0);

    // Dusk Outrider enters Forest at (10,11) for cost 1 and ignores ZoC of u_spear at (10,10)
    const outriderReach = getReachableTiles(springState, 'u_outrider');
    expect(outriderReach[coordKey(10, 11)]).toBe(3); // 4 - 1 = 3 remaining even adjacent to enemy
    expect(outriderReach[coordKey(11, 11)]).toBe(2); // Keeps moving past enemy ZoC

    // Normal unit cannot move after attacking; Dusk Outrider can
    const attacked = attackUnit(
      {
        ...springState,
        units: {
          u_spear: makeTestUnit('u_spear', 'vane', 'spearman', 10, 10, vaneKeep.id),
          u_outrider: makeTestUnit('u_outrider', 'corvus', 'dusk_outrider', 10, 11, corvusKeep.id),
        },
      },
      'u_outrider',
      'u_spear',
    );
    expect(Object.keys(getReachableTiles(attacked, 'u_outrider')).length).toBeGreaterThan(0);
  });
});

describe('Step 5: Economy, Adjacency, Capture, Sticky Borders, Orphans & Manual Re-homing', () => {
  it('computes Farm+River, Lumber Mill+2 Forests, and Smithy+Deep Smeltery+Lumber Mill combo', () => {
    const state = makeFlatPlainsState();
    const ironKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'ironhelm')!;

    const tFarm = coordKey(10, 10);
    const tRiver = coordKey(10, 11);
    const tMill = coordKey(12, 10);
    const tFor1 = coordKey(13, 10);
    const tFor2 = coordKey(13, 11);
    const tSmithy = coordKey(11, 10);
    const tSmelt = coordKey(11, 11);

    const s: GameState = {
      ...state,
      tiles: {
        ...state.tiles,
        [tFarm]: { ...state.tiles[tFarm]!, ownerHouseId: 'ironhelm', keepId: ironKeep.id, improvement: 'farm' },
        [tRiver]: { ...state.tiles[tRiver]!, terrain: 'river' },
        [tMill]: { ...state.tiles[tMill]!, ownerHouseId: 'ironhelm', keepId: ironKeep.id, improvement: 'lumber_mill' },
        [tFor1]: { ...state.tiles[tFor1]!, terrain: 'forest' },
        [tFor2]: { ...state.tiles[tFor2]!, terrain: 'forest' },
        [tSmithy]: { ...state.tiles[tSmithy]!, ownerHouseId: 'ironhelm', keepId: ironKeep.id, improvement: 'smithy' },
        [tSmelt]: {
          ...state.tiles[tSmelt]!,
          terrain: 'mountain',
          ownerHouseId: 'ironhelm',
          keepId: ironKeep.id,
          improvement: 'deep_smeltery',
        },
      },
    };

    expect(computeTileYield(s, tFarm).food).toBe(4); // 2 base + 2 river
    expect(computeTileYield(s, tMill).materials).toBe(4); // 2 base + 2 from 2 forests
    expect(keepHasSmithyCombo(s, ironKeep.id)).toBe(true); // deep_smeltery satisfies iron_mine adjacency
  });

  it('enforces War Camp limits (14 Mat, 1/Keep, 2/House) and summoning sickness on trainUnit', () => {
    const state = makeFlatPlainsState();
    const corvusKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!;
    const t1 = coordKey(corvusKeep.x + 1, corvusKeep.y);
    const t2 = coordKey(corvusKeep.x - 1, corvusKeep.y);

    let s: GameState = {
      ...state,
      houses: {
        ...state.houses,
        corvus: {
          ...state.houses.corvus!,
          resources: { materials: 50, coin: 20 },
        },
      },
    };

    expect(canBuildImprovement(s, 'corvus', t1, 'war_camp')).toBe(true);
    s = buildImprovement(s, 'corvus', t1, 'war_camp');
    expect(s.houses.corvus!.resources.materials).toBe(36); // 50 - 14
    expect(getKeepArmyCap(s, corvusKeep.id)).toBe(4); // Tier 1 (3) + War Camp (1)
    // Max 1 War Camp per Keep
    expect(canBuildImprovement(s, 'corvus', t2, 'war_camp')).toBe(false);

    // Train unit -> summoning sickness & no spawn-turn heal
    expect(canTrainUnit(s, 'corvus', corvusKeep.id, 'spearman')).toBe(true);
    s = trainUnit(s, 'corvus', corvusKeep.id, 'spearman');
    const trained = Object.values(s.units)[0]!;
    expect(trained.hasMoved).toBe(true);
    expect(trained.hasAttacked).toBe(true);
    expect(trained.spawnedOnTurn).toBe(s.turnNumber);

    // Damage trained unit and run end-of-turn heal -> should NOT heal on spawn turn
    const damaged: GameState = {
      ...s,
      units: { ...s.units, [trained.id]: { ...trained, hp: 10, hasMoved: false, hasAttacked: false } },
    };
    const afterHeal = processEndOfTurnHealingAndAttrition(damaged, 'corvus');
    expect(afterHeal.units[trained.id]!.hp).toBe(10);
  });

  it('enforces escalating Coin milestones, Keep capture conversions, sticky borders, orphans & manual re-homing', () => {
    const state = makeFlatPlainsState();
    const vaneKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!;
    const corvusKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!;

    // Escalating Coin Milestones: 25 -> 65 -> 125
    let vaneHouse = addLifetimeCoin(state.houses.vane!, 25);
    expect(vaneHouse.pendingDraftCount).toBe(1);
    expect(vaneHouse.nextCoinMilestone).toBe(65);
    vaneHouse = addLifetimeCoin(vaneHouse, 40);
    expect(vaneHouse.pendingDraftCount).toBe(2);
    expect(vaneHouse.nextCoinMilestone).toBe(125);

    // Add a 2nd Keep for Vane so capturing Vane's 1st Keep triggers orphan logic instead of elimination
    const secondKeep: KeepState = {
      id: 'keep_extra',
      name: 'Greenhollow',
      ownerHouseId: 'vane',
      tileKey: coordKey(10, 10),
      x: 10,
      y: 10,
      tier: 1,
      isCapital: false,
      specialization: 'none',
      keepHp: KEEP_BASE_MAX_HP,
      maxKeepHp: KEEP_BASE_MAX_HP,
      damagedLastRound: false,
      foodProgress: 0,
      repeatMilestonesClaimed: 0,
    };

    const lodgeTile = coordKey(vaneKeep.x + 1, vaneKeep.y);
    let s: GameState = {
      ...state,
      keeps: {
        ...state.keeps,
        [vaneKeep.id]: {
          ...vaneKeep,
          tier: 2,
          specialization: 'garrison',
          maxKeepHp: KEEP_GARRISON_MAX_HP,
          keepHp: 1,
        },
        [secondKeep.id]: secondKeep,
      },
      tiles: {
        ...state.tiles,
        [lodgeTile]: {
          ...state.tiles[lodgeTile]!,
          terrain: 'forest',
          ownerHouseId: 'vane',
          keepId: vaneKeep.id,
          improvement: 'foresters_lodge',
        },
      },
      units: {
        // 4 units homed at vaneKeep (1 free company + 3 normal) + 2 already at secondKeep (only 1 open slot!)
        u_l1: makeTestUnit('u_l1', 'vane', 'longbowman', 10, 10, vaneKeep.id), // mat 13 -> re-homes to secondKeep
        u_m1: makeTestUnit('u_m1', 'vane', 'militia', 10, 11, vaneKeep.id), // mat 6 -> becomes orphaned
        u_fc: makeTestUnit('u_fc', 'vane', 'free_company_spearman', 11, 10, vaneKeep.id), // disbands!
        u_s1: makeTestUnit('u_s1', 'vane', 'spearman', 9, 10, secondKeep.id),
        u_s2: makeTestUnit('u_s2', 'vane', 'spearman', 9, 11, secondKeep.id),
      },
    };
    s = claimKeepTerritory(s, secondKeep.id);

    const captured = captureKeep(s, vaneKeep.id, 'corvus');
    // Specialization preserved, keepHp = floor(34/2) = 17
    expect(captured.keeps[vaneKeep.id]!.specialization).toBe('garrison');
    expect(captured.keeps[vaneKeep.id]!.keepHp).toBe(17);
    // Forester's Lodge converts to Lumber Mill on capture
    expect(captured.tiles[lodgeTile]!.improvement).toBe('lumber_mill');
    // Free Company disbanded; Longbowman re-homed to secondKeep; Militia orphaned
    expect(captured.units.u_fc).toBeUndefined();
    expect(captured.units.u_l1!.homeKeepId).toBe(secondKeep.id);
    expect(captured.units.u_m1!.homeKeepId).toBe('orphaned');

    // Manual Re-homing: move orphaned Militia onto secondKeep after freeing a slot
    const withSlotOpen: GameState = {
      ...captured,
      units: {
        ...captured.units,
        u_m1: { ...captured.units.u_m1!, tileKey: secondKeep.tileKey, x: secondKeep.x, y: secondKeep.y },
      },
    };
    delete withSlotOpen.units.u_s1;
    const rehomed = rehomeUnitManually(withSlotOpen, 'u_m1');
    expect(rehomed.units.u_m1!.homeKeepId).toBe(secondKeep.id);

    // Sticky Borders: a Keep expanding to Tier 2 never steals tiles already claimed by another Keep
    const stickyCheck: GameState = {
      ...state,
      keeps: {
        ...state.keeps,
        [corvusKeep.id]: { ...corvusKeep, tier: 2 },
      },
    };
    const neighborTileKey = coordKey(corvusKeep.x + 2, corvusKeep.y);
    stickyCheck.tiles[neighborTileKey] = {
      ...stickyCheck.tiles[neighborTileKey]!,
      keepId: vaneKeep.id,
      ownerHouseId: 'vane',
    };
    const afterClaim = claimKeepTerritory(stickyCheck, corvusKeep.id);
    expect(afterClaim.tiles[neighborTileKey]!.keepId).toBe(vaneKeep.id);
  });

  it('handles Peaceful Annexation, Violent Seizure, Coin Bankruptcy Mutiny, and Watchtower reveals', () => {
    const state = makeFlatPlainsState();
    const vaneKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!;
    const vKey = coordKey(10, 10);
    const wtKey = coordKey(14, 14);

    const s: GameState = {
      ...state,
      houses: {
        ...state.houses,
        vane: { ...state.houses.vane!, resources: { materials: 20, coin: 20 }, favor: 3 },
      },
      keeps: {
        ...state.keeps,
        [vaneKeep.id]: { ...vaneKeep, foodProgress: 15 },
      },
      tiles: {
        ...state.tiles,
        [vKey]: {
          ...state.tiles[vKey]!,
          landmark: 'frontier_village',
          villageHp: 12,
        },
        [wtKey]: {
          ...state.tiles[wtKey]!,
          terrain: 'hills',
          landmark: 'ancient_watchtower',
        },
      },
      units: {
        u_v: makeTestUnit('u_v', 'vane', 'spearman', 10, 11, vaneKeep.id),
        u_wt: makeTestUnit('u_wt', 'vane', 'spearman', 13, 14, vaneKeep.id),
      },
    };

    // Peaceful Annexation: -15 Coin, -12 Food from Keep, +1 Favor, 24/24 HP
    const annexed = annexVillage(s, 'vane', vKey);
    expect(annexed.houses.vane!.resources.coin).toBe(5);
    expect(annexed.keeps[vaneKeep.id]!.foodProgress).toBe(3);
    expect(annexed.houses.vane!.favor).toBe(4);
    const newKeep = Object.values(annexed.keeps).find((k) => k.tileKey === vKey)!;
    expect(newKeep.keepHp).toBe(KEEP_BASE_MAX_HP);

    // Violent Seizure: reducing villageHp to 0 -> 8/24 HP and -2 Favor
    const weakVillageState: GameState = {
      ...s,
      tiles: { ...s.tiles, [vKey]: { ...s.tiles[vKey]!, villageHp: 1 } },
    };
    const seized = attackVillage(weakVillageState, 'u_v', vKey);
    const seizedKeep = Object.values(seized.keeps).find((k) => k.tileKey === vKey)!;
    expect(seizedKeep.keepHp).toBe(VILLAGE_SEIZE_KEEP_HP);
    expect(seized.houses.vane!.favor).toBe(1); // 3 - 2

    // Ancient Watchtower visit -> per-House reveal + firstVisitedByHouseId + even-turn harvest yield
    const onWatchtower = moveUnit(s, 'u_wt', wtKey);
    expect(onWatchtower.tiles[wtKey]!.revealedByHouseIds).toContain('vane');
    expect(onWatchtower.tiles[wtKey]!.firstVisitedByHouseId).toBe('vane');
    expect(onWatchtower.houses.vane!.stats.watchtowersReached).toBe(1);

    const afterHarvest = processHarvestAndUpkeep(onWatchtower, 'vane');
    // Turn 4 is even -> +1 Favor from Watchtower occupation
    expect(afterHarvest.houses.vane!.favor).toBe(4);

    // Coin Bankruptcy Mutiny: 0 coin, high upkeep -> coin stays 0, highest-upkeep unit takes 8 true dmg
    const bankruptState: GameState = {
      ...state,
      houses: {
        ...state.houses,
        vane: { ...state.houses.vane!, resources: { materials: 0, coin: 0 } },
      },
      units: {
        u_k1: makeTestUnit('u_k1', 'vane', 'knight', 10, 10, vaneKeep.id),
        u_k2: makeTestUnit('u_k2', 'vane', 'knight', 10, 11, vaneKeep.id),
        u_k3: makeTestUnit('u_k3', 'vane', 'knight', 11, 10, vaneKeep.id),
      },
    };
    const afterMutiny = processHarvestAndUpkeep(bankruptState, 'vane');
    expect(afterMutiny.houses.vane!.resources.coin).toBe(0);
    expect(afterMutiny.units.u_k1!.hp).toBe(UNITS.knight.maxHp - 8);
    expect(afterMutiny.units.u_k1!.isMutinied).toBe(true);
  });
});
