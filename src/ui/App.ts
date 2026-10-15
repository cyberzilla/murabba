/**
 * App.ts — Main application controller that wires all modules together.
 */
import { GridModel } from '../core/GridModel';
import { HistoryManager } from '../core/HistoryManager';
import { screenToCell, hitTest } from '../core/CoordinateMapper';
import { CanvasRenderer, OverlayState } from '../canvas/CanvasRenderer';
import { exportToPNG, exportToWebP, exportToSVG } from '../canvas/ExportRenderer';
import { BaseTool, ToolContext } from '../tools/BaseTool';
import { DrawTool } from '../tools/DrawTool';
import { FillTool } from '../tools/FillTool';
import { BrushTool } from '../tools/BrushTool';
import { PanTool } from '../tools/PanTool';
import { SelectTool } from '../tools/SelectTool';
import { downloadPNG, downloadJSON, exportProject, importProject } from '../storage/ProjectIO';
import { saveSession, loadSession, saveSettings, loadSettings } from '../storage/SessionManager';
import type { ToolType, RenderConfig, BgProps, LetterEntry, SessionData } from '../types/grid';

/** Default render configuration. */
function defaultConfig(): RenderConfig {
  return {
    cellSize: 30,
    gapSize: 15,
    cellRadius: 5,
    padding: 20,
    zoom: 1,
    panX: 0,
    panY: 0,
    drawColor: '#22C55E',
    emptyCellColor: '#0D1210',
    canvasBgColor: '#0A0D0B',
    showAxis: true,
    axisColor: '#4848486c',
    axisEvery: 5,
    showRulers: false,
  };
}

export class App {
  model: GridModel;
  history: HistoryManager;
  renderer: CanvasRenderer;
  config: RenderConfig;

  private currentToolType: ToolType = 'draw';
  private currentTool: BaseTool;
  private tools: Map<ToolType, BaseTool>;
  private cancelLoop: (() => void) | null = null;

  // Background
  bgImage: HTMLImageElement | null = null;
  bgProps: BgProps = { x: 0, y: 0, w: 0, h: 0, opacity: 0.5, blend: 'normal', rotate: 0, crop: { x: 0, y: 0, w: 1, h: 1 } };
  bgVisible = true;

  // Letters
  letters: Record<string, LetterEntry> = {};

  // Auto-save timer
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private container: HTMLElement) {
    this.config = defaultConfig();
    this.model = new GridModel(24, 24);
    this.history = new HistoryManager(60);
    this.renderer = new CanvasRenderer(container);

    // Create tools
    const drawTool = new DrawTool('draw');
    const eraseTool = new DrawTool('erase');
    const fillTool = new FillTool();
    const brushTool = new BrushTool();
    const panTool = new PanTool();
    const selectTool = new SelectTool();

    this.tools = new Map<ToolType, BaseTool>([
      ['draw', drawTool],
      ['erase', eraseTool],
      ['fill', fillTool],
      ['brush', brushTool],
      ['pan', panTool],
      ['select', selectTool],
    ]);

    this.currentTool = drawTool;
  }

  async init(): Promise<void> {
    // Load saved settings
    const saved = loadSettings();
    if (saved) {
      Object.assign(this.config, saved);
      // Guard: override stale orange from old sessions
      if (this.config.drawColor === '#F5A623') {
        this.config.drawColor = '#22C55E';
      }
    }

    // Load letter library
    try {
      const resp = await fetch('/letters.json');
      const data = await resp.json();
      if (data.letters) {
        for (const [ch, entry] of Object.entries(data.letters)) {
          const e = entry as any;
          this.letters[ch] = {
            ch,
            name: e.name || ch,
            m: e.m || [],
            gH: e.gH || [],
            gV: e.gV || [],
            gD: e.gD || [],
            _builtin: true,
          };
        }
        console.log(`[Murabba] Loaded ${Object.keys(this.letters).length} letters`);
      }
    } catch (err) {
      console.warn('[Murabba] Failed to load letters.json:', err);
    }

    // Setup events
    this.setupPointerEvents();
    this.setupKeyboard();
    this.setupResize();

    // Start render loop
    this.cancelLoop = this.renderer.startLoop(
      () => this.model,
      this.config,
      () => this.getOverlayState()
    );

    this.requestRender();
    console.log('[Murabba] Initialized');
  }

  // ─── Tool Management ────────────────────────────────────

  setTool(toolType: ToolType): void {
    const tool = this.tools.get(toolType);
    if (!tool) return;

    // Deactivate current
    this.currentTool.onDeactivate?.(this.getToolContext());
    this.currentToolType = toolType;
    this.currentTool = tool;
    this.currentTool.onActivate?.(this.getToolContext());

    // Update canvas cursor
    this.renderer.getCanvas().style.cursor = this.currentTool.getCursor();

    // Update UI buttons
    document.querySelectorAll<HTMLElement>('.tool-btn[data-tool]').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === toolType);
    });

    this.requestRender();
  }

  getCurrentTool(): ToolType {
    return this.currentToolType;
  }

  // ─── Grid Operations ────────────────────────────────────

  initGrid(cols: number, rows: number): void {
    this.model = new GridModel(
      Math.max(5, Math.min(120, cols)),
      Math.max(5, Math.min(120, rows))
    );
    this.history.clear();
    this.requestRender();
  }

  clearGrid(): void {
    this.history.saveState(this.model);
    this.model.clear();
    this.requestRender();
    this.scheduleAutoSave();
  }

  // ─── Drawing Color ──────────────────────────────────────

  setDrawColor(color: string): void {
    this.config.drawColor = color;
    // If select tool has active selection, recolor it
    const selectTool = this.tools.get('select') as SelectTool;
    if (this.currentToolType === 'select' && selectTool.getPhase() === 'define') {
      selectTool.recolorRegion(color, this.getToolContext());
    }
    this.requestRender();
  }

  getDrawColor(): string {
    return this.config.drawColor;
  }

  // ─── Undo/Redo ──────────────────────────────────────────

  undo(): void {
    this.history.undo(this.model);
    this.requestRender();
    this.scheduleAutoSave();
  }

  redo(): void {
    this.history.redo(this.model);
    this.requestRender();
    this.scheduleAutoSave();
  }

  // ─── Export ─────────────────────────────────────────────

  exportPNG(withBg: boolean): void {
    const dataUrl = exportToPNG(this.model, this.config, {
      withBackground: withBg,
      bgImage: this.bgImage,
      bgProps: this.bgProps,
    });
    downloadPNG(dataUrl, `murabba_${Date.now()}.png`);
  }

  exportWebP(withBg: boolean): void {
    const dataUrl = exportToWebP(this.model, this.config, {
      withBackground: withBg,
      bgImage: this.bgImage,
      bgProps: this.bgProps,
    });
    // Download as WebP
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `murabba_${Date.now()}.webp`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  exportSVG(): void {
    const svgStr = exportToSVG(this.model, this.config);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `murabba_${Date.now()}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  saveJSON(): void {
    const json = exportProject(this.model, this.config, null, this.bgProps);
    downloadJSON(json, `murabba_${Date.now()}.json`);
  }

  loadJSON(text: string): void {
    try {
      const data = importProject(text);
      this.model = new GridModel(data.cols, data.rows);
      this.model.fromProjectData(data);
      if (data.drawColor) this.config.drawColor = data.drawColor;
      if (data.bgProps) Object.assign(this.bgProps, data.bgProps);
      this.bgVisible = data.bgVisible ?? true;
      if (data.bgImg) {
        const img = new Image();
        img.onload = () => { this.bgImage = img; this.requestRender(); };
        img.src = data.bgImg;
      }
      this.history.clear();
      this.requestRender();
      this.scheduleAutoSave();
    } catch (err) {
      console.error('[Murabba] Failed to load JSON:', err);
    }
  }

  restoreSession(data: SessionData): void {
    this.model = new GridModel(data.cols, data.rows);
    this.model.fromProjectData(data);
    if (data.config) {
      Object.assign(this.config, data.config);
    }
    if (data.drawColor) {
      this.config.drawColor = data.drawColor;
    }
    if (data.bgProps) {
      Object.assign(this.bgProps, data.bgProps);
    }
    this.bgVisible = data.bgVisible ?? true;
    if (data.bgImg) {
      const img = new Image();
      img.onload = () => {
        this.bgImage = img;
        this.requestRender();
      };
      img.src = data.bgImg;
    }
    this.history.clear();
    this.requestRender();
  }

  // ─── Background ─────────────────────────────────────────

  setBgImage(dataUrl: string): void {
    const img = new Image();
    img.onload = () => {
      this.bgImage = img;
      const total = this.config.cellSize + this.config.gapSize;
      const targetW = 8 * total;
      const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
      this.bgProps.w = targetW;
      this.bgProps.h = Math.round(targetW * ratio);
      this.bgProps.x = 2 * total;
      this.bgProps.y = 2 * total;
      this.bgProps.opacity = 0.5;
      this.bgProps.rotate = 0;
      this.bgProps.crop = { x: 0, y: 0, w: 1, h: 1 };
      this.bgVisible = true;
      this.requestRender();
    };
    img.src = dataUrl;
  }

  removeBgImage(): void {
    this.bgImage = null;
    this.bgVisible = false;
    this.requestRender();
  }

  // ─── Letter Placement ───────────────────────────────────

  addLetter(ch: string, sx: number = 2, sy: number = 2): void {
    const entry = this.letters[ch];
    if (!entry) return;

    this.history.saveState(this.model);
    const { m, gH, gV, gD } = entry;
    const color = this.config.drawColor;

    // Stamp cells
    m.forEach((row, dy) => row.forEach((v, dx) => {
      const x = sx + dx, y = sy + dy;
      if (v && x < this.model.cols && y < this.model.rows) {
        this.model.setCell(x, y, 1);
        this.model.setCellColor(x, y, color);
      }
    }));

    // Stamp gap-H
    if (gH) gH.forEach((row, dy) => row.forEach((v, dx) => {
      const x = sx + dx, y = sy + dy;
      if (v && x < this.model.cols && y < this.model.rows - 1) {
        this.model.setGapH(x, y, 1);
        this.model.setGapHColor(x, y, color);
      }
    }));

    // Stamp gap-V
    if (gV) gV.forEach((row, dy) => row.forEach((v, dx) => {
      const x = sx + dx, y = sy + dy;
      if (v && x < this.model.cols - 1 && y < this.model.rows) {
        this.model.setGapV(x, y, 1);
        this.model.setGapVColor(x, y, color);
      }
    }));

    // Stamp gap-D
    if (gD) gD.forEach((row, dy) => row.forEach((v, dx) => {
      const x = sx + dx, y = sy + dy;
      if (v && x < this.model.cols - 1 && y < this.model.rows - 1) {
        this.model.setGapD(x, y, 1);
        this.model.setGapDColor(x, y, color);
      }
    }));

    this.requestRender();
    this.scheduleAutoSave();
  }

  // ─── Zoom ───────────────────────────────────────────────

  setZoom(z: number): void {
    this.config.zoom = Math.max(0.25, Math.min(5, z));
    this.requestRender();
  }

  zoomIn(): void { this.setZoom(this.config.zoom + 0.1); }
  zoomOut(): void { this.setZoom(this.config.zoom - 0.1); }
  zoomFit(): void {
    this.config.zoom = 1;
    this.config.panX = 0;
    this.config.panY = 0;
    this.requestRender();
  }

  // ─── Render ─────────────────────────────────────────────

  requestRender(): void {
    this.renderer.requestRender();
  }

  // ─── Private: Tool Context ──────────────────────────────

  private getToolContext(): ToolContext {
    return {
      model: this.model,
      history: this.history,
      config: this.config,
      requestRender: () => {
        this.requestRender();
        this.scheduleAutoSave();
      },
    };
  }

  private getOverlayState(): OverlayState {
    const selectTool = this.tools.get('select') as SelectTool;
    const brushTool = this.tools.get('brush') as BrushTool;
    const overlay: OverlayState = {
      bgImage: this.bgImage,
      bgProps: this.bgProps,
      bgVisible: this.bgVisible,
    };

    if (this.currentToolType === 'select' && selectTool) {
      if (selectTool.getPhase() === 'define') {
        overlay.selectionFrame = selectTool.getSelectionBounds();
      }
      if (selectTool.getPhase() === 'float') {
        overlay.selectionGhost = selectTool.getFloatData();
      }
    }

    if (this.currentToolType === 'brush' && brushTool) {
      const pts = brushTool.getPreviewPoints();
      if (pts.length > 0) {
        overlay.brushPreview = pts;
      }
      overlay.brushMode = brushTool.mode;

      // Mode 2: always show gap hover highlight + preview line
      if (brushTool.mode === 2) {
        overlay.hoverGap = brushTool.getHoverGap();
        const pg = brushTool.getPreviewGaps();
        if (pg.length > 0) overlay.previewGaps = pg;
      }
    }

    return overlay;
  }

  // ─── Private: Pointer Events ────────────────────────────

  private setupPointerEvents(): void {
    const canvas = this.renderer.getCanvas();

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();

      // Right-click: reset/cancel current tool state
      if (e.button === 2) {
        const brushTool = this.tools.get('brush') as BrushTool;
        const selectTool = this.tools.get('select') as SelectTool;

        if (this.currentToolType === 'brush' && brushTool) {
          brushTool.reset();
        } else if (this.currentToolType === 'select' && selectTool) {
          selectTool.reset();
        }
        this.requestRender();
        return;
      }

      // Left-click: normal tool action
      const pos = this.renderer.screenToCanvas(e.clientX, e.clientY, this.config);
      this.currentTool.onPointerDown(pos.x, pos.y, this.getToolContext());
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      const pos = this.renderer.screenToCanvas(e.clientX, e.clientY, this.config);
      this.currentTool.onPointerMove(pos.x, pos.y, this.getToolContext());

      // Update coordinate display
      const cell = screenToCell(pos.x, pos.y, this.config);
      const coordEl = document.getElementById('coordsDisplay');
      if (coordEl && cell) {
        coordEl.textContent = `X: ${cell.x} — Y: ${cell.y}`;
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      this.currentTool.onPointerUp(this.getToolContext());
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ok */ }
    });

    // Zoom with Ctrl+Wheel
    canvas.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.setZoom(this.config.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
      }
    }, { passive: false });

    // Right-click on canvas: also reset via contextmenu event
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const brushTool = this.tools.get('brush') as BrushTool;
      const selectTool = this.tools.get('select') as SelectTool;

      if (this.currentToolType === 'brush' && brushTool) {
        brushTool.reset();
      } else if (this.currentToolType === 'select' && selectTool) {
        selectTool.reset();
      }
      this.requestRender();
    });
  }

  // ─── Private: Keyboard Shortcuts ────────────────────────

  private setupKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'z') { e.preventDefault(); this.undo(); return; }
      if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); this.redo(); return; }
      if (ctrl && e.key === 's') { e.preventDefault(); this.exportPNG(true); return; }

      if (!ctrl) {
        switch (e.key.toLowerCase()) {
          case 'b': this.setTool('draw'); break;
          case 'e': this.setTool('erase'); break;
          case 'f': this.setTool('fill'); break;
          case 'w': this.setTool('brush'); break;
          case 'h': this.setTool('pan'); break;
          case 's': this.setTool('select'); break;
        }

        // Selection nudge
        if (this.currentToolType === 'select') {
          const sel = this.currentTool as SelectTool;
          const ctx = this.getToolContext();
          switch (e.key) {
            case 'ArrowUp': e.preventDefault(); sel.nudge(0, -1, ctx); break;
            case 'ArrowDown': e.preventDefault(); sel.nudge(0, 1, ctx); break;
            case 'ArrowLeft': e.preventDefault(); sel.nudge(-1, 0, ctx); break;
            case 'ArrowRight': e.preventDefault(); sel.nudge(1, 0, ctx); break;
            case 'Enter':
              e.preventDefault();
              if (sel.getPhase() === 'float') sel.stampFloat(ctx);
              else if (sel.getPhase() === 'define') sel.commitSelection(ctx);
              break;
            case 'Delete':
            case 'Backspace':
              if (sel.getPhase() === 'define') { e.preventDefault(); sel.eraseRegion(ctx); }
              break;
            case 'Escape':
              e.preventDefault();
              if (sel.getPhase() === 'float') sel.cancelFloat(ctx);
              else if (sel.getPhase() === 'define') { sel.reset(); ctx.requestRender(); }
              break;
          }
        }

        if (this.currentToolType === 'brush' && e.key === 'Escape') {
          (this.currentTool as BrushTool).reset();
          this.requestRender();
        }
      }
    });
  }

  // ─── Private: Resize ────────────────────────────────────

  private setupResize(): void {
    const ro = new ResizeObserver(() => {
      this.renderer.resize();
      this.requestRender();
    });
    ro.observe(this.container);
  }

  // ─── Private: Auto-save ─────────────────────────────────

  private scheduleAutoSave(): void {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      try {
        saveSession(this.model, this.config, this.bgProps, this.config.drawColor);
        saveSettings(this.config);
      } catch { /* ignore */ }
    }, 2000);
  }
}
