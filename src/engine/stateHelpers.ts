/**
 * Marchlands (Spec v0.3) — Pure Engine State Helpers & Initial State Builder
 *
 * Strictly headless, deterministic, immutable, JSON-serializable.
 */

import type {
  ChronicleEvent,
  ChronicleEventType,
  CoordKey,
  DecreeId,
  Difficulty,
  EventId,
  FogStatus,
  GameMode,
  GameState,
  HouseId,
  HouseState,
  KeepState,
  Season,
  TileState,
  UnitState,
} from '../types/game.ts';
import {
  CHRONICLE_MAX_ENTRIES,
  COIN_MILESTONE_STEP_BASE,
  CURRENT_SCHEMA_VERSION,
  GRID_SIZE,
  HOUSES,
  INITIAL_COIN_MILESTONE,
  KEEP_BASE_MAX_HP,
  KEEP_TIER1_ARMY_CAP,
  KEEP_TIER1_RADIUS,
  KEEP_TIER2_ARMY_CAP,
  KEEP_TIER2_RADIUS,
  PALISADE_CAP_GARRISON,
  PALISADE_CAP_TIER1,
  PALISADE_CAP_TIER2,
  SEASON_ORDER,
  SPEC_VERSION,
  STARTING_COIN,
  STARTING_MATERIALS,
  TURNS_PER_SEASON,
  TURNS_PER_YEAR,
  UNITS,
  WAR_CAMP_ARMY_CAP_BONUS,
  WRIT_FIRST_TURN,
} from '../data/index.ts';
import { coordKey, getTilesInRadius } from './coords.ts';
import { mapGen } from './mapGen.ts';
import { recomputeHouseFog } from './fog.ts';

export function getSeason(turnNumber: number): Season {
  const idx = Math.floor((Math.max(1, turnNumber) - 1) / TURNS_PER_SEASON) % SEASON_ORDER.length;
  return SEASON_ORDER[idx]!;
}

export function getYear(turnNumber: number): number {
  return Math.floor((Math.max(1, turnNumber) - 1) / TURNS_PER_YEAR) + 1;
}

export function houseHasDecree(house: HouseState, decreeId: DecreeId): boolean {
  return house.decreeIds.includes(decreeId);
}

export function houseHasActiveEffect(
  state: GameState,
  houseId: HouseId,
  effectId: EventId,
): boolean {
  return state.activeEffects.some(
    (e) =>
      e.effectId === effectId &&
      e.expiresAfterTurn >= state.turnNumber &&
      (e.houseId === null || e.houseId === houseId),
  );
}

export function getUnitAt(state: GameState, tileKey: CoordKey): UnitState | null {
  for (const unit of Object.values(state.units)) {
    if (unit.tileKey === tileKey) return unit;
  }
  return null;
}

export function getKeepAt(state: GameState, tileKey: CoordKey): KeepState | null {
  for (const keep of Object.values(state.keeps)) {
    if (keep.tileKey === tileKey) return keep;
  }
  return null;
}

export function getHouseKeeps(state: GameState, houseId: HouseId): KeepState[] {
  return Object.values(state.keeps).filter((k) => k.ownerHouseId === houseId);
}

export function getHouseUnits(state: GameState, houseId: HouseId): UnitState[] {
  return Object.values(state.units).filter((u) => u.houseId === houseId);
}

export function getKeepRadius(keep: KeepState): number {
  return keep.tier === 2 ? KEEP_TIER2_RADIUS : KEEP_TIER1_RADIUS;
}

export function getKeepPalisadeCap(keep: KeepState): number {
  if (keep.tier === 1) return PALISADE_CAP_TIER1;
  return keep.specialization === 'garrison' ? PALISADE_CAP_GARRISON : PALISADE_CAP_TIER2;
}

export function getKeepArmyCap(state: GameState, keepId: string): number {
  const keep = state.keeps[keepId];
  if (!keep) return 0;
  let cap = keep.tier === 2 ? KEEP_TIER2_ARMY_CAP : KEEP_TIER1_ARMY_CAP;
  if (keep.specialization === 'garrison') {
    cap += 1;
  }
  // Check for Corvus war_camp inside this Keep's territory
  const hasWarCamp = Object.values(state.tiles).some(
    (t) =>
      t.keepId === keepId &&
      t.ownerHouseId === keep.ownerHouseId &&
      t.improvement === 'war_camp',
  );
  if (hasWarCamp) {
    cap += WAR_CAMP_ARMY_CAP_BONUS;
  }
  return cap;
}

export function getKeepSupportedUnitIds(state: GameState, keepId: string): string[] {
  const out: string[] = [];
  for (const unit of Object.values(state.units)) {
    if (unit.homeKeepId === keepId && UNITS[unit.typeId].countsTowardArmyCap) {
      out.push(unit.id);
    }
  }
  return out;
}

/**
 * Adds gross Coin to a House, tracking lifetimeCoinEarned and escalating
 * Coin Draft Milestones (25 -> 65 -> 125 -> 205 -> 305...).
 */
export function addLifetimeCoin(house: HouseState, amount: number): HouseState {
  if (amount <= 0) return house;
  const coin = house.resources.coin + amount;
  const lifetimeCoinEarned = house.lifetimeCoinEarned + amount;
  let coinMilestonesClaimed = house.coinMilestonesClaimed;
  let nextCoinMilestone = house.nextCoinMilestone;
  let pendingDraftCount = house.pendingDraftCount;

  while (lifetimeCoinEarned >= nextCoinMilestone) {
    pendingDraftCount += 1;
    coinMilestonesClaimed += 1;
    nextCoinMilestone += COIN_MILESTONE_STEP_BASE * (coinMilestonesClaimed + 1);
  }

  return {
    ...house,
    resources: {
      ...house.resources,
      coin,
    },
    lifetimeCoinEarned,
    coinMilestonesClaimed,
    nextCoinMilestone,
    pendingDraftCount,
  };
}

/**
 * Adjusts Royal Favor. Positive deltas also increment stats.lifetimeFavor.
 * Negative deltas clamp current favor at >= 0 without reducing lifetimeFavor.
 */
export function addFavor(house: HouseState, delta: number): HouseState {
  if (delta === 0) return house;
  const newFavor = Math.max(0, house.favor + delta);
  const lifetimeFavor =
    delta > 0 ? house.stats.lifetimeFavor + delta : house.stats.lifetimeFavor;
  return {
    ...house,
    favor: newFavor,
    stats: {
      ...house.stats,
      lifetimeFavor,
    },
  };
}

/**
 * Appends a ChronicleEvent to the bounded 300-entry ring buffer.
 */
export function appendChronicle(
  state: GameState,
  event: {
    type: ChronicleEventType;
    actorHouseId: HouseId | null;
    targetHouseId: HouseId | null;
    tileKey: CoordKey | null;
    summary: string;
    isPublic: boolean;
  },
): GameState {
  const id = `chr_${state.nextChronicleSeq}`;
  const entry: ChronicleEvent = {
    id,
    turnNumber: state.turnNumber,
    ...event,
  };
  const nextChronicle =
    state.chronicle.length >= CHRONICLE_MAX_ENTRIES
      ? [...state.chronicle.slice(state.chronicle.length - CHRONICLE_MAX_ENTRIES + 1), entry]
      : [...state.chronicle, entry];

  return {
    ...state,
    chronicle: nextChronicle,
    nextChronicleSeq: state.nextChronicleSeq + 1,
  };
}

/**
 * Allocates the next settlement name from a House's 10-name pool (falling back to numbered suffix).
 */
export function allocateSettlementName(house: HouseState): {
  name: string;
  updatedHouse: HouseState;
} {
  const pool = HOUSES[house.id].settlementNames;
  const idx = house.settlementNamesUsed;
  const name = idx < pool.length ? pool[idx]! : `${pool[0]!} Hold ${idx - pool.length + 2}`;
  return {
    name,
    updatedHouse: {
      ...house,
      settlementNamesUsed: idx + 1,
    },
  };
}

export interface NewGameOptions {
  readonly seed: number;
  readonly houseCount: 4 | 5;
  readonly mode: GameMode;
  readonly difficulty: Difficulty;
  readonly humanHouseId: HouseId | null;
  readonly customHouseOrder?: readonly HouseId[];
}

/**
 * Creates a complete, valid, deterministic Turn-1 GameState from mapGen(seed, houseCount).
 */
export function createInitialGameState(options: NewGameOptions): GameState {
  const gen = mapGen(options.seed, options.houseCount, options.customHouseOrder);
  const houseOrder = [...gen.houseOrder];
  const tiles: Record<CoordKey, TileState> = {};
  for (const [k, t] of Object.entries(gen.tiles)) {
    tiles[k] = { ...t, revealedByHouseIds: [...t.revealedByHouseIds] };
  }

  const houses: Record<string, HouseState> = {};
  const keeps: Record<string, KeepState> = {};
  const fog: Record<string, Record<CoordKey, FogStatus>> = {};
  let nextKeepSeq = 1;

  for (const houseId of houseOrder) {
    const def = HOUSES[houseId];
    const capCoord = gen.capitals[houseId]!;
    const capKey = coordKey(capCoord.x, capCoord.y);
    const keepId = `keep_${nextKeepSeq}`;
    nextKeepSeq += 1;

    keeps[keepId] = {
      id: keepId,
      name: def.settlementNames[0]!,
      ownerHouseId: houseId,
      tileKey: capKey,
      x: capCoord.x,
      y: capCoord.y,
      tier: 1,
      isCapital: true,
      specialization: 'none',
      keepHp: KEEP_BASE_MAX_HP,
      maxKeepHp: KEEP_BASE_MAX_HP,
      damagedLastRound: false,
      foodProgress: 0,
      repeatMilestonesClaimed: 0,
    };

    // Sticky 3x3 territory claim around Capital
    for (const c of getTilesInRadius(capCoord.x, capCoord.y, KEEP_TIER1_RADIUS)) {
      const tk = coordKey(c.x, c.y);
      const tile = tiles[tk]!;
      if (tile.keepId === null) {
        tile.keepId = keepId;
        tile.ownerHouseId = houseId;
      }
    }

    houses[houseId] = {
      id: houseId,
      isHuman: options.humanHouseId === houseId,
      isEliminated: false,
      resources: {
        materials: STARTING_MATERIALS,
        coin: STARTING_COIN,
      },
      favor: 0,
      audienceUsedThisTurn: false,
      lifetimeCoinEarned: 0,
      coinMilestonesClaimed: 0,
      nextCoinMilestone: INITIAL_COIN_MILESTONE,
      decreeIds: [...def.startingDecreeIds],
      startingDecreeCount: def.startingDecreeCount,
      pendingDraftCount: 0,
      pendingSpecializationKeepIds: [],
      settlementNamesUsed: 1,
      stats: {
        unitsDestroyed: 0,
        keepsCaptured: 0,
        ruinsExplored: 0,
        campsCleared: 0,
        watchtowersReached: 0,
        tilesRevealed: 0,
        lifetimeFavor: 0,
      },
      writProgress: {},
      aiPlan: null,
    };

    const houseFog: Record<CoordKey, FogStatus> = {};
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        houseFog[coordKey(x, y)] = 'unexplored';
      }
    }
    fog[houseId] = houseFog;
  }

  let state: GameState = {
    version: CURRENT_SCHEMA_VERSION,
    specVersion: SPEC_VERSION,
    mode: options.mode,
    difficulty: options.difficulty,
    gridSize: GRID_SIZE,
    turnNumber: 1,
    rngSeed: options.seed,
    rngCounter: gen.rngCounter,
    phase: options.humanHouseId === houseOrder[0] ? 'player_command' : 'ai_turn',
    humanHouseId: options.humanHouseId,
    houseOrder,
    activeHouseId: houseOrder[0]!,
    winnerHouseId: null,
    victoryType: null,
    tiles,
    keeps,
    units: {},
    houses,
    fog,
    crown: {
      activeWrits: [],
      nextWritTurn: WRIT_FIRST_TURN,
      recentWritIds: [],
      claimantHouseId: null,
      claimStartTurn: null,
      claimCooldowns: {},
    },
    activeEffects: [],
    recentEventIds: [],
    chronicle: [],
    pendingDraftChoices: null,
    pendingEventChoice: null,
    nextUnitSeq: 1,
    nextKeepSeq,
    nextEffectSeq: 1,
    nextChronicleSeq: 1,
  };

  // Compute initial fog-of-war for every House
  for (const houseId of houseOrder) {
    state = recomputeHouseFog(state, houseId);
  }

  return state;
}
