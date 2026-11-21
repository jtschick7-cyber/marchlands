/**
 * Marchlands (Spec v2.0) — Pure Engine State Helpers & Initial State Builder
 *
 * Strictly headless, deterministic, immutable, JSON-serializable.
 * Uses WeakMap-backed spatial indexing for O(1) lookups on 34x34 maps.
 */

import type {
  BattleHonorId,
  ChronicleEvent,
  ChronicleEventType,
  ChronicleLength,
  CommanderState,
  CommanderTraitId,
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
  MapPreset,
  MapPresetConfig,
  OutpostState,
  Season,
  TileState,
  UnitState,
} from '../types/game.ts';
import {
  CHRONICLE_MAX_ENTRIES,
  COIN_MILESTONE_STEP_BASE,
  COMMANDER_BASE_HP,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CHRONICLE_LIMIT,
  DEFAULT_MAP_PRESET,
  HOUSES,
  INITIAL_COIN_MILESTONE,
  KEEP_GARRISON_HP_BONUS,
  KEEP_STONE_CURTAIN_HP_MULT,
  KEEP_TIER1_ARMY_CAP,
  KEEP_TIER1_MAX_HP,
  KEEP_TIER1_RADIUS,
  KEEP_TIER2_ARMY_CAP,
  KEEP_TIER2_MAX_HP,
  KEEP_TIER2_RADIUS,
  KEEP_TIER3_ARMY_CAP,
  KEEP_TIER3_MAX_HP,
  KEEP_TIER3_RADIUS,
  MAP_PRESETS,
  OUTPOST_BASE_CAP,
  OUTPOST_BORDER_WARDENS_CAP,
  SEASON_ORDER,
  SPEC_VERSION,
  STARTING_COIN,
  STARTING_IRON,
  STARTING_MATERIALS,
  TURNS_PER_SEASON,
  TURNS_PER_YEAR,
  UNITS,
  WALL_CAP_GARRISON_BONUS,
  WALL_CAP_TIER1,
  WALL_CAP_TIER2,
  WALL_CAP_TIER3,
  WAR_CAMP_ARMY_CAP_BONUS,
  WATCHTOWER_CAP_TIER1,
  WATCHTOWER_CAP_TIER2,
  WATCHTOWER_CAP_TIER3,
  WRIT_FIRST_TURN,
} from '../data/index.ts';
import { chebyshevDist, coordKey, getTilesInRadius } from './coords.ts';
import { recomputeHouseFog } from './fog.ts';
import { mapGen } from './mapGen.ts';
import { getIndexedKeepTiles, getSpatialIndex } from './spatialIndex.ts';

export function getSeason(turnNumber: number): Season {
  const idx = Math.floor((Math.max(1, turnNumber) - 1) / TURNS_PER_SEASON) % SEASON_ORDER.length;
  return SEASON_ORDER[idx]!;
}

export function getYear(turnNumber: number): number {
  return Math.floor((Math.max(1, turnNumber) - 1) / TURNS_PER_YEAR) + 1;
}

export function getMapPresetConfig(state: GameState): MapPresetConfig {
  return MAP_PRESETS[state.mapPreset];
}

export function houseHasDecree(house: HouseState | undefined, decreeId: DecreeId): boolean {
  return house ? house.decreeIds.includes(decreeId) : false;
}

export function unitHasHonor(unit: UnitState | undefined, honorId: BattleHonorId): boolean {
  return unit ? unit.battleHonors.includes(honorId) : false;
}

export function hasCommanderTrait(
  state: GameState,
  houseId: HouseId,
  traitId: CommanderTraitId,
): boolean {
  return state.commanders[houseId]?.traits.includes(traitId) ?? false;
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
  return getSpatialIndex(state).unitByTileKey[tileKey] ?? null;
}

export function getKeepAt(state: GameState, tileKey: CoordKey): KeepState | null {
  return getSpatialIndex(state).keepByTileKey[tileKey] ?? null;
}

export function getOutpostAt(state: GameState, tileKey: CoordKey): OutpostState | null {
  return getSpatialIndex(state).outpostByTileKey[tileKey] ?? null;
}

export function getHouseKeeps(state: GameState, houseId: HouseId): KeepState[] {
  return [...(getSpatialIndex(state).keepsByOwner[houseId] ?? [])];
}

export function getHouseOutposts(state: GameState, houseId: HouseId): OutpostState[] {
  return [...(getSpatialIndex(state).outpostsByOwner[houseId] ?? [])];
}

export function getHouseUnits(state: GameState, houseId: HouseId): UnitState[] {
  return [...(getSpatialIndex(state).unitsByOwner[houseId] ?? [])];
}

export function getCommanderUnit(state: GameState, houseId: HouseId): UnitState | null {
  const cmd = state.commanders[houseId];
  if (!cmd || !cmd.unitId) return null;
  return state.units[cmd.unitId] ?? null;
}

export function isAdjacentToFriendlyCommander(state: GameState, unit: UnitState): boolean {
  if (unit.isCommander) return false;
  const cmdUnit = getCommanderUnit(state, unit.houseId);
  if (!cmdUnit) return false;
  return chebyshevDist(unit.x, unit.y, cmdUnit.x, cmdUnit.y) <= 1;
}

export function getKeepRadius(keep: KeepState): number {
  if (keep.tier === 3) return KEEP_TIER3_RADIUS;
  if (keep.tier === 2) return KEEP_TIER2_RADIUS;
  return KEEP_TIER1_RADIUS;
}

export function getKeepWallCap(keep: KeepState): number {
  const base =
    keep.tier === 3 ? WALL_CAP_TIER3 : keep.tier === 2 ? WALL_CAP_TIER2 : WALL_CAP_TIER1;
  return base + (keep.specialization === 'garrison' ? WALL_CAP_GARRISON_BONUS : 0);
}

// Alias for compatibility with existing callers
export const getKeepPalisadeCap = getKeepWallCap;

export function getKeepWatchtowerCap(keep: KeepState): number {
  if (keep.tier === 3) return WATCHTOWER_CAP_TIER3;
  if (keep.tier === 2) return WATCHTOWER_CAP_TIER2;
  return WATCHTOWER_CAP_TIER1;
}

export function computeKeepMaxHp(keep: KeepState, house: HouseState | undefined): number {
  let base =
    keep.tier === 3 ? KEEP_TIER3_MAX_HP : keep.tier === 2 ? KEEP_TIER2_MAX_HP : KEEP_TIER1_MAX_HP;
  if (keep.specialization === 'garrison') {
    base += KEEP_GARRISON_HP_BONUS;
  }
  if (houseHasDecree(house, 'decree_stone_curtain')) {
    base = Math.round(base * KEEP_STONE_CURTAIN_HP_MULT);
  }
  return base;
}

export function getHouseOutpostCap(house: HouseState | undefined): number {
  return houseHasDecree(house, 'decree_border_wardens')
    ? OUTPOST_BORDER_WARDENS_CAP
    : OUTPOST_BASE_CAP;
}

export function getKeepArmyCap(state: GameState, keepId: string): number {
  const keep = state.keeps[keepId];
  if (!keep) return 0;
  const house = state.houses[keep.ownerHouseId];
  let cap =
    keep.tier === 3
      ? KEEP_TIER3_ARMY_CAP
      : keep.tier === 2
        ? KEEP_TIER2_ARMY_CAP
        : KEEP_TIER1_ARMY_CAP;
  if (keep.specialization === 'garrison') {
    cap += 1;
  }
  if (keep.tier >= 2 && houseHasDecree(house, 'decree_feudal_levies')) {
    cap += 1;
  }
  const hasWarCamp = getIndexedKeepTiles(state, keepId).some(
    (t) => t.ownerHouseId === keep.ownerHouseId && t.improvement === 'war_camp',
  );
  if (hasWarCamp) {
    cap += WAR_CAMP_ARMY_CAP_BONUS;
  }
  return cap;
}

export function getKeepSupportedUnitIds(state: GameState, keepId: string): string[] {
  const list = getSpatialIndex(state).unitsByHomeKeepId[keepId] ?? [];
  const out: string[] = [];
  for (const unit of list) {
    if (UNITS[unit.typeId].countsTowardArmyCap) {
      out.push(unit.id);
    }
  }
  return out;
}

/**
 * Adds gross Coin to a House, tracking lifetimeCoinEarned and escalating
 * Doctrine Pair Draft Milestones (60 -> 150 -> 285 -> 465 -> 690...).
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
  readonly mapPreset?: MapPreset;
  readonly chronicleLimit?: ChronicleLength;
  readonly customHouseOrder?: readonly HouseId[];
}

export function createInitialGameState(options: NewGameOptions): GameState {
  const mapPreset = options.mapPreset ?? DEFAULT_MAP_PRESET;
  const chronicleLimit = options.chronicleLimit ?? DEFAULT_CHRONICLE_LIMIT;
  const gen = mapGen(options.seed, options.houseCount, options.customHouseOrder, mapPreset);
  const gridSize = gen.gridSize;
  const houseOrder = [...gen.houseOrder];

  const tiles: Record<CoordKey, TileState> = {};
  for (const [k, t] of Object.entries(gen.tiles)) {
    tiles[k] = { ...t, revealedByHouseIds: [...t.revealedByHouseIds] };
  }

  const houses: Record<string, HouseState> = {};
  const keeps: Record<string, KeepState> = {};
  const units: Record<string, UnitState> = {};
  const commanders: Record<string, CommanderState> = {};
  const fog: Record<string, Record<CoordKey, FogStatus>> = {};
  let nextKeepSeq = 1;
  let nextUnitSeq = 1;

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
      isHighSeat: false,
      specialization: 'none',
      citadelCharter: 'none',
      keepHp: KEEP_TIER1_MAX_HP,
      maxKeepHp: KEEP_TIER1_MAX_HP,
      damagedLastRound: false,
      garrisonVolleyUsedThisTurn: false,
      foodProgress: 0,
      repeatMilestonesClaimed: 0,
    };

    // Sticky 3x3 territory claim around Capital
    for (const c of getTilesInRadius(capCoord.x, capCoord.y, KEEP_TIER1_RADIUS, gridSize)) {
      const tk = coordKey(c.x, c.y);
      const tile = tiles[tk]!;
      if (tile.keepId === null && tile.outpostId === null) {
        tile.keepId = keepId;
        tile.ownerHouseId = houseId;
      }
    }

    // Spawn starting Lord-Commander at Capital (ready on Turn 1)
    const cmdUnitId = `unit_${nextUnitSeq}`;
    nextUnitSeq += 1;
    units[cmdUnitId] = {
      id: cmdUnitId,
      houseId,
      typeId: 'lord_commander',
      homeKeepId: 'commander',
      tileKey: capKey,
      x: capCoord.x,
      y: capCoord.y,
      hp: COMMANDER_BASE_HP,
      maxHp: COMMANDER_BASE_HP,
      remainingMovement: def.commanderMovement,
      hasMoved: false,
      hasAttacked: false,
      spawnedOnTurn: 0,
      isMutinied: false,
      damagedSinceLastTurn: false,
      xp: 0,
      isFortified: false,
      isOverwatch: false,
      isDeployed: false,
      isCommander: true,
      movedOpenTilesThisTurn: 0,
      battleHonors: [],
      overwatchRangeBonusUntilTurn: 0,
      commanderBuffUntilTurn: 0,
    };

    commanders[houseId] = {
      houseId,
      unitId: cmdUnitId,
      xp: 0,
      level: 1,
      traits: [],
      skillCooldown: 0,
      woundedTurnsRemaining: 0,
      skillActiveUntilTurn: 0,
      markedTargetUnitId: null,
    };

    houses[houseId] = {
      id: houseId,
      isHuman: options.humanHouseId === houseId,
      isEliminated: false,
      resources: {
        materials: STARTING_MATERIALS,
        iron: STARTING_IRON,
        coin: STARTING_COIN,
      },
      favor: 0,
      audienceUsedThisTurn: false,
      lifetimeCoinEarned: 0,
      coinMilestonesClaimed: 0,
      nextCoinMilestone: INITIAL_COIN_MILESTONE,
      decreeIds: [...def.startingDecreeIds],
      lockedDecreeIds: [],
      startingDecreeCount: def.startingDecreeCount,
      pendingDraftCount: 0,
      pendingSpecializationKeepIds: [],
      pendingCitadelKeepIds: [],
      pendingHonorUnitIds: [],
      pendingCommanderTrait: false,
      settlementNamesUsed: 1,
      outpostsFoundedCount: 0,
      stats: {
        unitsDestroyed: 0,
        keepsCaptured: 0,
        commandersWounded: 0,
        ruinsExplored: 0,
        campsCleared: 0,
        watchtowersReached: 0,
        highSeatCaptured: 0,
        tilesRevealed: 0,
        lifetimeFavor: 0,
      },
      writProgress: {},
      aiPlan: null,
    };

    const houseFog: Record<CoordKey, FogStatus> = {};
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        houseFog[coordKey(x, y)] = 'unexplored';
      }
    }
    fog[houseId] = houseFog;
  }

  let state: GameState = {
    version: CURRENT_SCHEMA_VERSION,
    specVersion: SPEC_VERSION,
    mode: options.mode,
    chronicleLimit,
    mapPreset,
    difficulty: options.difficulty,
    gridSize,
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
    outposts: {},
    units,
    houses,
    commanders,
    highSeatTileKey: gen.highSeatTileKey,
    highSeatFirstCapturedBy: null,
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
    nextUnitSeq,
    nextKeepSeq,
    nextOutpostSeq: 1,
    nextEffectSeq: 1,
    nextChronicleSeq: 1,
  };

  for (const houseId of houseOrder) {
    state = recomputeHouseFog(state, houseId);
  }

  return state;
}
