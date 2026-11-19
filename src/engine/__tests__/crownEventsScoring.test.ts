import { describe, expect, it } from 'vitest';
import type { GameState, KeepState } from '../../types/game.ts';
import {
  CHRONICLE_TURN_LIMIT,
  DECREE_IDS,
  DECREES,
  EXHAUSTED_POOL_COIN,
  EXHAUSTED_POOL_MATERIALS,
  KEEP_BASE_MAX_HP,
  KEEP_GARRISON_MAX_HP,
  MANDATE_COOLDOWN_TURNS,
} from '../../data/index.ts';
import { coordKey } from '../coords.ts';
import {
  applyKeepSpecialization,
  openNextPendingModal,
  rollDraftHand,
  selectDecree,
} from '../draftAndSpec.ts';
import {
  checkWritCompletion,
  evaluateRegentsMandate,
  payRegentsTithe,
  performCrownGrant,
  performPetitionCharter,
  performRoyalReroll,
  publishCrownWrits,
} from '../crown.ts';
import { resolveEventChoice, triggerSeasonalEvent } from '../events.ts';
import { computeScore } from '../scoring.ts';
import { createInitialGameState, getKeepArmyCap, getSeason } from '../stateHelpers.ts';
import { buildRecap, endHouseTurn, isCommitPoint } from '../turn.ts';
import { checkVictory } from '../victory.ts';

function baseState(mode: 'dominion' | 'chronicle' = 'dominion'): GameState {
  return createInitialGameState({
    seed: 555,
    houseCount: 4,
    mode,
    difficulty: 'normal',
    humanHouseId: 'vane',
  });
}

describe('Step 6: Royal Decree Drafting & Keep Specializations', () => {
  it('enforces Draft Category Guarantee (1 Infra, 1 Mil, 1 Doc) and faction exclusions', () => {
    const state = baseState();

    // Vane: 24 eligible (no decree_fletchers_guild)
    for (let i = 0; i < 20; i++) {
      const { hand } = rollDraftHand({ ...state, rngCounter: i * 10 }, 'vane');
      expect(hand).toHaveLength(3);
      expect(new Set(hand).size).toBe(3);
      expect(hand).not.toContain('decree_fletchers_guild');
      const cats = hand.map((id) => DECREES[id].category).sort();
      expect(cats).toEqual(['doctrine', 'infrastructure', 'military']);
    }

    // Aurelia: never offered decree_chivalric_order or its 2 starting decrees
    for (let i = 0; i < 20; i++) {
      const { hand } = rollDraftHand({ ...state, rngCounter: i * 10 }, 'aurelia');
      expect(hand).not.toContain('decree_chivalric_order');
      expect(hand).not.toContain('decree_iron_prospecting');
      expect(hand).not.toContain('decree_master_smiths');
    }
  });

  it('falls back Doctrine -> Infrastructure -> Military and converts exhausted pool to Windfall', () => {
    const state = baseState();
    const allMilitary = DECREE_IDS.filter((id) => DECREES[id].category === 'military');
    const sNoMil: GameState = {
      ...state,
      houses: {
        ...state.houses,
        vane: { ...state.houses.vane!, decreeIds: allMilitary },
      },
    };
    const { hand } = rollDraftHand(sNoMil, 'vane');
    expect(hand).toHaveLength(3);
    const cats = hand.map((id) => DECREES[id].category);
    // 1 infrastructure, 2 doctrines (fallback picked Doctrine first)
    expect(cats.filter((c) => c === 'doctrine')).toHaveLength(2);
    expect(cats.filter((c) => c === 'infrastructure')).toHaveLength(1);

    // Exhausted pool converts pendingDraftCount into +15 Coin & +10 Mat per trigger
    const allVaneEligible = DECREE_IDS.filter((id) => id !== 'decree_fletchers_guild');
    const sExhausted: GameState = {
      ...state,
      houses: {
        ...state.houses,
        vane: {
          ...state.houses.vane!,
          decreeIds: allVaneEligible,
          pendingDraftCount: 2,
          resources: { materials: 5, coin: 10 },
        },
      },
    };
    const resolved = openNextPendingModal(sExhausted, 'vane');
    expect(resolved.phase).toBe('player_command');
    expect(resolved.houses.vane!.pendingDraftCount).toBe(0);
    expect(resolved.houses.vane!.resources.coin).toBe(10 + EXHAUSTED_POOL_COIN * 2);
    expect(resolved.houses.vane!.resources.materials).toBe(5 + EXHAUSTED_POOL_MATERIALS * 2);
  });

  it('resolves specialization_modal before draft_modal and applies Garrison Seat bonuses', () => {
    const state = baseState();
    const vaneKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!;
    const upgraded: GameState = {
      ...state,
      keeps: {
        ...state.keeps,
        [vaneKeep.id]: { ...vaneKeep, tier: 2 },
      },
      houses: {
        ...state.houses,
        vane: {
          ...state.houses.vane!,
          pendingSpecializationKeepIds: [vaneKeep.id],
          pendingDraftCount: 1,
        },
      },
    };

    const modal1 = openNextPendingModal(upgraded, 'vane');
    expect(modal1.phase).toBe('specialization_modal');

    const specialized = applyKeepSpecialization(modal1, 'vane', vaneKeep.id, 'garrison');
    expect(specialized.keeps[vaneKeep.id]!.maxKeepHp).toBe(KEEP_GARRISON_MAX_HP);
    expect(getKeepArmyCap(specialized, vaneKeep.id)).toBe(5);
    // Automatically transitions to draft_modal for the queued draft
    expect(specialized.phase).toBe('draft_modal');
    expect(specialized.pendingDraftChoices).toHaveLength(3);

    const chosenId = specialized.pendingDraftChoices![0]!;
    const afterDraft = selectDecree(specialized, 'vane', chosenId);
    expect(afterDraft.phase).toBe('player_command');
    expect(afterDraft.houses.vane!.decreeIds).toContain(chosenId);
  });
});

describe('Step 6: Crown Writs, Audience, Regent Mandate & Frontier Events', () => {
  it('publishes Writs on Turn 3, suppresses Turn 33 in Chronicle, and awards first-come Writs + Tithe', () => {
    const dom = publishCrownWrits({ ...baseState('dominion'), turnNumber: 3 });
    expect(dom.crown.activeWrits).toHaveLength(3);
    expect(dom.crown.nextWritTurn).toBe(9);

    // Chronicle Turn 33 publication is suppressed
    const chron33: GameState = {
      ...baseState('chronicle'),
      turnNumber: CHRONICLE_TURN_LIMIT,
      crown: {
        ...baseState('chronicle').crown,
        nextWritTurn: CHRONICLE_TURN_LIMIT,
        activeWrits: [
          { writId: 'writ_tithe', publishedTurn: 27, completedByHouseId: null },
        ],
      },
    };
    const afterChron33 = publishCrownWrits(chron33);
    expect(afterChron33.crown.activeWrits).toHaveLength(1);
    expect(afterChron33.crown.activeWrits[0]!.publishedTurn).toBe(27);

    // Voluntary Tithe & Automatic Writ completion
    const withTithe: GameState = {
      ...chron33,
      houses: {
        ...chron33.houses,
        vane: { ...chron33.houses.vane!, resources: { materials: 10, coin: 25 } },
      },
    };
    const paid = payRegentsTithe(withTithe, 'vane');
    expect(paid.houses.vane!.resources.coin).toBe(5);
    expect(paid.houses.vane!.favor).toBe(3);
    expect(paid.crown.activeWrits[0]!.completedByHouseId).toBe('vane');

    // Crown Audience: max 1/turn
    const withFavor: GameState = {
      ...dom,
      houses: { ...dom.houses, vane: { ...dom.houses.vane!, favor: 20 } },
    };
    const granted = performCrownGrant(withFavor, 'vane', 'materials');
    expect(granted.houses.vane!.resources.materials).toBe(withFavor.houses.vane!.resources.materials + 15);
    expect(granted.houses.vane!.audienceUsedThisTurn).toBe(true);
    // Second audience action on same turn is blocked
    const blocked = performPetitionCharter(granted, 'vane');
    expect(blocked.houses.vane!.pendingDraftCount).toBe(0);

    // Royal Reroll
    const inDraft = openNextPendingModal(
      {
        ...withFavor,
        houses: { ...withFavor.houses, vane: { ...withFavor.houses.vane!, pendingDraftCount: 1 } },
      },
      'vane',
    );
    const rerolled = performRoyalReroll(inDraft, 'vane');
    expect(rerolled.houses.vane!.favor).toBe(17);
    expect(rerolled.houses.vane!.audienceUsedThisTurn).toBe(true);
    expect(rerolled.pendingDraftChoices).toHaveLength(3);

    // Check automatic Writ completion (writ_clear_camp)
    const campWritState: GameState = {
      ...dom,
      crown: {
        ...dom.crown,
        activeWrits: [{ writId: 'writ_clear_camp', publishedTurn: 3, completedByHouseId: null }],
      },
      houses: {
        ...dom.houses,
        vane: { ...dom.houses.vane!, writProgress: { writ_clear_camp: 1 } },
      },
    };
    const completed = checkWritCompletion(campWritState, 'vane');
    expect(completed.crown.activeWrits[0]!.completedByHouseId).toBe('vane');
    expect(completed.houses.vane!.favor).toBe(4);
  });

  it('handles Regent Mandate claim, break + 6-turn cooldown, and 3-turn hold victory', () => {
    const state = baseState('dominion');
    const extraKeeps: Record<string, KeepState> = { ...state.keeps };
    for (let i = 1; i <= 3; i++) {
      const id = `keep_m_${i}`;
      extraKeeps[id] = {
        id,
        name: `Hold ${i}`,
        ownerHouseId: 'vane',
        tileKey: coordKey(i, i),
        x: i,
        y: i,
        tier: 1,
        isCapital: false,
        specialization: 'none',
        keepHp: KEEP_BASE_MAX_HP,
        maxKeepHp: KEEP_BASE_MAX_HP,
        damagedLastRound: false,
        foodProgress: 0,
        repeatMilestonesClaimed: 0,
      };
    }

    const qualified: GameState = {
      ...state,
      turnNumber: 10,
      keeps: extraKeeps,
      houses: { ...state.houses, vane: { ...state.houses.vane!, favor: 30 } },
    };

    const claimed = evaluateRegentsMandate(qualified, 'vane');
    expect(claimed.crown.claimantHouseId).toBe('vane');
    expect(claimed.crown.claimStartTurn).toBe(10);

    // Break claim on turn 11 by dropping favor < 30 -> 6-turn cooldown
    const broken = evaluateRegentsMandate(
      {
        ...claimed,
        turnNumber: 11,
        houses: { ...claimed.houses, vane: { ...claimed.houses.vane!, favor: 25 } },
      },
      'vane',
    );
    expect(broken.crown.claimantHouseId).toBeNull();
    expect(broken.crown.claimCooldowns.vane).toBe(11 + MANDATE_COOLDOWN_TURNS);

    // Win by holding from turn 10 to turn 13
    const won = evaluateRegentsMandate({ ...claimed, turnNumber: 13 }, 'vane');
    expect(won.phase).toBe('game_over');
    expect(won.victoryType).toBe('mandate');
    expect(won.winnerHouseId).toBe('vane');
  });

  it('derives seasons deterministically and triggers non-repeating Frontier Events', () => {
    expect(getSeason(1)).toBe('spring');
    expect(getSeason(4)).toBe('summer');
    expect(getSeason(7)).toBe('autumn');
    expect(getSeason(10)).toBe('winter');
    expect(getSeason(13)).toBe('spring');

    const s4 = triggerSeasonalEvent({ ...baseState(), turnNumber: 4 });
    expect(s4.recentEventIds).toHaveLength(1);
    const s4Repeat = triggerSeasonalEvent({ ...baseState(), turnNumber: 4 });
    expect(s4Repeat.recentEventIds).toEqual(s4.recentEventIds);

    // Resolve choice event (Royal Levy)
    const levyState: GameState = {
      ...baseState(),
      houses: { ...baseState().houses, vane: { ...baseState().houses.vane!, resources: { materials: 10, coin: 50 }, favor: 5 } },
      pendingEventChoice: { eventId: 'evt_royal_levy', houseId: 'vane', options: ['pay_coin', 'lose_favor'] },
    };
    const paidLevy = resolveEventChoice(levyState, 'vane', 'pay_coin');
    expect(paidLevy.houses.vane!.resources.coin).toBe(40); // 50 - floor(50 * 0.2)
    expect(paidLevy.pendingEventChoice).toBeNull();
  });
});

describe('Step 7: Scoring, Victory Priority, Commit Points & Fog-Filtered Recap', () => {
  it('excludes Aurelia starting decrees from Chronicle score and evaluates Victory modes', () => {
    const state = baseState('chronicle');
    const aureliaScore = computeScore(state, 'aurelia', false);
    expect(aureliaScore.decrees).toBe(0); // 2 starting decrees do NOT count

    const aureliaWithExtra: GameState = {
      ...state,
      houses: {
        ...state.houses,
        aurelia: {
          ...state.houses.aurelia!,
          decreeIds: [...state.houses.aurelia!.decreeIds, 'decree_toll_roads'],
        },
      },
    };
    expect(computeScore(aureliaWithExtra, 'aurelia', false).decrees).toBe(10);

    // Chronicle Turn 33 score victory
    const chronEnd = checkVictory({ ...aureliaWithExtra, turnNumber: CHRONICLE_TURN_LIMIT }, true);
    expect(chronEnd.phase).toBe('game_over');
    expect(chronEnd.victoryType).toBe('score');
    expect(chronEnd.winnerHouseId).not.toBeNull();

    // Dominion Supremacy (>= 65% & >= 5 Keeps)
    const dom = baseState('dominion');
    const keeps = { ...dom.keeps };
    // Make Vane own 6 keeps while rivals own 2 total (6/8 = 75% >= 65% and >= 5)
    for (const k of Object.values(keeps)) {
      if (k.ownerHouseId === 'corvus') {
        keeps[k.id] = { ...k, ownerHouseId: 'vane' };
      }
    }
    for (let i = 1; i <= 4; i++) {
      const id = `keep_sup_${i}`;
      keeps[id] = {
        id,
        name: `Sup ${i}`,
        ownerHouseId: 'vane',
        tileKey: coordKey(i, 0),
        x: i,
        y: 0,
        tier: 1,
        isCapital: false,
        specialization: 'none',
        keepHp: KEEP_BASE_MAX_HP,
        maxKeepHp: KEEP_BASE_MAX_HP,
        damagedLastRound: false,
        foodProgress: 0,
        repeatMilestonesClaimed: 0,
      };
    }
    const supWin = checkVictory({ ...dom, keeps }, false);
    expect(supWin.phase).toBe('game_over');
    expect(supWin.victoryType).toBe('supremacy');
    expect(supWin.winnerHouseId).toBe('vane');
  });

  it('enforces isCommitPoint undo rules and fog-filtered buildRecap', () => {
    const s = baseState();
    // Non-commit actions with unchanged rngCounter & fog
    expect(isCommitPoint(s, s, 'build', 'vane')).toBe(false);
    expect(isCommitPoint(s, s, 'rehome', 'vane')).toBe(false);
    expect(isCommitPoint(s, s, 'crown_grant', 'vane')).toBe(false);

    // Always-commit actions & PRNG consumption
    expect(isCommitPoint(s, s, 'attack', 'vane')).toBe(true);
    expect(isCommitPoint(s, s, 'annex', 'vane')).toBe(true);
    expect(isCommitPoint(s, { ...s, rngCounter: s.rngCounter + 1 }, 'move', 'vane')).toBe(true);

    // Fog reveal commits
    const revealedMore: GameState = {
      ...s,
      houses: {
        ...s.houses,
        vane: {
          ...s.houses.vane!,
          stats: { ...s.houses.vane!.stats, tilesRevealed: s.houses.vane!.stats.tilesRevealed + 1 },
        },
      },
    };
    expect(isCommitPoint(s, revealedMore, 'move', 'vane')).toBe(true);

    // Fog-filtered recap: private enemy event in unexplored fog is hidden; public event is shown
    const hiddenTile = Object.keys(s.fog.vane!).find((k) => s.fog.vane![k] === 'unexplored')!;
    const withEvents: GameState = {
      ...s,
      turnNumber: 3, // 1 turn before Summer -> next-season warning included
      chronicle: [
        {
          id: 'c1',
          turnNumber: 3,
          type: 'ruin_explored',
          actorHouseId: 'corvus',
          targetHouseId: null,
          tileKey: hiddenTile,
          summary: 'Secret Corvus ruin',
          isPublic: false,
        },
        {
          id: 'c2',
          turnNumber: 3,
          type: 'writ_published',
          actorHouseId: null,
          targetHouseId: null,
          tileKey: null,
          summary: 'Public Writ Published',
          isPublic: true,
        },
      ],
    };
    const recap = buildRecap(withEvents, 'vane', 2);
    expect(recap.sinceYouLastRuled.map((l) => l.text)).toContain('Public Writ Published');
    expect(recap.sinceYouLastRuled.map((l) => l.text)).not.toContain('Secret Corvus ruin');
    expect(recap.yourRealm.some((l) => l.text.includes('Summer'))).toBe(true);

    // Full round turn advancement via endHouseTurn
    let cur = baseState();
    for (let i = 0; i < 4; i++) {
      cur = endHouseTurn(cur);
    }
    expect(cur.turnNumber).toBe(2);
    expect(cur.activeHouseId).toBe(cur.houseOrder[0]);
  });
});
