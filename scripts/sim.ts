#!/usr/bin/env node
/**
 * Marchlands (Spec v2.0) — Headless AI-vs-AI Simulation Harness CLI
 *
 * Usage:
 *   node scripts/sim.ts --games 50 --seed 1 --houses 5 --mode dominion \
 *     [--map grand|standard|compact] [--maxTurns 220] [--chronicleLimit 72] \
 *     [--difficulty normal] [--out sim-reports/] \
 *     [--mixed none|hard-vs-normal|normal-vs-easy]
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  ChronicleLength,
  CitadelCharter,
  DecreeId,
  Difficulty,
  GameMode,
  HouseId,
  KeepSpecialization,
  MapPreset,
} from '../src/types/game.ts';
import {
  DECREE_IDS,
  DEFAULT_CHRONICLE_LIMIT,
  DEFAULT_MAP_PRESET,
  EVENT_IDS,
  HOUSE_IDS,
  MAP_PRESETS,
  SPEC_VERSION,
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
  mapPreset: MapPreset;
  chronicleLimit: ChronicleLength;
  maxTurns: number;
  difficulty: Difficulty;
  out: string;
  mixed: MixedMode;
}

function parseArgs(argv: string[]): CliArgs {
  let games = 50;
  let seed = 1;
  let houses: 4 | 5 = 5;
  let mode: GameMode = 'dominion';
  let mapPreset: MapPreset = DEFAULT_MAP_PRESET;
  let chronicleLimit: ChronicleLength = DEFAULT_CHRONICLE_LIMIT;
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
    } else if (arg === '--map' && next) {
      if (next !== 'compact' && next !== 'standard' && next !== 'grand') {
        throw new Error('--map must be compact, standard, or grand');
      }
      mapPreset = next;
      i++;
    } else if (arg === '--chronicleLimit' && next) {
      const c = Number.parseInt(next, 10);
      if (c !== 48 && c !== 72 && c !== 108) {
        throw new Error('--chronicleLimit must be 48, 72, or 108');
      }
      chronicleLimit = c;
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
    maxTurnsOverride ??
    (mode === 'chronicle' ? chronicleLimit : MAP_PRESETS[mapPreset].defaultMaxTurns);

  return { games, seed, houses, mode, mapPreset, chronicleLimit, maxTurns, difficulty, out, mixed };
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
    `[sim v${SPEC_VERSION}] Running ${args.games} ${args.houses}-House ${args.mode} games on ${args.mapPreset} (${MAP_PRESETS[args.mapPreset].gridSize}x${MAP_PRESETS[args.mapPreset].gridSize}) [seed=${args.seed}, difficulty=${args.difficulty}, mixed=${args.mixed}, maxTurns=${args.maxTurns}]...`,
  );

  const results: SimGameResult[] = [];
  const allViolations: InvariantViolation[] = [];
  let determinismChecksRun = 0;
  let determinismFailures = 0;

  let mixedStrongerWins = 0;
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
      for (let s = 0; s < rotatedOrder.length; s++) {
        const hid = rotatedOrder[s]!;
        difficultyByHouse[hid] = s % 2 === 0 ? strong : weak;
      }
    }

    const gStart = performance.now();
    const res = runSimulatedGame({
      seed: gameSeed,
      houseCount: args.houses,
      mode: args.mode,
      mapPreset: args.mapPreset,
      chronicleLimit: args.chronicleLimit,
      difficulty: args.difficulty,
      maxTurns: args.maxTurns,
      seatRotation,
      difficultyByHouse,
      checkJsonRoundTrip: i < 5 || i % 5 === 0, // Full JSON round-trip check on 20%+ of games + first 5
    });
    const gElapsed = ((performance.now() - gStart) / 1000).toFixed(1);
    console.log(
      `[sim] Game ${i + 1}/${args.games} (seed=${gameSeed}): turns=${res.turnsPlayed} winner=${res.winnerHouseId ?? 'none'} (${res.victoryType}) [${gElapsed}s, violations=${res.invariantViolations.length}]`,
    );
    results.push(res);
    allViolations.push(...res.invariantViolations);

    if (difficultyByHouse && strongerDiff && res.winnerHouseId) {
      mixedDecidedGames += 1;
      if (difficultyByHouse[res.winnerHouseId] === strongerDiff) {
        mixedStrongerWins += 1;
      }
    }

    // Invariant 6: Determinism replay check 1 in every 10 games
    if (i % 10 === 0 && res.invariantViolations.length === 0) {
      determinismChecksRun += 1;
      const replay = runSimulatedGame({
        seed: gameSeed,
        houseCount: args.houses,
        mode: args.mode,
        mapPreset: args.mapPreset,
        chronicleLimit: args.chronicleLimit,
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

    if ((i + 1) % 10 === 0 || i + 1 === args.games) {
      const elapsedS = ((performance.now() - startWall) / 1000).toFixed(1);
      console.log(
        `[sim] Progress: ${i + 1}/${args.games} games (${elapsedS}s elapsed, ${allViolations.length} violations)`,
      );
    }
  }

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
  let stalematesNoKeep = 0;

  const tier2TurnsByHouse: Record<string, number[]> = {};
  const tier3TurnsByHouse: Record<string, number[]> = {};
  for (const hid of activeHouses) {
    tier2TurnsByHouse[hid] = [];
    tier3TurnsByHouse[hid] = [];
  }

  const SPEC_KEYS: readonly Exclude<KeepSpecialization, 'none'>[] = [
    'garrison',
    'market_town',
    'granary_seat',
    'forge_seat',
  ];
  const specPickCounts: Record<Exclude<KeepSpecialization, 'none'>, number> = {
    garrison: 0,
    market_town: 0,
    granary_seat: 0,
    forge_seat: 0,
  };
  const specWinCounts: Record<Exclude<KeepSpecialization, 'none'>, number> = {
    garrison: 0,
    market_town: 0,
    granary_seat: 0,
    forge_seat: 0,
  };
  const specOwnerGames: Record<Exclude<KeepSpecialization, 'none'>, number> = {
    garrison: 0,
    market_town: 0,
    granary_seat: 0,
    forge_seat: 0,
  };

  const CHARTER_KEYS: readonly Exclude<CitadelCharter, 'none'>[] = [
    'war_college',
    'grand_exchange',
    'royal_bastion',
    'high_armory',
  ];
  const charterPickCounts: Record<Exclude<CitadelCharter, 'none'>, number> = {
    war_college: 0,
    grand_exchange: 0,
    royal_bastion: 0,
    high_armory: 0,
  };
  let totalTier3Citadels = 0;

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
  let totalCommanderSkills = 0;
  let totalCommanderWounds = 0;
  let totalOutpostsFounded = 0;
  let totalReinforces = 0;
  let totalLv2Upgrades = 0;
  let totalRoads = 0;
  let highSeatCapturedGames = 0;

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
    if (r.stalemateNoKeepChange) stalematesNoKeep += 1;

    totalTier3Citadels += r.tier3CitadelsBuilt;
    totalCommanderSkills += r.commanderSkillsUsed;
    totalCommanderWounds += r.commanderWounds;
    totalOutpostsFounded += r.outpostsFounded;
    totalReinforces += r.reinforcesUsed;
    totalLv2Upgrades += r.lv2UpgradesFinal;
    totalRoads += r.roadsFinal;
    if (r.highSeatCaptured) highSeatCapturedGames += 1;

    for (const hid of activeHouses) {
      const t2 = r.tier2TurnByHouse[hid];
      if (t2 !== null && t2 !== undefined) tier2TurnsByHouse[hid]!.push(t2);
      const t3 = r.tier3TurnByHouse[hid];
      if (t3 !== null && t3 !== undefined) tier3TurnsByHouse[hid]!.push(t3);
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

    for (const cp of r.charterPicks) {
      charterPickCounts[cp.charter] += 1;
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
  // v2.0 Balance Gates Evaluation (docs/SIMULATION_HARNESS.md §3)
  // =========================================================================

  const gates: GateResult[] = [];
  const totalSpecPicks = SPEC_KEYS.reduce((s, k) => s + specPickCounts[k], 0);
  const allAiTurnTimes = activeHouses.flatMap((hid) => aiTurnTimesByHouse[hid] ?? []);
  const p95AiTurnMs = percentile(allAiTurnTimes, 95);
  const focusFireRatePct = pct(focusFireKills, totalKills);
  const piecemealRatePct = pct(piecemealTurns, aiAttackTurns);
  const totalSiegeTrained =
    (unitsTrainedTotals.sapper_crew ?? 0) +
    (unitsTrainedTotals.siege_ram ?? 0) +
    (unitsTrainedTotals.trebuchet ?? 0);
  const siegePerGame = totalSiegeTrained / n;
  const medDecreesEnd = median(endDecreesOwnedList);

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
      const [minTarget, maxTarget] =
        args.mapPreset === 'grand'
          ? [85, 130]
          : args.mapPreset === 'standard'
            ? [60, 105]
            : [40, 85];
      gates.push({
        name: `Dominion median game length (${args.mapPreset})`,
        target: `${minTarget}-${maxTarget} turns`,
        actual: `${medLen} turns (p10=${percentile(gameLengths, 10)}, p90=${percentile(gameLengths, 90)})`,
        pass: medLen >= minTarget && medLen <= maxTarget,
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
        target: 'No single type > 75%',
        actual: victoryRates.map((v) => `${v.vt}: ${v.rate.toFixed(1)}%`).join(', '),
        pass: maxVicRate <= 75,
      });

      if (totalMandateClaims > 0) {
        const breakRate = pct(totalMandateBroken, totalMandateClaims);
        gates.push({
          name: 'Mandate break rate (when claimed)',
          target: '> 15%',
          actual: `${breakRate.toFixed(1)}% (${totalMandateBroken}/${totalMandateClaims})`,
          pass: breakRate > 15,
        });
      }
    }

    if (args.mode === 'chronicle') {
      const medSpread = median(chronicleSpreadPcts);
      gates.push({
        name: `Chronicle (Turn ${args.chronicleLimit}) 1st-to-last score spread`,
        target: '>= 25% of 1st place',
        actual: `${medSpread.toFixed(1)}% median`,
        pass: medSpread >= 25,
      });
    }

    const specMinPct =
      totalSpecPicks === 0
        ? 0
        : Math.min(...SPEC_KEYS.map((k) => pct(specPickCounts[k], totalSpecPicks)));
    gates.push({
      name: 'Tier-2 Specialization pick rates (4 specs)',
      target: 'Each >= 10%',
      actual: SPEC_KEYS.map((k) => `${k}: ${fmtPct(specPickCounts[k], totalSpecPicks)}`).join(', '),
      pass: specMinPct >= 10,
    });

    gates.push({
      name: 'Siege units trained per game',
      target: '>= 2.0 / game',
      actual: `${siegePerGame.toFixed(2)} (sapper=${round2((unitsTrainedTotals.sapper_crew ?? 0) / n)}, ram=${round2((unitsTrainedTotals.siege_ram ?? 0) / n)}, treb=${round2((unitsTrainedTotals.trebuchet ?? 0) / n)})`,
      pass: siegePerGame >= 2.0,
    });

    gates.push({
      name: 'Median Decrees owned at game end',
      target: '4-8',
      actual: `${medDecreesEnd}`,
      pass: medDecreesEnd >= 4 && medDecreesEnd <= 8,
    });

    const p95Limit = args.difficulty === 'hard' ? 500 : 250;
    gates.push({
      name: `AI turn time p95 (${args.difficulty}, ${args.mapPreset})`,
      target: `< ${p95Limit} ms`,
      actual: `${p95AiTurnMs.toFixed(1)} ms (p50=${percentile(allAiTurnTimes, 50).toFixed(1)} ms, max=${Math.max(0, ...allAiTurnTimes).toFixed(1)} ms)`,
      pass: p95AiTurnMs < p95Limit,
    });

    if (args.difficulty === 'normal') {
      gates.push({
        name: 'AI focus-fire rate (Normal)',
        target: '>= 45%',
        actual: `${focusFireRatePct.toFixed(1)}% (${focusFireKills}/${totalKills})`,
        pass: focusFireRatePct >= 45,
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

  const reportJson = {
    meta: {
      timestamp: now.toISOString(),
      specVersion: SPEC_VERSION,
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
    gameLength: {
      median: median(gameLengths),
      p10: percentile(gameLengths, 10),
      p90: percentile(gameLengths, 90),
      stalemateCount: stalemates,
      stalematePct: round2(pct(stalemates, n)),
      stalemateMaxTurns: stalematesMaxTurns,
      stalemateNoKeep: stalematesNoKeep,
    },
    tier2TurnMedianByHouse: Object.fromEntries(
      activeHouses.map((hid) => [hid, median(tier2TurnsByHouse[hid] ?? [])]),
    ),
    tier3TurnMedianByHouse: Object.fromEntries(
      activeHouses.map((hid) => [hid, median(tier3TurnsByHouse[hid] ?? [])]),
    ),
    specializations: Object.fromEntries(
      SPEC_KEYS.map((sp) => [
        sp,
        {
          picks: specPickCounts[sp],
          pickPct: round2(pct(specPickCounts[sp], totalSpecPicks)),
          winPctWhenOwned: round2(pct(specWinCounts[sp], specOwnerGames[sp])),
        },
      ]),
    ),
    citadelCharters: charterPickCounts,
    tier3CitadelsPerGame: round2(totalTier3Citadels / n),
    v2Mechanics: {
      siegeTrainedPerGame: round2(siegePerGame),
      sapperPerGame: round2((unitsTrainedTotals.sapper_crew ?? 0) / n),
      siegeRamPerGame: round2((unitsTrainedTotals.siege_ram ?? 0) / n),
      trebuchetPerGame: round2((unitsTrainedTotals.trebuchet ?? 0) / n),
      menAtArmsPerGame: round2((unitsTrainedTotals.men_at_arms ?? 0) / n),
      menAtArmsPresencePct: round2(pct(gamesWithMenAtArms, n)),
      commanderSkillsPerGame: round2(totalCommanderSkills / n),
      commanderWoundsPerGame: round2(totalCommanderWounds / n),
      outpostsFoundedPerGame: round2(totalOutpostsFounded / n),
      reinforcesPerGame: round2(totalReinforces / n),
      lv2UpgradesEndPerGame: round2(totalLv2Upgrades / n),
      roadsEndPerGame: round2(totalRoads / n),
      highSeatCapturedPct: round2(pct(highSeatCapturedGames, n)),
      medianDecreesOwnedAtEnd: medDecreesEnd,
      medianDecreesBeyondStart: median(endDecreesBeyondStartList),
      corvusWarCampsPerGame: corvusGames ? round2(totalCorvusWarCamps / corvusGames) : 0,
      watchtowerOccupiedTurnsPerGame: round2(totalWatchtowerOccupiedTurns / n),
    },
    mandate: {
      claims: totalMandateClaims,
      broken: totalMandateBroken,
      wins: totalMandateWins,
    },
    aiCombat: {
      firstContactTurnMedian: median(firstContactTurns),
      aiTurnTimesMsByHouse: aiTurnTimingSummary,
      focusFireRatePct: round2(focusFireRatePct),
      piecemealRatePct: round2(piecemealRatePct),
      oneShotProtectionPerGame: round2(totalOspTriggers / n),
      spearmanBracePerGame: round2(totalBraceTriggers / n),
    },
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
    events: {
      counts: eventCounts,
      choices: eventChoices,
    },
  };

  const mdLines: string[] = [
    `# Marchlands v${SPEC_VERSION} Simulation Report (${timestamp})`,
    '',
    `- **Config:** \`${args.games}\` games | \`${args.houses}\` Houses | map=\`${args.mapPreset}\` | mode=\`${args.mode}\` | difficulty=\`${args.difficulty}\` | mixed=\`${args.mixed}\` | seed=\`${args.seed}\` | maxTurns=\`${args.maxTurns}\``,
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
    '| House | Wins | Win % | Med T2 Turn | Med T3 Turn | AI Turn p50 / p95 / max (ms) |',
    '| :--- | :---: | :---: | :---: | :---: | :---: |',
    ...activeHouses.map((hid) => {
      const t = aiTurnTimingSummary[hid]!;
      return `| ${hid} | ${winsByHouse[hid]} | ${fmtPct(winsByHouse[hid] ?? 0, n)} | ${median(tier2TurnsByHouse[hid] ?? [])} | ${median(tier3TurnsByHouse[hid] ?? [])} | ${t.p50} / ${t.p95} / ${t.max} |`;
    }),
    '',
    '### By Victory Type',
    '| Victory Type | Count | Share |',
    '| :--- | :---: | :---: |',
    ...Object.entries(winsByVictoryType).map(([vt, c]) => `| ${vt} | ${c} | ${fmtPct(c, n)} |`),
    '',
    '### v2.0 Strategic Depth Telemetry',
    `- **Length:** median=${reportJson.gameLength.median}, p10=${reportJson.gameLength.p10}, p90=${reportJson.gameLength.p90} | **First Contact:** median Turn ${reportJson.aiCombat.firstContactTurnMedian}`,
    `- **Tier-3 Citadels / game:** ${reportJson.tier3CitadelsPerGame} | **Charters:** ${CHARTER_KEYS.map((k) => `${k}=${charterPickCounts[k]}`).join(', ')}`,
    `- **High Seat captured:** ${reportJson.v2Mechanics.highSeatCapturedPct}% of games`,
    `- **Siege / game:** ${reportJson.v2Mechanics.siegeTrainedPerGame} (Sapper ${reportJson.v2Mechanics.sapperPerGame}, Ram ${reportJson.v2Mechanics.siegeRamPerGame}, Trebuchet ${reportJson.v2Mechanics.trebuchetPerGame})`,
    `- **Commander Skills / Wounds per game:** ${reportJson.v2Mechanics.commanderSkillsPerGame} / ${reportJson.v2Mechanics.commanderWoundsPerGame}`,
    `- **Outposts founded / game:** ${reportJson.v2Mechanics.outpostsFoundedPerGame} | **Reinforces / game:** ${reportJson.v2Mechanics.reinforcesPerGame}`,
    `- **End-of-game Lv2 Upgrades / Roads per game:** ${reportJson.v2Mechanics.lv2UpgradesEndPerGame} / ${reportJson.v2Mechanics.roadsEndPerGame}`,
    `- **Mandate:** claims=${totalMandateClaims}, broken=${totalMandateBroken}, wins=${totalMandateWins}`,
    '',
    '## Specializations (Tier-2)',
    '| Specialization | Picks | Pick % | Win % When Owned |',
    '| :--- | :---: | :---: | :---: |',
    ...SPEC_KEYS.map(
      (sp) =>
        `| ${sp} | ${specPickCounts[sp]} | ${fmtPct(specPickCounts[sp], totalSpecPicks)} | ${fmtPct(specWinCounts[sp], specOwnerGames[sp])} |`,
    ),
    '',
    '## Exclusive Royal Doctrines (Pick & Win Rates)',
    '| Decree | Owned Count | Pick % / House-Game | Win % When Owned |',
    '| :--- | :---: | :---: | :---: |',
    ...DECREE_IDS.map(
      (did) =>
        `| ${did} | ${decreeOwnedCount[did]} | ${fmtPct(decreeOwnedCount[did] ?? 0, n * args.houses)} | ${fmtPct(decreeWinCount[did] ?? 0, decreeOwnedCount[did] ?? 0)} |`,
    ),
  ];

  const baseName = `${timestamp}-v2-${args.mapPreset}-${args.mode}-${args.difficulty}${args.mixed !== 'none' ? `-${args.mixed}` : ''}`;
  const jsonPath = path.join(outDir, `${baseName}.json`);
  const mdPath = path.join(outDir, `${baseName}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(reportJson, null, 2), 'utf8');
  fs.writeFileSync(mdPath, `${mdLines.join('\n')}\n`, 'utf8');

  console.log(`\n[sim] Reports written:\n  JSON: ${jsonPath}\n  MD:   ${mdPath}\n`);
  console.log('=== v2.0 BALANCE GATES ===');
  for (const g of gates) {
    console.log(`  [${g.pass ? 'PASS' : 'FAIL'}] ${g.name}: ${g.actual} (target: ${g.target})`);
  }

  if (allViolations.length > 0) {
    console.error(`\n[sim] ${allViolations.length} INVARIANT VIOLATION(S):`);
    for (const v of allViolations.slice(0, 10)) {
      console.error(
        `  seed=${v.seed} turn=${v.turnNumber} house=${v.activeHouseId} [${v.check}] ${v.message}`,
      );
    }
    process.exitCode = 1;
  }
}

main();
