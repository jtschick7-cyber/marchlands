/**
 * Marchlands (Spec v0.3) — Named Balance & Engine Constants
 *
 * Single source of truth for all tuning values, caps, and thresholds.
 */

import type { Difficulty, SpecVersion, UnitClass } from '../types/game.ts';

// Schema & Map Constants
export const CURRENT_SCHEMA_VERSION = 1;
export const SPEC_VERSION: SpecVersion = '0.3';
export const GRID_SIZE = 22;
export const CHRONICLE_MAX_ENTRIES = 300;
export const UNDO_STACK_MAX = 20;

// Game Length & Victory Thresholds
export const CHRONICLE_TURN_LIMIT = 33;
export const DOMINION_DEFAULT_MAX_TURNS = 150;
export const SUPREMACY_KEEP_SHARE = 0.65;
export const SUPREMACY_MIN_KEEPS = 5;
export const MANDATE_MIN_FAVOR = 30;
export const MANDATE_MIN_KEEPS = 4;
export const MANDATE_HOLD_TURNS = 3;
export const MANDATE_COOLDOWN_TURNS = 6;

// Starting House Resources & Milestones
export const STARTING_MATERIALS = 12;
export const STARTING_COIN = 10;
export const INITIAL_COIN_MILESTONE = 25;
export const COIN_MILESTONE_STEP_BASE = 20; // next += 20 * (claimed + 1) -> 25, 65, 125, 205, 305...
export const EXHAUSTED_POOL_COIN = 15;
export const EXHAUSTED_POOL_MATERIALS = 10;

// Keep Scaling & Garrison Combat Stats
export const KEEP_TIER1_RADIUS = 1; // 3x3
export const KEEP_TIER2_RADIUS = 2; // 5x5
export const KEEP_TIER1_ARMY_CAP = 3;
export const KEEP_TIER2_ARMY_CAP = 4;
export const KEEP_TIER1_FOOD_THRESHOLD = 18;
export const KEEP_TIER2_REPEAT_FOOD_THRESHOLD = 36;
export const KEEP_TIER1_BASE_FOOD = 2;
export const KEEP_TIER1_BASE_MAT = 2;
export const KEEP_TIER1_BASE_COIN = 3;
export const KEEP_TIER2_BASE_FOOD = 4;
export const KEEP_TIER2_BASE_MAT = 3;
export const KEEP_TIER2_BASE_COIN = 5;
export const KEEP_REPEAT_FIRST_COIN = 5;
export const KEEP_REPEAT_SURPLUS_COIN = 10;
export const KEEP_REPEAT_SURPLUS_FAVOR = 0;

export const KEEP_BASE_MAX_HP = 24;
export const KEEP_GARRISON_MAX_HP = 34;
export const KEEP_BASE_REGEN = 4;
export const KEEP_GARRISON_REGEN = 6;
export const KEEP_GARRISON_ATTACK = 4;
export const KEEP_GARRISON_DEFENSE = 5;
export const KEEP_DEF_BONUS = 0.35;
export const KEEP_MASONRY_DEF_BONUS = 0.45;

// Palisade & Watchtower Fortification Caps & Stats
export const PALISADE_CAP_TIER1 = 2;
export const PALISADE_CAP_TIER2 = 4;
export const PALISADE_CAP_GARRISON = 5;
export const FORTIFICATION_MAX_HP = 12;
export const FORTIFICATION_DEFENSE = 4;
export const FORTIFICATION_DEF_BONUS = 0.30;
export const FORTIFICATION_MASONRY_DEF_BONUS = 0.45;
export const MASONRY_SIEGE_DAMAGE_REDUCTION = 0.25;

// War Camp Limits (House Corvus)
export const WAR_CAMP_MAX_PER_KEEP = 1;
export const WAR_CAMP_MAX_PER_HOUSE = 2;
export const WAR_CAMP_ARMY_CAP_BONUS = 1;

// Neutral Frontier Village Stats & Annexation
export const VILLAGE_MAX_HP = 12;
export const VILLAGE_REGEN = 3;
export const VILLAGE_ATTACK = 3;
export const VILLAGE_DEFENSE = 4;
export const VILLAGE_DEF_BONUS = 0.20;
export const VILLAGE_ANNEX_COIN_COST = 15;
export const VILLAGE_ANNEX_FOOD_COST = 12;
export const VILLAGE_ANNEX_FAVOR_GAIN = 1;
export const VILLAGE_SEIZE_KEEP_HP = 8;
export const VILLAGE_SEIZE_FAVOR_PENALTY = 2;
export const CROWN_ENVOYS_DISCOUNT = 0.40;
export const MARKET_TOWN_ANNEX_COIN_DISCOUNT = 0.20;
export const MAX_ANNEX_COIN_DISCOUNT = 0.50;

// Outlaw Camp & Bandit Stats
export const BANDIT_MAX_HP = 18;
export const BANDIT_ATTACK = 6;
export const BANDIT_DEFENSE = 4;
export const BANDIT_CLASS: UnitClass = 'infantry';
export const OUTLAW_CAMP_BOUNTY_COIN = 12;
export const CORVUS_PLUNDER_MULTIPLIER = 2;

// Ancient Watchtower Occupation
export const ANCIENT_WATCHTOWER_DEF_BONUS = 0.30;
export const ANCIENT_WATCHTOWER_REVEAL_RADIUS = 3; // 7x7
export const ANCIENT_WATCHTOWER_COIN_PER_TURN = 2;
export const ANCIENT_WATCHTOWER_EVEN_TURN_FAVOR = 1;

// Combat Formula Constants
export const COUNTER_ADVANTAGE_MULT = 1.40;
export const BODKIN_QUIVERS_COUNTER_MULT = 1.65;
export const BONUS_SUM_MIN = -0.50;
export const BONUS_SUM_MAX = 1.50;
export const COMBAT_DAMAGE_SCALE = 3.0;
export const FLANKING_ATK_BONUS = 0.15;
export const SUPPLY_SEVERED_ATK_PENALTY = -0.25;
export const SUPPLY_SEVERED_DEF_PENALTY = -0.25;
export const MUTINY_TRUE_DAMAGE = 8;
export const MUTINY_ATK_PENALTY = -0.25;

// Counter-Triangle Lookup: attackerClass -> defenderClasses it counters
export const COUNTER_MATCHUPS: Readonly<Record<UnitClass, readonly UnitClass[]>> = {
  spearman: ['cavalry'],
  cavalry: ['ranged', 'siege'],
  ranged: ['spearman'],
  infantry: ['spearman'],
  siege: [],
};

// Unit & Doctrine Modifier Constants
export const BASE_UNIT_SIGHT = 2;
export const BASE_KEEP_SIGHT = 2;
export const WATCHTOWER_SIGHT_RADIUS = 2; // 5x5
export const SIGNAL_BASTION_SIGHT_RADIUS = 2; // 5x5
export const SIGNAL_BASTION_ADJ_ATK_BONUS = 0.20;
export const LONGBOWMAN_TERRAIN_ATK_BONUS = 0.10;
export const OATHSWORN_WALL_DEF_BONUS = 0.40;
export const VETERAN_DRILL_ATK_BONUS = 0.15;
export const SHIELD_WALL_DEF_BONUS = 0.20;
export const HIGHLAND_SCOUTS_CAVALRY_PLAINS_ATK = 0.15;
export const BORDER_LEVIES_MAT_DISCOUNT = 2;
export const BORDER_LEVIES_MIN_MAT_COST = 4;
export const SALVAGE_CREWS_MAT_REWARD = 4;
export const TOLL_ROADS_KEEP_COIN = 2;
export const STANDARD_HEAL_AMOUNT = 3;
export const FIELD_SURGEONS_HEAL_AMOUNT = 6;
export const KEEP_TILE_EXTRA_HEAL = 3;
export const PILLAGE_MAT_RATIO = 0.5;
export const PILLAGE_BASE_COIN = 3;

// Tactical Stances, Veterancy & Keep Management Constants
export const FORTIFY_DEF_BONUS = 0.15;
export const FORTIFY_EXTRA_HEAL = 2;
export const VETERANCY_RANK1_XP = 2;
export const VETERANCY_RANK2_XP = 5;
export const VETERANCY_RANK1_ATK_BONUS = 0.10;
export const VETERANCY_RANK2_ATK_BONUS = 0.20;
export const VETERANCY_RANK2_DEF_BONUS = 0.05;
export const VETERANCY_HP_PER_RANK = 2;
export const XP_COMBAT_SURVIVE = 1;
export const XP_COMBAT_KILL = 2;
export const XP_STRUCTURE_CAPTURE = 2;
export const DEMOLISH_REFUND_RATIO = 0.25;
export const DISBAND_KEEP_REFUND_RATIO = 0.25;
export const KEEP_REPAIR_MAT_COST = 6;
export const KEEP_REPAIR_HP_AMOUNT = 8;

// Adjacency Yield Constants
export const FARM_RIVER_BONUS_FOOD = 2;
export const LUMBER_MILL_FOREST_THRESHOLD = 2;
export const LUMBER_MILL_FOREST_BONUS_MAT = 2;
export const MARKET_ADJ_BONUS_COIN = 1;
export const GRANARY_ADJ_BONUS_FOOD = 1;
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

// Seasons & Frontier Events
export const TURNS_PER_SEASON = 3;
export const SEASONS_PER_YEAR = 4;
export const TURNS_PER_YEAR = TURNS_PER_SEASON * SEASONS_PER_YEAR;
export const EVENT_NO_REPEAT_SEASONS = 4;
export const HARD_FROST_ATTRITION_DAMAGE = 4;
export const FREE_COMPANY_HIRE_COIN = 15;
export const TOURNAMENT_COIN_COST = 10;
export const TOURNAMENT_FAVOR_REWARD = 2;
export const PLAGUE_FOOD_LOSS = 6;
export const DESERTERS_TRUE_DAMAGE = 6;
export const ROYAL_LEVY_FAVOR_LOSS = 2;
export const ROYAL_LEVY_MAX_COIN = 20;
export const ROYAL_LEVY_COIN_RATIO = 0.2;
export const INSPECTION_FAVOR_GAIN = 3;

// Scoring Constants (BALANCE_MODEL.md §6)
export const SCORE_PER_TILE = 1;
export const SCORE_PER_KEEP = 40;
export const SCORE_PER_TIER2_KEEP_EXTRA = 20;
export const SCORE_PER_DECREE = 10;
export const SCORE_PER_UNIT_DESTROYED = 5;
export const SCORE_PER_KEEP_CAPTURED = 30;
export const SCORE_TILES_PER_EXPLORATION_PT = 4;
export const SCORE_PER_RUIN = 15;
export const SCORE_PER_CAMP = 20;
export const SCORE_PER_WATCHTOWER = 10;
export const SCORE_PER_LIFETIME_FAVOR = 2;
export const SCORE_COIN_PER_TREASURY_PT = 10;

// AI Guardrails & Difficulty Config (AI_ARCHITECTURE.md)
export const MAX_AI_ACTIONS = 12;
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
    economyMultiplier: 0.7,
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

// Map Generation Constants (GDD.md §8b, EDGE_CASE_RULINGS.md §8)
export const MAPGEN_MAX_ATTEMPTS = 50;
export const MAPGEN_TERRAIN_TARGET_PLAINS = 0.46; // 40% + 6% remainder
export const MAPGEN_TERRAIN_TARGET_FOREST = 0.22;
export const MAPGEN_TERRAIN_TARGET_HILLS = 0.14;
export const MAPGEN_TERRAIN_TARGET_RIVER = 0.10;
export const MAPGEN_TERRAIN_TARGET_MOUNTAIN = 0.08;
export const MAPGEN_TERRAIN_TOLERANCE = 0.03;
export const MAPGEN_CAPITAL_MIN_SPACING = 7;
export const MAPGEN_CAPITAL_MIN_EDGE_DIST = 3;
export const MAPGEN_VILLAGE_MIN_CAPITAL_DIST = 4;
export const MAPGEN_VILLAGE_MIN_VILLAGE_DIST = 3;
export const MAPGEN_MIN_VILLAGES_CLOSER_PER_HOUSE = 2;
export const MAPGEN_WATCHTOWER_COUNT = 4;
export const MAPGEN_RELIC_RUIN_COUNT = 8;
export const MAPGEN_CAMP_MIN_CAPITAL_DIST = 4;
export const MAPGEN_CORVUS_CAMP_MAX_DIST = 6;
export const MAPGEN_EXTRA_IRON_MIN = 4;
export const MAPGEN_EXTRA_IRON_MAX = 6;
