/**
 * Murabba - Draw & Erase Tool
 * Handles interactive drawing and erasing on grid cells, horizontal gaps, vertical gaps,
 * and diagonal corner dots with continuous pointer drag support.
 */

import { BaseTool, type ToolContext } from './BaseTool';
import { CoordinateMapper } from '../core/CoordinateMapper';
import type { HitResult, ToolType } from '../types/grid';
import { bresenhamLine } from '../utils/bresenham';

/**
 * Operating mode for the DrawTool: either drawing with the active color or erasing.
 */
export type DrawToolMode = 'draw' | 'erase';

/**
 * DrawTool implements both pencil/drawing and eraser behavior on grid cells and gap elements.
 */
export class DrawTool extends BaseTool {
  public mode: DrawToolMode;
  private _isDrawing: boolean = false;
  private _lastAppliedKey: string | null = null;
  private _hasSavedHistoryForStroke: boolean = false;
  private _lastCell: { x: number; y: number } | null = null;

  /**
   * Initializes a new DrawTool instance.
   *
   * @param mode Operating mode: 'draw' (default) or 'erase'
   */
  constructor(mode: DrawToolMode = 'draw') {
    super();
    this.mode = mode;
  }

  /**
   * Returns the current tool type ('draw' or 'erase').
   */
  public get type(): ToolType {
    return this.mode;
  }

  /**
   * Whether the tool is currently actively in a drawing/erasing stroke.
   */
  public get isDrawing(): boolean {
    return this._isDrawing;
  }

  /**
   * Handles pointer press to start a stroke and mutate the clicked cell/gap element.
   *
   * @param x Screen X position
   * @param y Screen Y position
   * @param ctx Tool execution context
   */
  public onPointerDown(x: number, y: number, ctx: ToolContext): void {
    this._isDrawing = true;
    this._lastAppliedKey = null;
    this._hasSavedHistoryForStroke = false;
    this._lastCell = null;

    const hit = CoordinateMapper.hitTest(x, y, ctx.config, ctx.model);
    if (hit) {
      this.ensureHistorySaved(ctx);
      this.applyHit(hit, ctx);
      this._lastAppliedKey = `${hit.type}:${hit.x},${hit.y}`;
      if (hit.type === 'cell') {
        this._lastCell = { x: hit.x, y: hit.y };
      }
      ctx.requestRender();
    }
  }

  /**
   * Handles pointer movement to continue drawing along a dragged path.
   * Interpolates cells using Bresenham line algorithm to prevent skipped cells on fast drag.
   *
   * @param x Screen X position
   * @param y Screen Y position
   * @param ctx Tool execution context
   */
  public onPointerMove(x: number, y: number, ctx: ToolContext): void {
    if (!this._isDrawing) {
      return;
    }

    const hit = CoordinateMapper.hitTest(x, y, ctx.config, ctx.model);
    if (!hit) {
      return;
    }

    if (hit.type === 'cell') {
      if (this._lastCell && (this._lastCell.x !== hit.x || this._lastCell.y !== hit.y)) {
        this.ensureHistorySaved(ctx);
        const points = bresenhamLine(this._lastCell.x, this._lastCell.y, hit.x, hit.y);
        for (const pt of points) {
          if (ctx.model.isCellInBounds(pt.x, pt.y)) {
            this.applyHit({ type: 'cell', x: pt.x, y: pt.y }, ctx);
          }
        }
        this._lastCell = { x: hit.x, y: hit.y };
        this._lastAppliedKey = `cell:${hit.x},${hit.y}`;
        ctx.requestRender();
      } else if (!this._lastCell) {
        const key = `cell:${hit.x},${hit.y}`;
        if (key !== this._lastAppliedKey) {
          this.ensureHistorySaved(ctx);
          this.applyHit(hit, ctx);
          this._lastAppliedKey = key;
          this._lastCell = { x: hit.x, y: hit.y };
          ctx.requestRender();
        }
      }
    } else {
      const key = `${hit.type}:${hit.x},${hit.y}`;
      if (key !== this._lastAppliedKey) {
        this.ensureHistorySaved(ctx);
        this.applyHit(hit, ctx);
        this._lastAppliedKey = key;
        ctx.requestRender();
      }
    }
  }

  /**
   * Handles pointer release to complete the current drawing stroke.
   *
   * @param ctx Tool execution context
   */
  public onPointerUp(_ctx: ToolContext): void {
    this._isDrawing = false;
    this._lastAppliedKey = null;
    this._hasSavedHistoryForStroke = false;
    this._lastCell = null;
  }

  /**
   * Cleans up drawing state when tool is deactivated.
   *
   * @param ctx Tool execution context
   */
  public onDeactivate(_ctx: ToolContext): void {
    this._isDrawing = false;
    this._lastAppliedKey = null;
    this._hasSavedHistoryForStroke = false;
    this._lastCell = null;
  }

  /**
   * CSS cursor for drawing or erasing.
   */
  public override getCursor(): string {
    return this.mode === 'erase' ? 'cell' : 'crosshair';
  }

  /**
   * Saves undo history state once at the start of a stroke.
   */
  private ensureHistorySaved(ctx: ToolContext): void {
    if (!this._hasSavedHistoryForStroke) {
      ctx.history.saveState(ctx.model);
      this._hasSavedHistoryForStroke = true;
    }
  }

  /**
   * Applies draw or erase mutation to the target cell or gap element.
   *
   * @param hit Result of hit test indicating element type and coordinates
   * @param ctx Tool execution context
   */
  private applyHit(hit: HitResult, ctx: ToolContext): void {
    const isErase = this.mode === 'erase';
    const color = isErase ? undefined : ctx.config.drawColor;

    switch (hit.type) {
      case 'cell': {
        const curVal = ctx.model.getCell(hit.x, hit.y);
        const curColor = ctx.model.getCellColor(hit.x, hit.y);
        if (isErase) {
          if (curVal !== 0) {
            ctx.model.setCell(hit.x, hit.y, 0);
          }
        } else {
          if (curVal !== 1 || curColor !== color) {
            ctx.model.setCell(hit.x, hit.y, 1);
            ctx.model.setCellColor(hit.x, hit.y, color);
          }
        }
        break;
      }

      case 'gapH': {
        const curVal = ctx.model.getGapH(hit.x, hit.y);
        const curColor = ctx.model.getGapHColor(hit.x, hit.y);
        if (isErase) {
          if (curVal !== 0) {
            ctx.model.setGapH(hit.x, hit.y, 0);
          }
        } else {
          if (curVal !== 1 || curColor !== color) {
            ctx.model.setGapH(hit.x, hit.y, 1);
            ctx.model.setGapHColor(hit.x, hit.y, color);
          }
        }
        break;
      }

      case 'gapV': {
        const curVal = ctx.model.getGapV(hit.x, hit.y);
        const curColor = ctx.model.getGapVColor(hit.x, hit.y);
        if (isErase) {
          if (curVal !== 0) {
            ctx.model.setGapV(hit.x, hit.y, 0);
          }
        } else {
          if (curVal !== 1 || curColor !== color) {
            ctx.model.setGapV(hit.x, hit.y, 1);
            ctx.model.setGapVColor(hit.x, hit.y, color);
          }
        }
        break;
      }

      case 'gapD': {
        const curVal = ctx.model.getGapD(hit.x, hit.y);
        const curColor = ctx.model.getGapDColor(hit.x, hit.y);
        if (isErase) {
          if (curVal !== 0) {
            ctx.model.setGapD(hit.x, hit.y, 0);
          }
        } else {
          if (curVal !== 1 || curColor !== color) {
            ctx.model.setGapD(hit.x, hit.y, 1);
            ctx.model.setGapDColor(hit.x, hit.y, color);
          }
        }
        break;
      }
    }
  }
}

/**
 * Dedicated EraseTool class pre-configured in erase mode.
 */
export class EraseTool extends DrawTool {
  constructor() {
    super('erase');
  }
}
