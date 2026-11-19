/**
 * Marchlands (Spec v0.3) — Canonical Pure TypeScript Types
 *
 * ZERO runtime code. Every GameState field must be 100% JSON-serializable:
 * primitives (string, number, boolean, null), plain arrays, and plain Records.
 * No Map, Set, Date, class instances, functions, or undefined values in GameState.
 */

export type CoordKey = string; // Format: "x,y"

export interface Coord {
  readonly x: number;
  readonly y: number;
}

export type SpecVersion = '0.3';
export type GameMode = 'dominion' | 'chronicle';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type HouseId = 'vane' | 'ironhelm' | 'aurelia' | 'corvus' | 'solis';

export type TerrainType = 'plains' | 'forest' | 'hills' | 'mountain' | 'river';

export type LandmarkType =
  | 'none'
  | 'frontier_village'
  | 'ancient_watchtower'
  | 'relic_ruin'
  | 'outlaw_camp';

export type ImprovementId =
  | 'farm'
  | 'lumber_mill'
  | 'iron_mine'
  | 'smithy'
  | 'market'
  | 'granary'
  | 'palisade'
  | 'watchtower'
  | 'foresters_lodge'
  | 'deep_smeltery'
  | 'river_tollhouse'
  | 'war_camp'
  | 'signal_bastion';

export type UnitClass = 'infantry' | 'spearman' | 'ranged' | 'cavalry' | 'siege';

export type UnitId =
  | 'militia'
  | 'spearman'
  | 'sapper_crew'
  | 'archer'
  | 'crossbowman'
  | 'men_at_arms'
  | 'knight'
  | 'siege_ram'
  | 'longbowman'
  | 'oathsworn_halberdier'
  | 'gilded_lancer'
  | 'dusk_outrider'
  | 'vanguard_spearman'
  | 'free_company_spearman';

export type KeepSpecialization =
  | 'none'
  | 'garrison'
  | 'market_town'
  | 'granary_seat';

export type FogStatus = 'unexplored' | 'explored' | 'visible';

export type Phase =
  | 'player_command'
  | 'draft_modal'
  | 'specialization_modal'
  | 'event_modal'
  | 'ai_turn'
  | 'game_over';

export type VictoryType =
  | 'conquest'
  | 'supremacy'
  | 'mandate'
  | 'score'
  | 'defeat';

export type DecreeCategory = 'infrastructure' | 'military' | 'doctrine';

export type DecreeId =
  // Category A: Infrastructure Blueprints (6)
  | 'decree_iron_prospecting'
  | 'decree_master_smiths'
  | 'decree_timber_palisades'
  | 'decree_frontier_towers'
  | 'decree_chartered_markets'
  | 'decree_stone_granaries'
  // Category B: Military Charters (5)
  | 'decree_fletchers_guild'
  | 'decree_steel_arbalests'
  | 'decree_sword_guilds'
  | 'decree_chivalric_order'
  | 'decree_siege_engineers'
  // Category C: Kingdom Doctrines & Passives (14)
  | 'decree_crop_rotation'
  | 'decree_coppice_forestry'
  | 'decree_forced_march'
  | 'decree_veteran_drill'
  | 'decree_shield_wall'
  | 'decree_supply_lines'
  | 'decree_crown_envoys'
  | 'decree_border_levies'
  | 'decree_field_surgeons'
  | 'decree_highland_scouts'
  | 'decree_toll_roads'
  | 'decree_salvage_crews'
  | 'decree_fletcher_volleys'
  | 'decree_masonry_reinforcement';

export type RelicRuinId =
  | 'ruin_sunken_armory'
  | 'ruin_tax_vault'
  | 'ruin_monastic_cellar'
  | 'ruin_charter_archive'
  | 'ruin_surveyors_cairn'
  | 'ruin_mercenary_cache'
  | 'ruin_apothecary_shrine'
  | 'ruin_iron_foundry'
  | 'ruin_wayfarer_tomb'
  | 'ruin_seed_vault'
  | 'ruin_beacon_rotunda'
  | 'ruin_war_council_hall';

export type EventId =
  | 'evt_royal_levy'
  | 'evt_bountiful_harvest'
  | 'evt_blight'
  | 'evt_hard_frost'
  | 'evt_outlaw_resurgence'
  | 'evt_free_company'
  | 'evt_tournament'
  | 'evt_plague'
  | 'evt_pilgrims'
  | 'evt_timber_boom'
  | 'evt_iron_strike'
  | 'evt_deserters'
  | 'evt_inspection'
  | 'evt_fair_season';

export type EventTarget =
  | 'all_houses'
  | 'leader'
  | 'trailing'
  | 'most_keeps'
  | 'highest_upkeep'
  | 'lowest_favor'
  | 'map';

export type WritId =
  | 'writ_clear_camp'
  | 'writ_annex'
  | 'writ_watch'
  | 'writ_strongholds'
  | 'writ_victories'
  | 'writ_markets'
  | 'writ_relics'
  | 'writ_muster'
  | 'writ_tithe'
  | 'writ_iron'
  | 'writ_raze'
  | 'writ_capture';

export type AiPosture = 'expand' | 'defend' | 'attack' | 'claim';

export type ChronicleEventType =
  | 'combat'
  | 'unit_destroyed'
  | 'keep_captured'
  | 'village_annexed'
  | 'village_seized'
  | 'keep_upgraded'
  | 'keep_specialized'
  | 'decree_enacted'
  | 'ruin_explored'
  | 'watchtower_reached'
  | 'camp_cleared'
  | 'pillage'
  | 'raze'
  | 'mutiny'
  | 'writ_published'
  | 'writ_completed'
  | 'mandate_claimed'
  | 'mandate_broken'
  | 'mandate_won'
  | 'frontier_event'
  | 'season_change'
  | 'house_eliminated'
  | 'ai_watchdog_timeout'
  | 'victory';

// ============================================================================
// Runtime GameState Entities (100% JSON-Serializable)
// ============================================================================

export interface TileState {
  key: CoordKey;
  x: number;
  y: number;
  terrain: TerrainType;
  hasIronDeposit: boolean;
  landmark: LandmarkType;
  landmarkCleared: boolean;
  relicRuinId: RelicRuinId | null;
  villageHp: number | null;
  villageDamagedLastRound: boolean;
  banditHp: number | null;
  revealedByHouseIds: HouseId[];
  firstVisitedByHouseId: HouseId | null;
  ownerHouseId: HouseId | null;
  keepId: string | null;
  improvement: ImprovementId | null;
  fortificationHp: number | null;
}

export interface KeepState {
  id: string;
  name: string;
  ownerHouseId: HouseId;
  tileKey: CoordKey;
  x: number;
  y: number;
  tier: 1 | 2;
  isCapital: boolean;
  specialization: KeepSpecialization;
  keepHp: number;
  maxKeepHp: number;
  damagedLastRound: boolean;
  foodProgress: number;
  repeatMilestonesClaimed: number;
}

export interface UnitState {
  id: string;
  houseId: HouseId;
  typeId: UnitId;
  homeKeepId: string; // Keep ID, 'orphaned', or 'free_company'
  tileKey: CoordKey;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  remainingMovement: number;
  hasMoved: boolean;
  hasAttacked: boolean;
  spawnedOnTurn: number;
  isMutinied: boolean;
  damagedSinceLastTurn: boolean;
}

export interface HouseStats {
  unitsDestroyed: number;
  keepsCaptured: number;
  ruinsExplored: number;
  campsCleared: number;
  watchtowersReached: number;
  tilesRevealed: number;
  lifetimeFavor: number;
}

export interface AiPlan {
  posture: AiPosture;
  targetKeepId: string | null;
  rallyTileKey: CoordKey | null;
  rallyStartedTurn: number | null;
  plannedOnTurn: number;
  postureLockedUntilTurn: number;
}

export interface HouseState {
  id: HouseId;
  isHuman: boolean;
  isEliminated: boolean;
  resources: {
    materials: number;
    coin: number;
  };
  favor: number;
  audienceUsedThisTurn: boolean;
  lifetimeCoinEarned: number;
  coinMilestonesClaimed: number;
  nextCoinMilestone: number;
  decreeIds: DecreeId[];
  startingDecreeCount: number;
  pendingDraftCount: number;
  pendingSpecializationKeepIds: string[];
  settlementNamesUsed: number;
  stats: HouseStats;
  writProgress: Record<string, number>;
  aiPlan: AiPlan | null;
}

export interface ActiveWrit {
  writId: WritId;
  publishedTurn: number;
  completedByHouseId: HouseId | null;
}

export interface CrownState {
  activeWrits: ActiveWrit[];
  nextWritTurn: number;
  recentWritIds: WritId[];
  claimantHouseId: HouseId | null;
  claimStartTurn: number | null;
  claimCooldowns: Record<string, number>;
}

export interface ActiveEffect {
  id: string;
  effectId: EventId;
  houseId: HouseId | null;
  expiresAfterTurn: number;
}

export interface PendingEventChoice {
  eventId: EventId;
  houseId: HouseId;
  options: string[];
}

export interface ChronicleEvent {
  id: string;
  turnNumber: number;
  type: ChronicleEventType;
  actorHouseId: HouseId | null;
  targetHouseId: HouseId | null;
  tileKey: CoordKey | null;
  summary: string;
  isPublic: boolean;
}

export interface GameState {
  version: number;
  specVersion: SpecVersion;
  mode: GameMode;
  difficulty: Difficulty;
  gridSize: number;
  turnNumber: number;
  rngSeed: number;
  rngCounter: number;
  phase: Phase;
  humanHouseId: HouseId | null;
  houseOrder: HouseId[];
  activeHouseId: HouseId;
  winnerHouseId: HouseId | null;
  victoryType: VictoryType | null;
  tiles: Record<CoordKey, TileState>;
  keeps: Record<string, KeepState>;
  units: Record<string, UnitState>;
  houses: Record<string, HouseState>;
  fog: Record<string, Record<CoordKey, FogStatus>>;
  crown: CrownState;
  activeEffects: ActiveEffect[];
  recentEventIds: EventId[];
  chronicle: ChronicleEvent[];
  pendingDraftChoices: DecreeId[] | null;
  pendingEventChoice: PendingEventChoice | null;
  nextUnitSeq: number;
  nextKeepSeq: number;
  nextEffectSeq: number;
  nextChronicleSeq: number;
}

// ============================================================================
// AI & Tactical Projection Types (Ephemeral, Never Persisted)
// ============================================================================

export interface TileThreat {
  vsSpearman: number; // Canonical Spearman (Def 6)
  vsCavalry: number;  // Canonical Knight (Def 5)
  vsRanged: number;   // Canonical Archer (Def 2); also used by Siege units
  vsInfantry: number; // Canonical Men-at-Arms (Def 5)
}

// ============================================================================
// Persistence Metadata (Stored Alongside GameState in IndexedDB, Never Inside)
// ============================================================================

export interface SaveMetadata {
  slotId: string;
  savedAtIso: string;
  turnNumber: number;
  houseId: HouseId;
  mode: GameMode;
}

// ============================================================================
// Static Data Definition Types (Used by src/data/)
// ============================================================================

export interface HouseColors {
  readonly primary: string;
  readonly lightTint: string;
  readonly darkStroke: string;
  readonly badgeText: string;
}

export interface HouseDef {
  readonly id: HouseId;
  readonly name: string;
  readonly epithet: string;
  readonly passiveName: string;
  readonly passiveDescription: string;
  readonly uniqueImprovementId: ImprovementId;
  readonly signatureUnitId: UnitId;
  readonly startingDecreeIds: readonly DecreeId[];
  readonly startingDecreeCount: number;
  readonly aiPersonalityLabel: string;
  readonly colors: HouseColors;
  readonly settlementNames: readonly string[];
}

export interface UnitDef {
  readonly id: UnitId;
  readonly name: string;
  readonly unitClass: UnitClass;
  readonly houseId: HouseId | null; // null = available to all Houses (or event-only if isEventOnly)
  readonly isEventOnly: boolean;
  readonly maxHp: number;
  readonly attack: number;
  readonly structureAttack: number | null; // Non-null for siege units (siege_ram: 8, sapper_crew: 6)
  readonly defense: number;
  readonly movement: number;
  readonly range: number;
  readonly sight: number;
  readonly matCost: number;
  readonly coinUpkeep: number;
  readonly requiredDecreeId: DecreeId | null;
  readonly requiresSmithyCombo: boolean;
  readonly countsTowardArmyCap: boolean;
  readonly canRehome: boolean;
  readonly flavor: string;
}

export interface ImprovementDef {
  readonly id: ImprovementId;
  readonly name: string;
  readonly houseId: HouseId | null; // null = shared across all Houses
  readonly matCost: number;
  readonly ironhelmMatCost: number | null; // Discounted cost for Ironhelm walls/towers
  readonly validTerrains: readonly TerrainType[];
  readonly requiresIronDeposit: boolean;
  readonly allowsBareMountainForOwner: boolean;
  readonly isFortification: boolean;
  readonly isEconomic: boolean;
  readonly baseFood: number;
  readonly baseMaterials: number;
  readonly baseCoin: number;
  readonly requiredDecreeId: DecreeId | null;
  readonly convertsToOnCapture: ImprovementId | null; // null = destroyed on capture (if faction-unique)
  readonly description: string;
}

export interface DecreeDef {
  readonly id: DecreeId;
  readonly title: string;
  readonly category: DecreeCategory;
  readonly flavor: string;
  readonly effectText: string;
  readonly unlocksImprovementId: ImprovementId | null;
  readonly unlocksUnitId: UnitId | null;
  readonly excludedHouseIds?: readonly HouseId[];
}

export interface RelicRuinDef {
  readonly id: RelicRuinId;
  readonly title: string;
  readonly vignette: string;
  readonly rewardSummary: string;
}

export interface FrontierEventDef {
  readonly id: EventId;
  readonly title: string;
  readonly seasons: readonly Season[]; // Empty or all 4 = Any
  readonly target: EventTarget;
  readonly hasChoice: boolean;
  readonly choiceOptions: readonly string[];
  readonly durationTurns: number; // 0 for instant events, 3 for seasonal effects
  readonly vignette: string;
  readonly effectText: string;
}

export interface CrownWritDef {
  readonly id: WritId;
  readonly title: string;
  readonly flavor: string;
  readonly requirementText: string;
  readonly rewardFavor: number;
  readonly rewardCoin: number;
  readonly rewardMaterials: number;
  readonly isVoluntaryTithe: boolean;
  readonly titheCoinCost: number;
}

export interface KeepSpecializationDef {
  readonly id: Exclude<KeepSpecialization, 'none'>;
  readonly name: string;
  readonly armyCapBonus: number;
  readonly maxKeepHp: number;
  readonly keepRegenPerTurn: number;
  readonly territoryDefBonus: number;
  readonly palisadeCap: number;
  readonly coinPerTurn: number;
  readonly marketCoinBonus: number;
  readonly annexCoinDiscount: number;
  readonly foodPerTurn: number;
  readonly farmFoodBonus: number;
  readonly repeatFoodThreshold: number;
  readonly description: string;
}

export interface TerrainDef {
  readonly id: TerrainType;
  readonly name: string;
  readonly moveCost: number | null; // null = impassable
  readonly defBonus: number;
  readonly blocksCavalry: boolean;
  readonly blocksRangedLos: boolean;
  readonly rangedBonusRange: number;
}

export interface SeasonDef {
  readonly id: Season;
  readonly name: string;
  readonly subtitle: string;
  readonly riverMoveCost: number;
  readonly farmFoodDelta: number;
  readonly forestersLodgeFoodDelta: number;
  readonly granaryFoodDelta: number;
  readonly unitSightDelta: number;
  readonly unitMovementDelta: number;
  readonly winterAttritionDamage: number;
}
