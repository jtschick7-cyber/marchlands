/**
 * Marchlands (Spec v2.0) — Relic Ruins (12), Frontier Events (14),
 * Crown Writs (12), Keep Specializations (4), Citadel Charters (4),
 * Terrains (5), and Seasons (4).
 */

import type {
  CitadelCharter,
  CitadelCharterDef,
  CrownWritDef,
  EventId,
  FrontierEventDef,
  KeepSpecialization,
  KeepSpecializationDef,
  RelicRuinDef,
  RelicRuinId,
  Season,
  SeasonDef,
  TerrainDef,
  TerrainType,
  WritId,
} from '../types/game.ts';
import {
  KEEP_GARRISON_HP_BONUS,
  KEEP_GARRISON_REGEN_BONUS,
  MARKET_TOWN_ANNEX_COIN_DISCOUNT,
  WALL_CAP_GARRISON_BONUS,
} from './constants.ts';

// ============================================================================
// 12 Relic Ruin Encounters
// ============================================================================

export const RELIC_RUIN_IDS: readonly RelicRuinId[] = [
  'ruin_sunken_armory',
  'ruin_tax_vault',
  'ruin_monastic_cellar',
  'ruin_charter_archive',
  'ruin_surveyors_cairn',
  'ruin_mercenary_cache',
  'ruin_apothecary_shrine',
  'ruin_iron_foundry',
  'ruin_wayfarer_tomb',
  'ruin_seed_vault',
  'ruin_beacon_rotunda',
  'ruin_war_council_hall',
] as const;

export const RELIC_RUINS: Readonly<Record<RelicRuinId, RelicRuinDef>> = {
  ruin_sunken_armory: {
    id: 'ruin_sunken_armory',
    title: 'The Sunken Armory',
    vignette:
      'Beneath a collapsed stone lintel, your scouts unearth oiled crates of broadheads and forged iron ingots.',
    rewardSummary: '+12 Materials and +4 Iron',
  },
  ruin_tax_vault: {
    id: 'ruin_tax_vault',
    title: 'The Old Mint Vault',
    vignette:
      'Behind a rusted iron grate in a ruined customs house lie stacked chests of stamped silver crowns.',
    rewardSummary: '+22 Coin',
  },
  ruin_monastic_cellar: {
    id: 'ruin_monastic_cellar',
    title: 'Abbey Cellars',
    vignette:
      'Sealed casks of smoked grain, dried orchard fruit, and salted stores remain untouched beneath the roofless cloister.',
    rewardSummary: '+18 Food to nearest friendly Keep',
  },
  ruin_charter_archive: {
    id: 'ruin_charter_archive',
    title: 'The Burnt Chancellery',
    vignette:
      'Inside a fireproof bronze reliquary, your chroniclers recover intact administrative charters from the First Kingdom.',
    rewardSummary: 'Immediate Doctrine Pair Draft',
  },
  ruin_surveyors_cairn: {
    id: 'ruin_surveyors_cairn',
    title: "Surveyor's Cairn",
    vignette:
      'Etched slate maps atop an ancient boundary cairn reveal every river bend and mountain pass for leagues around.',
    rewardSummary: 'Permanently clears 11x11 fog radius',
  },
  ruin_mercenary_cache: {
    id: 'ruin_mercenary_cache',
    title: 'Free-Company Hoard',
    vignette:
      'A forgotten outlaw stash hidden inside a hollow watchtower yields minted coin, iron bars, and timber.',
    rewardSummary: '+12 Coin, +8 Materials, and +2 Iron',
  },
  ruin_apothecary_shrine: {
    id: 'ruin_apothecary_shrine',
    title: "Hearth-Warden's Shrine",
    vignette:
      'Clean spring water and preserved medicinal herbs restore your weary vanguard to full fighting strength.',
    rewardSummary: 'Heals unit to 100% HP and +8 Food to nearest Keep',
  },
  ruin_iron_foundry: {
    id: 'ruin_iron_foundry',
    title: 'Collapsed Bloomery',
    vignette:
      'Excavating an ancient hillside furnace exposes rich, partially smelted iron blooms ready for the anvil.',
    rewardSummary: '+8 Materials, +5 Iron, and adds an Iron Deposit to this tile',
  },
  ruin_wayfarer_tomb: {
    id: 'ruin_wayfarer_tomb',
    title: 'Barrow of the March-Lord',
    vignette:
      'A weathered stone effigy clutches an engraved war-horn and a purse of tribute silver.',
    rewardSummary: '+14 Coin and restores unit movement this turn',
  },
  ruin_seed_vault: {
    id: 'ruin_seed_vault',
    title: 'The Root-Cellar of Oakhaven',
    vignette:
      'Clay amphorae sealed with beeswax hold hardy heirloom seed stock suited for frontier soil.',
    rewardSummary: '+14 Food to nearest Keep and +8 Coin',
  },
  ruin_beacon_rotunda: {
    id: 'ruin_beacon_rotunda',
    title: 'Collapsed Signal Rotunda',
    vignette:
      'Polished bronze mirrors salvaged from the dome allow your scouts to spot movement across the valley.',
    rewardSummary: 'Permanently clears 9x9 fog radius and +10 Coin',
  },
  ruin_war_council_hall: {
    id: 'ruin_war_council_hall',
    title: 'The Pact Stone',
    vignette:
      'Carved into the monolith are the ancient laws of frontier governance, inspiring your commanders.',
    rewardSummary: 'Immediate Doctrine Pair Draft and +6 Coin',
  },
};

// ============================================================================
// 14 Frontier Events
// ============================================================================

export const EVENT_IDS: readonly EventId[] = [
  'evt_royal_levy',
  'evt_bountiful_harvest',
  'evt_blight',
  'evt_hard_frost',
  'evt_outlaw_resurgence',
  'evt_free_company',
  'evt_tournament',
  'evt_plague',
  'evt_pilgrims',
  'evt_timber_boom',
  'evt_iron_strike',
  'evt_deserters',
  'evt_inspection',
  'evt_fair_season',
] as const;

export const FRONTIER_EVENTS: Readonly<Record<EventId, FrontierEventDef>> = {
  evt_royal_levy: {
    id: 'evt_royal_levy',
    title: 'Royal Levy',
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    target: 'all_houses',
    hasChoice: true,
    choiceOptions: ['pay_coin', 'lose_favor'],
    durationTurns: 0,
    vignette:
      "Sealed writs from the Regent's Exchequer arrive by hard-ridden courier, demanding silver for the capital's coffers.",
    effectText: 'Choose: pay min(25, floor(coin * 0.2)) Coin or lose 2 Favor.',
  },
  evt_bountiful_harvest: {
    id: 'evt_bountiful_harvest',
    title: 'Bountiful Harvest',
    seasons: ['autumn'],
    target: 'all_houses',
    hasChoice: false,
    choiceOptions: [],
    durationTurns: 0,
    vignette:
      'Warm late rains and fat barley heads fill every threshing floor before the first frost.',
    effectText: "+6 Food to every Keep's growth bar.",
  },
  evt_blight: {
    id: 'evt_blight',
    title: 'Blight in the Fields',
    seasons: ['spring', 'summer'],
    target: 'leader',
    hasChoice: false,
    choiceOptions: [],
    durationTurns: 3,
    vignette:
      'Rust-spotted stalks and sour damp creep through the richest valley plots, sparing no granary.',
    effectText: "Leader's Farms -1 Food for 3 turns.",
  },
  evt_hard_frost: {
    id: 'evt_hard_frost',
    title: 'The Long Frost',
    seasons: ['winter'],
    target: 'all_houses',
    hasChoice: false,
    choiceOptions: [],
    durationTurns: 3,
    vignette:
      'North winds lock the river fords in iron ice, biting deep into every camp outside stone walls.',
    effectText: 'Winter attrition is 4 instead of 2 this season.',
  },
  evt_outlaw_resurgence: {
    id: 'evt_outlaw_resurgence',
    title: 'Outlaw Resurgence',
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    target: 'map',
    hasChoice: false,
    choiceOptions: [],
    durationTurns: 0,
    vignette:
      'Broken men and deserters gather beneath tattered black banners in the unclaimed timberlands.',
    effectText:
      'Spawn 1 Outlaw Camp (with Bandit) on an empty, unowned, passable tile >= 4 tiles from any Keep.',
  },
  evt_free_company: {
    id: 'evt_free_company',
    title: 'A Free Company Rides North',
    seasons: ['summer', 'autumn'],
    target: 'trailing',
    hasChoice: true,
    choiceOptions: ['hire', 'decline'],
    durationTurns: 0,
    vignette:
      'Ash-stained pikes and seasoned sellswords offer their blades to the House most hungry for steel.',
    effectText:
      'Choose: hire a Free Company Spearman for 20 Coin, or decline. Exempt from Army Cap, 2 Coin upkeep.',
  },
  evt_tournament: {
    id: 'evt_tournament',
    title: "The Regent's Tournament",
    seasons: ['summer'],
    target: 'all_houses',
    hasChoice: true,
    choiceOptions: ['enter', 'decline'],
    durationTurns: 0,
    vignette:
      "Pavilion tents rise along the King's Road, where gilded lances win more standing than quiet thrift.",
    effectText: 'Choose: pay 12 Coin for 2 Favor, or decline.',
  },
  evt_plague: {
    id: 'evt_plague',
    title: 'Lowland Fever',
    seasons: ['spring', 'summer', 'autumn'],
    target: 'most_keeps',
    hasChoice: false,
    choiceOptions: [],
    durationTurns: 0,
    vignette:
      'Marsh mist settles over crowded ditches, spoiling stored grain and thinning the watch.',
    effectText: 'Each Keep of the House with the most Keeps loses 10 growth-bar Food (minimum 0).',
  },
  evt_pilgrims: {
    id: 'evt_pilgrims',
    title: 'Pilgrim Caravans',
    seasons: ['spring', 'summer'],
    target: 'all_houses',
    hasChoice: false,
    choiceOptions: [],
    durationTurns: 0,
    vignette:
      'Shrine-bound wagons swell the market roads, leaving stamped silver at every tollgate.',
    effectText: '+3 Coin per Market or Guildhall owned (once).',
  },
  evt_timber_boom: {
    id: 'evt_timber_boom',
    title: 'Timber Boom',
    seasons: ['spring', 'autumn'],
    target: 'all_houses',
    hasChoice: false,
    choiceOptions: [],
    durationTurns: 3,
    vignette:
      'Dry riverbeds and steady winds let sawyers haul twice the heartwood out of the ridges.',
    effectText: 'Lumber Mills & Logging Camps +1 Materials for 3 turns.',
  },
  evt_iron_strike: {
    id: 'evt_iron_strike',
    title: 'A New Vein Struck',
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    target: 'map',
    hasChoice: false,
    choiceOptions: [],
    durationTurns: 0,
    vignette: 'A rockslide on the high crags lays bare a gleaming seam of grey bog-iron.',
    effectText: 'One unowned Hills tile gains an Iron Deposit and is revealed to all Houses.',
  },
  evt_deserters: {
    id: 'evt_deserters',
    title: 'Grumbling in the Ranks',
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    target: 'highest_upkeep',
    hasChoice: true,
    choiceOptions: ['pay_bonus', 'suffer_damage'],
    durationTurns: 0,
    vignette: 'Sullen captains count copper at the pay-table while boots rot in the mud.',
    effectText:
      "Choose: pay 2x this turn's unit upkeep in Coin, or highest-upkeep unit takes 6 true damage (min 1 HP).",
  },
  evt_inspection: {
    id: 'evt_inspection',
    title: 'Royal Inspection',
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    target: 'lowest_favor',
    hasChoice: false,
    choiceOptions: [],
    durationTurns: 0,
    vignette:
      "A Regent's herald rides into the lesser court, noting dutiful service overlooked by louder rivals.",
    effectText: '+3 Favor (catch-up).',
  },
  evt_fair_season: {
    id: 'evt_fair_season',
    title: 'Fair Season',
    seasons: ['summer', 'autumn'],
    target: 'all_houses',
    hasChoice: false,
    choiceOptions: [],
    durationTurns: 3,
    vignette: 'Clear passes and calm waters bring merchant trains from the southern cities.',
    effectText: 'Markets & Guildhalls +2 Coin for 3 turns.',
  },
};

// ============================================================================
// 12 Crown Writs (v2.0 Scaled Rewards incl. Iron)
// ============================================================================

export const WRIT_IDS: readonly WritId[] = [
  'writ_clear_camp',
  'writ_annex',
  'writ_watch',
  'writ_strongholds',
  'writ_victories',
  'writ_markets',
  'writ_relics',
  'writ_muster',
  'writ_tithe',
  'writ_iron',
  'writ_raze',
  'writ_capture',
] as const;

export const CROWN_WRITS: Readonly<Record<WritId, CrownWritDef>> = {
  writ_clear_camp: {
    id: 'writ_clear_camp',
    title: 'Rid the Roads of Brigands',
    flavor:
      'Hang the highwaymen from their own ridge-poles and the Crown will remember your zeal.',
    requirementText: 'Clear an Outlaw Camp',
    rewardFavor: 4,
    rewardCoin: 8,
    rewardMaterials: 0,
    rewardIron: 2,
    isVoluntaryTithe: false,
    titheCoinCost: 0,
  },
  writ_annex: {
    id: 'writ_annex',
    title: 'Bring the Elders to Heel',
    flavor: 'Unclaimed hamlets pay no tax; bring their hearths under a chartered banner.',
    requirementText: 'Annex or capture a Frontier Village',
    rewardFavor: 5,
    rewardCoin: 0,
    rewardMaterials: 0,
    rewardIron: 0,
    isVoluntaryTithe: false,
    titheCoinCost: 0,
  },
  writ_watch: {
    id: 'writ_watch',
    title: 'Light the Beacons',
    flavor: 'Two stone towers burning through the dusk prove your wardens hold the high passes.',
    requirementText: 'Hold units on 2 Ancient Watchtowers at the same time',
    rewardFavor: 5,
    rewardCoin: 0,
    rewardMaterials: 0,
    rewardIron: 0,
    isVoluntaryTithe: false,
    titheCoinCost: 0,
  },
  writ_strongholds: {
    id: 'writ_strongholds',
    title: 'Raise the Banners',
    flavor: 'Timber palisades are for squatters; the Council honors Houses that raise stone strongholds.',
    requirementText: 'Own 2 Tier-2+ Strongholds',
    rewardFavor: 5,
    rewardCoin: 0,
    rewardMaterials: 0,
    rewardIron: 2,
    isVoluntaryTithe: false,
    titheCoinCost: 0,
  },
  writ_victories: {
    id: 'writ_victories',
    title: 'Blood the Levies',
    flavor: 'Letters of commendation are written in enemy steel, not parchment.',
    requirementText: 'Destroy 3 enemy units',
    rewardFavor: 4,
    rewardCoin: 0,
    rewardMaterials: 8,
    rewardIron: 2,
    isVoluntaryTithe: false,
    titheCoinCost: 0,
  },
  writ_markets: {
    id: 'writ_markets',
    title: 'Fill the Royal Coffers',
    flavor: 'Chartered markets keep coin moving north and silver flowing back to the Regent.',
    requirementText: 'Own 2 Markets or Guildhalls',
    rewardFavor: 4,
    rewardCoin: 10,
    rewardMaterials: 0,
    rewardIron: 0,
    isVoluntaryTithe: false,
    titheCoinCost: 0,
  },
  writ_relics: {
    id: 'writ_relics',
    title: 'Recover the Old Charters',
    flavor: 'Beneath fallen arches lie seals older than the current dynasty; bring them to light.',
    requirementText: 'Explore 2 Relic Ruins',
    rewardFavor: 4,
    rewardCoin: 0,
    rewardMaterials: 0,
    rewardIron: 0,
    isVoluntaryTithe: false,
    titheCoinCost: 0,
  },
  writ_muster: {
    id: 'writ_muster',
    title: "Show the Crown's Strength",
    flavor: 'Parade eight banners under arms so every rival counts your spears twice.',
    requirementText: 'End a turn with 8 or more units',
    rewardFavor: 3,
    rewardCoin: 0,
    rewardMaterials: 0,
    rewardIron: 0,
    isVoluntaryTithe: false,
    titheCoinCost: 0,
  },
  writ_tithe: {
    id: 'writ_tithe',
    title: "Pay the Regent's Tithe",
    flavor: 'Gold speaks louder than oaths when the Exchequer calls the roll.',
    requirementText: 'Voluntarily pay 30 Coin',
    rewardFavor: 4,
    rewardCoin: 0,
    rewardMaterials: 0,
    rewardIron: 0,
    isVoluntaryTithe: true,
    titheCoinCost: 30,
  },
  writ_iron: {
    id: 'writ_iron',
    title: 'Secure the Iron Veins',
    flavor: "He who feeds the royal smithies holds the Council's ear.",
    requirementText: 'Own 2 Iron Mines (Deep Smelteries count)',
    rewardFavor: 4,
    rewardCoin: 0,
    rewardMaterials: 0,
    rewardIron: 3,
    isVoluntaryTithe: false,
    titheCoinCost: 0,
  },
  writ_raze: {
    id: 'writ_raze',
    title: "Break the Usurper's Walls",
    flavor: "Tear down a rival's walls and let the wind whistle through his border.",
    requirementText: 'Raze an enemy Palisade, Stone Wall, or Watchtower',
    rewardFavor: 4,
    rewardCoin: 0,
    rewardMaterials: 6,
    rewardIron: 2,
    isVoluntaryTithe: false,
    titheCoinCost: 0,
  },
  writ_capture: {
    id: 'writ_capture',
    title: 'Punish the Disloyal',
    flavor: "Seize a rival's stronghold and the Regent will call it justice.",
    requirementText: 'Capture an enemy Keep',
    rewardFavor: 6,
    rewardCoin: 0,
    rewardMaterials: 0,
    rewardIron: 3,
    isVoluntaryTithe: false,
    titheCoinCost: 0,
  },
};

// ============================================================================
// Tier-2 Keep Specializations (4) & Tier-3 Citadel Charters (4)
// ============================================================================

export const KEEP_SPECIALIZATION_IDS: readonly Exclude<KeepSpecialization, 'none'>[] = [
  'garrison',
  'market_town',
  'granary_seat',
  'forge_seat',
] as const;

export const KEEP_SPECIALIZATIONS: Readonly<
  Record<Exclude<KeepSpecialization, 'none'>, KeepSpecializationDef>
> = {
  garrison: {
    id: 'garrison',
    name: 'Garrison Seat',
    armyCapBonus: 1,
    maxKeepHpBonus: KEEP_GARRISON_HP_BONUS,
    keepRegenBonus: KEEP_GARRISON_REGEN_BONUS,
    territoryDefBonus: 0.10,
    palisadeCapBonus: WALL_CAP_GARRISON_BONUS,
    coinPerTurn: 0,
    marketCoinBonus: 0,
    annexCoinDiscount: 0,
    foodPerTurn: 0,
    farmFoodBonus: 0,
    ironPerTurn: 0,
    unitIronDiscount: 0,
    growthThresholdMultiplier: 1.0,
    description:
      'Army Cap +1; Max Keep HP +14; Regen +2; +10% Def in territory; Wall cap +2.',
  },
  market_town: {
    id: 'market_town',
    name: 'Market Town',
    armyCapBonus: 0,
    maxKeepHpBonus: 0,
    keepRegenBonus: 0,
    territoryDefBonus: 0,
    palisadeCapBonus: 0,
    coinPerTurn: 5,
    marketCoinBonus: 2,
    annexCoinDiscount: MARKET_TOWN_ANNEX_COIN_DISCOUNT,
    foodPerTurn: 0,
    farmFoodBonus: 0,
    ironPerTurn: 0,
    unitIronDiscount: 0,
    growthThresholdMultiplier: 1.0,
    description:
      '+5 Coin/turn; Markets & Guildhalls +2 Coin; Peaceful Annexation costs 20% less Coin.',
  },
  granary_seat: {
    id: 'granary_seat',
    name: 'Granary Seat',
    armyCapBonus: 0,
    maxKeepHpBonus: 0,
    keepRegenBonus: 0,
    territoryDefBonus: 0,
    palisadeCapBonus: 0,
    coinPerTurn: 0,
    marketCoinBonus: 0,
    annexCoinDiscount: 0,
    foodPerTurn: 3,
    farmFoodBonus: 1,
    ironPerTurn: 0,
    unitIronDiscount: 0,
    growthThresholdMultiplier: 0.85,
    description:
      '+3 Food/turn; Farms +1 Food; automatic Winter Provision shield; growth thresholds -15%.',
  },
  forge_seat: {
    id: 'forge_seat',
    name: 'Forge Seat',
    armyCapBonus: 0,
    maxKeepHpBonus: 0,
    keepRegenBonus: 0,
    territoryDefBonus: 0,
    palisadeCapBonus: 0,
    coinPerTurn: 0,
    marketCoinBonus: 0,
    annexCoinDiscount: 0,
    foodPerTurn: 0,
    farmFoodBonus: 0,
    ironPerTurn: 1,
    unitIronDiscount: 2,
    growthThresholdMultiplier: 1.0,
    description:
      '+1 Iron/turn; Iron Mines & Quarries in territory +1 yield; units trained here cost -2 Iron (min 0).',
  },
};

export const CITADEL_CHARTER_IDS: readonly Exclude<CitadelCharter, 'none'>[] = [
  'war_college',
  'grand_exchange',
  'royal_bastion',
  'high_armory',
] as const;

export const CITADEL_CHARTERS: Readonly<
  Record<Exclude<CitadelCharter, 'none'>, CitadelCharterDef>
> = {
  war_college: {
    id: 'war_college',
    name: 'War College',
    description: 'Units trained at this Citadel begin at Rank 1 (3 XP) with an immediate Battle Honor.',
  },
  grand_exchange: {
    id: 'grand_exchange',
    name: 'Grand Exchange',
    description: '+8 Coin/turn and -1 Coin upkeep (min 0) on every building inside this Citadel territory.',
  },
  royal_bastion: {
    id: 'royal_bastion',
    name: 'Royal Bastion',
    description:
      'Existing Palisades and Watchtowers in territory immediately upgrade to Level 2 for free, and Walls auto-repair +3 HP/turn.',
  },
  high_armory: {
    id: 'high_armory',
    name: 'High Armory',
    description: 'Units trained at this Citadel gain +2 Max HP and -1 Coin upkeep (min 1 for elites).',
  },
};

// ============================================================================
// Terrain Definitions
// ============================================================================

export const TERRAINS: Readonly<Record<TerrainType, TerrainDef>> = {
  plains: {
    id: 'plains',
    name: 'Plains',
    moveCost: 1,
    defBonus: 0.0,
    blocksCavalry: false,
    blocksRangedLos: false,
    rangedBonusRange: 0,
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    moveCost: 2,
    defBonus: 0.25,
    blocksCavalry: true,
    blocksRangedLos: false,
    rangedBonusRange: 0,
  },
  hills: {
    id: 'hills',
    name: 'Hills',
    moveCost: 2,
    defBonus: 0.2,
    blocksCavalry: false,
    blocksRangedLos: false,
    rangedBonusRange: 1,
  },
  mountain: {
    id: 'mountain',
    name: 'Mountain',
    moveCost: null,
    defBonus: 0.0,
    blocksCavalry: true,
    blocksRangedLos: true,
    rangedBonusRange: 0,
  },
  river: {
    id: 'river',
    name: 'River',
    moveCost: 2,
    defBonus: 0.0,
    blocksCavalry: false,
    blocksRangedLos: false,
    rangedBonusRange: 0,
  },
};

// ============================================================================
// Seasonal Calendar (4 Seasons, 3 Turns Each)
// ============================================================================

export const SEASON_ORDER: readonly Season[] = [
  'spring',
  'summer',
  'autumn',
  'winter',
] as const;

export const SEASONS: Readonly<Record<Season, SeasonDef>> = {
  spring: {
    id: 'spring',
    name: 'Spring',
    subtitle: 'Thaw',
    riverMoveCost: 3,
    farmFoodDelta: 1,
    loggingCampFoodDelta: 0,
    forestersLodgeFoodDelta: 0,
    granaryFoodDelta: 0,
    unitSightDelta: 0,
    unitMovementDelta: 0,
    winterAttritionDamage: 0,
  },
  summer: {
    id: 'summer',
    name: 'Summer',
    subtitle: 'Campaigning',
    riverMoveCost: 2,
    farmFoodDelta: 0,
    loggingCampFoodDelta: 0,
    forestersLodgeFoodDelta: 0,
    granaryFoodDelta: 0,
    unitSightDelta: 1,
    unitMovementDelta: 0,
    winterAttritionDamage: 0,
  },
  autumn: {
    id: 'autumn',
    name: 'Autumn',
    subtitle: 'Harvest',
    riverMoveCost: 2,
    farmFoodDelta: 1,
    loggingCampFoodDelta: 1,
    forestersLodgeFoodDelta: 1,
    granaryFoodDelta: 1,
    unitSightDelta: 0,
    unitMovementDelta: 0,
    winterAttritionDamage: 0,
  },
  winter: {
    id: 'winter',
    name: 'Winter',
    subtitle: 'Hard Frost',
    riverMoveCost: 1,
    farmFoodDelta: -2,
    loggingCampFoodDelta: 0,
    forestersLodgeFoodDelta: 0,
    granaryFoodDelta: 0,
    unitSightDelta: 0,
    unitMovementDelta: -1,
    winterAttritionDamage: 2,
  },
};
