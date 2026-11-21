/**
 * Marchlands (Spec v2.0) — Named Balance & Engine Constants
 *
 * Single source of truth for all tuning values, caps, and thresholds.
 */

import type {
  ChronicleLength,
  Difficulty,
  MapPreset,
  MapPresetConfig,
  SpecVersion,
  UnitClass,
} from '../types/game.ts';

// Schema & Map Constants
export const CURRENT_SCHEMA_VERSION = 2;
export const SPEC_VERSION: SpecVersion = '2.0';
export const DEFAULT_MAP_PRESET: MapPreset = 'grand';
export const GRID_SIZE = 34; // Default Grand March grid size; runtime always uses state.gridSize
export const VALID_GRID_SIZES: readonly number[] = [22, 28, 34] as const;
export const CHRONICLE_MAX_ENTRIES = 300;
export const UNDO_STACK_MAX = 20;

// Map Presets (Compact 22x22, Standard 28x28, Grand March 34x34)
export const MAP_PRESETS: Readonly<Record<MapPreset, MapPresetConfig>> = {
  compact: {
    id: 'compact',
    label: 'Compact (22×22)',
    gridSize: 22,
    capitalMinSpacing: 7,
    capitalMinEdgeDist: 3,
    villagesPerHouse: 2,
    extraContestedVillages: 2,
    minVillagesCloserPerHouse: 2,
    watchtowerCount: 4,
    relicRuinCount: 8,
    outlawCampCountBase: 6,
    extraIronMin: 5,
    extraIronMax: 7,
    hasHighSeat: false,
    supremacyKeepShare: 0.65,
    supremacyMinKeeps4: 5,
    supremacyMinKeeps5: 6,
    mandateMinFavor: 45,
    mandateMinKeeps: 5,
    mandateMinTier3Citadels: 1,
    mandateHoldTurns: 5,
    defaultMaxTurns: 150,
  },
  standard: {
    id: 'standard',
    label: 'Standard (28×28)',
    gridSize: 28,
    capitalMinSpacing: 9,
    capitalMinEdgeDist: 3,
    villagesPerHouse: 3,
    extraContestedVillages: 2,
    minVillagesCloserPerHouse: 2,
    watchtowerCount: 5,
    relicRuinCount: 10,
    outlawCampCountBase: 7,
    extraIronMin: 7,
    extraIronMax: 9,
    hasHighSeat: true,
    supremacyKeepShare: 0.65,
    supremacyMinKeeps4: 7,
    supremacyMinKeeps5: 9,
    mandateMinFavor: 65,
    mandateMinKeeps: 7,
    mandateMinTier3Citadels: 2,
    mandateHoldTurns: 6,
    defaultMaxTurns: 180,
  },
  grand: {
    id: 'grand',
    label: 'Grand March (34×34)',
    gridSize: 34,
    capitalMinSpacing: 11,
    capitalMinEdgeDist: 4,
    villagesPerHouse: 4,
    extraContestedVillages: 0,
    minVillagesCloserPerHouse: 3,
    watchtowerCount: 6,
    relicRuinCount: 12,
    outlawCampCountBase: 8,
    extraIronMin: 10,
    extraIronMax: 12,
    hasHighSeat: true,
    supremacyKeepShare: 0.48,
    supremacyMinKeeps4: 9,
    supremacyMinKeeps5: 11,
    mandateMinFavor: 120,
    mandateMinKeeps: 9,
    mandateMinTier3Citadels: 3,
    mandateHoldTurns: 9,
    defaultMaxTurns: 220,
  },
};

export const CHRONICLE_LENGTH_OPTIONS: readonly ChronicleLength[] = [48, 72, 108] as const;
export const DEFAULT_CHRONICLE_LIMIT: ChronicleLength = 72;
export const DOMINION_DEFAULT_MAX_TURNS = 220;
export const MANDATE_COOLDOWN_TURNS = 8;

// Starting House Resources & Doctrine Milestones
export const STARTING_MATERIALS = 16;
export const STARTING_IRON = 4;
export const STARTING_COIN = 14;
export const INITIAL_COIN_MILESTONE = 85;
export const COIN_MILESTONE_STEP_BASE = 65; // 85 -> 215 -> 410 -> 670 -> 995...
export const EXHAUSTED_POOL_COIN = 15;
export const EXHAUSTED_POOL_MATERIALS = 10;
export const EXHAUSTED_POOL_IRON = 3;

// Keep Scaling (Tier 1 -> Tier 2 -> Tier 3 Grand Citadel)
export const KEEP_TIER1_RADIUS = 1; // 3x3
export const KEEP_TIER2_RADIUS = 2; // 5x5
export const KEEP_TIER3_RADIUS = 3; // 7x7
export const KEEP_TIER1_ARMY_CAP = 3;
export const KEEP_TIER2_ARMY_CAP = 4;
export const KEEP_TIER3_ARMY_CAP = 5;
export const KEEP_TIER1_FOOD_THRESHOLD = 48;
export const KEEP_TIER2_FOOD_THRESHOLD = 160;
export const KEEP_TIER3_IRON_COST = 16;
export const KEEP_TIER3_REPEAT_FOOD_THRESHOLD = 180;

export const KEEP_TIER1_BASE_FOOD = 2;
export const KEEP_TIER1_BASE_MAT = 2;
export const KEEP_TIER1_BASE_COIN = 2;
export const KEEP_TIER2_BASE_FOOD = 3;
export const KEEP_TIER2_BASE_MAT = 2;
export const KEEP_TIER2_BASE_COIN = 4;
export const KEEP_TIER3_BASE_FOOD = 4;
export const KEEP_TIER3_BASE_MAT = 3;
export const KEEP_TIER3_BASE_COIN = 5;
export const KEEP_REPEAT_SURPLUS_COIN = 8;
export const KEEP_REPEAT_SURPLUS_FAVOR = 1;

export const KEEP_TIER1_MAX_HP = 36;
export const KEEP_TIER2_MAX_HP = 48;
export const KEEP_TIER3_MAX_HP = 64;
export const KEEP_GARRISON_HP_BONUS = 14;
export const KEEP_TIER1_REGEN = 3;
export const KEEP_TIER2_REGEN = 4;
export const KEEP_TIER3_REGEN = 5;
export const KEEP_GARRISON_REGEN_BONUS = 2;
export const KEEP_TIER1_ATTACK = 5;
export const KEEP_TIER2_ATTACK = 6;
export const KEEP_TIER3_ATTACK = 6;
export const KEEP_GARRISON_DEFENSE = 6;
export const KEEP_DEF_BONUS = 0.30;
export const KEEP_STONE_CURTAIN_HP_MULT = 1.2;
export const KEEP_ARROW_SLITS_RANGE = 2;
export const KEEP_REPAIR_MAT_COST = 8;
export const KEEP_REPAIR_HP_AMOUNT = 8;

// Central Ruined High Seat (Balanced Prestige Fortress)
export const HIGH_SEAT_MAX_HP = 42;
export const HIGH_SEAT_REGEN = 4;
export const HIGH_SEAT_ATTACK = 5;
export const HIGH_SEAT_DEFENSE = 6;
export const HIGH_SEAT_DEF_BONUS = 0.35;
export const HIGH_SEAT_CAPTURE_HP = 24;
export const HIGH_SEAT_BONUS_COIN = 3;
export const HIGH_SEAT_EVEN_TURN_FAVOR = 1;

// Frontier Outposts
export const OUTPOST_BASE_CAP = 2;
export const OUTPOST_BORDER_WARDENS_CAP = 3;
export const OUTPOST_MAT_COST = 12;
export const OUTPOST_COIN_COST = 12;
export const OUTPOST_RADIUS = 1; // 3x3
export const OUTPOST_MAX_HP = 20;
export const OUTPOST_REGEN = 3;
export const OUTPOST_DEFENSE = 4;
export const OUTPOST_DEF_BONUS = 0.30;
export const OUTPOST_MIN_KEEP_DIST = 4;
export const OUTPOST_MIN_OUTPOST_DIST = 3;

// Tile Overlays & Clear Timber
export const ROAD_MAT_COST = 3;
export const ROAD_ROYAL_NETWORK_MAT_COST = 1;
export const CLEAR_TIMBER_COIN_COST = 4;
export const CLEAR_TIMBER_MAT_GAIN = 6;

// Fortifications (Palisade -> Stone Curtain Wall, Watchtower -> Stone Bastion Tower)
export const WALL_CAP_TIER1 = 2;
export const WALL_CAP_TIER2 = 4;
export const WALL_CAP_TIER3 = 6;
export const WALL_CAP_GARRISON_BONUS = 2;
export const WATCHTOWER_CAP_TIER1 = 2;
export const WATCHTOWER_CAP_TIER2 = 3;
export const WATCHTOWER_CAP_TIER3 = 4;

export const PALISADE_LV1_HP = 14;
export const PALISADE_LV2_HP = 24;
export const WATCHTOWER_LV1_HP = 14;
export const WATCHTOWER_LV2_HP = 22;
export const STONE_BRIDGE_HP = 16;
export const FORTIFICATION_DEFENSE = 5;
export const PALISADE_LV1_STACK_DEF = 0.20;
export const PALISADE_LV2_STACK_DEF = 0.30;
export const WATCHTOWER_LV1_STACK_DEF = 0.20;
export const WATCHTOWER_LV2_STACK_DEF = 0.30;
export const MAX_COVER_DEF_BONUS = 0.60;
export const MAX_COVER_STONE_CURTAIN_BONUS = 0.70;
export const WALL_RANGED_DAMAGE_MULT = 0.75; // -25% ranged damage on Walls
export const NON_SIEGE_STRUCTURE_DAMAGE_MULT = 0.60; // 60% vs Keeps, Forts, Outposts
export const WALL_MELEE_SPIKE_DAMAGE = 2;
export const BASTION_VOLLEY_DAMAGE = 3;
export const BASTION_STONE_CURTAIN_BONUS = 2;
export const WATCHTOWER_RANGED_ATK_BONUS = 0.15;

// War Camp Limits (House Corvus)
export const WAR_CAMP_MAX_PER_KEEP = 1;
export const WAR_CAMP_MAX_PER_HOUSE = 3;
export const WAR_CAMP_ARMY_CAP_BONUS = 1;

// Neutral Frontier Village Stats & Annexation
export const VILLAGE_MAX_HP = 16;
export const VILLAGE_REGEN = 3;
export const VILLAGE_ATTACK = 3;
export const VILLAGE_DEFENSE = 4;
export const VILLAGE_DEF_BONUS = 0.20;
export const VILLAGE_ANNEX_COIN_COST = 20;
export const VILLAGE_ANNEX_FOOD_COST = 15;
export const VILLAGE_ANNEX_FAVOR_GAIN = 1;
export const VILLAGE_SEIZE_KEEP_HP = 14;
export const VILLAGE_SEIZE_FAVOR_PENALTY = 2;
export const CHARTERED_GUILDS_ANNEX_DISCOUNT = 0.30;
export const MARKET_TOWN_ANNEX_COIN_DISCOUNT = 0.20;
export const MAX_ANNEX_COIN_DISCOUNT = 0.50;

// Outlaw Camp & Bandit Stats
export const BANDIT_MAX_HP = 22;
export const BANDIT_ATTACK = 6;
export const BANDIT_DEFENSE = 4;
export const BANDIT_CLASS: UnitClass = 'infantry';
export const OUTLAW_CAMP_BOUNTY_COIN = 14;
export const OUTLAW_CAMP_BOUNTY_IRON = 2;
export const CORVUS_PLUNDER_MULTIPLIER = 2;

// Ancient Watchtower Occupation
export const ANCIENT_WATCHTOWER_DEF_BONUS = 0.30;
export const ANCIENT_WATCHTOWER_REVEAL_RADIUS = 3; // 7x7
export const ANCIENT_WATCHTOWER_COIN_PER_TURN = 2;
export const ANCIENT_WATCHTOWER_EVEN_TURN_FAVOR = 1;

// Combat Formula Constants (v2.0 Closed 4-Way Counter Loop + Scale 2.2)
export const COUNTER_ADVANTAGE_MULT = 1.40;
export const BODKIN_COUNTER_MULT = 1.55;
export const BONUS_SUM_MIN = -0.50;
export const BONUS_SUM_MAX = 1.50;
export const COMBAT_DAMAGE_SCALE = 2.2;
export const FLANKING_ATK_BONUS = 0.15;
export const HILLS_DOWNHILL_ATK_BONUS = 0.15;
export const RIVER_ATTACK_PENALTY = -0.25;
export const CAVALRY_CHARGE_ATK_BONUS = 0.20;
export const CAVALRY_CHARGE_MOBILE_VANGUARD_BONUS = 0.15;
export const CAVALRY_CHARGE_MIN_OPEN_TILES = 2;
export const OVERWATCH_DAMAGE_MULT = 0.85;
export const OVERWATCH_BODKIN_DAMAGE_MULT = 1.00;
export const CROSSBOW_ARMOR_PIERCE_DEF_THRESHOLD = 5;
export const TREBUCHET_GRAND_BOMBARDMENT_SPLASH = 3;
export const SUPPLY_SEVERED_ATK_PENALTY = -0.25;
export const SUPPLY_SEVERED_DEF_PENALTY = -0.25;
export const MUTINY_TRUE_DAMAGE = 8;
export const MUTINY_ATK_PENALTY = -0.25;

// Closed 4-Way Counter Matrix
export const COUNTER_MATCHUPS: Readonly<Record<UnitClass, readonly UnitClass[]>> = {
  spearman: ['cavalry'],
  infantry: ['spearman'],
  ranged: ['infantry'],
  cavalry: ['ranged', 'siege'],
  siege: [],
  commander: [],
};

// Sight, Doctrine & Healing Constants
export const BASE_UNIT_SIGHT = 2;
export const BASE_KEEP_SIGHT = 2;
export const OUTPOST_SIGHT = 2;
export const COMMANDER_SIGHT = 3;
export const WATCHTOWER_SIGHT_RADIUS = 3; // 7x7
export const SIGNAL_BASTION_SIGHT_RADIUS = 3; // 7x7
export const PEAK_BEACON_SIGHT_RADIUS = 4; // 9x9
export const SIGNAL_BASTION_LV1_ATK_BONUS = 0.15;
export const SIGNAL_BASTION_LV2_ATK_BONUS = 0.20;
export const LONGBOWMAN_TERRAIN_ATK_BONUS = 0.10;
export const OATHSWORN_WALL_DEF_BONUS = 0.40;
export const FEUDAL_LEVIES_MAT_DISCOUNT = 2;
export const FEUDAL_LEVIES_MIN_MAT_COST = 4;
export const STANDING_CORPS_ATK_BONUS = 0.15;
export const STANDING_CORPS_DEF_BONUS = 0.10;
export const SALVAGE_CREWS_MAT_REWARD = 4;
export const SALVAGE_CREWS_IRON_REWARD = 1;
export const SALVAGE_CREWS_CAMP_IRON = 2;
export const STANDARD_HEAL_AMOUNT = 2;
export const FIELD_SURGEONS_HEAL_BONUS = 3;
export const KEEP_TILE_EXTRA_HEAL = 3;
export const FORTIFY_DEF_BONUS = 0.15;
export const PHALANX_FORTIFY_DEF_BONUS = 0.25;
export const FORTIFY_EXTRA_HEAL = 2;
export const PILLAGE_MAT_RATIO = 0.5;
export const PILLAGE_BASE_COIN = 4;

// Active Paid Field Reinforce
export const REINFORCE_HEAL_AMOUNT = 8;
export const REINFORCE_SURGEONS_HEAL_AMOUNT = 12;
export const REINFORCE_STANDARD_COIN = 4;
export const REINFORCE_STANDARD_MAT = 3;
export const REINFORCE_HEAVY_COIN = 5;
export const REINFORCE_HEAVY_IRON = 1;

// Lord-Commander Constants
export const COMMANDER_BASE_HP = 34;
export const COMMANDER_BASE_ATK = 8;
export const COMMANDER_BASE_DEF = 6;
export const COMMANDER_UPKEEP = 2;
export const COMMANDER_AURA_ATK_BONUS = 0.10;
export const COMMANDER_AURA_DEF_BONUS = 0.10;
export const COMMANDER_SKILL_COOLDOWN = 4;
export const COMMANDER_WOUNDED_TURNS = 5;
export const COMMANDER_EARLY_RALLY_MAX_TURNS = 2;
export const COMMANDER_EARLY_RALLY_COIN = 15;
export const COMMANDER_RANSOM_FAVOR = 3;
export const COMMANDER_RANSOM_COIN = 15;
export const COMMANDER_LEVEL2_XP = 6;
export const COMMANDER_LEVEL3_XP = 14;
export const GOLDEN_BANNER_COIN_COST = 6;
export const GOLDEN_BANNER_HEAL = 7;
export const HOLD_THE_LINE_HEAL = 4;
export const HOLD_THE_LINE_DEF_BONUS = 0.25;
export const BEACON_MARK_ATK_BONUS = 0.20;
export const WARDENS_VOLLEY_ATK_BONUS = 0.15;
export const RAIDERS_HORN_PILLAGE_HEAL = 6;

// Veterancy & Branching Battle Honors
export const VETERANCY_RANK1_XP = 3;
export const VETERANCY_RANK2_XP = 8;
export const VETERANCY_HP_PER_RANK = 2;
export const XP_COMBAT_SURVIVE = 1;
export const XP_COMBAT_KILL = 2;
export const XP_STRUCTURE_CAPTURE = 2;
export const DEMOLISH_REFUND_RATIO = 0.25;
export const DISBAND_KEEP_REFUND_RATIO = 0.25;

// Adjacency Yield Constants
export const FARM_RIVER_BONUS_FOOD = 2;
export const LUMBER_MILL_FOREST_THRESHOLD = 2;
export const LUMBER_MILL_FOREST_BONUS_MAT = 2;
export const MARKET_ADJ_BONUS_COIN = 1;
export const GRANARY_ADJ_BONUS_FOOD = 1;
export const QUARRY_ADJ_FORT_DEF_BONUS = 0.10;
export const VANE_FOREST_PASSIVE_MAT = 1;
export const AURELIA_RIVER_ADJ_PASSIVE_COIN = 1;

// Crown Writs & Audience Constants
export const WRIT_FIRST_TURN = 3;
export const WRIT_INTERVAL_TURNS = 6;
export const WRIT_BATCH_SIZE = 3;
export const WRIT_NO_REPEAT_PUBLICATIONS = 2;
export const AUDIENCE_REROLL_FAVOR = 3;
export const AUDIENCE_PETITION_FAVOR = 8;
export const AUDIENCE_GRANT_FAVOR = 4;
export const AUDIENCE_GRANT_AMOUNT = 15;
export const AUDIENCE_IRON_FAVOR = 5;
export const AUDIENCE_IRON_AMOUNT = 6;

// Seasons & Frontier Events
export const TURNS_PER_SEASON = 3;
export const SEASONS_PER_YEAR = 4;
export const TURNS_PER_YEAR = TURNS_PER_SEASON * SEASONS_PER_YEAR;
export const EVENT_NO_REPEAT_SEASONS = 4;
export const HARD_FROST_ATTRITION_DAMAGE = 4;
export const FREE_COMPANY_HIRE_COIN = 20;
export const TOURNAMENT_COIN_COST = 12;
export const TOURNAMENT_FAVOR_REWARD = 2;
export const PLAGUE_FOOD_LOSS = 10;
export const DESERTERS_TRUE_DAMAGE = 6;
export const ROYAL_LEVY_FAVOR_LOSS = 2;
export const ROYAL_LEVY_MAX_COIN = 25;
export const ROYAL_LEVY_COIN_RATIO = 0.2;
export const INSPECTION_FAVOR_GAIN = 3;

// Scoring Constants (BALANCE_MODEL.md §3)
export const SCORE_PER_TILE = 1;
export const SCORE_PER_LV2_IMPROVEMENT = 1;
export const SCORE_PER_KEEP = 40;
export const SCORE_PER_TIER2_KEEP_EXTRA = 20;
export const SCORE_PER_TIER3_KEEP_EXTRA = 50;
export const SCORE_PER_OUTPOST = 15;
export const SCORE_PER_DECREE = 15;
export const SCORE_PER_UNIT_DESTROYED = 5;
export const SCORE_PER_KEEP_CAPTURED = 30;
export const SCORE_PER_COMMANDER_WOUNDED = 20;
export const SCORE_TILES_PER_EXPLORATION_PT = 6;
export const SCORE_PER_RUIN = 15;
export const SCORE_PER_CAMP = 20;
export const SCORE_PER_WATCHTOWER = 10;
export const SCORE_PER_HIGH_SEAT = 15;
export const SCORE_PER_LIFETIME_FAVOR = 2;
export const SCORE_COIN_PER_TREASURY_PT = 10;
export const SCORE_PER_IRON_TREASURY = 2;

// AI Guardrails & Difficulty Config (AI_ARCHITECTURE.md)
export const MAX_AI_ACTIONS = 16;
export const MIN_ACTION_SCORE = 5;
export const AI_COMBAT_RESOLUTION_BUDGET = 2000;
export const AI_TACTICAL_MAX_DEPTH = 6;
export const AI_WATCHDOG_MS = 8000;
export const AI_POSTURE_HYSTERESIS_TURNS = 3;
export const AI_MUSTER_TIMEOUT_TURNS = 3;
export const AI_MUSTER_MIN_UNITS = 2;
export const AI_FOCUS_FIRE_WOUNDED_BONUS = 45;
export const AI_SAME_TURN_FOCUS_BONUS = 35;
export const AI_ALLY_FOLLOWUP_BONUS = 18;
export const AI_SIM_FOCUS_FIRE_BONUS = 22;
export const AI_SIM_FOCUS_KILL_BONUS = 36;

export interface AiDifficultyConfig {
  readonly beamWidth: number;
  readonly candidateCap: number;
  readonly ignoreThreatChance: number;
  readonly useMusterRule: boolean;
  readonly economyMultiplier: number;
}

export const AI_DIFFICULTY_CONFIG: Readonly<Record<Difficulty, AiDifficultyConfig>> = {
  easy: {
    beamWidth: 1,
    candidateCap: 2,
    ignoreThreatChance: 0.5,
    useMusterRule: false,
    economyMultiplier: 0.72,
  },
  normal: {
    beamWidth: 4,
    candidateCap: 4,
    ignoreThreatChance: 0.0,
    useMusterRule: true,
    economyMultiplier: 1.0,
  },
  hard: {
    beamWidth: 8,
    candidateCap: 6,
    ignoreThreatChance: 0.0,
    useMusterRule: true,
    economyMultiplier: 1.15,
  },
};

// Map Generation Shared Constants
export const MAPGEN_MAX_ATTEMPTS = 50;
export const MAPGEN_TERRAIN_TARGET_PLAINS = 0.46;
export const MAPGEN_TERRAIN_TARGET_FOREST = 0.22;
export const MAPGEN_TERRAIN_TARGET_HILLS = 0.14;
export const MAPGEN_TERRAIN_TARGET_RIVER = 0.10;
export const MAPGEN_TERRAIN_TARGET_MOUNTAIN = 0.08;
export const MAPGEN_TERRAIN_TOLERANCE = 0.04;
export const MAPGEN_VILLAGE_MIN_CAPITAL_DIST = 4;
export const MAPGEN_VILLAGE_MIN_VILLAGE_DIST = 3;
export const MAPGEN_CAMP_MIN_CAPITAL_DIST = 4;
export const MAPGEN_CORVUS_CAMP_MAX_DIST = 7;
