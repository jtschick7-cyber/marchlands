/**
 * Marchlands (Spec v2.0) — Canonical Pure TypeScript Types
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

export type SpecVersion = '2.0';
export type GameMode = 'dominion' | 'chronicle';
export type MapPreset = 'compact' | 'standard' | 'grand';
export type ChronicleLength = 48 | 72 | 108;
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type HouseId = 'vane' | 'ironhelm' | 'aurelia' | 'corvus' | 'solis';

export type TerrainType = 'plains' | 'forest' | 'hills' | 'mountain' | 'river';

export type LandmarkType =
  | 'none'
  | 'frontier_village'
  | 'ancient_watchtower'
  | 'relic_ruin'
  | 'outlaw_camp'
  | 'high_seat';

export type ImprovementId =
  | 'farm'
  | 'logging_camp'
  | 'lumber_mill'
  | 'stone_quarry'
  | 'highland_pasture'
  | 'river_fishery'
  | 'stone_bridge'
  | 'iron_mine'
  | 'peak_beacon'
  | 'market'
  | 'granary'
  | 'barracks'
  | 'smithy'
  | 'siege_workshop'
  | 'palisade'
  | 'watchtower'
  | 'foresters_lodge'
  | 'deep_smeltery'
  | 'river_tollhouse'
  | 'war_camp'
  | 'signal_bastion';

export type UnitClass =
  | 'infantry'
  | 'spearman'
  | 'ranged'
  | 'cavalry'
  | 'siege'
  | 'commander';

export type UnitId =
  | 'militia'
  | 'spearman'
  | 'sapper_crew'
  | 'archer'
  | 'men_at_arms'
  | 'crossbowman'
  | 'knight'
  | 'siege_ram'
  | 'trebuchet'
  | 'longbowman'
  | 'oathsworn_halberdier'
  | 'gilded_lancer'
  | 'dusk_outrider'
  | 'vanguard_spearman'
  | 'free_company_spearman'
  | 'lord_commander';

export type KeepSpecialization =
  | 'none'
  | 'garrison'
  | 'market_town'
  | 'granary_seat'
  | 'forge_seat';

export type CitadelCharter =
  | 'none'
  | 'war_college'
  | 'grand_exchange'
  | 'royal_bastion'
  | 'high_armory';

export type FogStatus = 'unexplored' | 'explored' | 'visible';

export type Phase =
  | 'player_command'
  | 'draft_modal'
  | 'specialization_modal'
  | 'citadel_modal'
  | 'honor_modal'
  | 'commander_trait_modal'
  | 'event_modal'
  | 'ai_turn'
  | 'game_over';

export type VictoryType =
  | 'conquest'
  | 'supremacy'
  | 'mandate'
  | 'score'
  | 'defeat';

export type DecreePairId =
  | 'pair_army'
  | 'pair_warfare'
  | 'pair_economy'
  | 'pair_winter'
  | 'pair_crown'
  | 'pair_firepower'
  | 'pair_medicine'
  | 'pair_frontier';

export type DecreeId =
  | 'decree_feudal_levies'
  | 'decree_standing_corps'
  | 'decree_stone_curtain'
  | 'decree_mobile_vanguard'
  | 'decree_chartered_guilds'
  | 'decree_royal_extraction'
  | 'decree_winter_granaries'
  | 'decree_hardened_marchers'
  | 'decree_regents_envoy'
  | 'decree_iron_sovereign'
  | 'decree_bodkin_volleys'
  | 'decree_grand_bombardment'
  | 'decree_field_surgeons'
  | 'decree_salvage_crews'
  | 'decree_border_wardens'
  | 'decree_royal_roads';

export type CommanderSkillId =
  | 'wardens_volley'
  | 'hold_the_line'
  | 'golden_banner'
  | 'raiders_horn'
  | 'beacon_mark';

export type CommanderTraitId =
  | 'trait_castellan'
  | 'trait_vanguard'
  | 'trait_siege_master'
  | 'trait_quartermaster';

export type BattleHonorId =
  // Infantry
  | 'honor_wallbreaker'
  | 'honor_stalwart'
  | 'honor_shock_blade'
  | 'honor_iron_guard'
  // Spearman
  | 'honor_pike_wall'
  | 'honor_march_guard'
  | 'honor_phalanx_master'
  | 'honor_bulwark'
  // Ranged
  | 'honor_marksman'
  | 'honor_skirmisher'
  | 'honor_deadeye'
  | 'honor_high_watch'
  // Cavalry
  | 'honor_shock_lancer'
  | 'honor_outrider'
  | 'honor_barded_steed'
  | 'honor_raider'
  // Siege
  | 'honor_breacher'
  | 'honor_field_engineer'
  | 'honor_heavy_mantlet'
  | 'honor_rapid_crew';

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
  | 'overwatch_shot'
  | 'unit_destroyed'
  | 'keep_captured'
  | 'high_seat_captured'
  | 'outpost_founded'
  | 'outpost_captured'
  | 'village_annexed'
  | 'village_seized'
  | 'keep_upgraded'
  | 'keep_specialized'
  | 'citadel_chartered'
  | 'improvement_upgraded'
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
  | 'unit_promoted'
  | 'commander_skill'
  | 'commander_wounded'
  | 'commander_rallied'
  | 'keep_repaired'
  | 'garrison_volley'
  | 'improvement_demolished'
  | 'unit_disbanded'
  | 'unit_reinforced'
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
  highSeatHp: number | null;
  highSeatDamagedLastRound: boolean;
  revealedByHouseIds: HouseId[];
  firstVisitedByHouseId: HouseId | null;
  ownerHouseId: HouseId | null;
  keepId: string | null;
  outpostId: string | null;
  improvement: ImprovementId | null;
  improvementLevel: 1 | 2;
  hasRoad: boolean;
  fortificationHp: number | null;
}

export interface KeepState {
  id: string;
  name: string;
  ownerHouseId: HouseId;
  tileKey: CoordKey;
  x: number;
  y: number;
  tier: 1 | 2 | 3;
  isCapital: boolean;
  isHighSeat: boolean;
  specialization: KeepSpecialization;
  citadelCharter: CitadelCharter;
  keepHp: number;
  maxKeepHp: number;
  damagedLastRound: boolean;
  garrisonVolleyUsedThisTurn: boolean;
  foodProgress: number;
  repeatMilestonesClaimed: number;
}

export interface OutpostState {
  id: string;
  name: string;
  ownerHouseId: HouseId;
  tileKey: CoordKey;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damagedLastRound: boolean;
}

export interface CommanderState {
  houseId: HouseId;
  unitId: string | null;
  xp: number;
  level: 1 | 2 | 3;
  traits: CommanderTraitId[];
  skillCooldown: number;
  woundedTurnsRemaining: number;
  skillActiveUntilTurn: number;
  markedTargetUnitId: string | null;
}

export interface UnitState {
  id: string;
  houseId: HouseId;
  typeId: UnitId;
  homeKeepId: string; // Keep ID, 'orphaned', 'free_company', or 'commander'
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
  xp: number;
  isFortified: boolean;
  isOverwatch: boolean;
  isDeployed: boolean;
  isCommander: boolean;
  movedOpenTilesThisTurn: number;
  battleHonors: BattleHonorId[];
  overwatchRangeBonusUntilTurn: number;
  commanderBuffUntilTurn: number;
}

export interface HouseStats {
  unitsDestroyed: number;
  keepsCaptured: number;
  commandersWounded: number;
  ruinsExplored: number;
  campsCleared: number;
  watchtowersReached: number;
  highSeatCaptured: number;
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
    iron: number;
    coin: number;
  };
  favor: number;
  audienceUsedThisTurn: boolean;
  lifetimeCoinEarned: number;
  coinMilestonesClaimed: number;
  nextCoinMilestone: number;
  decreeIds: DecreeId[];
  lockedDecreeIds: DecreeId[];
  startingDecreeCount: number;
  pendingDraftCount: number;
  pendingSpecializationKeepIds: string[];
  pendingCitadelKeepIds: string[];
  pendingHonorUnitIds: string[];
  pendingCommanderTrait: boolean;
  settlementNamesUsed: number;
  outpostsFoundedCount: number;
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
  chronicleLimit: ChronicleLength;
  mapPreset: MapPreset;
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
  outposts: Record<string, OutpostState>;
  units: Record<string, UnitState>;
  houses: Record<string, HouseState>;
  commanders: Record<string, CommanderState>;
  highSeatTileKey: CoordKey | null;
  highSeatFirstCapturedBy: HouseId | null;
  fog: Record<string, Record<CoordKey, FogStatus>>;
  crown: CrownState;
  activeEffects: ActiveEffect[];
  recentEventIds: EventId[];
  chronicle: ChronicleEvent[];
  pendingDraftChoices: DecreeId[] | null;
  pendingEventChoice: PendingEventChoice | null;
  nextUnitSeq: number;
  nextKeepSeq: number;
  nextOutpostSeq: number;
  nextEffectSeq: number;
  nextChronicleSeq: number;
}

// ============================================================================
// AI & Tactical Projection Types (Ephemeral, Never Persisted)
// ============================================================================

export interface TileThreat {
  vsSpearman: number;
  vsCavalry: number;
  vsRanged: number;
  vsInfantry: number;
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
  mapPreset: MapPreset;
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
  readonly commanderName: string;
  readonly commanderSkillId: CommanderSkillId;
  readonly commanderSkillName: string;
  readonly commanderSkillDesc: string;
  readonly commanderMovement: number;
  readonly startingDecreeIds: readonly DecreeId[];
  readonly startingDecreeCount: number;
  readonly aiPersonalityLabel: string;
  readonly colors: HouseColors;
  readonly settlementNames: readonly string[];
}

export type LocalBuildingRequirement =
  | 'none'
  | 'barracks'
  | 'barracks_and_smithy'
  | 'smithy_combo'
  | 'siege_workshop'
  | 'trebuchet_yard';

export interface UnitDef {
  readonly id: UnitId;
  readonly name: string;
  readonly unitClass: UnitClass;
  readonly houseId: HouseId | null;
  readonly isEventOnly: boolean;
  readonly isCommanderUnit: boolean;
  readonly maxHp: number;
  readonly attack: number;
  readonly structureAttack: number | null;
  readonly defense: number;
  readonly movement: number;
  readonly range: number;
  readonly sight: number;
  readonly matCost: number;
  readonly ironCost: number;
  readonly coinUpkeep: number;
  readonly localRequirement: LocalBuildingRequirement;
  readonly armorPiercingRatio: number; // e.g., 0.30 for Crossbowman vs Def >= 5
  readonly requiresDeploy: boolean;
  readonly countsTowardArmyCap: boolean;
  readonly canRehome: boolean;
  readonly flavor: string;
}

export interface ImprovementUpgradeDef {
  readonly name: string;
  readonly matCost: number;
  readonly ironCost: number;
  readonly coinCost: number;
  readonly minKeepTier: 2 | 3;
  readonly baseFood: number;
  readonly baseMaterials: number;
  readonly baseIron: number;
  readonly baseCoin: number;
  readonly coinUpkeep: number;
  readonly maxFortificationHp: number | null;
  readonly description: string;
}

export interface ImprovementDef {
  readonly id: ImprovementId;
  readonly name: string;
  readonly houseId: HouseId | null;
  readonly minKeepTier: 1 | 2 | 3;
  readonly matCost: number;
  readonly ironCost: number;
  readonly coinCost: number;
  readonly ironhelmMatCost: number | null;
  readonly coinUpkeep: number;
  readonly validTerrains: readonly TerrainType[];
  readonly requiresIronDeposit: boolean;
  readonly allowsBareMountainForOwner: boolean;
  readonly allowOneTileOutsideBorder: boolean;
  readonly isFortification: boolean;
  readonly isEconomic: boolean;
  readonly isMilitaryBuilding: boolean;
  readonly maxFortificationHp: number | null;
  readonly baseFood: number;
  readonly baseMaterials: number;
  readonly baseIron: number;
  readonly baseCoin: number;
  readonly convertsToOnCapture: ImprovementId | null;
  readonly description: string;
  readonly upgrade: ImprovementUpgradeDef | null;
}

export interface DecreePairDef {
  readonly id: DecreePairId;
  readonly theme: string;
  readonly options: readonly [DecreeId, DecreeId];
}

export interface DecreeDef {
  readonly id: DecreeId;
  readonly pairId: DecreePairId;
  readonly oppositeId: DecreeId;
  readonly title: string;
  readonly flavor: string;
  readonly effectText: string;
}

export interface BattleHonorDef {
  readonly id: BattleHonorId;
  readonly unitClass: Exclude<UnitClass, 'commander'>;
  readonly rank: 1 | 2;
  readonly title: string;
  readonly effectText: string;
}

export interface CommanderTraitDef {
  readonly id: CommanderTraitId;
  readonly level: 2 | 3;
  readonly title: string;
  readonly effectText: string;
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
  readonly seasons: readonly Season[];
  readonly target: EventTarget;
  readonly hasChoice: boolean;
  readonly choiceOptions: readonly string[];
  readonly durationTurns: number;
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
  readonly rewardIron: number;
  readonly isVoluntaryTithe: boolean;
  readonly titheCoinCost: number;
}

export interface KeepSpecializationDef {
  readonly id: Exclude<KeepSpecialization, 'none'>;
  readonly name: string;
  readonly armyCapBonus: number;
  readonly maxKeepHpBonus: number;
  readonly keepRegenBonus: number;
  readonly territoryDefBonus: number;
  readonly palisadeCapBonus: number;
  readonly coinPerTurn: number;
  readonly marketCoinBonus: number;
  readonly annexCoinDiscount: number;
  readonly foodPerTurn: number;
  readonly farmFoodBonus: number;
  readonly ironPerTurn: number;
  readonly unitIronDiscount: number;
  readonly growthThresholdMultiplier: number;
  readonly description: string;
}

export interface CitadelCharterDef {
  readonly id: Exclude<CitadelCharter, 'none'>;
  readonly name: string;
  readonly description: string;
}

export interface MapPresetConfig {
  readonly id: MapPreset;
  readonly label: string;
  readonly gridSize: 22 | 28 | 34;
  readonly capitalMinSpacing: number;
  readonly capitalMinEdgeDist: number;
  readonly villagesPerHouse: number;
  readonly extraContestedVillages: number;
  readonly minVillagesCloserPerHouse: number;
  readonly watchtowerCount: number;
  readonly relicRuinCount: number;
  readonly outlawCampCountBase: number;
  readonly extraIronMin: number;
  readonly extraIronMax: number;
  readonly hasHighSeat: boolean;
  readonly supremacyKeepShare: number;
  readonly supremacyMinKeeps4: number;
  readonly supremacyMinKeeps5: number;
  readonly mandateMinFavor: number;
  readonly mandateMinKeeps: number;
  readonly mandateMinTier3Citadels: number;
  readonly mandateHoldTurns: number;
  readonly defaultMaxTurns: number;
}

export interface TerrainDef {
  readonly id: TerrainType;
  readonly name: string;
  readonly moveCost: number | null;
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
  readonly loggingCampFoodDelta: number;
  readonly forestersLodgeFoodDelta: number;
  readonly granaryFoodDelta: number;
  readonly unitSightDelta: number;
  readonly unitMovementDelta: number;
  readonly winterAttritionDamage: number;
}
