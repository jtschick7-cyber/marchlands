/**
 * Marchlands (Spec v0.3) — Headless Simulation Runner & Per-Turn Invariant Checker
 *
 * Strictly headless (zero React, zero Node fs/path). Shared by `scripts/sim.ts`
 * and `src/engine/__tests__/simSmoke.test.ts`.
 */

import type {
  ChronicleEvent,
  DecreeId,
  Difficulty,
  EventId,
  GameMode,
  GameState,
  HouseId,
  KeepSpecialization,
  VictoryType,
} from '../types/game.ts';
import {
  AI_COMBAT_RESOLUTION_BUDGET,
  AI_WATCHDOG_MS,
  CHRONICLE_TURN_LIMIT,
  DOMINION_DEFAULT_MAX_TURNS,
  HOUSE_IDS,
  MAX_AI_ACTIONS,
  UNITS,
} from '../data/index.ts';
import { coordKey } from './coords.ts';
import { computeScore, rankHousesByScore } from './scoring.ts';
import {
  createInitialGameState,
  getHouseKeeps,
  getHouseUnits,
  getKeepArmyCap,
  getKeepSupportedUnitIds,
} from './stateHelpers.ts';
import { runAiTurnWithMetrics } from './utilityAi.ts';

export interface InvariantViolation {
  readonly seed: number;
  readonly turnNumber: number;
  readonly activeHouseId: HouseId;
  readonly check: string;
  readonly message: string;
}

export interface SimGameOptions {
  readonly seed: number;
  readonly houseCount: 4 | 5;
  readonly mode: GameMode;
  readonly difficulty: Difficulty;
  readonly maxTurns?: number;
  readonly seatRotation?: number;
  readonly difficultyByHouse?: Partial<Record<HouseId, Difficulty>>;
  readonly checkJsonRoundTrip?: boolean;
}

export interface SimGameResult {
  readonly seed: number;
  readonly mode: GameMode;
  readonly difficulty: Difficulty;
  readonly houseOrder: readonly HouseId[];
  readonly winnerHouseId: HouseId | null;
  readonly winnerSeatIndex: number | null;
  readonly victoryType: VictoryType | 'stalemate';
  readonly turnsPlayed: number;
  readonly stalemateHitMaxTurns: boolean;
  readonly stalemateNoKeepChange25: boolean;
  readonly isStalemate: boolean;
  readonly finalStateHash: string;
  readonly invariantViolations: readonly InvariantViolation[];

  // Per-House end-of-game snapshots
  readonly finalScores: Readonly<Record<string, number>>;
  readonly finalDecreesOwned: Readonly<Record<string, number>>;
  readonly finalDecreesBeyondStart: Readonly<Record<string, number>>;
  readonly finalDecreeIds: Readonly<Record<string, readonly DecreeId[]>>;
  readonly tier2TurnByHouse: Readonly<Record<string, number | null>>;

  // Specializations
  readonly specPicks: readonly { houseId: HouseId; spec: Exclude<KeepSpecialization, 'none'> }[];

  // Writs & Mandate
  readonly writsPublished: Readonly<Record<string, number>>;
  readonly writsCompleted: Readonly<Record<string, number>>;
  readonly mandateClaims: number;
  readonly mandateBroken: number;
  readonly mandateWins: number;

  // Frontier Events & Choices
  readonly eventCounts: Readonly<Record<string, number>>;
  readonly eventChoices: Readonly<Record<string, Record<string, number>>>;

  // Combat, Pacing & Mechanics
  readonly firstContactTurn: number | null;
  readonly unitsAliveTimeline: Readonly<Record<number, Readonly<Record<string, number>>>>;
  readonly aiTurnTimesMsByHouse: Readonly<Record<string, readonly number[]>>;
  readonly totalKills: number;
  readonly focusFireKills: number;
  readonly aiAttackTurns: number;
  readonly piecemealTurns: number;
  readonly oneShotProtectionTriggers: number;
  readonly braceTriggers: number;
  readonly unitsTrainedByType: Readonly<Record<string, number>>;
  readonly corvusMaxWarCamps: number;
  readonly watchtowerOccupiedTurns: number;
  readonly maxCombatResolutionsUsed: number;
  readonly maxEconomyActionsUsed: number;
}

/**
 * Deterministic rotated house seating order so every House plays from every seat.
 */
export function getRotatedHouseOrder(houseCount: 4 | 5, seatRotation: number): HouseId[] {
  const base = HOUSE_IDS.slice(0, houseCount);
  const shift = ((seatRotation % base.length) + base.length) % base.length;
  return [...base.slice(shift), ...base.slice(0, shift)];
}

/**
 * Recursive structural deep equality for JSON-serializable values.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === 'object') {
    if (Array.isArray(b)) return false;
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    if (keysA.length !== keysB.length) return false;
    for (const k of keysA) {
      if (!Object.prototype.hasOwnProperty.call(objB, k)) return false;
      if (!deepEqual(objA[k], objB[k])) return false;
    }
    return true;
  }
  return false;
}

/**
 * Deterministic 64-bit FNV-1a hex hash of the serialized GameState.
 */
export function hashGameState(state: GameState): string {
  const str = JSON.stringify(state);
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Enforces Invariants 1–5 from `docs/SIMULATION_HARNESS.md` §3.
 */
export function checkGameInvariants(
  state: GameState,
  prevKeepSupportedCounts: Readonly<Record<string, number>>,
  prevKeepCaps: Readonly<Record<string, number>>,
  seed: number,
  checkJsonRoundTrip = true,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const push = (check: string, message: string) => {
    violations.push({
      seed,
      turnNumber: state.turnNumber,
      activeHouseId: state.activeHouseId,
      check,
      message,
    });
  };

  // 1. No negative resources (materials >= 0, coin >= 0, favor >= 0)
  for (const house of Object.values(state.houses)) {
    if (house.resources.materials < 0) {
      push('non_negative_resources', `${house.id} has negative materials: ${house.resources.materials}`);
    }
    if (house.resources.coin < 0) {
      push('non_negative_resources', `${house.id} has negative coin: ${house.resources.coin}`);
    }
    if (house.favor < 0) {
      push('non_negative_resources', `${house.id} has negative favor: ${house.favor}`);
    }
  }

  // 2. Unit coords in bounds, not on mountain, no overlaps
  const occupiedTiles = new Map<string, string>();
  for (const unit of Object.values(state.units)) {
    if (
      unit.x < 0 ||
      unit.x >= state.gridSize ||
      unit.y < 0 ||
      unit.y >= state.gridSize ||
      unit.tileKey !== coordKey(unit.x, unit.y)
    ) {
      push('unit_bounds', `Unit ${unit.id} out of bounds or mismatched tileKey (${unit.x},${unit.y} vs ${unit.tileKey})`);
      continue;
    }
    const tile = state.tiles[unit.tileKey];
    if (!tile) {
      push('unit_bounds', `Unit ${unit.id} on missing tile ${unit.tileKey}`);
      continue;
    }
    if (tile.terrain === 'mountain') {
      push('unit_impassable', `Unit ${unit.id} (${unit.typeId}) standing on mountain ${unit.tileKey}`);
    }
    const existing = occupiedTiles.get(unit.tileKey);
    if (existing) {
      push('unit_overlap', `Units ${existing} and ${unit.id} overlap on ${unit.tileKey}`);
    } else {
      occupiedTiles.set(unit.tileKey, unit.id);
    }
  }

  // 3. Unit counts per Keep within cap (+ documented over-cap exceptions: war_camp loss, free_company_spearman)
  for (const keep of Object.values(state.keeps)) {
    const cap = getKeepArmyCap(state, keep.id);
    const supported = getKeepSupportedUnitIds(state, keep.id).length;
    if (supported > cap) {
      const prevSupported = prevKeepSupportedCounts[keep.id] ?? 0;
      const prevCap = prevKeepCaps[keep.id] ?? cap;
      const isWarCampLossException =
        (supported <= prevSupported && supported <= cap + 1) ||
        (cap < prevCap && supported <= prevCap);
      if (!isWarCampLossException) {
        push(
          'keep_army_cap',
          `Keep ${keep.id} (${keep.ownerHouseId}) has ${supported} supported units exceeding cap ${cap} (prev ${prevSupported}, prevCap ${prevCap})`,
        );
      }
    }
  }

  // 4. Every owned tile's keepId points to an existing Keep
  for (const tile of Object.values(state.tiles)) {
    if (tile.keepId !== null && !state.keeps[tile.keepId]) {
      push('tile_keep_ref', `Tile ${tile.key} references missing keepId ${tile.keepId}`);
    }
    if (tile.ownerHouseId !== null) {
      if (tile.keepId === null || !state.keeps[tile.keepId]) {
        push('tile_keep_ref', `Owned tile ${tile.key} (${tile.ownerHouseId}) has invalid keepId ${tile.keepId}`);
      } else if (state.keeps[tile.keepId]!.ownerHouseId !== tile.ownerHouseId) {
        push(
          'tile_keep_ref',
          `Owned tile ${tile.key} owner (${tile.ownerHouseId}) mismatches keep ${tile.keepId} owner (${state.keeps[tile.keepId]!.ownerHouseId})`,
        );
      }
    }
  }

  // 5. Serialization round-trip
  if (checkJsonRoundTrip) {
    const roundTripped: unknown = JSON.parse(JSON.stringify(state));
    if (!deepEqual(roundTripped, state)) {
      push('json_roundtrip', 'JSON.parse(JSON.stringify(state)) did not deep-equal state');
    }
  }

  return violations;
}

function snapshotKeepSupportedCounts(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const keep of Object.values(state.keeps)) {
    out[keep.id] = getKeepSupportedUnitIds(state, keep.id).length;
  }
  return out;
}

function snapshotKeepCaps(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const keep of Object.values(state.keeps)) {
    out[keep.id] = getKeepArmyCap(state, keep.id);
  }
  return out;
}

/**
 * Runs one complete headless AI-vs-AI game with full telemetry and invariant checking.
 */
export function runSimulatedGame(options: SimGameOptions): SimGameResult {
  const maxTurns =
    options.maxTurns ??
    (options.mode === 'chronicle' ? CHRONICLE_TURN_LIMIT : DOMINION_DEFAULT_MAX_TURNS);
  const houseOrder = getRotatedHouseOrder(options.houseCount, options.seatRotation ?? 0);
  const checkJson = options.checkJsonRoundTrip ?? true;

  let state = createInitialGameState({
    seed: options.seed,
    houseCount: options.houseCount,
    mode: options.mode,
    difficulty: options.difficultyByHouse?.[houseOrder[0]!] ?? options.difficulty,
    humanHouseId: null,
    customHouseOrder: houseOrder,
  });

  const violations: InvariantViolation[] = [];
  let prevKeepSupported = snapshotKeepSupportedCounts(state);
  let prevKeepCaps = snapshotKeepCaps(state);

  // Telemetry accumulators
  const tier2TurnByHouse: Record<string, number | null> = {};
  for (const hid of houseOrder) tier2TurnByHouse[hid] = null;

  const specializedKeepIds = new Set<string>();
  const specPicks: { houseId: HouseId; spec: Exclude<KeepSpecialization, 'none'> }[] = [];

  const writsPublished: Record<string, number> = {};
  const writsCompleted: Record<string, number> = {};
  let seenWritBatchKey = '';
  const completedWritKeys = new Set<string>();

  let mandateClaims = 0;
  let mandateBroken = 0;
  let mandateWins = 0;

  const eventCounts: Record<string, number> = {};
  const eventChoices: Record<string, Record<string, number>> = {};

  let firstContactTurn: number | null = null;
  const unitsAliveTimeline: Record<number, Record<string, number>> = {};
  const timelineSampleTurns = new Set([5, 10, 15, 20, 30, 40, 50]);

  const aiTurnTimesMsByHouse: Record<string, number[]> = {};
  for (const hid of houseOrder) aiTurnTimesMsByHouse[hid] = [];

  let totalKills = 0;
  let focusFireKills = 0;
  let aiAttackTurns = 0;
  let piecemealTurns = 0;
  const pendingSingleAttackerByHouse: Record<string, string | null> = {};
  for (const hid of houseOrder) pendingSingleAttackerByHouse[hid] = null;

  let oneShotProtectionTriggers = 0;
  let braceTriggers = 0;
  const unitsTrainedByType: Record<string, number> = {};
  const seenUnitIds = new Set<string>();
  let corvusMaxWarCamps = 0;
  let watchtowerOccupiedTurns = 0;
  let maxCombatResolutionsUsed = 0;
  let maxEconomyActionsUsed = 0;

  let lastKeepChangeTurn = 1;
  let prevKeepOwnershipKey = Object.values(state.keeps)
    .map((k) => `${k.id}:${k.ownerHouseId}`)
    .sort()
    .join('|');
  let lastChronicleSeqSeen = state.nextChronicleSeq;
  let lastRoundSampled = 0;
  let lastEventTurnRecorded = 0;

  const recordChoice = (eventId: EventId, choice: string) => {
    if (!eventChoices[eventId]) eventChoices[eventId] = {};
    eventChoices[eventId]![choice] = (eventChoices[eventId]![choice] ?? 0) + 1;
  };

  while (state.phase !== 'game_over' && state.turnNumber <= maxTurns) {
    const actingHouseId = state.activeHouseId;
    const prevState = state;

    // Check if this House's previous single-attacker survived until its next turn
    const prevSingleAttackerId = pendingSingleAttackerByHouse[actingHouseId];
    if (prevSingleAttackerId !== null) {
      if (!state.units[prevSingleAttackerId]) {
        piecemealTurns += 1;
      }
      pendingSingleAttackerByHouse[actingHouseId] = null;
    }

    // Track Ancient Watchtower occupation at start of acting House's turn
    for (const u of getHouseUnits(state, actingHouseId)) {
      if (state.tiles[u.tileKey]?.landmark === 'ancient_watchtower') {
        watchtowerOccupiedTurns += 1;
      }
    }

    const t0 = performance.now();
    const res = runAiTurnWithMetrics(state, actingHouseId, options.difficultyByHouse);
    const elapsedMs = performance.now() - t0;
    state = res.state;

    aiTurnTimesMsByHouse[actingHouseId]!.push(elapsedMs);

    // Invariant 7: AI guardrails & watchdog
    if (res.metrics.combatResolutionsUsed > AI_COMBAT_RESOLUTION_BUDGET) {
      violations.push({
        seed: options.seed,
        turnNumber: prevState.turnNumber,
        activeHouseId: actingHouseId,
        check: 'ai_combat_budget',
        message: `Combat resolutions ${res.metrics.combatResolutionsUsed} > ${AI_COMBAT_RESOLUTION_BUDGET}`,
      });
    }
    if (res.metrics.economyActionsUsed > MAX_AI_ACTIONS) {
      violations.push({
        seed: options.seed,
        turnNumber: prevState.turnNumber,
        activeHouseId: actingHouseId,
        check: 'ai_action_cap',
        message: `Economy actions ${res.metrics.economyActionsUsed} > ${MAX_AI_ACTIONS}`,
      });
    }
    if (elapsedMs > AI_WATCHDOG_MS) {
      violations.push({
        seed: options.seed,
        turnNumber: prevState.turnNumber,
        activeHouseId: actingHouseId,
        check: 'ai_watchdog',
        message: `AI turn exceeded watchdog (${elapsedMs.toFixed(1)}ms > ${AI_WATCHDOG_MS}ms)`,
      });
    }

    maxCombatResolutionsUsed = Math.max(maxCombatResolutionsUsed, res.metrics.combatResolutionsUsed);
    maxEconomyActionsUsed = Math.max(maxEconomyActionsUsed, res.metrics.economyActionsUsed);

    // Coordination & combat mechanic metrics
    totalKills += res.metrics.totalKills;
    focusFireKills += res.metrics.focusFireKills;
    oneShotProtectionTriggers += res.metrics.oneShotProtectionTriggers;
    braceTriggers += res.metrics.braceTriggers;

    if (res.metrics.attackersCount > 0) {
      aiAttackTurns += 1;
      if (res.metrics.attackersCount === 1) {
        if (res.metrics.singleAttackerDiedOnRetaliation) {
          piecemealTurns += 1;
        } else if (res.metrics.singleAttackerUnitId) {
          pendingSingleAttackerByHouse[actingHouseId] = res.metrics.singleAttackerUnitId;
        }
      }
    }

    // Track newly trained / spawned units
    for (const u of Object.values(state.units)) {
      if (!seenUnitIds.has(u.id)) {
        seenUnitIds.add(u.id);
        unitsTrainedByType[u.typeId] = (unitsTrainedByType[u.typeId] ?? 0) + 1;
      }
    }

    // Track Tier-2 turns & Specializations
    for (const k of Object.values(state.keeps)) {
      if (k.tier === 2 && tier2TurnByHouse[k.ownerHouseId] === null) {
        tier2TurnByHouse[k.ownerHouseId] = state.turnNumber;
      }
      if (k.specialization !== 'none' && !specializedKeepIds.has(k.id)) {
        specializedKeepIds.add(k.id);
        specPicks.push({ houseId: k.ownerHouseId, spec: k.specialization });
      }
    }

    // Track Corvus War Camps
    const warCampCount = Object.values(state.tiles).filter(
      (t) => t.improvement === 'war_camp' && t.ownerHouseId === 'corvus',
    ).length;
    if (warCampCount > corvusMaxWarCamps) {
      corvusMaxWarCamps = warCampCount;
    }

    // Track Keep ownership changes (for 25-turn stalemate check)
    const curKeepOwnershipKey = Object.values(state.keeps)
      .map((k) => `${k.id}:${k.ownerHouseId}`)
      .sort()
      .join('|');
    if (curKeepOwnershipKey !== prevKeepOwnershipKey) {
      lastKeepChangeTurn = state.turnNumber;
      prevKeepOwnershipKey = curKeepOwnershipKey;
    }

    // Track Writs published & completed
    if (state.crown.activeWrits.length > 0) {
      const batchKey = state.crown.activeWrits
        .map((w) => `${w.writId}@${w.publishedTurn}`)
        .join(',');
      if (batchKey !== seenWritBatchKey) {
        seenWritBatchKey = batchKey;
        for (const w of state.crown.activeWrits) {
          writsPublished[w.writId] = (writsPublished[w.writId] ?? 0) + 1;
        }
      }
      for (const w of state.crown.activeWrits) {
        if (w.completedByHouseId !== null) {
          const ck = `${w.writId}@${w.publishedTurn}`;
          if (!completedWritKeys.has(ck)) {
            completedWritKeys.add(ck);
            writsCompleted[w.writId] = (writsCompleted[w.writId] ?? 0) + 1;
          }
        }
      }
    }

    // Inspect newly appended Chronicle events
    const newChronicleCount = state.nextChronicleSeq - lastChronicleSeqSeen;
    if (newChronicleCount > 0) {
      const newEvents: ChronicleEvent[] = state.chronicle.slice(-newChronicleCount);
      for (const ev of newEvents) {
        if (
          firstContactTurn === null &&
          (ev.type === 'combat' || ev.type === 'unit_destroyed' || ev.type === 'keep_captured') &&
          ev.actorHouseId !== null &&
          ev.targetHouseId !== null &&
          ev.actorHouseId !== ev.targetHouseId
        ) {
          firstContactTurn = ev.turnNumber;
        }
        if (ev.type === 'mandate_claimed') mandateClaims += 1;
        if (ev.type === 'mandate_broken') mandateBroken += 1;
        if (ev.type === 'mandate_won') mandateWins += 1;
        if (ev.type === 'ai_watchdog_timeout') {
          violations.push({
            seed: options.seed,
            turnNumber: ev.turnNumber,
            activeHouseId: actingHouseId,
            check: 'ai_watchdog',
            message: ev.summary,
          });
        }
      }
      lastChronicleSeqSeen = state.nextChronicleSeq;
    }

    // Track Frontier Event triggers & infer choice selections on season start turns
    if (
      state.turnNumber > lastEventTurnRecorded &&
      state.turnNumber >= 4 &&
      (state.turnNumber - 1) % 3 === 0 &&
      state.recentEventIds.length > 0
    ) {
      lastEventTurnRecorded = state.turnNumber;
      const triggeredEventId = state.recentEventIds[state.recentEventIds.length - 1]!;
      eventCounts[triggeredEventId] = (eventCounts[triggeredEventId] ?? 0) + 1;

      if (triggeredEventId === 'evt_free_company') {
        const hired = Object.values(state.units).some(
          (u) => u.typeId === 'free_company_spearman' && u.spawnedOnTurn === state.turnNumber,
        );
        recordChoice(triggeredEventId, hired ? 'hire' : 'decline');
      } else if (triggeredEventId === 'evt_tournament') {
        for (const hid of houseOrder) {
          const prevH = prevState.houses[hid];
          const curH = state.houses[hid];
          if (!prevH || !curH || prevH.isEliminated || curH.isEliminated) continue;
          const entered = curH.stats.lifetimeFavor >= prevH.stats.lifetimeFavor + 2;
          recordChoice(triggeredEventId, entered ? 'enter' : 'decline');
        }
      } else if (triggeredEventId === 'evt_royal_levy') {
        const lostFavor = houseOrder.some((hid) => {
          const prevH = prevState.houses[hid];
          const curH = state.houses[hid];
          return prevH && curH && curH.favor < prevH.favor;
        });
        recordChoice(triggeredEventId, lostFavor ? 'lose_favor' : 'pay_coin');
      } else if (triggeredEventId === 'evt_deserters') {
        const sufferedDmg = Object.values(state.units).some((u) => {
          const prevU = prevState.units[u.id];
          return prevU && prevU.hp - u.hp >= 5;
        });
        recordChoice(triggeredEventId, sufferedDmg ? 'suffer_damage' : 'pay_bonus');
      }
    }

    // Sample units alive timeline on round transitions
    if (state.turnNumber > lastRoundSampled) {
      lastRoundSampled = state.turnNumber;
      if (timelineSampleTurns.has(state.turnNumber)) {
        const snap: Record<string, number> = {};
        for (const hid of houseOrder) {
          snap[hid] = getHouseUnits(state, hid).length;
        }
        unitsAliveTimeline[state.turnNumber] = snap;
      }
    }

    // Per-turn invariant checks (1–5)
    const stepViolations = checkGameInvariants(
      state,
      prevKeepSupported,
      prevKeepCaps,
      options.seed,
      checkJson,
    );
    if (stepViolations.length > 0) {
      violations.push(...stepViolations);
      break; // Abort game on first invariant failure (SIMULATION_HARNESS.md §3)
    }
    prevKeepSupported = snapshotKeepSupportedCounts(state);
    prevKeepCaps = snapshotKeepCaps(state);
  }

  // End-of-game summary
  const turnsPlayed = Math.min(state.turnNumber, maxTurns);
  const stalemateHitMaxTurns = state.phase !== 'game_over' && state.turnNumber > maxTurns;
  const stalemateNoKeepChange25 =
    options.mode === 'dominion' && turnsPlayed - lastKeepChangeTurn >= 25;
  const isStalemate =
    options.mode === 'dominion' && (stalemateHitMaxTurns || stalemateNoKeepChange25);

  const finalScores: Record<string, number> = {};
  const finalDecreesOwned: Record<string, number> = {};
  const finalDecreesBeyondStart: Record<string, number> = {};
  const finalDecreeIds: Record<string, readonly DecreeId[]> = {};
  for (const hid of houseOrder) {
    finalScores[hid] = computeScore(state, hid, true).total;
    const h = state.houses[hid]!;
    finalDecreesOwned[hid] = h.decreeIds.length;
    finalDecreesBeyondStart[hid] = Math.max(0, h.decreeIds.length - h.startingDecreeCount);
    finalDecreeIds[hid] = [...h.decreeIds];
  }

  let winnerHouseId = state.winnerHouseId;
  let victoryType: VictoryType | 'stalemate' = state.victoryType ?? 'stalemate';
  if (winnerHouseId === null && options.mode === 'chronicle') {
    const ranked = rankHousesByScore(state, true, false);
    winnerHouseId = ranked[0] ?? null;
    victoryType = 'score';
  }

  const winnerSeatIndex = winnerHouseId ? houseOrder.indexOf(winnerHouseId) : null;

  return {
    seed: options.seed,
    mode: options.mode,
    difficulty: options.difficulty,
    houseOrder,
    winnerHouseId,
    winnerSeatIndex,
    victoryType,
    turnsPlayed,
    stalemateHitMaxTurns,
    stalemateNoKeepChange25,
    isStalemate,
    finalStateHash: hashGameState(state),
    invariantViolations: violations,
    finalScores,
    finalDecreesOwned,
    finalDecreesBeyondStart,
    finalDecreeIds,
    tier2TurnByHouse,
    specPicks,
    writsPublished,
    writsCompleted,
    mandateClaims,
    mandateBroken,
    mandateWins,
    eventCounts,
    eventChoices,
    firstContactTurn,
    unitsAliveTimeline,
    aiTurnTimesMsByHouse,
    totalKills,
    focusFireKills,
    aiAttackTurns,
    piecemealTurns,
    oneShotProtectionTriggers,
    braceTriggers,
    unitsTrainedByType,
    corvusMaxWarCamps,
    watchtowerOccupiedTurns,
    maxCombatResolutionsUsed,
    maxEconomyActionsUsed,
  };
}

// Re-export unit/keep helpers for convenience
export { UNITS, getHouseKeeps, getHouseUnits };
