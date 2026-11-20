/**
 * Marchlands (Spec v0.3) — Mobile-First Title & New Campaign Setup Screen
 *
 * Designed for 375x812 portrait viewports with zero horizontal overflow,
 * >= 44x44 touch targets, Resume Autosave card, all 5 Houses with inline SVG
 * heraldry, unique unit/building tags, Mode/Difficulty/House Count/Seed controls,
 * and Save JSON Import.
 */

import { useState } from 'react';
import type { Difficulty, GameMode, HouseId } from '../types/game.ts';
import { HOUSES, HOUSE_IDS, IMPROVEMENTS, UNITS } from '../data/index.ts';
import type { SaveRecord } from '../storage/persistence.ts';
import { HouseSigilSvg, ResourceIconSvg } from './svg/HeraldrySvg.tsx';
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
    <main className="min-h-full w-full bg-[radial-gradient(ellipse_at_top,_#1e293b_0%,_#0b1120_65%)] text-slate-100 safe-top safe-bottom px-3 py-4 overflow-y-auto overflow-x-hidden">
      <div className="mx-auto w-full max-w-md space-y-4">
        {/* Regal Title Crest Banner */}
        <header className="text-center space-y-1.5 pt-2">
          <div className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full bg-amber-950/60 border border-amber-500/40">
            <ResourceIconSvg kind="crown" size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-200">
              Frontier Strategy Chronicle
            </span>
          </div>
          <h1 className="font-serif-march text-3xl font-bold tracking-wider text-[#FAF7F0] drop-shadow">
            MARCHLANDS
          </h1>
          <div className="mx-auto h-px w-36 bg-gradient-to-r from-transparent via-amber-500/70 to-transparent" />
          <p className="text-xs text-slate-300">
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
                <span className="capitalize">{autosave.metadata.mode}</span> • {autosaveKeeps} Keeps
                • {formatRelativeTime(autosave.metadata.savedAtIso)}
              </div>
            </div>
          </button>
        )}

        {/* New Campaign Setup Card */}
        <section className="rounded-2xl surface-iron border border-amber-500/25 p-3.5 space-y-3.5">
          <div>
            <h2 className="font-serif-march text-base font-bold text-amber-200">
              New Frontier Campaign
            </h2>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
              Select your Noble House, campaign mode, AI strength, and frontier size.
            </p>
          </div>

          {/* 5 Noble Houses */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-300">
              Noble House
            </label>
            <div className="space-y-2">
              {HOUSE_IDS.map((hid) => {
                const h = HOUSES[hid];
                const active = selectedHouse === hid;
                return (
                  <button
                    key={hid}
                    type="button"
                    onClick={() => setSelectedHouse(hid)}
                    className={`touch-target w-full text-left p-2.5 rounded-xl border flex items-start gap-2.5 transition relative overflow-hidden ${
                      active
                        ? 'bg-slate-800/95 border-amber-400 ring-1 ring-amber-400/70 shadow-md'
                        : 'bg-slate-950/65 border-slate-700/80 hover:border-slate-500'
                    }`}
                  >
                    {/* Heraldic Banner Stripe */}
                    <span
                      className="absolute left-0 top-0 bottom-0 w-1"
                      style={{ backgroundColor: h.colors.primary }}
                    />
                    <div className="pl-1 pt-0.5">
                      <HouseSigilSvg houseId={hid} size={30} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-serif-march text-sm font-bold text-white">
                          {h.name}
                        </span>
                        <span className="text-[10px] font-semibold text-amber-300">
                          {h.epithet}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug mt-0.5">
                        <strong className="text-slate-100">{h.passiveName}:</strong>{' '}
                        {h.passiveDescription}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[9px] font-bold text-sky-300">
                          Unit: {UNITS[h.signatureUnitId].name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[9px] font-bold text-emerald-300">
                          Unique: {IMPROVEMENTS[h.uniqueImprovementId].name}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-300">
              Campaign Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['dominion', 'chronicle'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`touch-target rounded-xl border text-xs font-bold transition ${
                    mode === m
                      ? 'bg-amber-500 border-amber-300 text-slate-950 shadow'
                      : 'bg-slate-950/70 border-slate-700 text-slate-200'
                  }`}
                >
                  {m === 'dominion' ? 'Dominion' : '33-Turn Chronicle'}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty & House Count */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-300">
                Difficulty
              </label>
              <div className="grid grid-cols-3 gap-1">
                {(['easy', 'normal', 'hard'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`min-h-[44px] rounded-xl border text-[11px] font-bold capitalize ${
                      difficulty === d
                        ? 'bg-sky-600 border-sky-400 text-white'
                        : 'bg-slate-950/70 border-slate-700 text-slate-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-300">
                Houses
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {([4, 5] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setHouseCount(n)}
                    className={`min-h-[44px] rounded-xl border text-xs font-bold ${
                      houseCount === n
                        ? 'bg-sky-600 border-sky-400 text-white'
                        : 'bg-slate-950/70 border-slate-700 text-slate-300'
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
              className="block text-xs font-bold uppercase tracking-wide text-slate-300"
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
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950/80 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <button
            type="button"
            onClick={handleLaunch}
            className="touch-target w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 active:from-amber-500 active:to-amber-700 text-slate-950 font-serif-march text-base font-bold shadow-lg"
          >
            Begin Campaign
          </button>
        </section>

        {/* Footer Actions: Import JSON & Field Guide */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className="touch-target rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-bold text-slate-200"
          >
            Import Save JSON
          </button>
          <button
            type="button"
            onClick={onOpenPrimer}
            className="touch-target rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-bold text-slate-200"
          >
            Field Guide
          </button>
        </div>

        {showImport && (
          <div className="p-3 rounded-2xl surface-iron border border-slate-700 space-y-2">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={4}
              placeholder="Paste exported Marchlands Save JSON..."
              className="w-full rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-slate-200"
            />
            <button
              type="button"
              onClick={() => {
                onImportSaveJson(importText);
                setImportText('');
                setShowImport(false);
              }}
              className="touch-target w-full rounded-xl bg-amber-600 text-slate-950 text-xs font-bold"
            >
              Load Save JSON
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
