/**
 * Marchlands (Spec v0.3) — The 25 Royal Decrees (Milestone Draft Pool)
 *
 * 6 Infrastructure Blueprints, 5 Military Charters, 14 Kingdom Doctrines.
 * Faction exclusions:
 * - decree_fletchers_guild excluded for Vane (24 eligible)
 * - decree_chivalric_order excluded for Aurelia (24 eligible)
 */

import type { DecreeCategory, DecreeDef, DecreeId } from '../types/game.ts';

export const DECREE_IDS: readonly DecreeId[] = [
  // Category A: Infrastructure Blueprints (6)
  'decree_iron_prospecting',
  'decree_master_smiths',
  'decree_timber_palisades',
  'decree_frontier_towers',
  'decree_chartered_markets',
  'decree_stone_granaries',
  // Category B: Military Charters (5)
  'decree_fletchers_guild',
  'decree_steel_arbalests',
  'decree_sword_guilds',
  'decree_chivalric_order',
  'decree_siege_engineers',
  // Category C: Kingdom Doctrines & Passives (14)
  'decree_crop_rotation',
  'decree_coppice_forestry',
  'decree_forced_march',
  'decree_veteran_drill',
  'decree_shield_wall',
  'decree_supply_lines',
  'decree_crown_envoys',
  'decree_border_levies',
  'decree_field_surgeons',
  'decree_highland_scouts',
  'decree_toll_roads',
  'decree_salvage_crews',
  'decree_fletcher_volleys',
  'decree_masonry_reinforcement',
] as const;

export const DRAFT_CATEGORY_FALLBACK_ORDER: readonly DecreeCategory[] = [
  'doctrine',
  'infrastructure',
  'military',
] as const;

export const DECREES: Readonly<Record<DecreeId, DecreeDef>> = {
  // =========================================================================
  // Category A: Infrastructure Blueprints (6)
  // =========================================================================
  decree_iron_prospecting: {
    id: 'decree_iron_prospecting',
    title: 'Royal Mining Charter',
    category: 'infrastructure',
    flavor:
      'He who controls the iron veins of the ridge commands the rhythm of every forge in the valley.',
    effectText:
      'Unlocks construction of the Iron Mine improvement (8 Mat, requires Iron Deposit, +3 Materials/turn).',
    unlocksImprovementId: 'iron_mine',
    unlocksUnitId: null,
  },
  decree_master_smiths: {
    id: 'decree_master_smiths',
    title: 'Guild of Master Smiths',
    category: 'infrastructure',
    flavor:
      'Bellows fed by river timber and ridge ore turn raw pig-iron into plate fit for noble shock cavalry.',
    effectText:
      'Unlocks construction of the Smithy improvement (10 Mat, +1 Materials/turn; enables Knight / Gilded Lancer training when adjacent to an Iron Mine or Deep Smeltery and a Lumber Mill).',
    unlocksImprovementId: 'smithy',
    unlocksUnitId: null,
  },
  decree_timber_palisades: {
    id: 'decree_timber_palisades',
    title: 'Border Palisade Edict',
    category: 'infrastructure',
    flavor:
      'Sharpened oak trunks sunk six feet deep have broken more warbands than gold ever bought.',
    effectText:
      'Unlocks construction of the Palisade Wall (5 Mat / 3 Mat for Ironhelm; blocks enemy unit movement and grants +30% Defense to friendly units standing on the tile).',
    unlocksImprovementId: 'palisade',
    unlocksUnitId: null,
  },
  decree_frontier_towers: {
    id: 'decree_frontier_towers',
    title: 'Watchmen of the March',
    category: 'infrastructure',
    flavor:
      'A single beacon lit upon a stone tower warns the valley three days before riders crest the hills.',
    effectText:
      'Unlocks construction of the Watchtower (7 Mat / 5 Mat for Ironhelm; permanently reveals a 5x5 fog radius and grants +30% Defense).',
    unlocksImprovementId: 'watchtower',
    unlocksUnitId: null,
  },
  decree_chartered_markets: {
    id: 'decree_chartered_markets',
    title: 'Chartered Trade Markets',
    category: 'infrastructure',
    flavor:
      "Where roads cross and grain wagons gather, the Crown's tax collectors are never far behind.",
    effectText:
      'Unlocks construction of the Market (8 Mat, +3 Coin/turn, plus +1 Coin/turn per adjacent Farm or River tile).',
    unlocksImprovementId: 'market',
    unlocksUnitId: null,
  },
  decree_stone_granaries: {
    id: 'decree_stone_granaries',
    title: 'Tithe Granaries',
    category: 'infrastructure',
    flavor:
      'Dry cellars and salted stores ensure a hard frost breeds loyalty rather than famine.',
    effectText:
      "Unlocks construction of the Granary (8 Mat, +2 Food/turn, plus +1 Food/turn to every adjacent Farm or Forester's Lodge).",
    unlocksImprovementId: 'granary',
    unlocksUnitId: null,
  },

  // =========================================================================
  // Category B: Military Charters (5)
  // =========================================================================
  decree_fletchers_guild: {
    id: 'decree_fletchers_guild',
    title: "Fletchers' Guild",
    category: 'military',
    flavor:
      'Seasoned ash shafts and goose-feather fletching turn woodsmen into disciplined volley archers.',
    effectText: 'Unlocks recruitment of the Archer unit (10 Mat, 1 Coin upkeep, Ranged class, Range 2).',
    unlocksImprovementId: null,
    unlocksUnitId: 'archer',
    excludedHouseIds: ['vane'],
  },
  decree_steel_arbalests: {
    id: 'decree_steel_arbalests',
    title: 'Steel Arbalests',
    category: 'military',
    flavor:
      'A windlass crossbow requires half the training of a warbow and punches cleanly through shield walls.',
    effectText:
      'Unlocks recruitment of the Crossbowman unit (14 Mat, 2 Coin upkeep, Ranged class, Range 2, High Attack).',
    unlocksImprovementId: null,
    unlocksUnitId: 'crossbowman',
  },
  decree_sword_guilds: {
    id: 'decree_sword_guilds',
    title: 'Chartered Men-at-Arms',
    category: 'military',
    flavor:
      'Mail hauberks, poleaxes, and heavy longswords turn seasoned footmen into wall-breakers who cleave straight through pike lines.',
    effectText:
      'Unlocks recruitment of the Men-at-Arms unit (12 Mat, 1 Coin upkeep, infantry class, counters spearman).',
    unlocksImprovementId: null,
    unlocksUnitId: 'men_at_arms',
  },
  decree_chivalric_order: {
    id: 'decree_chivalric_order',
    title: 'Chivalric Order',
    category: 'military',
    flavor:
      'Barded warhorses and heavy lances shatter archer lines before a second volley can be loosed.',
    effectText:
      'Unlocks recruitment of the Knight unit (18 Mat, 3 Coin upkeep, Cavalry class; requires a Keep with an active Smithy adjacency combo).',
    unlocksImprovementId: null,
    unlocksUnitId: 'knight',
    excludedHouseIds: ['aurelia'],
  },
  decree_siege_engineers: {
    id: 'decree_siege_engineers',
    title: 'Siege Engineers',
    category: 'military',
    flavor:
      'Iron-capped battering rams wheeled under timber roofs reduce stubborn palisades to splinters.',
    effectText:
      'Unlocks recruitment of the Siege Ram unit (16 Mat, 2 Coin upkeep, Siege class; 8 Attack vs. Keeps, Palisades, and Watchtowers).',
    unlocksImprovementId: null,
    unlocksUnitId: 'siege_ram',
  },

  // =========================================================================
  // Category C: Kingdom Doctrines & Passives (14)
  // =========================================================================
  decree_crop_rotation: {
    id: 'decree_crop_rotation',
    title: 'Three-Field Rotation',
    category: 'doctrine',
    flavor:
      'Resting one strip in clover while sowing two in barley doubles the yield of river loam.',
    effectText: "All existing and future Farms and Forester's Lodges generate +1 Food/turn.",
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
  decree_coppice_forestry: {
    id: 'decree_coppice_forestry',
    title: 'Coppice Forestry',
    category: 'doctrine',
    flavor:
      'Harvesting timber in managed cycles keeps the sawmills fed without stripping the canopy bare.',
    effectText: 'All existing and future Lumber Mills generate +1 Materials/turn.',
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
  decree_forced_march: {
    id: 'decree_forced_march',
    title: 'Forced March',
    category: 'doctrine',
    flavor:
      'Light packs and double-time drums push foot soldiers across leagues of mud before dusk.',
    effectText:
      'All infantry and spearman units gain +1 Movement (does not apply to cavalry, ranged, or siege).',
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
  decree_veteran_drill: {
    id: 'decree_veteran_drill',
    title: 'Veteran Drill',
    category: 'doctrine',
    flavor: 'Daily spear-line formations on the muster field steady green levies under pressure.',
    effectText: 'All friendly military units gain +15% Attack during primary strikes and retaliations.',
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
  decree_shield_wall: {
    id: 'decree_shield_wall',
    title: 'Locked Shield Wall',
    category: 'doctrine',
    flavor: 'Overlapping oak boards turn a spear line into a mobile wooden rampart.',
    effectText:
      'Friendly spearman and infantry units gain +20% Defense when adjacent to at least one other friendly unit.',
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
  decree_supply_lines: {
    id: 'decree_supply_lines',
    title: 'Quartermaster Ledger',
    category: 'doctrine',
    flavor: 'Standardized wagon manifests cut spoilage and graft across every garrison.',
    effectText: 'Reduces the per-turn Coin upkeep of all friendly units by 1 (to a minimum of 0 Coin/turn).',
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
  decree_crown_envoys: {
    id: 'decree_crown_envoys',
    title: 'Crown Envoys',
    category: 'doctrine',
    flavor:
      'Silken banners, salt gifts, and royal tax exemptions persuade frontier elders to kneel without bloodshed.',
    effectText:
      'Reduces the cost of Peaceful Village Annexation by 40% (from 12 Food + 15 Coin down to 7 Food + 9 Coin).',
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
  decree_border_levies: {
    id: 'decree_border_levies',
    title: 'Frontier Muster',
    category: 'doctrine',
    flavor: 'Every hearth in a newly raised keep owes forty days of spear service to the banner.',
    effectText: 'Training militia and spearman units costs 2 fewer Materials (minimum 4 Mat).',
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
  decree_field_surgeons: {
    id: 'decree_field_surgeons',
    title: 'Field Chirurgeons',
    category: 'doctrine',
    flavor:
      'Boiled linen, willow bark, and cautery irons keep seasoned soldiers alive between skirmishes.',
    effectText:
      'Friendly units that end their turn without moving or attacking heal 6 HP instead of the standard 3 HP.',
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
  decree_highland_scouts: {
    id: 'decree_highland_scouts',
    title: 'Outrider Cartography',
    category: 'doctrine',
    flavor: 'Surveyors riding ahead of the column chart every ridge, ford, and ambush hollow.',
    effectText:
      'All friendly units gain +1 Sight Radius, and cavalry units gain +15% Attack when attacking on Plains tiles.',
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
  decree_toll_roads: {
    id: 'decree_toll_roads',
    title: 'Royal Road Tolls',
    category: 'doctrine',
    flavor: 'Cobbled milestones and guarded river ferries turn domestic travel into steady silver.',
    effectText: 'Every Keep and Stronghold generates +2 Coin/turn.',
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
  decree_salvage_crews: {
    id: 'decree_salvage_crews',
    title: 'Battlefield Salvage',
    category: 'doctrine',
    flavor:
      'Stripping shattered shields, arrowheads, and felled timbers turns victory into immediate material.',
    effectText:
      'Defeating an enemy unit or clearing an Outlaw Camp awards +4 Materials directly to your treasury.',
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
  decree_fletcher_volleys: {
    id: 'decree_fletcher_volleys',
    title: 'Bodkin Quivers',
    category: 'doctrine',
    flavor: 'Narrow, hardened iron tips find the seams in heavy mail and tower shields.',
    effectText:
      'Friendly ranged units increase their Counter-Triangle bonus against spearman units from +40% to +65%.',
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
  decree_masonry_reinforcement: {
    id: 'decree_masonry_reinforcement',
    title: 'Mortar & Stonework',
    category: 'doctrine',
    flavor: 'Packing timber palisades with river stone stops battering rams dead in their tracks.',
    effectText:
      'Friendly Keeps, Palisades, and Watchtowers grant +45% Defense (up from +30%/+35%) and take 25% less damage from siege units.',
    unlocksImprovementId: null,
    unlocksUnitId: null,
  },
};
