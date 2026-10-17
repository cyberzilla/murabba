/**
 * App.ts — Main application controller that wires all modules together.
 */
import { GridModel } from '../core/GridModel';
import { HistoryManager } from '../core/HistoryManager';
import { screenToCell } from '../core/CoordinateMapper';
import { CanvasRenderer, OverlayState } from '../canvas/CanvasRenderer';
import { exportToPNG, exportToWebP, exportToSVG } from '../canvas/ExportRenderer';
import { BaseTool, ToolContext } from '../tools/BaseTool';
import { DrawTool } from '../tools/DrawTool';
import { FillTool } from '../tools/FillTool';
import { BrushTool } from '../tools/BrushTool';
import { PanTool } from '../tools/PanTool';
import { SelectTool } from '../tools/SelectTool';
import { downloadPNG, downloadJSON, exportProject, importProject } from '../storage/ProjectIO';
import { saveSession, saveSettings, loadSettings } from '../storage/SessionManager';
import type { ToolType, RenderConfig, BgProps, LetterEntry, SessionData, SelectionData } from '../types/grid';

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


  // Background
  bgImage: HTMLImageElement | null = null;
  bgDataUrl: string | null = null;
  bgProps: BgProps = { x: 0, y: 0, w: 0, h: 0, opacity: 0.5, blend: 'normal', rotate: 0, crop: { x: 0, y: 0, w: 1, h: 1 } };
  bgVisible = true;

  // Letters
  letters: Record<string, LetterEntry> = {};

  // Auto-save timer
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  // Cached DOM elements
  private coordsDisplay: HTMLElement | null = null;

  constructor(private container: HTMLElement) {
    this.config = defaultConfig();
    this.model = new GridModel(24, 24);
    this.history = new HistoryManager(60);
    this.renderer = new CanvasRenderer(container);

    // Cache DOM elements
    this.coordsDisplay = document.getElementById('coordsDisplay');

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
    this.renderer.startLoop(
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

  resizeGrid(cols: number, rows: number): void {
    const c = Math.max(5, Math.min(120, cols));
    const r = Math.max(5, Math.min(120, rows));
    if (c === this.model.cols && r === this.model.rows) return;
    this.history.saveState(this.model);
    this.model.resize(c, r);
    this.requestRender();
    this.scheduleAutoSave();
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
    // If select tool is in float phase, undo restores content + selection frame
    if (this.currentToolType === 'select') {
      const sel = this.currentTool as SelectTool;
      if (sel.getPhase() === 'float') {
        sel.undoFloat(this.getToolContext());
        this.scheduleAutoSave();
        return;
      }
    }
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

  /** Whether background should be included in export (auto-detect from bgImage). */
  private get shouldExportBg(): boolean {
    return !!(this.bgImage && this.bgVisible);
  }

  exportPNG(): void {
    const withBg = this.shouldExportBg;
    const dataUrl = exportToPNG(this.model, this.config, {
      withBackground: withBg,
      bgImage: this.bgImage,
      bgProps: this.bgProps,
    });
    downloadPNG(dataUrl, `murabba_${Date.now()}.png`);
  }

  exportWebP(): void {
    const withBg = this.shouldExportBg;
    const dataUrl = exportToWebP(this.model, this.config, {
      withBackground: withBg,
      bgImage: this.bgImage,
      bgProps: this.bgProps,
    });
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `murabba_${Date.now()}.webp`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  exportSVG(): void {
    const withBg = this.shouldExportBg;
    const svgStr = exportToSVG(this.model, this.config, {
      withBackground: withBg,
      bgImage: this.bgImage,
      bgProps: this.bgProps,
    });
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
    this.bgDataUrl = dataUrl;
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
    this.bgDataUrl = null;
    this.bgVisible = false;
    this.requestRender();
  }

  // ─── Letter Placement ───────────────────────────────────

  addLetter(ch: string): void {
    const entry = this.letters[ch];
    if (!entry) return;

    const { m, gH, gV, gD } = entry;
    const color = this.config.drawColor;

    // Convert letter matrices to SelectionData format
    const cells: SelectionData['cells'] = [];
    const gHData: SelectionData['gH'] = [];
    const gVData: SelectionData['gV'] = [];
    const gDData: SelectionData['gD'] = [];

    const rows = m.length;
    const cols = rows > 0 ? m[0].length : 0;

    m.forEach((row, dy) => row.forEach((v, dx) => {
      if (v) cells.push({ lx: dx, ly: dy, c: color });
    }));
    if (gH) gH.forEach((row, dy) => row.forEach((v, dx) => {
      if (v) gHData.push({ lx: dx, ly: dy, c: color });
    }));
    if (gV) gV.forEach((row, dy) => row.forEach((v, dx) => {
      if (v) gVData.push({ lx: dx, ly: dy, c: color });
    }));
    if (gD) gD.forEach((row, dy) => row.forEach((v, dx) => {
      if (v) gDData.push({ lx: dx, ly: dy, c: color });
    }));

    if (cells.length === 0 && gHData.length === 0 && gVData.length === 0 && gDData.length === 0) return;

    // Switch to select tool first
    this.setTool('select');
    const selectTool = this.currentTool as SelectTool;

    // Stamp any existing float BEFORE finding position, so grid is up-to-date
    if (selectTool.getPhase() === 'float') {
      selectTool.stampFloat(this.getToolContext());
    }

    // Compute tight bounding box of actual content (not canvas size)
    const allPoints: { x: number; y: number }[] = [];
    for (const c of cells) allPoints.push({ x: c.lx, y: c.ly });
    // gapH(lx, ly) occupies space between row ly and ly+1
    for (const g of gHData) { allPoints.push({ x: g.lx, y: g.ly }); allPoints.push({ x: g.lx, y: g.ly + 1 }); }
    // gapV(lx, ly) occupies space between col lx and lx+1
    for (const g of gVData) { allPoints.push({ x: g.lx, y: g.ly }); allPoints.push({ x: g.lx + 1, y: g.ly }); }
    // gapD(lx, ly) occupies corner between 4 cells
    for (const g of gDData) {
      allPoints.push({ x: g.lx, y: g.ly }); allPoints.push({ x: g.lx + 1, y: g.ly });
      allPoints.push({ x: g.lx, y: g.ly + 1 }); allPoints.push({ x: g.lx + 1, y: g.ly + 1 });
    }

    let minLx = Infinity, minLy = Infinity, maxLx = -Infinity, maxLy = -Infinity;
    for (const p of allPoints) {
      if (p.x < minLx) minLx = p.x;
      if (p.y < minLy) minLy = p.y;
      if (p.x > maxLx) maxLx = p.x;
      if (p.y > maxLy) maxLy = p.y;
    }

    const contentW = maxLx - minLx + 1;
    const contentH = maxLy - minLy + 1;

    // Find empty position for the tight content size
    const pos = this.findEmptyPosition(contentW, contentH);

    // Adjust offset: content starts at (minLx, minLy) within canvas,
    // so ox = pos.x - minLx maps the content's top-left to pos
    const floatData: SelectionData = {
      cells,
      gH: gHData,
      gV: gVData,
      gD: gDData,
      ox: pos.x - minLx,
      oy: pos.y - minLy,
      w: cols,
      h: rows,
    };

    selectTool.startFloat(floatData, this.getToolContext());
  }

  /**
   * Finds the next empty position on the grid where a letter of (w × h) can fit.
   * Scans left-to-right, top-to-bottom. Checks that all cells in the bounding box are empty.
   */
  private findEmptyPosition(w: number, h: number): { x: number; y: number } {
    const model = this.model;
    const gridCols = model.cols;
    const gridRows = model.rows;

    for (let y = 0; y <= gridRows - h; y++) {
      for (let x = 0; x <= gridCols - w; x++) {
        if (this.isAreaEmpty(x, y, w, h)) {
          return { x, y };
        }
      }
    }

    // Fallback: place at (0, 0) if no empty spot found
    return { x: 0, y: 0 };
  }

  /**
   * Checks if a rectangular area on the grid is completely empty.
   * Checks cells, gapH, gapV, gapD within the bounding box.
   */
  private isAreaEmpty(sx: number, sy: number, w: number, h: number): boolean {
    const model = this.model;

    // Check all cells in the bounding box
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (model.getCell(sx + dx, sy + dy) !== 0) return false;
      }
    }

    // Check gapH within area (between rows)
    for (let dy = 0; dy < h - 1; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (model.isGapHInBounds(sx + dx, sy + dy) && model.isFilledGapH(sx + dx, sy + dy)) return false;
      }
    }

    // Check gapV within area (between columns)
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w - 1; dx++) {
        if (model.isGapVInBounds(sx + dx, sy + dy) && model.isFilledGapV(sx + dx, sy + dy)) return false;
      }
    }

    // Check gapD within area (diagonal corners)
    for (let dy = 0; dy < h - 1; dy++) {
      for (let dx = 0; dx < w - 1; dx++) {
        if (model.isGapDInBounds(sx + dx, sy + dy) && model.isFilledGapD(sx + dx, sy + dy)) return false;
      }
    }

    return true;
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

  // ─── Public API for external access ─────────────────────

  setBrushMode(mode: 1 | 2 | 3): void {
    const brush = this.tools.get('brush') as BrushTool;
    if (brush) brush.mode = mode;
  }

  resetBrushTool(): void {
    const brush = this.tools.get('brush') as BrushTool;
    if (brush) brush.reset();
    this.requestRender();
  }

  resetSelectTool(): void {
    const select = this.tools.get('select') as SelectTool;
    if (select) select.reset();
    this.requestRender();
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
          if (selectTool.getPhase() === 'float') {
            // Stamp float at current position
            selectTool.stampFloat(this.getToolContext());
          } else {
            selectTool.reset();
          }
        }
        this.requestRender();
        return;
      }

      // Left-click: normal tool action
      const pos = this.renderer.screenToCanvas(e.clientX, e.clientY, this.config);
      // Pass modifier keys to SelectTool
      if (this.currentToolType === 'select') {
        (this.currentTool as SelectTool).shiftKey = e.shiftKey;
      }
      this.currentTool.onPointerDown(pos.x, pos.y, this.getToolContext());
      canvas.setPointerCapture(e.pointerId);

      // Update cursor after pointerdown (e.g. grab → grabbing)
      if (this.currentToolType === 'select') {
        canvas.style.cursor = (this.currentTool as SelectTool).getHoverCursor(
          pos.x, pos.y, this.getToolContext()
        );
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const pos = this.renderer.screenToCanvas(e.clientX, e.clientY, this.config);
      this.currentTool.onPointerMove(pos.x, pos.y, this.getToolContext());

      // Dynamic cursor for select tool
      if (this.currentToolType === 'select') {
        canvas.style.cursor = (this.currentTool as SelectTool).getHoverCursor(
          pos.x, pos.y, this.getToolContext()
        );
      }

      // Update coordinate display
      const cell = screenToCell(pos.x, pos.y, this.config);
      if (this.coordsDisplay && cell) {
        this.coordsDisplay.textContent = `X: ${cell.x} — Y: ${cell.y}`;
      } else if (this.coordsDisplay) {
        this.coordsDisplay.textContent = '';
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      this.currentTool.onPointerUp(this.getToolContext());
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ok */ }

      // Refresh cursor after release (e.g. grabbing → grab)
      if (this.currentToolType === 'select') {
        const pos = this.renderer.screenToCanvas(e.clientX, e.clientY, this.config);
        canvas.style.cursor = (this.currentTool as SelectTool).getHoverCursor(
          pos.x, pos.y, this.getToolContext()
        );
      }
    });

    // Zoom with Ctrl+Wheel
    canvas.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.setZoom(this.config.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
      }
    }, { passive: false });

    // Block browser context menu on canvas (right-click handled in pointerdown)
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  // ─── Private: Keyboard Shortcuts ────────────────────────

  private setupKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      // Guard: don't intercept shortcuts when typing in form inputs
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable) {
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'z') { e.preventDefault(); this.undo(); return; }
      if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); this.redo(); return; }
      if (ctrl && e.key === 's') { e.preventDefault(); this.exportPNG(); return; }

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

          // Float transforms: R=rotate CW, Shift+R=rotate CCW, X=flip H, Y=flip V
          if (sel.getPhase() === 'float') {
            switch (e.key) {
              case 'r':
                e.preventDefault();
                sel.rotateFloat(ctx);
                break;
              case 'R':
                e.preventDefault();
                sel.rotateFloatCCW(ctx);
                break;
              case 'x':
                e.preventDefault();
                sel.flipFloatH(ctx);
                break;
              case 'y':
                e.preventDefault();
                sel.flipFloatV(ctx);
                break;
            }
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
        saveSession(this.model, this.config, this.bgProps, this.config.drawColor, this.bgDataUrl);
        saveSettings(this.config);
      } catch { /* ignore */ }
    }, 2000);
  }
}
