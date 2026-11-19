/**
 * Marchlands (Spec v0.3) — AI Personality Weights & Tuning Constants
 *
 * All AI tuning knobs live here in src/data/ so Step 9 balance passes
 * only adjust data constants.
 */

import type { HouseId } from '../types/game.ts';

export interface AiPersonalityWeights {
  readonly riskAversion: number; // Scales threat penalty in tactical eval (1.0 = neutral)
  readonly attackAggression: number; // Bonus to entering 'attack' posture & pushing Keeps
  readonly defendSensitivity: number; // Multiplier on enemy threat triggering 'defend'
  readonly annexPriority: number; // Utility boost for Peaceful Annexation
  readonly campPriority: number; // Utility boost for clearing Outlaw Camps
  readonly watchtowerPriority: number; // Utility boost for Watchtowers
  readonly ruinPriority: number; // Utility boost for Relic Ruins
  readonly pillagePriority: number; // Tactical bonus for pillaging enemy improvements
  readonly writPriority: number; // Weight on Crown Writ pursuit & Tithe
  readonly mandatePriority: number; // Weight on Regent's Mandate claim & Favor hoarding
  readonly econBuildBias: number; // Bias toward economic improvements vs military training
  readonly fortificationBias: number; // Bias toward Palisades / Watchtowers
  readonly specWeights: {
    readonly garrison: number;
    readonly market_town: number;
    readonly granary_seat: number;
  };
}

export const AI_PERSONALITIES: Readonly<Record<HouseId, AiPersonalityWeights>> = {
  vane: {
    riskAversion: 0.42,
    attackAggression: 0.85,
    defendSensitivity: 1.05,
    annexPriority: 1.0,
    campPriority: 0.95,
    watchtowerPriority: 1.25,
    ruinPriority: 1.1,
    pillagePriority: 0.9,
    writPriority: 0.95,
    mandatePriority: 0.85,
    econBuildBias: 1.0,
    fortificationBias: 0.95,
    specWeights: {
      garrison: 0.9,
      market_town: 1.0,
      granary_seat: 1.25,
    },
  },
  ironhelm: {
    riskAversion: 0.45,
    attackAggression: 1.15,
    defendSensitivity: 1.0,
    annexPriority: 1.15,
    campPriority: 1.0,
    watchtowerPriority: 1.05,
    ruinPriority: 1.1,
    pillagePriority: 0.95,
    writPriority: 1.1,
    mandatePriority: 1.05,
    econBuildBias: 1.05,
    fortificationBias: 0.95,
    specWeights: {
      garrison: 1.3,
      market_town: 0.95,
      granary_seat: 0.95,
    },
  },
  aurelia: {
    riskAversion: 0.4,
    attackAggression: 1.05,
    defendSensitivity: 1.0,
    annexPriority: 1.3,
    campPriority: 0.95,
    watchtowerPriority: 1.05,
    ruinPriority: 1.1,
    pillagePriority: 0.9,
    writPriority: 1.2,
    mandatePriority: 1.15,
    econBuildBias: 1.1,
    fortificationBias: 0.9,
    specWeights: {
      garrison: 0.85,
      market_town: 1.4,
      granary_seat: 1.0,
    },
  },
  corvus: {
    riskAversion: 0.25,
    attackAggression: 1.4,
    defendSensitivity: 0.85,
    annexPriority: 1.1,
    campPriority: 1.45,
    watchtowerPriority: 1.0,
    ruinPriority: 1.15,
    pillagePriority: 1.5,
    writPriority: 1.1,
    mandatePriority: 0.95,
    econBuildBias: 1.05,
    fortificationBias: 0.75,
    specWeights: {
      garrison: 1.15,
      market_town: 1.05,
      granary_seat: 0.9,
    },
  },
  solis: {
    riskAversion: 0.35,
    attackAggression: 1.2,
    defendSensitivity: 0.95,
    annexPriority: 1.1,
    campPriority: 1.05,
    watchtowerPriority: 1.3,
    ruinPriority: 1.15,
    pillagePriority: 1.05,
    writPriority: 1.1,
    mandatePriority: 1.05,
    econBuildBias: 1.05,
    fortificationBias: 0.95,
    specWeights: {
      garrison: 1.0,
      market_town: 1.05,
      granary_seat: 1.15,
    },
  },
};
