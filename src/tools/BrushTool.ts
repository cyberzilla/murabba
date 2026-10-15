/**
 * Murabba - Continuous Brush / Line Tool
 * Multi-mode pen tool for continuous stroke drawing.
 * Mode 1 & 3: cell-based Bresenham with anchor.
 * Mode 2: gap-based direct painting with gap anchor.
 */

import { BaseTool, type ToolContext } from './BaseTool';
import { CoordinateMapper } from '../core/CoordinateMapper';
import type { GridModel } from '../core/GridModel';
import type { BrushMode, CellCoord, GapCoord, ToolType } from '../types/grid';
import bresenham from '../utils/bresenham';

// ═══════════════════════════════════════════════════════
//  Shared helper functions
// ═══════════════════════════════════════════════════════

export function fillGapBetween(
  model: GridModel, x0: number, y0: number, x1: number, y1: number, color: string
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dy === 0) {
    const gx = Math.min(x0, x1);
    if (model.isGapVInBounds(gx, y0)) { model.setGapV(gx, y0, 1); model.setGapVColor(gx, y0, color); }
  } else if (dx === 0) {
    const gy = Math.min(y0, y1);
    if (model.isGapHInBounds(x0, gy)) { model.setGapH(x0, gy, 1); model.setGapHColor(x0, gy, color); }
  } else {
    const lx = dx > 0 ? x0 : x1;
    const ly = dy > 0 ? y0 : y1;
    if (model.isGapVInBounds(lx, y0)) { model.setGapV(lx, y0, 1); model.setGapVColor(lx, y0, color); }
    if (model.isGapVInBounds(lx, y1)) { model.setGapV(lx, y1, 1); model.setGapVColor(lx, y1, color); }
    if (model.isGapHInBounds(x0, ly)) { model.setGapH(x0, ly, 1); model.setGapHColor(x0, ly, color); }
    if (model.isGapHInBounds(x1, ly)) { model.setGapH(x1, ly, 1); model.setGapHColor(x1, ly, color); }
    if (model.isGapDInBounds(lx, ly)) { model.setGapD(lx, ly, 1); model.setGapDColor(lx, ly, color); }
  }
}

export function fillAroundCell(
  model: GridModel, x: number, y: number, color: string
): void {
  if (model.isGapVInBounds(x - 1, y)) { model.setGapV(x - 1, y, 1); model.setGapVColor(x - 1, y, color); }
  if (model.isGapVInBounds(x, y))     { model.setGapV(x, y, 1);     model.setGapVColor(x, y, color); }
  if (model.isGapHInBounds(x, y - 1)) { model.setGapH(x, y - 1, 1); model.setGapHColor(x, y - 1, color); }
  if (model.isGapHInBounds(x, y))     { model.setGapH(x, y, 1);     model.setGapHColor(x, y, color); }
  if (model.isGapDInBounds(x - 1, y - 1)) { model.setGapD(x - 1, y - 1, 1); model.setGapDColor(x - 1, y - 1, color); }
  if (model.isGapDInBounds(x, y - 1))     { model.setGapD(x, y - 1, 1);     model.setGapDColor(x, y - 1, color); }
  if (model.isGapDInBounds(x - 1, y))     { model.setGapD(x - 1, y, 1);     model.setGapDColor(x - 1, y, color); }
  if (model.isGapDInBounds(x, y))         { model.setGapD(x, y, 1);         model.setGapDColor(x, y, color); }
}

export function fillConnectorStep(
  model: GridModel, x0: number, y0: number, x1: number, y1: number, color: string
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx !== 0 && dy === 0) {
    const gx = Math.min(x0, x1);
    if (model.isGapVInBounds(gx, y0)) { model.setGapV(gx, y0, 1); model.setGapVColor(gx, y0, color); }
  } else if (dx === 0 && dy !== 0) {
    const gy = Math.min(y0, y1);
    if (model.isGapHInBounds(x0, gy)) { model.setGapH(x0, gy, 1); model.setGapHColor(x0, gy, color); }
  } else if (dx !== 0 && dy !== 0) {
    const gx = Math.min(x0, x1);
    const gy = Math.min(y0, y1);
    if (model.isGapVInBounds(gx, y0)) { model.setGapV(gx, y0, 1); model.setGapVColor(gx, y0, color); }
    if (model.isGapHInBounds(x1, gy)) { model.setGapH(x1, gy, 1); model.setGapHColor(x1, gy, color); }
    if (model.isGapDInBounds(gx, gy)) { model.setGapD(gx, gy, 1); model.setGapDColor(gx, gy, color); }
  }
}

function fillSingleGap(model: GridModel, gap: GapCoord, color: string): void {
  if (gap.type === 'h' && model.isGapHInBounds(gap.gx, gap.gy)) {
    model.setGapH(gap.gx, gap.gy, 1); model.setGapHColor(gap.gx, gap.gy, color);
  } else if (gap.type === 'v' && model.isGapVInBounds(gap.gx, gap.gy)) {
    model.setGapV(gap.gx, gap.gy, 1); model.setGapVColor(gap.gx, gap.gy, color);
  } else if (gap.type === 'd' && model.isGapDInBounds(gap.gx, gap.gy)) {
    model.setGapD(gap.gx, gap.gy, 1); model.setGapDColor(gap.gx, gap.gy, color);
  }
}

/**
 * Compute all gap coords forming a straight line between two same-type gaps.
 * gapV: same gx, iterate gy. gapH: same gy, iterate gx. gapD: same row or col.
 */
function computeGapLine(from: GapCoord, to: GapCoord): GapCoord[] {
  if (from.type !== to.type) return [];
  const result: GapCoord[] = [];
  const t = from.type;

  if (t === 'v' && from.gx === to.gx) {
    // Vertical line of gapV — include gapD connectors between consecutive gapV
    const min = Math.min(from.gy, to.gy), max = Math.max(from.gy, to.gy);
    for (let y = min; y <= max; y++) {
      result.push({ gx: from.gx, gy: y, type: 'v' });
      if (y < max) result.push({ gx: from.gx, gy: y, type: 'd' }); // dot below gapV
    }
  } else if (t === 'h' && from.gy === to.gy) {
    // Horizontal line of gapH — include gapD connectors between consecutive gapH
    const min = Math.min(from.gx, to.gx), max = Math.max(from.gx, to.gx);
    for (let x = min; x <= max; x++) {
      result.push({ gx: x, gy: from.gy, type: 'h' });
      if (x < max) result.push({ gx: x, gy: from.gy, type: 'd' }); // dot right of gapH
    }
  } else if (t === 'd') {
    if (from.gx === to.gx) {
      const min = Math.min(from.gy, to.gy), max = Math.max(from.gy, to.gy);
      for (let y = min; y <= max; y++) result.push({ gx: from.gx, gy: y, type: 'd' });
    } else if (from.gy === to.gy) {
      const min = Math.min(from.gx, to.gx), max = Math.max(from.gx, to.gx);
      for (let x = min; x <= max; x++) result.push({ gx: x, gy: from.gy, type: 'd' });
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════
//  BrushTool class
// ═══════════════════════════════════════════════════════

export class BrushTool extends BaseTool {
  public readonly type: ToolType = 'brush';
  public mode: BrushMode;

  // ── Mode 1 & 3: cell anchor ──
  private _anchor: CellCoord | null = null;
  private _previewPoints: CellCoord[] = [];
  private _hoverCell: CellCoord | null = null;
  private _isDown = false;

  // ── Mode 2: gap anchor ──
  private _anchorGap: GapCoord | null = null;
  private _hoverGap: GapCoord | null = null;
  private _previewGaps: GapCoord[] = [];
  private _m2HistorySaved = false;

  constructor(mode: BrushMode = 1) {
    super();
    this.mode = mode;
  }

  public get active(): boolean {
    return this.mode === 2 ? this._anchorGap !== null : this._anchor !== null;
  }
  public get anchor(): CellCoord | null { return this._anchor; }
  public getAnchor(): CellCoord | null { return this._anchor; }
  public getPreviewPoints(): CellCoord[] { return this._previewPoints; }
  public getHoverGap(): GapCoord | null { return this._hoverGap; }
  public getAnchorGap(): GapCoord | null { return this._anchorGap; }
  public getPreviewGaps(): GapCoord[] { return this._previewGaps; }

  public getPreview(target?: CellCoord): CellCoord[] {
    const tgt = target ?? this._hoverCell;
    if (!this._anchor || !tgt) return [];
    return bresenham(this._anchor.x, this._anchor.y, tgt.x, tgt.y);
  }

  public reset(): void {
    this._anchor = null;
    this._previewPoints = [];
    this._hoverCell = null;
    this._hoverGap = null;
    this._anchorGap = null;
    this._previewGaps = [];
    this._isDown = false;
    this._m2HistorySaved = false;
  }

  public clearPreview(): void {
    this._previewPoints = [];
    this._previewGaps = [];
  }

  public showPreview(targetX: number, targetY: number): void {
    if (!this._anchor) return;
    this._hoverCell = { x: targetX, y: targetY };
    this._previewPoints = this.getPreview(this._hoverCell);
  }

  /** strokeTo — Mode 1 & 3 only. */
  public strokeTo(targetX: number, targetY: number, ctx: ToolContext): void {
    if (!ctx.model.isCellInBounds(targetX, targetY)) return;
    const color = ctx.config.drawColor;

    if (!this._anchor) {
      ctx.history.saveState(ctx.model);
      this._anchor = { x: targetX, y: targetY };
      ctx.model.setCell(targetX, targetY, 1);
      ctx.model.setCellColor(targetX, targetY, color);
      if (this.mode === 3) fillAroundCell(ctx.model, targetX, targetY, color);
      this._previewPoints = [{ x: targetX, y: targetY }];
      ctx.requestRender();
      return;
    }

    this._drawCellSegment(this._anchor, { x: targetX, y: targetY }, ctx);
    this._anchor = { x: targetX, y: targetY };
    this._previewPoints = [{ x: targetX, y: targetY }];
    ctx.requestRender();
  }

  // ═══════════════════════════════════════════════════════
  //  Pointer Events
  // ═══════════════════════════════════════════════════════

  public onPointerDown(x: number, y: number, ctx: ToolContext): void {
    if (this.mode === 2) { this._m2Down(x, y, ctx); return; }
    const cell = CoordinateMapper.screenToCellLoose(x, y, ctx.config);
    if (!cell || !ctx.model.isCellInBounds(cell.x, cell.y)) return;
    this._isDown = true;
    this.strokeTo(cell.x, cell.y, ctx);
  }

  public onPointerMove(x: number, y: number, ctx: ToolContext): void {
    if (this.mode === 2) { this._m2Move(x, y, ctx); return; }
    const cell = CoordinateMapper.screenToCellLoose(x, y, ctx.config);
    if (!cell || !ctx.model.isCellInBounds(cell.x, cell.y)) {
      if (!this._isDown && this._anchor) {
        this._previewPoints = [{ x: this._anchor.x, y: this._anchor.y }];
        ctx.requestRender();
      }
      return;
    }
    if (this._isDown && this._anchor) {
      if (cell.x !== this._anchor.x || cell.y !== this._anchor.y) {
        this._drawCellSegment(this._anchor, cell, ctx);
        this._anchor = { x: cell.x, y: cell.y };
        this._previewPoints = [{ x: cell.x, y: cell.y }];
        this._hoverCell = cell;
        ctx.requestRender();
      }
      return;
    }
    if (this._hoverCell?.x !== cell.x || this._hoverCell?.y !== cell.y) {
      this._hoverCell = cell;
      if (this._anchor) { this._previewPoints = this.getPreview(cell); ctx.requestRender(); }
    }
  }

  public onPointerUp(ctx: ToolContext): void {
    if (this.mode === 2) { this._m2Up(ctx); return; }
    this._isDown = false;
    if (this._anchor) {
      this._previewPoints = this._hoverCell
        ? this.getPreview(this._hoverCell)
        : [{ x: this._anchor.x, y: this._anchor.y }];
      ctx.requestRender();
    }
  }

  public onDeactivate(ctx: ToolContext): void { this.reset(); ctx.requestRender(); }
  public override getCursor(): string { return 'crosshair'; }

  // ═══════════════════════════════════════════════════════
  //  Mode 2: fully gap-based
  // ═══════════════════════════════════════════════════════

  private _m2Down(x: number, y: number, ctx: ToolContext): void {
    const gap = CoordinateMapper.screenToGap(x, y, ctx.config);
    this._isDown = true;

    if (!gap) return; // clicked cell body — ignore for mode 2

    const color = ctx.config.drawColor;

    if (!this._m2HistorySaved) {
      ctx.history.saveState(ctx.model);
      this._m2HistorySaved = true;
    }

    if (this._anchorGap) {
      // Have anchor → try to fill gap line
      const line = computeGapLine(this._anchorGap, gap);
      if (line.length > 0) {
        for (const g of line) fillSingleGap(ctx.model, g, color);
      } else {
        // Incompatible line — just fill single gap
        fillSingleGap(ctx.model, gap, color);
      }
    } else {
      // First click — fill single gap
      fillSingleGap(ctx.model, gap, color);
    }

    this._anchorGap = { ...gap };
    this._hoverGap = null;
    this._previewGaps = [];
    ctx.requestRender();
  }

  private _m2Move(x: number, y: number, ctx: ToolContext): void {
    const gap = CoordinateMapper.screenToGap(x, y, ctx.config);
    const prevGap = this._hoverGap;
    this._hoverGap = gap;

    const changed = gap?.gx !== prevGap?.gx || gap?.gy !== prevGap?.gy || gap?.type !== prevGap?.type;
    if (!changed) return;

    if (this._isDown && gap) {
      // Drag painting — fill each new gap the cursor enters
      if (!this._m2HistorySaved) {
        ctx.history.saveState(ctx.model);
        this._m2HistorySaved = true;
      }
      fillSingleGap(ctx.model, gap, ctx.config.drawColor);
      this._anchorGap = { ...gap };
      this._previewGaps = [];
      ctx.requestRender();
      return;
    }

    // Hover preview (not dragging)
    if (this._anchorGap && gap) {
      const line = computeGapLine(this._anchorGap, gap);
      this._previewGaps = line.length > 0 ? line : [gap];
    } else {
      this._previewGaps = gap ? [gap] : [];
    }
    ctx.requestRender();
  }

  private _m2Up(ctx: ToolContext): void {
    this._isDown = false;
    this._m2HistorySaved = false;
    ctx.requestRender();
  }

  // ═══════════════════════════════════════════════════════
  //  Mode 1 & 3: cell segment drawing
  // ═══════════════════════════════════════════════════════

  private _drawCellSegment(from: CellCoord, to: CellCoord, ctx: ToolContext): void {
    const color = ctx.config.drawColor;
    const line = bresenham(from.x, from.y, to.x, to.y);
    for (let i = 0; i < line.length; i++) {
      const pt = line[i];
      if (ctx.model.isCellInBounds(pt.x, pt.y)) {
        ctx.model.setCell(pt.x, pt.y, 1);
        ctx.model.setCellColor(pt.x, pt.y, color);
      }
      if (i > 0) fillGapBetween(ctx.model, line[i - 1].x, line[i - 1].y, pt.x, pt.y, color);
      if (this.mode === 3) fillAroundCell(ctx.model, pt.x, pt.y, color);
    }
  }
}
