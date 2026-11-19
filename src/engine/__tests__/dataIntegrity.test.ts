import { describe, expect, it } from 'vitest';
import {
  BANDIT_MAX_HP,
  CROWN_WRITS,
  DECREE_IDS,
  DECREES,
  EVENT_IDS,
  FORTIFICATION_MAX_HP,
  FRONTIER_EVENTS,
  HOUSE_IDS,
  HOUSES,
  IMPROVEMENT_IDS,
  IMPROVEMENTS,
  KEEP_BASE_MAX_HP,
  KEEP_BASE_REGEN,
  KEEP_GARRISON_MAX_HP,
  KEEP_GARRISON_REGEN,
  KEEP_SPECIALIZATIONS,
  RELIC_RUIN_IDS,
  RELIC_RUINS,
  UNIT_IDS,
  UNITS,
  VILLAGE_MAX_HP,
  WAR_CAMP_MAX_PER_HOUSE,
  WAR_CAMP_MAX_PER_KEEP,
  WRIT_IDS,
} from '../../data/index.ts';

describe('Spec v0.3 Data Integrity', () => {
  it('defines 5 Houses with 10 settlement names each (50 total) and Aurelia starting decrees', () => {
    expect(HOUSE_IDS).toHaveLength(5);
    const allNames = new Set<string>();
    for (const id of HOUSE_IDS) {
      const house = HOUSES[id];
      expect(house.id).toBe(id);
      expect(house.settlementNames).toHaveLength(10);
      for (const name of house.settlementNames) {
        allNames.add(name);
      }
      if (id === 'aurelia') {
        expect(house.startingDecreeCount).toBe(2);
        expect(house.startingDecreeIds).toEqual([
          'decree_iron_prospecting',
          'decree_master_smiths',
        ]);
      } else {
        expect(house.startingDecreeCount).toBe(0);
        expect(house.startingDecreeIds).toEqual([]);
      }
    }
    expect(allNames.size).toBe(50);
  });

  it('defines all 25 Royal Decrees with exact category counts and Vane/Aurelia exclusions', () => {
    expect(DECREE_IDS).toHaveLength(25);
    expect(Object.keys(DECREES)).toHaveLength(25);

    const byCategory = { infrastructure: 0, military: 0, doctrine: 0 };
    for (const id of DECREE_IDS) {
      const d = DECREES[id];
      expect(d.id).toBe(id);
      byCategory[d.category] += 1;
    }
    expect(byCategory.infrastructure).toBe(6);
    expect(byCategory.military).toBe(5);
    expect(byCategory.doctrine).toBe(14);

    // Exclusions
    expect(DECREES.decree_fletchers_guild.excludedHouseIds).toEqual(['vane']);
    expect(DECREES.decree_chivalric_order.excludedHouseIds).toEqual(['aurelia']);

    // Eligible pool sizes per House
    const eligibleCount = (houseId: (typeof HOUSE_IDS)[number]) =>
      DECREE_IDS.filter((id) => !DECREES[id].excludedHouseIds?.includes(houseId)).length;

    expect(eligibleCount('vane')).toBe(24);
    expect(eligibleCount('aurelia')).toBe(24);
    expect(eligibleCount('ironhelm')).toBe(25);
    expect(eligibleCount('corvus')).toBe(25);
    expect(eligibleCount('solis')).toBe(25);
  });

  it('defines all 14 units with canonical v0.3 stats', () => {
    expect(UNIT_IDS).toHaveLength(14);
    expect(Object.keys(UNITS)).toHaveLength(14);

    // Siege units
    expect(UNITS.siege_ram.unitClass).toBe('siege');
    expect(UNITS.siege_ram.structureAttack).toBe(8);
    expect(UNITS.siege_ram.attack).toBe(4);
    expect(UNITS.siege_ram.maxHp).toBe(24);
    expect(UNITS.siege_ram.defense).toBe(4);
    expect(UNITS.siege_ram.matCost).toBe(16);

    expect(UNITS.sapper_crew.unitClass).toBe('siege');
    expect(UNITS.sapper_crew.structureAttack).toBe(6);
    expect(UNITS.sapper_crew.attack).toBe(2);
    expect(UNITS.sapper_crew.maxHp).toBe(18);
    expect(UNITS.sapper_crew.defense).toBe(3);
    expect(UNITS.sapper_crew.movement).toBe(2);
    expect(UNITS.sapper_crew.matCost).toBe(10);
    expect(UNITS.sapper_crew.coinUpkeep).toBe(1);
    expect(UNITS.sapper_crew.requiredDecreeId).toBeNull();

    // Men-at-Arms
    expect(UNITS.men_at_arms.unitClass).toBe('infantry');
    expect(UNITS.men_at_arms.maxHp).toBe(22);
    expect(UNITS.men_at_arms.attack).toBe(7);
    expect(UNITS.men_at_arms.defense).toBe(5);
    expect(UNITS.men_at_arms.matCost).toBe(12);
    expect(UNITS.men_at_arms.coinUpkeep).toBe(1);
    expect(UNITS.men_at_arms.requiredDecreeId).toBe('decree_sword_guilds');

    // Free Company Spearman
    expect(UNITS.free_company_spearman.isEventOnly).toBe(true);
    expect(UNITS.free_company_spearman.unitClass).toBe('spearman');
    expect(UNITS.free_company_spearman.maxHp).toBe(22);
    expect(UNITS.free_company_spearman.attack).toBe(8);
    expect(UNITS.free_company_spearman.defense).toBe(6);
    expect(UNITS.free_company_spearman.countsTowardArmyCap).toBe(false);
    expect(UNITS.free_company_spearman.canRehome).toBe(false);
  });

  it('defines all 13 improvements with v0.3 costs and capture conversions', () => {
    expect(IMPROVEMENT_IDS).toHaveLength(13);
    expect(Object.keys(IMPROVEMENTS)).toHaveLength(13);

    expect(IMPROVEMENTS.palisade.matCost).toBe(5);
    expect(IMPROVEMENTS.palisade.ironhelmMatCost).toBe(3);
    expect(IMPROVEMENTS.watchtower.matCost).toBe(7);
    expect(IMPROVEMENTS.watchtower.ironhelmMatCost).toBe(5);
    expect(IMPROVEMENTS.war_camp.matCost).toBe(14);
    expect(WAR_CAMP_MAX_PER_KEEP).toBe(1);
    expect(WAR_CAMP_MAX_PER_HOUSE).toBe(2);

    // Capture conversions
    expect(IMPROVEMENTS.foresters_lodge.convertsToOnCapture).toBe('lumber_mill');
    expect(IMPROVEMENTS.deep_smeltery.convertsToOnCapture).toBe('iron_mine');
    expect(IMPROVEMENTS.river_tollhouse.convertsToOnCapture).toBe('market');
    expect(IMPROVEMENTS.war_camp.convertsToOnCapture).toBeNull();
    expect(IMPROVEMENTS.signal_bastion.convertsToOnCapture).toBeNull();
  });

  it('defines canonical Keep HP, Village HP, Bandit HP, and content catalog counts', () => {
    expect(KEEP_BASE_MAX_HP).toBe(24);
    expect(KEEP_GARRISON_MAX_HP).toBe(34);
    expect(KEEP_BASE_REGEN).toBe(4);
    expect(KEEP_GARRISON_REGEN).toBe(6);
    expect(KEEP_SPECIALIZATIONS.garrison.maxKeepHp).toBe(34);
    expect(KEEP_SPECIALIZATIONS.granary_seat.repeatFoodThreshold).toBe(28);

    expect(VILLAGE_MAX_HP).toBe(12);
    expect(BANDIT_MAX_HP).toBe(18);
    expect(FORTIFICATION_MAX_HP).toBe(12);

    expect(RELIC_RUIN_IDS).toHaveLength(12);
    expect(Object.keys(RELIC_RUINS)).toHaveLength(12);
    expect(EVENT_IDS).toHaveLength(14);
    expect(Object.keys(FRONTIER_EVENTS)).toHaveLength(14);
    expect(WRIT_IDS).toHaveLength(12);
    expect(Object.keys(CROWN_WRITS)).toHaveLength(12);
  });
});
