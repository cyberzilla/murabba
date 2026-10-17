/**
 * Murabba — Entry Point
 */
import { App } from './ui/App';
import { initI18n, setLang, getLang, t } from './i18n/I18n';
import type { SupportedLang } from './types';
import type { LetterEntry } from './types/grid';
import { initConfirmModal, confirmDialog } from './ui/ConfirmModal';
import { loadSession, saveSettings } from './storage/SessionManager';
import { initLetterEditor, openNewLetter, openEditLetter } from './ui/LetterEditor';
import { exportLibrary, saveLetter, deleteLetter } from './letters/LetterLibrary';

document.addEventListener('DOMContentLoaded', () => {
  // Disable right-click context menu on canvas only
  const canvasArea = document.getElementById('canvasArea');
  if (canvasArea) {
    canvasArea.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Migrate: update old orange color instead of deleting session
  try {
    const raw = localStorage.getItem('kufi_session_v2');
    if (raw) {
      const sess = JSON.parse(raw);
      if (sess.drawColor === '#F5A623') {
        sess.drawColor = '#22C55E';
        localStorage.setItem('kufi_session_v2', JSON.stringify(sess));
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
  document.getElementById('btnClear')?.addEventListener('click', async () => {
    const ok = await confirmDialog(t('confirm.clearAll'));
    if (ok) app.clearGrid();
  });
  document.getElementById('btnExport')?.addEventListener('click', () => app.exportPNG());
  document.getElementById('exportPNG')?.addEventListener('click', () => app.exportPNG());
  document.getElementById('exportSVG')?.addEventListener('click', () => app.exportSVG());
  document.getElementById('exportWebP')?.addEventListener('click', () => app.exportWebP());

  // Home button (logo) — return to welcome screen
  document.getElementById('btnHome')?.addEventListener('click', () => {
    try { localStorage.removeItem('kufi_in_editor'); } catch { /* ok */ }
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

function wireGridControls(app: App): void {
  const colsInput = document.getElementById('gridCols') as HTMLInputElement | null;
  const rowsInput = document.getElementById('gridRows') as HTMLInputElement | null;

  const applyGridSize = () => {
    const cols = parseInt(colsInput?.value || '24');
    const rows = parseInt(rowsInput?.value || '24');
    app.resizeGrid(cols, rows);
  };

  colsInput?.addEventListener('change', applyGridSize);
  rowsInput?.addEventListener('change', applyGridSize);

  // Presets
  document.querySelectorAll<HTMLElement>('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [c, r] = btn.dataset.preset!.split(',').map(Number);
      app.initGrid(c, r);
    });
  });

  // Debounced settings save
  let settingsTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (settingsTimer) clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => { saveSettings(app.config); }, 500);
  };

  // Sliders
  const cellSizeR = document.getElementById('cellSizeR') as HTMLInputElement | null;
  cellSizeR?.addEventListener('input', () => {
    app.config.cellSize = +cellSizeR.value;
    const val = document.getElementById('cellSizeVal');
    if (val) val.textContent = cellSizeR.value;
    app.requestRender();
    updateLetterPreviewColors(app);
    debouncedSave();
  });

  const gapSizeR = document.getElementById('gapSizeR') as HTMLInputElement | null;
  gapSizeR?.addEventListener('input', () => {
    app.config.gapSize = +gapSizeR.value;
    const val = document.getElementById('gapSizeVal');
    if (val) val.textContent = gapSizeR.value;
    app.requestRender();
    updateLetterPreviewColors(app);
    debouncedSave();
  });

  const cellRadR = document.getElementById('cellRadR') as HTMLInputElement | null;
  cellRadR?.addEventListener('input', () => {
    app.config.cellRadius = +cellRadR.value;
    const val = document.getElementById('cellRadVal');
    if (val) val.textContent = cellRadR.value;
    app.requestRender();
    updateLetterPreviewColors(app);
    debouncedSave();
  });

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
    cellRadR.value = String(app.config.cellRadius);
    const v = document.getElementById('cellRadVal');
    if (v) v.textContent = String(app.config.cellRadius);
  }

  // Also trigger a re-render with loaded settings
  app.requestRender();
}

function wireColorControls(app: App): void {
  const fillColor = document.getElementById('fillColor') as HTMLInputElement | null;
  fillColor?.addEventListener('input', () => {
    app.setDrawColor(fillColor.value);
    syncColorUI(app);
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
  const keys = Object.keys(app.letters);
  buttons.forEach((btn, i) => {
    const ch = keys[i];
    if (!ch) return;
    const canvas = btn.querySelector<HTMLCanvasElement>('.letter-preview');
    if (canvas) {
      renderLetterPreview(canvas, app.letters[ch], color, app.config.cellRadius / app.config.cellSize);
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
  const PAGE_STATE_KEY = 'kufi_in_editor';

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
        saveLetter(app.db, ch, entry.name, entry.m, entry.gH, entry.gV, entry.gD)
          .catch(err => console.warn('[Murabba] Failed to persist letter:', err));
      }
    },
    onDelete(ch) {
      delete app.letters[ch];
      rebuildLetterGrid(app);
      // Remove from IndexedDB
      if (app.db) {
        deleteLetter(app.db, ch)
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
              ch,
              name: e.name || ch,
              m: e.m,
              gH: e.gH || [],
              gV: e.gV || [],
              gD: e.gD || [],
              _builtin: false,
            };
            app.letters[ch] = entry;
            // Persist imported letter to IndexedDB
            if (app.db) {
              saveLetter(app.db, ch, entry.name, entry.m, entry.gH, entry.gV, entry.gD)
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
    const btn = document.createElement('button');
    btn.className = 'letter-btn';
    btn.title = entry.name || ch;

    // Canvas preview of the letter shape
    const canvas = document.createElement('canvas');
    canvas.className = 'letter-preview';
    renderLetterPreview(canvas, entry, app.config.drawColor, app.config.cellRadius / app.config.cellSize);
    btn.appendChild(canvas);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'letter-name';
    nameSpan.textContent = entry.name || ch;
    btn.appendChild(nameSpan);

    // Edit button overlay
    const editSpan = document.createElement('span');
    editSpan.className = 'letter-edit';
    editSpan.textContent = '✎';
    editSpan.title = 'Edit letter';
    editSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditLetter(ch, entry);
    });
    btn.appendChild(editSpan);

    btn.addEventListener('click', () => {
      app.addLetter(ch);
    });

    grid.appendChild(btn);
  }
}

/**
 * Renders a small preview of a letter entry onto a canvas element.
 */
function renderLetterPreview(canvas: HTMLCanvasElement, entry: LetterEntry, color = '#22C55E', radiusRatio = 0.167): void {
  const { m, gH, gV, gD } = entry;
  const rows = m.length;
  const cols = rows > 0 ? m[0].length : 1;

  // Helpers to safely read matrices
  const cell = (c: number, r: number) => m[r]?.[c] ? 1 : 0;
  const gh = (c: number, r: number) => gH?.[r]?.[c] ? 1 : 0;
  const gv = (c: number, r: number) => gV?.[r]?.[c] ? 1 : 0;
  const gd = (c: number, r: number) => gD?.[r]?.[c] ? 1 : 0;

  // Size calculations — fit within compact card
  const maxDim = Math.max(cols, rows);
  const totalPx = 24;
  const cellPx = Math.max(2, Math.floor(totalPx / (maxDim + (maxDim - 1) * 0.55)));
  const gapPx = Math.max(1, Math.round(cellPx * 0.5));
  const R = Math.max(0, cellPx * radiusRatio);

  const canvasW = cols * cellPx + (cols - 1) * gapPx;
  const canvasH = rows * cellPx + (rows - 1) * gapPx;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = canvasW * dpr;
  canvas.height = canvasH * dpr;
  canvas.style.width = canvasW + 'px';
  canvas.style.height = canvasH + 'px';

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, canvasW, canvasH);
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
