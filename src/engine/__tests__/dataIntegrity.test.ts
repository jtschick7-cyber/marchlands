import { describe, expect, it } from 'vitest';
import {
  BANDIT_MAX_HP,
  BATTLE_HONOR_IDS,
  BATTLE_HONORS,
  CITADEL_CHARTERS,
  COMMANDER_TRAIT_IDS,
  COMMANDER_TRAITS,
  CROWN_WRITS,
  DECREE_IDS,
  DECREE_PAIR_IDS,
  DECREE_PAIRS,
  DECREES,
  EVENT_IDS,
  FRONTIER_EVENTS,
  HIGH_SEAT_MAX_HP,
  HOUSE_IDS,
  HOUSES,
  IMPROVEMENT_IDS,
  IMPROVEMENTS,
  KEEP_GARRISON_HP_BONUS,
  KEEP_SPECIALIZATIONS,
  KEEP_TIER1_MAX_HP,
  KEEP_TIER2_MAX_HP,
  KEEP_TIER3_IRON_COST,
  KEEP_TIER3_MAX_HP,
  MAP_PRESETS,
  OUTPOST_BASE_CAP,
  PALISADE_LV1_HP,
  PALISADE_LV2_HP,
  RELIC_RUIN_IDS,
  RELIC_RUINS,
  SPEC_VERSION,
  UNIT_IDS,
  UNITS,
  VILLAGE_MAX_HP,
  WAR_CAMP_MAX_PER_HOUSE,
  WAR_CAMP_MAX_PER_KEEP,
  WRIT_IDS,
} from '../../data/index.ts';

describe('Spec v2.0 Data Integrity', () => {
  it('defines Spec 2.0, 3 map presets, and 5 Houses with 14 unique settlement names & Lord-Commanders', () => {
    expect(SPEC_VERSION).toBe('2.0');
    expect(MAP_PRESETS.compact.gridSize).toBe(22);
    expect(MAP_PRESETS.standard.gridSize).toBe(28);
    expect(MAP_PRESETS.grand.gridSize).toBe(34);
    expect(MAP_PRESETS.grand.hasHighSeat).toBe(true);
    expect(MAP_PRESETS.compact.hasHighSeat).toBe(false);

    expect(HOUSE_IDS).toHaveLength(5);
    const allNames = new Set<string>();
    for (const id of HOUSE_IDS) {
      const house = HOUSES[id];
      expect(house.id).toBe(id);
      expect(house.settlementNames).toHaveLength(14);
      expect(house.commanderName.length).toBeGreaterThan(3);
      expect(house.commanderSkillId).toBeTruthy();
      expect(house.startingDecreeCount).toBe(0);
      expect(house.startingDecreeIds).toEqual([]);
      for (const name of house.settlementNames) {
        allNames.add(name);
      }
    }
    expect(allNames.size).toBe(70);
    expect(HOUSES.vane.commanderSkillId).toBe('wardens_volley');
  });

  it('defines 8 Mutually Exclusive Doctrine Pairs (16 Decrees) with symmetric opposites', () => {
    expect(DECREE_PAIR_IDS).toHaveLength(8);
    expect(DECREE_IDS).toHaveLength(16);
    expect(Object.keys(DECREES)).toHaveLength(16);

    for (const pairId of DECREE_PAIR_IDS) {
      const pair = DECREE_PAIRS[pairId];
      const [a, b] = pair.options;
      expect(DECREES[a].pairId).toBe(pairId);
      expect(DECREES[b].pairId).toBe(pairId);
      expect(DECREES[a].oppositeId).toBe(b);
      expect(DECREES[b].oppositeId).toBe(a);
    }
  });

  it('defines 16 units (including Trebuchet & Lord-Commander), 20 Battle Honors, and 4 Marshal Traits', () => {
    expect(UNIT_IDS).toHaveLength(16);
    expect(Object.keys(UNITS)).toHaveLength(16);
    expect(BATTLE_HONOR_IDS).toHaveLength(20);
    expect(Object.keys(BATTLE_HONORS)).toHaveLength(20);
    expect(COMMANDER_TRAIT_IDS).toHaveLength(4);
    expect(Object.keys(COMMANDER_TRAITS)).toHaveLength(4);

    // Core Iron & local requirement units
    expect(UNITS.men_at_arms.ironCost).toBe(4);
    expect(UNITS.men_at_arms.localRequirement).toBe('barracks');
    expect(UNITS.crossbowman.armorPiercingRatio).toBe(0.3);
    expect(UNITS.crossbowman.localRequirement).toBe('barracks_and_smithy');
    expect(UNITS.knight.localRequirement).toBe('smithy_combo');
    expect(UNITS.trebuchet.unitClass).toBe('siege');
    expect(UNITS.trebuchet.requiresDeploy).toBe(true);
    expect(UNITS.trebuchet.range).toBe(3);
    expect(UNITS.trebuchet.localRequirement).toBe('trebuchet_yard');
    expect(UNITS.lord_commander.unitClass).toBe('commander');
    expect(UNITS.lord_commander.countsTowardArmyCap).toBe(false);
    expect(UNITS.free_company_spearman.isEventOnly).toBe(true);
    expect(UNITS.free_company_spearman.countsTowardArmyCap).toBe(false);
  });

  it('defines 21 improvements (16 shared + 5 unique) with Level-2 upgrades and capture conversions', () => {
    expect(IMPROVEMENT_IDS).toHaveLength(21);
    expect(Object.keys(IMPROVEMENTS)).toHaveLength(21);

    expect(IMPROVEMENTS.barracks.minKeepTier).toBe(1);
    expect(IMPROVEMENTS.smithy.minKeepTier).toBe(2);
    expect(IMPROVEMENTS.smithy.ironCost).toBe(4);
    expect(IMPROVEMENTS.siege_workshop.minKeepTier).toBe(2);
    expect(IMPROVEMENTS.palisade.upgrade?.name).toBe('Stone Curtain Wall');
    expect(IMPROVEMENTS.watchtower.upgrade?.name).toBe('Stone Bastion Tower');
    expect(IMPROVEMENTS.war_camp.matCost).toBe(14);
    expect(WAR_CAMP_MAX_PER_KEEP).toBe(1);
    expect(WAR_CAMP_MAX_PER_HOUSE).toBe(3);

    expect(IMPROVEMENTS.foresters_lodge.convertsToOnCapture).toBe('logging_camp');
    expect(IMPROVEMENTS.deep_smeltery.convertsToOnCapture).toBe('iron_mine');
    expect(IMPROVEMENTS.river_tollhouse.convertsToOnCapture).toBe('stone_bridge');
    expect(IMPROVEMENTS.war_camp.convertsToOnCapture).toBeNull();
    expect(IMPROVEMENTS.signal_bastion.convertsToOnCapture).toBeNull();
  });

  it('defines canonical Keep Tiers 1-3, 4 Specializations, 4 Citadel Charters, and catalog counts', () => {
    expect(KEEP_TIER1_MAX_HP).toBe(36);
    expect(KEEP_TIER2_MAX_HP).toBe(48);
    expect(KEEP_TIER3_MAX_HP).toBe(64);
    expect(KEEP_GARRISON_HP_BONUS).toBe(14);
    expect(KEEP_TIER3_IRON_COST).toBe(16);
    expect(HIGH_SEAT_MAX_HP).toBe(42);
    expect(OUTPOST_BASE_CAP).toBe(2);
    expect(PALISADE_LV1_HP).toBe(14);
    expect(PALISADE_LV2_HP).toBe(24);
    expect(VILLAGE_MAX_HP).toBe(16);
    expect(BANDIT_MAX_HP).toBe(22);

    expect(Object.keys(KEEP_SPECIALIZATIONS)).toEqual([
      'garrison',
      'market_town',
      'granary_seat',
      'forge_seat',
    ]);
    expect(Object.keys(CITADEL_CHARTERS)).toEqual([
      'war_college',
      'grand_exchange',
      'royal_bastion',
      'high_armory',
    ]);

    expect(RELIC_RUIN_IDS).toHaveLength(12);
    expect(Object.keys(RELIC_RUINS)).toHaveLength(12);
    expect(EVENT_IDS).toHaveLength(14);
    expect(Object.keys(FRONTIER_EVENTS)).toHaveLength(14);
    expect(WRIT_IDS).toHaveLength(12);
    expect(Object.keys(CROWN_WRITS)).toHaveLength(12);
  });
});
