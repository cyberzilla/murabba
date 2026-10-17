/**
 * Murabba — Entry Point
 */
import { App } from './ui/App';
import { initI18n, setLang, getLang, t } from './i18n/I18n';
import type { SupportedLang } from './types';
import type { LetterEntry } from './types/grid';
import { renderPreviewMarks } from './canvas/MarkRenderer';
import { initConfirmModal, confirmDialog } from './ui/ConfirmModal';
import { loadSession, saveSettings, SESSION_KEY, migrateStorageKeys } from './storage/SessionManager';
import { initLetterEditor, openNewLetter, openEditLetter, setEditorGridConfig } from './ui/LetterEditor';
import { initAboutModal, showAbout } from './ui/AboutModal';
import { exportLibrary, saveLetter, deleteLetter } from './letters/LetterLibrary';

document.addEventListener('DOMContentLoaded', () => {
  // Disable right-click context menu on canvas only
  const canvasArea = document.getElementById('canvasArea');
  if (canvasArea) {
    canvasArea.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Run storage key migration (kufi_* → murabba_*)
  migrateStorageKeys();

  // Migrate: update old orange color instead of deleting session
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const sess = JSON.parse(raw);
      if (sess.drawColor === '#F5A623') {
        sess.drawColor = '#22C55E';
        localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
        console.log('[Murabba] Migrated v1 session color scheme');
      }
    }
  } catch { /* ignore */ }

  // Initialize i18n
  initI18n();

  // Initialize custom confirm modal
  initConfirmModal();

  const container = document.getElementById('canvasArea');
  if (!container) {
    console.error('[Murabba] #canvasArea not found');
    return;
  }

  const app = new App(container);

  // Wire UI buttons
  wireToolButtons(app);
  wireBrushModes(app);
  wireActionButtons(app);
  wireGridControls(app);
  wireColorControls(app);
  wireZoomControls(app);
  wireFileIO(app);
  wireBgControls(app);
  wireWelcomeScreen(app);

  app.init().then(() => {
    wireLetterPanel(app);
    // Sync color UI with loaded settings (drawColor from localStorage)
    syncColorUI(app);
    // Sync slider UI with loaded settings (cellSize, gapSize, cellRadius)
    syncSliderUI(app);

    // About modal
    initAboutModal();
    document.getElementById('btnAbout')?.addEventListener('click', showAbout);
  }).catch(console.error);

  // Language switcher
  wireLangSwitcher();

  // Expose for debugging
  (window as any).__murabbaApp = app;
});

// ─── UI Wiring Helpers ────────────────────────────────────

function wireToolButtons(app: App): void {
  document.querySelectorAll<HTMLElement>('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (tool) {
        app.setTool(tool as any);
        // Update status bar tool name
        const statusEl = document.getElementById('statusTool');
        if (statusEl) {
          const toolNames: Record<string, string> = {
            cursor: 'toolName.cursor',
            draw: 'toolName.draw', erase: 'toolName.erase',
            fill: 'toolName.fill', brush: 'toolName.brush',
            pan: 'toolName.pan', select: 'toolName.select',
          };
          const key = toolNames[tool];
          if (key) {
            statusEl.setAttribute('data-i18n', key);
            statusEl.textContent = t(key);
          }
        }
      }
    });
  });
}

function wireBrushModes(app: App): void {
  document.querySelectorAll<HTMLElement>('[data-brush-mode]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = Number(btn.dataset.brushMode) as 1 | 2 | 3;
      app.setBrushMode(mode);
      // Update flyout active state
      document.querySelectorAll('[data-brush-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Also activate brush tool if not already active
      app.setTool('brush');
    });
  });
}

function wireActionButtons(app: App): void {
  document.getElementById('btnUndo')?.addEventListener('click', () => app.undo());
  document.getElementById('btnRedo')?.addEventListener('click', () => app.redo());
  document.getElementById('btnRotateCW')?.addEventListener('click', () => app.rotateSelectionCW());
  document.getElementById('btnRotateCCW')?.addEventListener('click', () => app.rotateSelectionCCW());
  document.getElementById('btnFlipH')?.addEventListener('click', () => app.flipSelectionH());
  document.getElementById('btnFlipV')?.addEventListener('click', () => app.flipSelectionV());
  document.getElementById('btnClear')?.addEventListener('click', async () => {
    const ok = await confirmDialog(t('confirm.clearAll'));
    if (ok) app.clearGrid();
  });
  document.getElementById('btnExport')?.addEventListener('click', () => app.exportPNG());
  document.getElementById('exportPNG')?.addEventListener('click', () => app.exportPNG());
  document.getElementById('exportSVG')?.addEventListener('click', () => app.exportSVG());
  document.getElementById('exportWebP')?.addEventListener('click', () => app.exportWebP());

  // DPI / scale selector
  const scaleSelect = document.getElementById('exportScale') as HTMLSelectElement | null;
  if (scaleSelect) {
    app.exportScale = Number(scaleSelect.value) || 2;
    scaleSelect.addEventListener('change', () => {
      app.exportScale = Number(scaleSelect.value) || 1;
    });
  }

  // Home button (logo) — return to welcome screen
  document.getElementById('btnHome')?.addEventListener('click', () => {
    try { localStorage.removeItem('murabba_editorState'); } catch { /* ok */ }
    document.documentElement.classList.remove('restore-editor');
    const screen = document.getElementById('welcomeScreen');
    const editor = document.getElementById('editor');
    if (screen) screen.classList.remove('hidden');
    if (editor) editor.style.display = 'none';
  });

  // Sidebar panel toggle
  const panelToggle = document.getElementById('tbPanelToggle');
  const rightPanel = document.getElementById('rightPanel');
  if (panelToggle && rightPanel) {
    panelToggle.addEventListener('click', () => {
      rightPanel.classList.toggle('panel-collapsed');
      const isVisible = !rightPanel.classList.contains('panel-collapsed');
      panelToggle.classList.toggle('active', isVisible);
    });
  }

  // Mobile panel drawer toggle
  const mobileToggle = document.getElementById('mobilePanelToggle');
  const mobileOverlay = document.getElementById('mobilePanelOverlay');
  if (mobileToggle && rightPanel) {
    const closeDrawer = () => {
      rightPanel.classList.remove('open');
      mobileOverlay?.classList.remove('visible');
    };
    const openDrawer = () => {
      rightPanel.classList.add('open');
      mobileOverlay?.classList.add('visible');
    };
    mobileToggle.addEventListener('click', () => {
      if (rightPanel.classList.contains('open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });
    mobileOverlay?.addEventListener('click', closeDrawer);
  }
}

// ─── Grid Size History ────────────────────────────────────

const SIZE_HISTORY_KEY = 'murabba_recentSizes';
const MAX_RECENT_SIZES = 4;

/** Built-in preset keys to exclude from recent history */
const BUILTIN_PRESETS = new Set(['16,16', '24,24', '32,24', '48,32']);

function loadRecentSizes(): string[] {
  try {
    const raw = localStorage.getItem(SIZE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecentSizes(sizes: string[]): void {
  try { localStorage.setItem(SIZE_HISTORY_KEY, JSON.stringify(sizes)); } catch { /* ok */ }
}

function pushRecentSize(cols: number, rows: number): void {
  const key = `${cols},${rows}`;
  if (BUILTIN_PRESETS.has(key)) return;
  const list = loadRecentSizes().filter(k => k !== key);
  list.unshift(key);
  if (list.length > MAX_RECENT_SIZES) list.length = MAX_RECENT_SIZES;
  saveRecentSizes(list);
}

/** Highlight the preset button matching current grid size (or none if custom). */
function syncPresetActive(cols: number, rows: number): void {
  const key = `${cols},${rows}`;
  document.querySelectorAll<HTMLElement>('[data-preset]').forEach(b =>
    b.classList.toggle('active', b.dataset.preset === key)
  );
}

function rebuildRecentSizes(app: App): void {
  const container = document.getElementById('recentSizesContainer');
  if (!container) return;
  const sizes = loadRecentSizes();
  if (sizes.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  container.innerHTML = '';
  const colsInput = document.getElementById('gridCols') as HTMLInputElement | null;
  const rowsInput = document.getElementById('gridRows') as HTMLInputElement | null;

  for (const key of sizes) {
    const [c, r] = key.split(',').map(Number);
    const btn = document.createElement('button');
    btn.className = 's-btn';
    btn.dataset.preset = key;
    btn.textContent = `${c}×${r}`;
    btn.addEventListener('click', () => {
      app.initGrid(c, r);
      if (colsInput) colsInput.value = String(c);
      if (rowsInput) rowsInput.value = String(r);
      syncPresetActive(c, r);
    });
    container.appendChild(btn);
  }
  // Sync active state
  syncPresetActive(app.model.cols, app.model.rows);
}

function wireGridControls(app: App): void {
  const colsInput = document.getElementById('gridCols') as HTMLInputElement | null;
  const rowsInput = document.getElementById('gridRows') as HTMLInputElement | null;

  const applyGridSize = () => {
    const cols = parseInt(colsInput?.value || '24');
    const rows = parseInt(rowsInput?.value || '24');
    app.resizeGrid(cols, rows);
    pushRecentSize(cols, rows);
    rebuildRecentSizes(app);
    syncPresetActive(cols, rows);
  };

  colsInput?.addEventListener('change', applyGridSize);
  rowsInput?.addEventListener('change', applyGridSize);

  // Built-in presets
  document.querySelectorAll<HTMLElement>('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [c, r] = btn.dataset.preset!.split(',').map(Number);
      app.initGrid(c, r);
      if (colsInput) colsInput.value = String(c);
      if (rowsInput) rowsInput.value = String(r);
      syncPresetActive(c, r);
    });
  });

  // Initial render of recent sizes
  rebuildRecentSizes(app);

  // Debounced settings save
  let settingsTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (settingsTimer) clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => { saveSettings(app.config); }, 500);
  };

  // Sliders — RAF-throttled to avoid lag on large grids
  const cellSizeR = document.getElementById('cellSizeR') as HTMLInputElement | null;
  const cellRadR = document.getElementById('cellRadR') as HTMLInputElement | null;
  const gapSizeR = document.getElementById('gapSizeR') as HTMLInputElement | null;
  let sliderRaf: number | null = null;

  /** Update radius slider max to half of current cell size and clamp value */
  const syncRadiusMax = () => {
    if (!cellRadR) return;
    const maxRad = Math.round(app.config.cellSize / 2);
    cellRadR.max = String(maxRad);
    if (app.config.cellRadius > maxRad) {
      app.config.cellRadius = maxRad;
      cellRadR.value = String(maxRad);
      const val = document.getElementById('cellRadVal');
      if (val) val.textContent = String(maxRad);
    }
  };

  /** Throttled render: batches multiple slider ticks into one frame */
  const scheduleSliderRender = () => {
    if (sliderRaf !== null) return;
    sliderRaf = requestAnimationFrame(() => {
      sliderRaf = null;
      app.requestRender();
    });
  };

  /** Deferred: update letter previews + editor config (expensive, runs on mouse release) */
  const onSliderCommit = () => {
    updateLetterPreviewColors(app);
    setEditorGridConfig(app.config.cellSize, app.config.gapSize, app.config.cellRadius);
    debouncedSave();
  };

  cellSizeR?.addEventListener('input', () => {
    app.config.cellSize = +cellSizeR.value;
    const val = document.getElementById('cellSizeVal');
    if (val) val.textContent = cellSizeR.value;
    syncRadiusMax();
    scheduleSliderRender();
  });
  cellSizeR?.addEventListener('change', onSliderCommit);

  gapSizeR?.addEventListener('input', () => {
    app.config.gapSize = +gapSizeR.value;
    const val = document.getElementById('gapSizeVal');
    if (val) val.textContent = gapSizeR.value;
    scheduleSliderRender();
  });
  gapSizeR?.addEventListener('change', onSliderCommit);

  cellRadR?.addEventListener('input', () => {
    app.config.cellRadius = +cellRadR.value;
    const val = document.getElementById('cellRadVal');
    if (val) val.textContent = cellRadR.value;
    scheduleSliderRender();
  });
  cellRadR?.addEventListener('change', onSliderCommit);

  // Set initial radius max
  syncRadiusMax();

}

/**
 * Syncs slider DOM elements with current app.config values.
 * Must be called AFTER app.init() so loadSettings() has applied saved values.
 */
function syncSliderUI(app: App): void {
  const cellSizeR = document.getElementById('cellSizeR') as HTMLInputElement | null;
  const gapSizeR = document.getElementById('gapSizeR') as HTMLInputElement | null;
  const cellRadR = document.getElementById('cellRadR') as HTMLInputElement | null;

  if (cellSizeR) {
    cellSizeR.value = String(app.config.cellSize);
    const v = document.getElementById('cellSizeVal');
    if (v) v.textContent = String(app.config.cellSize);
  }
  if (gapSizeR) {
    gapSizeR.value = String(app.config.gapSize);
    const v = document.getElementById('gapSizeVal');
    if (v) v.textContent = String(app.config.gapSize);
  }
  if (cellRadR) {
    // Radius max = half of cell size
    const maxRad = Math.round(app.config.cellSize / 2);
    cellRadR.max = String(maxRad);
    if (app.config.cellRadius > maxRad) app.config.cellRadius = maxRad;
    cellRadR.value = String(app.config.cellRadius);
    const v = document.getElementById('cellRadVal');
    if (v) v.textContent = String(app.config.cellRadius);
  }

  // Also trigger a re-render with loaded settings
  app.requestRender();

  // Sync grid preset active highlight with actual model size (includes recent sizes rebuild)
  rebuildRecentSizes(app);

  // Sync letter editor grid sizing with current config
  setEditorGridConfig(app.config.cellSize, app.config.gapSize, app.config.cellRadius);
}

// ─── Color History ────────────────────────────────────────

const COLOR_HISTORY_KEY = 'murabba_recentColors';
const MAX_RECENT_COLORS = 9;

/** Built-in swatch colors (uppercase) to exclude from recent history */
const BUILTIN_COLORS = new Set(
  ['#22C55E','#DC2626','#FFFFFF','#111827','#3B82F6','#7C3AED','#EC4899','#14B8A6','#F59E0B']
);

function loadRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(COLOR_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecentColors(colors: string[]): void {
  try { localStorage.setItem(COLOR_HISTORY_KEY, JSON.stringify(colors)); } catch { /* ok */ }
}

function pushRecentColor(hex: string): void {
  const upper = hex.toUpperCase();
  if (BUILTIN_COLORS.has(upper)) return; // skip built-in swatches
  const list = loadRecentColors().filter(c => c.toUpperCase() !== upper);
  list.unshift(upper);
  if (list.length > MAX_RECENT_COLORS) list.length = MAX_RECENT_COLORS;
  saveRecentColors(list);
}

function rebuildRecentSwatches(app: App): void {
  const container = document.getElementById('recentColorsContainer');
  if (!container) return;
  const colors = loadRecentColors();
  const label = container.previousElementSibling as HTMLElement | null;
  const activeColor = app.getDrawColor().toUpperCase();

  if (colors.length === 0) {
    container.innerHTML = '';
    if (label) label.style.display = 'none';
    return;
  }
  if (label) label.style.display = '';

  container.innerHTML = '';
  for (const color of colors) {
    const div = document.createElement('div');
    div.className = 'swatch';
    if (color.toUpperCase() === activeColor) div.classList.add('selected');
    div.style.background = color;
    div.dataset.color = color;
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    // Dark colors get a border
    if (color === '#111827' || color === '#000000') {
      div.style.border = '1px solid #333';
    }
    div.addEventListener('click', () => {
      app.setDrawColor(color);
      syncColorUI(app);
    });
    container.appendChild(div);
  }
}

function wireColorControls(app: App): void {
  const fillColor = document.getElementById('fillColor') as HTMLInputElement | null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  fillColor?.addEventListener('input', () => {
    app.setDrawColor(fillColor.value);
    syncColorUI(app);
    // Debounce recent color save (user is dragging picker)
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      pushRecentColor(fillColor.value);
      rebuildRecentSwatches(app);
    }, 600);
  });

  // Swatches
  document.querySelectorAll<HTMLElement>('.swatch').forEach(s => {
    s.addEventListener('click', () => {
      const color = s.dataset.color;
      if (color) {
        app.setDrawColor(color);
        syncColorUI(app);
      }
    });
  });

  // Initial render of recent colors
  rebuildRecentSwatches(app);
}

/**
 * Syncs the color picker (#fillColor) and quick-color swatches with
 * the current app.config.drawColor. Call after restoring a session,
 * loading a project, or any programmatic color change.
 */
function syncColorUI(app: App): void {
  const color = app.getDrawColor();

  // 1. Toolbar color picker
  const fillColor = document.getElementById('fillColor') as HTMLInputElement | null;
  if (fillColor) fillColor.value = color;

  // 2. Quick-color swatches: highlight matching swatch
  const swatches = document.querySelectorAll<HTMLElement>('.swatch');
  let found = false;
  swatches.forEach(s => {
    if (s.dataset.color?.toUpperCase() === color.toUpperCase()) {
      s.classList.add('selected');
      found = true;
    } else {
      s.classList.remove('selected');
    }
  });
  // If no swatch matches (custom color), clear all selections
  if (!found) {
    swatches.forEach(s => s.classList.remove('selected'));
  }

  // 3. Update letter preview colors (lightweight repaint, no DOM rebuild)
  updateLetterPreviewColors(app);
}

/**
 * Repaints all existing letter preview canvases with the current draw color.
 * Much cheaper than rebuildLetterGrid — only redraws canvas pixels.
 */
function updateLetterPreviewColors(app: App): void {
  const grid = document.getElementById('letterGrid');
  if (!grid) return;
  const color = app.config.drawColor;
  const buttons = grid.querySelectorAll<HTMLElement>('.letter-btn');
  buttons.forEach((btn) => {
    const key = btn.dataset.key;
    if (!key || !app.letters[key]) return;
    const canvas = btn.querySelector<HTMLCanvasElement>('.letter-preview');
    if (canvas) {
      renderLetterPreview(canvas, app.letters[key], color, app.config.cellRadius / app.config.cellSize, app.config.gapSize / app.config.cellSize);
    }
  });
}

function wireZoomControls(app: App): void {
  document.getElementById('zoomIn')?.addEventListener('click', () => app.zoomIn());
  document.getElementById('zoomOut')?.addEventListener('click', () => app.zoomOut());
  document.getElementById('zoomFit')?.addEventListener('click', () => app.zoomFit());
}

function wireFileIO(app: App): void {
  document.getElementById('btnSaveJSON')?.addEventListener('click', () => app.saveJSON());
  document.getElementById('btnLoadJSON')?.addEventListener('click', () => {
    const input = document.getElementById('loadFileInput') as HTMLInputElement | null;
    input?.click();
  });

  const loadInput = document.getElementById('loadFileInput') as HTMLInputElement | null;
  loadInput?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      app.loadJSON(ev.target?.result as string);
      // Sync color picker & swatches with loaded project color
      syncColorUI(app);
    };
    reader.readAsText(file);
    (e.target as HTMLInputElement).value = '';
  });

  // Background image upload
  const bgInput = document.getElementById('bgFileInput') as HTMLInputElement | null;
  bgInput?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => app.setBgImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  });
}

function wireBgControls(app: App): void {
  const bgInput = document.getElementById('bgFileInput') as HTMLInputElement | null;
  const bgControls = document.getElementById('bgControls');
  
  // Show controls when image loaded
  if (bgInput && bgControls) {
    bgInput.addEventListener('change', () => {
      // Show after a small delay to let image load
      setTimeout(() => {
        bgControls.style.display = 'block';
      }, 300);
    });
  }

  // Opacity slider
  const bgOpacityR = document.getElementById('bgOpacityR') as HTMLInputElement | null;
  bgOpacityR?.addEventListener('input', () => {
    const val = +bgOpacityR.value / 100;
    app.bgProps.opacity = val;
    const label = document.getElementById('bgOpacityVal');
    if (label) label.textContent = bgOpacityR.value + '%';
    app.requestRender();
  });

  // Scale slider
  const bgScaleR = document.getElementById('bgScaleR') as HTMLInputElement | null;
  bgScaleR?.addEventListener('input', () => {
    const pct = +bgScaleR.value / 100;
    if (app.bgImage) {
      const total = app.config.cellSize + app.config.gapSize;
      const baseW = 8 * total;
      app.bgProps.w = Math.round(baseW * pct);
      const ratio = app.bgImage.naturalHeight / Math.max(1, app.bgImage.naturalWidth);
      app.bgProps.h = Math.round(app.bgProps.w * ratio);
    }
    const label = document.getElementById('bgScaleVal');
    if (label) label.textContent = bgScaleR.value + '%';
    app.requestRender();
  });

  // Rotation slider
  const bgRotateR = document.getElementById('bgRotateR') as HTMLInputElement | null;
  bgRotateR?.addEventListener('input', () => {
    app.bgProps.rotate = +bgRotateR.value;
    const label = document.getElementById('bgRotateVal');
    if (label) label.textContent = bgRotateR.value + '°';
    app.requestRender();
  });

  // Toggle visibility
  document.getElementById('bgToggleVis')?.addEventListener('click', () => {
    app.bgVisible = !app.bgVisible;
    const btn = document.getElementById('bgToggleVis');
    if (btn) btn.textContent = app.bgVisible ? 'Hide' : 'Show';
    app.requestRender();
  });

  // Remove background
  document.getElementById('bgRemove')?.addEventListener('click', () => {
    app.removeBgImage();
    if (bgControls) bgControls.style.display = 'none';
    // Reset sliders
    if (bgOpacityR) bgOpacityR.value = '50';
    if (bgScaleR) bgScaleR.value = '100';
    if (bgRotateR) bgRotateR.value = '0';
    const opVal = document.getElementById('bgOpacityVal');
    if (opVal) opVal.textContent = '50%';
    const scVal = document.getElementById('bgScaleVal');
    if (scVal) scVal.textContent = '100%';
    const rtVal = document.getElementById('bgRotateVal');
    if (rtVal) rtVal.textContent = '0°';
  });
}

function wireWelcomeScreen(app: App): void {
  const screen = document.getElementById('welcomeScreen');
  const editor = document.getElementById('editor');
  const PAGE_STATE_KEY = 'murabba_editorState';

  const enter = () => {
    screen?.classList.add('hidden');
    if (editor) editor.style.display = 'flex';
    try { localStorage.setItem(PAGE_STATE_KEY, '1'); } catch { /* ok */ }
    app.requestRender();
  };

  // Check saved session
  const sessionData = loadSession();
  const wlContinue = document.getElementById('wlContinue');

  // Auto-restore: if user was previously in editor and session exists, skip welcome
  let wasInEditor = false;
  try { wasInEditor = localStorage.getItem(PAGE_STATE_KEY) === '1'; } catch { /* ok */ }
  if (wasInEditor && sessionData) {
    app.restoreSession(sessionData);
    const colsInput = document.getElementById('gridCols') as HTMLInputElement | null;
    const rowsInput = document.getElementById('gridRows') as HTMLInputElement | null;
    if (colsInput) colsInput.value = String(sessionData.cols);
    if (rowsInput) rowsInput.value = String(sessionData.rows);
    syncPresetActive(sessionData.cols, sessionData.rows);
    syncColorUI(app);
    enter();
    return; // skip welcome screen setup
  }

  if (sessionData && wlContinue) {
    wlContinue.style.display = 'flex';
    const timeEl = document.getElementById('wlContinueTime');
    if (timeEl && sessionData.ts) {
      const diffSec = Math.floor((Date.now() - sessionData.ts) / 1000);
      if (diffSec < 60) {
        timeEl.textContent = 'Just now';
      } else if (diffSec < 3600) {
        timeEl.textContent = `${Math.floor(diffSec / 60)}m ago`;
      } else if (diffSec < 86400) {
        timeEl.textContent = `${Math.floor(diffSec / 3600)}h ago`;
      } else {
        timeEl.textContent = new Date(sessionData.ts).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        });
      }
    }

    wlContinue.addEventListener('click', () => {
      app.restoreSession(sessionData);
      const colsInput = document.getElementById('gridCols') as HTMLInputElement | null;
      const rowsInput = document.getElementById('gridRows') as HTMLInputElement | null;
      if (colsInput) colsInput.value = String(sessionData.cols);
      if (rowsInput) rowsInput.value = String(sessionData.rows);
      syncPresetActive(sessionData.cols, sessionData.rows);
      // Sync color picker & swatches with restored session color
      syncColorUI(app);
      enter();
    });
  }

  document.getElementById('wlNew')?.addEventListener('click', async () => {
    // Warn if there's an existing session that will be overwritten
    if (sessionData) {
      const ok = await confirmDialog(t('confirm.newProject'));
      if (!ok) return;
    }
    app.initGrid(24, 24);
    enter();
  });

  document.getElementById('wlLoad')?.addEventListener('click', () => {
    const input = document.getElementById('loadFileInput') as HTMLInputElement | null;
    if (input) {
      const onLoad = () => {
        input.removeEventListener('change', onLoad);
        enter();
      };
      input.addEventListener('change', onLoad);
      input.click();
    }
  });

  // Welcome screen language switcher
  document.querySelectorAll<HTMLElement>('[data-wl-lang]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.wlLang as SupportedLang;
      if (lang) {
        setLang(lang);
      }
    });
  });
}

function wireLetterPanel(app: App): void {
  // Initialize letter editor with callbacks
  initLetterEditor({
    onSave(ch, entry) {
      app.letters[ch] = entry;
      rebuildLetterGrid(app);
      // Persist to IndexedDB
      if (app.db) {
        saveLetter(app.db, ch, entry.name, entry.m, entry.gH, entry.gV, entry.gD, entry.forms, entry.variations, entry.marks)
          .catch(err => console.warn('[Murabba] Failed to persist letter:', err));
      }
    },
    onDelete(ch) {
      const isBuiltin = !!app.letters[ch]?._builtin;
      delete app.letters[ch];
      rebuildLetterGrid(app);
      // Remove from IndexedDB (with tombstone for built-in letters)
      if (app.db) {
        deleteLetter(app.db, ch, isBuiltin)
          .catch(err => console.warn('[Murabba] Failed to delete letter from DB:', err));
      }
    },
  });

  // Wire add/export/import buttons
  document.getElementById('btnAddLetter')?.addEventListener('click', () => {
    openNewLetter();
  });

  document.getElementById('btnExportLib')?.addEventListener('click', () => {
    const json = exportLibrary(app.letters);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `murabba-letters-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btnImportLib')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          const rawLetters = parsed.letters || parsed;
          for (const [ch, raw] of Object.entries(rawLetters)) {
            const e = raw as any;
            if (!e.m || !Array.isArray(e.m)) continue;
            const entry: LetterEntry = {
              ch: e.ch || ch,
              name: e.name || ch,
              m: e.m,
              gH: e.gH || [],
              gV: e.gV || [],
              gD: e.gD || [],
              forms: e.forms,
              variations: e.variations,
              marks: e.marks,
              _builtin: false,
            };
            app.letters[ch] = entry;
            // Persist imported letter to IndexedDB
            if (app.db) {
              saveLetter(app.db, ch, entry.name, entry.m, entry.gH, entry.gV, entry.gD, entry.forms, entry.variations, entry.marks)
                .catch(err => console.warn('[Murabba] Failed to persist imported letter:', err));
            }
          }
          rebuildLetterGrid(app);
        } catch (err) {
          console.warn('[Murabba] Failed to import letters:', err);
        }
      };
      reader.readAsText(file);
    }, { once: true });
    input.click();
  });


  rebuildLetterGrid(app);
}

function rebuildLetterGrid(app: App): void {
  const grid = document.getElementById('letterGrid');
  if (!grid) return;

  const letters = app.letters;
  const keys = Object.keys(letters);

  grid.innerHTML = '';
  for (const ch of keys) {
    const entry = letters[ch];

    // Always show isolated (root) form
    const formData = { m: entry.m, gH: entry.gH, gV: entry.gV, gD: entry.gD };

    const btn = document.createElement('button');
    btn.className = 'letter-btn';
    btn.title = entry.name || ch;
    btn.dataset.key = ch;

    // Canvas preview
    const canvas = document.createElement('canvas');
    canvas.className = 'letter-preview';
    const previewEntry = { ...entry, ...formData };
    renderLetterPreview(canvas, previewEntry, app.config.drawColor, app.config.cellRadius / app.config.cellSize, app.config.gapSize / app.config.cellSize);
    btn.appendChild(canvas);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'letter-name';
    nameSpan.textContent = entry.name || ch;
    btn.appendChild(nameSpan);

    // Edit button overlay
    const editSpan = document.createElement('span');
    editSpan.className = 'letter-edit';
    editSpan.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
    editSpan.title = t('letters.edit');
    editSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditLetter(ch, entry);
    });
    btn.appendChild(editSpan);

    // Check if letter has multiple forms
    const formCount = entry.forms ? Object.keys(entry.forms).length : 0;
    const varCount = entry.variations ? entry.variations.length : 0;
    const hasMultiple = formCount > 0 || varCount > 0;

    // Small dot indicator if has multiple forms
    if (hasMultiple) {
      const dot = document.createElement('span');
      dot.className = 'letter-multi-dot';
      btn.appendChild(dot);
    }

    if (hasMultiple) {
      // Show popup on hover for letters with multiple forms
      btn.addEventListener('mouseenter', (e) => {
        showLetterPopup(app, ch, entry, e.currentTarget as HTMLElement);
      });
      btn.addEventListener('mouseleave', (e) => {
        const related = (e as MouseEvent).relatedTarget as HTMLElement;
        const popup = document.getElementById('letterFormPopup');
        if (popup && (popup === related || popup.contains(related))) return;
        hideLetterPopup();
      });
      // Default click places isolated
      btn.addEventListener('click', () => {
        app.addLetter(ch, 'isolated');
      });
    } else {
      // Simple click-to-place for single-form letters
      btn.addEventListener('click', () => {
        app.addLetter(ch, 'isolated');
      });
    }

    grid.appendChild(btn);
  }
}

// ─── Letter Form Popup ─────────────────────────────────

let popupTimer: ReturnType<typeof setTimeout> | null = null;

function ensurePopupElement(): HTMLElement {
  let popup = document.getElementById('letterFormPopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'letterFormPopup';
    popup.className = 'letter-form-popup';
    popup.addEventListener('mouseenter', () => {
      if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
    });
    popup.addEventListener('mouseleave', () => {
      hideLetterPopup();
    });
    document.body.appendChild(popup);
  }
  return popup;
}

function showLetterPopup(app: App, ch: string, entry: LetterEntry, anchor: HTMLElement): void {
  if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }

  const popup = ensurePopupElement();
  popup.innerHTML = '';

  const color = app.config.drawColor;
  const radiusRatio = app.config.cellRadius / app.config.cellSize;
  const gapRatio = app.config.gapSize / app.config.cellSize;

  // Build form options
  interface FormOption {
    label: string;
    formData: { m: number[][]; gH: number[][]; gV: number[][]; gD: number[][]; marks?: LetterEntry['marks'] };
    onClick: () => void;
  }

  const options: FormOption[] = [];

  // Isolated (always available)
  options.push({
    label: t('letterEditor.tabSingle'),
    formData: { m: entry.m, gH: entry.gH, gV: entry.gV, gD: entry.gD, marks: entry.marks },
    onClick: () => { app.addLetter(ch, 'isolated'); hideLetterPopup(); },
  });

  // Positional forms
  const positions: Array<{ key: 'initial' | 'medial' | 'final'; i18n: string }> = [
    { key: 'initial', i18n: 'letterEditor.tabStart' },
    { key: 'medial', i18n: 'letterEditor.tabCenter' },
    { key: 'final', i18n: 'letterEditor.tabEnd' },
  ];
  for (const pos of positions) {
    const form = entry.forms?.[pos.key];
    if (form) {
      options.push({
        label: t(pos.i18n),
        formData: form,
        onClick: () => { app.addLetter(ch, pos.key); hideLetterPopup(); },
      });
    }
  }

  // Variations (skip empty placeholders)
  if (entry.variations) {
    entry.variations.forEach((vf, idx) => {
      // Skip empty placeholder variations (no filled cells and no marks)
      const hasCells = vf.m.some(row => row.some(v => v !== 0));
      const hasMarks = vf.marks && vf.marks.length > 0;
      if (!hasCells && !hasMarks) return;
      options.push({
        label: `V${idx + 1}`,
        formData: vf,
        onClick: () => { app.addLetter(ch, 'isolated', idx); hideLetterPopup(); },
      });
    });
  }

  // Render options
  for (const opt of options) {
    const item = document.createElement('button');
    item.className = 'lfp-item';
    item.title = opt.label;

    const cvs = document.createElement('canvas');
    cvs.className = 'lfp-preview';
    const previewE = { ...entry, ...opt.formData, marks: opt.formData.marks };
    renderLetterPreview(cvs, previewE, color, radiusRatio, gapRatio);
    item.appendChild(cvs);

    const lbl = document.createElement('span');
    lbl.className = 'lfp-label';
    lbl.textContent = opt.label;
    item.appendChild(lbl);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      opt.onClick();
    });

    popup.appendChild(item);
  }

  // Position popup within sidebar boundary — never overlapping canvas
  const rect = anchor.getBoundingClientRect();
  const panel = document.getElementById('rightPanel');
  const panelRect = panel ? panel.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };
  // Set grid columns based on actual item count (max 4)
  const cols = Math.min(options.length, 4);
  popup.style.gridTemplateColumns = `repeat(${cols}, 50px)`;
  popup.style.display = 'grid';

  // Measure popup off-screen first
  popup.style.left = '-9999px';
  popup.style.top = '-9999px';

  requestAnimationFrame(() => {
    const pr = popup.getBoundingClientRect();
    const pw = pr.width;
    const ph = pr.height;
    const gap = 4;

    let left: number;
    let top: number;
    let placed = false;

    // 1) Below the card (within sidebar)
    if (rect.bottom + gap + ph <= panelRect.bottom) {
      left = rect.left;
      top = rect.bottom + gap;
      placed = true;
    }
    // 2) Above the card
    if (!placed && rect.top - gap - ph >= panelRect.top) {
      left = rect.left;
      top = rect.top - gap - ph;
      placed = true;
    }
    // 3) Left of the card (but still within panel)
    if (!placed && rect.left - gap - pw >= panelRect.left) {
      left = rect.left - gap - pw;
      top = rect.top;
      placed = true;
    }
    // 4) Right of the card (within panel)
    if (!placed && rect.right + gap + pw <= panelRect.right) {
      left = rect.right + gap;
      top = rect.top;
      placed = true;
    }
    // 5) Fallback: below card, clamp to panel
    if (!placed) {
      left = rect.left;
      top = rect.bottom + gap;
    }

    // Clamp horizontal within sidebar
    if (left! + pw > panelRect.right - 4) {
      left! = panelRect.right - pw - 4;
    }
    if (left! < panelRect.left + 4) {
      left! = panelRect.left + 4;
    }

    // Clamp vertical within sidebar
    if (top! + ph > panelRect.bottom - 4) {
      top! = panelRect.bottom - ph - 4;
    }
    if (top! < panelRect.top + 4) {
      top! = panelRect.top + 4;
    }

    popup.style.left = `${left!}px`;
    popup.style.top = `${top!}px`;
  });

  // Blur the letter grid except active card
  const grid = document.getElementById('letterGrid');
  if (grid) {
    grid.classList.add('lfp-active');
    anchor.classList.add('lfp-anchor');
  }
}

function hideLetterPopup(): void {
  popupTimer = setTimeout(() => {
    const popup = document.getElementById('letterFormPopup');
    if (popup) popup.style.display = 'none';
    // Remove blur effect
    const grid = document.getElementById('letterGrid');
    if (grid) {
      grid.classList.remove('lfp-active');
      const anchor = grid.querySelector('.lfp-anchor');
      if (anchor) anchor.classList.remove('lfp-anchor');
    }
    popupTimer = null;
  }, 100);
}

/**
 * Renders a small preview of a letter entry onto a canvas element.
 * Uses a fixed 7×7 grid. Cell/gap/radius proportions mirror the main editor config.
 * @param gapRatio — gap-to-cell ratio from sidebar (gapSize / cellSize)
 * @param radiusRatio — radius-to-cell ratio from sidebar (cellRadius / cellSize)
 */
function renderLetterPreview(canvas: HTMLCanvasElement, entry: LetterEntry, color = '#22C55E', radiusRatio = 0.167, gapRatio = 0.5, targetSize = 24): void {
  const { m, gH, gV, gD } = entry;
  const rows = m.length;
  const cols = rows > 0 ? m[0].length : 1;

  // Helpers to safely read matrices
  const cell = (c: number, r: number) => m[r]?.[c] ? 1 : 0;
  const gh = (c: number, r: number) => gH?.[r]?.[c] ? 1 : 0;
  const gv = (c: number, r: number) => gV?.[r]?.[c] ? 1 : 0;
  const gd = (c: number, r: number) => gD?.[r]?.[c] ? 1 : 0;

  // Size calculations — use fixed 7×7 grid for uniform card sizes
  const GRID_DIM = 7;
  // Fixed cell size ensures all cards render at identical scale
  const cellPx = targetSize >= 36 ? 5 : 3;
  const gapPx = Math.max(1, Math.round(cellPx * gapRatio));
  const R = Math.max(0, cellPx * radiusRatio);

  const gridFullW = GRID_DIM * cellPx + (GRID_DIM - 1) * gapPx;
  const gridFullH = gridFullW;
  const contentW = cols * cellPx + (cols - 1) * gapPx;
  const contentH = rows * cellPx + (rows - 1) * gapPx;
  // Canvas = fixed grid size
  const canvasW = gridFullW;
  const canvasH = gridFullH;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = canvasW * dpr;
  canvas.height = canvasH * dpr;
  canvas.style.width = canvasW + 'px';
  canvas.style.height = canvasH + 'px';

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Center letter content within the fixed grid
  const offsetX = Math.floor((canvasW - contentW) / 2);
  const offsetY = Math.floor((canvasH - contentH) / 2);
  ctx.translate(offsetX, offsetY);
  ctx.fillStyle = color;

  // Draw rounded rect with per-corner radii [tl, tr, br, bl]
  const drawRR = (x: number, y: number, w: number, h: number, radii: number[]) => {
    let [tl, tr, br, bl] = radii;
    const f = Math.min(1, w / (tl + tr || 1), w / (bl + br || 1), h / (tl + bl || 1), h / (tr + br || 1));
    if (f < 1) { tl *= f; tr *= f; br *= f; bl *= f; }
    ctx.beginPath();
    if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
      ctx.rect(x, y, w, h);
    } else {
      ctx.moveTo(x + tl, y);
      ctx.lineTo(x + w - tr, y);
      ctx.arcTo(x + w, y, x + w, y + tr, tr);
      ctx.lineTo(x + w, y + h - br);
      ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
      ctx.lineTo(x + bl, y + h);
      ctx.arcTo(x, y + h, x, y + h - bl, bl);
      ctx.lineTo(x, y + tl);
      ctx.arcTo(x, y, x + tl, y, tl);
      ctx.closePath();
    }
    ctx.fill();
  };

  // Draw cells with smart corner radii
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!cell(c, r)) continue;
      const x = c * (cellPx + gapPx);
      const y = r * (cellPx + gapPx);
      // Corner blocked if adjacent gap/diagonal is filled
      const tl = (gv(c - 1, r) || gh(c, r - 1) || gd(c - 1, r - 1)) ? 0 : R;
      const tr = (gv(c, r)     || gh(c, r - 1) || gd(c, r - 1))     ? 0 : R;
      const br = (gv(c, r)     || gh(c, r)      || gd(c, r))         ? 0 : R;
      const bl = (gv(c - 1, r) || gh(c, r)      || gd(c - 1, r))    ? 0 : R;
      drawRR(x, y, cellPx, cellPx, [tl, tr, br, bl]);
    }
  }

  // Draw gapH (bridges between row r and r+1) with smart radii
  if (gH) {
    const gR = Math.min(R, gapPx / 2);
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        if (!gh(c, r)) continue;
        const x = c * (cellPx + gapPx);
        const y = r * (cellPx + gapPx) + cellPx;
        const tl = (cell(c, r)     || gv(c - 1, r)     || gd(c - 1, r)) ? 0 : gR;
        const tr = (cell(c, r)     || gv(c, r)          || gd(c, r))     ? 0 : gR;
        const br = (cell(c, r + 1) || gv(c, r + 1)      || gd(c, r))     ? 0 : gR;
        const bl = (cell(c, r + 1) || gv(c - 1, r + 1)  || gd(c - 1, r)) ? 0 : gR;
        drawRR(x, y, cellPx, gapPx, [tl, tr, br, bl]);
      }
    }
  }

  // Draw gapV (bridges between col c and c+1) with smart radii
  if (gV) {
    const gR = Math.min(R, gapPx / 2);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        if (!gv(c, r)) continue;
        const x = c * (cellPx + gapPx) + cellPx;
        const y = r * (cellPx + gapPx);
        const tl = (cell(c, r)     || gh(c, r - 1)     || gd(c, r - 1)) ? 0 : gR;
        const tr = (cell(c + 1, r) || gh(c + 1, r - 1) || gd(c, r - 1)) ? 0 : gR;
        const br = (cell(c + 1, r) || gh(c + 1, r)     || gd(c, r))     ? 0 : gR;
        const bl = (cell(c, r)     || gh(c, r)          || gd(c, r))     ? 0 : gR;
        drawRR(x, y, gapPx, cellPx, [tl, tr, br, bl]);
      }
    }
  }

  // Draw gapD (corner dots) with smart radii
  if (gD) {
    const gR = Math.min(R, gapPx / 2);
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        if (!gd(c, r)) continue;
        const x = c * (cellPx + gapPx) + cellPx;
        const y = r * (cellPx + gapPx) + cellPx;
        const tl = (cell(c, r)         || gh(c, r)     || gv(c, r))     ? 0 : gR;
        const tr = (cell(c + 1, r)     || gh(c + 1, r) || gv(c, r))     ? 0 : gR;
        const br = (cell(c + 1, r + 1) || gh(c + 1, r) || gv(c, r + 1)) ? 0 : gR;
        const bl = (cell(c, r + 1)     || gh(c, r)     || gv(c, r + 1)) ? 0 : gR;
        drawRR(x, y, gapPx, gapPx, [tl, tr, br, bl]);
      }
    }
  }

  // Draw sub-cell marks (kaf-s, hamzah)
  if (entry.marks && entry.marks.length > 0) {
    // Use card bg color for erasing; marks draw in letter color
    const markBg = '#1a1a2e';
    renderPreviewMarks(ctx, entry.marks, cellPx, gapPx, markBg, color);
  }
}

function wireLangSwitcher(): void {
  const btn = document.getElementById('btnLangSwitch');
  const langs: SupportedLang[] = ['ar', 'en', 'id'];

  btn?.addEventListener('click', () => {
    const current = getLang();
    const idx = langs.indexOf(current);
    const next = langs[(idx + 1) % langs.length];
    setLang(next);
  });
}
