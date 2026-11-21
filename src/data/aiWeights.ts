/**
 * Marchlands (Spec v2.0) — AI Personality Weights & Tuning Constants
 */

import type { CitadelCharter, HouseId, KeepSpecialization } from '../types/game.ts';

export interface AiPersonalityWeights {
  readonly riskAversion: number;
  readonly attackAggression: number;
  readonly defendSensitivity: number;
  readonly annexPriority: number;
  readonly campPriority: number;
  readonly watchtowerPriority: number;
  readonly ruinPriority: number;
  readonly pillagePriority: number;
  readonly writPriority: number;
  readonly mandatePriority: number;
  readonly econBuildBias: number;
  readonly fortificationBias: number;
  readonly ironPriority: number;
  readonly outpostPriority: number;
  readonly specWeights: Readonly<Record<Exclude<KeepSpecialization, 'none'>, number>>;
  readonly charterWeights: Readonly<Record<Exclude<CitadelCharter, 'none'>, number>>;
}

export const AI_PERSONALITIES: Readonly<Record<HouseId, AiPersonalityWeights>> = {
  vane: {
    riskAversion: 0.35,
    attackAggression: 1.08,
    defendSensitivity: 1.0,
    annexPriority: 1.05,
    campPriority: 0.95,
    watchtowerPriority: 1.3,
    ruinPriority: 1.1,
    pillagePriority: 0.9,
    writPriority: 1.0,
    mandatePriority: 0.9,
    econBuildBias: 1.0,
    fortificationBias: 1.0,
    ironPriority: 1.0,
    outpostPriority: 1.1,
    specWeights: {
      garrison: 0.95,
      market_town: 1.0,
      granary_seat: 1.25,
      forge_seat: 0.95,
    },
    charterWeights: {
      war_college: 1.2,
      grand_exchange: 1.0,
      royal_bastion: 0.95,
      high_armory: 1.0,
    },
  },
  ironhelm: {
    riskAversion: 0.34,
    attackAggression: 1.18,
    defendSensitivity: 0.95,
    annexPriority: 1.15,
    campPriority: 1.0,
    watchtowerPriority: 1.1,
    ruinPriority: 1.05,
    pillagePriority: 0.95,
    writPriority: 1.1,
    mandatePriority: 1.05,
    econBuildBias: 1.05,
    fortificationBias: 1.1,
    ironPriority: 1.25,
    outpostPriority: 1.2,
    specWeights: {
      garrison: 1.3,
      market_town: 0.9,
      granary_seat: 0.9,
      forge_seat: 1.25,
    },
    charterWeights: {
      war_college: 1.0,
      grand_exchange: 0.9,
      royal_bastion: 1.35,
      high_armory: 1.15,
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
    writPriority: 1.25,
    mandatePriority: 1.2,
    econBuildBias: 1.15,
    fortificationBias: 0.95,
    ironPriority: 1.15,
    outpostPriority: 1.05,
    specWeights: {
      garrison: 0.85,
      market_town: 1.35,
      granary_seat: 1.0,
      forge_seat: 1.1,
    },
    charterWeights: {
      war_college: 0.95,
      grand_exchange: 1.35,
      royal_bastion: 0.95,
      high_armory: 1.1,
    },
  },
  corvus: {
    riskAversion: 0.30,
    attackAggression: 1.3,
    defendSensitivity: 0.85,
    annexPriority: 1.05,
    campPriority: 1.45,
    watchtowerPriority: 1.0,
    ruinPriority: 1.15,
    pillagePriority: 1.5,
    writPriority: 1.1,
    mandatePriority: 0.95,
    econBuildBias: 1.0,
    fortificationBias: 0.85,
    ironPriority: 1.1,
    outpostPriority: 1.15,
    specWeights: {
      garrison: 1.2,
      market_town: 1.0,
      granary_seat: 0.9,
      forge_seat: 1.15,
    },
    charterWeights: {
      war_college: 1.3,
      grand_exchange: 0.95,
      royal_bastion: 0.85,
      high_armory: 1.2,
    },
  },
  solis: {
    riskAversion: 0.30,
    attackAggression: 1.22,
    defendSensitivity: 0.90,
    annexPriority: 1.1,
    campPriority: 1.05,
    watchtowerPriority: 1.3,
    ruinPriority: 1.15,
    pillagePriority: 1.05,
    writPriority: 1.15,
    mandatePriority: 1.05,
    econBuildBias: 1.05,
    fortificationBias: 1.05,
    ironPriority: 1.1,
    outpostPriority: 1.15,
    specWeights: {
      garrison: 1.0,
      market_town: 1.05,
      granary_seat: 1.15,
      forge_seat: 1.05,
    },
    charterWeights: {
      war_college: 1.15,
      grand_exchange: 1.1,
      royal_bastion: 1.05,
      high_armory: 1.1,
    },
  },
};
