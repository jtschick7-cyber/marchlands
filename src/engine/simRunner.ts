/**
 * Marchlands (Spec v2.0) — Headless Simulation Runner & Per-Turn Invariant Checker
 *
 * Strictly headless (zero React, zero Node fs/path). Shared by `scripts/sim.ts`
 * and `src/engine/__tests__/simSmoke.test.ts`.
 */

import type {
  ChronicleEvent,
  ChronicleLength,
  CitadelCharter,
  DecreeId,
  Difficulty,
  EventId,
  GameMode,
  GameState,
  HouseId,
  KeepSpecialization,
  MapPreset,
  VictoryType,
} from '../types/game.ts';
import {
  AI_COMBAT_RESOLUTION_BUDGET,
  AI_WATCHDOG_MS,
  DEFAULT_CHRONICLE_LIMIT,
  DEFAULT_MAP_PRESET,
  HOUSE_IDS,
  MAP_PRESETS,
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
  readonly mapPreset?: MapPreset;
  readonly chronicleLimit?: ChronicleLength;
  readonly maxTurns?: number;
  readonly seatRotation?: number;
  readonly difficultyByHouse?: Partial<Record<HouseId, Difficulty>>;
  readonly checkJsonRoundTrip?: boolean;
}

export interface SimGameResult {
  readonly seed: number;
  readonly mapPreset: MapPreset;
  readonly mode: GameMode;
  readonly difficulty: Difficulty;
  readonly houseOrder: readonly HouseId[];
  readonly winnerHouseId: HouseId | null;
  readonly winnerSeatIndex: number | null;
  readonly victoryType: VictoryType | 'stalemate';
  readonly turnsPlayed: number;
  readonly stalemateHitMaxTurns: boolean;
  readonly stalemateNoKeepChange: boolean;
  readonly isStalemate: boolean;
  readonly finalStateHash: string;
  readonly invariantViolations: readonly InvariantViolation[];

  // Per-House end-of-game snapshots
  readonly finalScores: Readonly<Record<string, number>>;
  readonly finalDecreesOwned: Readonly<Record<string, number>>;
  readonly finalDecreesBeyondStart: Readonly<Record<string, number>>;
  readonly finalDecreeIds: Readonly<Record<string, readonly DecreeId[]>>;
  readonly tier2TurnByHouse: Readonly<Record<string, number | null>>;
  readonly tier3TurnByHouse: Readonly<Record<string, number | null>>;

  // Specializations & Citadel Charters
  readonly specPicks: readonly { houseId: HouseId; spec: Exclude<KeepSpecialization, 'none'> }[];
  readonly charterPicks: readonly { houseId: HouseId; charter: Exclude<CitadelCharter, 'none'> }[];
  readonly tier3CitadelsBuilt: number;

  // Writs & Mandate
  readonly writsPublished: Readonly<Record<string, number>>;
  readonly writsCompleted: Readonly<Record<string, number>>;
  readonly mandateClaims: number;
  readonly mandateBroken: number;
  readonly mandateWins: number;

  // Frontier Events & Choices
  readonly eventCounts: Readonly<Record<string, number>>;
  readonly eventChoices: Readonly<Record<string, Record<string, number>>>;

  // Combat, Pacing & v2.0 Mechanics
  readonly firstContactTurn: number | null;
  readonly unitsAliveTimeline: Readonly<Record<number, Readonly<Record<string, number>>>>;
  readonly aiTurnTimesMsByHouse: Readonly<Record<string, readonly number[]>>;
  readonly totalKills: number;
  readonly focusFireKills: number;
  readonly aiAttackTurns: number;
  readonly piecemealTurns: number;
  readonly oneShotProtectionTriggers: number;
  readonly braceTriggers: number;
  readonly commanderSkillsUsed: number;
  readonly commanderWounds: number;
  readonly outpostsFounded: number;
  readonly reinforcesUsed: number;
  readonly lv2UpgradesFinal: number;
  readonly roadsFinal: number;
  readonly highSeatCaptured: boolean;
  readonly unitsTrainedByType: Readonly<Record<string, number>>;
  readonly corvusMaxWarCamps: number;
  readonly watchtowerOccupiedTurns: number;
  readonly maxCombatResolutionsUsed: number;
  readonly maxEconomyActionsUsed: number;
}

export function getRotatedHouseOrder(houseCount: 4 | 5, seatRotation: number): HouseId[] {
  const base = HOUSE_IDS.slice(0, houseCount);
  const shift = ((seatRotation % base.length) + base.length) % base.length;
  return [...base.slice(shift), ...base.slice(0, shift)];
}

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
 * Enforces v2.0 Invariants 1–5 from `docs/SIMULATION_HARNESS.md` §2.
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

  // 1. No negative resources (materials >= 0, iron >= 0, coin >= 0, favor >= 0)
  for (const house of Object.values(state.houses)) {
    if (house.resources.materials < 0) {
      push('non_negative_resources', `${house.id} has negative materials: ${house.resources.materials}`);
    }
    if (house.resources.iron < 0) {
      push('non_negative_resources', `${house.id} has negative iron: ${house.resources.iron}`);
    }
    if (house.resources.coin < 0) {
      push('non_negative_resources', `${house.id} has negative coin: ${house.resources.coin}`);
    }
    if (house.favor < 0) {
      push('non_negative_resources', `${house.id} has negative favor: ${house.favor}`);
    }
  }

  // 2. Unit coords in bounds, never on mountain, zero tile overlaps
  const occupiedTiles = new Map<string, string>();
  for (const unit of Object.values(state.units)) {
    if (
      unit.x < 0 ||
      unit.x >= state.gridSize ||
      unit.y < 0 ||
      unit.y >= state.gridSize ||
      unit.tileKey !== coordKey(unit.x, unit.y)
    ) {
      push(
        'unit_bounds',
        `Unit ${unit.id} out of bounds or mismatched tileKey (${unit.x},${unit.y} vs ${unit.tileKey})`,
      );
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

  // 3. Keep Army Caps respected (+ documented over-cap exceptions: War Camp loss, Garrison capture)
  for (const keep of Object.values(state.keeps)) {
    const cap = getKeepArmyCap(state, keep.id);
    const supported = getKeepSupportedUnitIds(state, keep.id).length;
    if (supported > cap) {
      const prevSupported = prevKeepSupportedCounts[keep.id] ?? 0;
      const prevCap = prevKeepCaps[keep.id] ?? cap;
      const isCapLossException =
        (supported <= prevSupported && supported <= cap + 2) ||
        (cap < prevCap && supported <= prevCap);
      if (!isCapLossException) {
        push(
          'keep_army_cap',
          `Keep ${keep.id} (${keep.ownerHouseId}) has ${supported} supported units exceeding cap ${cap} (prev ${prevSupported}, prevCap ${prevCap})`,
        );
      }
    }
  }

  // 4. Owned tile keepId / outpostId referential integrity (incl. border Watchtowers)
  for (const tile of Object.values(state.tiles)) {
    if (tile.keepId !== null && !state.keeps[tile.keepId]) {
      push('tile_keep_ref', `Tile ${tile.key} references missing keepId ${tile.keepId}`);
    }
    if (tile.outpostId !== null && !state.outposts[tile.outpostId]) {
      push('tile_outpost_ref', `Tile ${tile.key} references missing outpostId ${tile.outpostId}`);
    }
    if (tile.ownerHouseId !== null) {
      if (tile.keepId !== null) {
        const k = state.keeps[tile.keepId];
        if (!k) {
          push('tile_keep_ref', `Owned tile ${tile.key} (${tile.ownerHouseId}) missing keep ${tile.keepId}`);
        } else if (k.ownerHouseId !== tile.ownerHouseId) {
          push(
            'tile_keep_ref',
            `Owned tile ${tile.key} owner (${tile.ownerHouseId}) mismatches keep ${tile.keepId} owner (${k.ownerHouseId})`,
          );
        }
      } else if (tile.outpostId !== null) {
        const o = state.outposts[tile.outpostId];
        if (!o) {
          push(
            'tile_outpost_ref',
            `Owned tile ${tile.key} (${tile.ownerHouseId}) missing outpost ${tile.outpostId}`,
          );
        } else if (o.ownerHouseId !== tile.ownerHouseId) {
          push(
            'tile_outpost_ref',
            `Owned tile ${tile.key} owner (${tile.ownerHouseId}) mismatches outpost ${tile.outpostId} owner (${o.ownerHouseId})`,
          );
        }
      } else if (tile.improvement !== 'watchtower' && tile.improvement !== 'signal_bastion') {
        push(
          'tile_owner_ref',
          `Owned tile ${tile.key} (${tile.ownerHouseId}) has no keepId/outpostId and is not a border watchtower (${tile.improvement})`,
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

export function runSimulatedGame(options: SimGameOptions): SimGameResult {
  const mapPreset: MapPreset = options.mapPreset ?? DEFAULT_MAP_PRESET;
  const presetCfg = MAP_PRESETS[mapPreset];
  const chronicleLimit: ChronicleLength = options.chronicleLimit ?? DEFAULT_CHRONICLE_LIMIT;
  const maxTurns =
    options.maxTurns ??
    (options.mode === 'chronicle' ? chronicleLimit : presetCfg.defaultMaxTurns);
  const houseOrder = getRotatedHouseOrder(options.houseCount, options.seatRotation ?? 0);
  const checkJson = options.checkJsonRoundTrip ?? true;

  let state = createInitialGameState({
    seed: options.seed,
    houseCount: options.houseCount,
    mode: options.mode,
    difficulty: options.difficultyByHouse?.[houseOrder[0]!] ?? options.difficulty,
    mapPreset,
    chronicleLimit,
    humanHouseId: null,
    customHouseOrder: houseOrder,
  });

  const violations: InvariantViolation[] = [];
  let prevKeepSupported = snapshotKeepSupportedCounts(state);
  let prevKeepCaps = snapshotKeepCaps(state);

  const tier2TurnByHouse: Record<string, number | null> = {};
  const tier3TurnByHouse: Record<string, number | null> = {};
  for (const hid of houseOrder) {
    tier2TurnByHouse[hid] = null;
    tier3TurnByHouse[hid] = null;
  }

  const specializedKeepIds = new Set<string>();
  const specPicks: { houseId: HouseId; spec: Exclude<KeepSpecialization, 'none'> }[] = [];
  const charteredKeepIds = new Set<string>();
  const charterPicks: { houseId: HouseId; charter: Exclude<CitadelCharter, 'none'> }[] = [];
  const tier3KeepIds = new Set<string>();

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
  const timelineSampleTurns = new Set([10, 20, 35, 50, 75, 100]);

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
  let commanderSkillsUsed = 0;
  let commanderWounds = 0;
  let outpostsFounded = 0;
  let reinforcesUsed = 0;
  const unitsTrainedByType: Record<string, number> = {};
  const seenUnitIds = new Set<string>(Object.keys(state.units)); // Exclude Turn-1 starting Commanders from trained count
  let corvusMaxWarCamps = 0;
  let watchtowerOccupiedTurns = 0;
  let maxCombatResolutionsUsed = 0;
  let maxEconomyActionsUsed = 0;
  let highSeatCaptured = false;

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

    const prevSingleAttackerId = pendingSingleAttackerByHouse[actingHouseId];
    if (prevSingleAttackerId !== null) {
      if (!state.units[prevSingleAttackerId]) {
        piecemealTurns += 1;
      }
      pendingSingleAttackerByHouse[actingHouseId] = null;
    }

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

    totalKills += res.metrics.totalKills;
    focusFireKills += res.metrics.focusFireKills;
    oneShotProtectionTriggers += res.metrics.oneShotProtectionTriggers;
    braceTriggers += res.metrics.braceTriggers;
    commanderSkillsUsed += res.metrics.commanderSkillsUsed;
    outpostsFounded += res.metrics.outpostsFounded;
    reinforcesUsed += res.metrics.reinforcesUsed;

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

    for (const u of Object.values(state.units)) {
      if (!seenUnitIds.has(u.id)) {
        seenUnitIds.add(u.id);
        unitsTrainedByType[u.typeId] = (unitsTrainedByType[u.typeId] ?? 0) + 1;
      }
    }

    for (const k of Object.values(state.keeps)) {
      if (k.tier >= 2 && tier2TurnByHouse[k.ownerHouseId] === null) {
        tier2TurnByHouse[k.ownerHouseId] = state.turnNumber;
      }
      if (k.tier === 3) {
        if (tier3TurnByHouse[k.ownerHouseId] === null) {
          tier3TurnByHouse[k.ownerHouseId] = state.turnNumber;
        }
        tier3KeepIds.add(k.id);
      }
      if (k.specialization !== 'none' && !specializedKeepIds.has(k.id)) {
        specializedKeepIds.add(k.id);
        specPicks.push({ houseId: k.ownerHouseId, spec: k.specialization });
      }
      if (k.citadelCharter !== 'none' && !charteredKeepIds.has(k.id)) {
        charteredKeepIds.add(k.id);
        charterPicks.push({ houseId: k.ownerHouseId, charter: k.citadelCharter });
      }
      if (k.isHighSeat) {
        highSeatCaptured = true;
      }
    }

    const warCampCount = Object.values(state.tiles).filter(
      (t) => t.improvement === 'war_camp' && t.ownerHouseId === 'corvus',
    ).length;
    if (warCampCount > corvusMaxWarCamps) {
      corvusMaxWarCamps = warCampCount;
    }

    const curKeepOwnershipKey = Object.values(state.keeps)
      .map((k) => `${k.id}:${k.ownerHouseId}`)
      .sort()
      .join('|');
    if (curKeepOwnershipKey !== prevKeepOwnershipKey) {
      lastKeepChangeTurn = state.turnNumber;
      prevKeepOwnershipKey = curKeepOwnershipKey;
    }

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
        if (ev.type === 'commander_wounded') commanderWounds += 1;
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

    const shouldCheckJson =
      checkJson &&
      ((state.activeHouseId === state.houseOrder[0] && state.turnNumber % 5 === 1) ||
        state.phase === 'game_over');
    const stepViolations = checkGameInvariants(
      state,
      prevKeepSupported,
      prevKeepCaps,
      options.seed,
      shouldCheckJson,
    );
    if (stepViolations.length > 0) {
      violations.push(...stepViolations);
      break;
    }
    prevKeepSupported = snapshotKeepSupportedCounts(state);
    prevKeepCaps = snapshotKeepCaps(state);
  }

  const turnsPlayed = Math.min(state.turnNumber, maxTurns);
  const stalemateHitMaxTurns = state.phase !== 'game_over' && state.turnNumber > maxTurns;
  const noChangeWindow = mapPreset === 'grand' ? 40 : mapPreset === 'standard' ? 32 : 25;
  const stalemateNoKeepChange =
    options.mode === 'dominion' &&
    state.phase !== 'game_over' &&
    turnsPlayed - lastKeepChangeTurn >= noChangeWindow;
  const isStalemate =
    options.mode === 'dominion' && (stalemateHitMaxTurns || stalemateNoKeepChange);

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

  let lv2UpgradesFinal = 0;
  let roadsFinal = 0;
  for (const t of Object.values(state.tiles)) {
    if (t.improvementLevel === 2) lv2UpgradesFinal += 1;
    if (t.hasRoad) roadsFinal += 1;
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
    mapPreset,
    mode: options.mode,
    difficulty: options.difficulty,
    houseOrder,
    winnerHouseId,
    winnerSeatIndex,
    victoryType,
    turnsPlayed,
    stalemateHitMaxTurns,
    stalemateNoKeepChange,
    isStalemate,
    finalStateHash: hashGameState(state),
    invariantViolations: violations,
    finalScores,
    finalDecreesOwned,
    finalDecreesBeyondStart,
    finalDecreeIds,
    tier2TurnByHouse,
    tier3TurnByHouse,
    specPicks,
    charterPicks,
    tier3CitadelsBuilt: tier3KeepIds.size,
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
    commanderSkillsUsed,
    commanderWounds,
    outpostsFounded,
    reinforcesUsed,
    lv2UpgradesFinal,
    roadsFinal,
    highSeatCaptured,
    unitsTrainedByType,
    corvusMaxWarCamps,
    watchtowerOccupiedTurns,
    maxCombatResolutionsUsed,
    maxEconomyActionsUsed,
  };
}

export { UNITS, getHouseKeeps, getHouseUnits };
