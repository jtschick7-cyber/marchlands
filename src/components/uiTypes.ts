/**
 * Ephemeral UI Interaction State — lives strictly in React memory,
 * NEVER persisted to GameState or IndexedDB.
 */

import type { CoordKey, GameState, HouseId, ImprovementId } from '../types/game.ts';

export interface MapFloatingPopup {
  readonly id: number;
  readonly tileKey: CoordKey;
  readonly text: string;
  readonly color: string;
}

export interface DiscoveredRuinBanner {
  readonly title: string;
  readonly vignette: string;
  readonly rewardSummary: string;
}

export interface UiInteractionState {
  readonly selectedTileKey: CoordKey | null;
  readonly buildModeImprovementId: ImprovementId | null;
  readonly attackPreviewTargetKey: CoordKey | null;
  readonly skippedUnitIds: readonly string[];
  readonly keepInspectMode: 'unit' | 'keep';
  readonly showYieldOverlay: boolean;
  readonly showZoomButtons: boolean;
  readonly showRecapModal: boolean;
  readonly showCrownDrawer: boolean;
  readonly showRealmDrawer: boolean;
  readonly showPrimerModal: boolean;
  readonly showMenuDrawer: boolean;
  readonly discoveredRuin: DiscoveredRuinBanner | null;
  readonly hudPopover: 'food' | 'materials' | 'coin' | 'favor' | 'keeps' | 'season' | 'score' | 'turn' | null;
  readonly toastMessage: string | null;
  readonly toastTone: 'info' | 'warn' | 'error';
  readonly undoStack: readonly GameState[];
  readonly lastCommitReason: string | null;
  readonly aiThinkingHouseId: HouseId | null;
  readonly recapSinceTurn: number;
  readonly lastPlayedIso: string | null;
  readonly floatingPopups: readonly MapFloatingPopup[];
}

export const INITIAL_UI_STATE: UiInteractionState = {
  selectedTileKey: null,
  buildModeImprovementId: null,
  attackPreviewTargetKey: null,
  skippedUnitIds: [],
  keepInspectMode: 'unit',
  showYieldOverlay: true,
  showZoomButtons: false,
  showRecapModal: false,
  showCrownDrawer: false,
  showRealmDrawer: false,
  showPrimerModal: false,
  showMenuDrawer: false,
  discoveredRuin: null,
  hudPopover: null,
  toastMessage: null,
  toastTone: 'info',
  undoStack: [],
  lastCommitReason: null,
  aiThinkingHouseId: null,
  recapSinceTurn: 1,
  lastPlayedIso: null,
  floatingPopups: [],
};

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'just now';
  const diffMs = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
