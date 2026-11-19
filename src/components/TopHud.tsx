/**
 * Marchlands (Spec v0.3) — Mobile Top HUD
 *
 * Padded with env(safe-area-inset-top), tabular-nums resource counters,
 * tap-to-inspect microcopy popovers (docs/UX_MICROCOPY.md §1),
 * and active Regent's Mandate claimant banner.
 */

import type { GameState, HouseId } from '../types/game.ts';
import {
  CHRONICLE_TURN_LIMIT,
  HOUSES,
  MANDATE_HOLD_TURNS,
  SEASONS,
  TURNS_PER_SEASON,
} from '../data/index.ts';
import { computeHouseNetIncome, getSupremacyStats } from '../engine/queries.ts';
import { computeScore } from '../engine/scoring.ts';
import { getSeason, getYear } from '../engine/stateHelpers.ts';
import { HouseSigilSvg, SeasonIconSvg } from './svg/HeraldrySvg.tsx';
import type { UiInteractionState } from './uiTypes.ts';

interface TopHudProps {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly activePopover: UiInteractionState['hudPopover'];
  readonly aiThinkingHouseId: HouseId | null;
  readonly onTogglePopover: (key: UiInteractionState['hudPopover']) => void;
  readonly onOpenCrown: () => void;
  readonly onOpenMenu: () => void;
}

export function TopHud({
  state,
  viewerHouseId,
  activePopover,
  aiThinkingHouseId,
  onTogglePopover,
  onOpenCrown,
  onOpenMenu,
}: TopHudProps) {
  const house = state.houses[viewerHouseId]!;
  const income = computeHouseNetIncome(state, viewerHouseId);
  const supremacy = getSupremacyStats(state, viewerHouseId);
  const score = computeScore(state, viewerHouseId, false).total;
  const season = getSeason(state.turnNumber);
  const seasonDef = SEASONS[season];
  const year = getYear(state.turnNumber);
  const turnsLeftInSeason = TURNS_PER_SEASON - ((state.turnNumber - 1) % TURNS_PER_SEASON);

  const claimantId = state.crown.claimantHouseId;
  const claimantTurnsRem =
    claimantId && state.crown.claimStartTurn !== null
      ? Math.max(1, MANDATE_HOLD_TURNS - (state.turnNumber - state.crown.claimStartTurn))
      : null;

  const popoverText: Record<NonNullable<UiInteractionState['hudPopover']>, string> = {
    food: 'Food: Total Food income per turn across all Keeps. Each Keep fills its own growth bar (3x3 -> 5x5) and funds peaceful village annexations.',
    materials: 'Materials: Spent on tile improvements, defensive palisades, and training military units.',
    coin: 'Coin: Pays elite unit upkeep each turn and counts toward lifetime Coin milestones for Royal Decree drafts.',
    favor: "Royal Favor: Earned by completing Crown Writs and events. Spend in Crown Audience or hold 30+ with 4+ Keeps to claim the Regent's Mandate.",
    keeps: 'Dominion / Chronicle: Hold >= 65% of owned Keeps (min 5) or eliminate all rivals in Dominion; score highest by Turn 33 in Chronicle.',
    season: `Year ${year} • ${seasonDef.name} (${seasonDef.subtitle}). ${turnsLeftInSeason}t until next season & Frontier Event.`,
    score: 'Realm Score: Live Chronicle score across Territory, Keeps, Decrees, Military, Exploration, Landmarks, and Crown Favor.',
    turn:
      state.mode === 'chronicle'
        ? `Chronicle Mode: Ends after Turn ${CHRONICLE_TURN_LIMIT}. Auto-saved after every move.`
        : 'Campaign Chronicle: Auto-saved after every move. Safe to close or switch apps anytime.',
  };

  return (
    <header className="relative z-30 w-full bg-[#1E293B]/95 border-b border-[#334155] backdrop-blur-md safe-top px-2 pb-1.5">
      {/* Row 1: House Sigil, Turn/Season, Keeps, Score, Crown & Menu buttons */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <HouseSigilSvg houseId={viewerHouseId} size={24} />
          <button
            type="button"
            onClick={() => onTogglePopover(activePopover === 'turn' ? null : 'turn')}
            className="touch-target px-1.5 flex flex-col justify-center text-left rounded-md active:bg-slate-700"
          >
            <span className="text-xs font-bold text-slate-100 tabular-nums leading-tight">
              Turn {state.turnNumber}
              {state.mode === 'chronicle' ? `/${CHRONICLE_TURN_LIMIT}` : ''}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-slate-300 leading-tight">
              <SeasonIconSvg season={season} size={12} />
              <span>
                {seasonDef.name} ({turnsLeftInSeason}t)
              </span>
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onTogglePopover(activePopover === 'keeps' ? null : 'keeps')}
            className="touch-target px-2 rounded-lg bg-slate-800/90 border border-slate-700 text-xs font-semibold text-slate-100 tabular-nums active:bg-slate-700"
            aria-label="Keeps held"
          >
            {supremacy.ownedKeeps}/{supremacy.totalKeeps} K
          </button>
          <button
            type="button"
            onClick={onOpenCrown}
            className="touch-target px-2.5 rounded-lg bg-amber-900/50 border border-amber-600/60 text-xs font-semibold text-amber-200 tabular-nums active:bg-amber-800/60"
            aria-label="Open Crown & Writs"
          >
            Crown
          </button>
          <button
            type="button"
            onClick={onOpenMenu}
            className="touch-target px-2.5 rounded-lg bg-slate-800 border border-slate-600 text-xs font-semibold text-slate-100 active:bg-slate-700"
            aria-label="Open Menu"
          >
            Menu
          </button>
        </div>
      </div>

      {/* Row 2: Resource Pills (Food, Materials, Coin, Favor, Score) */}
      <div className="mt-1 grid grid-cols-5 gap-1.5">
        <button
          type="button"
          onClick={() => onTogglePopover(activePopover === 'food' ? null : 'food')}
          className="min-h-[44px] px-1 rounded-lg bg-slate-900/75 border border-slate-700/80 flex flex-col items-center justify-center tabular-nums active:bg-slate-800"
        >
          <span className="text-[10px] font-semibold uppercase text-[#16A34A]">Food</span>
          <span className="text-xs font-bold text-slate-100">+{income.food}</span>
        </button>

        <button
          type="button"
          onClick={() => onTogglePopover(activePopover === 'materials' ? null : 'materials')}
          className="min-h-[44px] px-1 rounded-lg bg-slate-900/75 border border-slate-700/80 flex flex-col items-center justify-center tabular-nums active:bg-slate-800"
        >
          <span className="text-[10px] font-semibold uppercase text-[#D97706]">Mat</span>
          <span className="text-xs font-bold text-slate-100">
            {house.resources.materials}{' '}
            <span className="text-[10px] text-amber-300">(+{income.materials})</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTogglePopover(activePopover === 'coin' ? null : 'coin')}
          className="min-h-[44px] px-1 rounded-lg bg-slate-900/75 border border-slate-700/80 flex flex-col items-center justify-center tabular-nums active:bg-slate-800"
        >
          <span className="text-[10px] font-semibold uppercase text-[#EAB308]">Coin</span>
          <span className="text-xs font-bold text-slate-100">
            {house.resources.coin}{' '}
            <span className="text-[10px] text-yellow-300">
              ({income.netCoin >= 0 ? `+${income.netCoin}` : income.netCoin})
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTogglePopover(activePopover === 'favor' ? null : 'favor')}
          className="min-h-[44px] px-1 rounded-lg bg-slate-900/75 border border-slate-700/80 flex flex-col items-center justify-center tabular-nums active:bg-slate-800"
        >
          <span className="text-[10px] font-semibold uppercase text-purple-300">Favor</span>
          <span className="text-xs font-bold text-slate-100">{house.favor}</span>
        </button>

        <button
          type="button"
          onClick={() => onTogglePopover(activePopover === 'score' ? null : 'score')}
          className="min-h-[44px] px-1 rounded-lg bg-slate-900/75 border border-slate-700/80 flex flex-col items-center justify-center tabular-nums active:bg-slate-800"
        >
          <span className="text-[10px] font-semibold uppercase text-sky-300">Score</span>
          <span className="text-xs font-bold text-slate-100">{score}</span>
        </button>
      </div>

      {/* Mandate Claimant Banner */}
      {claimantId && claimantTurnsRem !== null && (
        <div className="mt-1.5 px-2.5 py-1 rounded-md bg-amber-950/90 border border-amber-500/70 text-[11px] font-semibold text-amber-200 text-center">
          MANDATE CLAIMED — {HOUSES[claimantId].name} holds the Regent&apos;s Mandate (
          {claimantTurnsRem}t to victory)
        </div>
      )}

      {/* AI Turn Indicator */}
      {aiThinkingHouseId && (
        <div className="mt-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-sky-500/60 text-xs font-semibold text-sky-200 flex items-center justify-center gap-2">
          <HouseSigilSvg houseId={aiThinkingHouseId} size={16} />
          <span>{HOUSES[aiThinkingHouseId].name} is deliberating…</span>
        </div>
      )}

      {/* Tap-to-Inspect Popover */}
      {activePopover && (
        <div className="mt-1.5 p-2.5 rounded-lg bg-[#0F172A] border border-slate-600 text-xs text-slate-200 flex items-start justify-between gap-2 shadow-lg">
          <p className="leading-snug">{popoverText[activePopover]}</p>
          <button
            type="button"
            onClick={() => onTogglePopover(null)}
            className="touch-target shrink-0 px-2 rounded bg-slate-800 text-slate-300 text-xs font-bold"
            aria-label="Close tooltip"
          >
            ✕
          </button>
        </div>
      )}
    </header>
  );
}
