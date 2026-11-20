/**
 * Marchlands (Spec v0.3) — Root Mobile PWA Shell
 *
 * Orchestrates:
 * - Title / New Campaign Setup & Resume Autosave
 * - Two-tap Cartographic MapBoard + TopHud + BottomDrawer + Modals & Realm Ledger
 * - Separate Next Unit cycler & always-accessible End Turn control
 * - Fortify stance, Unit Veterancy, Field Repair, Demolish, Disband & Relic Ruin popups
 * - Ephemeral 20-snapshot Undo stack with Ruling 6.4 commit-point clearing
 * - Atomic IndexedDB autosave after every player action, modal, undo, and AI turn
 * - Web Worker AI turn loop with 8,000ms watchdog
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CoordKey,
  DecreeId,
  Difficulty,
  GameMode,
  GameState,
  HouseId,
  ImprovementId,
  KeepSpecialization,
  SaveMetadata,
  UnitId,
} from './types/game.ts';
import { HOUSE_IDS, RELIC_RUINS, UNDO_STACK_MAX } from './data/index.ts';
import { rehomeUnitManually } from './engine/capture.ts';
import {
  attackKeep,
  attackOutlawCamp,
  attackUnit,
  attackVillage,
  getUnitRank,
  pillageTile,
  razeFortification,
} from './engine/combat.ts';
import {
  payRegentsTithe,
  performCrownGrant,
  performPetitionCharter,
  performRoyalReroll,
} from './engine/crown.ts';
import { applyKeepSpecialization, selectDecree } from './engine/draftAndSpec.ts';
import {
  annexVillage,
  buildImprovement,
  demolishImprovement,
  disbandUnit,
  fortifyUnit,
  repairKeep,
  trainUnit,
} from './engine/economy.ts';
import { resolveEventChoice } from './engine/events.ts';
import { getReachableTiles, moveUnit } from './engine/movement.ts';
import {
  getCommitPointReason,
  getNextIdleUnit,
  getUnitAttackTargets,
  previewImprovementOnTile,
  type AttackTargetInfo,
  type BuildPreviewInfo,
} from './engine/queries.ts';
import { createInitialGameState, getKeepAt, getUnitAt } from './engine/stateHelpers.ts';
import { endHouseTurn, type PlayerActionType } from './engine/turn.ts';
import {
  exportSaveJson,
  importSaveJson,
  listSaveSlots,
  loadAutosave,
  loadGameFromSlot,
  requestPersistentStorage,
  saveAutosave,
  saveGameToSlot,
  type SaveRecord,
} from './storage/persistence.ts';
import { runAiTurnWithWatchdog, terminateAiWorker } from './workers/runAiTurnWithWatchdog.ts';
import { BottomDrawer } from './components/BottomDrawer.tsx';
import { MapBoard } from './components/MapBoard.tsx';
import {
  CrownDrawer,
  DraftModal,
  EventModal,
  GameOverModal,
  MenuDrawer,
  PrimerModal,
  RealmLedgerDrawer,
  RecapModal,
  RelicDiscoveryModal,
  SpecializationModal,
} from './components/Modals.tsx';
import { TitleScreen } from './components/TitleScreen.tsx';
import { TopHud } from './components/TopHud.tsx';
import { INITIAL_UI_STATE, type UiInteractionState } from './components/uiTypes.ts';

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [ui, setUi] = useState<UiInteractionState>(INITIAL_UI_STATE);
  const [autosave, setAutosave] = useState<SaveRecord | null>(null);
  const [saveSlots, setSaveSlots] = useState<SaveMetadata[]>([]);
  const [focusTile, setFocusTile] = useState<{ key: CoordKey | null; nonce: number }>({
    key: null,
    nonce: 0,
  });

  const toastTimerRef = useRef<number | null>(null);
  const popupSeqRef = useRef(1);
  const aiRunningRef = useRef(false);

  const showToast = useCallback(
    (message: string, tone: 'info' | 'warn' | 'error' = 'info') => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      setUi((prev) => ({ ...prev, toastMessage: message, toastTone: tone }));
      toastTimerRef.current = window.setTimeout(() => {
        setUi((prev) => ({ ...prev, toastMessage: null }));
      }, 3200);
    },
    [],
  );

  const spawnMapPopup = useCallback((tileKey: CoordKey, text: string, color: string) => {
    const id = popupSeqRef.current++;
    setUi((prev) => ({
      ...prev,
      floatingPopups: [...prev.floatingPopups, { id, tileKey, text, color }],
    }));
    window.setTimeout(() => {
      setUi((prev) => ({
        ...prev,
        floatingPopups: prev.floatingPopups.filter((p) => p.id !== id),
      }));
    }, 1500);
  }, []);

  const refreshSaves = useCallback(async () => {
    const [autoRes, listRes] = await Promise.all([loadAutosave(), listSaveSlots()]);
    if (autoRes.ok) {
      setAutosave(autoRes.data);
    }
    if (listRes.ok) {
      setSaveSlots(listRes.data);
    }
  }, []);

  // Request persistent storage & hydrate autosave on app launch
  useEffect(() => {
    let active = true;
    void requestPersistentStorage();
    void Promise.all([loadAutosave(), listSaveSlots()]).then(([autoRes, listRes]) => {
      if (!active) return;
      if (autoRes.ok) {
        setAutosave(autoRes.data);
      }
      if (listRes.ok) {
        setSaveSlots(listRes.data);
      }
    });
    return () => {
      active = false;
      terminateAiWorker();
    };
  }, []);

  const persistAutosave = useCallback(
    async (stateToSave: GameState) => {
      const res = await saveAutosave(stateToSave);
      if (!res.ok) {
        showToast(`Storage warning: ${res.error}`, 'warn');
      } else {
        setAutosave({ metadata: res.data, state: stateToSave });
      }
    },
    [showToast],
  );

  const panToTile = useCallback((tileKey: CoordKey) => {
    setFocusTile((prev) => ({ key: tileKey, nonce: prev.nonce + 1 }));
  }, []);

  const viewerHouseId: HouseId =
    gameState?.humanHouseId ?? gameState?.activeHouseId ?? 'vane';

  // Core player action dispatcher: applies undo commit-point rules + atomic autosave
  const dispatchPlayerTransition = useCallback(
    (
      nextState: GameState,
      actionType: PlayerActionType,
      opts?: { clearSelection?: boolean; clearBuildMode?: boolean; clearSkipped?: boolean },
    ) => {
      if (!gameState || nextState === gameState) return;
      const commitReason = getCommitPointReason(
        gameState,
        nextState,
        actionType,
        viewerHouseId,
      );

      setGameState(nextState);
      setUi((prev) => ({
        ...prev,
        selectedTileKey: opts?.clearSelection ? null : prev.selectedTileKey,
        buildModeImprovementId: opts?.clearBuildMode ? null : prev.buildModeImprovementId,
        attackPreviewTargetKey: null,
        skippedUnitIds: opts?.clearSkipped ? [] : prev.skippedUnitIds,
        undoStack: commitReason
          ? []
          : [...prev.undoStack.slice(-(UNDO_STACK_MAX - 1)), gameState],
        lastCommitReason: commitReason ?? prev.lastCommitReason,
      }));
      void persistAutosave(nextState);
    },
    [gameState, viewerHouseId, persistAutosave],
  );

  // Web Worker AI turn loop with 8,000ms watchdog & atomic autosave per AI turn
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === 'game_over') return;
    if (!gameState.humanHouseId) return;
    if (gameState.activeHouseId === gameState.humanHouseId) return;
    if (aiRunningRef.current) return;

    const actingHouseId = gameState.activeHouseId;
    aiRunningRef.current = true;
    setUi((prev) => ({
      ...prev,
      aiThinkingHouseId: actingHouseId,
      selectedTileKey: null,
      buildModeImprovementId: null,
      attackPreviewTargetKey: null,
    }));

    let cancelled = false;
    void runAiTurnWithWatchdog(gameState, actingHouseId).then(async (res) => {
      aiRunningRef.current = false;
      if (cancelled) return;
      await persistAutosave(res.state);
      setGameState(res.state);
      setUi((prev) => ({
        ...prev,
        aiThinkingHouseId:
          res.state.activeHouseId === res.state.humanHouseId ||
          res.state.phase === 'game_over'
            ? null
            : res.state.activeHouseId,
        skippedUnitIds: [],
        undoStack: [],
        lastCommitReason: 'A new turn has begun',
      }));
      if (res.timedOut) {
        showToast('A rival House timed out in council and ended its turn.', 'warn');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [gameState, persistAutosave, showToast]);

  // Derived tactical sets for MapBoard (100% computed via headless engine functions)
  const selectedUnit = useMemo(() => {
    if (!gameState || !ui.selectedTileKey) return null;
    const u = getUnitAt(gameState, ui.selectedTileKey);
    return u && u.houseId === viewerHouseId ? u : null;
  }, [gameState, ui.selectedTileKey, viewerHouseId]);

  const reachableKeys = useMemo<ReadonlySet<CoordKey>>(() => {
    if (
      !gameState ||
      !selectedUnit ||
      selectedUnit.isFortified ||
      selectedUnit.remainingMovement <= 0 ||
      (selectedUnit.hasAttacked && selectedUnit.typeId !== 'dusk_outrider') ||
      gameState.activeHouseId !== viewerHouseId ||
      gameState.phase !== 'player_command'
    ) {
      return new Set();
    }
    return new Set(Object.keys(getReachableTiles(gameState, selectedUnit.id)));
  }, [gameState, selectedUnit, viewerHouseId]);

  const attackTargets = useMemo<readonly AttackTargetInfo[]>(() => {
    if (
      !gameState ||
      !selectedUnit ||
      selectedUnit.hasAttacked ||
      selectedUnit.isFortified ||
      gameState.activeHouseId !== viewerHouseId ||
      gameState.phase !== 'player_command'
    ) {
      return [];
    }
    return getUnitAttackTargets(gameState, selectedUnit.id);
  }, [gameState, selectedUnit, viewerHouseId]);

  const attackTargetByKey = useMemo(() => {
    const m = new Map<CoordKey, AttackTargetInfo>();
    for (const t of attackTargets) {
      m.set(t.tileKey, t);
    }
    return m;
  }, [attackTargets]);

  const attackableKeys = useMemo<ReadonlySet<CoordKey>>(
    () => new Set(attackTargets.map((t) => t.tileKey)),
    [attackTargets],
  );

  const buildPreviews = useMemo<ReadonlyMap<CoordKey, BuildPreviewInfo>>(() => {
    const m = new Map<CoordKey, BuildPreviewInfo>();
    if (!gameState || !ui.buildModeImprovementId) return m;
    for (const tile of Object.values(gameState.tiles)) {
      if (tile.ownerHouseId === viewerHouseId && tile.improvement === null) {
        const p = previewImprovementOnTile(
          gameState,
          viewerHouseId,
          tile.key,
          ui.buildModeImprovementId,
        );
        if (p.canBuild) {
          m.set(tile.key, p);
        }
      }
    }
    return m;
  }, [gameState, ui.buildModeImprovementId, viewerHouseId]);

  // Handlers
  const handleStartNewCampaign = (opts: {
    houseId: HouseId;
    mode: GameMode;
    difficulty: Difficulty;
    houseCount: 4 | 5;
    seed: number;
  }) => {
    const others = HOUSE_IDS.filter((h) => h !== opts.houseId);
    const customHouseOrder = [opts.houseId, ...others.slice(0, opts.houseCount - 1)];
    const initial = createInitialGameState({
      seed: opts.seed,
      houseCount: opts.houseCount,
      mode: opts.mode,
      difficulty: opts.difficulty,
      humanHouseId: opts.houseId,
      customHouseOrder,
    });

    const capital = Object.values(initial.keeps).find(
      (k) => k.ownerHouseId === opts.houseId && k.isCapital,
    );

    setGameState(initial);
    setUi({
      ...INITIAL_UI_STATE,
      selectedTileKey: capital?.tileKey ?? null,
      showPrimerModal: false,
      recapSinceTurn: 1,
    });
    if (capital) {
      panToTile(capital.tileKey);
    }
    void persistAutosave(initial);
    showToast(`Chronicle Saved • Turn ${initial.turnNumber}`);
  };

  const handleResumeAutosave = () => {
    if (!autosave) return;
    const state = autosave.state;
    const hid = state.humanHouseId ?? state.activeHouseId;
    const capital = Object.values(state.keeps).find(
      (k) => k.ownerHouseId === hid && k.isCapital,
    );
    setGameState(state);
    setUi({
      ...INITIAL_UI_STATE,
      selectedTileKey: capital?.tileKey ?? null,
      showRecapModal: true,
      recapSinceTurn: Math.max(1, state.turnNumber - 1),
      lastPlayedIso: autosave.metadata.savedAtIso,
    });
    if (capital) {
      panToTile(capital.tileKey);
    }
  };

  const handleImportJson = (jsonText: string) => {
    const res = importSaveJson(jsonText);
    if (!res.ok) {
      showToast(res.error, 'error');
      return;
    }
    const state = res.data.state;
    const hid = state.humanHouseId ?? state.activeHouseId;
    const capital = Object.values(state.keeps).find((k) => k.ownerHouseId === hid);
    setGameState(state);
    setUi({
      ...INITIAL_UI_STATE,
      selectedTileKey: capital?.tileKey ?? null,
      showRecapModal: true,
      recapSinceTurn: Math.max(1, state.turnNumber - 1),
      lastPlayedIso: res.data.metadata.savedAtIso,
    });
    if (capital) {
      panToTile(capital.tileKey);
    }
    void persistAutosave(state);
    showToast(`Imported Turn ${state.turnNumber} chronicle.`);
  };

  const handleTileTap = (tileKey: CoordKey) => {
    if (!gameState) return;
    const isPlayerTurn =
      gameState.activeHouseId === viewerHouseId && gameState.phase === 'player_command';

    // 1. If in build preview mode and tapping a valid buildable tile -> build immediately
    if (isPlayerTurn && ui.buildModeImprovementId && buildPreviews.has(tileKey)) {
      const next = buildImprovement(gameState, viewerHouseId, tileKey, ui.buildModeImprovementId);
      dispatchPlayerTransition(next, 'build', { clearBuildMode: true });
      spawnMapPopup(tileKey, 'BUILT!', '#4ADE80');
      return;
    }

    // 2. If own unit is selected and tapping an attackable target -> open Combat Preview
    if (isPlayerTurn && selectedUnit && attackTargetByKey.has(tileKey)) {
      setUi((prev) => ({
        ...prev,
        attackPreviewTargetKey: tileKey,
        hudPopover: null,
      }));
      return;
    }

    // 3. If own unit is selected and tapping a reachable destination -> move unit
    if (isPlayerTurn && selectedUnit && reachableKeys.has(tileKey)) {
      const destTile = gameState.tiles[tileKey];
      const willExploreRuin =
        destTile?.landmark === 'relic_ruin' &&
        !destTile.landmarkCleared &&
        destTile.relicRuinId !== null
          ? RELIC_RUINS[destTile.relicRuinId]
          : null;
      const willClaimWatchtower =
        destTile?.landmark === 'ancient_watchtower' &&
        !destTile.revealedByHouseIds.includes(viewerHouseId);

      const next = moveUnit(gameState, selectedUnit.id, tileKey);
      dispatchPlayerTransition(next, 'move');
      setUi((prev) => ({
        ...prev,
        selectedTileKey: next.units[selectedUnit.id]?.tileKey ?? tileKey,
        keepInspectMode: 'unit',
        skippedUnitIds: prev.skippedUnitIds.filter((id) => id !== selectedUnit.id),
        discoveredRuin: willExploreRuin
          ? {
              title: willExploreRuin.title,
              vignette: willExploreRuin.vignette,
              rewardSummary: willExploreRuin.rewardSummary,
            }
          : prev.discoveredRuin,
      }));
      if (willExploreRuin) {
        spawnMapPopup(tileKey, 'RELIC!', '#38BDF8');
      } else if (willClaimWatchtower) {
        spawnMapPopup(tileKey, '7x7 REVEAL', '#FACC15');
        showToast('Ancient Watchtower scouted! 7x7 territory revealed.');
      }
      return;
    }

    // 4. Otherwise select tapped tile (and clear skip if player explicitly taps a unit)
    const tappedUnit = getUnitAt(gameState, tileKey);
    const tappedKeep = getKeepAt(gameState, tileKey);
    setUi((prev) => ({
      ...prev,
      selectedTileKey: tileKey,
      buildModeImprovementId: null,
      attackPreviewTargetKey: null,
      hudPopover: null,
      keepInspectMode:
        tappedUnit && tappedUnit.houseId === viewerHouseId
          ? 'unit'
          : tappedKeep && tappedKeep.ownerHouseId === viewerHouseId
            ? 'keep'
            : prev.keepInspectMode,
    }));
  };

  const handleConfirmAttack = (target: AttackTargetInfo) => {
    if (!gameState || !selectedUnit) return;
    const prevRank = getUnitRank(selectedUnit.xp ?? 0);
    let next: GameState = gameState;
    let actionType: PlayerActionType = 'attack';

    if (target.kind === 'unit' && target.unitId) {
      next = attackUnit(gameState, selectedUnit.id, target.unitId);
      actionType = 'attack';
    } else if (target.kind === 'keep' && target.keepId) {
      next = attackKeep(gameState, selectedUnit.id, target.keepId);
      actionType = 'attack_keep';
    } else if (target.kind === 'village') {
      next = attackVillage(gameState, selectedUnit.id, target.tileKey);
      actionType = 'attack_village';
    } else if (target.kind === 'camp') {
      next = attackOutlawCamp(gameState, selectedUnit.id, target.tileKey);
      actionType = 'attack_camp';
    } else if (target.kind === 'fortification') {
      next = razeFortification(gameState, selectedUnit.id, target.tileKey);
      actionType = 'raze';
    }

    if (target.preview) {
      spawnMapPopup(target.tileKey, `−${target.preview.attackerDamage} HP`, '#F87171');
    } else {
      spawnMapPopup(target.tileKey, 'SIEGE!', '#FB923C');
    }

    const survivingAttacker = next.units[selectedUnit.id];
    if (survivingAttacker) {
      const nextRank = getUnitRank(survivingAttacker.xp ?? 0);
      if (nextRank > prevRank) {
        const label = nextRank === 2 ? 'VETERAN ★' : 'SEASONED!';
        spawnMapPopup(survivingAttacker.tileKey, label, '#FACC15');
        showToast(`${label} Your unit earned battle promotion (+2 Max HP & combat mastery)!`);
      }
    }

    dispatchPlayerTransition(next, actionType);
    if (survivingAttacker) {
      setUi((prev) => ({ ...prev, selectedTileKey: survivingAttacker.tileKey }));
    }
  };

  const handleUndo = () => {
    if (ui.undoStack.length === 0) return;
    const prevState = ui.undoStack[ui.undoStack.length - 1]!;
    setGameState(prevState);
    setUi((prev) => ({
      ...prev,
      undoStack: prev.undoStack.slice(0, -1),
      attackPreviewTargetKey: null,
      buildModeImprovementId: null,
    }));
    void persistAutosave(prevState);
    showToast('Action reverted.');
  };

  const handleNextUnit = () => {
    if (!gameState || gameState.phase !== 'player_command') return;
    const nextIdle = getNextIdleUnit(
      gameState,
      viewerHouseId,
      selectedUnit?.id ?? null,
      ui.skippedUnitIds,
    );
    if (!nextIdle) {
      showToast('All troops have completed orders or are holding.');
      return;
    }
    setUi((prev) => ({
      ...prev,
      selectedTileKey: nextIdle.tileKey,
      keepInspectMode: 'unit',
      buildModeImprovementId: null,
      attackPreviewTargetKey: null,
    }));
    panToTile(nextIdle.tileKey);
  };

  const handleEndTurn = () => {
    if (!gameState || gameState.phase !== 'player_command') return;
    const next = endHouseTurn(gameState);
    setUi((prev) => ({
      ...prev,
      recapSinceTurn: gameState.turnNumber,
      skippedUnitIds: [],
    }));
    dispatchPlayerTransition(next, 'end_turn', {
      clearSelection: true,
      clearBuildMode: true,
      clearSkipped: true,
    });
  };

  const handleFortifyUnit = (unitId: string) => {
    if (!gameState) return;
    const u = gameState.units[unitId];
    if (!u) return;
    const next = fortifyUnit(gameState, unitId);
    dispatchPlayerTransition(next, 'fortify');
    spawnMapPopup(u.tileKey, 'FORTIFIED', '#34D399');
    showToast('Unit entrenched (+15% DEF, +2 extra heal if stationary).');
  };

  const handleHoldUnit = (unitId: string) => {
    if (!gameState) return;
    const nextSkipped = ui.skippedUnitIds.includes(unitId)
      ? ui.skippedUnitIds
      : [...ui.skippedUnitIds, unitId];
    const nextIdle = getNextIdleUnit(gameState, viewerHouseId, unitId, nextSkipped);
    setUi((prev) => ({
      ...prev,
      skippedUnitIds: nextSkipped,
      selectedTileKey: nextIdle ? nextIdle.tileKey : prev.selectedTileKey,
      keepInspectMode: 'unit',
    }));
    if (nextIdle) {
      panToTile(nextIdle.tileKey);
    }
    showToast('Unit holding position.');
  };

  const handleDisbandUnit = (unitId: string) => {
    if (!gameState) return;
    const u = gameState.units[unitId];
    if (!u) return;
    const next = disbandUnit(gameState, viewerHouseId, unitId);
    dispatchPlayerTransition(next, 'disband', { clearSelection: false });
    spawnMapPopup(u.tileKey, 'DISBANDED', '#F87171');
    showToast('Unit disbanded; Army Cap slot freed.');
  };

  const handleRepairKeep = (keepId: string) => {
    if (!gameState) return;
    const k = gameState.keeps[keepId];
    if (!k) return;
    const next = repairKeep(gameState, viewerHouseId, keepId);
    dispatchPlayerTransition(next, 'repair_keep');
    spawnMapPopup(k.tileKey, '+8 HP', '#4ADE80');
    showToast(`${k.name} fortifications repaired.`);
  };

  const handleDemolishImprovement = (tileKey: CoordKey) => {
    if (!gameState) return;
    const next = demolishImprovement(gameState, viewerHouseId, tileKey);
    dispatchPlayerTransition(next, 'demolish');
    spawnMapPopup(tileKey, 'CLEARED', '#F59E0B');
    showToast('Improvement cleared and Materials salvaged.');
  };

  // Render Title Screen when no campaign is active
  if (!gameState) {
    return (
      <div className="h-full w-full overflow-x-hidden bg-[#0B1120]">
        <TitleScreen
          autosave={autosave}
          onResumeAutosave={handleResumeAutosave}
          onStartNewCampaign={handleStartNewCampaign}
          onImportSaveJson={handleImportJson}
          onOpenPrimer={() => setUi((prev) => ({ ...prev, showPrimerModal: true }))}
        />
        {ui.showPrimerModal && (
          <PrimerModal
            onClose={() => setUi((prev) => ({ ...prev, showPrimerModal: false }))}
          />
        )}
        {ui.toastMessage && (
          <div className="fixed bottom-4 left-3 right-3 z-50 mx-auto max-w-md rounded-xl bg-slate-900 border border-amber-500/70 px-3 py-2 text-xs font-semibold text-amber-100 text-center shadow-xl">
            {ui.toastMessage}
          </div>
        )}
      </div>
    );
  }

  const isAiTurn = gameState.activeHouseId !== viewerHouseId;
  const activeAttackPreview = ui.attackPreviewTargetKey
    ? attackTargetByKey.get(ui.attackPreviewTargetKey) ?? null
    : null;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#0B1120]">
      <TopHud
        state={gameState}
        viewerHouseId={viewerHouseId}
        activePopover={ui.hudPopover}
        aiThinkingHouseId={ui.aiThinkingHouseId}
        onTogglePopover={(key) => setUi((prev) => ({ ...prev, hudPopover: key }))}
        onOpenRealm={() => setUi((prev) => ({ ...prev, showRealmDrawer: true, hudPopover: null }))}
        onOpenCrown={() => setUi((prev) => ({ ...prev, showCrownDrawer: true, hudPopover: null }))}
        onOpenMenu={() => {
          void refreshSaves();
          setUi((prev) => ({ ...prev, showMenuDrawer: true, hudPopover: null }));
        }}
      />

      <MapBoard
        state={gameState}
        viewerHouseId={viewerHouseId}
        selectedTileKey={ui.selectedTileKey}
        reachableKeys={reachableKeys}
        attackableKeys={attackableKeys}
        buildPreviews={buildPreviews}
        showYieldOverlay={ui.showYieldOverlay}
        floatingPopups={ui.floatingPopups}
        focusTileKey={focusTile.key}
        focusNonce={focusTile.nonce}
        onToggleYieldOverlay={() =>
          setUi((prev) => ({ ...prev, showYieldOverlay: !prev.showYieldOverlay }))
        }
        onTileTap={handleTileTap}
      />

      <BottomDrawer
        state={gameState}
        viewerHouseId={viewerHouseId}
        selectedTileKey={ui.selectedTileKey}
        buildModeImprovementId={ui.buildModeImprovementId}
        attackPreviewTarget={activeAttackPreview}
        skippedUnitIds={ui.skippedUnitIds}
        keepInspectMode={ui.keepInspectMode}
        undoCount={ui.undoStack.length}
        lastCommitReason={ui.lastCommitReason}
        isAiTurn={isAiTurn}
        onSetKeepInspectMode={(mode) => setUi((prev) => ({ ...prev, keepInspectMode: mode }))}
        onUndo={handleUndo}
        onOpenRecap={() => setUi((prev) => ({ ...prev, showRecapModal: true }))}
        onNextUnit={handleNextUnit}
        onEndTurn={handleEndTurn}
        onConfirmAttack={handleConfirmAttack}
        onCancelAttackPreview={() => setUi((prev) => ({ ...prev, attackPreviewTargetKey: null }))}
        onFortifyUnit={handleFortifyUnit}
        onHoldUnit={handleHoldUnit}
        onDisbandUnit={handleDisbandUnit}
        onPillage={(unitId) => {
          const u = gameState.units[unitId];
          dispatchPlayerTransition(pillageTile(gameState, unitId), 'pillage');
          if (u) spawnMapPopup(u.tileKey, 'PILLAGED!', '#FACC15');
        }}
        onRehome={(unitId) => {
          dispatchPlayerTransition(rehomeUnitManually(gameState, unitId), 'rehome');
          showToast('Unit re-homed to this Keep.');
        }}
        onRepairKeep={handleRepairKeep}
        onDemolishImprovement={handleDemolishImprovement}
        onAnnexVillage={(tileKey) => {
          dispatchPlayerTransition(annexVillage(gameState, viewerHouseId, tileKey), 'annex');
          spawnMapPopup(tileKey, 'ANNEXED +1F', '#4ADE80');
          showToast('Frontier Village annexed peacefully (+1 Favor).');
        }}
        onSelectBuildImprovement={(id: ImprovementId | null) =>
          setUi((prev) => ({ ...prev, buildModeImprovementId: id }))
        }
        onConfirmBuild={(tileKey, id) => {
          dispatchPlayerTransition(buildImprovement(gameState, viewerHouseId, tileKey, id), 'build', {
            clearBuildMode: true,
          });
          spawnMapPopup(tileKey, 'BUILT!', '#4ADE80');
        }}
        onTrainUnit={(keepId, unitId: UnitId) => {
          const k = gameState.keeps[keepId];
          dispatchPlayerTransition(trainUnit(gameState, viewerHouseId, keepId, unitId), 'train');
          if (k) spawnMapPopup(k.tileKey, 'MUSTERED', '#38BDF8');
        }}
      />

      {/* Phase-Driven Modals */}
      {gameState.phase === 'specialization_modal' && !isAiTurn && (
        <SpecializationModal
          state={gameState}
          viewerHouseId={viewerHouseId}
          onSelect={(keepId, spec: Exclude<KeepSpecialization, 'none'>) => {
            dispatchPlayerTransition(
              applyKeepSpecialization(gameState, viewerHouseId, keepId, spec),
              'specialize',
            );
          }}
        />
      )}

      {gameState.phase === 'draft_modal' && !isAiTurn && (
        <DraftModal
          state={gameState}
          viewerHouseId={viewerHouseId}
          onSelectDecree={(decreeId: DecreeId) => {
            dispatchPlayerTransition(selectDecree(gameState, viewerHouseId, decreeId), 'draft');
          }}
          onRoyalReroll={() => {
            dispatchPlayerTransition(performRoyalReroll(gameState, viewerHouseId), 'draft');
          }}
        />
      )}

      {gameState.phase === 'event_modal' && !isAiTurn && (
        <EventModal
          state={gameState}
          onChooseOption={(option) => {
            dispatchPlayerTransition(
              resolveEventChoice(gameState, viewerHouseId, option),
              'event_choice',
            );
          }}
        />
      )}

      {gameState.phase === 'game_over' && (
        <GameOverModal
          state={gameState}
          viewerHouseId={viewerHouseId}
          onReturnToTitle={() => {
            setGameState(null);
            setUi(INITIAL_UI_STATE);
            void refreshSaves();
          }}
        />
      )}

      {/* Relic Ruin Discovery Lore Card */}
      {ui.discoveredRuin && (
        <RelicDiscoveryModal
          ruin={ui.discoveredRuin}
          onClose={() => setUi((prev) => ({ ...prev, discoveredRuin: null }))}
        />
      )}

      {/* On-Demand Drawers & Modals */}
      {ui.showRealmDrawer && (
        <RealmLedgerDrawer
          state={gameState}
          viewerHouseId={viewerHouseId}
          onPanToTile={(tk) => {
            setUi((prev) => ({ ...prev, selectedTileKey: tk }));
            panToTile(tk);
          }}
          onClose={() => setUi((prev) => ({ ...prev, showRealmDrawer: false }))}
        />
      )}

      {ui.showCrownDrawer && (
        <CrownDrawer
          state={gameState}
          viewerHouseId={viewerHouseId}
          onClose={() => setUi((prev) => ({ ...prev, showCrownDrawer: false }))}
          onPayTithe={() => {
            dispatchPlayerTransition(payRegentsTithe(gameState, viewerHouseId), 'writ_tithe');
          }}
          onPetitionCharter={() => {
            setUi((prev) => ({ ...prev, showCrownDrawer: false }));
            dispatchPlayerTransition(performPetitionCharter(gameState, viewerHouseId), 'draft');
          }}
          onCrownGrant={(resource) => {
            dispatchPlayerTransition(
              performCrownGrant(gameState, viewerHouseId, resource),
              'crown_grant',
            );
            showToast(`Crown Grant received (+15 ${resource}).`);
          }}
        />
      )}

      {ui.showRecapModal && (
        <RecapModal
          state={gameState}
          viewerHouseId={viewerHouseId}
          sinceTurn={ui.recapSinceTurn}
          lastPlayedIso={ui.lastPlayedIso}
          onPanToTile={panToTile}
          onClose={() => setUi((prev) => ({ ...prev, showRecapModal: false }))}
        />
      )}

      {ui.showPrimerModal && (
        <PrimerModal
          onClose={() => setUi((prev) => ({ ...prev, showPrimerModal: false }))}
        />
      )}

      {ui.showMenuDrawer && (
        <MenuDrawer
          saveSlots={saveSlots}
          onClose={() => setUi((prev) => ({ ...prev, showMenuDrawer: false }))}
          onSaveSlot={(slotId) => {
            void saveGameToSlot(slotId, gameState).then((res) => {
              if (res.ok) {
                showToast(`Saved to ${slotId}.`);
                void refreshSaves();
              } else {
                showToast(`Save failed: ${res.error}`, 'error');
              }
            });
          }}
          onLoadSlot={(slotId) => {
            void loadGameFromSlot(slotId).then((res) => {
              if (res.ok && res.data) {
                setGameState(res.data.state);
                setUi({ ...INITIAL_UI_STATE, lastPlayedIso: res.data.metadata.savedAtIso });
                showToast(`Loaded ${slotId} (Turn ${res.data.state.turnNumber}).`);
              } else {
                showToast(res.ok ? 'Empty slot.' : res.error, 'error');
              }
            });
          }}
          onExportJson={() => {
            const json = exportSaveJson(gameState);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `marchlands-turn-${gameState.turnNumber}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Save JSON exported.');
          }}
          onImportJson={(txt) => {
            setUi((prev) => ({ ...prev, showMenuDrawer: false }));
            handleImportJson(txt);
          }}
          onOpenPrimer={() =>
            setUi((prev) => ({ ...prev, showMenuDrawer: false, showPrimerModal: true }))
          }
          onReturnToTitle={() => {
            setGameState(null);
            setUi(INITIAL_UI_STATE);
            void refreshSaves();
          }}
        />
      )}

      {/* Non-Blocking Toast Banner */}
      {ui.toastMessage && (
        <div
          className={`fixed top-16 left-3 right-3 z-50 mx-auto max-w-md rounded-xl px-3 py-2 text-xs font-semibold text-center shadow-xl border ${
            ui.toastTone === 'error'
              ? 'bg-red-950/95 border-red-500 text-red-100'
              : ui.toastTone === 'warn'
                ? 'bg-amber-950/95 border-amber-500 text-amber-100'
                : 'bg-slate-900/95 border-amber-500/40 text-slate-100'
          }`}
        >
          {ui.toastMessage}
        </div>
      )}
    </div>
  );
}
