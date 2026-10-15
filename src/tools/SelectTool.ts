/**
 * SelectTool — Marquee selection with define and float phases.
 *
 * Phase 'idle':
 *   - No selection active.
 *   - Cursor: crosshair.
 *
 * Phase 'define':
 *   - User drags to create a marquee rectangle.
 *   - Frame persists on screen after release.
 *   - Dragging inside the frame repositions/moves the selection frame.
 *   - Clicking outside the frame cancels the selection and returns to idle.
 *   - Enter commits (extracts/cuts content into a floating selection).
 *   - Delete / Backspace erases content in the selection region.
 *   - Escape cancels the selection.
 *   - Changing colors recolors all elements in the selection.
 *
 * Phase 'float':
 *   - Content is cut from the grid and rendered as a floating ghost preview.
 *   - Dragging moves the floating selection across the grid.
 *   - Arrow keys nudge the float.
 *   - Enter stamps (finalizes at current position) and returns to idle.
 *   - Escape cancels the float and undoes the cut.
 *   - Switching away from this tool automatically stamps the float.
 */

import { BaseTool, ToolContext } from './BaseTool';
import type { ToolType, SelectionData, CellCoord } from '../types/grid';
import { screenToCell } from '../core/CoordinateMapper';
import type { GridModel } from '../core/GridModel';

export type SelectPhase = 'idle' | 'define' | 'float';

export class SelectTool extends BaseTool {
  readonly type: ToolType = 'select';

  private phase: SelectPhase = 'idle';

  // Selection rectangle bounds (in cell coordinates)
  private x1 = 0;
  private y1 = 0;
  private x2 = 0;
  private y2 = 0;

  // State flags for define phase
  private isDefining = false;
  private wasInDefine = false;
  private hasMoved = false;

  // Frame dragging state
  private isDraggingFrame = false;
  private frameDragStartCell: CellCoord | null = null;
  private dragStartBounds: { x1: number; y1: number; x2: number; y2: number } | null = null;

  // Floating selection state
  private floatData: SelectionData | null = null;
  private isDraggingFloat = false;
  private floatDragStartCell: CellCoord | null = null;
  private dragStartFloatOrigin: { ox: number; oy: number } | null = null;

  // ─── BaseTool Overrides ──────────────────────────────────

  getCursor(): string {
    if (this.phase === 'float' || this.isDraggingFrame) {
      return 'move';
    }
    return 'crosshair';
  }

  onPointerDown(x: number, y: number, ctx: ToolContext): void {
    const cell = this.getCellFromPos(x, y, ctx);

    // Case 1: FLOAT phase
    if (this.phase === 'float') {
      if (cell && this.isInsideFloat(cell.x, cell.y)) {
        // Start dragging the floating content
        this.isDraggingFloat = true;
        this.floatDragStartCell = { x: cell.x, y: cell.y };
        if (this.floatData) {
          this.dragStartFloatOrigin = { ox: this.floatData.ox, oy: this.floatData.oy };
        }
      } else {
        // Clicked outside float: finalize current float and either start defining or idle
        this.stampFloat(ctx);
        if (cell) {
          this.phase = 'define';
          this.isDefining = true;
          this.wasInDefine = false;
          this.hasMoved = false;
          this.x1 = cell.x;
          this.y1 = cell.y;
          this.x2 = cell.x;
          this.y2 = cell.y;
          ctx.requestRender();
        }
      }
      return;
    }

    // Case 2: DEFINE phase
    if (this.phase === 'define') {
      if (cell && this.isInsideFrame(cell.x, cell.y)) {
        // Pointer down INSIDE frame: start dragging the frame
        this.isDraggingFrame = true;
        this.frameDragStartCell = { x: cell.x, y: cell.y };
        this.dragStartBounds = this.getSelectionBounds();
        return;
      }

      // Pointer down OUTSIDE frame:
      // If clicked outside active grid bounds, cancel to idle
      if (!cell) {
        this.reset();
        ctx.requestRender();
        return;
      }

      // Pointer down OUTSIDE frame: cancel selection, go back to idle
      this.reset();
      ctx.requestRender();
      return;
    }

    // Case 3: IDLE phase
    if (!cell) return;
    this.phase = 'define';
    this.isDefining = true;
    this.wasInDefine = false;
    this.hasMoved = false;
    this.x1 = cell.x;
    this.y1 = cell.y;
    this.x2 = cell.x;
    this.y2 = cell.y;
    ctx.requestRender();
  }

  onPointerMove(x: number, y: number, ctx: ToolContext): void {
    const cell = this.getCellFromPos(x, y, ctx);
    if (!cell) return;

    // Moving a floating selection
    if (
      this.phase === 'float' &&
      this.isDraggingFloat &&
      this.floatDragStartCell &&
      this.dragStartFloatOrigin &&
      this.floatData
    ) {
      const dx = cell.x - this.floatDragStartCell.x;
      const dy = cell.y - this.floatDragStartCell.y;
      const targetOx = this.dragStartFloatOrigin.ox + dx;
      const targetOy = this.dragStartFloatOrigin.oy + dy;
      const maxOx = Math.max(0, ctx.model.cols - this.floatData.w);
      const maxOy = Math.max(0, ctx.model.rows - this.floatData.h);
      this.floatData.ox = Math.max(0, Math.min(maxOx, targetOx));
      this.floatData.oy = Math.max(0, Math.min(maxOy, targetOy));
      ctx.requestRender();
      return;
    }

    // Moving an existing define selection frame
    if (
      this.phase === 'define' &&
      this.isDraggingFrame &&
      this.frameDragStartCell &&
      this.dragStartBounds
    ) {
      const dx = cell.x - this.frameDragStartCell.x;
      const dy = cell.y - this.frameDragStartCell.y;
      const w = this.dragStartBounds.x2 - this.dragStartBounds.x1;
      const h = this.dragStartBounds.y2 - this.dragStartBounds.y1;
      const targetX1 = this.dragStartBounds.x1 + dx;
      const targetY1 = this.dragStartBounds.y1 + dy;
      const nx1 = Math.max(0, Math.min(ctx.model.cols - 1 - w, targetX1));
      const ny1 = Math.max(0, Math.min(ctx.model.rows - 1 - h, targetY1));
      this.x1 = nx1;
      this.y1 = ny1;
      this.x2 = nx1 + w;
      this.y2 = ny1 + h;
      ctx.requestRender();
      return;
    }

    // Dragging to define rectangle bounds
    if (this.phase === 'define' && this.isDefining) {
      if (cell.x !== this.x1 || cell.y !== this.y1) {
        this.hasMoved = true;
      }
      this.x2 = cell.x;
      this.y2 = cell.y;
      ctx.requestRender();
    }
  }

  onPointerUp(ctx: ToolContext): void {
    if (this.isDraggingFloat) {
      this.isDraggingFloat = false;
      this.floatDragStartCell = null;
      this.dragStartFloatOrigin = null;
      ctx.requestRender();
      return;
    }

    if (this.isDraggingFrame) {
      this.isDraggingFrame = false;
      this.frameDragStartCell = null;
      this.dragStartBounds = null;
      ctx.requestRender();
      return;
    }

    if (this.isDefining) {
      this.isDefining = false;

      // Clicking outside the frame without dragging cancels the selection and returns to idle
      if (this.wasInDefine && !this.hasMoved) {
        this.reset();
        ctx.requestRender();
        return;
      }

      // Normalize bounds so x1 <= x2 and y1 <= y2, frame stays visible
      const bounds = this.getSelectionBounds();
      this.x1 = bounds.x1;
      this.y1 = bounds.y1;
      this.x2 = bounds.x2;
      this.y2 = bounds.y2;
      this.phase = 'define';
      ctx.requestRender();
    }
  }

  onDeactivate(ctx: ToolContext): void {
    if (this.phase === 'float') {
      this.stampFloat(ctx);
    }
    this.reset();
  }

  // ─── Public Selection Methods ────────────────────────────

  /** Current lifecycle phase of the selection tool. */
  getPhase(): SelectPhase {
    return this.phase;
  }

  /** Normalized bounding coordinates { x1, y1, x2, y2 } of the selection frame. */
  getSelectionBounds(): { x1: number; y1: number; x2: number; y2: number } {
    return {
      x1: Math.min(this.x1, this.x2),
      y1: Math.min(this.y1, this.y2),
      x2: Math.max(this.x1, this.x2),
      y2: Math.max(this.y1, this.y2),
    };
  }

  /** Current floating selection ghost data, or null if not in float phase. */
  getFloatData(): SelectionData | null {
    return this.floatData;
  }

  /** Checks if given cell coordinate is inside the current define frame. */
  isInsideFrame(cellX: number, cellY: number): boolean {
    if (this.phase !== 'define') return false;
    const { x1, y1, x2, y2 } = this.getSelectionBounds();
    return cellX >= x1 && cellX <= x2 && cellY >= y1 && cellY <= y2;
  }

  /** Checks if given cell coordinate is inside the current floating selection bounds. */
  isInsideFloat(cellX: number, cellY: number): boolean {
    if (this.phase !== 'float' || !this.floatData) return false;
    const d = this.floatData;
    return cellX >= d.ox && cellX < d.ox + d.w && cellY >= d.oy && cellY < d.oy + d.h;
  }

  /**
   * Commits the defined frame: extracts content from the grid, cuts original cells,
   * creates floating selection data, and enters the 'float' phase.
   */
  commitSelection(ctx: ToolContext): void {
    if (this.phase !== 'define') return;
    const { x1, y1, x2, y2 } = this.getSelectionBounds();
    const model = ctx.model;

    const cells: SelectionData['cells'] = [];
    const gH: SelectionData['gH'] = [];
    const gV: SelectionData['gV'] = [];
    const gD: SelectionData['gD'] = [];

    // Collect cells and gaps from defined region.
    // Only collect a gap if BOTH endpoint cells are inside the selection bounds:
    //   gapH(x,y) connects (x,y)↔(x,y+1)  → only if y+1 <= y2
    //   gapV(x,y) connects (x,y)↔(x+1,y)  → only if x+1 <= x2
    //   gapD(x,y) connects 4 corners        → only if x+1 <= x2 AND y+1 <= y2
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const lx = x - x1;
        const ly = y - y1;
        if (model.isFilledCell(x, y)) {
          cells.push({ lx, ly, c: model.getCellColor(x, y) || ctx.config.drawColor });
        }
        // gapV at (x,y) → right side, only if x+1 is also inside selection
        if (x + 1 <= x2 && model.isGapVInBounds(x, y) && model.isFilledGapV(x, y)) {
          gV.push({ lx, ly, c: model.getGapVColor(x, y) || ctx.config.drawColor });
        }
        // gapH at (x,y) → bottom side, only if y+1 is also inside selection
        if (y + 1 <= y2 && model.isGapHInBounds(x, y) && model.isFilledGapH(x, y)) {
          gH.push({ lx, ly, c: model.getGapHColor(x, y) || ctx.config.drawColor });
        }
        // gapD at (x,y) → bottom-right corner, only if both x+1 and y+1 inside selection
        if (x + 1 <= x2 && y + 1 <= y2 && model.isGapDInBounds(x, y) && model.isFilledGapD(x, y)) {
          gD.push({ lx, ly, c: model.getGapDColor(x, y) || ctx.config.drawColor });
        }
      }
    }

    // If region contains no elements, cancel selection
    if (cells.length === 0 && gH.length === 0 && gV.length === 0 && gD.length === 0) {
      this.reset();
      ctx.requestRender();
      return;
    }

    // Save undo history before cutting
    ctx.history.saveState(model);

    // Clear original extracted elements from the grid
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        model.setCell(x, y, 0);
        model.clearCellColor(x, y);
        if (x + 1 <= x2 && model.isGapVInBounds(x, y)) {
          model.setGapV(x, y, 0);
          model.clearGapVColor(x, y);
        }
        if (y + 1 <= y2 && model.isGapHInBounds(x, y)) {
          model.setGapH(x, y, 0);
          model.clearGapHColor(x, y);
        }
        if (x + 1 <= x2 && y + 1 <= y2 && model.isGapDInBounds(x, y)) {
          model.setGapD(x, y, 0);
          model.clearGapDColor(x, y);
        }
      }
    }

    this.floatData = {
      cells,
      gH,
      gV,
      gD,
      ox: x1,
      oy: y1,
      w: x2 - x1 + 1,
      h: y2 - y1 + 1,
    };
    this.phase = 'float';
    ctx.requestRender();
  }

  /**
   * Finalizes the floating selection at its current location by stamping into the grid.
   */
  stampFloat(ctx: ToolContext): void {
    if (!this.floatData || this.phase !== 'float') return;
    this.stampToGrid(ctx.model, ctx.config.drawColor);
    this.reset();
    ctx.requestRender();
  }

  /**
   * Cancels the floating selection, reverting changes via history undo.
   */
  cancelFloat(ctx: ToolContext): void {
    if (this.phase !== 'float') return;
    ctx.history.undo(ctx.model);
    this.reset();
    ctx.requestRender();
  }

  /**
   * Deletes all elements inside the selection frame (called on Delete/Backspace in define phase).
   */
  eraseRegion(ctx: ToolContext): void {
    if (this.phase !== 'define') return;
    const { x1, y1, x2, y2 } = this.getSelectionBounds();
    const model = ctx.model;

    ctx.history.saveState(model);

    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        model.setCell(x, y, 0);
        model.clearCellColor(x, y);
        if (x + 1 <= x2 && model.isGapVInBounds(x, y)) {
          model.setGapV(x, y, 0);
          model.clearGapVColor(x, y);
        }
        if (y + 1 <= y2 && model.isGapHInBounds(x, y)) {
          model.setGapH(x, y, 0);
          model.clearGapHColor(x, y);
        }
        if (x + 1 <= x2 && y + 1 <= y2 && model.isGapDInBounds(x, y)) {
          model.setGapD(x, y, 0);
          model.clearGapDColor(x, y);
        }
      }
    }

    this.reset();
    ctx.requestRender();
  }

  /**
   * Recolors all filled elements inside the selection frame.
   */
  recolorRegion(color: string, ctx: ToolContext): void {
    if (this.phase !== 'define') return;
    const { x1, y1, x2, y2 } = this.getSelectionBounds();
    const model = ctx.model;

    ctx.history.saveState(model);

    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        if (model.isFilledCell(x, y)) {
          model.setCellColor(x, y, color);
        }
        if (x + 1 <= x2 && model.isGapVInBounds(x, y) && model.isFilledGapV(x, y)) {
          model.setGapVColor(x, y, color);
        }
        if (y + 1 <= y2 && model.isGapHInBounds(x, y) && model.isFilledGapH(x, y)) {
          model.setGapHColor(x, y, color);
        }
        if (x + 1 <= x2 && y + 1 <= y2 && model.isGapDInBounds(x, y) && model.isFilledGapD(x, y)) {
          model.setGapDColor(x, y, color);
        }
      }
    }

    ctx.requestRender();
  }

  /**
   * Moves the selection frame (in define phase) or the floating selection (in float phase) by delta cells.
   */
  nudge(dx: number, dy: number, ctx: ToolContext): void {
    if (this.phase === 'define') {
      const bounds = this.getSelectionBounds();
      const w = bounds.x2 - bounds.x1;
      const h = bounds.y2 - bounds.y1;
      const nx1 = Math.max(0, Math.min(ctx.model.cols - 1 - w, bounds.x1 + dx));
      const ny1 = Math.max(0, Math.min(ctx.model.rows - 1 - h, bounds.y1 + dy));
      this.x1 = nx1;
      this.y1 = ny1;
      this.x2 = nx1 + w;
      this.y2 = ny1 + h;
      ctx.requestRender();
    } else if (this.phase === 'float') {
      this.moveFloat(dx, dy, ctx);
    }
  }

  /**
   * Moves the floating selection by delta cells, clamped to grid bounds.
   */
  moveFloat(dx: number, dy: number, ctx: ToolContext): void {
    if (!this.floatData || this.phase !== 'float') return;
    const d = this.floatData;
    const maxOx = Math.max(0, ctx.model.cols - d.w);
    const maxOy = Math.max(0, ctx.model.rows - d.h);
    d.ox = Math.max(0, Math.min(maxOx, d.ox + dx));
    d.oy = Math.max(0, Math.min(maxOy, d.oy + dy));
    ctx.requestRender();
  }

  /**
   * Resets the tool state to idle.
   */
  reset(): void {
    this.phase = 'idle';
    this.x1 = 0;
    this.y1 = 0;
    this.x2 = 0;
    this.y2 = 0;
    this.isDefining = false;
    this.wasInDefine = false;
    this.hasMoved = false;

    this.isDraggingFrame = false;
    this.frameDragStartCell = null;
    this.dragStartBounds = null;

    this.floatData = null;
    this.isDraggingFloat = false;
    this.floatDragStartCell = null;
    this.dragStartFloatOrigin = null;
  }

  // ─── Private Helpers ─────────────────────────────────────

  /**
   * Resolves screen coordinates to discrete cell coordinates.
   * Uses screenToCell and handles gap/boundary continuous fallback during drags.
   */
  private getCellFromPos(x: number, y: number, ctx: ToolContext): CellCoord | null {
    const cell = screenToCell(x, y, ctx.config);
    if (cell) {
      return {
        x: Math.max(0, Math.min(ctx.model.cols - 1, cell.x)),
        y: Math.max(0, Math.min(ctx.model.rows - 1, cell.y)),
      };
    }

    // In a gap or outside padding: continuous calculation
    const zoom = ctx.config.zoom || 1;
    const wx = (x - ctx.config.panX) / zoom - ctx.config.padding;
    const wy = (y - ctx.config.panY) / zoom - ctx.config.padding;
    const step = ctx.config.cellSize + ctx.config.gapSize;
    if (step <= 0) return null;

    const col = Math.floor(wx / step);
    const row = Math.floor(wy / step);

    // If actively dragging (defining rectangle, moving frame, or moving float),
    // clamp to grid boundaries so dragging to edges works smoothly even over gaps/padding.
    if (this.isDefining || this.isDraggingFrame || this.isDraggingFloat) {
      return {
        x: Math.max(0, Math.min(ctx.model.cols - 1, col)),
        y: Math.max(0, Math.min(ctx.model.rows - 1, row)),
      };
    }

    // For pointer-down initiation, only return if strictly within active grid dimensions
    if (col >= 0 && col < ctx.model.cols && row >= 0 && row < ctx.model.rows) {
      return { x: col, y: row };
    }

    return null;
  }

  /**
   * Stamps floating selection elements into the grid model.
   */
  private stampToGrid(model: GridModel, fallbackColor: string): void {
    const d = this.floatData;
    if (!d) return;

    d.cells.forEach(({ lx, ly, c }) => {
      const x = d.ox + lx;
      const y = d.oy + ly;
      if (model.isCellInBounds(x, y)) {
        model.setCell(x, y, 1);
        model.setCellColor(x, y, c || fallbackColor);
      }
    });

    d.gH.forEach(({ lx, ly, c }) => {
      const x = d.ox + lx;
      const y = d.oy + ly;
      if (model.isGapHInBounds(x, y)) {
        model.setGapH(x, y, 1);
        model.setGapHColor(x, y, c || fallbackColor);
      }
    });

    d.gV.forEach(({ lx, ly, c }) => {
      const x = d.ox + lx;
      const y = d.oy + ly;
      if (model.isGapVInBounds(x, y)) {
        model.setGapV(x, y, 1);
        model.setGapVColor(x, y, c || fallbackColor);
      }
    });

    d.gD.forEach(({ lx, ly, c }) => {
      const x = d.ox + lx;
      const y = d.oy + ly;
      if (model.isGapDInBounds(x, y)) {
        model.setGapD(x, y, 1);
        model.setGapDColor(x, y, c || fallbackColor);
      }
    });
  }
}
