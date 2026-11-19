/**
 * Marchlands (Spec v0.3) — Seasonal Frontier Events (14 Events)
 */

import type {
  CoordKey,
  EventId,
  GameState,
  HouseId,
  KeepState,
  TileState,
  UnitState,
} from '../types/game.ts';
import {
  BANDIT_MAX_HP,
  DESERTERS_TRUE_DAMAGE,
  EVENT_IDS,
  EVENT_NO_REPEAT_SEASONS,
  FREE_COMPANY_HIRE_COIN,
  FRONTIER_EVENTS,
  INSPECTION_FAVOR_GAIN,
  PLAGUE_FOOD_LOSS,
  ROYAL_LEVY_COIN_RATIO,
  ROYAL_LEVY_FAVOR_LOSS,
  ROYAL_LEVY_MAX_COIN,
  TOURNAMENT_COIN_COST,
  TOURNAMENT_FAVOR_REWARD,
  UNITS,
} from '../data/index.ts';
import { chebyshevDist } from './coords.ts';
import { openNextPendingModal } from './draftAndSpec.ts';
import { getUnitUpkeep } from './economy.ts';
import { permanentlyRevealRadius, recomputeHouseFog } from './fog.ts';
import { pickOne } from './prng.ts';
import { rankHousesByScore } from './scoring.ts';
import {
  addFavor,
  addLifetimeCoin,
  appendChronicle,
  getHouseKeeps,
  getHouseUnits,
  getSeason,
  getUnitAt,
} from './stateHelpers.ts';

function getLivingHouses(state: GameState): HouseId[] {
  return state.houseOrder.filter((id) => !state.houses[id]?.isEliminated);
}

function findFreeCompanySpawnTile(state: GameState, houseId: HouseId): { tileKey: CoordKey; keepId: string } | null {
  const keeps = getHouseKeeps(state, houseId);
  if (keeps.length === 0) return null;
  const capital = keeps.find((k) => k.isCapital) ?? keeps.sort((a, b) => a.id.localeCompare(b.id))[0]!;

  if (getUnitAt(state, capital.tileKey) === null) {
    return { tileKey: capital.tileKey, keepId: capital.id };
  }

  const candidates = Object.values(state.tiles)
    .filter(
      (t) =>
        t.keepId === capital.id &&
        t.terrain !== 'mountain' &&
        getUnitAt(state, t.key) === null,
    )
    .sort((a, b) => {
      const da = chebyshevDist(a.x, a.y, capital.x, capital.y);
      const db = chebyshevDist(b.x, b.y, capital.x, capital.y);
      if (da !== db) return da - db;
      return a.key.localeCompare(b.key);
    });

  if (candidates.length === 0) return null;
  return { tileKey: candidates[0]!.key, keepId: capital.id };
}

function getHouseTotalUpkeep(state: GameState, houseId: HouseId): number {
  const house = state.houses[houseId];
  if (!house) return 0;
  return getHouseUnits(state, houseId).reduce(
    (sum, u) => sum + getUnitUpkeep(house, u.typeId),
    0,
  );
}

/**
 * Deterministic AI choice selector for choice-based Frontier Events.
 */
function pickAiEventOption(state: GameState, houseId: HouseId, eventId: EventId): string {
  const house = state.houses[houseId]!;
  switch (eventId) {
    case 'evt_royal_levy': {
      // Aurelia or Mandate claimants strongly protect Favor; otherwise pay if affordable
      const levyCost = Math.min(
        ROYAL_LEVY_MAX_COIN,
        Math.floor(house.resources.coin * ROYAL_LEVY_COIN_RATIO),
      );
      if (house.id === 'aurelia' || house.favor >= 20 || levyCost <= 8) {
        return 'pay_coin';
      }
      return house.favor >= ROYAL_LEVY_FAVOR_LOSS ? 'lose_favor' : 'pay_coin';
    }
    case 'evt_free_company': {
      const spawn = findFreeCompanySpawnTile(state, houseId);
      if (spawn && house.resources.coin >= FREE_COMPANY_HIRE_COIN + 3) {
        return 'hire';
      }
      return 'decline';
    }
    case 'evt_tournament': {
      if (house.resources.coin >= TOURNAMENT_COIN_COST + (house.id === 'aurelia' ? 2 : 10)) {
        return 'enter';
      }
      return 'decline';
    }
    case 'evt_deserters': {
      const cost = getHouseTotalUpkeep(state, houseId) * 2;
      if (house.resources.coin >= cost && cost > 0) {
        return 'pay_bonus';
      }
      return 'suffer_damage';
    }
    default:
      return FRONTIER_EVENTS[eventId].choiceOptions[0] ?? 'decline';
  }
}

/**
 * Applies the selected option of a choice Frontier Event for `houseId`.
 */
export function resolveEventChoice(
  state: GameState,
  houseId: HouseId,
  option: string,
  eventIdOverride?: EventId,
): GameState {
  const eventId = eventIdOverride ?? state.pendingEventChoice?.eventId;
  if (!eventId) return state;

  let house = state.houses[houseId];
  if (!house || house.isEliminated) return state;

  let nextState: GameState = state;

  if (eventId === 'evt_royal_levy') {
    if (option === 'pay_coin') {
      const cost = Math.min(
        ROYAL_LEVY_MAX_COIN,
        Math.floor(house.resources.coin * ROYAL_LEVY_COIN_RATIO),
      );
      house = {
        ...house,
        resources: { ...house.resources, coin: Math.max(0, house.resources.coin - cost) },
      };
    } else {
      house = addFavor(house, -ROYAL_LEVY_FAVOR_LOSS);
    }
    nextState = {
      ...nextState,
      houses: { ...nextState.houses, [houseId]: house },
    };
  } else if (eventId === 'evt_free_company') {
    if (option === 'hire' && house.resources.coin >= FREE_COMPANY_HIRE_COIN) {
      const spawn = findFreeCompanySpawnTile(nextState, houseId);
      if (spawn) {
        const tile = nextState.tiles[spawn.tileKey]!;
        const def = UNITS.free_company_spearman;
        const unitId = `unit_${nextState.nextUnitSeq}`;
        const merc: UnitState = {
          id: unitId,
          houseId,
          typeId: 'free_company_spearman',
          homeKeepId: spawn.keepId,
          tileKey: tile.key,
          x: tile.x,
          y: tile.y,
          hp: def.maxHp,
          maxHp: def.maxHp,
          remainingMovement: 0,
          hasMoved: true,
          hasAttacked: true,
          spawnedOnTurn: nextState.turnNumber,
          isMutinied: false,
          damagedSinceLastTurn: false,
        };
        house = {
          ...house,
          resources: {
            ...house.resources,
            coin: house.resources.coin - FREE_COMPANY_HIRE_COIN,
          },
        };
        nextState = {
          ...nextState,
          houses: { ...nextState.houses, [houseId]: house },
          units: { ...nextState.units, [unitId]: merc },
          nextUnitSeq: nextState.nextUnitSeq + 1,
        };
        nextState = recomputeHouseFog(nextState, houseId);
      }
    }
  } else if (eventId === 'evt_tournament') {
    if (option === 'enter' && house.resources.coin >= TOURNAMENT_COIN_COST) {
      house = {
        ...house,
        resources: { ...house.resources, coin: house.resources.coin - TOURNAMENT_COIN_COST },
      };
      house = addFavor(house, TOURNAMENT_FAVOR_REWARD);
      nextState = {
        ...nextState,
        houses: { ...nextState.houses, [houseId]: house },
      };
    }
  } else if (eventId === 'evt_deserters') {
    const upkeepCost = getHouseTotalUpkeep(nextState, houseId) * 2;
    if (option === 'pay_bonus' && house.resources.coin >= upkeepCost) {
      house = {
        ...house,
        resources: { ...house.resources, coin: house.resources.coin - upkeepCost },
      };
      nextState = {
        ...nextState,
        houses: { ...nextState.houses, [houseId]: house },
      };
    } else {
      const units = getHouseUnits(nextState, houseId).sort((a, b) => {
        const diff = getUnitUpkeep(house, b.typeId) - getUnitUpkeep(house, a.typeId);
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
      });
      if (units.length > 0) {
        const victim = units[0]!;
        nextState = {
          ...nextState,
          units: {
            ...nextState.units,
            [victim.id]: {
              ...victim,
              hp: Math.max(1, victim.hp - DESERTERS_TRUE_DAMAGE),
            },
          },
        };
      }
    }
  }

  if (
    nextState.pendingEventChoice &&
    nextState.pendingEventChoice.houseId === houseId &&
    nextState.pendingEventChoice.eventId === eventId
  ) {
    nextState = {
      ...nextState,
      pendingEventChoice: null,
    };
    if (nextState.houses[houseId]?.isHuman) {
      nextState = openNextPendingModal(nextState, houseId);
    }
  }

  return nextState;
}

/**
 * Triggers a seasonal Frontier Event at the start of each new season (Turns 4, 7, 10, ...).
 * Prunes expired activeEffects first.
 */
export function triggerSeasonalEvent(state: GameState): GameState {
  // Prune expired active effects
  let nextState: GameState = {
    ...state,
    activeEffects: state.activeEffects.filter((e) => e.expiresAfterTurn >= state.turnNumber),
  };

  // Only fire on season start turns: 4, 7, 10, 13, ...
  if (nextState.turnNumber < 4 || (nextState.turnNumber - 1) % 3 !== 0) {
    return nextState;
  }

  const season = getSeason(nextState.turnNumber);
  const recentSet = new Set<EventId>(nextState.recentEventIds);
  let pool = EVENT_IDS.filter(
    (id) => FRONTIER_EVENTS[id].seasons.includes(season) && !recentSet.has(id),
  );
  if (pool.length === 0) {
    pool = EVENT_IDS.filter((id) => FRONTIER_EVENTS[id].seasons.includes(season));
  }

  const draw = pickOne(nextState.rngSeed, nextState.rngCounter, pool);
  const eventId = draw.value;
  const def = FRONTIER_EVENTS[eventId];

  const nextRecent = [...nextState.recentEventIds, eventId].slice(-EVENT_NO_REPEAT_SEASONS);
  nextState = {
    ...nextState,
    rngCounter: draw.nextCounter,
    recentEventIds: nextRecent,
  };

  nextState = appendChronicle(nextState, {
    type: 'frontier_event',
    actorHouseId: null,
    targetHouseId: null,
    tileKey: null,
    summary: `Frontier Event: ${def.title} — ${def.effectText}`,
    isPublic: true,
  });

  const living = getLivingHouses(nextState);
  if (living.length === 0) return nextState;

  const ranked = rankHousesByScore(nextState, false, true);
  const leaderId = ranked[0]!;
  const trailingId = ranked[ranked.length - 1]!;

  const applyChoiceForTargetHouses = (targets: HouseId[]) => {
    for (const hid of targets) {
      const h = nextState.houses[hid];
      if (!h || h.isEliminated) continue;
      if (h.isHuman) {
        // For Free Company, if no tile available or can't afford, still show options (UI disables hire if needed)
        nextState = {
          ...nextState,
          pendingEventChoice: {
            eventId,
            houseId: hid,
            options: [...def.choiceOptions],
          },
        };
      } else {
        const opt = pickAiEventOption(nextState, hid, eventId);
        nextState = resolveEventChoice(nextState, hid, opt, eventId);
      }
    }
  };

  switch (eventId) {
    case 'evt_royal_levy':
      applyChoiceForTargetHouses(living);
      break;

    case 'evt_bountiful_harvest': {
      const nextKeeps: Record<string, KeepState> = { ...nextState.keeps };
      for (const [kid, k] of Object.entries(nextKeeps)) {
        nextKeeps[kid] = { ...k, foodProgress: k.foodProgress + 4 };
      }
      nextState = { ...nextState, keeps: nextKeeps };
      break;
    }

    case 'evt_blight':
      nextState = {
        ...nextState,
        activeEffects: [
          ...nextState.activeEffects,
          {
            id: `eff_${nextState.nextEffectSeq}`,
            effectId: eventId,
            houseId: leaderId,
            expiresAfterTurn: nextState.turnNumber + def.durationTurns - 1,
          },
        ],
        nextEffectSeq: nextState.nextEffectSeq + 1,
      };
      break;

    case 'evt_hard_frost':
    case 'evt_timber_boom':
    case 'evt_fair_season':
      nextState = {
        ...nextState,
        activeEffects: [
          ...nextState.activeEffects,
          {
            id: `eff_${nextState.nextEffectSeq}`,
            effectId: eventId,
            houseId: null,
            expiresAfterTurn: nextState.turnNumber + def.durationTurns - 1,
          },
        ],
        nextEffectSeq: nextState.nextEffectSeq + 1,
      };
      break;

    case 'evt_outlaw_resurgence': {
      const allKeeps = Object.values(nextState.keeps);
      const candidates = Object.values(nextState.tiles)
        .filter(
          (t) =>
            t.ownerHouseId === null &&
            t.terrain !== 'mountain' &&
            t.terrain !== 'river' &&
            t.landmark === 'none' &&
            getUnitAt(nextState, t.key) === null &&
            allKeeps.every((k) => chebyshevDist(t.x, t.y, k.x, k.y) >= 4),
        )
        .sort((a, b) => a.key.localeCompare(b.key));
      if (candidates.length > 0) {
        const picked = pickOne(nextState.rngSeed, nextState.rngCounter, candidates);
        const t = picked.value;
        nextState = {
          ...nextState,
          rngCounter: picked.nextCounter,
          tiles: {
            ...nextState.tiles,
            [t.key]: {
              ...t,
              landmark: 'outlaw_camp',
              landmarkCleared: false,
              banditHp: BANDIT_MAX_HP,
            },
          },
        };
      }
      break;
    }

    case 'evt_free_company':
      applyChoiceForTargetHouses([trailingId]);
      break;

    case 'evt_tournament':
      applyChoiceForTargetHouses(living);
      break;

    case 'evt_plague': {
      const byKeeps = [...living].sort((a, b) => {
        const diff = getHouseKeeps(nextState, b).length - getHouseKeeps(nextState, a).length;
        return diff !== 0 ? diff : nextState.houseOrder.indexOf(a) - nextState.houseOrder.indexOf(b);
      });
      const victimHouseId = byKeeps[0]!;
      const nextKeeps: Record<string, KeepState> = { ...nextState.keeps };
      for (const [kid, k] of Object.entries(nextKeeps)) {
        if (k.ownerHouseId === victimHouseId) {
          nextKeeps[kid] = {
            ...k,
            foodProgress: Math.max(0, k.foodProgress - PLAGUE_FOOD_LOSS),
          };
        }
      }
      nextState = { ...nextState, keeps: nextKeeps };
      break;
    }

    case 'evt_pilgrims': {
      const nextHouses = { ...nextState.houses };
      for (const hid of living) {
        const markets = Object.values(nextState.tiles).filter(
          (t) => t.ownerHouseId === hid && t.improvement === 'market',
        ).length;
        if (markets > 0) {
          nextHouses[hid] = addLifetimeCoin(nextHouses[hid]!, markets * 2);
        }
      }
      nextState = { ...nextState, houses: nextHouses };
      break;
    }

    case 'evt_iron_strike': {
      const candidates: TileState[] = Object.values(nextState.tiles)
        .filter(
          (t) =>
            t.ownerHouseId === null &&
            t.terrain === 'hills' &&
            !t.hasIronDeposit &&
            t.landmark === 'none',
        )
        .sort((a, b) => a.key.localeCompare(b.key));
      if (candidates.length > 0) {
        const picked = pickOne(nextState.rngSeed, nextState.rngCounter, candidates);
        const t = picked.value;
        nextState = {
          ...nextState,
          rngCounter: picked.nextCounter,
          tiles: {
            ...nextState.tiles,
            [t.key]: { ...t, hasIronDeposit: true },
          },
        };
        for (const hid of living) {
          nextState = permanentlyRevealRadius(nextState, hid, t.x, t.y, 0);
        }
      }
      break;
    }

    case 'evt_deserters': {
      const byUpkeep = [...living].sort((a, b) => {
        const diff = getHouseTotalUpkeep(nextState, b) - getHouseTotalUpkeep(nextState, a);
        return diff !== 0 ? diff : nextState.houseOrder.indexOf(a) - nextState.houseOrder.indexOf(b);
      });
      const targetId = byUpkeep[0]!;
      if (getHouseTotalUpkeep(nextState, targetId) > 0) {
        applyChoiceForTargetHouses([targetId]);
      }
      break;
    }

    case 'evt_inspection': {
      const byFavor = [...living].sort((a, b) => {
        const diff = (nextState.houses[a]?.favor ?? 0) - (nextState.houses[b]?.favor ?? 0);
        return diff !== 0 ? diff : nextState.houseOrder.indexOf(a) - nextState.houseOrder.indexOf(b);
      });
      const targetId = byFavor[0]!;
      nextState = {
        ...nextState,
        houses: {
          ...nextState.houses,
          [targetId]: addFavor(nextState.houses[targetId]!, INSPECTION_FAVOR_GAIN),
        },
      };
      break;
    }
  }

  return nextState;
}
