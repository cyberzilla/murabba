/**
 * Murabba — Entry Point
 */
import { App } from './ui/App';
import { initI18n, setLang, getLang, t } from './i18n/I18n';
import type { SupportedLang } from './types';
import { initConfirmModal, confirmDialog } from './ui/ConfirmModal';
import { loadSession } from './storage/SessionManager';

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
      const isHidden = rightPanel.style.display === 'none';
      rightPanel.style.display = isHidden ? '' : 'none';
      panelToggle.classList.toggle('active', isHidden);
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

  // Sliders
  const cellSizeR = document.getElementById('cellSizeR') as HTMLInputElement | null;
  cellSizeR?.addEventListener('input', () => {
    app.config.cellSize = +cellSizeR.value;
    const val = document.getElementById('cellSizeVal');
    if (val) val.textContent = cellSizeR.value;
    app.requestRender();
  });

  const gapSizeR = document.getElementById('gapSizeR') as HTMLInputElement | null;
  gapSizeR?.addEventListener('input', () => {
    app.config.gapSize = +gapSizeR.value;
    const val = document.getElementById('gapSizeVal');
    if (val) val.textContent = gapSizeR.value;
    app.requestRender();
  });

  const cellRadR = document.getElementById('cellRadR') as HTMLInputElement | null;
  cellRadR?.addEventListener('input', () => {
    app.config.cellRadius = +cellRadR.value;
    const val = document.getElementById('cellRadVal');
    if (val) val.textContent = cellRadR.value;
    app.requestRender();
  });
}

function wireColorControls(app: App): void {
  const fillColor = document.getElementById('fillColor') as HTMLInputElement | null;
  fillColor?.addEventListener('input', () => {
    app.setDrawColor(fillColor.value);
    // Sync swatch highlight when color picker changes
    const picked = fillColor.value.toUpperCase();
    document.querySelectorAll<HTMLElement>('.swatch').forEach(s => {
      if (s.dataset.color?.toUpperCase() === picked) {
        s.classList.add('selected');
      } else {
        s.classList.remove('selected');
      }
    });
  });

  // Swatches
  document.querySelectorAll<HTMLElement>('.swatch').forEach(s => {
    s.addEventListener('click', () => {
      const color = s.dataset.color;
      if (color) {
        app.setDrawColor(color);
        // Sync toolbar color picker
        if (fillColor) fillColor.value = color;
      }
      document.querySelectorAll('.swatch').forEach(el => el.classList.remove('selected'));
      s.classList.add('selected');
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
  const grid = document.getElementById('letterGrid');
  if (!grid) return;

  const letters = app.letters;
  const keys = Object.keys(letters);
  if (keys.length === 0) return;

  grid.innerHTML = '';
  for (const ch of keys) {
    const entry = letters[ch];
    const btn = document.createElement('button');
    btn.className = 'letter-btn';
    btn.title = entry.name || ch;

    const charSpan = document.createElement('span');
    charSpan.textContent = ch;
    btn.appendChild(charSpan);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'letter-name';
    nameSpan.textContent = entry.name || '';
    btn.appendChild(nameSpan);

    btn.addEventListener('click', () => {
      app.addLetter(ch);
    });

    grid.appendChild(btn);
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
