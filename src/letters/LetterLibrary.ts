/**
 * Letter Library Management for Murabba
 * Handles built-in letters (letters.json), user custom letters in IndexedDB,
 * merging, filtering, and JSON import/export.
 */

import type { LetterEntry, LetterForm } from '../types';
import { getAll, get, put, deleteKey, clearStore } from '../storage/IndexedDBStore';

export type { LetterEntry };

export interface LetterRecord {
  ch: string;
  name: string;
  m: number[][];
  gH: number[][];
  gV: number[][];
  gD: number[][];
  forms?: LetterEntry['forms'];
  variations?: LetterEntry['variations'];
  marks?: LetterEntry['marks'];
}

let cachedDefaults: Record<string, LetterEntry> | null = null;

/**
 * Creates empty gap matrices if missing
 */
function normalizeGaps(
  m: number[][],
  gH?: number[][],
  gV?: number[][],
  gD?: number[][]
): { gH: number[][]; gV: number[][]; gD: number[][] } {
  const rows = m.length;
  const cols = m[0]?.length || 1;

  // gH: accept rows×cols (editor format) or (rows-1)×cols (traditional)
  const gHRows = Math.max(0, rows - 1);
  let normalizedGH: number[][];
  if (gH && gH.length >= gHRows && gHRows > 0) {
    // Trim to (rows-1)×cols, preserving data
    normalizedGH = gH.slice(0, gHRows).map(r => r.slice(0, cols));
  } else {
    normalizedGH = Array.from({ length: gHRows }, () => new Array(cols).fill(0));
  }

  // gV: accept rows×cols (editor format) or rows×(cols-1) (traditional)
  const gVCols = Math.max(0, cols - 1);
  let normalizedGV: number[][];
  if (gV && gV.length >= rows && rows > 0) {
    normalizedGV = gV.slice(0, rows).map(r => r.slice(0, gVCols));
  } else {
    normalizedGV = Array.from({ length: rows }, () => new Array(gVCols).fill(0));
  }

  // gD: accept rows×cols (editor format) or (rows-1)×(cols-1) (traditional)
  const gDRows = Math.max(0, rows - 1);
  const gDCols = Math.max(0, cols - 1);
  let normalizedGD: number[][];
  if (gD && gD.length >= gDRows && gDRows > 0) {
    normalizedGD = gD.slice(0, gDRows).map(r => r.slice(0, gDCols));
  } else {
    normalizedGD = Array.from({ length: gDRows }, () => new Array(gDCols).fill(0));
  }

  return { gH: normalizedGH, gV: normalizedGV, gD: normalizedGD };
}

/**
 * Fetches default letters dictionary from letters.json.
 * Results are cached in memory after first successful fetch.
 *
 * @returns Promise resolving to built-in letters dictionary
 */
export async function loadDefaults(): Promise<Record<string, LetterEntry>> {
  if (cachedDefaults) {
    return cachedDefaults;
  }

  try {
    let url = 'letters.json';
    if (typeof location !== 'undefined' && location.href) {
      const base = new URL('.', location.href).href;
      url = new URL('letters.json', base).href;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch letters.json: status ${response.status}`);
    }

    const json = (await response.json()) as { letters?: Record<string, LetterEntry> };
    const rawLetters = json.letters || {};

    const normalized: Record<string, LetterEntry> = {};
    for (const [key, entry] of Object.entries(rawLetters)) {
      const gaps = normalizeGaps(entry.m, entry.gH, entry.gV, entry.gD);
      normalized[key] = {
        ch: entry.ch || key,
        name: entry.name,
        m: entry.m,
        gH: gaps.gH,
        gV: gaps.gV,
        gD: gaps.gD,
        forms: entry.forms,
        variations: (entry as LetterEntry).variations,
        marks: (entry as LetterEntry).marks,
        _builtin: true,
      };
    }

    cachedDefaults = normalized;
    return normalized;
  } catch (err) {
    console.warn('letters.json could not be loaded; letter library defaults will be empty:', err);
    return {};
  }
}

/**
 * Loads merged letters: built-in defaults merged with user-defined overrides and additions from IndexedDB.
 * User custom letters override built-in letters with identical characters.
 * Respects the deleted-letters tombstone list stored in IndexedDB meta store.
 *
 * @param db - Open IndexedDB instance
 * @returns Promise resolving to merged dictionary of letters
 */
export async function loadMerged(db: IDBDatabase): Promise<Record<string, LetterEntry>> {
  const defaults = await loadDefaults();
  const userOverrides = await getAll<LetterRecord>(db, 'letters');
  const deletedSet = await getDeletedSet(db);

  const merged: Record<string, LetterEntry> = {};

  // Seed default letters (skip deleted ones)
  for (const [key, entry] of Object.entries(defaults)) {
    if (deletedSet.has(key)) continue;
    merged[key] = { ...entry };
  }

  // Apply user custom letters
  for (const override of userOverrides) {
    if (!override.ch || !Array.isArray(override.m)) continue;

    const gaps = normalizeGaps(override.m, override.gH, override.gV, override.gD);
    merged[override.ch] = {
      ch: override.ch,
      name: override.name || override.ch,
      m: override.m,
      gH: gaps.gH,
      gV: gaps.gV,
      gD: gaps.gD,
      forms: override.forms,
      variations: override.variations,
      marks: override.marks,
      _builtin: false,
    };
  }

  return merged;
}

/**
 * Saves or updates a custom letter in the IndexedDB 'letters' store.
 * Also removes the letter from the deleted tombstone list if it was previously deleted.
 *
 * @param db - Open IndexedDB instance
 * @param ch - Letter character or identifier (key)
 * @param name - Display name of the letter
 * @param m - 2D matrix of cell fills (rows x cols)
 * @param gH - 2D matrix of horizontal gap fills ((rows-1) x cols)
 * @param gV - 2D matrix of vertical gap fills (rows x (cols-1))
 * @param gD - 2D matrix of diagonal corner gap fills ((rows-1) x (cols-1))
 * @param forms - Optional positional forms (initial, medial, final)
 * @param variations - Optional array of variation forms
 */
export async function saveLetter(
  db: IDBDatabase,
  ch: string,
  name: string,
  m: number[][],
  gH: number[][] = [],
  gV: number[][] = [],
  gD: number[][] = [],
  forms?: LetterEntry['forms'],
  variations?: LetterEntry['variations'],
  marks?: LetterEntry['marks']
): Promise<void> {
  const gaps = normalizeGaps(m, gH, gV, gD);
  const record: LetterRecord = {
    ch,
    name,
    m,
    gH: gaps.gH,
    gV: gaps.gV,
    gD: gaps.gD,
    forms,
    variations,
    marks,
  };

  await put<LetterRecord>(db, 'letters', record);

  // Remove from tombstone if it was previously deleted
  const deletedSet = await getDeletedSet(db);
  if (deletedSet.has(ch)) {
    deletedSet.delete(ch);
    await saveDeletedSet(db, deletedSet);
  }
}

// ─── Deleted Letters Tombstone ─────────────────────────

const DELETED_META_KEY = 'murabba_deletedLetters';

/** Reads the set of deleted letter keys from IndexedDB meta store. */
async function getDeletedSet(db: IDBDatabase): Promise<Set<string>> {
  try {
    const record = await get<{ k: string; v: string[] }>(db, 'meta', DELETED_META_KEY);
    return new Set(record?.v || []);
  } catch {
    return new Set();
  }
}

/** Saves the set of deleted letter keys to IndexedDB meta store. */
async function saveDeletedSet(db: IDBDatabase, deletedSet: Set<string>): Promise<void> {
  await put(db, 'meta', { k: DELETED_META_KEY, v: Array.from(deletedSet) });
}

/**
 * Deletes a letter. For user-custom letters, removes from IndexedDB.
 * For built-in letters, adds to the tombstone list so they won't be loaded on next refresh.
 *
 * @param db - Open IndexedDB instance
 * @param ch - Letter character / key to delete
 * @param isBuiltin - Whether this letter is a built-in default
 */
export async function deleteLetter(db: IDBDatabase, ch: string, isBuiltin = false): Promise<void> {
  // Always try to remove from user overrides store
  await deleteKey(db, 'letters', ch);

  // If built-in, add to tombstone list
  if (isBuiltin) {
    const deletedSet = await getDeletedSet(db);
    deletedSet.add(ch);
    await saveDeletedSet(db, deletedSet);
  }
}

/**
 * Resets the letter library to default letters by clearing custom overrides in IndexedDB.
 *
 * @param db - Open IndexedDB instance
 */
export async function resetToDefaults(db: IDBDatabase): Promise<void> {
  await clearStore(db, 'letters');
  // Clear tombstone list so all built-in letters are restored
  await deleteKey(db, 'meta', DELETED_META_KEY);
}

/**
 * Exports letter library entries to a formatted JSON string.
 *
 * @param letters - Record of letter entries to export
 * @returns Serialized JSON string
 */
export function exportLibrary(letters: Record<string, LetterEntry>): string {
  const exported: Record<string, Record<string, unknown>> = {};

  for (const [ch, entry] of Object.entries(letters)) {
    const gaps = normalizeGaps(entry.m, entry.gH, entry.gV, entry.gD);
    const item: Record<string, unknown> = {
      name: entry.name,
      m: entry.m,
      gH: gaps.gH,
      gV: gaps.gV,
      gD: gaps.gD,
    };
    if (entry.marks && entry.marks.length > 0) {
      item.marks = entry.marks;
    }
    if (entry.forms && Object.keys(entry.forms).length > 0) {
      const normalizedForms: Record<string, LetterForm> = {};
      for (const [pos, form] of Object.entries(entry.forms)) {
        if (form) {
          const fGaps = normalizeGaps(form.m, form.gH, form.gV, form.gD);
          const nf: LetterForm = { m: form.m, gH: fGaps.gH, gV: fGaps.gV, gD: fGaps.gD };
          if (form.marks && form.marks.length > 0) nf.marks = form.marks;
          normalizedForms[pos] = nf;
        }
      }
      item.forms = normalizedForms;
    }
    if (entry.variations && entry.variations.length > 0) {
      item.variations = entry.variations.map(v => {
        const vGaps = normalizeGaps(v.m, v.gH, v.gV, v.gD);
        const nv: LetterForm = { m: v.m, gH: vGaps.gH, gV: vGaps.gV, gD: vGaps.gD };
        if (v.marks && v.marks.length > 0) nv.marks = v.marks;
        return nv;
      });
    }
    exported[ch] = item;
  }

  return JSON.stringify({
    app: 'Murabba',
    appVersion: '2.0.0',
    description: 'Square Kufic Calligraphy Editor',
    url: 'https://github.com/cyberzilla/murabba',
    exportedAt: new Date().toISOString(),
    format: 'murabba-letters',
    letterCount: Object.keys(exported).length,
    letters: exported,
  }, null, 2);
}

/**
 * Imports letters from a JSON string into IndexedDB.
 *
 * @param db - Open IndexedDB instance
 * @param json - Serialized JSON containing `{ letters: { ... } }` or `{ [ch]: { ... } }`
 * @returns Promise resolving to the number of letters imported
 * @throws Error if the JSON cannot be parsed or lacks letter definitions
 */
export async function importLibrary(db: IDBDatabase, json: string): Promise<number> {
  if (typeof json !== 'string' || !json.trim()) {
    throw new Error('Import failed: JSON content is empty.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error('Import failed: Invalid JSON format.');
  }

  let rawLetters: Record<string, unknown> | null = null;
  if (parsed.letters && typeof parsed.letters === 'object' && !Array.isArray(parsed.letters)) {
    rawLetters = parsed.letters as Record<string, unknown>;
  } else if (typeof parsed === 'object' && !Array.isArray(parsed)) {
    rawLetters = parsed;
  }

  if (!rawLetters) {
    throw new Error('Import failed: No valid letter entries found.');
  }

  let count = 0;
  for (const [ch, rawEntry] of Object.entries(rawLetters)) {
    if (!ch || typeof rawEntry !== 'object' || rawEntry === null) continue;

    const entry = rawEntry as Partial<LetterEntry>;
    if (!Array.isArray(entry.m) || entry.m.length === 0) continue;

    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name : ch;
    const gaps = normalizeGaps(entry.m, entry.gH, entry.gV, entry.gD);

    const record: LetterRecord = {
      ch,
      name,
      m: entry.m,
      gH: gaps.gH,
      gV: gaps.gV,
      gD: gaps.gD,
      forms: entry.forms,
      variations: entry.variations,
      marks: entry.marks,
    };

    await put<LetterRecord>(db, 'letters', record);
    count++;
  }

  return count;
}

/**
 * Filters letters by search query matching either the letter character or its name.
 *
 * @param letters - Record of letter entries
 * @param search - Search query string
 * @returns Filtered dictionary of letter entries
 */
export function filterLetters(
  letters: Record<string, LetterEntry>,
  search: string
): Record<string, LetterEntry> {
  const query = search.trim().toLowerCase();
  if (!query) {
    return { ...letters };
  }

  const result: Record<string, LetterEntry> = {};
  for (const [ch, entry] of Object.entries(letters)) {
    const matchChar = ch.toLowerCase().includes(query);
    const matchName = entry.name && entry.name.toLowerCase().includes(query);
    if (matchChar || matchName) {
      result[ch] = entry;
    }
  }

  return result;
}
