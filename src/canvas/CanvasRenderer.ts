/**
 * CanvasRenderer — Main orchestrator that manages the HTML5 Canvas element.
 * Composites all rendering layers: background, grid, cells, gaps, overlays.
 */
import type { GridModel } from '../core/GridModel';
import type { ConnectionMarker } from '../types/grid';
import type { RenderConfig, BgProps, SelectionData, CellCoord, GapCoord } from '../types/grid';
import { renderEmptyCells, renderFilledCells, renderFilledGaps, renderAxisLines } from './GridRenderer';
import { renderMarks } from './MarkRenderer';
import { renderConnections } from './ConnRenderer';
import { renderBackground } from './BackgroundRenderer';
import { renderSelectionFrame, renderSelectionGhost, renderBrushPreview, renderGapHoverPreview } from './SelectionRenderer';

export interface OverlayState {
  /** Selection frame bounds (define phase) */
  selectionFrame?: { x1: number; y1: number; x2: number; y2: number } | null;
  /** Floating selection ghost (float phase) */
  selectionGhost?: SelectionData | null;
  /** Brush preview highlight cells */
  brushPreview?: CellCoord[];
  brushMode?: number;
  /** Mode 2 hover gap highlight */
  hoverGap?: GapCoord | null;
  /** Mode 2 preview line of gaps (anchor → hover) */
  previewGaps?: GapCoord[];
  /** Background image */
  bgImage?: HTMLImageElement | null;
  /** Background properties */
  bgProps?: BgProps;
  /** Whether background is visible */
  bgVisible?: boolean;
  /** Whether connection markers are visible */
  showConns?: boolean;
  /** Connection markers from grid model */
  connMarkers?: ConnectionMarker[];
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLElement;
  private dirty = true;
  private rafId: number | null = null;
  private dpr = 1;
  private cachedRect: DOMRect | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();

    // Update cached rect on resize/scroll
    window.addEventListener('resize', () => this.updateCachedRect());
    window.addEventListener('scroll', () => this.updateCachedRect());
  }

  private updateCachedRect(): void {
    this.cachedRect = this.canvas.getBoundingClientRect();
  }

  /** Get the underlying canvas element. */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Resize canvas to match container dimensions. */
  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.updateCachedRect();
    this.dirty = true;
  }

  /** Mark as needing a re-render. */
  markDirty(): void {
    this.dirty = true;
    this._scheduleFrame();
  }

  /** Convert client coordinates to canvas-relative pixel coordinates. */
  screenToCanvas(clientX: number, clientY: number, _config: RenderConfig): { x: number; y: number } {
    const rect = this.cachedRect || this.canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    return { x: canvasX, y: canvasY };
  }

  /** Full frame render. Call this via requestAnimationFrame. */
  render(model: GridModel, config: RenderConfig, overlay: OverlayState = {}): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 1. Clear with background color
    ctx.fillStyle = config.canvasBgColor;
    ctx.fillRect(0, 0, w / this.dpr, h / this.dpr);

    // Apply zoom + pan transform
    ctx.translate(config.panX, config.panY);
    ctx.scale(config.zoom, config.zoom);

    const hasBgImage = !!(overlay.bgVisible && overlay.bgImage && overlay.bgProps);

    // 2. Background image
    if (hasBgImage) {
      renderBackground(ctx, overlay.bgImage!, overlay.bgProps!, config);
    }

    // 3. Empty cells (reduce opacity when background is active so image is visible)
    if (hasBgImage) {
      ctx.globalAlpha = 0.3;
    }
    renderEmptyCells(ctx, model, config);
    if (hasBgImage) {
      ctx.globalAlpha = 1;
    }

    // 4. Axis guide lines
    if (config.showAxis) {
      renderAxisLines(ctx, model, config);
    }

    // 5. Filled gaps
    renderFilledGaps(ctx, model, config);

    // 6. Filled cells
    renderFilledCells(ctx, model, config);

    // 6b. Sub-cell marks (kaf-s, hamzah)
    renderMarks(ctx, model.marks, config);

    // 6c. Connection markers
    if (overlay.showConns && overlay.connMarkers && overlay.connMarkers.length > 0) {
      renderConnections(ctx, overlay.connMarkers, config);
    }

    // 7. Selection overlays
    if (overlay.selectionFrame) {
      const sf = overlay.selectionFrame;
      renderSelectionFrame(ctx, sf.x1, sf.y1, sf.x2, sf.y2, config);
    }
    if (overlay.selectionGhost) {
      renderSelectionGhost(ctx, overlay.selectionGhost, config);
    }

    // 8. Brush preview
    if (overlay.brushPreview && overlay.brushPreview.length > 0) {
      renderBrushPreview(ctx, overlay.brushPreview, config, overlay.brushMode ?? 1);
    }

    // 9. Mode 2 gap hover highlight (when no anchor, shows which gap cursor is over)
    if (overlay.hoverGap) {
      renderGapHoverPreview(ctx, overlay.hoverGap, config);
    }

    // 10. Mode 2 preview line of gaps (anchor → current hover)
    if (overlay.previewGaps && overlay.previewGaps.length > 0) {
      for (const g of overlay.previewGaps) {
        renderGapHoverPreview(ctx, g, config);
      }
    }

    ctx.restore();
    this.dirty = false;
  }

  // Saved references for on-demand RAF loop
  private _getModel: (() => GridModel) | null = null;
  private _config: RenderConfig | null = null;
  private _getOverlay: (() => OverlayState) | null = null;

  /** Start a continuous render loop (returns cancel function). */
  startLoop(
    getModel: () => GridModel,
    config: RenderConfig,
    getOverlay: () => OverlayState
  ): () => void {
    this._getModel = getModel;
    this._config = config;
    this._getOverlay = getOverlay;

    this._scheduleFrame();

    return () => {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    };
  }

  /** Schedule a single RAF frame; the callback decides whether to continue. */
  private _scheduleFrame(): void {
    if (this.rafId !== null) return; // already scheduled
    this.rafId = requestAnimationFrame(() => this._tick());
  }

  /** One tick of the render loop. */
  private _tick(): void {
    this.rafId = null;

    if (!this._getModel || !this._config || !this._getOverlay) return;

    const overlay = this._getOverlay();
    const hasActiveSelection = !!(overlay.selectionFrame || overlay.selectionGhost);

    if (this.dirty || hasActiveSelection) {
      this.render(this._getModel(), this._config, overlay);
    }

    // Keep looping only if there's an active marching-ants selection
    if (hasActiveSelection) {
      this.rafId = requestAnimationFrame(() => this._tick());
    }
    // Otherwise, stop — requestRender()/markDirty() will restart
  }

  /** Request a single re-render on next animation frame. */
  requestRender(): void {
    this.dirty = true;
    this._scheduleFrame();
  }


  /** Clean up. */
  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.canvas.remove();
  }
}

