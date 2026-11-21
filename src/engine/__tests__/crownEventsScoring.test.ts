import { describe, expect, it } from 'vitest';
import type { GameState, KeepState } from '../../types/game.ts';
import {
  AUDIENCE_IRON_AMOUNT,
  AUDIENCE_IRON_FAVOR,
  DECREE_PAIR_IDS,
  DECREE_PAIRS,
  DECREES,
  DEFAULT_CHRONICLE_LIMIT,
  EXHAUSTED_POOL_COIN,
  EXHAUSTED_POOL_IRON,
  EXHAUSTED_POOL_MATERIALS,
  KEEP_GARRISON_HP_BONUS,
  KEEP_TIER1_MAX_HP,
  KEEP_TIER2_MAX_HP,
  KEEP_TIER3_MAX_HP,
  MANDATE_COOLDOWN_TURNS,
  MAP_PRESETS,
  PALISADE_LV2_HP,
  SCORE_PER_DECREE,
  SCORE_PER_HIGH_SEAT,
} from '../../data/index.ts';
import { coordKey } from '../coords.ts';
import {
  applyBattleHonor,
  applyCitadelCharter,
  applyCommanderTrait,
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

function baseState(
  mode: 'dominion' | 'chronicle' = 'dominion',
  mapPreset: 'compact' | 'standard' | 'grand' = 'grand',
): GameState {
  return createInitialGameState({
    seed: 555,
    houseCount: 4,
    mode,
    mapPreset,
    difficulty: 'normal',
    humanHouseId: 'vane',
  });
}

describe('Step 6 (v2.0): Exclusive Doctrine Pairs, Specializations, Citadel Charters, Traits & Honors', () => {
  it('draws 2-option mutually exclusive Doctrine Pairs, permanently locks opposite, and pays Iron Windfall when exhausted', () => {
    const state = baseState();

    // Every roll presents [A, B] from the same pair
    for (let i = 0; i < 12; i++) {
      const { hand } = rollDraftHand({ ...state, rngCounter: i * 10 }, 'vane');
      expect(hand).toHaveLength(2);
      expect(DECREES[hand[0]!].oppositeId).toBe(hand[1]);
      expect(DECREES[hand[1]!].oppositeId).toBe(hand[0]);
    }

    // Enacting one locks its opposite forever
    const withDraft: GameState = {
      ...state,
      houses: {
        ...state.houses,
        vane: { ...state.houses.vane!, pendingDraftCount: 1 },
      },
    };
    const opened = openNextPendingModal(withDraft, 'vane');
    expect(opened.phase).toBe('draft_modal');
    expect(opened.pendingDraftChoices).toHaveLength(2);
    const [optA, optB] = opened.pendingDraftChoices!;
    const afterPick = selectDecree(opened, 'vane', optA!);
    expect(afterPick.houses.vane!.decreeIds).toContain(optA);
    expect(afterPick.houses.vane!.lockedDecreeIds).toContain(optB);
    expect(afterPick.phase).toBe('player_command');

    // Selecting locked opposite is rejected
    const blockedRetry = selectDecree(
      {
        ...afterPick,
        houses: { ...afterPick.houses, vane: { ...afterPick.houses.vane!, pendingDraftCount: 1 } },
      },
      'vane',
      optB!,
    );
    expect(blockedRetry.houses.vane!.decreeIds).not.toContain(optB);

    // Exhausting all 8 pairs awards Materials + Iron + Coin Windfall
    const allOptionAs = DECREE_PAIR_IDS.map((pid) => DECREE_PAIRS[pid].options[0]);
    const allOptionBs = DECREE_PAIR_IDS.map((pid) => DECREE_PAIRS[pid].options[1]);
    const exhaustedState: GameState = {
      ...state,
      houses: {
        ...state.houses,
        vane: {
          ...state.houses.vane!,
          decreeIds: allOptionAs,
          lockedDecreeIds: allOptionBs,
          pendingDraftCount: 2,
          resources: { materials: 5, iron: 2, coin: 10 },
        },
      },
    };
    const resolved = openNextPendingModal(exhaustedState, 'vane');
    expect(resolved.phase).toBe('player_command');
    expect(resolved.houses.vane!.pendingDraftCount).toBe(0);
    expect(resolved.houses.vane!.resources.materials).toBe(5 + EXHAUSTED_POOL_MATERIALS * 2);
    expect(resolved.houses.vane!.resources.iron).toBe(2 + EXHAUSTED_POOL_IRON * 2);
    expect(resolved.houses.vane!.resources.coin).toBe(10 + EXHAUSTED_POOL_COIN * 2);
  });

  it('enforces modal priority: spec -> citadel (Royal Bastion auto-Lv2) -> commander trait -> honor -> draft', () => {
    const state = baseState();
    const vaneKeep = Object.values(state.keeps).find((k) => k.ownerHouseId === 'vane')!;
    const palTileKey = coordKey(vaneKeep.x + 1, vaneKeep.y);

    const queued: GameState = {
      ...state,
      tiles: {
        ...state.tiles,
        [palTileKey]: {
          ...state.tiles[palTileKey]!,
          ownerHouseId: 'vane',
          keepId: vaneKeep.id,
          improvement: 'palisade',
          improvementLevel: 1,
          fortificationHp: 14,
        },
      },
      keeps: {
        ...state.keeps,
        [vaneKeep.id]: {
          ...vaneKeep,
          tier: 3,
          maxKeepHp: KEEP_TIER3_MAX_HP,
          keepHp: KEEP_TIER3_MAX_HP,
        },
      },
      commanders: {
        ...state.commanders,
        vane: { ...state.commanders.vane!, level: 2, xp: 6 },
      },
      units: {
        ...state.units,
        u_vet: {
          id: 'u_vet',
          houseId: 'vane',
          typeId: 'spearman',
          homeKeepId: vaneKeep.id,
          tileKey: coordKey(vaneKeep.x - 1, vaneKeep.y),
          x: vaneKeep.x - 1,
          y: vaneKeep.y,
          hp: 28,
          maxHp: 28,
          remainingMovement: 2,
          hasMoved: false,
          hasAttacked: false,
          spawnedOnTurn: 0,
          isMutinied: false,
          damagedSinceLastTurn: false,
          xp: 3,
          battleHonors: [],
          isFortified: false,
          isOverwatch: false,
          isDeployed: false,
          isCommander: false,
          movedOpenTilesThisTurn: 0,
          commanderBuffUntilTurn: 0,
          overwatchRangeBonusUntilTurn: 0,
        },
      },
      houses: {
        ...state.houses,
        vane: {
          ...state.houses.vane!,
          pendingSpecializationKeepIds: [vaneKeep.id],
          pendingCitadelKeepIds: [vaneKeep.id],
          pendingCommanderTrait: true,
          pendingHonorUnitIds: ['u_vet'],
          pendingDraftCount: 1,
        },
      },
    };

    // 1. Specialization modal first
    const m1 = openNextPendingModal(queued, 'vane');
    expect(m1.phase).toBe('specialization_modal');
    const afterSpec = applyKeepSpecialization(m1, 'vane', vaneKeep.id, 'garrison');
    expect(afterSpec.keeps[vaneKeep.id]!.maxKeepHp).toBe(
      KEEP_TIER3_MAX_HP + KEEP_GARRISON_HP_BONUS,
    );
    expect(getKeepArmyCap(afterSpec, vaneKeep.id)).toBe(6); // Tier-3 (5) + Garrison (+1)

    // 2. Citadel Charter modal next (Royal Bastion auto-upgrades palisade to Lv2 Stone Curtain Wall!)
    expect(afterSpec.phase).toBe('citadel_modal');
    const afterCharter = applyCitadelCharter(afterSpec, 'vane', vaneKeep.id, 'royal_bastion');
    expect(afterCharter.tiles[palTileKey]!.improvementLevel).toBe(2);
    expect(afterCharter.tiles[palTileKey]!.fortificationHp).toBe(PALISADE_LV2_HP);

    // 3. Commander Trait modal next
    expect(afterCharter.phase).toBe('commander_trait_modal');
    const afterTrait = applyCommanderTrait(afterCharter, 'vane', 'trait_vanguard');
    expect(afterTrait.commanders.vane!.traits).toContain('trait_vanguard');

    // 4. Unit Battle Honor modal next
    expect(afterTrait.phase).toBe('honor_modal');
    const afterHonor = applyBattleHonor(afterTrait, 'vane', 'u_vet', 'honor_march_guard');
    expect(afterHonor.units.u_vet!.battleHonors).toContain('honor_march_guard');

    // 5. Exclusive Doctrine Pair modal last
    expect(afterHonor.phase).toBe('draft_modal');
    expect(afterHonor.pendingDraftChoices).toHaveLength(2);
    const afterDraft = selectDecree(afterHonor, 'vane', afterHonor.pendingDraftChoices![0]!);
    expect(afterDraft.phase).toBe('player_command');
  });
});

describe('Step 6 (v2.0): Crown Writs, Emergency Iron, Regent Mandate & Frontier Events', () => {
  it('publishes Writs, suppresses final Chronicle turn, grants Iron Shipment & Regent Envoy discount', () => {
    const dom = publishCrownWrits({ ...baseState('dominion'), turnNumber: 3 });
    expect(dom.crown.activeWrits).toHaveLength(3);
    expect(dom.crown.nextWritTurn).toBe(9);

    // Chronicle final-turn publication suppressed
    const chronEnd: GameState = {
      ...baseState('chronicle'),
      turnNumber: DEFAULT_CHRONICLE_LIMIT,
      crown: {
        ...baseState('chronicle').crown,
        nextWritTurn: DEFAULT_CHRONICLE_LIMIT,
        activeWrits: [{ writId: 'writ_tithe', publishedTurn: 66, completedByHouseId: null }],
      },
    };
    const afterSuppressed = publishCrownWrits(chronEnd);
    expect(afterSuppressed.crown.activeWrits).toHaveLength(1);
    expect(afterSuppressed.crown.activeWrits[0]!.publishedTurn).toBe(66);

    // Voluntary Tithe (30 Coin -> +4 Favor in v2.0)
    const withTithe: GameState = {
      ...chronEnd,
      houses: {
        ...chronEnd.houses,
        vane: { ...chronEnd.houses.vane!, resources: { materials: 10, iron: 4, coin: 35 } },
      },
    };
    const paid = payRegentsTithe(withTithe, 'vane');
    expect(paid.houses.vane!.resources.coin).toBe(5);
    expect(paid.houses.vane!.favor).toBe(4);

    // Crown Audience: Emergency Iron Shipment (5 Favor -> +6 Iron) + 1/turn limit
    const withFavor: GameState = {
      ...dom,
      houses: { ...dom.houses, vane: { ...dom.houses.vane!, favor: 20 } },
    };
    const ironGrant = performCrownGrant(withFavor, 'vane', 'iron');
    expect(ironGrant.houses.vane!.resources.iron).toBe(
      withFavor.houses.vane!.resources.iron + AUDIENCE_IRON_AMOUNT,
    );
    expect(ironGrant.houses.vane!.favor).toBe(20 - AUDIENCE_IRON_FAVOR);
    expect(ironGrant.houses.vane!.audienceUsedThisTurn).toBe(true);
    // Second audience action blocked
    expect(performPetitionCharter(ironGrant, 'vane').houses.vane!.pendingDraftCount).toBe(0);

    // Royal Reroll swaps Doctrine Pair cleanly
    const inDraft = openNextPendingModal(
      {
        ...withFavor,
        houses: { ...withFavor.houses, vane: { ...withFavor.houses.vane!, pendingDraftCount: 1 } },
      },
      'vane',
    );
    const rerolled = performRoyalReroll(inDraft, 'vane');
    expect(rerolled.houses.vane!.favor).toBe(17);
    expect(rerolled.pendingDraftChoices).toHaveLength(2);
    expect(rerolled.pendingDraftChoices).not.toEqual(inDraft.pendingDraftChoices);

    // Writ completion awards Iron + Favor (with Regent's Envoy +50% Favor!)
    const campWrit: GameState = {
      ...dom,
      crown: {
        ...dom.crown,
        activeWrits: [{ writId: 'writ_clear_camp', publishedTurn: 3, completedByHouseId: null }],
      },
      houses: {
        ...dom.houses,
        vane: {
          ...dom.houses.vane!,
          decreeIds: ['decree_regents_envoy'],
          writProgress: { writ_clear_camp: 1 },
        },
      },
    };
    const completed = checkWritCompletion(campWrit, 'vane');
    expect(completed.crown.activeWrits[0]!.completedByHouseId).toBe('vane');
    expect(completed.houses.vane!.favor).toBe(6); // ceil(4 * 1.5)
    expect(completed.houses.vane!.resources.iron).toBe(campWrit.houses.vane!.resources.iron + 2);
  });

  it('handles preset-scaled Regent Mandate (Grand 34x34: Favor + Keeps + Tier-3 Citadels + Hold)', () => {
    const state = baseState('dominion', 'grand');
    const cfg = MAP_PRESETS.grand;
    const extraKeeps: Record<string, KeepState> = { ...state.keeps };

    // Give Vane cfg.mandateMinKeeps total keeps, including cfg.mandateMinTier3Citadels Tier-3 Citadels
    for (let i = 1; i < cfg.mandateMinKeeps; i++) {
      const id = `keep_m_${i}`;
      const isT3 = i <= cfg.mandateMinTier3Citadels;
      extraKeeps[id] = {
        id,
        name: `Hold ${i}`,
        ownerHouseId: 'vane',
        tileKey: coordKey(i, i),
        x: i,
        y: i,
        tier: isT3 ? 3 : 2,
        isCapital: false,
        isHighSeat: false,
        specialization: 'garrison',
        citadelCharter: isT3 ? 'war_college' : 'none',
        keepHp: isT3 ? KEEP_TIER3_MAX_HP : KEEP_TIER2_MAX_HP,
        maxKeepHp: isT3 ? KEEP_TIER3_MAX_HP : KEEP_TIER2_MAX_HP,
        damagedLastRound: false,
        garrisonVolleyUsedThisTurn: false,
        foodProgress: 0,
        repeatMilestonesClaimed: 0,
      };
    }

    const qualified: GameState = {
      ...state,
      turnNumber: 40,
      keeps: extraKeeps,
      houses: { ...state.houses, vane: { ...state.houses.vane!, favor: cfg.mandateMinFavor } },
    };

    const claimed = evaluateRegentsMandate(qualified, 'vane');
    expect(claimed.crown.claimantHouseId).toBe('vane');
    expect(claimed.crown.claimStartTurn).toBe(40);

    // Breaking claim applies cooldown
    const broken = evaluateRegentsMandate(
      {
        ...claimed,
        turnNumber: 42,
        houses: { ...claimed.houses, vane: { ...claimed.houses.vane!, favor: cfg.mandateMinFavor - 10 } },
      },
      'vane',
    );
    expect(broken.crown.claimantHouseId).toBeNull();
    expect(broken.crown.claimCooldowns.vane).toBe(42 + MANDATE_COOLDOWN_TURNS);

    // Holding for cfg.mandateHoldTurns wins Mandate
    const won = evaluateRegentsMandate(
      { ...claimed, turnNumber: 40 + cfg.mandateHoldTurns },
      'vane',
    );
    expect(won.phase).toBe('game_over');
    expect(won.victoryType).toBe('mandate');
    expect(won.winnerHouseId).toBe('vane');
  });

  it('derives seasons deterministically and resolves choice Frontier Events', () => {
    expect(getSeason(1)).toBe('spring');
    expect(getSeason(4)).toBe('summer');
    expect(getSeason(7)).toBe('autumn');
    expect(getSeason(10)).toBe('winter');
    expect(getSeason(13)).toBe('spring');

    const s4 = triggerSeasonalEvent({ ...baseState(), turnNumber: 4 });
    expect(s4.recentEventIds).toHaveLength(1);
    const s4Repeat = triggerSeasonalEvent({ ...baseState(), turnNumber: 4 });
    expect(s4Repeat.recentEventIds).toEqual(s4.recentEventIds);

    const levyState: GameState = {
      ...baseState(),
      houses: {
        ...baseState().houses,
        vane: { ...baseState().houses.vane!, resources: { materials: 10, iron: 4, coin: 50 }, favor: 5 },
      },
      pendingEventChoice: { eventId: 'evt_royal_levy', houseId: 'vane', options: ['pay_coin', 'lose_favor'] },
    };
    const paidLevy = resolveEventChoice(levyState, 'vane', 'pay_coin');
    expect(paidLevy.houses.vane!.resources.coin).toBe(40);
    expect(paidLevy.pendingEventChoice).toBeNull();
  });
});

describe('Step 7 (v2.0): Scoring, High Seat Balance, Victory, Commit Points & Recap', () => {
  it('scores Decrees, High Seat prestige (+15), Iron treasury, Chronicle turn limit & Dominion Supremacy', () => {
    const state = baseState('chronicle', 'compact');
    const baseScore = computeScore(state, 'vane', false);
    expect(baseScore.decrees).toBe(0);

    const enriched: GameState = {
      ...state,
      houses: {
        ...state.houses,
        vane: {
          ...state.houses.vane!,
          decreeIds: ['decree_royal_roads'],
          stats: { ...state.houses.vane!.stats, highSeatCaptured: 1 },
        },
      },
    };
    const nextScore = computeScore(enriched, 'vane', false);
    expect(nextScore.decrees).toBe(SCORE_PER_DECREE);
    expect(nextScore.landmarks).toBe(baseScore.landmarks + SCORE_PER_HIGH_SEAT);

    // Chronicle turn limit ends game cleanly by score
    const chronEnd = checkVictory({ ...enriched, turnNumber: state.chronicleLimit }, true);
    expect(chronEnd.phase).toBe('game_over');
    expect(chronEnd.victoryType).toBe('score');
    expect(chronEnd.winnerHouseId).not.toBeNull();

    // Dominion Supremacy on Compact (4 Houses: >= 65% & >= 5 Keeps)
    const dom = baseState('dominion', 'compact');
    const keeps = { ...dom.keeps };
    for (const k of Object.values(keeps)) {
      if (k.ownerHouseId === 'corvus') {
        keeps[k.id] = { ...k, ownerHouseId: 'vane' };
      }
    }
    for (let i = 1; i <= 5; i++) {
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
        isHighSeat: false,
        specialization: 'none',
        citadelCharter: 'none',
        keepHp: KEEP_TIER1_MAX_HP,
        maxKeepHp: KEEP_TIER1_MAX_HP,
        damagedLastRound: false,
        garrisonVolleyUsedThisTurn: false,
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
    expect(isCommitPoint(s, s, 'build', 'vane')).toBe(false);
    expect(isCommitPoint(s, s, 'rehome', 'vane')).toBe(false);
    expect(isCommitPoint(s, s, 'crown_grant', 'vane')).toBe(false);

    expect(isCommitPoint(s, s, 'attack', 'vane')).toBe(true);
    expect(isCommitPoint(s, s, 'annex', 'vane')).toBe(true);
    expect(isCommitPoint(s, { ...s, rngCounter: s.rngCounter + 1 }, 'move', 'vane')).toBe(true);

    const hiddenTile = Object.keys(s.fog.vane!).find((k) => s.fog.vane![k] === 'unexplored')!;
    const withEvents: GameState = {
      ...s,
      turnNumber: 3,
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

    let cur = baseState();
    for (let i = 0; i < 4; i++) {
      cur = endHouseTurn(cur);
    }
    expect(cur.turnNumber).toBe(2);
    expect(cur.activeHouseId).toBe(cur.houseOrder[0]);
  });
});
