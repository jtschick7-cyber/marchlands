/**
 * Marchlands (Spec v2.0) — Branching Unit Battle Honors (20) & Commander Marshal Traits (4)
 */

import type {
  BattleHonorDef,
  BattleHonorId,
  CommanderTraitDef,
  CommanderTraitId,
  UnitClass,
} from '../types/game.ts';

export const COMMANDER_TRAIT_IDS: readonly CommanderTraitId[] = [
  'trait_castellan',
  'trait_vanguard',
  'trait_siege_master',
  'trait_quartermaster',
] as const;

export const COMMANDER_TRAITS: Readonly<Record<CommanderTraitId, CommanderTraitDef>> = {
  trait_castellan: {
    id: 'trait_castellan',
    level: 2,
    title: 'Castellan',
    effectText: 'Leadership aura grants +15% extra Defense when adjacent to a friendly Keep, Wall, or Outpost.',
  },
  trait_vanguard: {
    id: 'trait_vanguard',
    level: 2,
    title: 'Vanguard Marshal',
    effectText: 'Commander gains +1 Movement; leadership aura grants +10% extra Attack on offense.',
  },
  trait_siege_master: {
    id: 'trait_siege_master',
    level: 3,
    title: 'Siege Master',
    effectText: 'Adjacent friendly Siege units gain +2 Structure Attack and Trebuchets Deploy for free.',
  },
  trait_quartermaster: {
    id: 'trait_quartermaster',
    level: 3,
    title: 'Grand Quartermaster',
    effectText: 'Field Reinforce for units adjacent to the Commander costs 0 Coin and 0 Materials (Iron still applies).',
  },
};

export function getCommanderTraitChoicesForLevel(level: 2 | 3): readonly [CommanderTraitId, CommanderTraitId] {
  return level === 2
    ? ['trait_castellan', 'trait_vanguard']
    : ['trait_siege_master', 'trait_quartermaster'];
}

export const BATTLE_HONOR_IDS: readonly BattleHonorId[] = [
  'honor_wallbreaker',
  'honor_stalwart',
  'honor_shock_blade',
  'honor_iron_guard',
  'honor_pike_wall',
  'honor_march_guard',
  'honor_phalanx_master',
  'honor_bulwark',
  'honor_marksman',
  'honor_skirmisher',
  'honor_deadeye',
  'honor_high_watch',
  'honor_shock_lancer',
  'honor_outrider',
  'honor_barded_steed',
  'honor_raider',
  'honor_breacher',
  'honor_field_engineer',
  'honor_heavy_mantlet',
  'honor_rapid_crew',
] as const;

export const BATTLE_HONORS: Readonly<Record<BattleHonorId, BattleHonorDef>> = {
  // Infantry
  honor_wallbreaker: {
    id: 'honor_wallbreaker',
    unitClass: 'infantry',
    rank: 1,
    title: 'Wall-Breaker',
    effectText: '+25% Attack vs Structures & Keeps.',
  },
  honor_stalwart: {
    id: 'honor_stalwart',
    unitClass: 'infantry',
    rank: 1,
    title: 'Stalwart',
    effectText: '+15% Defense in all combats.',
  },
  honor_shock_blade: {
    id: 'honor_shock_blade',
    unitClass: 'infantry',
    rank: 2,
    title: 'Shock Blade',
    effectText: '+15% Attack on all strikes.',
  },
  honor_iron_guard: {
    id: 'honor_iron_guard',
    unitClass: 'infantry',
    rank: 2,
    title: 'Iron Guard',
    effectText: 'Immune to Shield Push and takes 15% less Ranged damage.',
  },
  // Spearman
  honor_pike_wall: {
    id: 'honor_pike_wall',
    unitClass: 'spearman',
    rank: 1,
    title: 'Pike Wall',
    effectText: '+15% Defense and +10% Attack when Bracing.',
  },
  honor_march_guard: {
    id: 'honor_march_guard',
    unitClass: 'spearman',
    rank: 1,
    title: 'March Guard',
    effectText: '+1 Movement.',
  },
  honor_phalanx_master: {
    id: 'honor_phalanx_master',
    unitClass: 'spearman',
    rank: 2,
    title: 'Phalanx Master',
    effectText: '+15% Attack in all combats.',
  },
  honor_bulwark: {
    id: 'honor_bulwark',
    unitClass: 'spearman',
    rank: 2,
    title: 'Bulwark',
    effectText: '+4 permanent Max HP (healed immediately).',
  },
  // Ranged
  honor_marksman: {
    id: 'honor_marksman',
    unitClass: 'ranged',
    rank: 1,
    title: 'Marksman',
    effectText: '+15% Attack on all volleys.',
  },
  honor_skirmisher: {
    id: 'honor_skirmisher',
    unitClass: 'ranged',
    rank: 1,
    title: 'Skirmisher',
    effectText: '+1 Movement.',
  },
  honor_deadeye: {
    id: 'honor_deadeye',
    unitClass: 'ranged',
    rank: 2,
    title: 'Deadeye',
    effectText: '+15% Overwatch damage and +15% Armor-Piercing.',
  },
  honor_high_watch: {
    id: 'honor_high_watch',
    unitClass: 'ranged',
    rank: 2,
    title: 'High Watch',
    effectText: '+1 Sight radius and +15% Defense.',
  },
  // Cavalry
  honor_shock_lancer: {
    id: 'honor_shock_lancer',
    unitClass: 'cavalry',
    rank: 1,
    title: 'Shock Lancer',
    effectText: '+15% extra Lance Charge Attack.',
  },
  honor_outrider: {
    id: 'honor_outrider',
    unitClass: 'cavalry',
    rank: 1,
    title: 'Outrider',
    effectText: '+1 Sight radius and Hills cost 1 Movement.',
  },
  honor_barded_steed: {
    id: 'honor_barded_steed',
    unitClass: 'cavalry',
    rank: 2,
    title: 'Barded Steed',
    effectText: '+20% Defense in all combats.',
  },
  honor_raider: {
    id: 'honor_raider',
    unitClass: 'cavalry',
    rank: 2,
    title: 'Reaver',
    effectText: 'Heals +3 HP whenever this unit slays an enemy.',
  },
  // Siege
  honor_breacher: {
    id: 'honor_breacher',
    unitClass: 'siege',
    rank: 1,
    title: 'Breacher',
    effectText: '+2 Structure Attack.',
  },
  honor_field_engineer: {
    id: 'honor_field_engineer',
    unitClass: 'siege',
    rank: 1,
    title: 'Field Engineer',
    effectText: '+1 Movement.',
  },
  honor_heavy_mantlet: {
    id: 'honor_heavy_mantlet',
    unitClass: 'siege',
    rank: 2,
    title: 'Heavy Mantlet',
    effectText: '+25% Defense against all attacks.',
  },
  honor_rapid_crew: {
    id: 'honor_rapid_crew',
    unitClass: 'siege',
    rank: 2,
    title: 'Rapid Crew',
    effectText: '+15% Attack and +2 Trebuchet splash damage.',
  },
};

export function getBattleHonorChoices(
  unitClass: Exclude<UnitClass, 'commander'>,
  rank: 1 | 2,
): readonly [BattleHonorId, BattleHonorId] {
  const matches = BATTLE_HONOR_IDS.filter(
    (id) => BATTLE_HONORS[id].unitClass === unitClass && BATTLE_HONORS[id].rank === rank,
  );
  return [matches[0]!, matches[1]!];
}
