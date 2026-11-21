import { describe, expect, it } from 'vitest';
import type { GameState, KeepState, UnitState } from '../../types/game.ts';
import {
  COMMANDER_RANSOM_COIN,
  COMMANDER_RANSOM_FAVOR,
  COMMANDER_WOUNDED_TURNS,
  KEEP_GARRISON_HP_BONUS,
  KEEP_TIER1_MAX_HP,
  KEEP_TIER2_MAX_HP,
  KEEP_TIER3_IRON_COST,
  KEEP_TIER3_MAX_HP,
  PALISADE_LV1_HP,
  REINFORCE_HEAL_AMOUNT,
  UNITS,
  VILLAGE_SEIZE_KEEP_HP,
  WALL_MELEE_SPIKE_DAMAGE,
} from '../../data/index.ts';
import { coordKey, chebyshevDist } from '../coords.ts';
import { recomputeHouseFog } from '../fog.ts';
import { createInitialGameState, addLifetimeCoin, getKeepArmyCap } from '../stateHelpers.ts';
import { getReachableTiles, isDiagonalWallBlocked, moveUnit } from '../movement.ts';
import {
  activateOverwatch,
  attackKeep,
  attackUnit,
  attackVillage,
  deployTrebuchet,
  fireKeepGarrisonVolley,
  pillageTile,
  previewUnitCombat,
  razeFortification,
  useCommanderSkill,
} from '../combat.ts';
import {
  annexVillage,
  buildImprovement,
  buildOutpost,
  buildRoad,
  canBuildImprovement,
  canTrainUnit,
  clearTimber,
  computeTileYield,
  demolishImprovement,
  disbandUnit,
  fortifyUnit,
  keepHasSmithyCombo,
  processEndOfTurnHealingAndAttrition,
  processHarvestAndUpkeep,
  reinforceUnit,
  repairKeep,
  trainUnit,
  upgradeImprovement,
  upgradeKeepToTier3,
} from '../economy.ts';
import { getNextIdleUnit, canUnitAct } from '../queries.ts';
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
    xp: 0,
    battleHonors: [],
    isFortified: false,
    isOverwatch: false,
    isDeployed: false,
    isCommander: typeId === 'lord_commander',
    movedOpenTilesThisTurn: 0,
    commanderBuffUntilTurn: 0,
    overwatchRangeBonusUntilTurn: 0,
    ...overrides,
  };
}

function makeFlatPlainsState(): GameState {
  const base = createInitialGameState({
    seed: 101,
    houseCount: 4,
    mode: 'dominion',
    mapPreset: 'compact',
    difficulty: 'normal',
    humanHouseId: 'vane',
  });
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
      highSeatHp: null,
      improvement: null,
      improvementLevel: 1,
      hasRoad: false,
      fortificationHp: null,
    };
  }
  return {
    ...base,
    turnNumber: 4, // Summer baseline
    tiles,
    units: {},
  };
}

describe('Step 5 (v2.0): Closed 4-Way Combat, Crossbow AP, Brace, OSP & Class Tactics', () => {
  it('enforces 4-way counter loop, Crossbow 30% Armor-Piercing, Spearman Brace & One-Shot Protection', () => {
    const state = makeFlatPlainsState();
    const vaneKeepId = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!.id;
    const corvusKeepId = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!.id;

    // 1. Knight vs Spearman -> Spearman Brace triggers
    const sBrace: GameState = {
      ...state,
      units: {
        u_atk: makeTestUnit('u_atk', 'corvus', 'knight', 10, 10, corvusKeepId),
        u_def: makeTestUnit('u_def', 'vane', 'spearman', 11, 10, vaneKeepId),
      },
    };
    const pBrace = previewUnitCombat(sBrace, 'u_atk', 'u_def')!;
    expect(pBrace.braceTriggered).toBe(true);
    expect(pBrace.retaliationDamage).toBeGreaterThanOrEqual(pBrace.attackerDamage);

    // 2. Closed 4-way loop: Men-at-Arms counters Spearman; Crossbow counters Men-at-Arms with 30% AP
    const sLoop: GameState = {
      ...state,
      units: {
        u_maa: makeTestUnit('u_maa', 'corvus', 'men_at_arms', 10, 10, corvusKeepId),
        u_spear: makeTestUnit('u_spear', 'vane', 'spearman', 11, 10, vaneKeepId),
        u_xbow: makeTestUnit('u_xbow', 'vane', 'crossbowman', 10, 12, vaneKeepId),
        u_arch: makeTestUnit('u_arch', 'vane', 'archer', 12, 12, vaneKeepId),
        u_knight: makeTestUnit('u_knight', 'corvus', 'knight', 13, 12, corvusKeepId),
      },
    };
    const pInfVsSpear = previewUnitCombat(sLoop, 'u_maa', 'u_spear')!;
    expect(pInfVsSpear.attackerDamage).toBeGreaterThanOrEqual(12); // Infantry counters Spearman (+40%)
    expect(pInfVsSpear.shieldPushTriggered).toBe(true);

    const pXbowVsMaa = previewUnitCombat(sLoop, 'u_xbow', 'u_maa')!;
    const pArchVsMaa = previewUnitCombat(sLoop, 'u_arch', 'u_maa')!;
    expect(pXbowVsMaa.attackerDamage).toBeGreaterThan(pArchVsMaa.attackerDamage); // 30% AP vs Def >= 5
    // Ranged NEVER one-shots full-HP target (One-Shot Protection)
    expect(pXbowVsMaa.defenderHpAfter).toBeGreaterThanOrEqual(1);

    // Melee with counter advantage (Knight -> Archer) CAN one-shot full-HP target
    const pKnightVsArch = previewUnitCombat(sLoop, 'u_knight', 'u_arch')!;
    expect(pKnightVsArch.defenderDestroyed).toBe(true);
    expect(pKnightVsArch.oneShotProtectionTriggered).toBe(false);
  });

  it('executes Infantry Shield Push, Cavalry Lance Charge, Ranged Overwatch & Trebuchet Deploy', () => {
    const state = makeFlatPlainsState();
    const vaneKeepId = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!.id;
    const corvusKeepId = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!.id;

    // 1. Infantry Shield Push pushes defender back 1 tile off the chokepoint
    const pushState: GameState = {
      ...state,
      units: {
        u_maa: makeTestUnit('u_maa', 'corvus', 'men_at_arms', 10, 10, corvusKeepId),
        u_def: makeTestUnit('u_def', 'vane', 'spearman', 11, 10, vaneKeepId),
      },
    };
    const pushed = attackUnit(pushState, 'u_maa', 'u_def');
    expect(pushed.units.u_def!.x).toBe(12);

    // 2. Cavalry Lance Charge gains +20% Attack after moving >= 2 open tiles
    const chargeBase: GameState = {
      ...state,
      units: {
        u_cav: makeTestUnit('u_cav', 'corvus', 'knight', 10, 10, corvusKeepId),
        u_tgt: makeTestUnit('u_tgt', 'vane', 'men_at_arms', 13, 10, vaneKeepId),
      },
    };
    const movedCav = moveUnit(chargeBase, 'u_cav', coordKey(12, 10));
    expect(movedCav.units.u_cav!.movedOpenTilesThisTurn).toBeGreaterThanOrEqual(2);
    const chargePrev = previewUnitCombat(movedCav, 'u_cav', 'u_tgt')!;
    expect(chargePrev.chargeTriggered).toBe(true);

    // 3. Ranged Overwatch intercepts moving enemy unit automatically
    const owBase: GameState = {
      ...state,
      units: {
        u_arch: makeTestUnit('u_arch', 'vane', 'archer', 10, 10, vaneKeepId),
        u_enemy: makeTestUnit('u_enemy', 'corvus', 'men_at_arms', 13, 10, corvusKeepId),
      },
    };
    const armed = recomputeHouseFog(activateOverwatch(owBase, 'u_arch'), 'vane');
    expect(armed.units.u_arch!.isOverwatch).toBe(true);
    const intercepted = moveUnit(armed, 'u_enemy', coordKey(12, 10));
    expect(intercepted.units.u_enemy!.hp).toBeLessThan(UNITS.men_at_arms.maxHp);
    expect(intercepted.units.u_arch!.isOverwatch).toBe(false);

    // 4. Trebuchet must Deploy before firing from Range 3
    const trebState: GameState = {
      ...state,
      units: {
        u_treb: makeTestUnit('u_treb', 'corvus', 'trebuchet', 10, 10, corvusKeepId),
        u_tgt: makeTestUnit('u_tgt', 'vane', 'spearman', 13, 10, vaneKeepId),
      },
    };
    expect(previewUnitCombat(trebState, 'u_treb', 'u_tgt')).toBeNull(); // Undeployed cannot fire!
    const deployed = deployTrebuchet(trebState, 'u_treb');
    expect(deployed.units.u_treb!.isDeployed).toBe(true);
    const readyTreb: GameState = {
      ...deployed,
      units: { ...deployed.units, u_treb: { ...deployed.units.u_treb!, hasAttacked: false } },
    };
    const pTreb = previewUnitCombat(readyTreb, 'u_treb', 'u_tgt')!;
    expect(pTreb.attackerDamage).toBeGreaterThan(0);
  });

  it('enforces Wall Linking diagonal blocking, additive Wall cover, 50% non-siege penalty & spike damage', () => {
    const state = makeFlatPlainsState();
    const vaneKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!;
    const corvusKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!;

    // Place two orthogonal enemy Palisades at (11,10) and (10,11) -> blocks diagonal (10,10)->(11,11)
    const sWall: GameState = {
      ...state,
      tiles: {
        ...state.tiles,
        [coordKey(11, 10)]: {
          ...state.tiles[coordKey(11, 10)]!,
          ownerHouseId: 'vane',
          keepId: vaneKeep.id,
          improvement: 'palisade',
          fortificationHp: PALISADE_LV1_HP,
        },
        [coordKey(10, 11)]: {
          ...state.tiles[coordKey(10, 11)]!,
          ownerHouseId: 'vane',
          keepId: vaneKeep.id,
          improvement: 'palisade',
          fortificationHp: PALISADE_LV1_HP,
        },
      },
      units: {
        u_corvus: makeTestUnit('u_corvus', 'corvus', 'men_at_arms', 10, 10, corvusKeep.id),
        u_sapper: makeTestUnit('u_sapper', 'corvus', 'sapper_crew', 11, 9, corvusKeep.id),
      },
    };

    expect(isDiagonalWallBlocked(sWall, sWall.units.u_corvus!, 10, 10, 11, 11)).toBe(true);
    expect(getReachableTiles(sWall, 'u_corvus')[coordKey(11, 11)]).toBeUndefined();

    // Non-siege melee razing Palisade deals 50% structure damage and takes 2 spike damage
    const afterMeleeRaze = razeFortification(sWall, 'u_corvus', coordKey(11, 10));
    expect(afterMeleeRaze.units.u_corvus!.hp).toBe(UNITS.men_at_arms.maxHp - WALL_MELEE_SPIKE_DAMAGE);

    // Siege Sapper takes 0 spike damage and deals full structure damage
    const afterSapperRaze = razeFortification(sWall, 'u_sapper', coordKey(11, 10));
    expect(afterSapperRaze.units.u_sapper!.hp).toBe(UNITS.sapper_crew.maxHp);
    expect(afterSapperRaze.tiles[coordKey(11, 10)]!.fortificationHp!).toBeLessThan(
      afterMeleeRaze.tiles[coordKey(11, 10)]!.fortificationHp!,
    );
  });

  it('executes Lord-Commander aura, reworked Vane Warden Volley, Wounded + Ransom, and Corvus double Pillage', () => {
    const base = createInitialGameState({
      seed: 202,
      houseCount: 4,
      mode: 'dominion',
      mapPreset: 'compact',
      difficulty: 'normal',
      humanHouseId: 'vane',
    });

    // Turn 1 spawns every House's Lord-Commander on Capital
    const vaneCmdId = base.commanders.vane!.unitId!;
    const vaneCmd = base.units[vaneCmdId]!;
    expect(vaneCmd.isCommander).toBe(true);

    // Reworked Vane skill: Warden's Volley arms Overwatch & +1 Range on nearby ranged allies
    const flat = makeFlatPlainsState();
    const vaneKeep = Object.values(flat.keeps).find((k) => k.ownerHouseId === 'vane')!;
    const corvusKeep = Object.values(flat.keeps).find((k) => k.ownerHouseId === 'corvus')!;
    const sCmd: GameState = {
      ...flat,
      commanders: {
        ...flat.commanders,
        vane: { ...flat.commanders.vane!, unitId: 'u_cmd_vane', skillCooldown: 0 },
      },
      units: {
        u_cmd_vane: makeTestUnit('u_cmd_vane', 'vane', 'lord_commander', 10, 10, 'commander'),
        u_arch: makeTestUnit('u_arch', 'vane', 'archer', 11, 10, vaneKeep.id, { hasAttacked: true }),
        u_killer: makeTestUnit('u_killer', 'corvus', 'knight', 9, 10, corvusKeep.id),
      },
    };
    const afterVolley = useCommanderSkill(sCmd, 'vane');
    expect(afterVolley.units.u_arch!.isOverwatch).toBe(true); // Even after acting!
    expect(afterVolley.units.u_arch!.overwatchRangeBonusUntilTurn).toBe(flat.turnNumber + 1);
    expect(afterVolley.commanders.vane!.skillCooldown).toBeGreaterThan(0);

    // Defeating a Lord-Commander triggers 5-turn Wounded & awards +3 Favor + 15 Coin Ransom
    const lowCmdState: GameState = {
      ...sCmd,
      units: {
        ...sCmd.units,
        u_cmd_vane: { ...sCmd.units.u_cmd_vane!, hp: 1 },
      },
    };
    const afterSlay = attackUnit(lowCmdState, 'u_killer', 'u_cmd_vane');
    expect(afterSlay.commanders.vane!.unitId).toBeNull();
    expect(afterSlay.commanders.vane!.woundedTurnsRemaining).toBe(COMMANDER_WOUNDED_TURNS);
    expect(afterSlay.houses.corvus!.favor).toBe(
      lowCmdState.houses.corvus!.favor + COMMANDER_RANSOM_FAVOR,
    );
    expect(afterSlay.houses.corvus!.resources.coin).toBe(
      lowCmdState.houses.corvus!.resources.coin + COMMANDER_RANSOM_COIN,
    );

    // Corvus double Pillage
    const farmKey = coordKey(14, 14);
    const pillageState: GameState = {
      ...flat,
      tiles: {
        ...flat.tiles,
        [farmKey]: {
          ...flat.tiles[farmKey]!,
          ownerHouseId: 'vane',
          keepId: vaneKeep.id,
          improvement: 'farm',
        },
      },
      units: {
        u_corvus: makeTestUnit('u_corvus', 'corvus', 'dusk_outrider', 14, 14, corvusKeep.id),
      },
    };
    const pillaged = pillageTile(pillageState, 'u_corvus');
    expect(pillaged.tiles[farmKey]!.improvement).toBeNull();
    expect(pillaged.houses.corvus!.resources.materials).toBe(
      pillageState.houses.corvus!.resources.materials + 6,
    );
    expect(pillaged.houses.corvus!.resources.coin).toBe(
      pillageState.houses.corvus!.resources.coin + 8, // 4 base * 2
    );
  });
});

describe('Step 5 (v2.0): 4-Resource Economy, Upgrades, Roads, Outposts, Tier-3 Citadel & Reinforce', () => {
  it('supports Iron yields, Lv2 Upgrades, Roads, Clear Timber, Frontier Outposts, Tier-3 Citadel & Arrow Slits', () => {
    const state = makeFlatPlainsState();
    const vaneKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!;
    const corvusKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!;
    const mineKey = coordKey(vaneKeep.x + 1, vaneKeep.y);
    const forestKey = coordKey(vaneKeep.x - 1, vaneKeep.y);
    const roadKey = coordKey(vaneKeep.x, vaneKeep.y + 1);
    const allKeeps = Object.values(state.keeps);
    const outpostTile = Object.values(state.tiles).find(
      (t) =>
        t.ownerHouseId === null &&
        t.x >= 2 &&
        t.x < state.gridSize - 2 &&
        t.y >= 2 &&
        t.y < state.gridSize - 2 &&
        allKeeps.every((k) => chebyshevDist(k.x, k.y, t.x, t.y) >= 4),
    )!;
    const outpostKey = outpostTile.key;

    let s: GameState = {
      ...state,
      houses: {
        ...state.houses,
        vane: {
          ...state.houses.vane!,
          resources: { materials: 80, iron: 30, coin: 60 },
        },
      },
      keeps: {
        ...state.keeps,
        [vaneKeep.id]: {
          ...vaneKeep,
          tier: 2,
          specialization: 'forge_seat',
          maxKeepHp: KEEP_TIER2_MAX_HP,
          keepHp: KEEP_TIER2_MAX_HP,
          foodProgress: 165,
        },
      },
      tiles: {
        ...state.tiles,
        [mineKey]: {
          ...state.tiles[mineKey]!,
          terrain: 'hills',
          hasIronDeposit: true,
          ownerHouseId: 'vane',
          keepId: vaneKeep.id,
        },
        [forestKey]: {
          ...state.tiles[forestKey]!,
          terrain: 'forest',
          ownerHouseId: 'vane',
          keepId: vaneKeep.id,
        },
        [roadKey]: {
          ...state.tiles[roadKey]!,
          terrain: 'hills',
          ownerHouseId: 'vane',
          keepId: vaneKeep.id,
        },
      },
      units: {
        u_pioneer: makeTestUnit(
          'u_pioneer',
          'vane',
          'spearman',
          outpostTile.x,
          outpostTile.y,
          vaneKeep.id,
          { hp: 16 },
        ),
        u_enemy: makeTestUnit(
          'u_enemy',
          'corvus',
          'spearman',
          vaneKeep.x + 2,
          vaneKeep.y,
          corvusKeep.id,
        ),
      },
    };

    // 1. Iron Mine Lv1 (+1 base + 1 Forge Seat = 2 Iron) -> Lv2 Deep Shaft Mine (+2 + 1 = 3 Iron)
    s = buildImprovement(s, 'vane', mineKey, 'iron_mine');
    expect(computeTileYield(s, mineKey).iron).toBe(2);
    s = upgradeImprovement(s, 'vane', mineKey);
    expect(s.tiles[mineKey]!.improvementLevel).toBe(2);
    expect(computeTileYield(s, mineKey).iron).toBe(3);

    // 2. Clear Timber (Forest -> Plains, -4 Coin, +6 Mat)
    const matBefore = s.houses.vane!.resources.materials;
    s = clearTimber(s, 'vane', forestKey);
    expect(s.tiles[forestKey]!.terrain).toBe('plains');
    expect(s.houses.vane!.resources.materials).toBe(matBefore + 6);

    // 3. Road Overlay
    s = buildRoad(s, 'vane', roadKey);
    expect(s.tiles[roadKey]!.hasRoad).toBe(true);

    // 4. Frontier Outpost claims 3x3 territory
    s = buildOutpost(s, 'u_pioneer', outpostKey);
    const outposts = Object.values(s.outposts);
    expect(outposts).toHaveLength(1);
    expect(s.tiles[outpostKey]!.ownerHouseId).toBe('vane');
    expect(s.tiles[coordKey(outpostTile.x, outpostTile.y + 1)]!.outpostId).toBe(outposts[0]!.id);

    // 5. Paid Field Reinforce restores +8 HP when in supply
    const uFresh: GameState = {
      ...s,
      units: { ...s.units, u_pioneer: { ...s.units.u_pioneer!, hasAttacked: false } },
    };
    const reinforced = reinforceUnit(uFresh, 'u_pioneer');
    expect(reinforced.units.u_pioneer!.hp).toBe(16 + REINFORCE_HEAL_AMOUNT);

    // 6. Keep Tier-3 Grand Citadel upgrade (consumes KEEP_TIER3_IRON_COST) + Range-2 Arrow Slits volley
    const ironBeforeT3 = reinforced.houses.vane!.resources.iron;
    let t3 = upgradeKeepToTier3(reinforced, 'vane', vaneKeep.id);
    expect(t3.keeps[vaneKeep.id]!.tier).toBe(3);
    expect(t3.keeps[vaneKeep.id]!.maxKeepHp).toBe(KEEP_TIER3_MAX_HP);
    expect(t3.houses.vane!.resources.iron).toBe(ironBeforeT3 - KEEP_TIER3_IRON_COST);
    expect(t3.houses.vane!.pendingCitadelKeepIds).toContain(vaneKeep.id);

    // Fire Range-2 Arrow Slits volley at u_enemy
    const enemyHpBefore = t3.units.u_enemy!.hp;
    t3 = fireKeepGarrisonVolley(t3, vaneKeep.id, 'u_enemy');
    expect(t3.units.u_enemy!.hp).toBeLessThan(enemyHpBefore);
    expect(t3.keeps[vaneKeep.id]!.garrisonVolleyUsedThisTurn).toBe(true);
  });

  it('computes adjacency yields, Smithy combo, local military unlocks, War Camp limits & summoning sickness', () => {
    const state = makeFlatPlainsState();
    const ironKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'ironhelm')!;
    const corvusKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!;

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
    expect(computeTileYield(s, tFarm).food).toBe(4);
    expect(computeTileYield(s, tMill).materials).toBe(4);
    expect(keepHasSmithyCombo(s, ironKeep.id)).toBe(true);

    // Local Barracks unlock: Archers blocked without Barracks, allowed with Barracks
    const t1 = coordKey(corvusKeep.x + 1, corvusKeep.y);
    const t2 = coordKey(corvusKeep.x - 1, corvusKeep.y);
    let cState: GameState = {
      ...state,
      houses: {
        ...state.houses,
        corvus: { ...state.houses.corvus!, resources: { materials: 60, iron: 10, coin: 20 } },
      },
    };
    expect(canTrainUnit(cState, 'corvus', corvusKeep.id, 'archer')).toBe(false);
    cState = buildImprovement(cState, 'corvus', t2, 'barracks');
    expect(canTrainUnit(cState, 'corvus', corvusKeep.id, 'archer')).toBe(true);

    // War Camp limits (14 Mat + 2 Iron, max 1/Keep)
    expect(canBuildImprovement(cState, 'corvus', t1, 'war_camp')).toBe(true);
    cState = buildImprovement(cState, 'corvus', t1, 'war_camp');
    expect(getKeepArmyCap(cState, corvusKeep.id)).toBe(4);

    // Summoning sickness on trainUnit
    cState = trainUnit(cState, 'corvus', corvusKeep.id, 'spearman');
    const trained = Object.values(cState.units)[0]!;
    expect(trained.hasMoved).toBe(true);
    expect(trained.hasAttacked).toBe(true);
    const afterHeal = processEndOfTurnHealingAndAttrition(
      { ...cState, units: { [trained.id]: { ...trained, hp: 10, hasMoved: false, hasAttacked: false } } },
      'corvus',
    );
    expect(afterHeal.units[trained.id]!.hp).toBe(10); // No spawn-turn heal
  });

  it('enforces Keep capture conversions, sticky borders, orphans, manual re-homing, annexation, Mutiny & Fortify', () => {
    const state = makeFlatPlainsState();
    const vaneKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!;
    const corvusKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'corvus')!;

    // Escalating Coin Milestones: 85 -> 215
    const vaneHouse = addLifetimeCoin(state.houses.vane!, 85);
    expect(vaneHouse.pendingDraftCount).toBe(1);
    expect(vaneHouse.nextCoinMilestone).toBe(215);

    const secondKeep: KeepState = {
      id: 'keep_extra',
      name: 'Greenhollow',
      ownerHouseId: 'vane',
      tileKey: coordKey(10, 10),
      x: 10,
      y: 10,
      tier: 1,
      isCapital: false,
      isHighSeat: false,
      specialization: 'none',
      citadelCharter: 'none',
      keepHp: KEEP_TIER1_MAX_HP,
      maxKeepHp: KEEP_TIER1_MAX_HP,
      damagedLastRound: false,
      garrisonVolleyUsedThisTurn: false,
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
          maxKeepHp: KEEP_TIER2_MAX_HP + KEEP_GARRISON_HP_BONUS,
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
        u_l1: makeTestUnit('u_l1', 'vane', 'longbowman', 10, 10, vaneKeep.id),
        u_m1: makeTestUnit('u_m1', 'vane', 'militia', 10, 11, vaneKeep.id),
        u_fc: makeTestUnit('u_fc', 'vane', 'free_company_spearman', 11, 10, vaneKeep.id),
        u_s1: makeTestUnit('u_s1', 'vane', 'spearman', 9, 10, secondKeep.id),
        u_s2: makeTestUnit('u_s2', 'vane', 'spearman', 9, 11, secondKeep.id),
      },
    };
    s = claimKeepTerritory(s, secondKeep.id);

    const captured = captureKeep(s, vaneKeep.id, 'corvus');
    expect(captured.keeps[vaneKeep.id]!.specialization).toBe('garrison');
    expect(captured.keeps[vaneKeep.id]!.keepHp).toBe(
      Math.floor((KEEP_TIER2_MAX_HP + KEEP_GARRISON_HP_BONUS) / 2),
    );
    expect(captured.tiles[lodgeTile]!.improvement).toBe('logging_camp');
    expect(captured.units.u_fc).toBeUndefined();
    expect(captured.units.u_l1!.homeKeepId).toBe(secondKeep.id);
    expect(captured.units.u_m1!.homeKeepId).toBe('orphaned');

    // Manual Re-homing
    const withSlot: GameState = {
      ...captured,
      units: {
        ...captured.units,
        u_m1: { ...captured.units.u_m1!, tileKey: secondKeep.tileKey, x: secondKeep.x, y: secondKeep.y },
      },
    };
    delete withSlot.units.u_s1;
    expect(rehomeUnitManually(withSlot, 'u_m1').units.u_m1!.homeKeepId).toBe(secondKeep.id);

    // Sticky Borders
    const sticky: GameState = {
      ...state,
      keeps: { ...state.keeps, [corvusKeep.id]: { ...corvusKeep, tier: 2 } },
      tiles: {
        ...state.tiles,
        [coordKey(corvusKeep.x + 2, corvusKeep.y)]: {
          ...state.tiles[coordKey(corvusKeep.x + 2, corvusKeep.y)]!,
          keepId: vaneKeep.id,
          ownerHouseId: 'vane',
        },
      },
    };
    expect(claimKeepTerritory(sticky, corvusKeep.id).tiles[coordKey(corvusKeep.x + 2, corvusKeep.y)]!.keepId).toBe(
      vaneKeep.id,
    );

    // Peaceful Annexation & Violent Seizure
    const vKey = coordKey(10, 10);
    const vState: GameState = {
      ...state,
      houses: {
        ...state.houses,
        vane: { ...state.houses.vane!, resources: { materials: 20, iron: 4, coin: 25 }, favor: 3 },
      },
      keeps: { ...state.keeps, [vaneKeep.id]: { ...vaneKeep, foodProgress: 20 } },
      tiles: {
        ...state.tiles,
        [vKey]: { ...state.tiles[vKey]!, landmark: 'frontier_village', villageHp: 16 },
      },
      units: { u_v: makeTestUnit('u_v', 'vane', 'spearman', 10, 11, vaneKeep.id) },
    };
    const annexed = annexVillage(vState, 'vane', vKey);
    expect(annexed.houses.vane!.resources.coin).toBe(5);
    expect(annexed.keeps[vaneKeep.id]!.foodProgress).toBe(5);
    expect(annexed.houses.vane!.favor).toBe(4);

    const seized = attackVillage(
      { ...vState, tiles: { ...vState.tiles, [vKey]: { ...vState.tiles[vKey]!, villageHp: 1 } } },
      'u_v',
      vKey,
    );
    expect(Object.values(seized.keeps).find((k) => k.tileKey === vKey)!.keepHp).toBe(
      VILLAGE_SEIZE_KEEP_HP,
    );

    // Bankruptcy Mutiny
    const bankrupt: GameState = {
      ...state,
      houses: { ...state.houses, vane: { ...state.houses.vane!, resources: { materials: 0, iron: 0, coin: 0 } } },
      units: {
        u_k1: makeTestUnit('u_k1', 'vane', 'knight', 10, 10, vaneKeep.id),
        u_k2: makeTestUnit('u_k2', 'vane', 'knight', 10, 11, vaneKeep.id),
      },
    };
    const afterMutiny = processHarvestAndUpkeep(bankrupt, 'vane');
    expect(afterMutiny.houses.vane!.resources.coin).toBe(0);
    expect(afterMutiny.units.u_k1!.isMutinied).toBe(true);

    // Next-unit idle check, Fortify, Demolish, Disband, Keep Repair & Siege Keep attack
    const idleState: GameState = {
      ...state,
      units: { u1: makeTestUnit('u1', 'vane', 'militia', vaneKeep.x, vaneKeep.y, vaneKeep.id) },
    };
    expect(getNextIdleUnit(idleState, 'vane', null)?.id).toBe('u1');
    const moved = moveUnit(idleState, 'u1', coordKey(vaneKeep.x + 2, vaneKeep.y));
    expect(canUnitAct(moved, moved.units.u1!)).toBe(false);

    const fort = fortifyUnit(
      { ...state, units: { u_def: makeTestUnit('u_def', 'vane', 'spearman', 10, 10, vaneKeep.id, { hp: 14 }) } },
      'u_def',
    );
    expect(fort.units.u_def!.isFortified).toBe(true);
    expect(processEndOfTurnHealingAndAttrition(fort, 'vane').units.u_def!.hp).toBe(18); // 14 + 2 standard + 2 fortify

    const farmKey = coordKey(vaneKeep.x + 1, vaneKeep.y);
    const built = buildImprovement(
      { ...state, houses: { ...state.houses, vane: { ...state.houses.vane!, resources: { materials: 20, iron: 4, coin: 10 } } } },
      'vane',
      farmKey,
      'farm',
    );
    expect(demolishImprovement(built, 'vane', farmKey).tiles[farmKey]!.improvement).toBeNull();

    const disbandState: GameState = {
      ...state,
      units: { u_m: makeTestUnit('u_m', 'vane', 'spearman', vaneKeep.x, vaneKeep.y, vaneKeep.id) },
    };
    expect(disbandUnit(disbandState, 'vane', 'u_m').units.u_m).toBeUndefined();

    const repaired = repairKeep(
      {
        ...state,
        houses: { ...state.houses, vane: { ...state.houses.vane!, resources: { materials: 12, iron: 4, coin: 10 } } },
        keeps: { ...state.keeps, [vaneKeep.id]: { ...vaneKeep, keepHp: 10 } },
      },
      'vane',
      vaneKeep.id,
    );
    expect(repaired.keeps[vaneKeep.id]!.keepHp).toBe(18);

    // Siege Ram hitting enemy Keep deals full structure damage with 0 retaliation
    const ramState: GameState = {
      ...state,
      units: {
        u_ram: makeTestUnit('u_ram', 'corvus', 'siege_ram', vaneKeep.x + 1, vaneKeep.y, corvusKeep.id),
      },
    };
    const hitKeep = attackKeep(ramState, 'u_ram', vaneKeep.id);
    expect(hitKeep.keeps[vaneKeep.id]!.keepHp).toBeLessThan(KEEP_TIER1_MAX_HP);
    expect(hitKeep.units.u_ram!.hp).toBe(UNITS.siege_ram.maxHp);
  });
});
