/**
 * Murabba - Flood Fill Tool
 * Implements an iterative stack-based depth-first flood fill algorithm across connected main cells.
 */

import { BaseTool, type ToolContext } from './BaseTool';
import { CoordinateMapper } from '../core/CoordinateMapper';
import type { GridModel } from '../core/GridModel';
import type { CellCoord, ToolType } from '../types/grid';

/**
 * FillTool fills, recolors, or erases connected 4-directional regions of main grid cells and connected gaps.
 */
export class FillTool extends BaseTool {
  public readonly type: ToolType = 'fill';

  /**
   * Performs an iterative DFS flood fill starting from the cell under the pointer.
   *
   * @param x Screen X position
   * @param y Screen Y position
   * @param ctx Tool execution context
   */
  public onPointerDown(x: number, y: number, ctx: ToolContext): void {
    // Determine the cell clicked (ignoring gaps)
    const hit = CoordinateMapper.hitTest(x, y, ctx.config, ctx.model);
    let startCell: CellCoord | null = null;

    if (hit && hit.type === 'cell') {
      startCell = { x: hit.x, y: hit.y };
    } else {
      startCell = CoordinateMapper.screenToCell(x, y, ctx.config);
    }

    if (!startCell || !ctx.model.isCellInBounds(startCell.x, startCell.y)) {
      return;
    }

    const startX = startCell.x;
    const startY = startCell.y;

    // Only operate on filled cells — ignore empty cells
    if (ctx.model.getCell(startX, startY) !== 1) return;

    const activeColor = ctx.config.drawColor;

    // Save history state once before mutating the grid
    ctx.history.saveState(ctx.model);

    // Recolor the entire connected region (cells + gaps)
    this.floodFillConnected(ctx.model, startX, startY, activeColor);

    ctx.requestRender();
  }

  /**
   * Iterative DFS flood fill that recolors ALL connected filled cells + gaps.
   * Spreads through filled gap bridges (gapH/gapV) to find all physically
   * connected cells, regardless of their current color.
   */
  private floodFillConnected(
    model: GridModel,
    startX: number,
    startY: number,
    newColor: string
  ): void {
    const cols = model.cols;
    const rows = model.rows;

    const visited = new Set<number>();
    const stack: CellCoord[] = [{ x: startX, y: startY }];
    const affectedCells: CellCoord[] = [];

    while (stack.length > 0) {
      const { x: cx, y: cy } = stack.pop()!;

      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;

      const flatIndex = cy * cols + cx;
      if (visited.has(flatIndex)) continue;

      // Only spread to filled cells
      if (model.getCell(cx, cy) !== 1) continue;

      visited.add(flatIndex);
      affectedCells.push({ x: cx, y: cy });

      // Recolor this cell
      model.setCellColor(cx, cy, newColor);

      // Spread to neighbors connected via filled gap bridges
      // Up: cell(cx, cy-1) via gapH(cx, cy-1)
      if (cy > 0 && model.isGapHInBounds(cx, cy - 1) && model.isFilledGapH(cx, cy - 1)) {
        stack.push({ x: cx, y: cy - 1 });
      }
      // Down: cell(cx, cy+1) via gapH(cx, cy)
      if (cy < rows - 1 && model.isGapHInBounds(cx, cy) && model.isFilledGapH(cx, cy)) {
        stack.push({ x: cx, y: cy + 1 });
      }
      // Left: cell(cx-1, cy) via gapV(cx-1, cy)
      if (cx > 0 && model.isGapVInBounds(cx - 1, cy) && model.isFilledGapV(cx - 1, cy)) {
        stack.push({ x: cx - 1, y: cy });
      }
      // Right: cell(cx+1, cy) via gapV(cx, cy)
      if (cx < cols - 1 && model.isGapVInBounds(cx, cy) && model.isFilledGapV(cx, cy)) {
        stack.push({ x: cx + 1, y: cy });
      }
    }

    // Recolor all gaps between affected cells
    this.recolorConnectedGaps(model, affectedCells, newColor);
  }


  /**
   * Recolors ALL filled gaps touching any cell in the recolored region.
   */
  private recolorConnectedGaps(model: GridModel, recoloredCells: CellCoord[], newColor: string): void {
    for (const { x, y } of recoloredCells) {
      // gapH below
      if (model.isGapHInBounds(x, y) && model.isFilledGapH(x, y)) {
        model.setGapHColor(x, y, newColor);
      }
      // gapH above
      if (model.isGapHInBounds(x, y - 1) && model.isFilledGapH(x, y - 1)) {
        model.setGapHColor(x, y - 1, newColor);
      }
      // gapV right
      if (model.isGapVInBounds(x, y) && model.isFilledGapV(x, y)) {
        model.setGapVColor(x, y, newColor);
      }
      // gapV left
      if (model.isGapVInBounds(x - 1, y) && model.isFilledGapV(x - 1, y)) {
        model.setGapVColor(x - 1, y, newColor);
      }
      // Corner dots around (x,y)
      for (const { gx, gy } of [
        { gx: x - 1, gy: y - 1 }, { gx: x, gy: y - 1 },
        { gx: x - 1, gy: y },     { gx: x, gy: y },
      ]) {
        if (model.isGapDInBounds(gx, gy) && model.isFilledGapD(gx, gy)) {
          model.setGapDColor(gx, gy, newColor);
        }
      }
    }
  }

  /**
   * Pointer move does not perform flood fills.
   */
  public onPointerMove(_x: number, _y: number, _ctx: ToolContext): void {
    // Fill tool does not drag-fill
  }

  /**
   * Pointer up lifecycle callback.
   */
  public onPointerUp(_ctx: ToolContext): void {
    // No-op
  }

  /**
   * CSS cursor for the flood fill tool.
   */
  public override getCursor(): string {
    return 'crosshair';
  }
}
