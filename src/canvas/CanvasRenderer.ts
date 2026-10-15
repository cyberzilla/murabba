/**
 * CanvasRenderer — Main orchestrator that manages the HTML5 Canvas element.
 * Composites all rendering layers: background, grid, cells, gaps, overlays.
 */
import type { GridModel } from '../core/GridModel';
import type { RenderConfig, BgProps, SelectionData, CellCoord, GapCoord } from '../types/grid';
import { renderEmptyCells, renderFilledCells, renderFilledGaps, renderAxisLines } from './GridRenderer';
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
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLElement;
  private dirty = true;
  private rafId: number | null = null;
  private dpr = 1;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
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
    this.dirty = true;
  }

  /** Mark as needing a re-render. */
  markDirty(): void {
    this.dirty = true;
  }

  /** Convert client coordinates to canvas-relative pixel coordinates. */
  screenToCanvas(clientX: number, clientY: number, _config: RenderConfig): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
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

    // 2. Background image
    if (overlay.bgVisible && overlay.bgImage && overlay.bgProps) {
      renderBackground(ctx, overlay.bgImage, overlay.bgProps, config);
    }

    // 3. Empty cells (subtle grid pattern)
    renderEmptyCells(ctx, model, config);

    // 4. Axis guide lines
    if (config.showAxis) {
      renderAxisLines(ctx, model, config);
    }

    // 5. Filled gaps
    renderFilledGaps(ctx, model, config);

    // 6. Filled cells
    renderFilledCells(ctx, model, config);

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

  /** Start a continuous render loop (returns cancel function). */
  startLoop(
    getModel: () => GridModel,
    config: RenderConfig,
    getOverlay: () => OverlayState
  ): () => void {
    const loop = () => {
      if (this.dirty) {
        this.render(getModel(), config, getOverlay());
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);

    return () => {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    };
  }

  /** Request a single re-render on next animation frame. */
  requestRender(): void {
    this.dirty = true;
  }

  /** Clean up. */
  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.canvas.remove();
  }
}
