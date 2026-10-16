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
    const targetValue = ctx.model.getCell(startX, startY);
    const targetColor = ctx.model.getCellColor(startX, startY) || ctx.config.drawColor;
    const activeColor = ctx.config.drawColor;

    // Save history state once before mutating the grid
    ctx.history.saveState(ctx.model);

    if (targetValue === 1 && targetColor === activeColor) {
      // Same color: ERASE the region (toggle off)
      this.floodFill(ctx.model, startX, startY, 0, null, targetColor, activeColor);
    } else if (targetValue === 1) {
      // Different color: RECOLOR the region
      this.floodFill(ctx.model, startX, startY, 1, activeColor, targetColor, activeColor);
    } else {
      // Empty cell: FILL with active color
      this.floodFill(ctx.model, startX, startY, 1, activeColor, null, activeColor);
    }

    ctx.requestRender();
  }

  /**
   * Iterative stack-based DFS flood fill for cell regions.
   * Only spreads to neighboring cells that are connected via filled gap bridges (gapH/gapV).
   * Cells without a gap bridge between them are NOT considered connected.
   */
  private floodFill(
    model: GridModel,
    startX: number,
    startY: number,
    replacementValue: number,
    replacementColor: string | null,
    targetColor: string | null,
    fallbackColor: string
  ): void {
    const cols = model.cols;
    const rows = model.rows;
    const targetValue = model.getCell(startX, startY);

    if (replacementValue === targetValue) {
      if (replacementValue === 0) return;
      if (replacementColor === targetColor) return;
    }

    const visited = new Set<number>();
    const stack: CellCoord[] = [{ x: startX, y: startY }];
    const affectedCells: CellCoord[] = [];

    while (stack.length > 0) {
      const { x: cx, y: cy } = stack.pop()!;

      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) {
        continue;
      }

      const flatIndex = cy * cols + cx;
      if (visited.has(flatIndex)) {
        continue;
      }

      const cellVal = model.getCell(cx, cy);
      if (cellVal !== targetValue) {
        continue;
      }

      if (targetValue === 1 && targetColor !== null) {
        const cellColor = model.getCellColor(cx, cy) || fallbackColor;
        if (cellColor !== targetColor) {
          continue;
        }
      }

      visited.add(flatIndex);
      affectedCells.push({ x: cx, y: cy });

      model.setCell(cx, cy, replacementValue);
      if (replacementValue === 1 && replacementColor) {
        model.setCellColor(cx, cy, replacementColor);
      }

      // Only spread to neighbors connected via gap bridges
      // Up: cell(cx, cy-1) connected via gapH(cx, cy-1)
      if (cy > 0 && model.isGapHInBounds(cx, cy - 1) && model.isFilledGapH(cx, cy - 1)) {
        stack.push({ x: cx, y: cy - 1 });
      }
      // Down: cell(cx, cy+1) connected via gapH(cx, cy)
      if (cy < rows - 1 && model.isGapHInBounds(cx, cy) && model.isFilledGapH(cx, cy)) {
        stack.push({ x: cx, y: cy + 1 });
      }
      // Left: cell(cx-1, cy) connected via gapV(cx-1, cy)
      if (cx > 0 && model.isGapVInBounds(cx - 1, cy) && model.isFilledGapV(cx - 1, cy)) {
        stack.push({ x: cx - 1, y: cy });
      }
      // Right: cell(cx+1, cy) connected via gapV(cx, cy)
      if (cx < cols - 1 && model.isGapVInBounds(cx, cy) && model.isFilledGapV(cx, cy)) {
        stack.push({ x: cx + 1, y: cy });
      }
    }

    if (replacementValue === 0) {
      this.cleanupGapsAfterErase(model, affectedCells);
    } else if (replacementValue === 1 && replacementColor && targetColor !== null) {
      this.recolorConnectedGaps(model, affectedCells, replacementColor);
    }
  }

  /**
   * Clears any gaps that connect only to cells being erased (where both connecting cells are now empty).
   */
  private cleanupGapsAfterErase(model: GridModel, erasedCells: CellCoord[]): void {
    for (const cell of erasedCells) {
      const { x, y } = cell;

      // gapH above: (x, y - 1) connecting (x, y - 1) and (x, y)
      if (model.isGapHInBounds(x, y - 1)) {
        if (model.getCell(x, y - 1) === 0 && model.getCell(x, y) === 0) {
          model.setGapH(x, y - 1, 0);
        }
      }

      // gapH below: (x, y) connecting (x, y) and (x, y + 1)
      if (model.isGapHInBounds(x, y)) {
        if (model.getCell(x, y) === 0 && model.getCell(x, y + 1) === 0) {
          model.setGapH(x, y, 0);
        }
      }

      // gapV left: (x - 1, y) connecting (x - 1, y) and (x, y)
      if (model.isGapVInBounds(x - 1, y)) {
        if (model.getCell(x - 1, y) === 0 && model.getCell(x, y) === 0) {
          model.setGapV(x - 1, y, 0);
        }
      }

      // gapV right: (x, y) connecting (x, y) and (x + 1, y)
      if (model.isGapVInBounds(x, y)) {
        if (model.getCell(x, y) === 0 && model.getCell(x + 1, y) === 0) {
          model.setGapV(x, y, 0);
        }
      }

      // Corner dots around (x, y)
      const dotCoords = [
        { gx: x - 1, gy: y - 1 },
        { gx: x, gy: y - 1 },
        { gx: x - 1, gy: y },
        { gx: x, gy: y },
      ];

      for (const { gx, gy } of dotCoords) {
        if (model.isGapDInBounds(gx, gy) && model.isFilledGapD(gx, gy)) {
          const c00 = model.getCell(gx, gy);
          const c10 = model.getCell(gx + 1, gy);
          const c01 = model.getCell(gx, gy + 1);
          const c11 = model.getCell(gx + 1, gy + 1);
          if (c00 === 0 && c10 === 0 && c01 === 0 && c11 === 0) {
            model.setGapD(gx, gy, 0);
          }
        }
      }
    }
  }

  /**
   * Recolors connected gaps between cells in the recolored region to the new color.
   */
  private recolorConnectedGaps(model: GridModel, recoloredCells: CellCoord[], newColor: string): void {
    for (const cell of recoloredCells) {
      const { x, y } = cell;

      if (model.isGapHInBounds(x, y) && model.isFilledGapH(x, y)) {
        if (model.getCell(x, y) === 1 && model.getCell(x, y + 1) === 1) {
          model.setGapHColor(x, y, newColor);
        }
      }

      if (model.isGapHInBounds(x, y - 1) && model.isFilledGapH(x, y - 1)) {
        if (model.getCell(x, y - 1) === 1 && model.getCell(x, y) === 1) {
          model.setGapHColor(x, y - 1, newColor);
        }
      }

      if (model.isGapVInBounds(x, y) && model.isFilledGapV(x, y)) {
        if (model.getCell(x, y) === 1 && model.getCell(x + 1, y) === 1) {
          model.setGapVColor(x, y, newColor);
        }
      }

      if (model.isGapVInBounds(x - 1, y) && model.isFilledGapV(x - 1, y)) {
        if (model.getCell(x - 1, y) === 1 && model.getCell(x, y) === 1) {
          model.setGapVColor(x - 1, y, newColor);
        }
      }

      const dotCoords = [
        { gx: x - 1, gy: y - 1 },
        { gx: x, gy: y - 1 },
        { gx: x - 1, gy: y },
        { gx: x, gy: y },
      ];

      for (const { gx, gy } of dotCoords) {
        if (model.isGapDInBounds(gx, gy) && model.isFilledGapD(gx, gy)) {
          const c00 = model.getCell(gx, gy);
          const c10 = model.getCell(gx + 1, gy);
          const c01 = model.getCell(gx, gy + 1);
          const c11 = model.getCell(gx + 1, gy + 1);
          if (c00 === 1 || c10 === 1 || c01 === 1 || c11 === 1) {
            model.setGapDColor(gx, gy, newColor);
          }
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
