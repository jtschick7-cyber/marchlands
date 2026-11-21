/**
 * Marchlands (Spec v2.0) — Mobile Top HUD (4-Resource + Favor + Keeps/Score)
 *
 * Padded with env(safe-area-inset-top), crisp inline SVG resource icons (Food, Mat, Iron, Coin),
 * tabular-nums counters, Realm Ledger & Crown Council access,
 * active Frontier Event & Mandate banners, and tap-to-inspect popovers.
 */

import type { GameState, HouseId } from '../types/game.ts';
import {
  FRONTIER_EVENTS,
  HOUSES,
  KEEP_TIER3_IRON_COST,
  SEASONS,
  TURNS_PER_SEASON,
} from '../data/index.ts';
import { computeHouseNetIncome, getSupremacyStats } from '../engine/queries.ts';
import { computeScore } from '../engine/scoring.ts';
import { getMapPresetConfig, getSeason, getYear } from '../engine/stateHelpers.ts';
import { HouseSigilSvg, ResourceIconSvg, SeasonIconSvg } from './svg/HeraldrySvg.tsx';
import type { UiInteractionState } from './uiTypes.ts';

interface TopHudProps {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly activePopover: UiInteractionState['hudPopover'];
  readonly aiThinkingHouseId: HouseId | null;
  readonly onTogglePopover: (key: UiInteractionState['hudPopover']) => void;
  readonly onOpenRealm: () => void;
  readonly onOpenCrown: () => void;
  readonly onOpenMenu: () => void;
}

export function TopHud({
  state,
  viewerHouseId,
  activePopover,
  aiThinkingHouseId,
  onTogglePopover,
  onOpenRealm,
  onOpenCrown,
  onOpenMenu,
}: TopHudProps) {
  const house = state.houses[viewerHouseId]!;
  const cfg = getMapPresetConfig(state);
  const income = computeHouseNetIncome(state, viewerHouseId);
  const supremacy = getSupremacyStats(state, viewerHouseId);
  const score = computeScore(state, viewerHouseId, false).total;
  const season = getSeason(state.turnNumber);
  const seasonDef = SEASONS[season];
  const year = getYear(state.turnNumber);
  const turnsLeftInSeason = TURNS_PER_SEASON - ((state.turnNumber - 1) % TURNS_PER_SEASON);

  const openWritsCount = state.crown.activeWrits.filter((w) => w.completedByHouseId === null).length;
  const activeEventsForViewer = state.activeEffects.filter(
    (e) =>
      e.expiresAfterTurn >= state.turnNumber &&
      (e.houseId === null || e.houseId === viewerHouseId),
  );

  const claimantId = state.crown.claimantHouseId;
  const claimantTurnsRem =
    claimantId && state.crown.claimStartTurn !== null
      ? Math.max(1, cfg.mandateHoldTurns - (state.turnNumber - state.crown.claimStartTurn))
      : null;

  const coinToDraft = Math.max(0, house.nextCoinMilestone - house.lifetimeCoinEarned);

  const popoverText: Record<NonNullable<UiInteractionState['hudPopover']>, string> = {
    food: 'Food: Per-turn harvest across all Keeps. Fills each Keep growth bar (Tier 1 -> Tier 2 5x5 -> Tier 3 7x7 Grand Citadel), provisions troops in Winter, and pays Peaceful Annexations.',
    materials:
      'Materials: Builds tile improvements, Level-2 upgrades, Roads, Frontier Outposts, Keep wall repairs (8M), and trains troops.',
    iron: `Iron: Scarce strategic metal mined from Iron Deposits (+${income.iron}/t). Required for Men-at-Arms, Crossbows, Knights, Siege engines, Smithies, Stone Walls/Bastions, Tier-3 Grand Citadels (${KEEP_TIER3_IRON_COST} Ir), and heavy Field Reinforce.`,
    coin: `Coin: Pays troop wages (${income.unitUpkeep}/t) & building upkeep (${income.buildingUpkeep}/t). Lifetime Coin: ${house.lifetimeCoinEarned}/${house.nextCoinMilestone} (${coinToDraft} more triggers an Exclusive Doctrine Pair!).`,
    favor: `Royal Favor: Earned from Crown Writs, High Seat, Watchtowers & Events. Spend in Crown Council or hold ${cfg.mandateMinFavor}+ Favor, ${cfg.mandateMinKeeps}+ Keeps & ${cfg.mandateMinTier3Citadels}+ Tier-3 Citadels for ${cfg.mandateHoldTurns} turns to win Regent's Mandate.`,
    keeps: `Keeps: ${supremacy.ownedKeeps}/${supremacy.totalKeeps} (${supremacy.percent}%). Hold >= ${Math.round(cfg.supremacyKeepShare * 100)}% (min ${supremacy.requiredKeeps}) or eliminate all rivals in Dominion; score highest by Turn ${state.chronicleLimit} in Chronicle.`,
    season: `Year ${year} • ${seasonDef.name} (${seasonDef.subtitle}). ${turnsLeftInSeason}t until next season & Frontier Event.`,
    score:
      'Realm Score: Live Chronicle score across Territory, Lv2 Upgrades, Keeps/Citadels, Outposts, Doctrines, Military, Exploration, Landmarks (incl. High Seat) & Favor.',
    turn:
      state.mode === 'chronicle'
        ? `Year ${year} • ${seasonDef.name} (${seasonDef.subtitle}). Chronicle Mode ends after Turn ${state.chronicleLimit} (${cfg.label}).`
        : `Year ${year} • ${seasonDef.name} (${seasonDef.subtitle}) • ${cfg.label}. ${turnsLeftInSeason}t until season shift.`,
  };

  return (
    <header className="relative z-30 w-full surface-iron-top border-b border-amber-500/25 safe-top px-2 pb-1.5">
      {/* Row 1: House Sigil, Turn/Season, Realm Ledger, Crown Council & Menu */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <HouseSigilSvg houseId={viewerHouseId} size={26} />
          <button
            type="button"
            onClick={() => onTogglePopover(activePopover === 'turn' ? null : 'turn')}
            className="touch-target px-1 flex flex-col justify-center text-left rounded-lg active:bg-slate-800/80 min-w-0"
          >
            <span className="font-serif-march text-xs font-bold text-[#FAF7F0] tabular-nums leading-tight truncate">
              Turn {state.turnNumber}
              {state.mode === 'chronicle' ? `/${state.chronicleLimit}` : ''} • Y{year}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-amber-200/85 leading-tight truncate">
              <SeasonIconSvg season={season} size={11} />
              <span>
                {seasonDef.name} ({turnsLeftInSeason}t)
              </span>
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenRealm}
            className="touch-target px-2 rounded-xl bg-sky-950/75 border border-sky-500/45 text-[11px] font-bold text-sky-100 flex items-center gap-1 active:bg-sky-900/80"
            aria-label="Open Realm Ledger and Decree Codex"
          >
            <ResourceIconSvg kind="realm" size={14} />
            <span>Realm</span>
          </button>

          <button
            type="button"
            onClick={onOpenCrown}
            className="relative touch-target px-2 rounded-xl bg-amber-950/70 border border-amber-500/55 text-[11px] font-bold text-amber-200 flex items-center gap-1 active:bg-amber-900/70"
            aria-label="Open Crown and Writs"
          >
            <ResourceIconSvg kind="crown" size={14} />
            <span>Crown</span>
            {openWritsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-[9px] font-extrabold text-slate-950 flex items-center justify-center shadow">
                {openWritsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenMenu}
            className="touch-target px-2.5 rounded-xl bg-[#252932]/90 border border-[#383B44] text-[11px] font-bold text-stone-100 active:bg-[#303540]"
            aria-label="Open Menu"
          >
            Menu
          </button>
        </div>
      </div>

      {/* Row 2: 6 Compact Resource & Status Pills (Food, Mat, Iron, Coin, Favor, Keeps/Score) */}
      <div className="mt-1 grid grid-cols-6 gap-1">
        <button
          type="button"
          onClick={() => onTogglePopover(activePopover === 'food' ? null : 'food')}
          className="min-h-[44px] px-0.5 rounded-xl bg-[#16181D]/80 border border-emerald-700/40 flex flex-col items-center justify-center tabular-nums active:bg-[#252932]"
        >
          <span className="flex items-center gap-0.5 text-[8.5px] font-bold uppercase text-emerald-400">
            <ResourceIconSvg kind="food" size={10} />
            <span>Food</span>
          </span>
          <span className="text-[11px] font-bold text-slate-100">+{income.food}/t</span>
        </button>

        <button
          type="button"
          onClick={() => onTogglePopover(activePopover === 'materials' ? null : 'materials')}
          className="min-h-[44px] px-0.5 rounded-xl bg-[#16181D]/80 border border-amber-700/40 flex flex-col items-center justify-center tabular-nums active:bg-[#252932]"
        >
          <span className="flex items-center gap-0.5 text-[8.5px] font-bold uppercase text-amber-400">
            <ResourceIconSvg kind="materials" size={10} />
            <span>Mat</span>
          </span>
          <span className="text-[11px] font-bold text-slate-100">
            {house.resources.materials}
            <span className="text-[8.5px] text-amber-300 font-semibold">+{income.materials}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTogglePopover(activePopover === 'iron' ? null : 'iron')}
          className="min-h-[44px] px-0.5 rounded-xl bg-[#16181D]/80 border border-blue-500/45 flex flex-col items-center justify-center tabular-nums active:bg-[#252932]"
        >
          <span className="flex items-center gap-0.5 text-[8.5px] font-bold uppercase text-blue-400">
            <ResourceIconSvg kind="iron" size={10} />
            <span>Iron</span>
          </span>
          <span className="text-[11px] font-bold text-slate-100">
            {house.resources.iron}
            <span className="text-[8.5px] text-blue-300 font-semibold">+{income.iron}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTogglePopover(activePopover === 'coin' ? null : 'coin')}
          className="min-h-[44px] px-0.5 rounded-xl bg-[#16181D]/80 border border-yellow-600/40 flex flex-col items-center justify-center tabular-nums active:bg-[#252932]"
        >
          <span className="flex items-center gap-0.5 text-[8.5px] font-bold uppercase text-yellow-400">
            <ResourceIconSvg kind="coin" size={10} />
            <span>Coin</span>
          </span>
          <span className="text-[11px] font-bold text-slate-100">
            {house.resources.coin}
            <span className={`text-[8.5px] font-semibold ${income.netCoin < 0 ? 'text-red-400' : 'text-yellow-300'}`}>
              {income.netCoin >= 0 ? `+${income.netCoin}` : income.netCoin}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTogglePopover(activePopover === 'favor' ? null : 'favor')}
          className="min-h-[44px] px-0.5 rounded-xl bg-[#16181D]/80 border border-purple-500/35 flex flex-col items-center justify-center tabular-nums active:bg-[#252932]"
        >
          <span className="flex items-center gap-0.5 text-[8.5px] font-bold uppercase text-purple-300">
            <ResourceIconSvg kind="favor" size={10} />
            <span>Favor</span>
          </span>
          <span className="text-[11px] font-bold text-slate-100">{house.favor}</span>
        </button>

        <button
          type="button"
          onClick={() => onTogglePopover(activePopover === 'keeps' ? null : 'keeps')}
          className="min-h-[44px] px-0.5 rounded-xl bg-[#16181D]/80 border border-sky-600/40 flex flex-col items-center justify-center tabular-nums active:bg-[#252932]"
        >
          <span className="flex items-center gap-0.5 text-[8.5px] font-bold uppercase text-sky-300">
            <ResourceIconSvg kind="keep" size={10} />
            <span>
              {supremacy.ownedKeeps}/{supremacy.requiredKeeps}
            </span>
          </span>
          <span className="text-[11px] font-bold text-slate-100">{score}pt</span>
        </button>
      </div>

      {/* Active Frontier Event Effect Strip */}
      {activeEventsForViewer.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 justify-center">
          {activeEventsForViewer.map((eff) => {
            const def = FRONTIER_EVENTS[eff.effectId];
            const rem = Math.max(1, eff.expiresAfterTurn - state.turnNumber + 1);
            return (
              <span
                key={eff.id}
                className="px-2 py-0.5 rounded-full bg-indigo-950/90 border border-indigo-400/50 text-[10px] font-semibold text-indigo-100"
              >
                {def.title} ({rem}t)
              </span>
            );
          })}
        </div>
      )}

      {/* Mandate Claimant Banner */}
      {claimantId && claimantTurnsRem !== null && (
        <div className="mt-1.5 px-2.5 py-1 rounded-lg bg-amber-950/90 border border-amber-500/70 text-[11px] font-semibold text-amber-200 text-center">
          MANDATE CLAIMED — {HOUSES[claimantId].name} holds the Regent&apos;s Mandate (
          {claimantTurnsRem}t to victory)
        </div>
      )}

      {/* AI Turn Indicator */}
      {aiThinkingHouseId && (
        <div className="mt-1.5 px-2.5 py-1 rounded-lg bg-slate-900/95 border border-sky-500/60 text-xs font-semibold text-sky-200 flex items-center justify-center gap-2">
          <HouseSigilSvg houseId={aiThinkingHouseId} size={16} />
          <span>{HOUSES[aiThinkingHouseId].name} is deliberating…</span>
        </div>
      )}

      {/* Tap-to-Inspect Popover */}
      {activePopover && (
        <div className="mt-1.5 p-2.5 rounded-xl bg-[#16181D] border border-[#D4AF5A]/50 text-xs text-stone-200 flex items-start justify-between gap-2 shadow-xl">
          <p className="leading-snug">{popoverText[activePopover]}</p>
          <button
            type="button"
            onClick={() => onTogglePopover(null)}
            className="touch-target shrink-0 px-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold"
            aria-label="Close tooltip"
          >
            ✕
          </button>
        </div>
      )}
    </header>
  );
}
