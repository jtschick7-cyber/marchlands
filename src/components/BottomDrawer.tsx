/**
 * Marchlands (Spec v0.3) — Contextual Mobile Bottom Drawer
 *
 * Features:
 * - Always-accessible End Turn button + dedicated Next (N) idle-unit cycler (fixes turn-lock bug)
 * - Dual [Unit]/[Keep] inspector tabs when a friendly unit stands on a friendly Keep
 * - Rich Unit Sheet: Class, Veterancy Rank/XP, Stats, Passive, Fortify (+15% DEF), Hold, Pillage, Re-home, Disband
 * - Rich Keep Sheet: HP bar + Field Repair, Food Growth Bar, Army Cap Pips, Yields, Train Strip & Locked Hints
 * - Rich Tile/Landmark/Enemy Inspector: Terrain DEF/MP, Live Yields, Demolish, Village Annex & Build Adjacency Preview
 * - Detailed Combat Forecast with Counter-Triangle, Cover, Flanking, Fortify, Brace & Steadfast badges
 */

import { useState } from 'react';
import type {
  CoordKey,
  GameState,
  HouseId,
  ImprovementId,
  UnitId,
} from '../types/game.ts';
import {
  BANDIT_MAX_HP,
  DECREES,
  HOUSES,
  IMPROVEMENTS,
  IMPROVEMENT_IDS,
  KEEP_REPAIR_HP_AMOUNT,
  KEEP_REPAIR_MAT_COST,
  KEEP_SPECIALIZATIONS,
  TERRAINS,
  UNITS,
  UNIT_IDS,
  VILLAGE_MAX_HP,
} from '../data/index.ts';
import { canRehomeUnitManually } from '../engine/capture.ts';
import { canPillageTile } from '../engine/combat.ts';
import {
  canAnnexVillage,
  canDemolishImprovement,
  canFortifyUnit,
  canTrainUnit,
  findAnnexFoodKeep,
  getDemolishRefund,
  getDisbandRefund,
  getPeacefulAnnexCost,
  getUnitMatCost,
  getUnitUpkeep,
} from '../engine/economy.ts';
import {
  canUnitAct,
  getActionableUnits,
  getKeepInspectInfo,
  getTileInspectInfo,
  getUnitRankLabel,
  previewImprovementOnTile,
  type AttackTargetInfo,
} from '../engine/queries.ts';
import { getHouseKeeps, getKeepAt, getUnitAt } from '../engine/stateHelpers.ts';
import { HouseSigilSvg, ResourceIconSvg, UnitFigureSvg } from './svg/HeraldrySvg.tsx';

interface BottomDrawerProps {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly selectedTileKey: CoordKey | null;
  readonly buildModeImprovementId: ImprovementId | null;
  readonly attackPreviewTarget: AttackTargetInfo | null;
  readonly skippedUnitIds: readonly string[];
  readonly keepInspectMode: 'unit' | 'keep';
  readonly undoCount: number;
  readonly lastCommitReason: string | null;
  readonly isAiTurn: boolean;
  readonly onSetKeepInspectMode: (mode: 'unit' | 'keep') => void;
  readonly onUndo: () => void;
  readonly onOpenRecap: () => void;
  readonly onNextUnit: () => void;
  readonly onEndTurn: () => void;
  readonly onConfirmAttack: (target: AttackTargetInfo) => void;
  readonly onCancelAttackPreview: () => void;
  readonly onFortifyUnit: (unitId: string) => void;
  readonly onHoldUnit: (unitId: string) => void;
  readonly onDisbandUnit: (unitId: string) => void;
  readonly onPillage: (unitId: string) => void;
  readonly onRehome: (unitId: string) => void;
  readonly onRepairKeep: (keepId: string) => void;
  readonly onDemolishImprovement: (tileKey: CoordKey) => void;
  readonly onAnnexVillage: (tileKey: CoordKey) => void;
  readonly onSelectBuildImprovement: (id: ImprovementId | null) => void;
  readonly onConfirmBuild: (tileKey: CoordKey, id: ImprovementId) => void;
  readonly onTrainUnit: (keepId: string, unitId: UnitId) => void;
}

export function BottomDrawer({
  state,
  viewerHouseId,
  selectedTileKey,
  buildModeImprovementId,
  attackPreviewTarget,
  skippedUnitIds,
  keepInspectMode,
  undoCount,
  lastCommitReason,
  isAiTurn,
  onSetKeepInspectMode,
  onUndo,
  onOpenRecap,
  onNextUnit,
  onEndTurn,
  onConfirmAttack,
  onCancelAttackPreview,
  onFortifyUnit,
  onHoldUnit,
  onDisbandUnit,
  onPillage,
  onRehome,
  onRepairKeep,
  onDemolishImprovement,
  onAnnexVillage,
  onSelectBuildImprovement,
  onConfirmBuild,
  onTrainUnit,
}: BottomDrawerProps) {
  const [confirmDisbandId, setConfirmDisbandId] = useState<string | null>(null);
  const [showLockedUnits, setShowLockedUnits] = useState(false);

  const house = state.houses[viewerHouseId]!;
  const tile = selectedTileKey ? state.tiles[selectedTileKey] ?? null : null;
  const fogStatus = selectedTileKey
    ? state.fog[viewerHouseId]?.[selectedTileKey] ?? 'unexplored'
    : 'unexplored';
  const unitOnTile =
    selectedTileKey && fogStatus === 'visible' ? getUnitAt(state, selectedTileKey) : null;
  const keepOnTile =
    selectedTileKey && fogStatus !== 'unexplored' ? getKeepAt(state, selectedTileKey) : null;

  const isOwnUnit = unitOnTile !== null && unitOnTile.houseId === viewerHouseId;
  const isEnemyUnit = unitOnTile !== null && unitOnTile.houseId !== viewerHouseId;
  const isOwnKeep = keepOnTile !== null && keepOnTile.ownerHouseId === viewerHouseId;
  const isEnemyKeep = keepOnTile !== null && keepOnTile.ownerHouseId !== viewerHouseId;
  const hasBothOwnUnitAndKeep = isOwnUnit && isOwnKeep;
  const showUnitPanel = isOwnUnit && (!hasBothOwnUnitAndKeep || keepInspectMode === 'unit');
  const showKeepPanel = isOwnKeep && (!hasBothOwnUnitAndKeep || keepInspectMode === 'keep');

  const isOwnOpenTile =
    tile !== null &&
    tile.ownerHouseId === viewerHouseId &&
    keepOnTile === null &&
    tile.improvement === null &&
    (tile.landmark === 'none' || tile.landmarkCleared);

  const actionableUnits = getActionableUnits(state, viewerHouseId, skippedUnitIds);
  const canCommand = !isAiTurn && state.phase === 'player_command';

  const tileInfo =
    selectedTileKey && fogStatus !== 'unexplored'
      ? getTileInspectInfo(state, selectedTileKey, viewerHouseId)
      : null;
  const keepInfo = isOwnKeep ? getKeepInspectInfo(state, viewerHouseId, keepOnTile.id) : null;

  // Contextual guidance line
  let promptLine = 'Tap a friendly Keep, troop, or territory tile to command your March.';
  if (showUnitPanel && unitOnTile) {
    if (unitOnTile.isFortified) {
      promptLine = 'Entrenched (+15% DEF, +2 extra heal if stationary). Moves or attacks cancel Fortify.';
    } else if (canUnitAct(state, unitOnTile)) {
      if (unitOnTile.remainingMovement > 0) {
        promptLine = 'Tap a blue tile to march, a red target to strike, or Fortify/Hold to rest.';
      } else {
        promptLine = 'In position. Tap a red target to strike, Fortify for +15% DEF, or End Turn.';
      }
    } else {
      promptLine = 'Orders complete for this turn. Rests at turn end (+3 HP if stationary).';
    }
  } else if (showKeepPanel && keepOnTile && keepInfo) {
    promptLine =
      keepInfo.usedCap < keepInfo.maxCap
        ? `Train troops (${keepInfo.usedCap}/${keepInfo.maxCap} Cap) or grow borders (${keepOnTile.foodProgress}/${keepInfo.foodThreshold} Food).`
        : `Garrison full (${keepInfo.maxCap}/${keepInfo.maxCap}). Upgrade to Tier 2, build War Camp, or Disband a troop.`;
  } else if (isOwnOpenTile) {
    promptLine = 'Select an improvement below to preview adjacency yields on the map.';
  } else if (tile && tile.landmark === 'frontier_village' && tile.villageHp !== null && fogStatus !== 'unexplored') {
    const cost = getPeacefulAnnexCost(state, viewerHouseId);
    const payingKeep = findAnnexFoodKeep(state, viewerHouseId, tile, cost.food);
    const bestKeepFood = Math.max(0, ...getHouseKeeps(state, viewerHouseId).map((k) => k.foodProgress));
    promptLine = payingKeep
      ? `Move adjacent to annex peacefully (${cost.food}F from ${payingKeep.name} + ${cost.coin}C, +1 Favor) or attack to seize (-2 Favor).`
      : `Peaceful Annex needs ${cost.food} Food in one Keep (best: ${bestKeepFood}) + ${cost.coin} Coin & adjacent troop.`;
  } else if (tile && tile.landmark === 'relic_ruin' && !tile.landmarkCleared && fogStatus !== 'unexplored') {
    promptLine = 'Ancient Relic Ruin: March any friendly troop onto this tile to claim a hidden frontier reward!';
  } else if (tile && tile.landmark === 'ancient_watchtower' && fogStatus !== 'unexplored') {
    promptLine = 'Ancient Watchtower: Occupy to reveal 7x7 fog, gain +30% DEF, +2 Coin/turn & +1 Favor on even turns.';
  } else if (tile && tile.landmark === 'outlaw_camp' && !tile.landmarkCleared && fogStatus !== 'unexplored') {
    promptLine = `Outlaw Camp (${tile.banditHp}/${BANDIT_MAX_HP} HP): Clear bandits for +12 Coin bounty (+24 for Corvus) & +20 Chronicle score.`;
  }

  // Eligible improvements for build strip
  const buildableImprovements = isOwnOpenTile
    ? IMPROVEMENT_IDS.filter((id) => {
        const def = IMPROVEMENTS[id];
        if (def.houseId !== null && def.houseId !== viewerHouseId) return false;
        if (def.requiredDecreeId !== null && !house.decreeIds.includes(def.requiredDecreeId)) {
          return false;
        }
        return true;
      })
    : [];

  // Trainable vs locked units for Keep
  const houseRelevantUnits = showKeepPanel
    ? UNIT_IDS.filter((uid) => {
        const def = UNITS[uid];
        if (def.isEventOnly) return false;
        if (def.houseId !== null && def.houseId !== viewerHouseId) return false;
        return true;
      })
    : [];

  const unlockedUnits = houseRelevantUnits.filter((uid) => {
    const def = UNITS[uid];
    if (def.requiredDecreeId !== null && !house.decreeIds.includes(def.requiredDecreeId)) return false;
    if (def.requiresSmithyCombo && !keepInfo?.hasSmithyCombo) return false;
    return true;
  });

  const lockedUnits = houseRelevantUnits.filter((uid) => !unlockedUnits.includes(uid));

  return (
    <section className="relative z-30 w-full surface-iron-up border-t border-amber-500/25 backdrop-blur-md safe-bottom px-2 pt-2">
      {/* Combat Preview Overlay Card */}
      {attackPreviewTarget && isOwnUnit && (
        <div className="mb-2 p-2.5 rounded-xl bg-[#0B1120] border border-red-500/75 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-serif-march text-xs font-bold text-red-300 uppercase tracking-wide">
                Combat Forecast — {attackPreviewTarget.label}
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {attackPreviewTarget.counterStatus === 'advantage' && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-900/85 border border-emerald-500/50 text-[10px] font-bold text-emerald-200">
                    COUNTER +40%
                  </span>
                )}
                {attackPreviewTarget.counterStatus === 'disadvantage' && (
                  <span className="px-1.5 py-0.5 rounded bg-red-900/85 border border-red-500/50 text-[10px] font-bold text-red-200">
                    COUNTERED (Enemy +40%)
                  </span>
                )}
                {attackPreviewTarget.preview?.isFlanked && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-900/85 text-[10px] font-bold text-amber-200">
                    FLANKING +15%
                  </span>
                )}
                {attackPreviewTarget.preview && attackPreviewTarget.preview.defenderCoverPct > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-semibold text-slate-300">
                    Cover +{attackPreviewTarget.preview.defenderCoverPct}% DEF
                  </span>
                )}
                {attackPreviewTarget.preview?.defenderFortified && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-600/60 text-[10px] font-bold text-emerald-300">
                    Fortified +15% DEF
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onCancelAttackPreview}
              className="touch-target px-2.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-300 text-xs font-bold"
            >
              Cancel
            </button>
          </div>

          {attackPreviewTarget.preview ? (
            <div className="mt-2 space-y-1 text-xs text-slate-200 tabular-nums">
              <div className="flex justify-between">
                <span>Your Strike:</span>
                <span className="font-bold text-amber-300">
                  −{attackPreviewTarget.preview.attackerDamage} HP (Target →{' '}
                  {attackPreviewTarget.preview.defenderHpAfter} HP)
                </span>
              </div>
              <div className="flex justify-between">
                <span>Retaliation:</span>
                <span className="font-semibold text-slate-300">
                  {attackPreviewTarget.preview.retaliationDamage > 0
                    ? `−${attackPreviewTarget.preview.retaliationDamage} HP (You → ${attackPreviewTarget.preview.attackerHpAfter} HP)`
                    : 'No enemy retaliation'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {attackPreviewTarget.preview.defenderDestroyed && (
                  <span className="px-2 py-0.5 rounded bg-red-700 text-[10px] font-bold text-white">
                    DECISIVE KILL (+2 XP)
                  </span>
                )}
                {attackPreviewTarget.preview.oneShotProtectionTriggered && (
                  <span className="px-2 py-0.5 rounded bg-sky-700 text-[10px] font-bold text-white">
                    STEADFAST (Survives at 1 HP)
                  </span>
                )}
                {attackPreviewTarget.preview.braceTriggered && (
                  <span className="px-2 py-0.5 rounded bg-amber-700 text-[10px] font-bold text-white">
                    PIKE BRACE
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-slate-300 tabular-nums">
              Structure HP: {attackPreviewTarget.structureHp}/{attackPreviewTarget.structureMaxHp}
            </p>
          )}

          <button
            type="button"
            onClick={() => onConfirmAttack(attackPreviewTarget)}
            className="mt-2 w-full touch-target rounded-xl bg-gradient-to-b from-red-600 to-red-700 active:from-red-700 active:to-red-800 text-white text-sm font-bold shadow-lg"
          >
            Confirm Strike
          </button>
        </div>
      )}

      {/* Dual [Unit] / [Keep] Toggle when own unit stands on own Keep */}
      {hasBothOwnUnitAndKeep && (
        <div className="mb-1.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onSetKeepInspectMode('unit')}
            className={`min-h-[36px] rounded-lg border text-xs font-bold transition ${
              keepInspectMode === 'unit'
                ? 'bg-sky-900/75 border-sky-400 text-white'
                : 'bg-slate-900/70 border-slate-700 text-slate-300'
            }`}
          >
            Troop: {UNITS[unitOnTile.typeId].name}
          </button>
          <button
            type="button"
            onClick={() => onSetKeepInspectMode('keep')}
            className={`min-h-[36px] rounded-lg border text-xs font-bold transition ${
              keepInspectMode === 'keep'
                ? 'bg-amber-900/70 border-amber-400 text-amber-100'
                : 'bg-slate-900/70 border-slate-700 text-slate-300'
            }`}
          >
            Keep: {keepOnTile.name}
          </button>
        </div>
      )}

      {/* Contextual Guidance Line */}
      <p className="text-[11px] text-slate-300 leading-snug mb-1.5 px-0.5">{promptLine}</p>

      {/* Selected Tile / Unit / Keep / Enemy Details */}
      {tile && fogStatus !== 'unexplored' && tileInfo && (
        <div className="mb-2 space-y-2">
          {/* Tile Meta Header: Terrain, DEF Cover, Move Cost, Live Yield, Demolish */}
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-200 px-0.5">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="font-bold text-slate-100">
                {TERRAINS[tile.terrain].name}
                {tile.hasIronDeposit ? ' • Iron Vein' : ''}
                {tile.improvement ? ` • ${IMPROVEMENTS[tile.improvement].name}` : ''}
                {tile.landmark !== 'none' && !tile.landmarkCleared
                  ? ` • ${tile.landmark.replace(/_/g, ' ')}`
                  : ''}
              </span>
              {tileInfo.defBonusPct > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-semibold text-emerald-300">
                  +{tileInfo.defBonusPct}% DEF
                </span>
              )}
              <span className="text-slate-400 text-[10px]">{tileInfo.moveCostLabel}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
              {(tileInfo.yieldNow.food > 0 ||
                tileInfo.yieldNow.materials > 0 ||
                tileInfo.yieldNow.coin > 0) && (
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-bold">
                  {tileInfo.yieldNow.food > 0 && (
                    <span className="text-emerald-400 mr-1">+{tileInfo.yieldNow.food}F</span>
                  )}
                  {tileInfo.yieldNow.materials > 0 && (
                    <span className="text-amber-400 mr-1">+{tileInfo.yieldNow.materials}M</span>
                  )}
                  {tileInfo.yieldNow.coin > 0 && (
                    <span className="text-yellow-400">+{tileInfo.yieldNow.coin}C</span>
                  )}
                </span>
              )}
              <span className="text-slate-500 text-[10px]">
                ({tile.x},{tile.y})
              </span>
            </div>
          </div>

          {/* Own Improvement Demolish Strip (when no own unit/keep panel dominates) */}
          {!showUnitPanel &&
            !showKeepPanel &&
            canDemolishImprovement(state, viewerHouseId, tile.key) &&
            tile.improvement && (
              <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/85 border border-slate-700">
                <div className="text-[11px] text-slate-300 leading-snug">
                  <strong className="text-slate-100">{IMPROVEMENTS[tile.improvement].name}:</strong>{' '}
                  {IMPROVEMENTS[tile.improvement].description}
                </div>
                <button
                  type="button"
                  disabled={!canCommand}
                  onClick={() => onDemolishImprovement(tile.key)}
                  className="touch-target shrink-0 px-2.5 rounded-lg bg-slate-800 border border-red-500/45 text-red-200 text-[11px] font-bold disabled:opacity-40 active:bg-red-950"
                >
                  Clear (+{getDemolishRefund(viewerHouseId, tile.improvement)}M)
                </button>
              </div>
            )}

          {/* Enemy Unit or Enemy Keep Intel Card */}
          {(isEnemyUnit || isEnemyKeep) && !showUnitPanel && !showKeepPanel && (
            <div className="p-2 rounded-xl bg-red-950/35 border border-red-800/60 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <HouseSigilSvg
                  houseId={isEnemyUnit ? unitOnTile.houseId : keepOnTile!.ownerHouseId}
                  size={24}
                />
                <div className="min-w-0">
                  {isEnemyUnit ? (
                    <>
                      <div className="font-bold text-red-100 truncate">
                        {HOUSES[unitOnTile.houseId].name} {UNITS[unitOnTile.typeId].name}
                        {unitOnTile.isFortified ? ' • Fortified' : ''}
                      </div>
                      <div className="text-[11px] text-slate-300 tabular-nums">
                        HP {unitOnTile.hp}/{unitOnTile.maxHp} • ATK {UNITS[unitOnTile.typeId].attack} • DEF{' '}
                        {UNITS[unitOnTile.typeId].defense} • {getUnitRankLabel(unitOnTile.xp ?? 0).title}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-bold text-red-100 truncate">
                        {keepOnTile!.name} ({HOUSES[keepOnTile!.ownerHouseId].name}, Tier {keepOnTile!.tier})
                      </div>
                      <div className="text-[11px] text-slate-300 tabular-nums">
                        Garrison HP {keepOnTile!.keepHp}/{keepOnTile!.maxKeepHp}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Own Unit Inspector & Tactical Actions */}
          {showUnitPanel && unitOnTile && (() => {
            const def = UNITS[unitOnTile.typeId];
            const rankInfo = getUnitRankLabel(unitOnTile.xp ?? 0);
            const isActionable = canUnitAct(state, unitOnTile);
            const isSkipped = skippedUnitIds.includes(unitOnTile.id);
            const disbandRefund = getDisbandRefund(state, viewerHouseId, unitOnTile.id);
            const isConfirmingDisband = confirmDisbandId === unitOnTile.id;

            return (
              <div className="space-y-1.5">
                <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-700/90 flex items-center gap-2">
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-900/90 border border-slate-700 flex items-center justify-center">
                    <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden="true">
                      <UnitFigureSvg unitId={unitOnTile.typeId} houseId={unitOnTile.houseId} />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-serif-march font-bold text-white truncate">{def.name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-bold uppercase text-sky-300">
                          {def.unitClass}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            rankInfo.rank === 2
                              ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                              : rankInfo.rank === 1
                                ? 'bg-slate-700 text-slate-100'
                                : 'bg-slate-900 text-slate-400'
                          }`}
                        >
                          {rankInfo.title}
                          {rankInfo.nextXp !== null ? ` ${unitOnTile.xp ?? 0}/${rankInfo.nextXp}` : ' ★'}
                        </span>
                      </div>
                      <span className="font-bold text-emerald-400 shrink-0">
                        {unitOnTile.hp}/{unitOnTile.maxHp} HP
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-300 tabular-nums">
                      <span>ATK {def.structureAttack ? `${def.attack} (Siege ${def.structureAttack})` : def.attack}</span>
                      <span>• DEF {def.defense}</span>
                      <span>• MOV {unitOnTile.remainingMovement}/{def.movement}</span>
                      <span>• RNG {def.range}</span>
                      {unitOnTile.isFortified && (
                        <span className="text-emerald-300 font-bold">• FORTIFIED (+15% DEF)</span>
                      )}
                      {unitOnTile.homeKeepId === 'orphaned' && (
                        <span className="text-red-400 font-bold">• SUPPLY-SEVERED (−25%)</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">{def.flavor}</p>
                  </div>
                </div>

                {/* Tactical Action Row */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                  {canFortifyUnit(state, unitOnTile.id) && (
                    <button
                      type="button"
                      disabled={!canCommand}
                      onClick={() => onFortifyUnit(unitOnTile.id)}
                      className="touch-target shrink-0 px-3 rounded-xl bg-emerald-900/80 border border-emerald-500/60 text-emerald-100 text-xs font-bold flex items-center gap-1 active:bg-emerald-800 disabled:opacity-40"
                    >
                      <ResourceIconSvg kind="shield" size={13} />
                      <span>Fortify</span>
                    </button>
                  )}

                  {isActionable && !isSkipped && (
                    <button
                      type="button"
                      disabled={!canCommand}
                      onClick={() => onHoldUnit(unitOnTile.id)}
                      className="touch-target shrink-0 px-3 rounded-xl bg-slate-800 border border-slate-600 text-slate-200 text-xs font-bold active:bg-slate-700 disabled:opacity-40"
                    >
                      Hold / Rest
                    </button>
                  )}

                  {canPillageTile(state, unitOnTile.id) && (
                    <button
                      type="button"
                      disabled={!canCommand}
                      onClick={() => onPillage(unitOnTile.id)}
                      className="touch-target shrink-0 px-3 rounded-xl bg-amber-700 text-white text-xs font-bold active:bg-amber-800 disabled:opacity-40"
                    >
                      Pillage
                    </button>
                  )}

                  {canRehomeUnitManually(state, unitOnTile.id) && keepOnTile && (
                    <button
                      type="button"
                      disabled={!canCommand}
                      onClick={() => onRehome(unitOnTile.id)}
                      className="touch-target shrink-0 px-3 rounded-xl bg-teal-700 text-white text-xs font-bold active:bg-teal-800 disabled:opacity-40"
                    >
                      Re-home Here
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!canCommand}
                    onClick={() => {
                      if (isConfirmingDisband) {
                        setConfirmDisbandId(null);
                        onDisbandUnit(unitOnTile.id);
                      } else {
                        setConfirmDisbandId(unitOnTile.id);
                      }
                    }}
                    className={`touch-target shrink-0 px-3 rounded-xl border text-xs font-bold disabled:opacity-40 ${
                      isConfirmingDisband
                        ? 'bg-red-700 border-red-400 text-white'
                        : 'bg-slate-900 border-red-900/70 text-red-300'
                    }`}
                  >
                    {isConfirmingDisband
                      ? `Confirm Disband${disbandRefund > 0 ? ` (+${disbandRefund}M)` : ''}`
                      : `Disband${disbandRefund > 0 ? ` (+${disbandRefund}M)` : ''}`}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Neutral Frontier Village Peaceful Annexation */}
          {tile.landmark === 'frontier_village' && tile.villageHp !== null && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-amber-200 tabular-nums">
                <span>Neutral Frontier Village</span>
                <span>
                  HP {tile.villageHp}/{VILLAGE_MAX_HP}
                </span>
              </div>
              <button
                type="button"
                disabled={!canAnnexVillage(state, viewerHouseId, tile.key) || !canCommand}
                onClick={() => onAnnexVillage(tile.key)}
                className="touch-target w-full px-3 rounded-xl bg-emerald-700 disabled:bg-slate-800 disabled:text-slate-400 text-white text-xs font-bold active:bg-emerald-800"
              >
                Peaceful Annex ({getPeacefulAnnexCost(state, viewerHouseId).food}F +{' '}
                {getPeacefulAnnexCost(state, viewerHouseId).coin}C • +1 Favor)
              </button>
            </div>
          )}

          {/* Own Keep Overview, Growth Bar, Field Repair & Train Strip */}
          {showKeepPanel && keepOnTile && keepInfo && (
            <div className="space-y-1.5">
              <div className="p-2 rounded-xl bg-slate-950/80 border border-amber-500/35 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                  <span className="font-serif-march font-bold text-amber-200 truncate">
                    {keepOnTile.name} • Tier {keepOnTile.tier}
                    {keepOnTile.specialization !== 'none'
                      ? ` (${KEEP_SPECIALIZATIONS[keepOnTile.specialization].name})`
                      : ''}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-slate-300">
                      HP {keepOnTile.keepHp}/{keepOnTile.maxKeepHp}
                    </span>
                    {keepOnTile.keepHp < keepOnTile.maxKeepHp && (
                      <button
                        type="button"
                        disabled={!keepInfo.canRepair || !canCommand}
                        onClick={() => onRepairKeep(keepOnTile.id)}
                        className="px-2 py-1 rounded-lg bg-amber-700 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[10px] font-bold"
                      >
                        Repair +{KEEP_REPAIR_HP_AMOUNT} ({KEEP_REPAIR_MAT_COST}M)
                      </button>
                    )}
                  </div>
                </div>

                {/* Food Growth Bar & Army Cap / Yield summary */}
                <div className="grid grid-cols-2 gap-2 items-center text-[10px] tabular-nums">
                  <div>
                    <div className="flex justify-between text-emerald-300 mb-0.5">
                      <span>{keepOnTile.tier === 1 ? 'Tier-2 Growth' : 'Surplus Bar'}</span>
                      <span>
                        {keepOnTile.foodProgress}/{keepInfo.foodThreshold} F (+{keepInfo.keepYield.food}/t)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, Math.round((keepOnTile.foodProgress / Math.max(1, keepInfo.foodThreshold)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 font-semibold">
                      Cap {keepInfo.usedCap}/{keepInfo.maxCap}
                    </span>
                    <span className="text-amber-300 font-semibold">+{keepInfo.keepYield.materials}M</span>
                    <span className="text-yellow-300 font-semibold">+{keepInfo.keepYield.coin}C</span>
                  </div>
                </div>
              </div>

              {/* Trainable Unit Strip */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {unlockedUnits.map((uid) => {
                  const def = UNITS[uid];
                  const cost = getUnitMatCost(house, uid);
                  const upkeep = getUnitUpkeep(house, uid);
                  const ok = canTrainUnit(state, viewerHouseId, keepOnTile.id, uid);
                  return (
                    <button
                      key={uid}
                      type="button"
                      disabled={!ok || !canCommand}
                      onClick={() => onTrainUnit(keepOnTile.id, uid)}
                      className="touch-target shrink-0 px-2 py-1.5 rounded-xl bg-slate-900 border border-slate-600 hover:border-amber-400/70 disabled:opacity-40 text-left active:bg-slate-700 flex items-center gap-1.5"
                    >
                      <svg width="28" height="28" viewBox="0 0 36 36" aria-hidden="true" className="shrink-0">
                        <UnitFigureSvg unitId={uid} houseId={viewerHouseId} />
                      </svg>
                      <div>
                        <div className="text-xs font-bold text-slate-100">{def.name}</div>
                        <div className="text-[10px] text-amber-300 tabular-nums">
                          {cost}M{upkeep > 0 ? ` • ${upkeep}C/t` : ' • Free'}
                        </div>
                        <div className="text-[9px] text-slate-400 tabular-nums">
                          A{def.structureAttack ?? def.attack}/D{def.defense}/M{def.movement}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {lockedUnits.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowLockedUnits((v) => !v)}
                    className="touch-target shrink-0 px-2.5 py-1.5 rounded-xl bg-slate-950/70 border border-dashed border-slate-600 text-[10px] font-bold text-slate-400"
                  >
                    {showLockedUnits ? 'Hide Locked' : `+${lockedUnits.length} Locked`}
                  </button>
                )}
              </div>

              {showLockedUnits && lockedUnits.length > 0 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                  {lockedUnits.map((uid) => {
                    const def = UNITS[uid];
                    const reqParts: string[] = [];
                    if (def.requiredDecreeId && !house.decreeIds.includes(def.requiredDecreeId)) {
                      reqParts.push(`Decree: ${DECREES[def.requiredDecreeId].title}`);
                    }
                    if (def.requiresSmithyCombo && !keepInfo.hasSmithyCombo) {
                      reqParts.push('Smithy + Iron Mine + Mill');
                    }
                    return (
                      <div
                        key={uid}
                        className="shrink-0 px-2.5 py-1.5 rounded-xl bg-slate-950/75 border border-slate-800 text-left"
                      >
                        <div className="text-[11px] font-bold text-slate-300">{def.name}</div>
                        <div className="text-[9px] text-amber-400/90">{reqParts.join(' + ')}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Own Open Tile Build Strip */}
          {isOwnOpenTile && buildableImprovements.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {buildableImprovements.map((impId) => {
                  const preview = previewImprovementOnTile(state, viewerHouseId, tile.key, impId);
                  const isSelected = buildModeImprovementId === impId;
                  return (
                    <button
                      key={impId}
                      type="button"
                      disabled={!preview.canBuild || !canCommand}
                      onClick={() => onSelectBuildImprovement(isSelected ? null : impId)}
                      className={`touch-target shrink-0 px-2.5 py-1.5 rounded-xl border text-left disabled:opacity-35 ${
                        isSelected
                          ? 'bg-emerald-900/85 border-emerald-400 text-white'
                          : 'bg-slate-900 border-slate-600 text-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold">{IMPROVEMENTS[impId].name}</div>
                      <div className="text-[10px] text-amber-300 tabular-nums">
                        {preview.matCost} Mat
                      </div>
                    </button>
                  );
                })}
              </div>
              {buildModeImprovementId && (() => {
                const p = previewImprovementOnTile(
                  state,
                  viewerHouseId,
                  tile.key,
                  buildModeImprovementId,
                );
                return (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-emerald-950/75 border border-emerald-500/60">
                    <div className="text-[11px] text-emerald-100">
                      <div className="font-bold">
                        {IMPROVEMENTS[buildModeImprovementId].name} ({p.matCost} Mat)
                      </div>
                      <div className="text-emerald-300">
                        {p.adjacencyCallouts.length > 0
                          ? p.adjacencyCallouts[0]
                          : IMPROVEMENTS[buildModeImprovementId].description}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!p.canBuild || !canCommand}
                      onClick={() => onConfirmBuild(tile.key, buildModeImprovementId)}
                      className="touch-target shrink-0 px-3.5 rounded-xl bg-emerald-600 text-white text-xs font-bold active:bg-emerald-700"
                    >
                      Build
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Primary Control Bar: Undo, Recap, Next (N) (when units actionable), ALWAYS-CLICKABLE End Turn */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={undoCount === 0 || isAiTurn}
          onClick={onUndo}
          title={
            undoCount === 0 && lastCommitReason
              ? lastCommitReason
              : 'Reverts your last action this turn.'
          }
          className="touch-target px-2.5 rounded-xl bg-slate-800/95 border border-slate-600 disabled:opacity-40 text-xs font-semibold text-slate-100 tabular-nums active:bg-slate-700"
        >
          Undo ({undoCount})
        </button>

        <button
          type="button"
          onClick={onOpenRecap}
          className="touch-target px-2.5 rounded-xl bg-slate-800/95 border border-slate-600 text-xs font-semibold text-slate-100 active:bg-slate-700"
        >
          Recap
        </button>

        {canCommand && actionableUnits.length > 0 && (
          <button
            type="button"
            onClick={onNextUnit}
            className="touch-target px-3 rounded-xl bg-sky-600 active:bg-sky-700 text-white text-xs font-bold shadow-md tabular-nums shrink-0"
          >
            Next ({actionableUnits.length})
          </button>
        )}

        <button
          type="button"
          disabled={!canCommand}
          onClick={onEndTurn}
          className={`touch-target flex-1 px-3 rounded-xl text-sm font-bold shadow-md disabled:opacity-50 transition ${
            isAiTurn
              ? 'bg-slate-700 text-slate-300'
              : actionableUnits.length === 0
                ? 'bg-gradient-to-b from-amber-500 to-amber-600 active:from-amber-600 active:to-amber-700 text-slate-950'
                : 'bg-amber-900/80 border border-amber-500/70 active:bg-amber-800 text-amber-100'
          }`}
        >
          {isAiTurn ? 'Rivals Acting…' : 'End Turn'}
        </button>
      </div>
    </section>
  );
}
