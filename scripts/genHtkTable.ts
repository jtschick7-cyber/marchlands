#!/usr/bin/env node
/**
 * Marchlands (Spec v0.3) — Verified Hits-to-Kill (HTK) Table Generator
 *
 * Calls the real engine combat function (`previewUnitCombat`) directly for
 * full-HP Plains matchups, recording primary damage, retaliation damage,
 * HTK, One-Shot Protection triggers, and Spearman Brace triggers.
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
  ['archer', 'spearman'],
  ['archer', 'archer'],
  ['archer', 'knight'],
  ['crossbowman', 'spearman'],
  ['crossbowman', 'oathsworn_halberdier'],
  ['longbowman', 'spearman'],
  ['longbowman', 'archer'],
  ['knight', 'archer'],
  ['knight', 'crossbowman'],
  ['knight', 'spearman'],
  ['knight', 'men_at_arms'],
  ['knight', 'knight'],
  ['gilded_lancer', 'spearman'],
  ['gilded_lancer', 'archer'],
  ['dusk_outrider', 'spearman'],
  ['dusk_outrider', 'archer'],
  ['spearman', 'knight'],
  ['oathsworn_halberdier', 'knight'],
  ['vanguard_spearman', 'knight'],
  ['free_company_spearman', 'knight'],
  ['sapper_crew', 'spearman'],
  ['siege_ram', 'spearman'],
];

function makeDuelState(atkId: UnitId, defId: UnitId): GameState {
  const base = createInitialGameState({
    seed: 1,
    houseCount: 5,
    mode: 'dominion',
    difficulty: 'normal',
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
    landmark: 'none',
    keepId: null,
    ownerHouseId: null,
  };
  tiles[defKey] = {
    ...tiles[defKey]!,
    terrain: 'plains',
    improvement: null,
    landmark: 'none',
    keepId: null,
    ownerHouseId: null,
  };

  const atkHouse = atkDef.houseId ?? 'vane';
  const defHouse = atkHouse === 'ironhelm' ? 'corvus' : 'ironhelm';

  const uAtk: UnitState = {
    id: 'u_atk',
    houseId: atkHouse,
    typeId: atkId,
    homeKeepId: 'keep_1',
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
  };

  const uDef: UnitState = {
    id: 'u_def',
    houseId: defHouse,
    typeId: defId,
    homeKeepId: 'keep_2',
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
        // Keep attacker at full HP to measure clean attacker HTK against target
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
