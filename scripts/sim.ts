#!/usr/bin/env node
/**
 * Marchlands (Spec v0.3) — Headless AI-vs-AI Simulation Harness CLI
 *
 * Usage:
 *   node scripts/sim.ts --games 200 --seed 1 --houses 5 --mode dominion \
 *     [--maxTurns 150] [--difficulty normal] [--out sim-reports/] \
 *     [--mixed none|hard-vs-normal|normal-vs-easy]
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  DecreeId,
  Difficulty,
  GameMode,
  HouseId,
  KeepSpecialization,
} from '../src/types/game.ts';
import {
  CHRONICLE_TURN_LIMIT,
  DECREE_IDS,
  DOMINION_DEFAULT_MAX_TURNS,
  EVENT_IDS,
  HOUSE_IDS,
  WRIT_IDS,
} from '../src/data/index.ts';
import {
  getRotatedHouseOrder,
  runSimulatedGame,
  type InvariantViolation,
  type SimGameResult,
} from '../src/engine/simRunner.ts';

type MixedMode = 'none' | 'hard-vs-normal' | 'normal-vs-easy';

interface CliArgs {
  games: number;
  seed: number;
  houses: 4 | 5;
  mode: GameMode;
  maxTurns: number;
  difficulty: Difficulty;
  out: string;
  mixed: MixedMode;
}

function parseArgs(argv: string[]): CliArgs {
  let games = 200;
  let seed = 1;
  let houses: 4 | 5 = 5;
  let mode: GameMode = 'dominion';
  let maxTurnsOverride: number | null = null;
  let difficulty: Difficulty = 'normal';
  let out = 'sim-reports/';
  let mixed: MixedMode = 'none';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === '--games' && next) {
      games = Math.max(1, Number.parseInt(next, 10));
      i++;
    } else if (arg === '--seed' && next) {
      seed = Number.parseInt(next, 10);
      i++;
    } else if (arg === '--houses' && next) {
      const h = Number.parseInt(next, 10);
      if (h !== 4 && h !== 5) throw new Error('--houses must be 4 or 5');
      houses = h;
      i++;
    } else if (arg === '--mode' && next) {
      if (next !== 'dominion' && next !== 'chronicle') {
        throw new Error('--mode must be dominion or chronicle');
      }
      mode = next;
      i++;
    } else if (arg === '--maxTurns' && next) {
      maxTurnsOverride = Math.max(1, Number.parseInt(next, 10));
      i++;
    } else if (arg === '--difficulty' && next) {
      if (next !== 'easy' && next !== 'normal' && next !== 'hard') {
        throw new Error('--difficulty must be easy, normal, or hard');
      }
      difficulty = next;
      i++;
    } else if (arg === '--out' && next) {
      out = next;
      i++;
    } else if (arg === '--mixed' && next) {
      if (next !== 'none' && next !== 'hard-vs-normal' && next !== 'normal-vs-easy') {
        throw new Error('--mixed must be none, hard-vs-normal, or normal-vs-easy');
      }
      mixed = next;
      i++;
    }
  }

  const maxTurns =
    maxTurnsOverride ?? (mode === 'chronicle' ? CHRONICLE_TURN_LIMIT : DOMINION_DEFAULT_MAX_TURNS);

  return { games, seed, houses, mode, maxTurns, difficulty, out, mixed };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx]!;
}

function median(values: number[]): number {
  return percentile(values, 50);
}

function pct(num: number, den: number): number {
  return den === 0 ? 0 : (num / den) * 100;
}

function fmtPct(num: number, den: number): string {
  return `${pct(num, den).toFixed(1)}%`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface GateResult {
  readonly name: string;
  readonly target: string;
  readonly actual: string;
  readonly pass: boolean;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const activeHouses = HOUSE_IDS.slice(0, args.houses);
  const startWall = performance.now();

  console.log(
    `[sim] Running ${args.games} ${args.houses}-House ${args.mode} games (seed=${args.seed}, difficulty=${args.difficulty}, mixed=${args.mixed}, maxTurns=${args.maxTurns})...`,
  );

  const results: SimGameResult[] = [];
  const allViolations: InvariantViolation[] = [];
  let determinismChecksRun = 0;
  let determinismFailures = 0;

  // Mixed difficulty win tracking
  let mixedStrongerWins = 0;
  let mixedWeakerWins = 0;
  let mixedDecidedGames = 0;

  for (let i = 0; i < args.games; i++) {
    const gameSeed = args.seed + i;
    const seatRotation = i % args.houses;
    const rotatedOrder = getRotatedHouseOrder(args.houses, seatRotation);

    let difficultyByHouse: Partial<Record<HouseId, Difficulty>> | undefined;
    let strongerDiff: Difficulty | null = null;
    if (args.mixed !== 'none') {
      const [strong, weak]: [Difficulty, Difficulty] =
        args.mixed === 'hard-vs-normal' ? ['hard', 'normal'] : ['normal', 'easy'];
      strongerDiff = strong;
      difficultyByHouse = {};
      // Assign half of seats (alternating) to strong and half to weak so seating & houses stay balanced
      for (let s = 0; s < rotatedOrder.length; s++) {
        const hid = rotatedOrder[s]!;
        difficultyByHouse[hid] = s % 2 === 0 ? strong : weak;
      }
    }

    const res = runSimulatedGame({
      seed: gameSeed,
      houseCount: args.houses,
      mode: args.mode,
      difficulty: args.difficulty,
      maxTurns: args.maxTurns,
      seatRotation,
      difficultyByHouse,
      checkJsonRoundTrip: true,
    });
    results.push(res);
    allViolations.push(...res.invariantViolations);

    if (difficultyByHouse && strongerDiff && res.winnerHouseId) {
      mixedDecidedGames += 1;
      if (difficultyByHouse[res.winnerHouseId] === strongerDiff) {
        mixedStrongerWins += 1;
      } else {
        mixedWeakerWins += 1;
      }
    }

    // Invariant 6: Determinism replay check 1 in every 20 games
    if (i % 20 === 0 && res.invariantViolations.length === 0) {
      determinismChecksRun += 1;
      const replay = runSimulatedGame({
        seed: gameSeed,
        houseCount: args.houses,
        mode: args.mode,
        difficulty: args.difficulty,
        maxTurns: args.maxTurns,
        seatRotation,
        difficultyByHouse,
        checkJsonRoundTrip: false,
      });
      if (replay.finalStateHash !== res.finalStateHash) {
        determinismFailures += 1;
        allViolations.push({
          seed: gameSeed,
          turnNumber: res.turnsPlayed,
          activeHouseId: res.houseOrder[0]!,
          check: 'determinism',
          message: `Replay hash mismatch: ${res.finalStateHash} vs ${replay.finalStateHash}`,
        });
      }
    }

    if ((i + 1) % 25 === 0 || i + 1 === args.games) {
      const elapsedS = ((performance.now() - startWall) / 1000).toFixed(1);
      console.log(`[sim] Progress: ${i + 1}/${args.games} games (${elapsedS}s elapsed, ${allViolations.length} violations)`);
    }
  }

  // =========================================================================
  // Aggregate Report Metrics (SIMULATION_HARNESS.md §4)
  // =========================================================================

  const n = results.length;
  const winsByHouse: Record<string, number> = {};
  for (const hid of activeHouses) winsByHouse[hid] = 0;

  const winsByVictoryType: Record<string, number> = {
    conquest: 0,
    supremacy: 0,
    mandate: 0,
    score: 0,
    stalemate: 0,
  };

  const winsBySeat: number[] = Array.from({ length: args.houses }, () => 0);

  const gameLengths: number[] = [];
  let stalemates = 0;
  let stalematesMaxTurns = 0;
  let stalematesNoKeep25 = 0;

  const tier2TurnsByHouse: Record<string, number[]> = {};
  for (const hid of activeHouses) tier2TurnsByHouse[hid] = [];

  const specPickCounts: Record<Exclude<KeepSpecialization, 'none'>, number> = {
    garrison: 0,
    market_town: 0,
    granary_seat: 0,
  };
  const specWinCounts: Record<Exclude<KeepSpecialization, 'none'>, number> = {
    garrison: 0,
    market_town: 0,
    granary_seat: 0,
  };
  const specOwnerGames: Record<Exclude<KeepSpecialization, 'none'>, number> = {
    garrison: 0,
    market_town: 0,
    granary_seat: 0,
  };

  const decreeOwnedCount: Record<string, number> = {};
  const decreeWinCount: Record<string, number> = {};
  for (const did of DECREE_IDS) {
    decreeOwnedCount[did] = 0;
    decreeWinCount[did] = 0;
  }

  const writsPublished: Record<string, number> = {};
  const writsCompleted: Record<string, number> = {};
  for (const wid of WRIT_IDS) {
    writsPublished[wid] = 0;
    writsCompleted[wid] = 0;
  }

  let totalMandateClaims = 0;
  let totalMandateBroken = 0;
  let totalMandateWins = 0;

  const eventCounts: Record<string, number> = {};
  const eventChoices: Record<string, Record<string, number>> = {};
  for (const eid of EVENT_IDS) eventCounts[eid] = 0;

  const firstContactTurns: number[] = [];
  const unitsAliveByTurnHouse: Record<number, Record<string, number[]>> = {};

  const aiTurnTimesByHouse: Record<string, number[]> = {};
  for (const hid of activeHouses) aiTurnTimesByHouse[hid] = [];

  let totalKills = 0;
  let focusFireKills = 0;
  let aiAttackTurns = 0;
  let piecemealTurns = 0;

  let totalOspTriggers = 0;
  let totalBraceTriggers = 0;
  const unitsTrainedTotals: Record<string, number> = {};
  let gamesWithMenAtArms = 0;
  let totalCorvusWarCamps = 0;
  let corvusGames = 0;
  const endDecreesOwnedList: number[] = [];
  const endDecreesBeyondStartList: number[] = [];
  let totalWatchtowerOccupiedTurns = 0;
  const chronicleSpreadPcts: number[] = [];

  for (const r of results) {
    if (r.winnerHouseId) {
      winsByHouse[r.winnerHouseId] = (winsByHouse[r.winnerHouseId] ?? 0) + 1;
    }
    winsByVictoryType[r.victoryType] = (winsByVictoryType[r.victoryType] ?? 0) + 1;
    if (r.winnerSeatIndex !== null && r.winnerSeatIndex >= 0 && r.winnerSeatIndex < args.houses) {
      winsBySeat[r.winnerSeatIndex]! += 1;
    }

    gameLengths.push(r.turnsPlayed);
    if (r.isStalemate) stalemates += 1;
    if (r.stalemateHitMaxTurns) stalematesMaxTurns += 1;
    if (r.stalemateNoKeepChange25) stalematesNoKeep25 += 1;

    for (const hid of activeHouses) {
      const t2 = r.tier2TurnByHouse[hid];
      if (t2 !== null && t2 !== undefined) tier2TurnsByHouse[hid]!.push(t2);
      endDecreesOwnedList.push(r.finalDecreesOwned[hid] ?? 0);
      endDecreesBeyondStartList.push(r.finalDecreesBeyondStart[hid] ?? 0);

      const dids = r.finalDecreeIds[hid] ?? [];
      for (const did of dids) {
        decreeOwnedCount[did] = (decreeOwnedCount[did] ?? 0) + 1;
        if (r.winnerHouseId === hid) {
          decreeWinCount[did] = (decreeWinCount[did] ?? 0) + 1;
        }
      }

      const times = r.aiTurnTimesMsByHouse[hid] ?? [];
      for (const t of times) aiTurnTimesByHouse[hid]!.push(t);
    }

    // Track specialization pick counts & per-house-game win rates
    const specsOwnedByHouse = new Map<HouseId, Set<Exclude<KeepSpecialization, 'none'>>>();
    for (const p of r.specPicks) {
      specPickCounts[p.spec] += 1;
      if (!specsOwnedByHouse.has(p.houseId)) specsOwnedByHouse.set(p.houseId, new Set());
      specsOwnedByHouse.get(p.houseId)!.add(p.spec);
    }
    for (const [hid, sset] of specsOwnedByHouse.entries()) {
      for (const sp of sset) {
        specOwnerGames[sp] += 1;
        if (r.winnerHouseId === hid) specWinCounts[sp] += 1;
      }
    }

    for (const [wid, c] of Object.entries(r.writsPublished)) {
      writsPublished[wid] = (writsPublished[wid] ?? 0) + c;
    }
    for (const [wid, c] of Object.entries(r.writsCompleted)) {
      writsCompleted[wid] = (writsCompleted[wid] ?? 0) + c;
    }

    totalMandateClaims += r.mandateClaims;
    totalMandateBroken += r.mandateBroken;
    totalMandateWins += r.mandateWins;

    for (const [eid, c] of Object.entries(r.eventCounts)) {
      eventCounts[eid] = (eventCounts[eid] ?? 0) + c;
    }
    for (const [eid, cmap] of Object.entries(r.eventChoices)) {
      if (!eventChoices[eid]) eventChoices[eid] = {};
      for (const [opt, c] of Object.entries(cmap)) {
        eventChoices[eid]![opt] = (eventChoices[eid]![opt] ?? 0) + c;
      }
    }

    if (r.firstContactTurn !== null) firstContactTurns.push(r.firstContactTurn);

    for (const [turnStr, snap] of Object.entries(r.unitsAliveTimeline)) {
      const turn = Number(turnStr);
      if (!unitsAliveByTurnHouse[turn]) {
        unitsAliveByTurnHouse[turn] = {};
        for (const hid of activeHouses) unitsAliveByTurnHouse[turn]![hid] = [];
      }
      for (const hid of activeHouses) {
        unitsAliveByTurnHouse[turn]![hid]!.push(snap[hid] ?? 0);
      }
    }

    totalKills += r.totalKills;
    focusFireKills += r.focusFireKills;
    aiAttackTurns += r.aiAttackTurns;
    piecemealTurns += r.piecemealTurns;

    totalOspTriggers += r.oneShotProtectionTriggers;
    totalBraceTriggers += r.braceTriggers;

    for (const [utype, c] of Object.entries(r.unitsTrainedByType)) {
      unitsTrainedTotals[utype] = (unitsTrainedTotals[utype] ?? 0) + c;
    }
    if ((r.unitsTrainedByType.men_at_arms ?? 0) > 0) gamesWithMenAtArms += 1;
    if (r.houseOrder.includes('corvus')) {
      corvusGames += 1;
      totalCorvusWarCamps += r.corvusMaxWarCamps;
    }
    totalWatchtowerOccupiedTurns += r.watchtowerOccupiedTurns;

    if (args.mode === 'chronicle') {
      const sortedScores = activeHouses
        .map((hid) => r.finalScores[hid] ?? 0)
        .sort((a, b) => b - a);
      const first = sortedScores[0] ?? 0;
      const last = sortedScores[sortedScores.length - 1] ?? 0;
      if (first > 0) {
        chronicleSpreadPcts.push(((first - last) / first) * 100);
      }
    }
  }

  // =========================================================================
  // Balance Gates Evaluation (SIMULATION_HARNESS.md §5)
  // =========================================================================

  const gates: GateResult[] = [];
  const totalSpecPicks =
    specPickCounts.garrison + specPickCounts.market_town + specPickCounts.granary_seat;
  const allAiTurnTimes = activeHouses.flatMap((hid) => aiTurnTimesByHouse[hid] ?? []);
  const p95AiTurnMs = percentile(allAiTurnTimes, 95);
  const focusFireRatePct = pct(focusFireKills, totalKills);
  const piecemealRatePct = pct(piecemealTurns, aiAttackTurns);

  // Invariant failures
  gates.push({
    name: 'Invariant failures',
    target: '0',
    actual: `${allViolations.length} (determinism checks: ${determinismChecksRun}, failures: ${determinismFailures})`,
    pass: allViolations.length === 0,
  });

  if (args.mixed !== 'none') {
    const strongerRate = pct(mixedStrongerWins, mixedDecidedGames);
    gates.push({
      name: `Mixed difficulty (${args.mixed}) stronger win rate`,
      target: '>= 60%',
      actual: `${strongerRate.toFixed(1)}% (${mixedStrongerWins}/${mixedDecidedGames})`,
      pass: strongerRate >= 60,
    });
  } else {
    if (args.mode === 'dominion' && args.houses === 5) {
      const houseRates = activeHouses.map((hid) => ({
        hid,
        rate: round2(pct(winsByHouse[hid] ?? 0, n)),
      }));
      const minRate = Math.min(...houseRates.map((h) => h.rate));
      const maxRate = Math.max(...houseRates.map((h) => h.rate));
      gates.push({
        name: 'Win rate per House (5-House Dominion)',
        target: '12-28% each',
        actual: houseRates.map((h) => `${h.hid}: ${h.rate.toFixed(1)}%`).join(', '),
        pass: minRate >= 12 && maxRate <= 28,
      });

      const medLen = median(gameLengths);
      gates.push({
        name: 'Dominion median game length',
        target: '40-80 turns',
        actual: `${medLen} turns (p10=${percentile(gameLengths, 10)}, p90=${percentile(gameLengths, 90)})`,
        pass: medLen >= 40 && medLen <= 80,
      });

      const stalePct = pct(stalemates, n);
      gates.push({
        name: 'Dominion stalemate rate',
        target: '< 5%',
        actual: `${stalePct.toFixed(1)}% (${stalemates}/${n})`,
        pass: stalePct < 5,
      });

      const victoryRates = ['conquest', 'supremacy', 'mandate'].map((vt) => ({
        vt,
        rate: pct(winsByVictoryType[vt] ?? 0, n),
      }));
      const maxVicRate = Math.max(...victoryRates.map((v) => v.rate));
      gates.push({
        name: 'Victory type mix (Dominion)',
        target: 'No single type > 70%',
        actual: victoryRates.map((v) => `${v.vt}: ${v.rate.toFixed(1)}%`).join(', '),
        pass: maxVicRate <= 70,
      });
    }

    if (args.mode === 'chronicle') {
      const medSpread = median(chronicleSpreadPcts);
      gates.push({
        name: 'Chronicle (Turn 33) 1st-to-last score spread',
        target: '>= 25% of 1st place',
        actual: `${medSpread.toFixed(1)}% median`,
        pass: medSpread >= 25,
      });
    }

    const specMinPct =
      totalSpecPicks === 0
        ? 0
        : Math.min(
            pct(specPickCounts.garrison, totalSpecPicks),
            pct(specPickCounts.market_town, totalSpecPicks),
            pct(specPickCounts.granary_seat, totalSpecPicks),
          );
    gates.push({
      name: 'Each specialization pick rate',
      target: '>= 15%',
      actual: `garrison: ${fmtPct(specPickCounts.garrison, totalSpecPicks)}, market_town: ${fmtPct(specPickCounts.market_town, totalSpecPicks)}, granary_seat: ${fmtPct(specPickCounts.granary_seat, totalSpecPicks)}`,
      pass: specMinPct >= 15,
    });

    const p95Limit = args.difficulty === 'hard' ? 500 : 250;
    gates.push({
      name: `AI turn time p95 (${args.difficulty})`,
      target: `< ${p95Limit} ms`,
      actual: `${p95AiTurnMs.toFixed(1)} ms (p50=${percentile(allAiTurnTimes, 50).toFixed(1)} ms, max=${Math.max(0, ...allAiTurnTimes).toFixed(1)} ms)`,
      pass: p95AiTurnMs < p95Limit,
    });

    if (args.difficulty === 'normal') {
      gates.push({
        name: 'AI focus-fire rate (Normal)',
        target: '>= 50%',
        actual: `${focusFireRatePct.toFixed(1)}% (${focusFireKills}/${totalKills})`,
        pass: focusFireRatePct >= 50,
      });
      gates.push({
        name: 'AI piecemeal rate (Normal)',
        target: '<= 20%',
        actual: `${piecemealRatePct.toFixed(1)}% (${piecemealTurns}/${aiAttackTurns})`,
        pass: piecemealRatePct <= 20,
      });
    }
  }

  // =========================================================================
  // Build JSON Report & Markdown Summary
  // =========================================================================

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });

  const aiTurnTimingSummary: Record<string, { p50: number; p95: number; max: number }> = {};
  for (const hid of activeHouses) {
    const arr = aiTurnTimesByHouse[hid] ?? [];
    aiTurnTimingSummary[hid] = {
      p50: round2(percentile(arr, 50)),
      p95: round2(percentile(arr, 95)),
      max: round2(arr.length ? Math.max(...arr) : 0),
    };
  }

  const unitsAliveSummary: Record<number, Record<string, number>> = {};
  for (const [turnStr, byHouse] of Object.entries(unitsAliveByTurnHouse)) {
    const t = Number(turnStr);
    unitsAliveSummary[t] = {};
    for (const hid of activeHouses) {
      const arr = byHouse[hid] ?? [];
      unitsAliveSummary[t]![hid] = round2(
        arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0,
      );
    }
  }

  const reportJson = {
    meta: {
      timestamp: now.toISOString(),
      specVersion: '0.3',
      ...args,
      wallTimeSec: round2((performance.now() - startWall) / 1000),
      determinismChecksRun,
      determinismFailures,
    },
    balanceGates: gates,
    invariantViolations: allViolations,
    winRateByHouse: Object.fromEntries(
      activeHouses.map((hid) => [
        hid,
        { wins: winsByHouse[hid] ?? 0, pct: round2(pct(winsByHouse[hid] ?? 0, n)) },
      ]),
    ),
    winRateByVictoryType: Object.fromEntries(
      Object.entries(winsByVictoryType).map(([vt, c]) => [vt, { count: c, pct: round2(pct(c, n)) }]),
    ),
    winRateBySeat: winsBySeat.map((c, idx) => ({ seat: idx, wins: c, pct: round2(pct(c, n)) })),
    mixedDifficulty:
      args.mixed !== 'none'
        ? {
            mode: args.mixed,
            strongerWins: mixedStrongerWins,
            weakerWins: mixedWeakerWins,
            decidedGames: mixedDecidedGames,
            strongerWinPct: round2(pct(mixedStrongerWins, mixedDecidedGames)),
          }
        : null,
    gameLength: {
      median: median(gameLengths),
      p10: percentile(gameLengths, 10),
      p90: percentile(gameLengths, 90),
      stalemateCount: stalemates,
      stalematePct: round2(pct(stalemates, n)),
      stalemateMaxTurns: stalematesMaxTurns,
      stalemateNoKeepChange25: stalematesNoKeep25,
    },
    chronicleSpreadPctMedian:
      args.mode === 'chronicle' ? round2(median(chronicleSpreadPcts)) : null,
    tier2TurnMedianByHouse: Object.fromEntries(
      activeHouses.map((hid) => [hid, median(tier2TurnsByHouse[hid] ?? [])]),
    ),
    specializations: Object.fromEntries(
      (['garrison', 'market_town', 'granary_seat'] as const).map((sp) => [
        sp,
        {
          picks: specPickCounts[sp],
          pickPct: round2(pct(specPickCounts[sp], totalSpecPicks)),
          winPctWhenOwned: round2(pct(specWinCounts[sp], specOwnerGames[sp])),
        },
      ]),
    ),
    decrees: Object.fromEntries(
      DECREE_IDS.map((did: DecreeId) => [
        did,
        {
          ownedCount: decreeOwnedCount[did] ?? 0,
          pickRatePerHouseGame: round2(pct(decreeOwnedCount[did] ?? 0, n * args.houses)),
          winPctWhenOwned: round2(pct(decreeWinCount[did] ?? 0, decreeOwnedCount[did] ?? 0)),
        },
      ]),
    ),
    writs: Object.fromEntries(
      WRIT_IDS.map((wid) => [
        wid,
        {
          published: writsPublished[wid] ?? 0,
          completed: writsCompleted[wid] ?? 0,
          completionPct: round2(pct(writsCompleted[wid] ?? 0, writsPublished[wid] ?? 0)),
        },
      ]),
    ),
    mandate: {
      claims: totalMandateClaims,
      broken: totalMandateBroken,
      wins: totalMandateWins,
    },
    events: {
      counts: eventCounts,
      choices: eventChoices,
    },
    pacingAndCombat: {
      firstContactTurnMedian: median(firstContactTurns),
      unitsAliveTimelineMean: unitsAliveSummary,
      aiTurnTimesMsByHouse: aiTurnTimingSummary,
      focusFireRatePct: round2(focusFireRatePct),
      focusFireKills,
      totalKills,
      piecemealRatePct: round2(piecemealRatePct),
      piecemealTurns,
      aiAttackTurns,
      oneShotProtectionPerGame: round2(totalOspTriggers / n),
      spearmanBracePerGame: round2(totalBraceTriggers / n),
      menAtArmsTrainedPerGame: round2((unitsTrainedTotals.men_at_arms ?? 0) / n),
      menAtArmsGamePresencePct: round2(pct(gamesWithMenAtArms, n)),
      sapperCrewTrainedPerGame: round2((unitsTrainedTotals.sapper_crew ?? 0) / n),
      siegeRamTrainedPerGame: round2((unitsTrainedTotals.siege_ram ?? 0) / n),
      corvusWarCampsPerGame: corvusGames ? round2(totalCorvusWarCamps / corvusGames) : 0,
      medianDecreesOwnedAtEnd: median(endDecreesOwnedList),
      medianDecreesBeyondStartAtEnd: median(endDecreesBeyondStartList),
      watchtowerOccupiedTurnsPerGame: round2(totalWatchtowerOccupiedTurns / n),
    },
  };

  const mdLines: string[] = [
    `# Marchlands Simulation Report (${timestamp})`,
    '',
    `- **Config:** \`${args.games}\` games | \`${args.houses}\` Houses | mode=\`${args.mode}\` | difficulty=\`${args.difficulty}\` | mixed=\`${args.mixed}\` | seed=\`${args.seed}\` | maxTurns=\`${args.maxTurns}\``,
    `- **Wall Time:** ${reportJson.meta.wallTimeSec}s | **Determinism Replays:** ${determinismChecksRun} (${determinismFailures} failures)`,
    '',
    '## Balance Gates',
    '',
    '| Gate | Target | Actual | Status |',
    '| :--- | :--- | :--- | :---: |',
    ...gates.map((g) => `| ${g.name} | ${g.target} | ${g.actual} | ${g.pass ? 'PASS' : 'FAIL'} |`),
    '',
    '## Win Rates & Pacing',
    '',
    '### By House',
    '| House | Wins | Win % | Median Tier-2 Turn | AI Turn p50 / p95 / max (ms) |',
    '| :--- | :---: | :---: | :---: | :---: |',
    ...activeHouses.map((hid) => {
      const t = aiTurnTimingSummary[hid]!;
      return `| ${hid} | ${winsByHouse[hid]} | ${fmtPct(winsByHouse[hid] ?? 0, n)} | ${median(tier2TurnsByHouse[hid] ?? [])} | ${t.p50} / ${t.p95} / ${t.max} |`;
    }),
    '',
    '### By Victory Type',
    '| Victory Type | Count | Share |',
    '| :--- | :---: | :---: |',
    ...Object.entries(winsByVictoryType).map(([vt, c]) => `| ${vt} | ${c} | ${fmtPct(c, n)} |`),
    '',
    '### By Start Seat',
    '| Seat | Wins | Share |',
    '| :---: | :---: | :---: |',
    ...winsBySeat.map((c, idx) => `| ${idx} | ${c} | ${fmtPct(c, n)} |`),
    '',
    '### Game Length & Stalemates',
    `- **Length:** median=${reportJson.gameLength.median}, p10=${reportJson.gameLength.p10}, p90=${reportJson.gameLength.p90}`,
    `- **Stalemates:** ${stalemates}/${n} (${fmtPct(stalemates, n)}) — maxTurns=${stalematesMaxTurns}, noKeepChange25=${stalematesNoKeep25}`,
    `- **First Contact Turn (median):** ${reportJson.pacingAndCombat.firstContactTurnMedian}`,
    '',
    '## Specializations',
    '| Specialization | Picks | Pick % | Win % When Owned |',
    '| :--- | :---: | :---: | :---: |',
    ...(['garrison', 'market_town', 'granary_seat'] as const).map(
      (sp) =>
        `| ${sp} | ${specPickCounts[sp]} | ${fmtPct(specPickCounts[sp], totalSpecPicks)} | ${fmtPct(specWinCounts[sp], specOwnerGames[sp])} |`,
    ),
    '',
    '## AI Coordination & Combat Mechanics',
    `- **Focus-fire rate:** ${reportJson.pacingAndCombat.focusFireRatePct}% (${focusFireKills}/${totalKills} kills)`,
    `- **Piecemeal rate:** ${reportJson.pacingAndCombat.piecemealRatePct}% (${piecemealTurns}/${aiAttackTurns} attack turns)`,
    `- **One-Shot Protection triggers / game:** ${reportJson.pacingAndCombat.oneShotProtectionPerGame}`,
    `- **Spearman Brace triggers / game:** ${reportJson.pacingAndCombat.spearmanBracePerGame}`,
    `- **Men-at-Arms trained / game:** ${reportJson.pacingAndCombat.menAtArmsTrainedPerGame} (present in ${reportJson.pacingAndCombat.menAtArmsGamePresencePct}% of games)`,
    `- **Sapper Crew vs. Siege Ram trained / game:** ${reportJson.pacingAndCombat.sapperCrewTrainedPerGame} vs. ${reportJson.pacingAndCombat.siegeRamTrainedPerGame}`,
    `- **Corvus War Camps (max/game avg):** ${reportJson.pacingAndCombat.corvusWarCampsPerGame}`,
    `- **Median Decrees owned at game end:** ${reportJson.pacingAndCombat.medianDecreesOwnedAtEnd} (beyond start: ${reportJson.pacingAndCombat.medianDecreesBeyondStartAtEnd})`,
    `- **Ancient Watchtower occupied turns / game:** ${reportJson.pacingAndCombat.watchtowerOccupiedTurnsPerGame}`,
    '',
    '## Crown Writs & Regent\'s Mandate',
    `- **Mandate:** claims=${totalMandateClaims}, broken=${totalMandateBroken}, wins=${totalMandateWins}`,
    '',
    '| Writ | Published | Completed | Completion % |',
    '| :--- | :---: | :---: | :---: |',
    ...WRIT_IDS.map(
      (wid) =>
        `| ${wid} | ${writsPublished[wid]} | ${writsCompleted[wid]} | ${fmtPct(writsCompleted[wid] ?? 0, writsPublished[wid] ?? 0)} |`,
    ),
    '',
    '## Frontier Events',
    '| Event | Triggers | Choices |',
    '| :--- | :---: | :--- |',
    ...EVENT_IDS.map((eid) => {
      const ch = eventChoices[eid];
      const chStr = ch
        ? Object.entries(ch)
            .map(([k, v]) => `${k}:${v}`)
            .join(', ')
        : '—';
      return `| ${eid} | ${eventCounts[eid]} | ${chStr} |`;
    }),
    '',
    '## Royal Decrees (Pick & Win Rates)',
    '| Decree | Owned Count | Pick % / House-Game | Win % When Owned |',
    '| :--- | :---: | :---: | :---: |',
    ...DECREE_IDS.map(
      (did) =>
        `| ${did} | ${decreeOwnedCount[did]} | ${fmtPct(decreeOwnedCount[did] ?? 0, n * args.houses)} | ${fmtPct(decreeWinCount[did] ?? 0, decreeOwnedCount[did] ?? 0)} |`,
    ),
  ];

  const baseName = `${timestamp}-${args.mode}-${args.difficulty}${args.mixed !== 'none' ? `-${args.mixed}` : ''}`;
  const jsonPath = path.join(outDir, `${baseName}.json`);
  const mdPath = path.join(outDir, `${baseName}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(reportJson, null, 2), 'utf8');
  fs.writeFileSync(mdPath, `${mdLines.join('\n')}\n`, 'utf8');

  console.log(`\n[sim] Reports written:\n  JSON: ${jsonPath}\n  MD:   ${mdPath}\n`);
  console.log('=== BALANCE GATES ===');
  for (const g of gates) {
    console.log(`  [${g.pass ? 'PASS' : 'FAIL'}] ${g.name}: ${g.actual} (target: ${g.target})`);
  }

  if (allViolations.length > 0) {
    console.error(`\n[sim] ${allViolations.length} INVARIANT VIOLATION(S):`);
    for (const v of allViolations.slice(0, 10)) {
      console.error(`  seed=${v.seed} turn=${v.turnNumber} house=${v.activeHouseId} [${v.check}] ${v.message}`);
    }
    process.exitCode = 1;
  }
}

main();
