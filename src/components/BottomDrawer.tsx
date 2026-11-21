/**
 * Marchlands (Spec v2.0) — Contextual Mobile Bottom Drawer
 *
 * Features:
 * - Always-accessible End Turn button + dedicated Next (N) idle-unit cycler
 * - Dual [Unit]/[Keep] inspector tabs when a friendly unit stands on a friendly Keep
 * - Rich Unit Sheet: Class, Veterancy Rank/XP, Battle Honors, Lord-Commander Marshal Skills & Traits,
 *   Overwatch, Trebuchet Deploy, Field Reinforce (+8 HP), Frontier Outpost Founding, Fortify, Hold, Pillage, Re-home, Disband
 * - Rich Keep Sheet: Tier 1/2/3 Grand Citadel upgrade (160F + 16 Iron), Arrow Slits Range-2 Volley,
 *   Wounded Lord-Commander Early Rally, Local Military Building Badges, 4-Resource Yields & Train Strip
 * - Rich Tile/Landmark/Outpost Inspector: Level-2 Improvement Upgrades, Build Road, Clear Timber,
 *   Demolish, Village Annex, Central Ruined High Seat & Build Adjacency Preview
 * - Detailed Combat Forecast with 4-Way Counter Loop, Lance Charge, Shield Push, Armor-Piercing, High Ground & River badges
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
  BATTLE_HONORS,
  CITADEL_CHARTERS,
  CLEAR_TIMBER_COIN_COST,
  CLEAR_TIMBER_MAT_GAIN,
  COMMANDER_EARLY_RALLY_COIN,
  COMMANDER_TRAITS,
  HIGH_SEAT_MAX_HP,
  HOUSES,
  IMPROVEMENTS,
  IMPROVEMENT_IDS,
  KEEP_REPAIR_HP_AMOUNT,
  KEEP_REPAIR_MAT_COST,
  KEEP_SPECIALIZATIONS,
  KEEP_TIER3_IRON_COST,
  OUTPOST_COIN_COST,
  OUTPOST_MAT_COST,
  TERRAINS,
  UNITS,
  UNIT_IDS,
  VILLAGE_MAX_HP,
} from '../data/index.ts';
import { canRehomeUnitManually } from '../engine/capture.ts';
import {
  canAnnexVillage,
  canDemolishImprovement,
  canRallyCommanderEarly,
  canTrainUnit,
  findAnnexFoodKeep,
  getDemolishRefund,
  getDisbandRefund,
  getPeacefulAnnexCost,
  getUnitTrainingCosts,
  getUnitUpkeep,
} from '../engine/economy.ts';
import {
  canUnitAct,
  getActionableUnits,
  getHouseOutpostStats,
  getKeepInspectInfo,
  getTileInspectInfo,
  getUnitActionFlags,
  getUnitRankLabel,
  previewImprovementOnTile,
  type AttackTargetInfo,
} from '../engine/queries.ts';
import { getHouseKeeps, getKeepAt, getOutpostAt, getUnitAt } from '../engine/stateHelpers.ts';
import { HouseSigilSvg, ResourceIconSvg, UnitFigureSvg } from './svg/HeraldrySvg.tsx';

interface BottomDrawerProps {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly selectedTileKey: CoordKey | null;
  readonly buildModeImprovementId: ImprovementId | null;
  readonly outpostModeUnitId: string | null;
  readonly volleyModeKeepId: string | null;
  readonly beaconMarkMode: boolean;
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
  readonly onActivateOverwatch: (unitId: string) => void;
  readonly onDeployTrebuchet: (unitId: string) => void;
  readonly onReinforceUnit: (unitId: string) => void;
  readonly onToggleOutpostMode: (unitId: string | null) => void;
  readonly onUseCommanderSkill: (unitId: string) => void;
  readonly onHoldUnit: (unitId: string) => void;
  readonly onDisbandUnit: (unitId: string) => void;
  readonly onPillage: (unitId: string) => void;
  readonly onRehome: (unitId: string) => void;
  readonly onRepairKeep: (keepId: string) => void;
  readonly onUpgradeKeepTier3: (keepId: string) => void;
  readonly onToggleKeepVolleyMode: (keepId: string | null) => void;
  readonly onRallyCommander: () => void;
  readonly onUpgradeImprovement: (tileKey: CoordKey) => void;
  readonly onBuildRoad: (tileKey: CoordKey) => void;
  readonly onClearTimber: (tileKey: CoordKey) => void;
  readonly onDemolishImprovement: (tileKey: CoordKey) => void;
  readonly onAnnexVillage: (tileKey: CoordKey) => void;
  readonly onSelectBuildImprovement: (id: ImprovementId | null) => void;
  readonly onConfirmBuild: (tileKey: CoordKey, id: ImprovementId) => void;
  readonly onTrainUnit: (keepId: string, unitId: UnitId) => void;
}

function getLocalRequirementLabel(req: string): string {
  switch (req) {
    case 'barracks':
      return 'Barracks at Keep';
    case 'barracks_and_smithy':
      return 'Barracks + Smithy at Keep';
    case 'smithy_combo':
      return 'Forge Combo (Smithy + Ore + Mill/Quarry)';
    case 'siege_workshop':
      return 'Siege Workshop at Keep';
    case 'trebuchet_yard':
      return 'Lv2 Engine Yard + Tier-3 Citadel';
    default:
      return '';
  }
}

export function BottomDrawer({
  state,
  viewerHouseId,
  selectedTileKey,
  buildModeImprovementId,
  outpostModeUnitId,
  volleyModeKeepId,
  beaconMarkMode,
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
  onActivateOverwatch,
  onDeployTrebuchet,
  onReinforceUnit,
  onToggleOutpostMode,
  onUseCommanderSkill,
  onHoldUnit,
  onDisbandUnit,
  onPillage,
  onRehome,
  onRepairKeep,
  onUpgradeKeepTier3,
  onToggleKeepVolleyMode,
  onRallyCommander,
  onUpgradeImprovement,
  onBuildRoad,
  onClearTimber,
  onDemolishImprovement,
  onAnnexVillage,
  onSelectBuildImprovement,
  onConfirmBuild,
  onTrainUnit,
}: BottomDrawerProps) {
  const [confirmDisbandId, setConfirmDisbandId] = useState<string | null>(null);
  const [showLockedUnits, setShowLockedUnits] = useState(false);

  const house = state.houses[viewerHouseId]!;
  const commander = state.commanders[viewerHouseId];
  const tile = selectedTileKey ? state.tiles[selectedTileKey] ?? null : null;
  const fogStatus = selectedTileKey
    ? state.fog[viewerHouseId]?.[selectedTileKey] ?? 'unexplored'
    : 'unexplored';
  const unitOnTile =
    selectedTileKey && fogStatus === 'visible' ? getUnitAt(state, selectedTileKey) : null;
  const keepOnTile =
    selectedTileKey && fogStatus !== 'unexplored' ? getKeepAt(state, selectedTileKey) : null;
  const outpostOnTile =
    selectedTileKey && fogStatus !== 'unexplored' ? getOutpostAt(state, selectedTileKey) : null;

  const isOwnUnit = unitOnTile !== null && unitOnTile.houseId === viewerHouseId;
  const isEnemyUnit = unitOnTile !== null && unitOnTile.houseId !== viewerHouseId;
  const isOwnKeep = keepOnTile !== null && keepOnTile.ownerHouseId === viewerHouseId;
  const isEnemyKeep = keepOnTile !== null && keepOnTile.ownerHouseId !== viewerHouseId;
  const hasBothOwnUnitAndKeep = isOwnUnit && isOwnKeep;
  const showUnitPanel = isOwnUnit && (!hasBothOwnUnitAndKeep || keepInspectMode === 'unit');
  const showKeepPanel = isOwnKeep && (!hasBothOwnUnitAndKeep || keepInspectMode === 'keep');

  const isBuildCandidateTile =
    tile !== null &&
    keepOnTile === null &&
    outpostOnTile === null &&
    tile.improvement === null &&
    (tile.landmark === 'none' || tile.landmarkCleared);

  const actionableUnits = getActionableUnits(state, viewerHouseId, skippedUnitIds);
  const canCommand = !isAiTurn && state.phase === 'player_command';
  const outpostStats = getHouseOutpostStats(state, viewerHouseId);

  const tileInfo =
    selectedTileKey && fogStatus !== 'unexplored'
      ? getTileInspectInfo(state, selectedTileKey, viewerHouseId)
      : null;
  const keepInfo = isOwnKeep ? getKeepInspectInfo(state, viewerHouseId, keepOnTile.id) : null;

  // Eligible improvements for build strip (includes owned open tiles & 1-tile-outside border watchtowers)
  const buildableImprovements =
    isBuildCandidateTile && selectedTileKey
      ? IMPROVEMENT_IDS.filter((id) => {
          const def = IMPROVEMENTS[id];
          if (def.houseId !== null && def.houseId !== viewerHouseId) return false;
          if (tile.ownerHouseId === viewerHouseId) return true;
          return previewImprovementOnTile(state, viewerHouseId, selectedTileKey, id).canBuild;
        })
      : [];

  // Contextual guidance line
  let promptLine = 'Tap a friendly Keep, troop, or territory tile to command your March.';
  if (outpostModeUnitId) {
    promptLine = 'Tap a highlighted emerald neutral tile (on or adjacent to your troop) to found a Frontier Outpost.';
  } else if (volleyModeKeepId) {
    promptLine = 'Tap a highlighted enemy unit within 2 tiles to fire your Grand Citadel Arrow Slits Volley (6 dmg).';
  } else if (beaconMarkMode) {
    promptLine = 'Tap a highlighted enemy unit within 3 tiles of Marshal Cassian to apply Beacon Mark (+25% incoming dmg).';
  } else if (showUnitPanel && unitOnTile) {
    if (unitOnTile.isOverwatch) {
      promptLine = 'On Overwatch: Fires an automatic 85% reaction volley at the first enemy entering range.';
    } else if (unitOnTile.isFortified) {
      promptLine = 'Entrenched (+15% DEF, +2 extra heal if stationary). Moves or attacks cancel Fortify.';
    } else if (canUnitAct(state, unitOnTile)) {
      if (UNITS[unitOnTile.typeId].requiresDeploy && !unitOnTile.isDeployed) {
        promptLine = 'Siege Trebuchet: Move into position, then tap Deploy Engine to bombard targets up to 3 tiles away.';
      } else if (unitOnTile.remainingMovement > 0) {
        promptLine = 'Tap a blue tile to march, a red target to strike, or use class tactical actions below.';
      } else {
        promptLine = 'In position. Tap a red target to strike, Reinforce, Fortify, Overwatch, or End Turn.';
      }
    } else {
      promptLine = 'Orders complete for this turn. Rests at turn end (+2 HP passive if stationary & provisioned).';
    }
  } else if (showKeepPanel && keepOnTile && keepInfo) {
    promptLine =
      keepInfo.usedCap < keepInfo.maxCap
        ? `Train troops (${keepInfo.usedCap}/${keepInfo.maxCap} Cap) or grow borders (${keepOnTile.foodProgress}/${keepInfo.foodThreshold} Food).`
        : `Garrison full (${keepInfo.maxCap}/${keepInfo.maxCap}). Upgrade Keep tier, build War Camp, or Disband a troop.`;
  } else if (buildableImprovements.length > 0) {
    promptLine = 'Select an improvement below to preview adjacency yields on the map.';
  } else if (tile && tile.landmark === 'high_seat' && tile.highSeatHp !== null && fogStatus !== 'unexplored') {
    promptLine = `Central Ruined High Seat (${tile.highSeatHp}/${HIGH_SEAT_MAX_HP} HP): Breach to claim +3 Coin/turn, +1 Favor on even turns & +15 Chronicle score.`;
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

  // Trainable vs locked units for Keep (using v2.0 local military requirements)
  const houseRelevantUnits = showKeepPanel
    ? UNIT_IDS.filter((uid) => {
        const def = UNITS[uid];
        if (def.isEventOnly || def.isCommanderUnit) return false;
        if (def.houseId !== null && def.houseId !== viewerHouseId) return false;
        return true;
      })
    : [];

  const isUnitLocallyUnlocked = (uid: UnitId): boolean => {
    if (!keepInfo) return false;
    const req = UNITS[uid].localRequirement;
    if (req === 'none') return true;
    if (req === 'barracks') return keepInfo.hasBarracks;
    if (req === 'barracks_and_smithy') return keepInfo.hasBarracks && keepInfo.hasSmithy;
    if (req === 'smithy_combo') return keepInfo.hasSmithyCombo;
    if (req === 'siege_workshop') return keepInfo.hasSiegeWorkshop;
    if (req === 'trebuchet_yard') return keepInfo.hasTrebuchetYard;
    return false;
  };

  const unlockedUnits = houseRelevantUnits.filter(isUnitLocallyUnlocked);
  const lockedUnits = houseRelevantUnits.filter((uid) => !unlockedUnits.includes(uid));

  return (
    <section className="relative z-30 w-full surface-iron-up border-t border-amber-500/25 backdrop-blur-md safe-bottom px-2 pt-2">
      {/* Combat Preview Overlay Card */}
      {attackPreviewTarget && isOwnUnit && (
        <div className="mb-2 p-2.5 rounded-xl bg-[#16181D] border border-red-500/75 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-serif-march text-xs font-bold text-red-300 uppercase tracking-wide">
                Combat Forecast — {attackPreviewTarget.label}
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {attackPreviewTarget.counterStatus === 'advantage' && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-900/85 border border-emerald-500/50 text-[10px] font-bold text-emerald-200">
                    COUNTER +35%
                  </span>
                )}
                {attackPreviewTarget.counterStatus === 'disadvantage' && (
                  <span className="px-1.5 py-0.5 rounded bg-red-900/85 border border-red-500/50 text-[10px] font-bold text-red-200">
                    COUNTERED (Enemy +35%)
                  </span>
                )}
                {attackPreviewTarget.preview?.chargeTriggered && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-800/90 border border-amber-400/60 text-[10px] font-bold text-amber-100">
                    LANCE CHARGE +20%
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
                {attackPreviewTarget.preview.shieldPushTriggered && (
                  <span className="px-2 py-0.5 rounded bg-indigo-700 text-[10px] font-bold text-white">
                    SHIELD PUSH (1-Tile Knockback)
                  </span>
                )}
                {attackPreviewTarget.preview.oneShotProtectionTriggered && (
                  <span className="px-2 py-0.5 rounded bg-sky-700 text-[10px] font-bold text-white">
                    STEADFAST (Survives at 1 HP)
                  </span>
                )}
                {attackPreviewTarget.preview.braceTriggered && (
                  <span className="px-2 py-0.5 rounded bg-amber-700 text-[10px] font-bold text-white">
                    PHALANX BRACE
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
            className={`touch-target min-h-[44px] rounded-lg border text-xs font-bold transition ${
              keepInspectMode === 'unit'
                ? 'bg-sky-900/75 border-sky-400 text-white'
                : 'bg-slate-900/70 border-slate-700 text-slate-300'
            }`}
          >
            Troop: {unitOnTile.isCommander ? HOUSES[unitOnTile.houseId].commanderName : UNITS[unitOnTile.typeId].name}
          </button>
          <button
            type="button"
            onClick={() => onSetKeepInspectMode('keep')}
            className={`touch-target min-h-[44px] rounded-lg border text-xs font-bold transition ${
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

      {/* Selected Tile / Unit / Keep / Outpost / Enemy Details */}
      {tile && fogStatus !== 'unexplored' && tileInfo && (
        <div className="mb-2 space-y-2">
          {/* Tile Meta Header: Terrain, DEF Cover, Move Cost, Live Yield */}
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-200 px-0.5">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="font-bold text-slate-100">
                {TERRAINS[tile.terrain].name}
                {tile.hasIronDeposit ? ' • Iron Vein' : ''}
                {tile.hasRoad ? ' • Road' : ''}
                {tile.improvement
                  ? ` • ${
                      tile.improvementLevel === 2 && IMPROVEMENTS[tile.improvement].upgrade
                        ? `${IMPROVEMENTS[tile.improvement].upgrade!.name} (Lv2)`
                        : IMPROVEMENTS[tile.improvement].name
                    }`
                  : ''}
                {outpostOnTile ? ` • ${outpostOnTile.name}` : ''}
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
                tileInfo.yieldNow.iron > 0 ||
                tileInfo.yieldNow.coin > 0) && (
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-bold">
                  {tileInfo.yieldNow.food > 0 && (
                    <span className="text-emerald-400 mr-1">+{tileInfo.yieldNow.food}F</span>
                  )}
                  {tileInfo.yieldNow.materials > 0 && (
                    <span className="text-amber-400 mr-1">+{tileInfo.yieldNow.materials}M</span>
                  )}
                  {tileInfo.yieldNow.iron > 0 && (
                    <span className="text-sky-400 mr-1">+{tileInfo.yieldNow.iron}Ir</span>
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

          {/* Tile Infrastructure Actions: Upgrade to Lv2, Build Road, Clear Timber, Demolish */}
          {tile.ownerHouseId === viewerHouseId &&
            (tileInfo.canUpgrade ||
              tileInfo.canRoad ||
              tileInfo.canClear ||
              (!showUnitPanel &&
                !showKeepPanel &&
                canDemolishImprovement(state, viewerHouseId, tile.key))) && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {tileInfo.canUpgrade && tile.improvement && tileInfo.upgradeCosts && (
                  <button
                    type="button"
                    disabled={!canCommand}
                    onClick={() => onUpgradeImprovement(tile.key)}
                    className="touch-target shrink-0 px-3 rounded-xl bg-amber-900/80 border border-amber-400/70 text-amber-100 text-xs font-bold active:bg-amber-800 disabled:opacity-40"
                  >
                    Upgrade → {IMPROVEMENTS[tile.improvement].upgrade?.name} (
                    {tileInfo.upgradeCosts.materials}M
                    {tileInfo.upgradeCosts.iron > 0 ? `+${tileInfo.upgradeCosts.iron}Ir` : ''}
                    {tileInfo.upgradeCosts.coin > 0 ? `+${tileInfo.upgradeCosts.coin}C` : ''})
                  </button>
                )}

                {tileInfo.canRoad && (
                  <button
                    type="button"
                    disabled={!canCommand}
                    onClick={() => onBuildRoad(tile.key)}
                    className="touch-target shrink-0 px-3 rounded-xl bg-stone-800 border border-stone-500/70 text-stone-200 text-xs font-bold active:bg-stone-700 disabled:opacity-40"
                  >
                    Build Road ({tileInfo.roadCost}M)
                  </button>
                )}

                {tileInfo.canClear && (
                  <button
                    type="button"
                    disabled={!canCommand}
                    onClick={() => onClearTimber(tile.key)}
                    className="touch-target shrink-0 px-3 rounded-xl bg-emerald-950 border border-emerald-500/60 text-emerald-200 text-xs font-bold active:bg-emerald-900 disabled:opacity-40"
                  >
                    Clear Timber ({CLEAR_TIMBER_COIN_COST}C → +{CLEAR_TIMBER_MAT_GAIN}M)
                  </button>
                )}

                {!showUnitPanel &&
                  !showKeepPanel &&
                  tile.improvement &&
                  canDemolishImprovement(state, viewerHouseId, tile.key) && (
                    <button
                      type="button"
                      disabled={!canCommand}
                      onClick={() => onDemolishImprovement(tile.key)}
                      className="touch-target shrink-0 px-2.5 rounded-xl bg-slate-900 border border-red-500/45 text-red-200 text-[11px] font-bold disabled:opacity-40 active:bg-red-950"
                    >
                      Clear {IMPROVEMENTS[tile.improvement].name} (+
                      {getDemolishRefund(viewerHouseId, tile.improvement)}M)
                    </button>
                  )}
              </div>
            )}

          {/* Frontier Outpost Inspector Card */}
          {outpostOnTile && !showUnitPanel && (
            <div className="p-2 rounded-xl bg-slate-900/85 border border-stone-600/80 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <HouseSigilSvg houseId={outpostOnTile.ownerHouseId} size={22} />
                <div className="min-w-0">
                  <div className="font-bold text-stone-100 truncate">
                    {outpostOnTile.name} ({HOUSES[outpostOnTile.ownerHouseId].name} Outpost)
                  </div>
                  <div className="text-[11px] text-slate-300">
                    HP {outpostOnTile.hp}/{outpostOnTile.maxHp} • 3×3 territory pocket • Winter shelter & +3 HP garrison rest
                  </div>
                </div>
              </div>
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
                        {HOUSES[unitOnTile.houseId].name}{' '}
                        {unitOnTile.isCommander
                          ? HOUSES[unitOnTile.houseId].commanderName
                          : UNITS[unitOnTile.typeId].name}
                        {unitOnTile.isFortified ? ' • Fortified' : ''}
                        {unitOnTile.isOverwatch ? ' • Overwatch' : ''}
                        {unitOnTile.isDeployed ? ' • Deployed' : ''}
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
            const flags = getUnitActionFlags(state, unitOnTile.id);
            const canEnterOutpostMode =
              !unitOnTile.hasAttacked &&
              def.unitClass !== 'siege' &&
              outpostStats.current < outpostStats.max &&
              house.resources.materials >= OUTPOST_MAT_COST &&
              house.resources.coin >= OUTPOST_COIN_COST;
            const houseDef = HOUSES[viewerHouseId];

            return (
              <div className="space-y-1.5">
                <div className="p-2 rounded-xl bg-[#16181D]/85 border border-[#383B44] flex items-center gap-2">
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-[#EAE3D2]/92 border border-[#C7BEA8]/65 shadow-inner flex items-center justify-center">
                    <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden="true">
                      <UnitFigureSvg unitId={unitOnTile.typeId} houseId={unitOnTile.houseId} />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-serif-march font-bold text-white truncate">
                          {unitOnTile.isCommander ? HOUSES[unitOnTile.houseId].commanderName : def.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-bold uppercase text-sky-300">
                          {unitOnTile.isCommander ? `Marshal Lv${commander?.level ?? 1}` : def.unitClass}
                        </span>
                        {!unitOnTile.isCommander && (
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
                        )}
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
                      {unitOnTile.isOverwatch && (
                        <span className="text-sky-300 font-bold">• OVERWATCH (85%)</span>
                      )}
                      {unitOnTile.isDeployed && (
                        <span className="text-amber-300 font-bold">• DEPLOYED (RNG 3)</span>
                      )}
                      {unitOnTile.homeKeepId === 'orphaned' && (
                        <span className="text-red-400 font-bold">• SUPPLY-SEVERED (−25%)</span>
                      )}
                    </div>

                    {/* Battle Honors or Commander Traits Badges */}
                    {(unitOnTile.battleHonors.length > 0 ||
                      (unitOnTile.isCommander && (commander?.traits.length ?? 0) > 0)) && (
                      <div className="flex flex-wrap gap-1">
                        {unitOnTile.battleHonors.map((hid) => (
                          <span
                            key={hid}
                            className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/50 text-[9px] font-bold text-amber-200"
                            title={BATTLE_HONORS[hid].effectText}
                          >
                            ★ {BATTLE_HONORS[hid].title}
                          </span>
                        ))}
                        {unitOnTile.isCommander &&
                          commander?.traits.map((tid) => (
                            <span
                              key={tid}
                              className="px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-400/50 text-[9px] font-bold text-sky-200"
                              title={COMMANDER_TRAITS[tid].effectText}
                            >
                              ♛ {COMMANDER_TRAITS[tid].title}
                            </span>
                          ))}
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 leading-snug">
                      {unitOnTile.isCommander
                        ? '+10% Aura (1 tile) & Winter/Mutiny Shield • Exempt from Army Cap'
                        : def.flavor}
                    </p>
                  </div>
                </div>

                {/* Tactical Action Row */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                  {unitOnTile.isCommander && commander && (
                    <button
                      type="button"
                      disabled={(!flags.canUseSkill && viewerHouseId !== 'solis') || commander.skillCooldown > 0 || unitOnTile.hasAttacked || !canCommand}
                      onClick={() => onUseCommanderSkill(unitOnTile.id)}
                      className={`touch-target shrink-0 px-3 rounded-xl border text-xs font-bold disabled:opacity-40 ${
                        beaconMarkMode
                          ? 'bg-amber-600 border-amber-300 text-slate-950'
                          : 'bg-amber-900/85 border-amber-400/75 text-amber-100 active:bg-amber-800'
                      }`}
                      title={houseDef.commanderSkillDesc}
                    >
                      {commander.skillCooldown > 0
                        ? `${houseDef.commanderSkillName} (${commander.skillCooldown}t)`
                        : beaconMarkMode
                          ? 'Cancel Mark'
                          : `♛ ${houseDef.commanderSkillName}`}
                    </button>
                  )}

                  {flags.canDeploy && (
                    <button
                      type="button"
                      disabled={!canCommand}
                      onClick={() => onDeployTrebuchet(unitOnTile.id)}
                      className="touch-target shrink-0 px-3 rounded-xl bg-amber-800 border border-amber-400/70 text-amber-100 text-xs font-bold active:bg-amber-700 disabled:opacity-40"
                    >
                      Deploy Engine
                    </button>
                  )}

                  {flags.canOverwatch && (
                    <button
                      type="button"
                      disabled={!canCommand}
                      onClick={() => onActivateOverwatch(unitOnTile.id)}
                      className="touch-target shrink-0 px-3 rounded-xl bg-sky-900/85 border border-sky-400/70 text-sky-100 text-xs font-bold active:bg-sky-800 disabled:opacity-40"
                    >
                      Overwatch
                    </button>
                  )}

                  {flags.canReinforce && (
                    <button
                      type="button"
                      disabled={!canCommand}
                      onClick={() => onReinforceUnit(unitOnTile.id)}
                      className="touch-target shrink-0 px-3 rounded-xl bg-teal-900/85 border border-teal-400/70 text-teal-100 text-xs font-bold active:bg-teal-800 disabled:opacity-40"
                    >
                      Reinforce +8 HP ({flags.reinforceCost.coin}C
                      {flags.reinforceCost.materials > 0
                        ? `+${flags.reinforceCost.materials}M`
                        : flags.reinforceCost.iron > 0
                          ? `+${flags.reinforceCost.iron}Ir`
                          : ''}
                      )
                    </button>
                  )}

                  {flags.canFortify && (
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

                  {canEnterOutpostMode && (
                    <button
                      type="button"
                      disabled={!canCommand}
                      onClick={() =>
                        onToggleOutpostMode(
                          outpostModeUnitId === unitOnTile.id ? null : unitOnTile.id,
                        )
                      }
                      className={`touch-target shrink-0 px-3 rounded-xl border text-xs font-bold disabled:opacity-40 ${
                        outpostModeUnitId === unitOnTile.id
                          ? 'bg-emerald-600 border-emerald-300 text-white'
                          : 'bg-stone-800 border-emerald-500/60 text-emerald-200'
                      }`}
                    >
                      {outpostModeUnitId === unitOnTile.id
                        ? 'Cancel Outpost'
                        : `Found Outpost (${OUTPOST_MAT_COST}M+${OUTPOST_COIN_COST}C)`}
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

                  {flags.canPillage && (
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

                  {!unitOnTile.isCommander && (
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
                  )}
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

          {/* Own Keep Overview, Growth Bar, Tier-3 Upgrade, Arrow Slits Volley, Field Repair & Train Strip */}
          {showKeepPanel && keepOnTile && keepInfo && (
            <div className="space-y-1.5">
              <div className="p-2 rounded-xl bg-[#16181D]/85 border border-amber-500/30 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                  <span className="font-serif-march font-bold text-amber-200 truncate">
                    {keepOnTile.name} • Tier {keepOnTile.tier}
                    {keepOnTile.specialization !== 'none'
                      ? ` (${KEEP_SPECIALIZATIONS[keepOnTile.specialization].name})`
                      : ''}
                    {keepOnTile.citadelCharter !== 'none'
                      ? ` • ${CITADEL_CHARTERS[keepOnTile.citadelCharter].name}`
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
                        className="touch-target min-h-[44px] px-2.5 py-1 rounded-lg bg-amber-700 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[10px] font-bold"
                      >
                        Repair +{KEEP_REPAIR_HP_AMOUNT} ({KEEP_REPAIR_MAT_COST}M)
                      </button>
                    )}
                  </div>
                </div>

                {/* Food Growth Bar & Army Cap / 4-Resource Yield summary */}
                <div className="grid grid-cols-2 gap-2 items-center text-[10px] tabular-nums">
                  <div>
                    <div className="flex justify-between text-emerald-300 mb-0.5">
                      <span>
                        {keepOnTile.tier === 1
                          ? 'Tier-2 Growth'
                          : keepOnTile.tier === 2
                            ? 'Tier-3 Citadel Reserve'
                            : 'Surplus Bar'}
                      </span>
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
                    {keepInfo.keepYield.iron > 0 && (
                      <span className="text-sky-300 font-semibold">+{keepInfo.keepYield.iron}Ir</span>
                    )}
                    <span className="text-yellow-300 font-semibold">+{keepInfo.keepYield.coin}C</span>
                  </div>
                </div>

                {/* Local Military Infrastructure Badges & Keep Actions */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
                  <div className="flex flex-wrap gap-1 text-[9px]">
                    {keepInfo.hasBarracks && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-semibold">
                        Barracks
                      </span>
                    )}
                    {keepInfo.hasSmithy && (
                      <span
                        className={`px-1.5 py-0.5 rounded font-semibold ${
                          keepInfo.hasSmithyCombo
                            ? 'bg-sky-900/80 border border-sky-500/40 text-sky-200'
                            : 'bg-slate-800 text-slate-200'
                        }`}
                      >
                        {keepInfo.hasSmithyCombo ? 'Forge Active' : 'Smithy'}
                      </span>
                    )}
                    {keepInfo.hasSiegeWorkshop && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-200 font-semibold">
                        {keepInfo.hasTrebuchetYard ? 'Engine Yard (Lv2)' : 'Siege Workshop'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {keepOnTile.tier === 2 && (
                      <button
                        type="button"
                        disabled={!keepInfo.canUpgradeTier3 || !canCommand}
                        onClick={() => onUpgradeKeepTier3(keepOnTile.id)}
                        className="touch-target min-h-[44px] px-2.5 py-1 rounded-lg bg-amber-600 disabled:bg-slate-800 disabled:text-slate-400 text-slate-950 text-[10px] font-bold"
                      >
                        Upgrade Tier-3 Citadel ({keepInfo.foodThreshold}F + {KEEP_TIER3_IRON_COST}Ir)
                      </button>
                    )}

                    {keepOnTile.tier === 3 &&
                      !keepOnTile.garrisonVolleyUsedThisTurn &&
                      keepInfo.volleyTargets.length > 0 && (
                        <button
                          type="button"
                          disabled={!canCommand}
                          onClick={() =>
                            onToggleKeepVolleyMode(
                              volleyModeKeepId === keepOnTile.id ? null : keepOnTile.id,
                            )
                          }
                          className={`touch-target min-h-[44px] px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                            volleyModeKeepId === keepOnTile.id
                              ? 'bg-red-600 text-white'
                              : 'bg-amber-700 text-white'
                          }`}
                        >
                          {volleyModeKeepId === keepOnTile.id
                            ? 'Cancel Volley'
                            : `Arrow Slits Volley (${keepInfo.volleyTargets.length})`}
                        </button>
                      )}

                    {keepOnTile.isCapital &&
                      commander &&
                      commander.unitId === null &&
                      commander.woundedTurnsRemaining > 0 && (
                        <button
                          type="button"
                          disabled={!canRallyCommanderEarly(state, viewerHouseId) || !canCommand}
                          onClick={onRallyCommander}
                          className="touch-target min-h-[44px] px-2.5 py-1 rounded-lg bg-sky-700 disabled:bg-slate-800 disabled:text-slate-400 text-white text-[10px] font-bold"
                        >
                          Rally Marshal ({commander.woundedTurnsRemaining}t • {COMMANDER_EARLY_RALLY_COIN}C)
                        </button>
                      )}
                  </div>
                </div>
              </div>

              {/* Trainable Unit Strip */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {unlockedUnits.map((uid) => {
                  const def = UNITS[uid];
                  const costs = getUnitTrainingCosts(state, viewerHouseId, keepOnTile.id, uid);
                  const upkeep = getUnitUpkeep(house, uid, keepOnTile);
                  const ok = canTrainUnit(state, viewerHouseId, keepOnTile.id, uid);
                  return (
                    <button
                      key={uid}
                      type="button"
                      disabled={!ok || !canCommand}
                      onClick={() => onTrainUnit(keepOnTile.id, uid)}
                      className="touch-target shrink-0 px-2 py-1.5 rounded-xl bg-[#1E2128] border border-[#383B44] hover:border-[#D4AF5A]/70 disabled:opacity-40 text-left active:bg-[#282C35] flex items-center gap-2"
                    >
                      <span className="w-9 h-9 rounded-lg bg-[#EAE3D2]/92 border border-[#C7BEA8]/65 shadow-inner flex items-center justify-center shrink-0">
                        <svg width="30" height="30" viewBox="0 0 36 36" aria-hidden="true" className="shrink-0">
                          <UnitFigureSvg unitId={uid} houseId={viewerHouseId} />
                        </svg>
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-100">{def.name}</div>
                        <div className="text-[10px] text-amber-300 tabular-nums">
                          {costs.materials}M
                          {costs.iron > 0 ? <span className="text-sky-300"> + {costs.iron}Ir</span> : ''}
                          {upkeep > 0 ? ` • ${upkeep}C/t` : ' • Free'}
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
                    return (
                      <div
                        key={uid}
                        className="shrink-0 px-2.5 py-1.5 rounded-xl bg-slate-950/75 border border-slate-800 text-left"
                      >
                        <div className="text-[11px] font-bold text-slate-300">{def.name}</div>
                        <div className="text-[9px] text-amber-400/90">
                          Requires: {getLocalRequirementLabel(def.localRequirement)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Open Tile Build Strip */}
          {buildableImprovements.length > 0 && (
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
                        {preview.costs.materials}M
                        {preview.costs.iron > 0 ? ` + ${preview.costs.iron}Ir` : ''}
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
                        {IMPROVEMENTS[buildModeImprovementId].name} ({p.costs.materials}M
                        {p.costs.iron > 0 ? ` + ${p.costs.iron} Iron` : ''})
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
