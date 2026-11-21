/**
 * Marchlands (Spec v2.0) — 8 Mutually Exclusive Doctrine Pairs (16 Royal Decrees)
 */

import type { DecreeDef, DecreeId, DecreePairDef, DecreePairId } from '../types/game.ts';

export const DECREE_PAIR_IDS: readonly DecreePairId[] = [
  'pair_army',
  'pair_warfare',
  'pair_economy',
  'pair_winter',
  'pair_crown',
  'pair_firepower',
  'pair_medicine',
  'pair_frontier',
] as const;

export const DECREE_PAIRS: Readonly<Record<DecreePairId, DecreePairDef>> = {
  pair_army: {
    id: 'pair_army',
    theme: 'Army Structure',
    options: ['decree_feudal_levies', 'decree_standing_corps'],
  },
  pair_warfare: {
    id: 'pair_warfare',
    theme: 'Warfare Doctrine',
    options: ['decree_stone_curtain', 'decree_mobile_vanguard'],
  },
  pair_economy: {
    id: 'pair_economy',
    theme: 'Economic Charter',
    options: ['decree_chartered_guilds', 'decree_royal_extraction'],
  },
  pair_winter: {
    id: 'pair_winter',
    theme: 'Winter & Logistics',
    options: ['decree_winter_granaries', 'decree_hardened_marchers'],
  },
  pair_crown: {
    id: 'pair_crown',
    theme: 'Crown Politics',
    options: ['decree_regents_envoy', 'decree_iron_sovereign'],
  },
  pair_firepower: {
    id: 'pair_firepower',
    theme: 'Firepower & Siege',
    options: ['decree_bodkin_volleys', 'decree_grand_bombardment'],
  },
  pair_medicine: {
    id: 'pair_medicine',
    theme: 'Campaign Sustainment',
    options: ['decree_field_surgeons', 'decree_salvage_crews'],
  },
  pair_frontier: {
    id: 'pair_frontier',
    theme: 'Frontier Projection',
    options: ['decree_border_wardens', 'decree_royal_roads'],
  },
};

export const DECREE_IDS: readonly DecreeId[] = [
  'decree_feudal_levies',
  'decree_standing_corps',
  'decree_stone_curtain',
  'decree_mobile_vanguard',
  'decree_chartered_guilds',
  'decree_royal_extraction',
  'decree_winter_granaries',
  'decree_hardened_marchers',
  'decree_regents_envoy',
  'decree_iron_sovereign',
  'decree_bodkin_volleys',
  'decree_grand_bombardment',
  'decree_field_surgeons',
  'decree_salvage_crews',
  'decree_border_wardens',
  'decree_royal_roads',
] as const;

export const DECREES: Readonly<Record<DecreeId, DecreeDef>> = {
  decree_feudal_levies: {
    id: 'decree_feudal_levies',
    pairId: 'pair_army',
    oppositeId: 'decree_standing_corps',
    title: 'Feudal Levy Muster',
    flavor: 'Every hearth under your banner owes forty days of pike and bow service.',
    effectText:
      'Tier-1 units (Militia, Spearman, Archer, Sapper) cost -2 Mat (min 4); Tier-2+ Keeps gain +1 Army Cap.',
  },
  decree_standing_corps: {
    id: 'decree_standing_corps',
    pairId: 'pair_army',
    oppositeId: 'decree_feudal_levies',
    title: 'Standing Professional Corps',
    flavor: 'Drilled soldiers paid year-round outfight levies twice their number.',
    effectText:
      'Rank 1+ units gain +15% Attack & +10% Defense; +50% combat XP; Field Reinforce costs -25% Coin.',
  },
  decree_stone_curtain: {
    id: 'decree_stone_curtain',
    pairId: 'pair_warfare',
    oppositeId: 'decree_mobile_vanguard',
    title: 'Stone Curtain',
    flavor: 'River mortar and dressed ashlar turn frontier palisades into unbroken ramparts.',
    effectText:
      'Keeps & Fortifications gain +20% Max HP; Stone Wall upgrade costs -2 Iron; Bastion volleys +2 dmg; max cover cap 70%.',
  },
  decree_mobile_vanguard: {
    id: 'decree_mobile_vanguard',
    pairId: 'pair_warfare',
    oppositeId: 'decree_stone_curtain',
    title: 'Mobile Vanguard',
    flavor: 'Victory belongs to the banner that reaches the ridge before the mortar dries.',
    effectText:
      'Cavalry Lance Charge gains +15% extra Attack; Infantry gain +1 Movement when starting on Plains; +1 Road travel bonus.',
  },
  decree_chartered_guilds: {
    id: 'decree_chartered_guilds',
    pairId: 'pair_economy',
    oppositeId: 'decree_royal_extraction',
    title: 'Chartered Guilds',
    flavor: 'Royal market scales and salt charters bind every valley hamlet to your mint.',
    effectText:
      'Markets & Guildhalls yield +2 Coin/turn; Peaceful Annexation costs -30% Coin and Food.',
  },
  decree_royal_extraction: {
    id: 'decree_royal_extraction',
    pairId: 'pair_economy',
    oppositeId: 'decree_chartered_guilds',
    title: 'Royal Extraction',
    flavor: 'Deep shafts, timber chutes, and crown smelteries keep steel pouring to the front.',
    effectText:
      'Iron Mines & Deep Smelteries yield +1 Iron/turn; Quarries & Mills yield +1 Mat/turn; Smithy & Siege Workshop cost -2 Iron.',
  },
  decree_winter_granaries: {
    id: 'decree_winter_granaries',
    pairId: 'pair_winter',
    oppositeId: 'decree_hardened_marchers',
    title: 'Winter Granaries',
    flavor: 'Dry stone cellars let garrisons emerge fat and fresh when rivals starve.',
    effectText:
      'Granaries & Stone Silos extend Winter shelter +1 tile and grant +2 extra passive healing nearby.',
  },
  decree_hardened_marchers: {
    id: 'decree_hardened_marchers',
    pairId: 'pair_winter',
    oppositeId: 'decree_winter_granaries',
    title: 'Hardened Marchers',
    flavor: 'Frozen rivers are highways for soldiers who wear wool beneath their mail.',
    effectText:
      'All friendly units ignore Winter -1 Movement, halve Winter attrition, and gain +15% Attack during Winter.',
  },
  decree_regents_envoy: {
    id: 'decree_regents_envoy',
    pairId: 'pair_crown',
    oppositeId: 'decree_iron_sovereign',
    title: "Regent's Envoy",
    flavor: 'Silken seals and punctual couriers carry more weight in Council than braggarts.',
    effectText:
      '+50% Favor (rounded up) from Crown Writs and Watchtowers; Crown Audience actions cost -1 Favor (min 1).',
  },
  decree_iron_sovereign: {
    id: 'decree_iron_sovereign',
    pairId: 'pair_crown',
    oppositeId: 'decree_regents_envoy',
    title: 'Iron Sovereign',
    flavor: 'A dying council signs whatever parchment stands behind twenty thousand pikes.',
    effectText:
      '+10% Atk & Def vs Houses with more Favor; double Pillage & Commander Ransom Coin; violent village seizure loses 0 Favor.',
  },
  decree_bodkin_volleys: {
    id: 'decree_bodkin_volleys',
    pairId: 'pair_firepower',
    oppositeId: 'decree_grand_bombardment',
    title: 'Bodkin Volleys',
    flavor: 'Needle-hardened iron tips turn an ambush hill into a slaughterhouse.',
    effectText:
      'Ranged Overwatch deals 110% damage (up from 85%); Ranged counter bonus vs Infantry rises from +40% to +65%.',
  },
  decree_grand_bombardment: {
    id: 'decree_grand_bombardment',
    pairId: 'pair_firepower',
    oppositeId: 'decree_bodkin_volleys',
    title: 'Grand Bombardment',
    flavor: 'Heavy counterweight beams reduce stone citadels to chalk dust from half a league off.',
    effectText:
      'Trebuchets deal 3 splash damage to enemies adjacent to their target; Siege Rams & Sappers gain +2 Structure Attack.',
  },
  decree_field_surgeons: {
    id: 'decree_field_surgeons',
    pairId: 'pair_medicine',
    oppositeId: 'decree_salvage_crews',
    title: 'Field Chirurgeons',
    flavor: 'Boiled linen and willow-bark poultices save veterans who took years to train.',
    effectText:
      'Stationary passive healing increases +3 HP/turn; active Field Reinforce restores +12 HP instead of +8 HP.',
  },
  decree_salvage_crews: {
    id: 'decree_salvage_crews',
    pairId: 'pair_medicine',
    oppositeId: 'decree_field_surgeons',
    title: 'Battlefield Salvage',
    flavor: 'Every shattered mail shirt and felled timber cart feeds the next campaign.',
    effectText:
      'Slaying enemy units awards +4 Mat (+1 Iron if target cost Iron); clearing Outlaw Camps awards +2 extra Iron.',
  },
  decree_border_wardens: {
    id: 'decree_border_wardens',
    pairId: 'pair_frontier',
    oppositeId: 'decree_royal_roads',
    title: 'Border Wardens',
    flavor: 'Distant timber forts and hillside beacons claim the wild ridges before rivals arrive.',
    effectText:
      'Frontier Outpost cap increases 2 -> 3; Watchtowers & Bastions gain +1 Sight and cost -2 Materials.',
  },
  decree_royal_roads: {
    id: 'decree_royal_roads',
    pairId: 'pair_frontier',
    oppositeId: 'decree_border_wardens',
    title: 'Royal Road Network',
    flavor: 'Cobbled causeways shrink a thirty-league frontier into a three-day forced march.',
    effectText:
      'Roads cost only 1 Material to build; units starting their turn on a Road gain +1 Movement.',
  },
};
