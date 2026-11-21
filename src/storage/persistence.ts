/**
 * Marchlands (Spec v2.0) — IndexedDB Persistence & Save Validation
 *
 * Uses `idb` targeting database `marchlands_db` with `CURRENT_SCHEMA_VERSION = 2`.
 * SaveMetadata is stored alongside GameState (never inside GameState).
 * Clean break from Spec v0.3 saves: rejects non-2.0 payloads gracefully.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { GameMode, GameState, HouseId, MapPreset, SaveMetadata } from '../types/game.ts';
import { CURRENT_SCHEMA_VERSION, SPEC_VERSION, VALID_GRID_SIZES } from '../data/index.ts';

export const DB_NAME = 'marchlands_db';
export const SAVES_STORE = 'saves';
export const AUTOSAVE_SLOT_ID = 'autosave';

export interface SaveRecord {
  readonly metadata: SaveMetadata;
  readonly state: GameState;
}

interface MarchlandsDbSchema extends DBSchema {
  saves: {
    key: string;
    value: SaveRecord;
  };
}

export type StorageResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

const VALID_MODES = new Set<GameMode>(['dominion', 'chronicle']);
const VALID_MAP_PRESETS = new Set<MapPreset>(['compact', 'standard', 'grand']);
const VALID_DIFFICULTIES = new Set(['easy', 'normal', 'hard']);
const VALID_PHASES = new Set([
  'player_command',
  'draft_modal',
  'specialization_modal',
  'citadel_modal',
  'honor_modal',
  'commander_trait_modal',
  'event_modal',
  'ai_turn',
  'game_over',
]);

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Validates that an unknown payload conforms to Marchlands Spec v2.0 GameState.
 * Rejects mismatched specVersion (including v0.3 saves) or malformed payloads gracefully.
 */
export function validateGameStatePayload(
  raw: unknown,
): { readonly ok: true; readonly state: GameState } | { readonly ok: false; readonly error: string } {
  if (!isPlainRecord(raw)) {
    return { ok: false, error: 'Save payload is not a valid JSON object.' };
  }

  if (raw.specVersion !== SPEC_VERSION) {
    return {
      ok: false,
      error: `Incompatible save specVersion "${String(raw.specVersion)}" (expected "${SPEC_VERSION}").`,
    };
  }

  if (typeof raw.version !== 'number' || !Number.isFinite(raw.version)) {
    return { ok: false, error: 'Missing or invalid schema version.' };
  }

  if (typeof raw.mode !== 'string' || !VALID_MODES.has(raw.mode as GameMode)) {
    return { ok: false, error: `Invalid game mode "${String(raw.mode)}".` };
  }

  if (typeof raw.mapPreset !== 'string' || !VALID_MAP_PRESETS.has(raw.mapPreset as MapPreset)) {
    return { ok: false, error: `Invalid mapPreset "${String(raw.mapPreset)}".` };
  }

  if (typeof raw.difficulty !== 'string' || !VALID_DIFFICULTIES.has(raw.difficulty)) {
    return { ok: false, error: `Invalid difficulty "${String(raw.difficulty)}".` };
  }

  if (typeof raw.gridSize !== 'number' || !VALID_GRID_SIZES.includes(raw.gridSize)) {
    return {
      ok: false,
      error: `Invalid gridSize "${String(raw.gridSize)}" (expected ${VALID_GRID_SIZES.join(', ')}).`,
    };
  }

  if (typeof raw.turnNumber !== 'number' || raw.turnNumber < 1) {
    return { ok: false, error: 'Invalid turnNumber.' };
  }

  if (typeof raw.rngSeed !== 'number' || typeof raw.rngCounter !== 'number') {
    return { ok: false, error: 'Missing PRNG seed or counter.' };
  }

  if (typeof raw.phase !== 'string' || !VALID_PHASES.has(raw.phase)) {
    return { ok: false, error: `Invalid phase "${String(raw.phase)}".` };
  }

  if (
    typeof raw.activeHouseId !== 'string' ||
    !Array.isArray(raw.houseOrder) ||
    raw.houseOrder.length === 0
  ) {
    return { ok: false, error: 'Missing activeHouseId or houseOrder.' };
  }

  if (
    !isPlainRecord(raw.tiles) ||
    !isPlainRecord(raw.keeps) ||
    !isPlainRecord(raw.outposts) ||
    !isPlainRecord(raw.units) ||
    !isPlainRecord(raw.commanders) ||
    !isPlainRecord(raw.houses) ||
    !isPlainRecord(raw.fog) ||
    !isPlainRecord(raw.crown)
  ) {
    return {
      ok: false,
      error:
        'Missing required world state records (tiles, keeps, outposts, units, commanders, houses, fog, crown).',
    };
  }

  if (!Array.isArray(raw.chronicle)) {
    return { ok: false, error: 'Missing chronicle event log.' };
  }

  if (!raw.houses[raw.activeHouseId]) {
    return { ok: false, error: 'activeHouseId does not exist in houses map.' };
  }

  return {
    ok: true,
    state: raw as unknown as GameState,
  };
}

export function buildSaveMetadata(slotId: string, state: GameState): SaveMetadata {
  const houseId: HouseId = state.humanHouseId ?? state.activeHouseId;
  return {
    slotId,
    savedAtIso: new Date().toISOString(),
    turnNumber: state.turnNumber,
    houseId,
    mode: state.mode,
    mapPreset: state.mapPreset,
  };
}

let dbPromise: Promise<IDBPDatabase<MarchlandsDbSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<MarchlandsDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<MarchlandsDbSchema>(DB_NAME, CURRENT_SCHEMA_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SAVES_STORE)) {
          db.createObjectStore(SAVES_STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
    return false;
  } catch {
    return false;
  }
}

export async function saveGameToSlot(
  slotId: string,
  state: GameState,
): Promise<StorageResult<SaveMetadata>> {
  try {
    const metadata = buildSaveMetadata(slotId, state);
    const record: SaveRecord = { metadata, state };
    const db = await getDb();
    await db.put(SAVES_STORE, record, slotId);
    return { ok: true, data: metadata };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to write save to IndexedDB.';
    return { ok: false, error: msg };
  }
}

export async function saveAutosave(state: GameState): Promise<StorageResult<SaveMetadata>> {
  return saveGameToSlot(AUTOSAVE_SLOT_ID, state);
}

export async function loadGameFromSlot(slotId: string): Promise<StorageResult<SaveRecord | null>> {
  try {
    const db = await getDb();
    const record = await db.get(SAVES_STORE, slotId);
    if (!record) {
      return { ok: true, data: null };
    }
    const validated = validateGameStatePayload(record.state);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }
    return {
      ok: true,
      data: {
        metadata: record.metadata,
        state: validated.state,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to read save from IndexedDB.';
    return { ok: false, error: msg };
  }
}

export async function loadAutosave(): Promise<StorageResult<SaveRecord | null>> {
  return loadGameFromSlot(AUTOSAVE_SLOT_ID);
}

export async function listSaveSlots(): Promise<StorageResult<SaveMetadata[]>> {
  try {
    const db = await getDb();
    const all = await db.getAll(SAVES_STORE);
    const metas = all
      .filter((r) => validateGameStatePayload(r.state).ok)
      .map((r) => r.metadata)
      .sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso));
    return { ok: true, data: metas };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to list save slots.';
    return { ok: false, error: msg };
  }
}

export async function deleteSaveSlot(slotId: string): Promise<StorageResult<void>> {
  try {
    const db = await getDb();
    await db.delete(SAVES_STORE, slotId);
    return { ok: true, data: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to delete save slot.';
    return { ok: false, error: msg };
  }
}

export function exportSaveJson(state: GameState, slotId = 'export'): string {
  const payload: SaveRecord = {
    metadata: buildSaveMetadata(slotId, state),
    state,
  };
  return JSON.stringify(payload, null, 2);
}

export function importSaveJson(
  jsonText: string,
): StorageResult<{ readonly state: GameState; readonly metadata: SaveMetadata }> {
  try {
    const parsed: unknown = JSON.parse(jsonText);
    const candidateState = isPlainRecord(parsed) && 'state' in parsed ? parsed.state : parsed;
    const validated = validateGameStatePayload(candidateState);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }

    const rawMeta = isPlainRecord(parsed) && isPlainRecord(parsed.metadata) ? parsed.metadata : null;
    const metadata: SaveMetadata =
      rawMeta &&
      typeof rawMeta.slotId === 'string' &&
      typeof rawMeta.savedAtIso === 'string' &&
      typeof rawMeta.turnNumber === 'number' &&
      typeof rawMeta.houseId === 'string' &&
      typeof rawMeta.mode === 'string' &&
      typeof rawMeta.mapPreset === 'string'
        ? (rawMeta as unknown as SaveMetadata)
        : buildSaveMetadata('imported', validated.state);

    return {
      ok: true,
      data: {
        state: validated.state,
        metadata,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid JSON syntax.';
    return { ok: false, error: `Import failed: ${msg}` };
  }
}
