/**
 * Murabba - Coordinate Mapper
 * Translates between screen pixel space, world canvas space, and discrete grid cell/gap indices.
 */

import {
  CellCoord,
  GapCoord,
  HitResult,
  Point,
  Rect,
  RenderConfig,
  ScreenCoord,
} from '../types/grid';
import { GridModel } from './GridModel';

/**
 * Transforms a point from screen pixel space to world canvas coordinate space.
 *
 * @param screenX Pixel X on canvas element
 * @param screenY Pixel Y on canvas element
 * @param config Current render configuration
 * @returns Point in world coordinate space
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  config: RenderConfig
): Point {
  const zoom = config.zoom || 1;
  return {
    x: (screenX - config.panX) / zoom,
    y: (screenY - config.panY) / zoom,
  };
}

/**
 * Transforms a point from world canvas coordinate space to screen pixel space.
 *
 * @param worldX World X coordinate
 * @param worldY World Y coordinate
 * @param config Current render configuration
 * @returns Screen pixel coordinate
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  config: RenderConfig
): Point {
  const zoom = config.zoom || 1;
  return {
    x: config.panX + worldX * zoom,
    y: config.panY + worldY * zoom,
  };
}

/**
 * Converts screen pixel coordinates to a grid cell coordinate (CellCoord).
 * Returns null if the pointer is within a gap or before the padding boundary.
 *
 * @param screenX Screen X pixel position
 * @param screenY Screen Y pixel position
 * @param config Current render configuration
 * @returns CellCoord if inside a cell body, otherwise null
 */
export function screenToCell(
  screenX: number,
  screenY: number,
  config: RenderConfig
): CellCoord | null {
  const world = screenToWorld(screenX, screenY, config);
  const relX = world.x - config.padding;
  const relY = world.y - config.padding;

  if (relX < 0 || relY < 0) {
    return null;
  }

  const step = config.cellSize + config.gapSize;
  if (step <= 0) {
    return null;
  }

  const col = Math.floor(relX / step);
  const row = Math.floor(relY / step);

  const localX = relX - col * step;
  const localY = relY - row * step;

  // Verify pointer is strictly within the cell rectangle and not in the trailing gap
  if (localX <= config.cellSize && localY <= config.cellSize) {
    return { x: col, y: row };
  }

  return null;
}

/**
 * Like screenToCell but also maps gap/dot areas to their owning cell.
 * Always returns a cell coordinate as long as the pointer is within the grid area.
 * Useful for tools like Brush that should work on gaps too.
 *
 * @param screenX Screen X pixel position
 * @param screenY Screen Y pixel position
 * @param config Current render configuration
 * @returns CellCoord mapped from any position (cell, gap, or dot), or null if outside grid
 */
export function screenToCellLoose(
  screenX: number,
  screenY: number,
  config: RenderConfig
): CellCoord | null {
  const world = screenToWorld(screenX, screenY, config);
  const relX = world.x - config.padding;
  const relY = world.y - config.padding;

  if (relX < 0 || relY < 0) {
    return null;
  }

  const step = config.cellSize + config.gapSize;
  if (step <= 0) {
    return null;
  }

  const col = Math.floor(relX / step);
  const row = Math.floor(relY / step);

  return { x: col, y: row };
}

/**
 * Converts screen pixel coordinates to a gap coordinate (GapCoord).
 * Returns null if the pointer is within a main cell or before the padding boundary.
 *
 * @param screenX Screen X pixel position
 * @param screenY Screen Y pixel position
 * @param config Current render configuration
 * @returns GapCoord if inside a gap (h, v, or d), otherwise null
 */
export function screenToGap(
  screenX: number,
  screenY: number,
  config: RenderConfig
): GapCoord | null {
  const world = screenToWorld(screenX, screenY, config);
  const relX = world.x - config.padding;
  const relY = world.y - config.padding;

  if (relX < 0 || relY < 0) {
    return null;
  }

  const step = config.cellSize + config.gapSize;
  if (step <= 0) {
    return null;
  }

  const gx = Math.floor(relX / step);
  const gy = Math.floor(relY / step);

  const localX = relX - gx * step;
  const localY = relY - gy * step;

  const inGapX = localX > config.cellSize;
  const inGapY = localY > config.cellSize;

  // Horizontal gap (between vertical rows)
  if (!inGapX && inGapY) {
    return { gx, gy, type: 'h' };
  }

  // Vertical gap (between horizontal columns)
  if (inGapX && !inGapY) {
    return { gx, gy, type: 'v' };
  }

  // Diagonal / corner dot gap
  if (inGapX && inGapY) {
    return { gx, gy, type: 'd' };
  }

  // Inside cell body
  return null;
}

/**
 * Maps cell coordinate (x, y) to top-left screen pixel position.
 *
 * @param x Column index of cell
 * @param y Row index of cell
 * @param config Current render configuration
 * @returns Screen pixel coordinates { px, py }
 */
export function cellToScreen(
  x: number,
  y: number,
  config: RenderConfig
): ScreenCoord {
  const step = config.cellSize + config.gapSize;
  const worldX = config.padding + x * step;
  const worldY = config.padding + y * step;
  const zoom = config.zoom || 1;

  return {
    px: config.panX + worldX * zoom,
    py: config.panY + worldY * zoom,
  };
}

/**
 * Gets the bounding rectangle of a cell at (x, y) in world coordinates.
 *
 * @param x Column index
 * @param y Row index
 * @param config Current render configuration
 * @returns Rect in world coordinates
 */
export function getCellRect(
  x: number,
  y: number,
  config: RenderConfig
): Rect {
  const step = config.cellSize + config.gapSize;
  return {
    x: config.padding + x * step,
    y: config.padding + y * step,
    w: config.cellSize,
    h: config.cellSize,
  };
}

/**
 * Gets the bounding rectangle of a horizontal gap at (gx, gy) in world coordinates.
 *
 * @param gx Column index
 * @param gy Row index (between row gy and gy+1)
 * @param config Current render configuration
 * @returns Rect in world coordinates
 */
export function getGapHRect(
  gx: number,
  gy: number,
  config: RenderConfig
): Rect {
  const step = config.cellSize + config.gapSize;
  return {
    x: config.padding + gx * step,
    y: config.padding + gy * step + config.cellSize,
    w: config.cellSize,
    h: config.gapSize,
  };
}

/**
 * Gets the bounding rectangle of a vertical gap at (gx, gy) in world coordinates.
 *
 * @param gx Column index (between col gx and gx+1)
 * @param gy Row index
 * @param config Current render configuration
 * @returns Rect in world coordinates
 */
export function getGapVRect(
  gx: number,
  gy: number,
  config: RenderConfig
): Rect {
  const step = config.cellSize + config.gapSize;
  return {
    x: config.padding + gx * step + config.cellSize,
    y: config.padding + gy * step,
    w: config.gapSize,
    h: config.cellSize,
  };
}

/**
 * Gets the bounding rectangle of a corner dot gap at (gx, gy) in world coordinates.
 *
 * @param gx Column index
 * @param gy Row index
 * @param config Current render configuration
 * @returns Rect in world coordinates
 */
export function getGapDRect(
  gx: number,
  gy: number,
  config: RenderConfig
): Rect {
  const step = config.cellSize + config.gapSize;
  return {
    x: config.padding + gx * step + config.cellSize,
    y: config.padding + gy * step + config.cellSize,
    w: config.gapSize,
    h: config.gapSize,
  };
}

/**
 * Gets the bounding rectangle of a cell at (x, y) in screen pixel coordinates.
 *
 * @param x Column index
 * @param y Row index
 * @param config Current render configuration
 * @returns Rect in screen coordinates
 */
export function getCellScreenRect(
  x: number,
  y: number,
  config: RenderConfig
): Rect {
  const rect = getCellRect(x, y, config);
  const zoom = config.zoom || 1;
  return {
    x: config.panX + rect.x * zoom,
    y: config.panY + rect.y * zoom,
    w: rect.w * zoom,
    h: rect.h * zoom,
  };
}

/**
 * Gets the bounding rectangle of a horizontal gap at (gx, gy) in screen pixel coordinates.
 */
export function getGapHScreenRect(
  gx: number,
  gy: number,
  config: RenderConfig
): Rect {
  const rect = getGapHRect(gx, gy, config);
  const zoom = config.zoom || 1;
  return {
    x: config.panX + rect.x * zoom,
    y: config.panY + rect.y * zoom,
    w: rect.w * zoom,
    h: rect.h * zoom,
  };
}

/**
 * Gets the bounding rectangle of a vertical gap at (gx, gy) in screen pixel coordinates.
 */
export function getGapVScreenRect(
  gx: number,
  gy: number,
  config: RenderConfig
): Rect {
  const rect = getGapVRect(gx, gy, config);
  const zoom = config.zoom || 1;
  return {
    x: config.panX + rect.x * zoom,
    y: config.panY + rect.y * zoom,
    w: rect.w * zoom,
    h: rect.h * zoom,
  };
}

/**
 * Gets the bounding rectangle of a corner dot gap at (gx, gy) in screen pixel coordinates.
 */
export function getGapDScreenRect(
  gx: number,
  gy: number,
  config: RenderConfig
): Rect {
  const rect = getGapDRect(gx, gy, config);
  const zoom = config.zoom || 1;
  return {
    x: config.panX + rect.x * zoom,
    y: config.panY + rect.y * zoom,
    w: rect.w * zoom,
    h: rect.h * zoom,
  };
}

/**
 * Performs a comprehensive hit test against the grid model from a screen position.
 * Returns the hit element type ('cell' | 'gapH' | 'gapV' | 'gapD') and its coordinates,
 * or null if the position falls outside active bounds or padding.
 *
 * @param screenX Pointer X on screen/canvas
 * @param screenY Pointer Y on screen/canvas
 * @param config Current render configuration
 * @param model GridModel containing grid dimensions
 * @returns HitResult object or null
 */
export function hitTest(
  screenX: number,
  screenY: number,
  config: RenderConfig,
  model: GridModel
): HitResult | null {
  const world = screenToWorld(screenX, screenY, config);
  const relX = world.x - config.padding;
  const relY = world.y - config.padding;

  if (relX < 0 || relY < 0) {
    return null;
  }

  const step = config.cellSize + config.gapSize;
  if (step <= 0) {
    return null;
  }

  const col = Math.floor(relX / step);
  const row = Math.floor(relY / step);

  const localX = relX - col * step;
  const localY = relY - row * step;

  const inCellX = localX <= config.cellSize;
  const inCellY = localY <= config.cellSize;

  // 1. Cell hit
  if (inCellX && inCellY) {
    if (model.isCellInBounds(col, row)) {
      return { type: 'cell', x: col, y: row };
    }
    return null;
  }

  // 2. Horizontal gap hit (between row and row + 1)
  if (inCellX && !inCellY) {
    if (model.isGapHInBounds(col, row)) {
      return { type: 'gapH', x: col, y: row };
    }
    return null;
  }

  // 3. Vertical gap hit (between col and col + 1)
  if (!inCellX && inCellY) {
    if (model.isGapVInBounds(col, row)) {
      return { type: 'gapV', x: col, y: row };
    }
    return null;
  }

  // 4. Diagonal dot hit
  if (!inCellX && !inCellY) {
    if (model.isGapDInBounds(col, row)) {
      return { type: 'gapD', x: col, y: row };
    }
    return null;
  }

  return null;
}

/**
 * Element coordinate in the expanded 2x grid.
 * Even indices map to cells, odd to gaps:
 *   (2*x,   2*y)   → cell(x,y)
 *   (2*x+1, 2*y)   → gapV(x,y)
 *   (2*x,   2*y+1) → gapH(x,y)
 *   (2*x+1, 2*y+1) → gapD(x,y)
 */
export interface ElementCoord {
  ex: number;
  ey: number;
}

/**
 * Converts screen pixel coordinates to element coordinate in the 2x grid.
 * This gives per-element granularity (cells, gapV, gapH, gapD each addressable).
 */
export function screenToElement(
  screenX: number,
  screenY: number,
  config: RenderConfig
): ElementCoord | null {
  const world = screenToWorld(screenX, screenY, config);
  const relX = world.x - config.padding;
  const relY = world.y - config.padding;

  if (relX < 0 || relY < 0) return null;

  const step = config.cellSize + config.gapSize;
  if (step <= 0) return null;

  const col = Math.floor(relX / step);
  const row = Math.floor(relY / step);

  const localX = relX - col * step;
  const localY = relY - row * step;

  const inCellX = localX <= config.cellSize;
  const inCellY = localY <= config.cellSize;

  const ex = inCellX ? col * 2 : col * 2 + 1;
  const ey = inCellY ? row * 2 : row * 2 + 1;

  return { ex, ey };
}

/**
 * Converts an element coordinate to its pixel rectangle in world space.
 * Used for rendering selection frames at element granularity.
 */
export function elementToPixelRect(
  ex: number,
  ey: number,
  config: RenderConfig
): Rect {
  const total = config.cellSize + config.gapSize;
  const cs = config.cellSize;
  const gs = config.gapSize;
  const pad = config.padding;

  const cellX = Math.floor(ex / 2);
  const cellY = Math.floor(ey / 2);
  const isGapX = ex % 2 === 1;
  const isGapY = ey % 2 === 1;

  return {
    x: pad + cellX * total + (isGapX ? cs : 0),
    y: pad + cellY * total + (isGapY ? cs : 0),
    w: isGapX ? gs : cs,
    h: isGapY ? gs : cs,
  };
}

/**
 * CoordinateMapper namespace containing all coordinate translation utilities.
 */
export const CoordinateMapper = {
  screenToWorld,
  worldToScreen,
  screenToCell,
  screenToCellLoose,
  screenToGap,
  cellToScreen,
  getCellRect,
  getGapHRect,
  getGapVRect,
  getGapDRect,
  getCellScreenRect,
  getGapHScreenRect,
  getGapVScreenRect,
  getGapDScreenRect,
  hitTest,
  screenToElement,
  elementToPixelRect,
};

export default CoordinateMapper;
