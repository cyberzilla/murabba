/**
 * Murabba - Flood Fill Tool
 * Implements an iterative stack-based depth-first flood fill algorithm across connected main cells.
 */

import { BaseTool, type ToolContext } from './BaseTool';
import { CoordinateMapper } from '../core/CoordinateMapper';
import type { CellCoord, ToolType } from '../types/grid';

/**
 * FillTool fills or un-fills connected 4-directional regions of main grid cells.
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
    const targetValue = ctx.model.getCell(startX, startY);
    // Toggle: if target cell is filled (1) -> unfill all connected (0); if empty (0) -> fill (1)
    const replacementValue = targetValue === 1 ? 0 : 1;
    const replacementColor = replacementValue === 1 ? ctx.config.drawColor : undefined;

    // Save history state once before mutating the grid
    ctx.history.saveState(ctx.model);

    const cols = ctx.model.cols;
    const rows = ctx.model.rows;
    const visited = new Set<number>();
    const stack: CellCoord[] = [{ x: startX, y: startY }];

    // Stack-based iterative DFS (non-recursive to prevent call-stack overflows on large grids)
    while (stack.length > 0) {
      const { x: cx, y: cy } = stack.pop()!;

      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) {
        continue;
      }

      const flatIndex = cy * cols + cx;
      if (visited.has(flatIndex)) {
        continue;
      }

      if (ctx.model.getCell(cx, cy) !== targetValue) {
        continue;
      }

      visited.add(flatIndex);

      ctx.model.setCell(cx, cy, replacementValue);
      if (replacementValue === 1 && replacementColor) {
        ctx.model.setCellColor(cx, cy, replacementColor);
      }

      // 4-directional connectivity: Up, Down, Left, Right
      stack.push({ x: cx, y: cy - 1 });
      stack.push({ x: cx, y: cy + 1 });
      stack.push({ x: cx - 1, y: cy });
      stack.push({ x: cx + 1, y: cy });
    }

    ctx.requestRender();
  }

  /**
   * Pointer move does not perform flood fills.
   */
  public onPointerMove(x: number, y: number, ctx: ToolContext): void {
    // Fill tool does not drag-fill
  }

  /**
   * Pointer up lifecycle callback.
   */
  public onPointerUp(ctx: ToolContext): void {
    // No-op
  }

  /**
   * CSS cursor for the flood fill tool.
   */
  public override getCursor(): string {
    return 'crosshair';
  }
}
