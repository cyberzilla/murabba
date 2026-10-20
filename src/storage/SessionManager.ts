/**
 * Session and Settings auto-save/restore manager for Murabba
 */

import type {
  RenderConfig,
  BgProps,
  SessionData,
} from '../types/grid';
import type { GridModel } from '../core/GridModel';
import { put, get, deleteKey } from './IndexedDBStore';

export const SESSION_KEY = 'murabba_session';
export const SETTINGS_KEY = 'murabba_settings';
export const IDB_BG_KEY = 'murabba_bgimg';

// Legacy keys for migration
const LEGACY_SESSION_KEY = 'kufi_session_v2';
const LEGACY_SETTINGS_KEY = 'kufi_settings_v2';
const LEGACY_IDB_BG_KEY = '__kufi_bgimg__';

/**
 * Migrates localStorage keys from old kufi_* prefix to murabba_* prefix.
 * Reads old keys, writes to new keys, then removes old keys.
 * Safe to call multiple times (no-op if already migrated).
 */
export function migrateStorageKeys(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    // Migrate session
    const oldSession = localStorage.getItem(LEGACY_SESSION_KEY);
    if (oldSession && !localStorage.getItem(SESSION_KEY)) {
      localStorage.setItem(SESSION_KEY, oldSession);
    }
    localStorage.removeItem(LEGACY_SESSION_KEY);

    // Migrate settings
    const oldSettings = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (oldSettings && !localStorage.getItem(SETTINGS_KEY)) {
      localStorage.setItem(SETTINGS_KEY, oldSettings);
    }
    localStorage.removeItem(LEGACY_SETTINGS_KEY);

    // Migrate lang key
    const oldLang = localStorage.getItem('kufi_lang');
    if (oldLang && !localStorage.getItem('murabba_lang')) {
      localStorage.setItem('murabba_lang', oldLang);
    }
    localStorage.removeItem('kufi_lang');

    // Migrate page state key
    const oldPageState = localStorage.getItem('kufi_in_editor');
    if (oldPageState && !localStorage.getItem('murabba_editorState')) {
      localStorage.setItem('murabba_editorState', oldPageState);
    }
    localStorage.removeItem('kufi_in_editor');
  } catch {
    // Ignore errors during migration
  }
}

/**
 * Migrates IndexedDB background image key from old to new key.
 * @param db - Open IDBDatabase instance
 */
export async function migrateIDBKeys(db: IDBDatabase): Promise<void> {
  try {
    const oldRecord = await get<{ k: string; v: string }>(db, 'meta', LEGACY_IDB_BG_KEY);
    if (oldRecord?.v) {
      const newRecord = await get<{ k: string; v: string }>(db, 'meta', IDB_BG_KEY);
      if (!newRecord) {
        await put(db, 'meta', { k: IDB_BG_KEY, v: oldRecord.v });
      }
      await deleteKey(db, 'meta', LEGACY_IDB_BG_KEY);
    }
  } catch {
    // Ignore errors during migration
  }
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;


/**
 * Converts a Map<number, string> to a Record<string, string> for JSON serialization.
 */
function mapToRecord(map: Map<number, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of map.entries()) {
    result[String(key)] = val;
  }
  return result;
}


/**
 * Saves current grid model, config, background, and drawing state to localStorage.
 * Also persists background image reference flag.
 *
 * @param model - Current grid model
 * @param config - Current render configuration
 * @param bgImg - Base64 or URL of the background image (or null)
 * @param bgProps - Background transform and blend properties
 * @param drawColor - Current active drawing color
 */
export function saveSession(
  model: GridModel,
  config: RenderConfig,
  bgProps: BgProps = {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    opacity: 1,
    blend: 'normal',
    rotate: 0,
    crop: { x: 0, y: 0, w: 1, h: 1 },
  },
  drawColor = '#22C55E',
  bgImg: string | null = null
): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const snapshot = model.createSnapshot();
    const sessionData: SessionData = {
      cols: model.cols,
      rows: model.rows,
      cells: Array.from(snapshot.cells),
      gapH: Array.from(snapshot.gapH),
      gapV: Array.from(snapshot.gapV),
      gapD: Array.from(snapshot.gapD),
      cellColors: mapToRecord(snapshot.cellColors),
      gapHColors: mapToRecord(snapshot.gapHColors),
      gapVColors: mapToRecord(snapshot.gapVColors),
      gapDColors: mapToRecord(snapshot.gapDColors),
      drawColor: drawColor || config.drawColor || '#22C55E',
      config: {
        cellSize: config.cellSize,
        gapSize: config.gapSize,
        cellRadius: config.cellRadius,
        axisEvery: config.axisEvery,
        showAxis: config.showAxis,
        showConns: config.showConns,
        axisColor: config.axisColor,
        showRulers: config.showRulers,
        zoom: config.zoom,
        canvasBgColor: config.canvasBgColor,
      },
      bgProps: {
        ...bgProps,
        crop: bgProps.crop ? { ...bgProps.crop } : { x: 0, y: 0, w: 1, h: 1 },
      },
      bgVisible: true,
      bgImg: bgImg || undefined,
      marks: snapshot.marks && snapshot.marks.length > 0 ? snapshot.marks : undefined,
      conns: snapshot.conns && snapshot.conns.length > 0 ? snapshot.conns : undefined,
      ts: Date.now(),
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  } catch (err) {
    console.warn('Failed to save session to localStorage:', err);
    try {
      const snapshot = model.createSnapshot();
      const minimal = {
        cols: model.cols,
        rows: model.rows,
        cells: Array.from(snapshot.cells),
        drawColor,
        ts: Date.now(),
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(minimal));
    } catch (fallbackErr) {
      console.error('Critical: unable to save session even with minimal payload:', fallbackErr);
    }
  }
}

/**
 * Loads the active session from localStorage.
 * Handles both v2 flat format and v1 2D array formats gracefully.
 *
 * @returns SessionData if a valid session exists, or null
 */
export function loadSession(): SessionData | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const cols = Number(parsed.cols) || 24;
    const rows = Number(parsed.rows) || 24;

    // Handle v1 2D grid migration if 'cells' is missing but 'grid' is present
    let cells: number[] = [];
    if (Array.isArray(parsed.cells)) {
      cells = parsed.cells;
    } else if (Array.isArray(parsed.grid)) {
      cells = new Array(cols * rows).fill(0);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (parsed.grid[y]?.[x]) {
            cells[y * cols + x] = 1;
          }
        }
      }
    } else {
      cells = new Array(cols * rows).fill(0);
    }

    // Handle v1 gap arrays if present
    let gapH: number[] = [];
    if (Array.isArray(parsed.gapH)) {
      if (Array.isArray(parsed.gapH[0])) {
        // 2D format
        gapH = new Array((rows - 1) * cols).fill(0);
        for (let y = 0; y < rows - 1; y++) {
          for (let x = 0; x < cols; x++) {
            if (parsed.gapH[y]?.[x]) gapH[y * cols + x] = 1;
          }
        }
      } else {
        gapH = parsed.gapH;
      }
    } else {
      gapH = new Array((rows - 1) * cols).fill(0);
    }

    let gapV: number[] = [];
    if (Array.isArray(parsed.gapV)) {
      if (Array.isArray(parsed.gapV[0])) {
        gapV = new Array(rows * (cols - 1)).fill(0);
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols - 1; x++) {
            if (parsed.gapV[y]?.[x]) gapV[y * (cols - 1) + x] = 1;
          }
        }
      } else {
        gapV = parsed.gapV;
      }
    } else {
      gapV = new Array(rows * (cols - 1)).fill(0);
    }

    let gapD: number[] = [];
    if (Array.isArray(parsed.gapD)) {
      if (Array.isArray(parsed.gapD[0])) {
        gapD = new Array((rows - 1) * (cols - 1)).fill(0);
        for (let y = 0; y < rows - 1; y++) {
          for (let x = 0; x < cols - 1; x++) {
            if (parsed.gapD[y]?.[x]) gapD[y * (cols - 1) + x] = 1;
          }
        }
      } else {
        gapD = parsed.gapD;
      }
    } else {
      gapD = new Array((rows - 1) * (cols - 1)).fill(0);
    }


    const bgProps: BgProps = {
      x: parsed.bgProps?.x ?? 0,
      y: parsed.bgProps?.y ?? 0,
      w: parsed.bgProps?.w ?? 0,
      h: parsed.bgProps?.h ?? 0,
      opacity: parsed.bgProps?.opacity ?? 1,
      rotate: parsed.bgProps?.rotate ?? 0,
      blend: parsed.bgProps?.blend ?? 'normal',
      crop: parsed.bgProps?.crop ?? { x: 0, y: 0, w: 1, h: 1 },
    };

    // Convert color records to Record<string, string>
    const toStringRecord = (raw: Record<string | number, string> | undefined): Record<string, string> => {
      const result: Record<string, string> = {};
      if (!raw) return result;
      for (const [key, color] of Object.entries(raw)) {
        result[String(key)] = color;
      }
      return result;
    };

    const sessionData: SessionData = {
      cols,
      rows,
      cells,
      gapH,
      gapV,
      gapD,
      cellColors: toStringRecord(parsed.cellColors),
      gapHColors: toStringRecord(parsed.gapHColors),
      gapVColors: toStringRecord(parsed.gapVColors),
      gapDColors: toStringRecord(parsed.gapDColors),
      drawColor: parsed.drawColor || '#22C55E',
      config: parsed.config,
      bgProps,
      bgVisible: parsed.bgVisible !== undefined ? parsed.bgVisible : true,
      bgImg: parsed.bgImg || undefined,
      marks: Array.isArray(parsed.marks) ? parsed.marks : undefined,
      conns: Array.isArray(parsed.conns) ? parsed.conns : undefined,
      ts: Number(parsed.ts) || Date.now(),
    };

    return sessionData;
  } catch (err) {
    console.error('Error loading session from localStorage:', err);
    return null;
  }
}

/**
 * Saves editor/render settings to localStorage.
 *
 * @param config - Render and editor configuration to save
 */
export function saveSettings(config: RenderConfig): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('Failed to save settings to localStorage:', err);
  }
}

/**
 * Loads editor/render settings from localStorage.
 *
 * @returns Partial<RenderConfig> or null if no saved settings exist
 */
export function loadSettings(): Partial<RenderConfig> | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<RenderConfig>;
  } catch (err) {
    console.error('Failed to load settings from localStorage:', err);
    return null;
  }
}

/**
 * Schedules an auto-save callback after delayMs (debounced).
 * If called again before delayMs expires, previous pending timer is cancelled.
 *
 * @param callback - Function to invoke on auto-save
 * @param delayMs - Debounce delay in milliseconds (defaults to 2000ms)
 * @returns Function to cancel the scheduled auto-save
 */
export function scheduleAutoSave(callback: () => void, delayMs = 2000): () => void {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    callback();
  }, delayMs);

  return () => {
    if (autoSaveTimer !== null) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
  };
}

/**
 * Saves background image data to IndexedDB 'meta' store to prevent localStorage quota issues.
 *
 * @param db - Open IndexedDB instance
 * @param dataUrl - Base64 image data URL or null to remove
 */
export async function saveBgToIDB(db: IDBDatabase, dataUrl: string | null): Promise<void> {
  if (dataUrl) {
    await put(db, 'meta', { k: IDB_BG_KEY, v: dataUrl });
  } else {
    await deleteKey(db, 'meta', IDB_BG_KEY);
  }
}

/**
 * Loads background image data URL from IndexedDB 'meta' store.
 *
 * @param db - Open IndexedDB instance
 * @returns Promise resolving to image data URL string or null
 */
export async function loadBgFromIDB(db: IDBDatabase): Promise<string | null> {
  const record = await get<{ k: string; v: string }>(db, 'meta', IDB_BG_KEY);
  return record?.v ?? null;
}
