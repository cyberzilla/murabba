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
 *   - Dragging inside the frame auto-commits (cuts content) and moves it as a float.
 *   - Shift+dragging inside the frame repositions the selection frame only.
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
import { screenToCell, screenToElement, elementToPixelRect } from '../core/CoordinateMapper';
import type { ElementCoord } from '../core/CoordinateMapper';
import type { GridModel } from '../core/GridModel';
import {
  rotateSelectionCW,
  rotateSelectionCCW,
  flipSelectionH,
  flipSelectionV,
} from '../core/SelectionTransform';

export type SelectPhase = 'idle' | 'define' | 'float';
export type HandleType = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br';

const HANDLE_CURSORS: Record<HandleType, string> = {
  tl: 'nwse-resize', tc: 'ns-resize', tr: 'nesw-resize',
  ml: 'ew-resize',                     mr: 'ew-resize',
  bl: 'nesw-resize', bc: 'ns-resize', br: 'nwse-resize',
};

export class SelectTool extends BaseTool {
  readonly type: ToolType = 'select';

  private phase: SelectPhase = 'idle';

  // Selection rectangle bounds (in element coordinates — 2x grid)
  // Even = cell position, Odd = gap position
  private x1 = 0;
  private y1 = 0;
  private x2 = 0;
  private y2 = 0;

  // State flags for define phase
  private isDefining = false;

  /** Modifier key state — set by App before onPointerDown */
  shiftKey = false;

  // Frame dragging state
  private isDraggingFrame = false;
  private frameDragStartElement: ElementCoord | null = null;
  private dragStartBounds: { x1: number; y1: number; x2: number; y2: number } | null = null;

  // Floating selection state
  private floatData: SelectionData | null = null;
  private isDraggingFloat = false;
  private floatDragStartCell: CellCoord | null = null;
  private dragStartFloatOrigin: { ox: number; oy: number } | null = null;

  // Saved selection bounds before commit (for undo back to define phase)
  private preCommitBounds: { x1: number; y1: number; x2: number; y2: number } | null = null;

  // Resize handle state
  private isResizingFrame = false;
  private activeHandle: HandleType | null = null;
  private resizeStartBounds: { x1: number; y1: number; x2: number; y2: number } | null = null;

  // ─── BaseTool Overrides ──────────────────────────────────

  getCursor(): string {
    if (this.isResizingFrame && this.activeHandle) {
      return HANDLE_CURSORS[this.activeHandle];
    }
    if (this.isDraggingFloat || this.isDraggingFrame) {
      return 'grabbing';
    }
    if (this.phase === 'float') {
      return 'default';
    }
    return 'crosshair';
  }

  /**
   * Returns the appropriate cursor for the given hover position.
   * Called on every pointermove to provide interactive cursor feedback.
   */
  getHoverCursor(x: number, y: number, ctx: ToolContext): string {
    if (this.isResizingFrame && this.activeHandle) {
      return HANDLE_CURSORS[this.activeHandle];
    }
    if (this.isDraggingFloat || this.isDraggingFrame) {
      return 'grabbing';
    }

    const cell = this.getCellFromPos(x, y, ctx);
    if (!cell) return 'default';

    if (this.phase === 'float') {
      return this.isInsideFloat(cell.x, cell.y) ? 'grab' : 'default';
    }

    if (this.phase === 'define' && !this.isDefining) {
      // Check handles first
      const handle = this.getHandleAtScreenPos(x, y, ctx);
      if (handle) return HANDLE_CURSORS[handle];
      return this.isInsideFrame(cell.x, cell.y) ? 'grab' : 'crosshair';
    }

    return 'crosshair';
  }

  /**
   * Hit-test the 8 resize handles. Returns handle type or null.
   * Uses screen (pixel) coordinates for accurate hit detection.
   */
  private getHandleAtScreenPos(sx: number, sy: number, ctx: ToolContext): HandleType | null {
    if (this.phase !== 'define' || this.isDefining) return null;

    const bounds = this.getSelectionBounds();
    const tl = elementToPixelRect(bounds.x1, bounds.y1, ctx.config);
    const br = elementToPixelRect(bounds.x2, bounds.y2, ctx.config);

    const left = tl.x;
    const top = tl.y;
    const right = br.x + br.w;
    const bottom = br.y + br.h;
    const midX = (left + right) / 2;
    const midY = (top + bottom) / 2;

    // Convert screen coords to canvas coords
    const cx = (sx - ctx.config.panX);
    const cy = (sy - ctx.config.panY);

    const minDim = Math.min(right - left, bottom - top);
    const handleR = Math.max(3, Math.min(8, minDim * 0.18)) / 2 + 4; // hit radius = visual + 4px padding

    const handles: [HandleType, number, number][] = [
      ['tl', left, top],
      ['tc', midX, top],
      ['tr', right, top],
      ['ml', left, midY],
      ['mr', right, midY],
      ['bl', left, bottom],
      ['bc', midX, bottom],
      ['br', right, bottom],
    ];

    for (const [type, hx, hy] of handles) {
      const dx = cx - hx;
      const dy = cy - hy;
      if (dx * dx + dy * dy <= handleR * handleR) {
        return type;
      }
    }
    return null;
  }

  onPointerDown(x: number, y: number, ctx: ToolContext): void {
    const cell = this.getCellFromPos(x, y, ctx);
    const elem = this.getElementFromPos(x, y, ctx);

    // Case 1: FLOAT phase (uses cell coords — floatData is cell-based)
    if (this.phase === 'float') {
      if (cell && this.isInsideFloat(cell.x, cell.y)) {
        // Start dragging the floating content
        this.isDraggingFloat = true;
        this.floatDragStartCell = { x: cell.x, y: cell.y };
        if (this.floatData) {
          this.dragStartFloatOrigin = { ox: this.floatData.ox, oy: this.floatData.oy };
        }
      } else {
        // Clicked outside float: commit the float and return to idle
        this.stampFloat(ctx);
      }
      return;
    }

    // Case 2: DEFINE phase
    if (this.phase === 'define') {
      // Check resize handles first (priority over frame drag)
      const handle = this.getHandleAtScreenPos(x, y, ctx);
      if (handle) {
        this.isResizingFrame = true;
        this.activeHandle = handle;
        this.resizeStartBounds = this.getSelectionBounds();
        return;
      }

      if (elem && this.isInsideFrameElement(elem.ex, elem.ey)) {
        if (this.shiftKey) {
          // Shift+drag: move frame only (reposition selection rectangle)
          this.isDraggingFrame = true;
          this.frameDragStartElement = { ex: elem.ex, ey: elem.ey };
          this.dragStartBounds = this.getSelectionBounds();
        } else {
          // Normal drag: auto-commit selection → cut content → start float drag
          this.commitSelection(ctx);
          // commitSelection mutates phase to 'float' and sets floatData
          if (this.floatData && cell) {
            this.isDraggingFloat = true;
            this.floatDragStartCell = { x: cell.x, y: cell.y };
            this.dragStartFloatOrigin = { ox: this.floatData.ox, oy: this.floatData.oy };
          }
        }
        return;
      }

      // Pointer down OUTSIDE frame: cancel to idle
      if (!elem) {
        this.reset();
        ctx.requestRender();
        return;
      }
      this.reset();
      ctx.requestRender();
      return;
    }

    // Case 3: IDLE phase — start new selection using element coords
    if (!elem) return;
    this.phase = 'define';
    this.isDefining = true;
    this.x1 = elem.ex;
    this.y1 = elem.ey;
    this.x2 = elem.ex;
    this.y2 = elem.ey;
    ctx.requestRender();
  }

  onPointerMove(x: number, y: number, ctx: ToolContext): void {
    const cell = this.getCellFromPos(x, y, ctx);

    // Resizing the selection frame via handle drag
    if (this.isResizingFrame && this.activeHandle && this.resizeStartBounds) {
      const elem = this.getElementFromPos(x, y, ctx);
      if (!elem) return;
      const sb = this.resizeStartBounds;
      let { x1, y1, x2, y2 } = sb;

      // Update edges based on handle type
      const h = this.activeHandle;
      if (h === 'tl' || h === 'tc' || h === 'tr') y1 = Math.min(elem.ey, sb.y2);
      if (h === 'bl' || h === 'bc' || h === 'br') y2 = Math.max(elem.ey, sb.y1);
      if (h === 'tl' || h === 'ml' || h === 'bl') x1 = Math.min(elem.ex, sb.x2);
      if (h === 'tr' || h === 'mr' || h === 'br') x2 = Math.max(elem.ex, sb.x1);

      this.x1 = x1; this.y1 = y1;
      this.x2 = x2; this.y2 = y2;
      ctx.requestRender();
      return;
    }

    // Moving a floating selection (cell-based)
    if (
      this.phase === 'float' &&
      this.isDraggingFloat &&
      this.floatDragStartCell &&
      this.dragStartFloatOrigin &&
      this.floatData
    ) {
      if (!cell) return;
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

    // Moving an existing define selection frame (element-based)
    if (
      this.phase === 'define' &&
      this.isDraggingFrame &&
      this.frameDragStartElement &&
      this.dragStartBounds
    ) {
      const elem = this.getElementFromPos(x, y, ctx);
      if (!elem) return;
      const dx = elem.ex - this.frameDragStartElement.ex;
      const dy = elem.ey - this.frameDragStartElement.ey;
      const w = this.dragStartBounds.x2 - this.dragStartBounds.x1;
      const h = this.dragStartBounds.y2 - this.dragStartBounds.y1;
      const maxEx = (ctx.model.cols - 1) * 2 + 1;
      const maxEy = (ctx.model.rows - 1) * 2 + 1;
      const targetX1 = this.dragStartBounds.x1 + dx;
      const targetY1 = this.dragStartBounds.y1 + dy;
      const nx1 = Math.max(0, Math.min(maxEx - w, targetX1));
      const ny1 = Math.max(0, Math.min(maxEy - h, targetY1));
      this.x1 = nx1;
      this.y1 = ny1;
      this.x2 = nx1 + w;
      this.y2 = ny1 + h;
      ctx.requestRender();
      return;
    }

    // Dragging to define rectangle bounds (element-based)
    if (this.phase === 'define' && this.isDefining) {
      const elem = this.getElementFromPos(x, y, ctx);
      if (!elem) return;
      this.x2 = elem.ex;
      this.y2 = elem.ey;
      ctx.requestRender();
    }
  }

  onPointerUp(ctx: ToolContext): void {
    if (this.isResizingFrame) {
      this.isResizingFrame = false;
      this.activeHandle = null;
      this.resizeStartBounds = null;
      // Normalize bounds after resize
      const bounds = this.getSelectionBounds();
      this.x1 = bounds.x1;
      this.y1 = bounds.y1;
      this.x2 = bounds.x2;
      this.y2 = bounds.y2;
      ctx.requestRender();
      return;
    }

    if (this.isDraggingFloat) {
      this.isDraggingFloat = false;
      this.floatDragStartCell = null;
      this.dragStartFloatOrigin = null;
      ctx.requestRender();
      return;
    }

    if (this.isDraggingFrame) {
      this.isDraggingFrame = false;
      this.frameDragStartElement = null;
      this.dragStartBounds = null;
      ctx.requestRender();
      return;
    }

    if (this.isDefining) {
      this.isDefining = false;

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
    // Convert cell coords to element coords for comparison
    const ex = cellX * 2;
    const ey = cellY * 2;
    return ex >= x1 && ex <= x2 && ey >= y1 && ey <= y2;
  }

  /** Checks if given element coordinate is inside the current define frame. */
  isInsideFrameElement(ex: number, ey: number): boolean {
    if (this.phase !== 'define') return false;
    const { x1, y1, x2, y2 } = this.getSelectionBounds();
    return ex >= x1 && ex <= x2 && ey >= y1 && ey <= y2;
  }

  /** Checks if given cell coordinate is inside the current floating selection bounds. */
  isInsideFloat(cellX: number, cellY: number): boolean {
    if (this.phase !== 'float' || !this.floatData) return false;
    const d = this.floatData;
    return cellX >= d.ox && cellX < d.ox + d.w && cellY >= d.oy && cellY < d.oy + d.h;
  }

  /**
   * Enters float phase directly from external SelectionData (e.g. letter placement).
   * No grid content is cut — the float data is purely additive.
   * When stamped, content will be written to the grid with a history save.
   */
  startFloat(data: SelectionData, ctx: ToolContext): void {
    // If already in float, stamp current float first
    if (this.phase === 'float') {
      this.stampFloat(ctx);
    } else if (this.phase === 'define') {
      this.reset();
    }
    this.floatData = data;
    this.phase = 'float';
    this.preCommitBounds = null;
    ctx.requestRender();
  }

  /**
   * Commits the defined frame: extracts content from the grid, cuts original cells,
   * creates floating selection data, and enters the 'float' phase.
   * Uses element-level bounds for per-element granularity.
   */
  commitSelection(ctx: ToolContext): void {
    if (this.phase !== 'define') return;
    const { x1: ex1, y1: ey1, x2: ex2, y2: ey2 } = this.getSelectionBounds();
    const model = ctx.model;

    // Convert element bounds to cell ranges
    const cellX1 = Math.floor(ex1 / 2);
    const cellY1 = Math.floor(ey1 / 2);
    const cellX2 = Math.floor(ex2 / 2);
    const cellY2 = Math.floor(ey2 / 2);

    const cells: SelectionData['cells'] = [];
    const gH: SelectionData['gH'] = [];
    const gV: SelectionData['gV'] = [];
    const gD: SelectionData['gD'] = [];

    // Check each element type individually against element bounds
    for (let y = cellY1; y <= cellY2; y++) {
      for (let x = cellX1; x <= cellX2; x++) {
        const lx = x - cellX1;
        const ly = y - cellY1;
        // cell at element (2x, 2y)
        if (x * 2 >= ex1 && x * 2 <= ex2 && y * 2 >= ey1 && y * 2 <= ey2) {
          if (model.isFilledCell(x, y)) {
            cells.push({ lx, ly, c: model.getCellColor(x, y) || ctx.config.drawColor });
          }
        }
        // gapV at element (2x+1, 2y)
        if (x * 2 + 1 >= ex1 && x * 2 + 1 <= ex2 && y * 2 >= ey1 && y * 2 <= ey2) {
          if (model.isGapVInBounds(x, y) && model.isFilledGapV(x, y)) {
            gV.push({ lx, ly, c: model.getGapVColor(x, y) || ctx.config.drawColor });
          }
        }
        // gapH at element (2x, 2y+1)
        if (x * 2 >= ex1 && x * 2 <= ex2 && y * 2 + 1 >= ey1 && y * 2 + 1 <= ey2) {
          if (model.isGapHInBounds(x, y) && model.isFilledGapH(x, y)) {
            gH.push({ lx, ly, c: model.getGapHColor(x, y) || ctx.config.drawColor });
          }
        }
        // gapD at element (2x+1, 2y+1)
        if (x * 2 + 1 >= ex1 && x * 2 + 1 <= ex2 && y * 2 + 1 >= ey1 && y * 2 + 1 <= ey2) {
          if (model.isGapDInBounds(x, y) && model.isFilledGapD(x, y)) {
            gD.push({ lx, ly, c: model.getGapDColor(x, y) || ctx.config.drawColor });
          }
        }
      }
    }

    // If region contains no elements, cancel selection
    if (cells.length === 0 && gH.length === 0 && gV.length === 0 && gD.length === 0) {
      this.reset();
      ctx.requestRender();
      return;
    }

    // Save selection bounds for undo restoration
    this.preCommitBounds = { x1: ex1, y1: ey1, x2: ex2, y2: ey2 };

    // Save undo history before cutting
    ctx.history.saveState(model);

    // Clear only extracted elements from the grid
    for (let y = cellY1; y <= cellY2; y++) {
      for (let x = cellX1; x <= cellX2; x++) {
        if (x * 2 >= ex1 && x * 2 <= ex2 && y * 2 >= ey1 && y * 2 <= ey2) {
          model.setCell(x, y, 0);
          model.clearCellColor(x, y);
        }
        if (x * 2 + 1 >= ex1 && x * 2 + 1 <= ex2 && y * 2 >= ey1 && y * 2 <= ey2) {
          if (model.isGapVInBounds(x, y)) {
            model.setGapV(x, y, 0);
            model.clearGapVColor(x, y);
          }
        }
        if (x * 2 >= ex1 && x * 2 <= ex2 && y * 2 + 1 >= ey1 && y * 2 + 1 <= ey2) {
          if (model.isGapHInBounds(x, y)) {
            model.setGapH(x, y, 0);
            model.clearGapHColor(x, y);
          }
        }
        if (x * 2 + 1 >= ex1 && x * 2 + 1 <= ex2 && y * 2 + 1 >= ey1 && y * 2 + 1 <= ey2) {
          if (model.isGapDInBounds(x, y)) {
            model.setGapD(x, y, 0);
            model.clearGapDColor(x, y);
          }
        }
      }
    }

    this.floatData = {
      cells,
      gH,
      gV,
      gD,
      ox: cellX1,
      oy: cellY1,
      w: cellX2 - cellX1 + 1,
      h: cellY2 - cellY1 + 1,
    };
    this.phase = 'float';
    ctx.requestRender();
  }

  /**
   * Finalizes the floating selection at its current location by stamping into the grid.
   */
  stampFloat(ctx: ToolContext): void {
    if (!this.floatData || this.phase !== 'float') return;
    // For additive floats (e.g. letter placement via startFloat), save history
    // before stamping since there was no prior commitSelection that saved state.
    if (!this.preCommitBounds) {
      ctx.history.saveState(ctx.model);
    }
    this.stampToGrid(ctx.model, ctx.config.drawColor);
    this.reset();
    ctx.requestRender();
  }

  /**
   * Cancels the floating selection, reverting changes via history undo.
   * Restores the selection frame to define phase so the user can re-drag.
   */
  cancelFloat(ctx: ToolContext): void {
    if (this.phase !== 'float') return;
    this.undoFloat(ctx);
  }

  /**
   * Undoes the float: reverts the grid cut via history undo, then restores
   * the selection tool to define phase with the original selection bounds.
   * This allows the user to see the content back in place with the selection
   * frame still active (ready to drag again or modify).
   */
  undoFloat(ctx: ToolContext): void {
    if (this.phase !== 'float') return;

    if (this.preCommitBounds) {
      // Float from commitSelection: undo the grid cut and restore define phase
      ctx.history.undo(ctx.model);
      const b = this.preCommitBounds;
      this.phase = 'define';
      this.x1 = b.x1;
      this.y1 = b.y1;
      this.x2 = b.x2;
      this.y2 = b.y2;
      this.floatData = null;
      this.isDraggingFloat = false;
      this.floatDragStartCell = null;
      this.dragStartFloatOrigin = null;
      this.isDefining = false;
    } else {
      // Additive float (e.g. letter placement): just discard, no history to undo
      this.reset();
    }
    ctx.requestRender();
  }

  /**
   * Deletes all elements inside the selection frame (called on Delete/Backspace in define phase).
   */
  eraseRegion(ctx: ToolContext): void {
    if (this.phase !== 'define') return;
    const { x1: ex1, y1: ey1, x2: ex2, y2: ey2 } = this.getSelectionBounds();
    const model = ctx.model;
    const cellX1 = Math.floor(ex1 / 2);
    const cellY1 = Math.floor(ey1 / 2);
    const cellX2 = Math.floor(ex2 / 2);
    const cellY2 = Math.floor(ey2 / 2);

    ctx.history.saveState(model);

    for (let y = cellY1; y <= cellY2; y++) {
      for (let x = cellX1; x <= cellX2; x++) {
        if (x * 2 >= ex1 && x * 2 <= ex2 && y * 2 >= ey1 && y * 2 <= ey2) {
          model.setCell(x, y, 0);
          model.clearCellColor(x, y);
        }
        if (x * 2 + 1 >= ex1 && x * 2 + 1 <= ex2 && y * 2 >= ey1 && y * 2 <= ey2) {
          if (model.isGapVInBounds(x, y)) { model.setGapV(x, y, 0); model.clearGapVColor(x, y); }
        }
        if (x * 2 >= ex1 && x * 2 <= ex2 && y * 2 + 1 >= ey1 && y * 2 + 1 <= ey2) {
          if (model.isGapHInBounds(x, y)) { model.setGapH(x, y, 0); model.clearGapHColor(x, y); }
        }
        if (x * 2 + 1 >= ex1 && x * 2 + 1 <= ex2 && y * 2 + 1 >= ey1 && y * 2 + 1 <= ey2) {
          if (model.isGapDInBounds(x, y)) { model.setGapD(x, y, 0); model.clearGapDColor(x, y); }
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
    const { x1: ex1, y1: ey1, x2: ex2, y2: ey2 } = this.getSelectionBounds();
    const model = ctx.model;
    const cellX1 = Math.floor(ex1 / 2);
    const cellY1 = Math.floor(ey1 / 2);
    const cellX2 = Math.floor(ex2 / 2);
    const cellY2 = Math.floor(ey2 / 2);

    ctx.history.saveState(model);

    for (let y = cellY1; y <= cellY2; y++) {
      for (let x = cellX1; x <= cellX2; x++) {
        if (x * 2 >= ex1 && x * 2 <= ex2 && y * 2 >= ey1 && y * 2 <= ey2) {
          if (model.isFilledCell(x, y)) model.setCellColor(x, y, color);
        }
        if (x * 2 + 1 >= ex1 && x * 2 + 1 <= ex2 && y * 2 >= ey1 && y * 2 <= ey2) {
          if (model.isGapVInBounds(x, y) && model.isFilledGapV(x, y)) model.setGapVColor(x, y, color);
        }
        if (x * 2 >= ex1 && x * 2 <= ex2 && y * 2 + 1 >= ey1 && y * 2 + 1 <= ey2) {
          if (model.isGapHInBounds(x, y) && model.isFilledGapH(x, y)) model.setGapHColor(x, y, color);
        }
        if (x * 2 + 1 >= ex1 && x * 2 + 1 <= ex2 && y * 2 + 1 >= ey1 && y * 2 + 1 <= ey2) {
          if (model.isGapDInBounds(x, y) && model.isFilledGapD(x, y)) model.setGapDColor(x, y, color);
        }
      }
    }

    ctx.requestRender();
  }

  /**
   * Moves the selection frame (element coords) or the floating selection by delta.
   * For define phase, nudge moves by 1 element position.
   */
  nudge(dx: number, dy: number, ctx: ToolContext): void {
    if (this.phase === 'define') {
      const bounds = this.getSelectionBounds();
      const w = bounds.x2 - bounds.x1;
      const h = bounds.y2 - bounds.y1;
      const maxEx = (ctx.model.cols - 1) * 2 + 1;
      const maxEy = (ctx.model.rows - 1) * 2 + 1;
      const nx1 = Math.max(0, Math.min(maxEx - w, bounds.x1 + dx));
      const ny1 = Math.max(0, Math.min(maxEy - h, bounds.y1 + dy));
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
   * Rotates the floating selection 90° clockwise.
   */
  rotateFloat(ctx: ToolContext): void {
    if (!this.floatData || this.phase !== 'float') return;
    this.floatData = rotateSelectionCW(this.floatData);
    this.clampFloatOrigin(ctx);
    ctx.requestRender();
  }

  /**
   * Rotates the floating selection 90° counter-clockwise.
   */
  rotateFloatCCW(ctx: ToolContext): void {
    if (!this.floatData || this.phase !== 'float') return;
    this.floatData = rotateSelectionCCW(this.floatData);
    this.clampFloatOrigin(ctx);
    ctx.requestRender();
  }

  /**
   * Flips the floating selection horizontally (left ↔ right).
   */
  flipFloatH(ctx: ToolContext): void {
    if (!this.floatData || this.phase !== 'float') return;
    this.floatData = flipSelectionH(this.floatData);
    ctx.requestRender();
  }

  /**
   * Flips the floating selection vertically (top ↔ bottom).
   */
  flipFloatV(ctx: ToolContext): void {
    if (!this.floatData || this.phase !== 'float') return;
    this.floatData = flipSelectionV(this.floatData);
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

    this.isDraggingFrame = false;
    this.frameDragStartElement = null;
    this.dragStartBounds = null;

    this.floatData = null;
    this.isDraggingFloat = false;
    this.floatDragStartCell = null;
    this.dragStartFloatOrigin = null;
    this.preCommitBounds = null;

    this.isResizingFrame = false;
    this.activeHandle = null;
    this.resizeStartBounds = null;
  }

  // ─── Private Helpers ─────────────────────────────────────

  /**
   * Clamps float origin so the selection stays within grid bounds.
   * Called after rotation since dimensions (w, h) may have swapped.
   */
  private clampFloatOrigin(ctx: ToolContext): void {
    if (!this.floatData) return;
    const d = this.floatData;
    const maxOx = Math.max(0, ctx.model.cols - d.w);
    const maxOy = Math.max(0, ctx.model.rows - d.h);
    d.ox = Math.max(0, Math.min(maxOx, d.ox));
    d.oy = Math.max(0, Math.min(maxOy, d.oy));
  }

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
   * Resolves screen coordinates to element coordinates (2x grid).
   * Used for selection bounds at per-element granularity.
   */
  private getElementFromPos(x: number, y: number, ctx: ToolContext): ElementCoord | null {
    const el = screenToElement(x, y, ctx.config);
    if (el) {
      const maxEx = (ctx.model.cols - 1) * 2 + 1; // last gapV column
      const maxEy = (ctx.model.rows - 1) * 2 + 1; // last gapH row
      return {
        ex: Math.max(0, Math.min(maxEx, el.ex)),
        ey: Math.max(0, Math.min(maxEy, el.ey)),
      };
    }

    // Fallback: continuous calculation for dragging
    const zoom = ctx.config.zoom || 1;
    const wx = (x - ctx.config.panX) / zoom - ctx.config.padding;
    const wy = (y - ctx.config.panY) / zoom - ctx.config.padding;
    const step = ctx.config.cellSize + ctx.config.gapSize;
    if (step <= 0) return null;

    const col = Math.floor(wx / step);
    const row = Math.floor(wy / step);
    const localX = wx - col * step;
    const localY = wy - row * step;
    const inCellX = localX <= ctx.config.cellSize;
    const inCellY = localY <= ctx.config.cellSize;
    const ex = inCellX ? col * 2 : col * 2 + 1;
    const ey = inCellY ? row * 2 : row * 2 + 1;

    const maxEx = (ctx.model.cols - 1) * 2 + 1;
    const maxEy = (ctx.model.rows - 1) * 2 + 1;

    if (this.isDefining || this.isDraggingFrame) {
      return {
        ex: Math.max(0, Math.min(maxEx, ex)),
        ey: Math.max(0, Math.min(maxEy, ey)),
      };
    }

    if (ex >= 0 && ex <= maxEx && ey >= 0 && ey <= maxEy) {
      return { ex, ey };
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
