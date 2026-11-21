#!/usr/bin/env node
/**
 * Marchlands (Spec v2.0) — Verified Hits-to-Kill (HTK) Table Generator
 *
 * Calls the real engine combat function (`previewUnitCombat`) directly for
 * full-HP Plains matchups (Closed 4-Way Counter Loop, Scale 2.2, Crossbow AP).
 */

import type { GameState, UnitId, UnitState } from '../src/types/game.ts';
import { UNITS } from '../src/data/index.ts';
import { coordKey } from '../src/engine/coords.ts';
import { previewUnitCombat } from '../src/engine/combat.ts';
import { createInitialGameState } from '../src/engine/stateHelpers.ts';

const MATCHUPS: readonly [UnitId, UnitId][] = [
  ['militia', 'militia'],
  ['militia', 'spearman'],
  ['spearman', 'militia'],
  ['spearman', 'spearman'],
  ['men_at_arms', 'spearman'],
  ['men_at_arms', 'militia'],
  ['men_at_arms', 'knight'],
  ['archer', 'men_at_arms'],
  ['archer', 'spearman'],
  ['archer', 'knight'],
  ['crossbowman', 'men_at_arms'],
  ['crossbowman', 'oathsworn_halberdier'],
  ['longbowman', 'men_at_arms'],
  ['longbowman', 'spearman'],
  ['knight', 'archer'],
  ['knight', 'crossbowman'],
  ['knight', 'spearman'],
  ['knight', 'men_at_arms'],
  ['knight', 'knight'],
  ['gilded_lancer', 'archer'],
  ['dusk_outrider', 'archer'],
  ['spearman', 'knight'],
  ['oathsworn_halberdier', 'knight'],
  ['vanguard_spearman', 'knight'],
  ['sapper_crew', 'spearman'],
  ['trebuchet', 'spearman'],
  ['lord_commander', 'men_at_arms'],
];

function makeDuelState(atkId: UnitId, defId: UnitId): GameState {
  const base = createInitialGameState({
    seed: 1,
    houseCount: 5,
    mode: 'dominion',
    difficulty: 'normal',
    mapPreset: 'compact',
    humanHouseId: null,
  });

  const atkDef = UNITS[atkId];
  const defDef = UNITS[defId];
  const atkKey = coordKey(10, 10);
  const defX = atkDef.range > 1 ? 10 + atkDef.range : 11;
  const defKey = coordKey(defX, 10);

  const tiles = { ...base.tiles };
  tiles[atkKey] = {
    ...tiles[atkKey]!,
    terrain: 'plains',
    improvement: null,
    improvementLevel: 1,
    hasRoad: false,
    landmark: 'none',
    keepId: null,
    outpostId: null,
    ownerHouseId: null,
  };
  tiles[defKey] = {
    ...tiles[defKey]!,
    terrain: 'plains',
    improvement: null,
    improvementLevel: 1,
    hasRoad: false,
    landmark: 'none',
    keepId: null,
    outpostId: null,
    ownerHouseId: null,
  };

  const atkHouse = atkDef.houseId ?? 'vane';
  const defHouse = atkHouse === 'ironhelm' ? 'corvus' : 'ironhelm';

  const uAtk: UnitState = {
    id: 'u_atk',
    houseId: atkHouse,
    typeId: atkId,
    homeKeepId: atkId === 'lord_commander' ? 'commander' : 'keep_1',
    tileKey: atkKey,
    x: 10,
    y: 10,
    hp: atkDef.maxHp,
    maxHp: atkDef.maxHp,
    remainingMovement: atkDef.movement,
    hasMoved: false,
    hasAttacked: false,
    spawnedOnTurn: 0,
    isMutinied: false,
    damagedSinceLastTurn: false,
    xp: 0,
    battleHonors: [],
    isFortified: false,
    isOverwatch: false,
    isDeployed: atkDef.requiresDeploy,
    isCommander: atkId === 'lord_commander',
    movedOpenTilesThisTurn: 0,
    commanderBuffUntilTurn: null,
    overwatchRangeBonusUntilTurn: null,
  };

  const uDef: UnitState = {
    id: 'u_def',
    houseId: defHouse,
    typeId: defId,
    homeKeepId: defId === 'lord_commander' ? 'commander' : 'keep_2',
    tileKey: defKey,
    x: defX,
    y: 10,
    hp: defDef.maxHp,
    maxHp: defDef.maxHp,
    remainingMovement: defDef.movement,
    hasMoved: false,
    hasAttacked: false,
    spawnedOnTurn: 0,
    isMutinied: false,
    damagedSinceLastTurn: false,
    xp: 0,
    battleHonors: [],
    isFortified: false,
    isOverwatch: false,
    isDeployed: defDef.requiresDeploy,
    isCommander: defId === 'lord_commander',
    movedOpenTilesThisTurn: 0,
    commanderBuffUntilTurn: null,
    overwatchRangeBonusUntilTurn: null,
  };

  return {
    ...base,
    tiles,
    units: {
      u_atk: uAtk,
      u_def: uDef,
    },
  };
}

function computeHtk(atkId: UnitId, defId: UnitId): number {
  let state = makeDuelState(atkId, defId);
  for (let hit = 1; hit <= 10; hit++) {
    const p = previewUnitCombat(state, 'u_atk', 'u_def');
    if (!p) return 0;
    if (p.defenderDestroyed) return hit;
    state = {
      ...state,
      units: {
        ...state.units,
        u_def: { ...state.units.u_def!, hp: p.defenderHpAfter },
      },
    };
  }
  return 10;
}

function main(): void {
  const lines = [
    '| Attacker | Defender | Primary Dmg | Defender HP After | Retaliation Dmg | Attacker HP After | HTK (Full-HP Atk) | One-Shot Protection | Spearman Brace |',
    '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const [atkId, defId] of MATCHUPS) {
    const state = makeDuelState(atkId, defId);
    const preview = previewUnitCombat(state, 'u_atk', 'u_def');
    if (!preview) continue;
    const htk = computeHtk(atkId, defId);
    lines.push(
      `| \`${atkId}\` | \`${defId}\` | ${preview.attackerDamage} | ${preview.defenderHpAfter}/${UNITS[defId].maxHp} | ${preview.retaliationDamage} | ${preview.attackerHpAfter}/${UNITS[atkId].maxHp} | ${htk} | ${preview.oneShotProtectionTriggered ? 'Yes' : 'No'} | ${preview.braceTriggered ? 'Yes' : 'No'} |`,
    );
  }

  console.log(lines.join('\n'));
}

main();
