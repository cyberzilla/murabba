/**
 * Sub-cell mark renderer for special letter marks (kaf-s, hamzah).
 * Draws marks as negative space (background-colored paths) over filled cells.
 */

import type { CellMark, RenderConfig } from '../types/grid';

/**
 * Renders all marks on the canvas.
 * Should be called AFTER cells and gaps are rendered.
 *
 * @param ctx - Canvas 2D context (already has pan/zoom transform applied)
 * @param marks - Array of CellMark entries to render
 * @param config - Render configuration with cellSize, gapSize, canvasBgColor
 */
export function renderMarks(
  ctx: CanvasRenderingContext2D,
  marks: CellMark[],
  config: RenderConfig
): void {
  if (!marks || marks.length === 0) return;

  for (const mark of marks) {
    switch (mark.type) {
      case 'kaf-s':
        drawKafS(ctx, mark.col, mark.row, config);
        break;
      case 'hamzah':
        drawHamzah(ctx, mark.col, mark.row, config);
        break;
    }
  }
}

/**
 * Draws the Kaf S-mark (zigzag) as negative space within a 2×2 cell area.
 * The visual area is 3×3 (cell-gap-cell in each axis).
 * The S-pattern is carved by drawing background-colored shapes.
 *
 * S-pattern (5 horizontal bands):
 * ┌───────┐
 * │ ▓▓▓▓▓ │  band 0: top horizontal bar
 * │     ▓ │  band 1: right vertical
 * │ ▓▓▓▓▓ │  band 2: middle horizontal bar
 * │ ▓     │  band 3: left vertical
 * │ ▓▓▓▓▓ │  band 4: bottom horizontal bar
 * └───────┘
 */
function drawKafS(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  config: RenderConfig
): void {
  const { cellSize, gapSize, canvasBgColor, padding } = config;

  // Full area of 2×2 cells including gap
  const areaW = 2 * cellSize + gapSize;
  const areaH = 2 * cellSize + gapSize;

  // Top-left pixel position of the 2×2 cell block
  const x0 = padding + col * (cellSize + gapSize);
  const y0 = padding + row * (cellSize + gapSize);

  // S-mark dimensions — inset from the cell edges
  const inset = Math.max(1, Math.round(cellSize * 0.15));
  const lineW = Math.max(1, Math.round(cellSize * 0.2));

  const sx = x0 + inset;
  const sy = y0 + inset;
  const sw = areaW - 2 * inset;
  const sh = areaH - 2 * inset;

  // Divide into 5 horizontal bands
  const bandH = sh / 5;

  ctx.fillStyle = canvasBgColor;

  // Band 0: top horizontal bar
  ctx.fillRect(sx, sy, sw, lineW);

  // Band 1: right vertical connector
  ctx.fillRect(sx + sw - lineW, sy, lineW, bandH * 2);

  // Band 2: middle horizontal bar
  ctx.fillRect(sx, sy + bandH * 2 - lineW / 2, sw, lineW);

  // Band 3: left vertical connector
  ctx.fillRect(sx, sy + bandH * 2, lineW, bandH * 2);

  // Band 4: bottom horizontal bar
  ctx.fillRect(sx, sy + sh - lineW, sw, lineW);
}

/**
 * Draws the Hamzah mark (ء) as a small symbol within a 1×1 cell.
 * Rendered as a simple angular mark using background color lines.
 *
 * Hamzah pattern (simplified geometric):
 *   ┌─┐
 *   │ │
 *   └─┘
 *    \
 */
function drawHamzah(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  config: RenderConfig
): void {
  const { cellSize, gapSize, canvasBgColor, padding } = config;

  // Cell pixel position
  const x0 = padding + col * (cellSize + gapSize);
  const y0 = padding + row * (cellSize + gapSize);

  const inset = Math.max(1, Math.round(cellSize * 0.2));
  const lineW = Math.max(1, Math.round(cellSize * 0.15));

  ctx.fillStyle = canvasBgColor;

  // Small square cut-out in the upper portion
  const sqSize = cellSize - 2 * inset;
  const sqX = x0 + inset;
  const sqY = y0 + inset;

  // Top bar
  ctx.fillRect(sqX, sqY, sqSize, lineW);
  // Right bar
  ctx.fillRect(sqX + sqSize - lineW, sqY, lineW, sqSize * 0.6);
  // Left bar
  ctx.fillRect(sqX, sqY, lineW, sqSize * 0.6);
  // Bottom bar (shorter, middle section)
  ctx.fillRect(sqX, sqY + sqSize * 0.6 - lineW, sqSize * 0.7, lineW);

  // Diagonal tail (bottom-right descender)
  const tailX = sqX + sqSize * 0.5;
  const tailY = sqY + sqSize * 0.6;
  const tailLen = sqSize * 0.35;

  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tailX + tailLen, tailY + tailLen);
  ctx.lineTo(tailX + tailLen - lineW, tailY + tailLen);
  ctx.lineTo(tailX - lineW * 0.5, tailY);
  ctx.closePath();
  ctx.fill();
}

/**
 * Renders marks on a letter preview canvas.
 * Similar to renderMarks but uses direct pixel coordinates without pan/zoom.
 *
 * @param ctx - Canvas 2D context
 * @param marks - Array of CellMark entries
 * @param cellPx - Cell pixel size in the preview
 * @param gapPx - Gap pixel size in the preview
 * @param bgColor - Background color for negative space
 */
export function renderPreviewMarks(
  ctx: CanvasRenderingContext2D,
  marks: CellMark[],
  cellPx: number,
  gapPx: number,
  bgColor: string
): void {
  if (!marks || marks.length === 0) return;

  const fakeConfig: RenderConfig = {
    cellSize: cellPx,
    gapSize: gapPx,
    canvasBgColor: bgColor,
    // Fill in minimal required fields
    cellRadius: 0,
    axisEvery: 0,
    showAxis: false,
    axisColor: '',
    showRulers: false,
    zoom: 1,
    drawColor: '',
    panX: 0,
    panY: 0,
    padding: 0,
    emptyCellColor: 'transparent',
  };

  for (const mark of marks) {
    switch (mark.type) {
      case 'kaf-s':
        drawKafS(ctx, mark.col, mark.row, fakeConfig);
        break;
      case 'hamzah':
        drawHamzah(ctx, mark.col, mark.row, fakeConfig);
        break;
    }
  }
}
