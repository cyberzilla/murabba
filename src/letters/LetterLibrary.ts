/**
 * Letter Library Management for Murabba
 * Handles built-in letters (letters.json), user custom letters in IndexedDB,
 * merging, filtering, and JSON import/export.
 */

import type { LetterEntry } from '../types';
import { getAll, put, deleteKey, clearStore } from '../storage/IndexedDBStore';

export type { LetterEntry };

export interface LetterRecord {
  ch: string;
  name: string;
  m: number[][];
  gH: number[][];
  gV: number[][];
  gD: number[][];
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

  const normalizedGH =
    gH && gH.length === rows - 1
      ? gH
      : Array.from({ length: Math.max(0, rows - 1) }, () => new Array(cols).fill(0));

  const normalizedGV =
    gV && gV.length === rows
      ? gV
      : Array.from({ length: rows }, () => new Array(Math.max(0, cols - 1)).fill(0));

  const normalizedGD =
    gD && gD.length === rows - 1
      ? gD
      : Array.from({ length: Math.max(0, rows - 1) }, () =>
          new Array(Math.max(0, cols - 1)).fill(0)
        );

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
    for (const [ch, entry] of Object.entries(rawLetters)) {
      const gaps = normalizeGaps(entry.m, entry.gH, entry.gV, entry.gD);
      normalized[ch] = {
        ch,
        name: entry.name,
        m: entry.m,
        gH: gaps.gH,
        gV: gaps.gV,
        gD: gaps.gD,
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
 *
 * @param db - Open IndexedDB instance
 * @returns Promise resolving to merged dictionary of letters
 */
export async function loadMerged(db: IDBDatabase): Promise<Record<string, LetterEntry>> {
  const defaults = await loadDefaults();
  const userOverrides = await getAll<LetterRecord>(db, 'letters');

  const merged: Record<string, LetterEntry> = {};

  // Seed default letters
  for (const [ch, entry] of Object.entries(defaults)) {
    const gaps = normalizeGaps(entry.m, entry.gH, entry.gV, entry.gD);
    merged[ch] = {
      ch,
      name: entry.name,
      m: entry.m,
      gH: gaps.gH,
      gV: gaps.gV,
      gD: gaps.gD,
      _builtin: true,
    };
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
      _builtin: false,
    };
  }

  return merged;
}

/**
 * Saves or updates a custom letter in the IndexedDB 'letters' store.
 *
 * @param db - Open IndexedDB instance
 * @param ch - Letter character or identifier (key)
 * @param name - Display name of the letter
 * @param m - 2D matrix of cell fills (rows x cols)
 * @param gH - 2D matrix of horizontal gap fills ((rows-1) x cols)
 * @param gV - 2D matrix of vertical gap fills (rows x (cols-1))
 * @param gD - 2D matrix of diagonal corner gap fills ((rows-1) x (cols-1))
 */
export async function saveLetter(
  db: IDBDatabase,
  ch: string,
  name: string,
  m: number[][],
  gH: number[][] = [],
  gV: number[][] = [],
  gD: number[][] = []
): Promise<void> {
  const gaps = normalizeGaps(m, gH, gV, gD);
  const record: LetterRecord = {
    ch,
    name,
    m,
    gH: gaps.gH,
    gV: gaps.gV,
    gD: gaps.gD,
  };

  await put<LetterRecord>(db, 'letters', record);
}

/**
 * Deletes a custom letter from the IndexedDB 'letters' store.
 *
 * @param db - Open IndexedDB instance
 * @param ch - Letter character / key to delete
 */
export async function deleteLetter(db: IDBDatabase, ch: string): Promise<void> {
  await deleteKey(db, 'letters', ch);
}

/**
 * Resets the letter library to default letters by clearing custom overrides in IndexedDB.
 *
 * @param db - Open IndexedDB instance
 */
export async function resetToDefaults(db: IDBDatabase): Promise<void> {
  await clearStore(db, 'letters');
}

/**
 * Exports letter library entries to a formatted JSON string.
 *
 * @param letters - Record of letter entries to export
 * @returns Serialized JSON string
 */
export function exportLibrary(letters: Record<string, LetterEntry>): string {
  const exported: Record<string, { name: string; m: number[][]; gH: number[][]; gV: number[][]; gD: number[][] }> =
    {};

  for (const [ch, entry] of Object.entries(letters)) {
    const gaps = normalizeGaps(entry.m, entry.gH, entry.gV, entry.gD);
    exported[ch] = {
      name: entry.name,
      m: entry.m,
      gH: gaps.gH,
      gV: gaps.gV,
      gD: gaps.gD,
    };
  }

  return JSON.stringify({ letters: exported }, null, 2);
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
