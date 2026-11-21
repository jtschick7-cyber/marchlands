/**
 * Marchlands (Spec v2.0) — Root Mobile PWA Shell
 *
 * Orchestrates:
 * - Title / New Campaign Setup (34x34 / 28x28 / 22x22, 48/72/108 Chronicle) & Resume Autosave
 * - Two-tap Cartographic MapBoard + 4-Resource TopHud + BottomDrawer + Modals & Realm Ledger
 * - Separate Next Unit cycler & always-accessible End Turn control
 * - Class Tactical Actions (Overwatch, Trebuchet Deploy, Shield Push, Lance Charge),
 *   Field Reinforce, Frontier Outposts, Roads, Clear Timber, Level-2 Upgrades, Tier-3 Grand Citadels,
 *   Arrow Slits Volley, Lord-Commander Marshal Skills/Traits, Branching Battle Honors & Exclusive Doctrine Pairs
 * - Ephemeral 20-snapshot Undo stack with Ruling 6.4 commit-point clearing
 * - Atomic IndexedDB autosave after every player action, modal, undo, and AI turn
 * - Web Worker AI turn loop with 8,000ms watchdog
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BattleHonorId,
  ChronicleLength,
  CitadelCharter,
  CommanderTraitId,
  CoordKey,
  DecreeId,
  Difficulty,
  GameMode,
  GameState,
  HouseId,
  ImprovementId,
  KeepSpecialization,
  MapPreset,
  SaveMetadata,
  UnitId,
} from './types/game.ts';
import {
  AUDIENCE_GRANT_AMOUNT,
  AUDIENCE_IRON_AMOUNT,
  HOUSES,
  HOUSE_IDS,
  RELIC_RUINS,
  UNDO_STACK_MAX,
} from './data/index.ts';
import { rehomeUnitManually } from './engine/capture.ts';
import {
  activateCommanderSkill,
  activateOverwatch,
  attackHighSeat,
  attackKeep,
  attackOutlawCamp,
  attackOutpost,
  attackUnit,
  attackVillage,
  canUseCommanderSkill,
  deployTrebuchet,
  fireKeepGarrisonVolley,
  getUnitRank,
  pillageTile,
  razeFortification,
} from './engine/combat.ts';
import { coordKey, getTilesInRadius } from './engine/coords.ts';
import {
  payRegentsTithe,
  performCrownGrant,
  performPetitionCharter,
  performRoyalReroll,
} from './engine/crown.ts';
import {
  applyBattleHonor,
  applyCitadelCharter,
  applyCommanderTrait,
  applyKeepSpecialization,
  openNextPendingModal,
  selectDecree,
} from './engine/draftAndSpec.ts';
import {
  annexVillage,
  buildImprovement,
  buildOutpost,
  buildRoad,
  canBuildOutpost,
  clearTimber,
  demolishImprovement,
  disbandUnit,
  fortifyUnit,
  rallyCommanderEarly,
  reinforceUnit,
  repairKeep,
  trainUnit,
  upgradeImprovement,
  upgradeKeepToTier3,
} from './engine/economy.ts';
import { resolveEventChoice } from './engine/events.ts';
import { getReachableTiles, moveUnit } from './engine/movement.ts';
import {
  getCommitPointReason,
  getKeepVolleyTargets,
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
  BattleHonorModal,
  CitadelCharterModal,
  CommanderTraitModal,
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

  // Core player action dispatcher: applies undo commit-point rules, opens queued modals + atomic autosave
  const dispatchPlayerTransition = useCallback(
    (
      rawNextState: GameState,
      actionType: PlayerActionType,
      opts?: { clearSelection?: boolean; clearBuildMode?: boolean; clearSkipped?: boolean },
    ) => {
      if (!gameState || rawNextState === gameState) return;
      const nextState =
        rawNextState.activeHouseId === viewerHouseId && rawNextState.phase === 'player_command'
          ? openNextPendingModal(rawNextState, viewerHouseId)
          : rawNextState;

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
        outpostModeUnitId: null,
        volleyModeKeepId: null,
        beaconMarkMode: false,
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
      outpostModeUnitId: null,
      volleyModeKeepId: null,
      beaconMarkMode: false,
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
      selectedUnit.isOverwatch ||
      selectedUnit.remainingMovement <= 0 ||
      (selectedUnit.hasAttacked && selectedUnit.typeId !== 'dusk_outrider') ||
      gameState.activeHouseId !== viewerHouseId ||
      gameState.phase !== 'player_command' ||
      ui.outpostModeUnitId !== null ||
      ui.volleyModeKeepId !== null ||
      ui.beaconMarkMode
    ) {
      return new Set();
    }
    return new Set(Object.keys(getReachableTiles(gameState, selectedUnit.id)));
  }, [
    gameState,
    selectedUnit,
    viewerHouseId,
    ui.outpostModeUnitId,
    ui.volleyModeKeepId,
    ui.beaconMarkMode,
  ]);

  const attackTargets = useMemo<readonly AttackTargetInfo[]>(() => {
    if (
      !gameState ||
      !selectedUnit ||
      selectedUnit.hasAttacked ||
      selectedUnit.isFortified ||
      selectedUnit.isOverwatch ||
      gameState.activeHouseId !== viewerHouseId ||
      gameState.phase !== 'player_command' ||
      ui.outpostModeUnitId !== null ||
      ui.volleyModeKeepId !== null ||
      ui.beaconMarkMode
    ) {
      return [];
    }
    return getUnitAttackTargets(gameState, selectedUnit.id);
  }, [
    gameState,
    selectedUnit,
    viewerHouseId,
    ui.outpostModeUnitId,
    ui.volleyModeKeepId,
    ui.beaconMarkMode,
  ]);

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

  // Special Target Keys (Frontier Outpost placement, Tier-3 Arrow Slits Volley, or Solis Beacon Mark)
  const specialTargets = useMemo<{
    keys: ReadonlySet<CoordKey>;
    kind: 'outpost' | 'volley' | 'beacon' | null;
  }>(() => {
    if (!gameState || gameState.activeHouseId !== viewerHouseId || gameState.phase !== 'player_command') {
      return { keys: new Set(), kind: null };
    }

    if (ui.outpostModeUnitId) {
      const unit = gameState.units[ui.outpostModeUnitId];
      if (!unit) return { keys: new Set(), kind: null };
      const s = new Set<CoordKey>();
      for (const c of getTilesInRadius(unit.x, unit.y, 1, gameState.gridSize)) {
        const k = coordKey(c.x, c.y);
        if (canBuildOutpost(gameState, unit.id, k)) {
          s.add(k);
        }
      }
      return { keys: s, kind: 'outpost' };
    }

    if (ui.volleyModeKeepId) {
      const targets = getKeepVolleyTargets(gameState, ui.volleyModeKeepId);
      return { keys: new Set(targets.map((u) => u.tileKey)), kind: 'volley' };
    }

    if (ui.beaconMarkMode && selectedUnit?.isCommander) {
      const s = new Set<CoordKey>();
      for (const c of getTilesInRadius(selectedUnit.x, selectedUnit.y, 3, gameState.gridSize)) {
        const u = getUnitAt(gameState, coordKey(c.x, c.y));
        if (u && canUseCommanderSkill(gameState, viewerHouseId, u.id)) {
          s.add(u.tileKey);
        }
      }
      return { keys: s, kind: 'beacon' };
    }

    return { keys: new Set(), kind: null };
  }, [
    gameState,
    viewerHouseId,
    ui.outpostModeUnitId,
    ui.volleyModeKeepId,
    ui.beaconMarkMode,
    selectedUnit,
  ]);

  const buildPreviews = useMemo<ReadonlyMap<CoordKey, BuildPreviewInfo>>(() => {
    const m = new Map<CoordKey, BuildPreviewInfo>();
    if (!gameState || !ui.buildModeImprovementId) return m;
    for (const tile of Object.values(gameState.tiles)) {
      if (tile.improvement === null) {
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
    mapPreset: MapPreset;
    chronicleLimit: ChronicleLength;
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
      mapPreset: opts.mapPreset,
      chronicleLimit: opts.chronicleLimit,
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
    showToast(`Chronicle Saved • Turn ${initial.turnNumber} (${initial.gridSize}×${initial.gridSize})`);
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

    // 0. If in Special Target Mode (Outpost Founding, Arrow Slits Volley, or Solis Beacon Mark)
    if (isPlayerTurn && specialTargets.keys.has(tileKey)) {
      if (specialTargets.kind === 'outpost' && ui.outpostModeUnitId) {
        const next = buildOutpost(gameState, ui.outpostModeUnitId, tileKey);
        dispatchPlayerTransition(next, 'build_outpost');
        spawnMapPopup(tileKey, 'OUTPOST!', '#34D399');
        showToast('Frontier Outpost founded! 3×3 territory claimed.');
        return;
      }
      if (specialTargets.kind === 'volley' && ui.volleyModeKeepId) {
        const targetUnit = getUnitAt(gameState, tileKey);
        if (targetUnit) {
          const next = fireKeepGarrisonVolley(gameState, ui.volleyModeKeepId, targetUnit.id);
          dispatchPlayerTransition(next, 'garrison_volley');
          spawnMapPopup(tileKey, '−6 VOLLEY!', '#F59E0B');
          showToast('Grand Citadel Arrow Slits Volley fired!');
          return;
        }
      }
      if (specialTargets.kind === 'beacon' && ui.beaconMarkMode) {
        const targetUnit = getUnitAt(gameState, tileKey);
        if (targetUnit) {
          const next = activateCommanderSkill(gameState, viewerHouseId, targetUnit.id);
          dispatchPlayerTransition(next, 'commander_skill');
          spawnMapPopup(tileKey, 'MARKED!', '#FACC15');
          showToast(`${HOUSES[viewerHouseId].commanderSkillName} applied to enemy target!`);
          return;
        }
      }
    }

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

    // 4. Otherwise select tapped tile (and clear special modes)
    const tappedUnit = getUnitAt(gameState, tileKey);
    const tappedKeep = getKeepAt(gameState, tileKey);
    setUi((prev) => ({
      ...prev,
      selectedTileKey: tileKey,
      buildModeImprovementId: null,
      outpostModeUnitId: null,
      volleyModeKeepId: null,
      beaconMarkMode: false,
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
    } else if (target.kind === 'high_seat') {
      next = attackHighSeat(gameState, selectedUnit.id, target.tileKey);
      actionType = 'attack_high_seat';
    } else if (target.kind === 'outpost' && target.outpostId) {
      next = attackOutpost(gameState, selectedUnit.id, target.outpostId);
      actionType = 'attack_outpost';
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
      if (target.preview.shieldPushTriggered) {
        spawnMapPopup(target.tileKey, 'PUSHED!', '#818CF8');
      } else if (target.preview.chargeTriggered) {
        spawnMapPopup(target.tileKey, `CHARGE −${target.preview.attackerDamage}`, '#FACC15');
      } else {
        spawnMapPopup(target.tileKey, `−${target.preview.attackerDamage} HP`, '#F87171');
      }
    } else {
      spawnMapPopup(target.tileKey, 'SIEGE!', '#FB923C');
    }

    const survivingAttacker = next.units[selectedUnit.id];
    if (survivingAttacker && !survivingAttacker.isCommander) {
      const nextRank = getUnitRank(survivingAttacker.xp ?? 0);
      if (nextRank > prevRank) {
        const label = nextRank === 2 ? 'VETERAN ★' : 'SEASONED!';
        spawnMapPopup(survivingAttacker.tileKey, label, '#FACC15');
        showToast(`${label} Your unit earned battle promotion & a Battle Honor!`);
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
      outpostModeUnitId: null,
      volleyModeKeepId: null,
      beaconMarkMode: false,
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
      outpostModeUnitId: null,
      volleyModeKeepId: null,
      beaconMarkMode: false,
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

  const handleActivateOverwatch = (unitId: string) => {
    if (!gameState) return;
    const u = gameState.units[unitId];
    if (!u) return;
    const next = activateOverwatch(gameState, unitId);
    dispatchPlayerTransition(next, 'overwatch');
    spawnMapPopup(u.tileKey, 'OVERWATCH', '#38BDF8');
    showToast('Ranged Overwatch set (85% reaction volley on first enemy entering range).');
  };

  const handleDeployTrebuchet = (unitId: string) => {
    if (!gameState) return;
    const u = gameState.units[unitId];
    if (!u) return;
    const next = deployTrebuchet(gameState, unitId);
    dispatchPlayerTransition(next, 'deploy');
    spawnMapPopup(u.tileKey, 'DEPLOYED!', '#F59E0B');
    showToast('Trebuchet deployed! Ready to bombard targets up to 3 tiles away.');
  };

  const handleReinforceUnit = (unitId: string) => {
    if (!gameState) return;
    const u = gameState.units[unitId];
    if (!u) return;
    const next = reinforceUnit(gameState, unitId);
    dispatchPlayerTransition(next, 'reinforce');
    spawnMapPopup(u.tileKey, '+8 HP!', '#2DD4BF');
    showToast('Field Reinforce complete.');
  };

  const handleUseCommanderSkill = (unitId: string) => {
    if (!gameState) return;
    const u = gameState.units[unitId];
    if (!u || !u.isCommander) return;
    if (viewerHouseId === 'solis') {
      setUi((prev) => ({
        ...prev,
        beaconMarkMode: !prev.beaconMarkMode,
        outpostModeUnitId: null,
        volleyModeKeepId: null,
      }));
      return;
    }
    const next = activateCommanderSkill(gameState, viewerHouseId);
    dispatchPlayerTransition(next, 'commander_skill');
    spawnMapPopup(u.tileKey, HOUSES[viewerHouseId].commanderSkillName.toUpperCase(), '#FACC15');
    showToast(`${HOUSES[viewerHouseId].commanderSkillName} activated!`);
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

  const handleUpgradeKeepTier3 = (keepId: string) => {
    if (!gameState) return;
    const k = gameState.keeps[keepId];
    if (!k) return;
    const next = upgradeKeepToTier3(gameState, viewerHouseId, keepId);
    dispatchPlayerTransition(next, 'upgrade_keep_t3');
    spawnMapPopup(k.tileKey, 'TIER-3 CITADEL!', '#FACC15');
    showToast(`${k.name} upgraded to a 7×7 Tier-3 Grand Citadel!`);
  };

  const handleRallyCommander = () => {
    if (!gameState) return;
    const next = rallyCommanderEarly(gameState, viewerHouseId);
    dispatchPlayerTransition(next, 'rally_commander');
    showToast(`${HOUSES[viewerHouseId].commanderName} has rallied back to the Capital!`);
  };

  const handleUpgradeImprovement = (tileKey: CoordKey) => {
    if (!gameState) return;
    const next = upgradeImprovement(gameState, viewerHouseId, tileKey);
    dispatchPlayerTransition(next, 'upgrade_improvement');
    spawnMapPopup(tileKey, 'LEVEL 2!', '#FACC15');
    showToast('Improvement upgraded to Level 2.');
  };

  const handleBuildRoad = (tileKey: CoordKey) => {
    if (!gameState) return;
    const next = buildRoad(gameState, viewerHouseId, tileKey);
    dispatchPlayerTransition(next, 'build_road');
    spawnMapPopup(tileKey, 'ROAD', '#D6D3D1');
    showToast('Frontier Road laid (1 MP & +1 Road Travel bonus).');
  };

  const handleClearTimber = (tileKey: CoordKey) => {
    if (!gameState) return;
    const next = clearTimber(gameState, viewerHouseId, tileKey);
    dispatchPlayerTransition(next, 'clear_timber');
    spawnMapPopup(tileKey, '+6 MAT', '#4ADE80');
    showToast('Timber cleared to open Plains (+6 Materials).');
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
      <div className="h-full w-full overflow-x-hidden bg-[#13151A]">
        <div className="ios-status-bar-shield" aria-hidden="true" />
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
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#13151A]">
      <div className="ios-status-bar-shield" aria-hidden="true" />
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
        specialTargetKeys={specialTargets.keys}
        specialTargetKind={specialTargets.kind}
        buildPreviews={buildPreviews}
        showYieldOverlay={ui.showYieldOverlay}
        showZoomButtons={ui.showZoomButtons}
        showMinimap={ui.showMinimap}
        floatingPopups={ui.floatingPopups}
        focusTileKey={focusTile.key}
        focusNonce={focusTile.nonce}
        onToggleYieldOverlay={() =>
          setUi((prev) => ({ ...prev, showYieldOverlay: !prev.showYieldOverlay }))
        }
        onToggleMinimap={() =>
          setUi((prev) => ({ ...prev, showMinimap: !prev.showMinimap }))
        }
        onTileTap={handleTileTap}
      />

      <BottomDrawer
        state={gameState}
        viewerHouseId={viewerHouseId}
        selectedTileKey={ui.selectedTileKey}
        buildModeImprovementId={ui.buildModeImprovementId}
        outpostModeUnitId={ui.outpostModeUnitId}
        volleyModeKeepId={ui.volleyModeKeepId}
        beaconMarkMode={ui.beaconMarkMode}
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
        onActivateOverwatch={handleActivateOverwatch}
        onDeployTrebuchet={handleDeployTrebuchet}
        onReinforceUnit={handleReinforceUnit}
        onToggleOutpostMode={(unitId) =>
          setUi((prev) => ({
            ...prev,
            outpostModeUnitId: unitId,
            volleyModeKeepId: null,
            beaconMarkMode: false,
          }))
        }
        onUseCommanderSkill={handleUseCommanderSkill}
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
        onUpgradeKeepTier3={handleUpgradeKeepTier3}
        onToggleKeepVolleyMode={(keepId) =>
          setUi((prev) => ({
            ...prev,
            volleyModeKeepId: keepId,
            outpostModeUnitId: null,
            beaconMarkMode: false,
          }))
        }
        onRallyCommander={handleRallyCommander}
        onUpgradeImprovement={handleUpgradeImprovement}
        onBuildRoad={handleBuildRoad}
        onClearTimber={handleClearTimber}
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

      {gameState.phase === 'citadel_modal' && !isAiTurn && (
        <CitadelCharterModal
          state={gameState}
          viewerHouseId={viewerHouseId}
          onSelect={(keepId, charter: Exclude<CitadelCharter, 'none'>) => {
            dispatchPlayerTransition(
              applyCitadelCharter(gameState, viewerHouseId, keepId, charter),
              'citadel',
            );
          }}
        />
      )}

      {gameState.phase === 'commander_trait_modal' && !isAiTurn && (
        <CommanderTraitModal
          state={gameState}
          viewerHouseId={viewerHouseId}
          onSelect={(traitId: CommanderTraitId) => {
            dispatchPlayerTransition(
              applyCommanderTrait(gameState, viewerHouseId, traitId),
              'commander_trait',
            );
          }}
        />
      )}

      {gameState.phase === 'honor_modal' && !isAiTurn && (
        <BattleHonorModal
          state={gameState}
          viewerHouseId={viewerHouseId}
          onSelect={(unitId, honorId: BattleHonorId) => {
            dispatchPlayerTransition(
              applyBattleHonor(gameState, viewerHouseId, unitId, honorId),
              'honor',
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
            const amt = resource === 'iron' ? AUDIENCE_IRON_AMOUNT : AUDIENCE_GRANT_AMOUNT;
            showToast(`Crown Grant received (+${amt} ${resource}).`);
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
          showZoomButtons={ui.showZoomButtons}
          onToggleZoomButtons={() =>
            setUi((prev) => ({ ...prev, showZoomButtons: !prev.showZoomButtons }))
          }
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
          style={{ top: 'calc(var(--safe-top-offset, 8px) + 3.75rem)' }}
          className={`fixed left-3 right-3 z-50 mx-auto max-w-md rounded-xl px-3 py-2 text-xs font-semibold text-center shadow-xl border ${
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
