/**
 * Marchlands (Spec v0.3) — Contextual Mobile Bottom Drawer
 *
 * Displays:
 * - Action bar: Undo (N), Recap, Smart Next Unit / End Turn (>= 44x44 targets, >= 8px gaps)
 * - Two-tap contextual prompt (docs/UX_MICROCOPY.md §2)
 * - Combat Preview overlay with Counter-Triangle, Terrain Defense, STEADFAST & PIKE BRACE badges
 * - Unit / Keep / Village / Open Tile Build action sheets
 */

import type {
  CoordKey,
  GameState,
  HouseId,
  ImprovementId,
  UnitId,
} from '../types/game.ts';
import {
  IMPROVEMENTS,
  IMPROVEMENT_IDS,
  KEEP_SPECIALIZATIONS,
  TERRAINS,
  UNITS,
  UNIT_IDS,
} from '../data/index.ts';
import { canRehomeUnitManually } from '../engine/capture.ts';
import { canPillageTile } from '../engine/combat.ts';
import {
  canAnnexVillage,
  canTrainUnit,
  findAnnexFoodKeep,
  getPeacefulAnnexCost,
  getUnitMatCost,
  getUnitUpkeep,
} from '../engine/economy.ts';
import {
  getKeepFoodThreshold,
  getNextIdleUnit,
  previewImprovementOnTile,
  type AttackTargetInfo,
} from '../engine/queries.ts';
import {
  getHouseKeeps,
  getKeepArmyCap,
  getKeepAt,
  getKeepSupportedUnitIds,
  getUnitAt,
} from '../engine/stateHelpers.ts';

interface BottomDrawerProps {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly selectedTileKey: CoordKey | null;
  readonly buildModeImprovementId: ImprovementId | null;
  readonly attackPreviewTarget: AttackTargetInfo | null;
  readonly undoCount: number;
  readonly lastCommitReason: string | null;
  readonly isAiTurn: boolean;
  readonly onUndo: () => void;
  readonly onOpenRecap: () => void;
  readonly onNextUnitOrEndTurn: () => void;
  readonly onConfirmAttack: (target: AttackTargetInfo) => void;
  readonly onCancelAttackPreview: () => void;
  readonly onPillage: (unitId: string) => void;
  readonly onRehome: (unitId: string) => void;
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
  undoCount,
  lastCommitReason,
  isAiTurn,
  onUndo,
  onOpenRecap,
  onNextUnitOrEndTurn,
  onConfirmAttack,
  onCancelAttackPreview,
  onPillage,
  onRehome,
  onAnnexVillage,
  onSelectBuildImprovement,
  onConfirmBuild,
  onTrainUnit,
}: BottomDrawerProps) {
  const house = state.houses[viewerHouseId]!;
  const tile = selectedTileKey ? state.tiles[selectedTileKey] ?? null : null;
  const fogStatus = selectedTileKey ? state.fog[viewerHouseId]?.[selectedTileKey] ?? 'unexplored' : 'unexplored';
  const unitOnTile = selectedTileKey && fogStatus === 'visible' ? getUnitAt(state, selectedTileKey) : null;
  const keepOnTile = selectedTileKey && fogStatus !== 'unexplored' ? getKeepAt(state, selectedTileKey) : null;

  const isOwnUnit = unitOnTile !== null && unitOnTile.houseId === viewerHouseId;
  const isOwnKeep = keepOnTile !== null && keepOnTile.ownerHouseId === viewerHouseId;
  const isOwnOpenTile =
    tile !== null &&
    tile.ownerHouseId === viewerHouseId &&
    keepOnTile === null &&
    tile.improvement === null &&
    tile.landmark === 'none';

  const nextIdle = getNextIdleUnit(state, viewerHouseId, isOwnUnit ? unitOnTile.id : null);
  const canEndOrCycle = !isAiTurn && state.phase === 'player_command';

  // Contextual prompt line (UX_MICROCOPY.md §2)
  let promptLine = 'Tap any friendly Keep, unit, or frontier tile to inspect.';
  if (isOwnUnit) {
    if (!unitOnTile.hasMoved && !unitOnTile.hasAttacked) {
      promptLine = 'Tap a blue tile to march, or a red-bracketed target to strike.';
    } else if (!unitOnTile.hasAttacked) {
      promptLine = 'Unit positioned. Tap a red target within range to attack, or tap elsewhere to hold.';
    } else {
      promptLine = 'Orders complete for this turn. Rests at turn end (+3 HP if stationary).';
    }
  } else if (isOwnKeep) {
    const usedCap = getKeepSupportedUnitIds(state, keepOnTile.id).length;
    const maxCap = getKeepArmyCap(state, keepOnTile.id);
    const threshold = getKeepFoodThreshold(keepOnTile);
    promptLine =
      usedCap < maxCap
        ? `Train troops (${usedCap}/${maxCap} Cap) or inspect border growth (${keepOnTile.foodProgress}/${threshold} Food).`
        : `Garrison full (${maxCap}/${maxCap}). Upgrade Keep to Tier 2 or lose a unit to train more.`;
  } else if (isOwnOpenTile) {
    promptLine = 'Select an improvement below to preview adjacency bonuses on this tile.';
  } else if (tile && tile.landmark === 'frontier_village' && tile.villageHp !== null && fogStatus !== 'unexplored') {
    const cost = getPeacefulAnnexCost(state, viewerHouseId);
    const payingKeep = findAnnexFoodKeep(state, viewerHouseId, tile, cost.food);
    const bestKeepFood = Math.max(0, ...getHouseKeeps(state, viewerHouseId).map((k) => k.foodProgress));
    promptLine = payingKeep
      ? `Spend ${cost.food} Food (from ${payingKeep.name}) + ${cost.coin} Coin to annex peacefully (+1 Favor), or attack to seize (-2 Favor).`
      : `Requires ${cost.food} Food in one Keep (highest: ${bestKeepFood}) + ${cost.coin} Coin to annex peacefully.`;
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

  // Eligible units for Keep train strip
  const trainableUnits = isOwnKeep
    ? UNIT_IDS.filter((uid) => {
        const def = UNITS[uid];
        if (def.isEventOnly) return false;
        if (def.houseId !== null && def.houseId !== viewerHouseId) return false;
        if (def.requiredDecreeId !== null && !house.decreeIds.includes(def.requiredDecreeId)) {
          return false;
        }
        return true;
      })
    : [];

  return (
    <section className="relative z-30 w-full bg-[#1E293B]/95 border-t border-[#334155] backdrop-blur-md safe-bottom px-2 pt-2">
      {/* Combat Preview Overlay Card */}
      {attackPreviewTarget && isOwnUnit && (
        <div className="mb-2 p-2.5 rounded-xl bg-[#0F172A] border border-red-500/70 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-red-300 uppercase tracking-wide">
                Combat Forecast — {attackPreviewTarget.label}
              </p>
              {attackPreviewTarget.counterStatus === 'advantage' && (
                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-emerald-900/80 text-[10px] font-bold text-emerald-200">
                  COUNTER ADVANTAGE (+40% ATK &amp; DEF)
                </span>
              )}
              {attackPreviewTarget.counterStatus === 'disadvantage' && (
                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-red-900/80 text-[10px] font-bold text-red-200">
                  COUNTER DISADVANTAGE (Enemy +40%)
                </span>
              )}
              {attackPreviewTarget.counterStatus === 'neutral' && (
                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-semibold text-slate-300">
                  EVEN MATCHUP (1.0x)
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onCancelAttackPreview}
              className="touch-target px-2.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold"
            >
              Cancel
            </button>
          </div>

          {attackPreviewTarget.preview ? (
            <div className="mt-2 space-y-1 text-xs text-slate-200 tabular-nums">
              <div className="flex justify-between">
                <span>Your Strike:</span>
                <span className="font-bold text-amber-300">
                  -{attackPreviewTarget.preview.attackerDamage} HP (Target →{' '}
                  {attackPreviewTarget.preview.defenderHpAfter} HP)
                </span>
              </div>
              <div className="flex justify-between">
                <span>Retaliation:</span>
                <span className="font-semibold text-slate-300">
                  {attackPreviewTarget.preview.retaliationDamage > 0
                    ? `-${attackPreviewTarget.preview.retaliationDamage} HP (You → ${attackPreviewTarget.preview.attackerHpAfter} HP)`
                    : 'No enemy retaliation'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {attackPreviewTarget.preview.defenderDestroyed && (
                  <span className="px-2 py-0.5 rounded bg-red-700 text-[10px] font-bold text-white">
                    DECISIVE STRIKE
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
            className="mt-2 w-full touch-target rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-sm font-bold"
          >
            Confirm Strike
          </button>
        </div>
      )}

      {/* Contextual Guidance Line */}
      <p className="text-[11px] text-slate-300 leading-snug mb-2 px-0.5">{promptLine}</p>

      {/* Selected Tile / Unit / Keep / Village Details */}
      {tile && fogStatus !== 'unexplored' && (
        <div className="mb-2 space-y-2">
          {/* Header summary */}
          <div className="flex items-center justify-between text-xs text-slate-200 px-0.5">
            <span className="font-semibold">
              {TERRAINS[tile.terrain].name}
              {tile.hasIronDeposit ? ' • Iron Vein' : ''}
              {tile.improvement ? ` • ${IMPROVEMENTS[tile.improvement].name}` : ''}
              {tile.landmark !== 'none' && !tile.landmarkCleared
                ? ` • ${tile.landmark.replace('_', ' ')}`
                : ''}
            </span>
            <span className="text-slate-400 tabular-nums">
              ({tile.x}, {tile.y})
            </span>
          </div>

          {/* Own Unit Quick Actions */}
          {isOwnUnit && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700 text-xs tabular-nums">
                <span className="font-bold text-white">{UNITS[unitOnTile.typeId].name}</span>{' '}
                <span className="text-emerald-400">
                  {unitOnTile.hp}/{unitOnTile.maxHp} HP
                </span>{' '}
                <span className="text-slate-400">
                  ATK {UNITS[unitOnTile.typeId].attack} • DEF {UNITS[unitOnTile.typeId].defense}
                </span>
                {unitOnTile.homeKeepId === 'orphaned' && (
                  <span className="ml-1.5 text-red-400 font-bold">Supply-Severed</span>
                )}
              </div>

              {canPillageTile(state, unitOnTile.id) && (
                <button
                  type="button"
                  onClick={() => onPillage(unitOnTile.id)}
                  className="touch-target px-3 rounded-lg bg-amber-700 text-white text-xs font-bold active:bg-amber-800"
                >
                  Pillage
                </button>
              )}

              {canRehomeUnitManually(state, unitOnTile.id) && keepOnTile && (
                <button
                  type="button"
                  onClick={() => onRehome(unitOnTile.id)}
                  className="touch-target px-3 rounded-lg bg-teal-700 text-white text-xs font-bold active:bg-teal-800"
                >
                  Re-home to {keepOnTile.name}
                </button>
              )}
            </div>
          )}

          {/* Neutral Frontier Village Peaceful Annexation */}
          {tile.landmark === 'frontier_village' && tile.villageHp !== null && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canAnnexVillage(state, viewerHouseId, tile.key)}
                onClick={() => onAnnexVillage(tile.key)}
                className="touch-target flex-1 px-3 rounded-lg bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-400 text-white text-xs font-bold active:bg-emerald-800"
              >
                Peaceful Annex ({getPeacefulAnnexCost(state, viewerHouseId).food}F +{' '}
                {getPeacefulAnnexCost(state, viewerHouseId).coin}C)
              </button>
            </div>
          )}

          {/* Own Keep Train Strip */}
          {isOwnKeep && !isOwnUnit && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-300 tabular-nums">
                <span className="font-bold text-amber-200">
                  {keepOnTile.name} (Tier {keepOnTile.tier}
                  {keepOnTile.specialization !== 'none'
                    ? ` • ${KEEP_SPECIALIZATIONS[keepOnTile.specialization].name}`
                    : ''}
                  )
                </span>
                <span>
                  HP {keepOnTile.keepHp}/{keepOnTile.maxKeepHp}
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {trainableUnits.map((uid) => {
                  const def = UNITS[uid];
                  const cost = getUnitMatCost(house, uid);
                  const upkeep = getUnitUpkeep(house, uid);
                  const ok = canTrainUnit(state, viewerHouseId, keepOnTile.id, uid);
                  return (
                    <button
                      key={uid}
                      type="button"
                      disabled={!ok || isAiTurn}
                      onClick={() => onTrainUnit(keepOnTile.id, uid)}
                      className="touch-target shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-600 disabled:opacity-45 text-left active:bg-slate-700"
                    >
                      <div className="text-xs font-bold text-slate-100">{def.name}</div>
                      <div className="text-[10px] text-amber-300 tabular-nums">
                        {cost} Mat{upkeep > 0 ? ` • ${upkeep}C/t` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Own Open Tile Build Strip */}
          {isOwnOpenTile && buildableImprovements.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {buildableImprovements.map((impId) => {
                  const preview = previewImprovementOnTile(state, viewerHouseId, tile.key, impId);
                  const isSelected = buildModeImprovementId === impId;
                  return (
                    <button
                      key={impId}
                      type="button"
                      disabled={!preview.canBuild || isAiTurn}
                      onClick={() =>
                        onSelectBuildImprovement(isSelected ? null : impId)
                      }
                      className={`touch-target shrink-0 px-2.5 py-1.5 rounded-lg border text-left disabled:opacity-40 ${
                        isSelected
                          ? 'bg-emerald-900/80 border-emerald-400 text-white'
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
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-emerald-950/70 border border-emerald-600/60">
                    <div className="text-[11px] text-emerald-100">
                      <div className="font-bold">
                        {IMPROVEMENTS[buildModeImprovementId].name} ({p.matCost} Mat)
                      </div>
                      {p.adjacencyCallouts.length > 0 && (
                        <div className="text-emerald-300">{p.adjacencyCallouts[0]}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={!p.canBuild}
                      onClick={() => onConfirmBuild(tile.key, buildModeImprovementId)}
                      className="touch-target shrink-0 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold active:bg-emerald-700"
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

      {/* Primary Control Bar: Undo, Recap, Next Unit / End Turn */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={undoCount === 0 || isAiTurn}
          onClick={onUndo}
          title={undoCount === 0 && lastCommitReason ? lastCommitReason : 'Reverts your last action this turn.'}
          className="touch-target px-3 rounded-lg bg-slate-800 border border-slate-600 disabled:opacity-45 text-xs font-semibold text-slate-100 tabular-nums active:bg-slate-700"
        >
          Undo ({undoCount})
        </button>

        <button
          type="button"
          onClick={onOpenRecap}
          className="touch-target px-3 rounded-lg bg-slate-800 border border-slate-600 text-xs font-semibold text-slate-100 active:bg-slate-700"
        >
          Recap
        </button>

        <button
          type="button"
          disabled={!canEndOrCycle}
          onClick={onNextUnitOrEndTurn}
          className={`touch-target flex-1 px-4 rounded-lg text-sm font-bold shadow-md disabled:opacity-50 ${
            nextIdle
              ? 'bg-sky-600 active:bg-sky-700 text-white'
              : 'bg-amber-600 active:bg-amber-700 text-slate-950'
          }`}
        >
          {isAiTurn ? 'Rivals Acting…' : nextIdle ? 'Next Unit' : 'End Turn'}
        </button>
      </div>
    </section>
  );
}
