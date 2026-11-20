/**
 * Marchlands (Spec v0.3) — Mobile-First Title & New Campaign Setup Screen
 *
 * Designed for 375x812 portrait viewports with zero horizontal overflow,
 * >= 44x44 touch targets, Resume Autosave card, all 5 Houses with inline SVG
 * heraldry, interactive Signature Unit & Unique Improvement inspection sheets,
 * unified refined setup toggles, and Save JSON Import.
 */

import { useState } from 'react';
import type { Difficulty, GameMode, HouseId, ImprovementId, UnitId } from '../types/game.ts';
import { HOUSES, HOUSE_IDS, IMPROVEMENTS, TERRAINS, UNITS } from '../data/index.ts';
import type { SaveRecord } from '../storage/persistence.ts';
import {
  HouseSigilSvg,
  ImprovementGlyphSvg,
  ResourceIconSvg,
  UnitFigureSvg,
} from './svg/HeraldrySvg.tsx';
import { formatRelativeTime } from './uiTypes.ts';

interface TitleScreenProps {
  readonly autosave: SaveRecord | null;
  readonly onResumeAutosave: () => void;
  readonly onStartNewCampaign: (opts: {
    houseId: HouseId;
    mode: GameMode;
    difficulty: Difficulty;
    houseCount: 4 | 5;
    seed: number;
  }) => void;
  readonly onImportSaveJson: (jsonText: string) => void;
  readonly onOpenPrimer: () => void;
}

type InspectTarget =
  | { readonly kind: 'unit'; readonly houseId: HouseId; readonly unitId: UnitId }
  | { readonly kind: 'improvement'; readonly houseId: HouseId; readonly improvementId: ImprovementId };

const TOGGLE_ACTIVE =
  'bg-[#2C2820] border-[#D4AF5A]/85 text-[#F6E7C1] shadow-sm';
const TOGGLE_INACTIVE =
  'bg-[#16181D]/85 border-[#383B44] text-stone-300 hover:border-stone-500';

export function TitleScreen({
  autosave,
  onResumeAutosave,
  onStartNewCampaign,
  onImportSaveJson,
  onOpenPrimer,
}: TitleScreenProps) {
  const [selectedHouse, setSelectedHouse] = useState<HouseId>('vane');
  const [mode, setMode] = useState<GameMode>('dominion');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [houseCount, setHouseCount] = useState<4 | 5>(4);
  const [seedInput, setSeedInput] = useState<string>('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [inspectTarget, setInspectTarget] = useState<InspectTarget | null>(null);

  const handleLaunch = () => {
    const parsed = Number.parseInt(seedInput.trim(), 10);
    const seed = Number.isFinite(parsed) && parsed > 0 ? parsed : (Date.now() % 899_999) + 100_000;
    onStartNewCampaign({
      houseId: selectedHouse,
      mode,
      difficulty,
      houseCount,
      seed,
    });
  };

  const autosaveKeeps = autosave
    ? Object.values(autosave.state.keeps).filter(
        (k) => k.ownerHouseId === autosave.metadata.houseId,
      ).length
    : 0;

  return (
    <main className="min-h-full w-full bg-[radial-gradient(ellipse_at_top,_#252932_0%,_#16181D_62%,_#13151A_100%)] text-stone-100 safe-top safe-bottom px-3 py-4 overflow-y-auto overflow-x-hidden">
      <div className="mx-auto w-full max-w-md space-y-4">
        {/* Regal Title Crest Banner */}
        <header className="text-center space-y-1.5 pt-2">
          <div className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full bg-[#242019]/90 border border-[#D4AF5A]/35">
            <ResourceIconSvg kind="crown" size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#E8C97E]">
              Frontier Strategy Chronicle
            </span>
          </div>
          <h1 className="font-serif-march text-3xl font-bold tracking-wider text-[#FAF7F0] drop-shadow">
            MARCHLANDS
          </h1>
          <div className="mx-auto h-px w-36 bg-gradient-to-r from-transparent via-[#D4AF5A]/60 to-transparent" />
          <p className="text-xs text-stone-300">
            Spatial keeps, tactical squads, Royal Decrees &amp; seasonal frontier war.
          </p>
        </header>

        {/* Resume Autosave Card */}
        {autosave && (
          <button
            type="button"
            onClick={onResumeAutosave}
            className="touch-target w-full text-left p-3.5 rounded-2xl surface-vellum text-[#1C1917] border-2 border-[#B45309] active:scale-[0.99] transition flex items-center gap-3"
          >
            <HouseSigilSvg houseId={autosave.metadata.houseId} size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#B45309]">
                Continue Campaign
              </div>
              <div className="font-serif-march text-sm font-bold text-[#1C1917] truncate">
                {HOUSES[autosave.metadata.houseId].name}
              </div>
              <div className="text-xs text-stone-700 tabular-nums">
                Turn {autosave.metadata.turnNumber} •{' '}
                <span className="capitalize">{autosave.metadata.mode}</span> • {autosaveKeeps}{' '}
                {autosaveKeeps === 1 ? 'Keep' : 'Keeps'} •{' '}
                {formatRelativeTime(autosave.metadata.savedAtIso)}
              </div>
            </div>
          </button>
        )}

        {/* New Campaign Setup Card */}
        <section className="rounded-2xl surface-iron border border-[#383B44] p-3.5 space-y-3.5">
          <div>
            <h2 className="font-serif-march text-base font-bold text-[#F3E2B3]">
              New Frontier Campaign
            </h2>
            <p className="text-[11px] text-stone-400 mt-0.5 leading-snug">
              Select your Noble House, campaign mode, AI strength, and frontier size.
            </p>
          </div>

          {/* 5 Noble Houses */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wide text-stone-300">
              Noble House
            </label>
            <div className="space-y-2">
              {HOUSE_IDS.map((hid) => {
                const h = HOUSES[hid];
                const active = selectedHouse === hid;
                const houseAccent = hid === 'solis' ? '#E4C56F' : h.colors.primary;
                return (
                  <div
                    key={hid}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    onClick={() => setSelectedHouse(hid)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedHouse(hid);
                      }
                    }}
                    style={
                      active
                        ? {
                            borderColor: houseAccent,
                            boxShadow: `0 0 0 1px ${houseAccent}55, 0 6px 16px rgba(0,0,0,0.35)`,
                          }
                        : undefined
                    }
                    className={`touch-target w-full text-left p-2.5 rounded-xl border flex items-start gap-2.5 transition relative overflow-hidden cursor-pointer select-none ${
                      active
                        ? 'bg-[#252932]'
                        : 'bg-[#16181D]/80 border-[#383B44] hover:border-stone-500'
                    }`}
                  >
                    {/* Heraldic Banner Stripe — blends cleanly into matching faction border when selected */}
                    <span
                      className={`absolute left-0 top-0 bottom-0 transition-all ${
                        active ? 'w-1.5' : 'w-1 opacity-85'
                      }`}
                      style={{ backgroundColor: houseAccent }}
                    />
                    <div className="pl-1.5 pt-0.5">
                      <HouseSigilSvg houseId={hid} size={30} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-serif-march text-sm font-bold text-[#FAF7F0]">
                          {h.name}
                        </span>
                        <span className="text-[10px] font-semibold text-[#D4AF5A]">
                          {h.epithet}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-300 leading-snug mt-0.5">
                        <strong className="text-stone-100">{h.passiveName}:</strong>{' '}
                        {h.passiveDescription}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectTarget({
                              kind: 'unit',
                              houseId: hid,
                              unitId: h.signatureUnitId,
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#16181D] border border-[#383B44] hover:border-sky-400/70 active:bg-[#252932] text-[10px] font-semibold text-sky-300 transition"
                          aria-label={`Inspect ${UNITS[h.signatureUnitId].name} stats`}
                        >
                          <span>Unit: {UNITS[h.signatureUnitId].name}</span>
                          <span className="text-sky-400/80 text-[10px]" aria-hidden="true">
                            ⓘ
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectTarget({
                              kind: 'improvement',
                              houseId: hid,
                              improvementId: h.uniqueImprovementId,
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#16181D] border border-[#383B44] hover:border-emerald-400/70 active:bg-[#252932] text-[10px] font-semibold text-emerald-300 transition"
                          aria-label={`Inspect ${IMPROVEMENTS[h.uniqueImprovementId].name} details`}
                        >
                          <span>Unique: {IMPROVEMENTS[h.uniqueImprovementId].name}</span>
                          <span className="text-emerald-400/80 text-[10px]" aria-hidden="true">
                            ⓘ
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mode Toggle — Unified Refined Active Style */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wide text-stone-300">
              Campaign Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['dominion', 'chronicle'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`touch-target rounded-xl border text-xs font-bold transition ${
                    mode === m ? TOGGLE_ACTIVE : TOGGLE_INACTIVE
                  }`}
                >
                  {m === 'dominion' ? 'Dominion' : '33-Turn Chronicle'}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty & House Count — Unified Refined Active Style */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wide text-stone-300">
                Difficulty
              </label>
              <div className="grid grid-cols-3 gap-1">
                {(['easy', 'normal', 'hard'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    aria-pressed={difficulty === d}
                    className={`min-h-[44px] rounded-xl border text-[11px] font-bold capitalize transition ${
                      difficulty === d ? TOGGLE_ACTIVE : TOGGLE_INACTIVE
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wide text-stone-300">
                Houses
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {([4, 5] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setHouseCount(n)}
                    aria-pressed={houseCount === n}
                    className={`min-h-[44px] rounded-xl border text-xs font-bold transition ${
                      houseCount === n ? TOGGLE_ACTIVE : TOGGLE_INACTIVE
                    }`}
                  >
                    {n} Houses
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Optional Map Seed */}
          <div className="space-y-1">
            <label
              htmlFor="seed-input"
              className="block text-xs font-bold uppercase tracking-wide text-stone-300"
            >
              Optional Map Seed
            </label>
            <input
              id="seed-input"
              type="text"
              inputMode="numeric"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              placeholder="Random seeded frontier"
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#16181D] border border-[#383B44] text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-[#D4AF5A]/80"
            />
          </div>

          {/* Primary CTA: Bright Amber/Gold reserved exclusively for primary actions */}
          <button
            type="button"
            onClick={handleLaunch}
            className="touch-target w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 active:from-amber-500 active:to-amber-700 text-[#16181D] font-serif-march text-base font-bold shadow-lg"
          >
            Begin Campaign
          </button>
        </section>

        {/* Footer Actions: Import JSON & Field Guide */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className="touch-target rounded-xl bg-[#1E2128] border border-[#383B44] text-xs font-bold text-stone-200 active:bg-[#252932]"
          >
            Import Save JSON
          </button>
          <button
            type="button"
            onClick={onOpenPrimer}
            className="touch-target rounded-xl bg-[#1E2128] border border-[#383B44] text-xs font-bold text-stone-200 active:bg-[#252932]"
          >
            Field Guide
          </button>
        </div>

        {showImport && (
          <div className="p-3 rounded-2xl surface-iron border border-[#383B44] space-y-2">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={4}
              placeholder="Paste exported Marchlands Save JSON..."
              className="w-full rounded-lg bg-[#16181D] border border-[#383B44] p-2 text-xs text-stone-200"
            />
            <button
              type="button"
              onClick={() => {
                onImportSaveJson(importText);
                setImportText('');
                setShowImport(false);
              }}
              className="touch-target w-full rounded-xl bg-amber-500 text-[#16181D] text-xs font-bold"
            >
              Load Save JSON
            </button>
          </div>
        )}
      </div>

      {/* Live Inspection Bottom Sheet for Signature Unit / Unique Improvement Pills */}
      {inspectTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-end justify-center p-2"
          onClick={() => setInspectTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl bg-[#1E2128] border border-[#383B44] p-4 safe-bottom shadow-2xl space-y-3 text-stone-100"
            onClick={(e) => e.stopPropagation()}
          >
            {inspectTarget.kind === 'unit' ? (() => {
              const u = UNITS[inspectTarget.unitId];
              const h = HOUSES[inspectTarget.houseId];
              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-[#EAE3D2]/95 border border-[#C7BEA8]/70 shadow-inner flex items-center justify-center shrink-0">
                        <svg width="40" height="40" viewBox="0 0 36 36" aria-hidden="true">
                          <UnitFigureSvg unitId={u.id} houseId={h.id} />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF5A]">
                          {h.name} • Signature Unit
                        </div>
                        <h3 className="font-serif-march text-base font-bold text-[#FAF7F0] truncate">
                          {u.name}
                        </h3>
                        <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-[#16181D] border border-[#383B44] text-[10px] font-bold uppercase text-sky-300">
                          {u.unitClass}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectTarget(null)}
                      className="touch-target px-3 rounded-xl bg-[#252932] border border-[#383B44] text-xs font-bold text-stone-200 shrink-0"
                    >
                      Close
                    </button>
                  </div>

                  {/* Live Unit Stats Grid */}
                  <div className="grid grid-cols-3 gap-1.5 text-center tabular-nums">
                    <div className="p-2 rounded-xl bg-[#16181D] border border-[#383B44]">
                      <div className="text-[9px] uppercase font-bold text-stone-400">HP</div>
                      <div className="text-sm font-bold text-emerald-400">{u.maxHp}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[#16181D] border border-[#383B44]">
                      <div className="text-[9px] uppercase font-bold text-stone-400">Attack</div>
                      <div className="text-sm font-bold text-amber-300">
                        {u.structureAttack ? `${u.attack} (${u.structureAttack})` : u.attack}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-[#16181D] border border-[#383B44]">
                      <div className="text-[9px] uppercase font-bold text-stone-400">Defense</div>
                      <div className="text-sm font-bold text-sky-300">{u.defense}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[#16181D] border border-[#383B44]">
                      <div className="text-[9px] uppercase font-bold text-stone-400">Move</div>
                      <div className="text-sm font-bold text-stone-100">{u.movement}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[#16181D] border border-[#383B44]">
                      <div className="text-[9px] uppercase font-bold text-stone-400">Range</div>
                      <div className="text-sm font-bold text-stone-100">{u.range}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-[#16181D] border border-[#383B44]">
                      <div className="text-[9px] uppercase font-bold text-stone-400">Sight</div>
                      <div className="text-sm font-bold text-stone-100">{u.sight}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                    <span className="px-2.5 py-1 rounded-lg bg-[#16181D] border border-[#383B44] font-semibold text-amber-300">
                      Cost: {u.matCost} Materials
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#16181D] border border-[#383B44] font-semibold text-yellow-300">
                      Upkeep: {u.coinUpkeep > 0 ? `${u.coinUpkeep} Coin/turn` : 'Free'}
                    </span>
                    {u.requiresSmithyCombo && (
                      <span className="px-2.5 py-1 rounded-lg bg-[#2C2820] border border-[#D4AF5A]/50 font-semibold text-[#F6E7C1] text-[11px]">
                        Requires Smithy + Iron Mine + Mill
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-stone-300 leading-relaxed bg-[#16181D]/80 rounded-xl p-2.5 border border-[#383B44]">
                    {u.flavor}
                  </p>
                </>
              );
            })() : (() => {
              const imp = IMPROVEMENTS[inspectTarget.improvementId];
              const h = HOUSES[inspectTarget.houseId];
              const yields: string[] = [];
              if (imp.baseFood > 0) yields.push(`+${imp.baseFood} Food`);
              if (imp.baseMaterials > 0) yields.push(`+${imp.baseMaterials} Mat`);
              if (imp.baseCoin > 0) yields.push(`+${imp.baseCoin} Coin`);
              const terrainsLabel = imp.validTerrains.map((t) => TERRAINS[t].name).join(', ');
              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-[#EAE3D2]/95 border border-[#C7BEA8]/70 shadow-inner flex items-center justify-center shrink-0">
                        <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
                          <ImprovementGlyphSvg id={imp.id} />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                          {h.name} • Unique Improvement
                        </div>
                        <h3 className="font-serif-march text-base font-bold text-[#FAF7F0] truncate">
                          {imp.name}
                        </h3>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectTarget(null)}
                      className="touch-target px-3 rounded-xl bg-[#252932] border border-[#383B44] text-xs font-bold text-stone-200 shrink-0"
                    >
                      Close
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-xs tabular-nums">
                    <span className="px-2.5 py-1 rounded-lg bg-[#16181D] border border-[#383B44] font-semibold text-amber-300">
                      Cost: {imp.matCost} Materials
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#16181D] border border-[#383B44] font-semibold text-stone-200">
                      Terrain: {terrainsLabel}
                    </span>
                    {yields.length > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-[#16181D] border border-[#383B44] font-semibold text-emerald-300">
                        Base: {yields.join(' • ')}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-stone-300 leading-relaxed bg-[#16181D]/80 rounded-xl p-2.5 border border-[#383B44]">
                    {imp.description}
                  </p>

                  <div className="text-[11px] text-stone-400">
                    On capture:{' '}
                    <span className="text-stone-200 font-semibold">
                      {imp.convertsToOnCapture
                        ? `Converts to ${IMPROVEMENTS[imp.convertsToOnCapture].name}`
                        : 'Destroyed'}
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </main>
  );
}
