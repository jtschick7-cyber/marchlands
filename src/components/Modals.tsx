/**
 * Marchlands (Spec v2.0) — Modals & Drawers
 *
 * Aged Vellum (#FAF7F0 / #1C1917 / #B45309) cards for Exclusive Doctrine Pair Drafts,
 * Tier-2 Stronghold Specializations, Tier-3 Citadel Charters, Lord-Commander Marshal Traits,
 * Branching Unit Battle Honors, Frontier Events, Recap, 3-Card Primer, Crown Writs/Audience,
 * Menu, Realm Ledger, and Game Over.
 */

import { useState } from 'react';
import type {
  BattleHonorId,
  CitadelCharter,
  CommanderTraitId,
  CoordKey,
  DecreeId,
  GameState,
  HouseId,
  KeepSpecialization,
  SaveMetadata,
} from '../types/game.ts';
import {
  AUDIENCE_GRANT_AMOUNT,
  AUDIENCE_GRANT_FAVOR,
  AUDIENCE_IRON_AMOUNT,
  AUDIENCE_IRON_FAVOR,
  AUDIENCE_PETITION_FAVOR,
  AUDIENCE_REROLL_FAVOR,
  BATTLE_HONORS,
  CITADEL_CHARTER_IDS,
  CITADEL_CHARTERS,
  COMMANDER_LEVEL2_XP,
  COMMANDER_LEVEL3_XP,
  COMMANDER_TRAITS,
  CROWN_WRITS,
  DECREE_PAIR_IDS,
  DECREE_PAIRS,
  DECREES,
  FRONTIER_EVENTS,
  HOUSES,
  KEEP_SPECIALIZATIONS,
  SEASONS,
  UNITS,
  getBattleHonorChoices,
  getCommanderTraitChoicesForLevel,
} from '../data/index.ts';
import { canPayRegentsTithe, getAudienceCost } from '../engine/crown.ts';
import {
  getKeepInspectInfo,
  getSupremacyStats,
  getUnitRankLabel,
} from '../engine/queries.ts';
import { computeScore, rankHousesByScore } from '../engine/scoring.ts';
import {
  getHouseKeeps,
  getHouseOutposts,
  getHouseUnits,
  getMapPresetConfig,
  getSeason,
} from '../engine/stateHelpers.ts';
import { buildRecap } from '../engine/turn.ts';
import { HouseSigilSvg, SeasonIconSvg, UnitFigureSvg } from './svg/HeraldrySvg.tsx';
import { formatRelativeTime, type DiscoveredRuinBanner } from './uiTypes.ts';

// ----------------------------------------------------------------------------
// 1. Tier-2 Keep Specialization Modal (4 Specializations incl. Forge Seat)
// ----------------------------------------------------------------------------

export function SpecializationModal({
  state,
  viewerHouseId,
  onSelect,
}: {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly onSelect: (keepId: string, spec: Exclude<KeepSpecialization, 'none'>) => void;
}) {
  const house = state.houses[viewerHouseId];
  const keepId = house?.pendingSpecializationKeepIds[0];
  const keep = keepId ? state.keeps[keepId] : null;
  if (!keep) return null;

  const specs: Array<{
    id: Exclude<KeepSpecialization, 'none'>;
    effect: string;
    flavor: string;
  }> = [
    {
      id: 'garrison',
      effect: KEEP_SPECIALIZATIONS.garrison.description,
      flavor:
        'Thickened curtain walls, deep cisterns, and a permanent muster yard turn a frontier keep into an iron gate.',
    },
    {
      id: 'forge_seat',
      effect: KEEP_SPECIALIZATIONS.forge_seat.description,
      flavor:
        'Trip-hammers and blast furnaces roar day and night, stamping heavy plate and iron-shod rams.',
    },
    {
      id: 'market_town',
      effect: KEEP_SPECIALIZATIONS.market_town.description,
      flavor:
        'Chartered stalls and toll-scales draw river merchants from across the southern shires.',
    },
    {
      id: 'granary_seat',
      effect: KEEP_SPECIALIZATIONS.granary_seat.description,
      flavor:
        'Stone-lined cellars and salted stores keep the surrounding hamlets fed through the longest frost.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl bg-[#FAF7F0] text-[#1C1917] border-2 border-[#B45309] p-4 shadow-2xl space-y-3">
        <div>
          <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-[#B45309] text-[10px] font-bold uppercase">
            Tier-2 Stronghold Charter
          </span>
          <h2 className="font-serif-march text-xl font-bold text-[#1C1917] mt-1">
            Charter {keep.name}
          </h2>
          <p className="text-xs text-stone-700 mt-1">
            {keep.name} has expanded to a 5×5 Tier-2 Stronghold. Choose its permanent charter.
          </p>
        </div>

        <div className="space-y-2">
          {specs.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(keep.id, s.id)}
              className="touch-target w-full text-left p-3 rounded-xl bg-white border border-stone-300 hover:border-[#B45309] active:bg-amber-50 transition"
            >
              <div className="font-serif-march text-sm font-bold text-[#B45309]">
                {KEEP_SPECIALIZATIONS[s.id].name}
              </div>
              <div className="text-xs font-semibold text-stone-800 mt-0.5">{s.effect}</div>
              <div className="text-[11px] italic text-stone-600 mt-1">{s.flavor}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 1b. Tier-3 Grand Citadel Charter Modal
// ----------------------------------------------------------------------------

export function CitadelCharterModal({
  state,
  viewerHouseId,
  onSelect,
}: {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly onSelect: (keepId: string, charter: Exclude<CitadelCharter, 'none'>) => void;
}) {
  const house = state.houses[viewerHouseId];
  const keepId = house?.pendingCitadelKeepIds[0];
  const keep = keepId ? state.keeps[keepId] : null;
  if (!keep) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl bg-[#FAF7F0] text-[#1C1917] border-2 border-[#B45309] p-4 shadow-2xl space-y-3">
        <div>
          <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-[#B45309] text-[10px] font-bold uppercase">
            Tier-3 Grand Citadel Charter
          </span>
          <h2 className="font-serif-march text-xl font-bold text-[#1C1917] mt-1">
            Crown {keep.name}
          </h2>
          <p className="text-xs text-stone-700 mt-1">
            {keep.name} now towers as a 7×7 Tier-3 Grand Citadel with Range-2 Arrow Slits. Choose its
            supreme Citadel Charter.
          </p>
        </div>

        <div className="space-y-2">
          {CITADEL_CHARTER_IDS.map((cid) => {
            const c = CITADEL_CHARTERS[cid];
            return (
              <button
                key={cid}
                type="button"
                onClick={() => onSelect(keep.id, cid)}
                className="touch-target w-full text-left p-3 rounded-xl bg-white border border-stone-300 hover:border-[#B45309] active:bg-amber-50 transition"
              >
                <div className="font-serif-march text-sm font-bold text-[#B45309]">{c.name}</div>
                <div className="text-xs font-semibold text-stone-800 mt-0.5">{c.description}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 1c. Lord-Commander Marshal Trait Modal (Levels 2 & 3)
// ----------------------------------------------------------------------------

export function CommanderTraitModal({
  state,
  viewerHouseId,
  onSelect,
}: {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly onSelect: (traitId: CommanderTraitId) => void;
}) {
  const house = state.houses[viewerHouseId];
  const cmd = state.commanders[viewerHouseId];
  if (!house || !cmd || !house.pendingCommanderTrait) return null;

  const nextSlot = (cmd.traits.length + 2) as 2 | 3;
  if (nextSlot > 3) return null;
  const choices = getCommanderTraitChoicesForLevel(nextSlot);
  const houseDef = HOUSES[viewerHouseId];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl bg-[#FAF7F0] text-[#1C1917] border-2 border-[#B45309] p-4 shadow-2xl space-y-3">
        <div className="flex items-center gap-2.5">
          <HouseSigilSvg houseId={viewerHouseId} size={34} />
          <div>
            <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-[#B45309] text-[10px] font-bold uppercase">
              Marshal Promotion — Level {nextSlot}
            </span>
            <h2 className="font-serif-march text-xl font-bold text-[#1C1917]">
              {houseDef.commanderName}
            </h2>
          </div>
        </div>
        <p className="text-xs text-stone-700">
          Your Lord-Commander has distinguished themselves on the field. Choose a permanent Marshal
          Trait:
        </p>

        <div className="space-y-2">
          {choices.map((tid) => {
            const t = COMMANDER_TRAITS[tid];
            return (
              <button
                key={tid}
                type="button"
                onClick={() => onSelect(tid)}
                className="touch-target w-full text-left p-3 rounded-xl bg-white border border-stone-300 hover:border-[#B45309] active:bg-amber-50 transition"
              >
                <div className="font-serif-march text-sm font-bold text-[#B45309]">{t.title}</div>
                <div className="text-xs font-semibold text-stone-800 mt-0.5">{t.effectText}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 1d. Branching Unit Battle Honor Modal (Rank 1 & Rank 2)
// ----------------------------------------------------------------------------

export function BattleHonorModal({
  state,
  viewerHouseId,
  onSelect,
}: {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly onSelect: (unitId: string, honorId: BattleHonorId) => void;
}) {
  const house = state.houses[viewerHouseId];
  const unitId = house?.pendingHonorUnitIds[0];
  const unit = unitId ? state.units[unitId] : null;
  if (!unit) return null;

  const def = UNITS[unit.typeId];
  if (def.unitClass === 'commander') return null;
  const targetRank = (unit.battleHonors.length + 1) as 1 | 2;
  const choices = getBattleHonorChoices(def.unitClass, targetRank);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl bg-[#FAF7F0] text-[#1C1917] border-2 border-[#B45309] p-4 shadow-2xl space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-xl bg-[#EAE3D2] border border-[#C7BEA8] flex items-center justify-center shrink-0">
            <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
              <UnitFigureSvg unitId={unit.typeId} houseId={viewerHouseId} />
            </svg>
          </div>
          <div>
            <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-[#B45309] text-[10px] font-bold uppercase">
              Rank {targetRank} Battle Honor ({targetRank === 1 ? 'Seasoned' : 'Veteran'})
            </span>
            <h2 className="font-serif-march text-xl font-bold text-[#1C1917]">{def.name}</h2>
          </div>
        </div>
        <p className="text-xs text-stone-700">
          Bestow a permanent Battle Honor upon this veteran company:
        </p>

        <div className="space-y-2">
          {choices.map((hid) => {
            const h = BATTLE_HONORS[hid];
            return (
              <button
                key={hid}
                type="button"
                onClick={() => onSelect(unit.id, hid)}
                className="touch-target w-full text-left p-3 rounded-xl bg-white border border-stone-300 hover:border-[#B45309] active:bg-amber-50 transition"
              >
                <div className="font-serif-march text-sm font-bold text-[#B45309]">
                  ★ {h.title}
                </div>
                <div className="text-xs font-semibold text-stone-800 mt-0.5">{h.effectText}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 2. Mutually Exclusive Royal Doctrine Pair Draft Modal (A vs B + Royal Reroll)
// ----------------------------------------------------------------------------

export function DraftModal({
  state,
  viewerHouseId,
  onSelectDecree,
  onRoyalReroll,
}: {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly onSelectDecree: (decreeId: DecreeId) => void;
  readonly onRoyalReroll: () => void;
}) {
  const house = state.houses[viewerHouseId];
  const choices = state.pendingDraftChoices;
  if (!house || !choices || choices.length === 0) return null;

  const pairDef = DECREES[choices[0]!] ? DECREE_PAIRS[DECREES[choices[0]!].pairId] : null;
  const rerollCost = getAudienceCost(house, AUDIENCE_REROLL_FAVOR);
  const canReroll = !house.audienceUsedThisTurn && house.favor >= rerollCost;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl bg-[#FAF7F0] text-[#1C1917] border-2 border-[#B45309] p-4 shadow-2xl space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-[#B45309] text-[10px] font-bold uppercase">
              {pairDef ? pairDef.theme : 'Exclusive Doctrine Pair'}
            </span>
            <h2 className="font-serif-march text-xl font-bold text-[#1C1917] mt-0.5">
              Royal Doctrine Choice
            </h2>
            <p className="text-xs text-stone-700 mt-0.5">
              Enact 1 doctrine. Its opposite is <strong>permanently locked</strong> for the rest of
              this campaign ({house.pendingDraftCount} draft{house.pendingDraftCount > 1 ? 's' : ''}{' '}
              queued).
            </p>
          </div>
          <button
            type="button"
            disabled={!canReroll}
            onClick={onRoyalReroll}
            className="touch-target shrink-0 px-3 rounded-lg bg-[#B45309] disabled:bg-stone-300 disabled:text-stone-500 text-white text-xs font-bold"
          >
            Draw New Pair ({rerollCost}F)
          </button>
        </div>

        <div className="space-y-2.5">
          {choices.map((id, idx) => {
            const d = DECREES[id];
            const opposite = DECREES[d.oppositeId];
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectDecree(id)}
                className="touch-target w-full text-left p-3 rounded-xl bg-white border-2 border-stone-300 hover:border-[#B45309] active:bg-amber-50 transition space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-serif-march text-sm font-bold text-[#1C1917]">
                    Option {idx === 0 ? 'A' : 'B'}: {d.title}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-[#B45309] text-[10px] font-bold uppercase">
                    {DECREE_PAIRS[d.pairId].theme}
                  </span>
                </div>
                <p className="text-xs font-semibold text-stone-800">{d.effectText}</p>
                <p className="text-[11px] italic text-stone-600">{d.flavor}</p>
                <div className="pt-1">
                  <span className="inline-block px-2 py-0.5 rounded bg-red-100 border border-red-300 text-red-800 text-[10px] font-bold">
                    ✕ Permanently Locks: {opposite.title}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 3. Frontier Event Choice Modal
// ----------------------------------------------------------------------------

const OPTION_LABELS: Record<string, string> = {
  pay_coin: 'Pay Crown Levy (Coin)',
  lose_favor: 'Refuse Levy (-2 Favor)',
  hire: 'Hire Free Company (20 Coin)',
  decline: 'Decline Offer',
  host: 'Host Tournament (12 Coin -> +2 Favor)',
  enter: 'Enter Tournament (12 Coin -> +2 Favor)',
  pay_wages: 'Pay Emergency Wages (10 Coin)',
  pay_bonus: 'Pay Bonus Wages (10 Coin)',
  suffer_desertion: 'Endure Desertion (-6 HP)',
  suffer_damage: 'Endure Desertion (-6 HP)',
};

export function EventModal({
  state,
  onChooseOption,
}: {
  readonly state: GameState;
  readonly onChooseOption: (option: string) => void;
}) {
  const pending = state.pendingEventChoice;
  if (!pending) return null;
  const ev = FRONTIER_EVENTS[pending.eventId];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3">
      <div className="w-full max-w-md rounded-2xl bg-[#FAF7F0] text-[#1C1917] border-2 border-[#B45309] p-4 shadow-2xl space-y-3">
        <div>
          <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-[#B45309] text-[10px] font-bold uppercase">
            Frontier Event
          </span>
          <h2 className="font-serif-march text-xl font-bold mt-1">{ev.title}</h2>
          <p className="text-xs italic text-stone-700 mt-1">{ev.vignette}</p>
          <p className="text-xs font-semibold text-stone-900 mt-2">{ev.effectText}</p>
        </div>

        <div className="space-y-2 pt-1">
          {pending.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChooseOption(opt)}
              className="touch-target w-full px-4 py-2.5 rounded-xl bg-[#1C1917] text-[#FAF7F0] text-sm font-bold active:bg-stone-800"
            >
              {OPTION_LABELS[opt] ?? opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 4. Crown Writs & Audience Drawer (Includes Emergency Iron Shipment & v2.0 Mandate)
// ----------------------------------------------------------------------------

export function CrownDrawer({
  state,
  viewerHouseId,
  onClose,
  onPayTithe,
  onPetitionCharter,
  onCrownGrant,
}: {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly onClose: () => void;
  readonly onPayTithe: () => void;
  readonly onPetitionCharter: () => void;
  readonly onCrownGrant: (resource: 'materials' | 'coin' | 'iron') => void;
}) {
  const house = state.houses[viewerHouseId]!;
  const cfg = getMapPresetConfig(state);
  const supremacy = getSupremacyStats(state, viewerHouseId);
  const tier3Count = getHouseKeeps(state, viewerHouseId).filter((k) => k.tier === 3).length;
  const canTithe = canPayRegentsTithe(state, viewerHouseId);
  const audienceAvailable = !house.audienceUsedThisTurn && state.phase === 'player_command';

  const petitionCost = getAudienceCost(house, AUDIENCE_PETITION_FAVOR);
  const grantCost = getAudienceCost(house, AUDIENCE_GRANT_FAVOR);
  const ironCost = getAudienceCost(house, AUDIENCE_IRON_FAVOR);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center">
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[#1E293B] border-t-2 border-amber-500/70 p-4 safe-bottom space-y-4 text-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif-march text-lg font-bold text-amber-200">
              Crown Council &amp; Writs
            </h2>
            <p className="text-xs text-slate-300 tabular-nums">
              Royal Favor: {house.favor} • Regent&apos;s Mandate requires {cfg.mandateMinFavor}+
              Favor, {cfg.mandateMinKeeps}+ Keeps ({supremacy.ownedKeeps} held) &amp;{' '}
              {cfg.mandateMinTier3Citadels}+ Tier-3 Citadels ({tier3Count} held) for{' '}
              {cfg.mandateHoldTurns} turns
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target px-3 rounded-lg bg-slate-800 border border-slate-600 text-xs font-bold"
          >
            Close
          </button>
        </div>

        {/* Active Crown Writs */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-amber-300">
            Active Public Writs
          </h3>
          {state.crown.activeWrits.length === 0 ? (
            <p className="text-xs text-slate-400">
              First Crown Writs publish on Turn {state.crown.nextWritTurn}.
            </p>
          ) : (
            state.crown.activeWrits.map((aw) => {
              const def = CROWN_WRITS[aw.writId];
              const doneBy = aw.completedByHouseId ? HOUSES[aw.completedByHouseId].name : null;
              return (
                <div
                  key={`${aw.writId}_${aw.publishedTurn}`}
                  className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-700 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-100">{def.title}</span>
                    <span className="text-[11px] font-semibold text-amber-300">
                      +{def.rewardFavor} Favor
                      {def.rewardCoin > 0 ? ` • +${def.rewardCoin}C` : ''}
                      {def.rewardMaterials > 0 ? ` • +${def.rewardMaterials}M` : ''}
                      {def.rewardIron > 0 ? ` • +${def.rewardIron}Ir` : ''}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">{def.requirementText}</p>
                  {doneBy ? (
                    <p className="text-[11px] font-bold text-emerald-400">Completed by {doneBy}</p>
                  ) : (
                    def.isVoluntaryTithe && (
                      <button
                        type="button"
                        disabled={!canTithe}
                        onClick={onPayTithe}
                        className="touch-target mt-1 w-full rounded-lg bg-amber-600 disabled:bg-slate-700 text-slate-950 disabled:text-slate-400 text-xs font-bold"
                      >
                        Pay Regent&apos;s Tithe ({def.titheCoinCost} Coin)
                      </button>
                    )
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Crown Audience (1/turn) */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-amber-300">
            Crown Audience ({house.audienceUsedThisTurn ? 'Used This Turn' : '1 Available'})
          </h3>
          <button
            type="button"
            disabled={!audienceAvailable || house.favor < petitionCost}
            onClick={onPetitionCharter}
            className="touch-target w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-600 disabled:opacity-45 text-left"
          >
            <div className="text-xs font-bold text-amber-200">
              Petition a Doctrine Charter ({petitionCost} Favor)
            </div>
            <div className="text-[11px] text-slate-300">
              Queue an immediate Exclusive Doctrine Pair Draft.
            </div>
          </button>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={!audienceAvailable || house.favor < grantCost}
              onClick={() => onCrownGrant('materials')}
              className="touch-target px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-600 disabled:opacity-45 text-left"
            >
              <div className="text-xs font-bold text-amber-300">
                +{AUDIENCE_GRANT_AMOUNT} Mat
              </div>
              <div className="text-[11px] text-slate-400">{grantCost} Favor</div>
            </button>
            <button
              type="button"
              disabled={!audienceAvailable || house.favor < ironCost}
              onClick={() => onCrownGrant('iron')}
              className="touch-target px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-600 disabled:opacity-45 text-left"
            >
              <div className="text-xs font-bold text-sky-300">
                +{AUDIENCE_IRON_AMOUNT} Iron
              </div>
              <div className="text-[11px] text-slate-400">{ironCost} Favor</div>
            </button>
            <button
              type="button"
              disabled={!audienceAvailable || house.favor < grantCost}
              onClick={() => onCrownGrant('coin')}
              className="touch-target px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-600 disabled:opacity-45 text-left"
            >
              <div className="text-xs font-bold text-yellow-300">
                +{AUDIENCE_GRANT_AMOUNT} Coin
              </div>
              <div className="text-[11px] text-slate-400">{grantCost} Favor</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 5. "Previously in the March..." Recap Modal
// ----------------------------------------------------------------------------

export function RecapModal({
  state,
  viewerHouseId,
  sinceTurn,
  lastPlayedIso,
  onPanToTile,
  onClose,
}: {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly sinceTurn: number;
  readonly lastPlayedIso: string | null;
  readonly onPanToTile: (tileKey: CoordKey) => void;
  readonly onClose: () => void;
}) {
  const recap = buildRecap(state, viewerHouseId, sinceTurn);
  const sections = [
    { title: 'Your Realm', lines: recap.yourRealm },
    { title: 'Since You Last Ruled', lines: recap.sinceYouLastRuled.slice(-6) },
    { title: 'Threats', lines: recap.threats.slice(0, 6) },
    { title: 'Awaiting Your Word', lines: recap.awaitingYourWord.slice(0, 6) },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3">
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-[#FAF7F0] text-[#1C1917] border-2 border-[#B45309] p-4 shadow-2xl space-y-3">
        <div>
          <h2 className="font-serif-march text-xl font-bold">Previously in the March…</h2>
          {lastPlayedIso && (
            <p className="text-xs text-stone-600">
              Last played {formatRelativeTime(lastPlayedIso)}
            </p>
          )}
        </div>

        <div className="space-y-3">
          {sections.map((sec) => (
            <div key={sec.title} className="space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#B45309]">
                {sec.title}
              </h3>
              {sec.lines.length === 0 ? (
                <p className="text-xs text-stone-500">Quiet on the frontier.</p>
              ) : (
                sec.lines.map((line, i) =>
                  line.tileKey ? (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        onPanToTile(line.tileKey!);
                        onClose();
                      }}
                      className="touch-target w-full text-left px-2.5 py-1.5 rounded-lg bg-white border border-stone-300 text-xs text-stone-800 active:bg-amber-50"
                    >
                      {line.text} <span className="text-[#B45309] font-semibold">→ View</span>
                    </button>
                  ) : (
                    <p key={i} className="text-xs text-stone-800 leading-snug">
                      • {line.text}
                    </p>
                  ),
                )
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="touch-target w-full rounded-xl bg-[#1C1917] text-[#FAF7F0] text-sm font-bold"
        >
          Take Command
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 6. 3-Card Interactive "How to Play" Mobile Primer (Spec v2.0)
// ----------------------------------------------------------------------------

const PRIMER_CARDS = [
  {
    title: 'Carve the Grand Frontier',
    headline: '4 Resources, Roads & Citadels',
    body: 'Build across every terrain and upgrade improvements to Level 2. Mine Iron to forge elite armor, siege engines, Stone Curtain Walls, and 7×7 Tier-3 Grand Citadels. Lay Roads and found Frontier Outposts to project supply across the 34×34 March.',
    tip: 'Food grows Keep tiers • Materials & Iron build structures/elites • Coin pays upkeep.',
  },
  {
    title: 'Combined Arms & Class Tactics',
    headline: 'Outsmart with Marshals & Actions',
    body: 'Lead your warband with your House Lord-Commander (+10% aura & signature skill). Exploit the 4-way counter loop (+35%), Infantry Shield Push, Cavalry Lance Charge, Ranged Overwatch, and Range-3 Siege Trebuchets.',
    tip: 'Spearmen > Cavalry > Ranged & Siege | Infantry > Spearmen | Ranged > Infantry',
  },
  {
    title: 'Exclusive Doctrines & The High Seat',
    headline: 'Every Choice Carries Weight',
    body: 'Draft from 8 Mutually Exclusive Royal Doctrine Pairs—enacting one side permanently locks its opposite. Breach the Central Ruined High Seat for prestige, complete Crown Writs, and provision your Keeps before Winter frost.',
    tip: "Win by Conquest, Supremacy (75% Keeps), Regent's Mandate (60+ Favor & 2+ Tier-3 Citadels), or Chronicle Score.",
  },
];

export function PrimerModal({ onClose }: { readonly onClose: () => void }) {
  const [step, setStep] = useState(0);
  const card = PRIMER_CARDS[step]!;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3">
      <div className="w-full max-w-md rounded-2xl bg-[#FAF7F0] text-[#1C1917] border-2 border-[#B45309] p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase text-[#B45309]">
            Field Guide ({step + 1}/3)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="touch-target px-2 text-xs font-bold text-stone-600"
          >
            Skip
          </button>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-stone-500">{card.title}</p>
          <h2 className="font-serif-march text-2xl font-bold mt-0.5">{card.headline}</h2>
          <p className="text-sm text-stone-800 leading-relaxed mt-2">{card.body}</p>
        </div>

        <div className="p-2.5 rounded-xl bg-amber-100/80 border border-amber-300 text-xs font-semibold text-amber-950">
          {card.tip}
        </div>

        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="touch-target px-4 rounded-xl bg-stone-200 text-stone-800 text-sm font-bold"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (step < PRIMER_CARDS.length - 1) setStep((s) => s + 1);
              else onClose();
            }}
            className="touch-target flex-1 rounded-xl bg-[#B45309] text-white text-sm font-bold"
          >
            {step < PRIMER_CARDS.length - 1 ? 'Next' : 'Begin Campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 7. Campaign Menu Drawer (Save Slots, Export/Import JSON, Field Guide, Title)
// ----------------------------------------------------------------------------

export function MenuDrawer({
  saveSlots,
  showZoomButtons,
  onToggleZoomButtons,
  onClose,
  onSaveSlot,
  onLoadSlot,
  onExportJson,
  onImportJson,
  onOpenPrimer,
  onReturnToTitle,
}: {
  readonly saveSlots: readonly SaveMetadata[];
  readonly showZoomButtons: boolean;
  readonly onToggleZoomButtons: () => void;
  readonly onClose: () => void;
  readonly onSaveSlot: (slotId: string) => void;
  readonly onLoadSlot: (slotId: string) => void;
  readonly onExportJson: () => void;
  readonly onImportJson: (jsonText: string) => void;
  readonly onOpenPrimer: () => void;
  readonly onReturnToTitle: () => void;
}) {
  const [importText, setImportText] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center">
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[#1E2128] border-t-2 border-[#383B44] p-4 safe-bottom space-y-3 text-stone-100">
        <div className="flex items-center justify-between">
          <h2 className="font-serif-march text-lg font-bold">Campaign Menu</h2>
          <button
            type="button"
            onClick={onClose}
            className="touch-target px-3 rounded-lg bg-[#252932] border border-[#383B44] text-xs font-bold"
          >
            Close
          </button>
        </div>

        {/* Accessibility Toggle: Floating Map Zoom Buttons */}
        <button
          type="button"
          onClick={onToggleZoomButtons}
          aria-pressed={showZoomButtons}
          className="touch-target w-full px-3 py-2 rounded-xl bg-[#16181D] border border-[#383B44] flex items-center justify-between text-xs"
        >
          <span className="font-semibold text-stone-200">Show Map Zoom Buttons (+ / −)</span>
          <span
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
              showZoomButtons
                ? 'bg-[#2C2820] border border-[#D4AF5A]/80 text-[#F6E7C1]'
                : 'bg-[#252932] border border-[#383B44] text-stone-400'
            }`}
          >
            {showZoomButtons ? 'On' : 'Off'}
          </span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSaveSlot('manual_1')}
            className="touch-target rounded-xl bg-slate-800 border border-slate-600 text-xs font-bold"
          >
            Save Slot 1
          </button>
          <button
            type="button"
            onClick={() => onSaveSlot('manual_2')}
            className="touch-target rounded-xl bg-slate-800 border border-slate-600 text-xs font-bold"
          >
            Save Slot 2
          </button>
          <button
            type="button"
            onClick={onExportJson}
            className="touch-target rounded-xl bg-slate-800 border border-slate-600 text-xs font-bold"
          >
            Export Save JSON
          </button>
          <button
            type="button"
            onClick={() => setShowImportBox((v) => !v)}
            className="touch-target rounded-xl bg-slate-800 border border-slate-600 text-xs font-bold"
          >
            Import Save JSON
          </button>
        </div>

        {showImportBox && (
          <div className="space-y-2 p-2.5 rounded-xl bg-slate-900 border border-slate-700">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={4}
              placeholder="Paste Marchlands Save JSON here..."
              className="w-full rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-slate-200"
            />
            <button
              type="button"
              onClick={() => {
                onImportJson(importText);
                setImportText('');
                setShowImportBox(false);
              }}
              className="touch-target w-full rounded-lg bg-amber-600 text-slate-950 text-xs font-bold"
            >
              Load Imported JSON
            </button>
          </div>
        )}

        {saveSlots.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase text-slate-400">Saved Chronicles</h3>
            {saveSlots.map((slot) => (
              <button
                key={slot.slotId}
                type="button"
                onClick={() => onLoadSlot(slot.slotId)}
                className="touch-target w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between text-xs"
              >
                <span>
                  <strong className="text-amber-200">{slot.slotId}</strong> •{' '}
                  {HOUSES[slot.houseId].name} (T{slot.turnNumber})
                </span>
                <span className="text-slate-400">{formatRelativeTime(slot.savedAtIso)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={onOpenPrimer}
            className="touch-target rounded-xl bg-slate-800 border border-slate-600 text-xs font-bold"
          >
            Field Guide
          </button>
          <button
            type="button"
            onClick={onReturnToTitle}
            className="touch-target rounded-xl bg-red-900/70 border border-red-600/60 text-xs font-bold text-red-100"
          >
            Title Screen
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 8. End-of-Campaign Victory / Defeat / Chronicle Score Breakdown Modal
// ----------------------------------------------------------------------------

export function GameOverModal({
  state,
  viewerHouseId,
  onReturnToTitle,
}: {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly onReturnToTitle: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (state.phase !== 'game_over') return null;

  const winnerId = state.winnerHouseId ?? viewerHouseId;
  const winnerHouse = HOUSES[winnerId];
  const viewerHouse = state.houses[viewerHouseId]!;
  const isVictory = winnerId === viewerHouseId && state.victoryType !== 'defeat';
  const supremacy = getSupremacyStats(state, winnerId);
  const cfg = getMapPresetConfig(state);
  const rankedHouseIds = rankHousesByScore(state, true);
  const rankings = rankedHouseIds.map((hid) => ({
    houseId: hid,
    score: computeScore(state, hid, true),
  }));

  let bannerTitle = 'THE MARCHLANDS KNEEL';
  let subtitle = `Conquest Victory — Turn ${state.turnNumber}`;
  let narrative = `Every rival banner has fallen before ${winnerHouse.name}. Your wardens look out over a pacified frontier united under one steel law.`;

  if (!isVictory || state.victoryType === 'defeat') {
    bannerTitle = 'YOUR BANNER FALLS';
    subtitle = `House Eliminated — Turn ${state.turnNumber}`;
    narrative =
      'The gates of your final stronghold have been breached. Yet every frontier campaign writes a new chronicle—muster your wardens and ride again.';
  } else if (state.victoryType === 'supremacy') {
    bannerTitle = 'SOVEREIGN OF THE FRONTIER';
    subtitle = `Territorial Supremacy — Turn ${state.turnNumber}`;
    narrative = `Controlling ${supremacy.ownedKeeps} of ${supremacy.totalKeeps} frontier Keeps (${supremacy.percent}%), ${winnerHouse.name} commands every river ford, iron ridge, and trade road.`;
  } else if (state.victoryType === 'mandate') {
    bannerTitle = 'WARDEN BY ROYAL MANDATE';
    subtitle = `Regent's Mandate Victory — Turn ${state.turnNumber}`;
    narrative = `Holding ${state.houses[winnerId]?.favor ?? 0} Royal Favor, ${supremacy.ownedKeeps} Keeps, and Grand Citadels for ${cfg.mandateHoldTurns} unyielding turns, ${winnerHouse.name} receives the Regent Council's seal.`;
  } else if (state.victoryType === 'score') {
    const topScore = rankings[0]?.score.total ?? 0;
    bannerTitle = 'CHRONICLE OF THE GRAND MARCH';
    subtitle = `Chronicle Victory — Turn ${state.turnNumber} (${topScore} pts)`;
    narrative = `When the chronicle closes on Turn ${state.chronicleLimit}, ${winnerHouse.name} stands foremost in the Regent's ledger—measured in land, stone, steel, and royal favor.`;
  }

  const handleCopySeed = async () => {
    try {
      await navigator.clipboard?.writeText(String(state.rngSeed));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 overflow-y-auto">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[#FAF7F0] text-[#1C1917] border-2 border-[#B45309] p-4 shadow-2xl space-y-3">
        <div className="text-center space-y-1">
          <div className="flex justify-center">
            <HouseSigilSvg houseId={winnerId} size={40} />
          </div>
          <h2 className="font-serif-march text-2xl font-bold text-[#1C1917]">{bannerTitle}</h2>
          <p className="text-xs font-bold uppercase text-[#B45309]">{subtitle}</p>
          <p className="text-xs text-stone-700 leading-relaxed">{narrative}</p>
        </div>

        {/* Chronicle Score Ranking Table */}
        <div className="rounded-xl bg-white border border-stone-300 p-2.5 space-y-1.5">
          <h3 className="text-xs font-bold uppercase text-[#B45309]">Realm Standings</h3>
          {rankings.map((r, idx) => (
            <div
              key={r.houseId}
              className="flex items-center justify-between text-xs py-1 border-b border-stone-100 last:border-b-0 tabular-nums"
            >
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-stone-500">#{idx + 1}</span>
                <HouseSigilSvg houseId={r.houseId} size={18} />
                <span className="font-semibold">{HOUSES[r.houseId].name}</span>
              </div>
              <span className="font-bold text-[#1C1917]">{r.score.total} pts</span>
            </div>
          ))}
        </div>

        {/* Post-Match Chronicle Ledger */}
        <div className="rounded-xl bg-stone-100 border border-stone-300 p-2.5 text-xs space-y-1 tabular-nums">
          <div className="flex justify-between">
            <span className="text-stone-600">Ruling House:</span>
            <span className="font-bold">{HOUSES[viewerHouseId].name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-600">Scale, Mode &amp; Difficulty:</span>
            <span className="font-bold capitalize">
              {state.gridSize}×{state.gridSize} • {state.mode} • {state.difficulty}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-600">Doctrines Enacted:</span>
            <span className="font-bold">
              {viewerHouse.decreeIds.length} / {DECREE_PAIR_IDS.length} Pairs
            </span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-stone-600">Map Seed: {state.rngSeed}</span>
            <button
              type="button"
              onClick={handleCopySeed}
              className="touch-target px-2.5 rounded-lg bg-stone-200 text-stone-900 font-bold text-xs"
            >
              {copied ? 'Copied!' : 'Copy Seed'}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onReturnToTitle}
          className="touch-target w-full rounded-xl bg-[#B45309] text-white text-sm font-bold"
        >
          Return to Title Screen
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 9. Relic Ruin Discovery Modal (Aged Vellum Lore & Reward Card)
// ----------------------------------------------------------------------------

export function RelicDiscoveryModal({
  ruin,
  onClose,
}: {
  readonly ruin: DiscoveredRuinBanner;
  readonly onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3">
      <div className="w-full max-w-md rounded-2xl surface-vellum text-[#1C1917] border-2 border-[#B45309] p-4 shadow-2xl space-y-3">
        <div>
          <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-[#B45309] text-[10px] font-bold uppercase tracking-wide">
            Relic Ruin Discovered
          </span>
          <h2 className="font-serif-march text-xl font-bold mt-1">{ruin.title}</h2>
          <p className="text-xs italic text-stone-700 leading-relaxed mt-1.5">{ruin.vignette}</p>
        </div>

        <div className="p-2.5 rounded-xl bg-amber-100/80 border border-amber-400/70 text-xs font-bold text-amber-950">
          Reward Claimed: {ruin.rewardSummary}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="touch-target w-full rounded-xl bg-[#1C1917] text-[#FAF7F0] text-sm font-bold active:bg-stone-800"
        >
          Claim &amp; Continue
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 10. Realm Ledger & 8-Pair Doctrine Codex Drawer (4-Tab Strategic Command View)
// ----------------------------------------------------------------------------

type LedgerTab = 'standings' | 'decrees' | 'forces' | 'chronicle';

export function RealmLedgerDrawer({
  state,
  viewerHouseId,
  onPanToTile,
  onClose,
}: {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly onPanToTile: (tileKey: CoordKey) => void;
  readonly onClose: () => void;
}) {
  const [tab, setTab] = useState<LedgerTab>('standings');
  const house = state.houses[viewerHouseId]!;
  const houseDef = HOUSES[viewerHouseId];
  const commander = state.commanders[viewerHouseId];
  const season = getSeason(state.turnNumber);
  const seasonDef = SEASONS[season];
  const rankedHouseIds = rankHousesByScore(state, false);
  const ownKeeps = getHouseKeeps(state, viewerHouseId);
  const ownOutposts = getHouseOutposts(state, viewerHouseId);
  const ownUnits = getHouseUnits(state, viewerHouseId);
  const fog = state.fog[viewerHouseId] ?? {};

  const activeEffects = state.activeEffects.filter(
    (e) =>
      e.expiresAfterTurn >= state.turnNumber &&
      (e.houseId === null || e.houseId === viewerHouseId),
  );

  const visibleChronicle = [...state.chronicle]
    .filter(
      (e) =>
        e.isPublic ||
        e.actorHouseId === viewerHouseId ||
        e.targetHouseId === viewerHouseId ||
        (e.tileKey !== null && fog[e.tileKey] === 'visible'),
    )
    .reverse()
    .slice(0, 40);

  const coinPct = Math.min(
    100,
    Math.round((house.lifetimeCoinEarned / Math.max(1, house.nextCoinMilestone)) * 100),
  );

  const tabs: Array<{ id: LedgerTab; label: string }> = [
    { id: 'standings', label: 'Realm' },
    { id: 'decrees', label: `Doctrines (${house.decreeIds.length}/8)` },
    { id: 'forces', label: `Forces (${ownUnits.length})` },
    { id: 'chronicle', label: 'Chronicle' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center">
      <div className="w-full max-w-md max-h-[86vh] flex flex-col rounded-t-2xl surface-iron border-t-2 border-sky-500/60 safe-bottom text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-3.5 pb-2 border-b border-slate-700/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <HouseSigilSvg houseId={viewerHouseId} size={28} />
            <div className="min-w-0">
              <h2 className="font-serif-march text-base font-bold text-[#FAF7F0] truncate">
                {houseDef.name} — Realm Ledger
              </h2>
              <p className="text-[11px] text-amber-200/85 truncate">{houseDef.epithet}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target px-3 rounded-xl bg-slate-800 border border-slate-600 text-xs font-bold shrink-0"
          >
            Close
          </button>
        </div>

        {/* 4 Tabs */}
        <div className="px-3 pt-2 pb-1.5 grid grid-cols-4 gap-1.5 border-b border-slate-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`touch-target min-h-[44px] rounded-xl text-[11px] font-bold transition ${
                tab === t.id
                  ? 'bg-sky-600 text-white shadow'
                  : 'bg-slate-900/80 border border-slate-700 text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {tab === 'standings' && (
            <>
              {/* Coin Milestone Progress -> Next Doctrine Pair Draft */}
              <div className="p-3 rounded-xl bg-slate-950/75 border border-amber-500/35 space-y-1.5">
                <div className="flex items-center justify-between text-xs tabular-nums">
                  <span className="font-bold text-amber-200">Next Coin Milestone Draft</span>
                  <span className="font-bold text-yellow-300">
                    {house.lifetimeCoinEarned} / {house.nextCoinMilestone} Coin
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full"
                    style={{ width: `${coinPct}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Earn {Math.max(0, house.nextCoinMilestone - house.lifetimeCoinEarned)} more gross
                  Coin to trigger an Exclusive Doctrine Pair Draft.
                </p>
              </div>

              {/* Season & Active Frontier Effects */}
              <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-700 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
                  <SeasonIconSvg season={season} size={15} />
                  <span>
                    {seasonDef.name} — {seasonDef.subtitle}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-snug">
                  River crossing: {seasonDef.riverMoveCost} MP • Farm delta:{' '}
                  {seasonDef.farmFoodDelta >= 0 ? `+${seasonDef.farmFoodDelta}` : seasonDef.farmFoodDelta}{' '}
                  Food • Sight delta: {seasonDef.unitSightDelta} • Move delta:{' '}
                  {seasonDef.unitMovementDelta}
                  {seasonDef.winterAttritionDamage > 0
                    ? ` • Winter Attrition: −${seasonDef.winterAttritionDamage} HP outside provisioned borders`
                    : ''}
                </p>
                {activeEffects.length > 0 && (
                  <div className="pt-1 space-y-1">
                    {activeEffects.map((e) => (
                      <div
                        key={e.id}
                        className="p-2 rounded-lg bg-indigo-950/70 border border-indigo-500/45 text-[11px]"
                      >
                        <strong className="text-indigo-200">
                          {FRONTIER_EVENTS[e.effectId].title}
                        </strong>{' '}
                        <span className="text-slate-300">
                          ({Math.max(1, e.expiresAfterTurn - state.turnNumber + 1)}t left) —{' '}
                          {FRONTIER_EVENTS[e.effectId].effectText}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Live Noble House Leaderboard */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-amber-300">
                  Noble House Standings
                </h3>
                {rankedHouseIds.map((hid, idx) => {
                  const h = state.houses[hid]!;
                  const sc = computeScore(state, hid, false);
                  const sup = getSupremacyStats(state, hid);
                  const isViewer = hid === viewerHouseId;
                  return (
                    <div
                      key={hid}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs tabular-nums ${
                        isViewer
                          ? 'bg-sky-950/55 border-sky-400/60'
                          : 'bg-slate-900/80 border-slate-700/80'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-slate-400 w-5">#{idx + 1}</span>
                        <HouseSigilSvg houseId={hid} size={22} />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-100 truncate">
                            {HOUSES[hid].name}
                            {isViewer ? ' (You)' : ''}
                            {h.isEliminated ? ' • Fallen' : ''}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {sup.ownedKeeps} {sup.ownedKeeps === 1 ? 'Keep' : 'Keeps'} • {h.decreeIds.length}{' '}
                            {h.decreeIds.length === 1 ? 'Doctrine' : 'Doctrines'} • {h.favor} Favor
                          </div>
                        </div>
                      </div>
                      <span className="font-bold text-amber-200 shrink-0">{sc.total} pt</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'decrees' && (
            <>
              {/* House Passive Card */}
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/45 space-y-1">
                <div className="text-[10px] font-bold uppercase text-amber-300">House Passive</div>
                <div className="font-serif-march text-sm font-bold text-amber-100">
                  {houseDef.passiveName}
                </div>
                <p className="text-xs text-slate-200 leading-snug">{houseDef.passiveDescription}</p>
              </div>

              {/* 8 Mutually Exclusive Doctrine Pairs Codex */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-amber-300">
                  8 Mutually Exclusive Doctrine Pairs
                </h3>
                {DECREE_PAIR_IDS.map((pairId) => {
                  const pair = DECREE_PAIRS[pairId];
                  return (
                    <div
                      key={pairId}
                      className="p-2.5 rounded-xl bg-slate-950/75 border border-slate-800 space-y-1.5"
                    >
                      <div className="text-[11px] font-bold uppercase tracking-wide text-amber-300">
                        {pair.theme}
                      </div>
                      <div className="space-y-1.5">
                        {pair.options.map((did) => {
                          const d = DECREES[did];
                          const isEnacted = house.decreeIds.includes(did);
                          const isLocked = house.lockedDecreeIds.includes(did);
                          return (
                            <div
                              key={did}
                              className={`p-2 rounded-lg border space-y-0.5 ${
                                isEnacted
                                  ? 'bg-emerald-950/50 border-emerald-500/60'
                                  : isLocked
                                    ? 'bg-red-950/25 border-red-900/40 opacity-60'
                                    : 'bg-slate-900/75 border-slate-800'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`text-xs font-bold ${
                                    isEnacted
                                      ? 'text-emerald-200'
                                      : isLocked
                                        ? 'text-red-300 line-through'
                                        : 'text-slate-200'
                                  }`}
                                >
                                  {d.title}
                                </span>
                                <span
                                  className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                    isEnacted
                                      ? 'bg-emerald-800 text-emerald-100'
                                      : isLocked
                                        ? 'bg-red-900/70 text-red-200'
                                        : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {isEnacted ? 'ENACTED' : isLocked ? 'LOCKED' : 'AVAILABLE'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-300">{d.effectText}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'forces' && (
            <>
              {/* House Lord-Commander Status Card */}
              {commander && (
                <div className="p-3 rounded-xl bg-amber-950/35 border border-amber-500/50 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase text-amber-300">
                        House Lord-Commander • Level {commander.level} (
                        {commander.level === 1
                          ? `${commander.xp}/${COMMANDER_LEVEL2_XP} XP`
                          : commander.level === 2
                            ? `${commander.xp}/${COMMANDER_LEVEL3_XP} XP`
                            : 'Max Level'}
                        )
                      </div>
                      <div className="font-serif-march text-sm font-bold text-amber-100">
                        {houseDef.commanderName}
                      </div>
                    </div>
                    {commander.unitId && state.units[commander.unitId] ? (
                      <button
                        type="button"
                        onClick={() => {
                          onPanToTile(state.units[commander.unitId!]!.tileKey);
                          onClose();
                        }}
                        className="touch-target min-h-[44px] px-3 py-1.5 rounded-lg bg-amber-600 text-slate-950 text-xs font-bold"
                      >
                        Locate →
                      </button>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-red-900/80 text-red-200 text-[10px] font-bold">
                        Wounded ({commander.woundedTurnsRemaining}t)
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-300">
                    <strong>{houseDef.commanderSkillName}:</strong> {houseDef.commanderSkillDesc}
                  </div>
                  {commander.traits.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {commander.traits.map((tid) => (
                        <span
                          key={tid}
                          className="px-1.5 py-0.5 rounded bg-sky-900/75 text-sky-200 text-[10px] font-bold"
                        >
                          ♛ {COMMANDER_TRAITS[tid].title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Own Keeps */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-amber-300">
                  Your Strongholds ({ownKeeps.length})
                </h3>
                {ownKeeps.map((k) => {
                  const info = getKeepInspectInfo(state, viewerHouseId, k.id);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => {
                        onPanToTile(k.tileKey);
                        onClose();
                      }}
                      className="touch-target w-full p-2.5 rounded-xl bg-slate-900/85 border border-slate-700 text-left active:bg-slate-800 space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs tabular-nums">
                        <span className="font-serif-march font-bold text-amber-200">
                          {k.name} • Tier {k.tier}
                          {k.specialization !== 'none'
                            ? ` (${KEEP_SPECIALIZATIONS[k.specialization].name})`
                            : ''}
                          {k.citadelCharter !== 'none'
                            ? ` • ${CITADEL_CHARTERS[k.citadelCharter].name}`
                            : ''}
                        </span>
                        <span className="text-slate-300">
                          HP {k.keepHp}/{k.maxKeepHp}
                        </span>
                      </div>
                      {info && (
                        <div className="flex items-center justify-between text-[11px] text-slate-300 tabular-nums">
                          <span>
                            Food {k.foodProgress}/{info.foodThreshold} (+{info.keepYield.food}/t) •
                            Cap {info.usedCap}/{info.maxCap}
                          </span>
                          <span className="text-sky-300 font-semibold">Locate →</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Own Frontier Outposts */}
              {ownOutposts.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-300">
                    Frontier Outposts ({ownOutposts.length})
                  </h3>
                  {ownOutposts.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        onPanToTile(o.tileKey);
                        onClose();
                      }}
                      className="touch-target w-full p-2.5 rounded-xl bg-slate-900/85 border border-slate-700 text-left flex items-center justify-between text-xs tabular-nums active:bg-slate-800"
                    >
                      <span className="font-bold text-emerald-200">
                        {o.name} (HP {o.hp}/{o.maxHp})
                      </span>
                      <span className="text-sky-300 font-semibold text-[11px]">Locate →</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Own Units */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-sky-300">
                  Active Troops ({ownUnits.length})
                </h3>
                {ownUnits.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No troops deployed. Tap your Keep on the map to muster Militia, Spearmen, or
                    your signature House unit.
                  </p>
                ) : (
                  ownUnits.map((u) => {
                    const def = UNITS[u.typeId];
                    const rank = getUnitRankLabel(u.xp ?? 0);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          onPanToTile(u.tileKey);
                          onClose();
                        }}
                        className="touch-target w-full p-2.5 rounded-xl bg-slate-900/85 border border-slate-700 text-left flex items-center justify-between gap-2 text-xs tabular-nums active:bg-slate-800"
                      >
                        <div>
                          <div className="font-bold text-slate-100">
                            {u.isCommander ? houseDef.commanderName : def.name}{' '}
                            <span className="text-[10px] font-semibold text-amber-300">
                              ({u.isCommander ? `Marshal Lv${commander?.level ?? 1}` : rank.title})
                            </span>
                            {u.isFortified && (
                              <span className="ml-1 text-[10px] text-emerald-400">• Fortified</span>
                            )}
                            {u.isOverwatch && (
                              <span className="ml-1 text-[10px] text-sky-400">• Overwatch</span>
                            )}
                            {u.isDeployed && (
                              <span className="ml-1 text-[10px] text-amber-400">• Deployed</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            HP {u.hp}/{u.maxHp} • ATK {def.attack} • DEF {def.defense}
                            {u.battleHonors.length > 0
                              ? ` • ${u.battleHonors.map((h) => BATTLE_HONORS[h].title).join(', ')}`
                              : ''}
                            {u.homeKeepId === 'orphaned' ? ' • Supply-Severed' : ''}
                          </div>
                        </div>
                        <span className="text-sky-300 font-semibold text-[11px] shrink-0">
                          Locate →
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          {tab === 'chronicle' && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-amber-300">
                Frontier Chronicle (Latest 40)
              </h3>
              {visibleChronicle.length === 0 ? (
                <p className="text-xs text-slate-400">Your campaign chronicle begins now.</p>
              ) : (
                visibleChronicle.map((ev) =>
                  ev.tileKey ? (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => {
                        onPanToTile(ev.tileKey!);
                        onClose();
                      }}
                      className="touch-target w-full text-left p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-200 active:bg-slate-800"
                    >
                      <span className="text-amber-400 font-bold mr-1.5">T{ev.turnNumber}</span>
                      <span>{ev.summary}</span>
                    </button>
                  ) : (
                    <div
                      key={ev.id}
                      className="p-2 rounded-xl bg-slate-900/50 border border-slate-800/70 text-xs text-slate-300"
                    >
                      <span className="text-amber-400 font-bold mr-1.5">T{ev.turnNumber}</span>
                      <span>{ev.summary}</span>
                    </div>
                  ),
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
