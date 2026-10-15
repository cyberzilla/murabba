/**
 * Murabba - Grid Renderer
 * Draws empty cells, filled cells with smart corner radius, filled gaps, and axis guides.
 */

import { CornerRadii, RenderConfig } from '../types/grid';
import { GridModel } from '../core/GridModel';
import {
  computeCellRadius,
  computeGapDRadius,
  computeGapHRadius,
  computeGapVRadius,
} from '../core/RadiusCalculator';

/**
 * Creates a rounded rectangle path on the canvas context using arcTo.
 * The path is constructed with closePath() but neither filled nor stroked.
 *
 * @param ctx Canvas 2D rendering context
 * @param x Top-left X coordinate in pixels
 * @param y Top-left Y coordinate in pixels
 * @param w Rectangle width in pixels
 * @param h Rectangle height in pixels
 * @param radii Corner radii tuple [top-left, top-right, bottom-right, bottom-left]
 */
export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radii: [number, number, number, number] | CornerRadii
): void {
  let [tl, tr, br, bl] = radii;

  // Sanitize negative radii
  tl = Math.max(0, tl);
  tr = Math.max(0, tr);
  br = Math.max(0, br);
  bl = Math.max(0, bl);

  // Fast-path: simple rectangle if all radii are 0
  if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    return;
  }

  // Prevent overlapping corner arcs by scaling down radii proportionally if needed
  const factor = Math.min(
    1,
    w / (tl + tr || 1),
    w / (bl + br || 1),
    h / (tl + bl || 1),
    h / (tr + br || 1)
  );

  if (factor < 1) {
    tl *= factor;
    tr *= factor;
    br *= factor;
    bl *= factor;
  }

  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/**
 * Draws empty cell rectangles to form the subtle background grid structure.
 *
 * @param ctx Canvas 2D rendering context
 * @param model Grid data model
 * @param config Rendering configuration
 */
export function renderEmptyCells(
  ctx: CanvasRenderingContext2D,
  model: GridModel,
  config: RenderConfig
): void {
  if (!config.emptyCellColor || config.emptyCellColor === 'transparent') {
    return;
  }

  const { cellSize, gapSize, padding, cellRadius } = config;
  const step = cellSize + gapSize;
  const emptyRadius = Math.min(cellRadius, Math.floor(cellSize / 2));
  const radii: CornerRadii = [emptyRadius, emptyRadius, emptyRadius, emptyRadius];

  ctx.fillStyle = config.emptyCellColor;

  for (let y = 0; y < model.rows; y++) {
    for (let x = 0; x < model.cols; x++) {
      if (model.isFilledCell(x, y)) {
        continue;
      }
      const px = padding + x * step;
      const py = padding + y * step;

      drawRoundedRect(ctx, px, py, cellSize, cellSize, radii);
      ctx.fill();
    }
  }
}

/**
 * Draws filled cells using per-cell custom colors and smart corner radii.
 *
 * @param ctx Canvas 2D rendering context
 * @param model Grid data model
 * @param config Rendering configuration
 */
export function renderFilledCells(
  ctx: CanvasRenderingContext2D,
  model: GridModel,
  config: RenderConfig
): void {
  const { cellSize, gapSize, padding, cellRadius, drawColor } = config;
  const step = cellSize + gapSize;

  for (let y = 0; y < model.rows; y++) {
    for (let x = 0; x < model.cols; x++) {
      if (!model.isFilledCell(x, y)) {
        continue;
      }

      const color = model.getCellColor(x, y) || drawColor;
      const radii = computeCellRadius(model, x, y, cellRadius);
      const px = padding + x * step;
      const py = padding + y * step;

      ctx.fillStyle = color;
      drawRoundedRect(ctx, px, py, cellSize, cellSize, radii);
      ctx.fill();
    }
  }
}

/**
 * Draws all filled gap elements (gapH, gapV, gapD) with their respective colors
 * and smart rounded corners.
 *
 * @param ctx Canvas 2D rendering context
 * @param model Grid data model
 * @param config Rendering configuration
 */
export function renderFilledGaps(
  ctx: CanvasRenderingContext2D,
  model: GridModel,
  config: RenderConfig
): void {
  const { cellSize, gapSize, padding, cellRadius, drawColor } = config;
  if (gapSize <= 0) {
    return;
  }
  const step = cellSize + gapSize;

  // 1. Horizontal Gaps (gapH) - between row gy and row gy + 1
  for (let gy = 0; gy < model.rows - 1; gy++) {
    for (let gx = 0; gx < model.cols; gx++) {
      if (!model.isFilledGapH(gx, gy)) {
        continue;
      }

      const color = model.getGapHColor(gx, gy) || drawColor;
      const radii = computeGapHRadius(model, gx, gy, cellRadius);
      const px = padding + gx * step;
      const py = padding + gy * step + cellSize;

      ctx.fillStyle = color;
      drawRoundedRect(ctx, px, py, cellSize, gapSize, radii);
      ctx.fill();
    }
  }

  // 2. Vertical Gaps (gapV) - between col gx and col gx + 1
  for (let gy = 0; gy < model.rows; gy++) {
    for (let gx = 0; gx < model.cols - 1; gx++) {
      if (!model.isFilledGapV(gx, gy)) {
        continue;
      }

      const color = model.getGapVColor(gx, gy) || drawColor;
      const radii = computeGapVRadius(model, gx, gy, cellRadius);
      const px = padding + gx * step + cellSize;
      const py = padding + gy * step;

      ctx.fillStyle = color;
      drawRoundedRect(ctx, px, py, gapSize, cellSize, radii);
      ctx.fill();
    }
  }

  // 3. Diagonal / Intersection Dots (gapD) - at col gx, row gy
  for (let gy = 0; gy < model.rows - 1; gy++) {
    for (let gx = 0; gx < model.cols - 1; gx++) {
      if (!model.isFilledGapD(gx, gy)) {
        continue;
      }

      const color = model.getGapDColor(gx, gy) || drawColor;
      const radii = computeGapDRadius(model, gx, gy, cellRadius, gapSize);
      const px = padding + gx * step + cellSize;
      const py = padding + gy * step + cellSize;

      ctx.fillStyle = color;
      drawRoundedRect(ctx, px, py, gapSize, gapSize, radii);
      ctx.fill();
    }
  }
}

/**
 * Draws axis guide lines across the grid at intervals defined by config.axisEvery.
 *
 * @param ctx Canvas 2D rendering context
 * @param model Grid data model
 * @param config Rendering configuration
 */
export function renderAxisLines(
  ctx: CanvasRenderingContext2D,
  model: GridModel,
  config: RenderConfig
): void {
  if (!config.showAxis || config.axisEvery <= 0) {
    return;
  }

  const { cellSize, gapSize, padding, axisColor, axisEvery } = config;
  const step = cellSize + gapSize;
  const totalW = model.cols * step - gapSize;
  const totalH = model.rows * step - gapSize;

  ctx.save();
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1;

  // Vertical guide lines
  for (let col = axisEvery; col < model.cols; col += axisEvery) {
    const lineX = Math.round(padding + col * step - gapSize / 2) + 0.5;
    ctx.beginPath();
    ctx.moveTo(lineX, padding);
    ctx.lineTo(lineX, padding + totalH);
    ctx.stroke();
  }

  // Horizontal guide lines
  for (let row = axisEvery; row < model.rows; row += axisEvery) {
    const lineY = Math.round(padding + row * step - gapSize / 2) + 0.5;
    ctx.beginPath();
    ctx.moveTo(padding, lineY);
    ctx.lineTo(padding + totalW, lineY);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Grouped GridRenderer namespace class providing static helper methods.
 */
export class GridRenderer {
  public static drawRoundedRect = drawRoundedRect;
  public static renderEmptyCells = renderEmptyCells;
  public static renderFilledCells = renderFilledCells;
  public static renderFilledGaps = renderFilledGaps;
  public static renderAxisLines = renderAxisLines;
}
