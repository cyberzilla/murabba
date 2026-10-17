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
    const color = mark.c || config.drawColor;
    switch (mark.type) {
      case 'kaf-s':
        drawKafS(ctx, mark.col, mark.row, config, mark.rot, mark.flipH, color);
        break;
      case 'hamzah':
        drawHamzah(ctx, mark.col, mark.row, config, mark.rot, mark.flipH, color);
        break;
    }
  }
}

/**
 * Draws the Kaf S-mark (zigzag) as a colored stroke within a 2×2 cell area.
 * The visual area spans 2 cells + 1 gap in each axis.
 * Drawn as a single continuous S-shaped path with rounded joins.
 *
 * S-pattern — correct direction for Arabic kaf:
 * ┌───────┐
 * │ ▓▓▓▓▓ │  top bar (right → left)
 * │ ▓     │  left vertical (down)
 * │ ▓▓▓▓▓ │  middle bar (left → right)
 * │     ▓ │  right vertical (down)
 * │ ▓▓▓▓▓ │  bottom bar (right → left)
 * └───────┘
 */
function drawKafS(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  config: RenderConfig,
  rot?: number,
  flipH?: boolean,
  color?: string
): void {
  const { cellSize, gapSize, padding, cellRadius, canvasBgColor, drawColor } = config;
  const strokeColor = color || drawColor;

  // Full area of 2×2 cells including gap
  const areaW = 2 * cellSize + gapSize;
  const areaH = 2 * cellSize + gapSize;

  // Top-left pixel position of the 2×2 cell block
  const x0 = padding + col * (cellSize + gapSize);
  const y0 = padding + row * (cellSize + gapSize);

  // Clip to the 2×2 cell area with rounded corners
  const r = Math.min(cellRadius, Math.floor(cellSize / 2));
  ctx.save();
  ctx.beginPath();
  if (r > 0 && ctx.roundRect) {
    ctx.roundRect(x0, y0, areaW, areaH, r);
  } else {
    ctx.rect(x0, y0, areaW, areaH);
  }
  ctx.clip();

  // Erase the 2×2 area first (clear filled cells underneath)
  if (canvasBgColor === 'transparent') {
    ctx.clearRect(x0, y0, areaW, areaH);
  } else {
    ctx.fillStyle = canvasBgColor;
    ctx.fillRect(x0, y0, areaW, areaH);
  }

  // Apply rotation/flip transform around area center
  const cx = x0 + areaW / 2;
  const cy = y0 + areaH / 2;
  ctx.translate(cx, cy);
  if (flipH) ctx.scale(-1, 1);
  if (rot) ctx.rotate((rot * Math.PI) / 2);
  ctx.translate(-cx, -cy);

  // S-mark line width = half of cell size
  const lineW = Math.max(2, Math.round(cellSize / 2));

  // S-path inset from edges (half lineW so stroke stays inside)
  const halfLW = lineW / 2;
  const sx = x0 + halfLW;
  const sy = y0 + halfLW;
  const sw = areaW - lineW;
  const sh = areaH - lineW;

  // Key Y positions for the S-path
  const y1 = sy;               // top
  const y3 = sy + sh * 0.5;    // middle
  const y5 = sy + sh;          // bottom

  const xL = sx;               // left edge
  const xR = sx + sw;          // right edge

  // Draw S as one continuous stroke path using the cell draw color
  ctx.beginPath();
  ctx.moveTo(xR, y1);   // start at top-right
  ctx.lineTo(xL, y1);   // top bar → left
  ctx.lineTo(xL, y3);   // left vertical ↓ to middle
  ctx.lineTo(xR, y3);   // middle bar → right
  ctx.lineTo(xR, y5);   // right vertical ↓ to bottom
  ctx.lineTo(xL, y5);   // bottom bar → left

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineW;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws the Hamzah mark (ء) as a C-shape within a 1×1 cell.
 * The C opens to the right. The cell is divided into 3 bands (lineWidth = cellSize/3).
 * Corner radius follows the cellRadius setting.
 *
 * Hamzah C-pattern (3×3 grid view):
 *   ██ ██ ··
 *   ██ ·· ··
 *   ██ ██ ··
 */
function drawHamzah(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  config: RenderConfig,
  rot?: number,
  flipH?: boolean,
  color?: string
): void {
  const { cellSize, gapSize, padding, cellRadius, canvasBgColor, drawColor } = config;
  const strokeColor = color || drawColor;

  // Cell pixel position
  const x0 = padding + col * (cellSize + gapSize);
  const y0 = padding + row * (cellSize + gapSize);

  // Clip to cell area with rounded corners
  const r = Math.min(cellRadius, Math.floor(cellSize / 2));
  ctx.save();
  ctx.beginPath();
  if (r > 0 && ctx.roundRect) {
    ctx.roundRect(x0, y0, cellSize, cellSize, r);
  } else {
    ctx.rect(x0, y0, cellSize, cellSize);
  }
  ctx.clip();

  // Erase the cell first (clear filled cell underneath)
  if (canvasBgColor === 'transparent') {
    ctx.clearRect(x0, y0, cellSize, cellSize);
  } else {
    ctx.fillStyle = canvasBgColor;
    ctx.fillRect(x0, y0, cellSize, cellSize);
  }

  // Apply rotation/flip transform around cell center
  const cx = x0 + cellSize / 2;
  const cy = y0 + cellSize / 2;
  ctx.translate(cx, cy);
  if (flipH) ctx.scale(-1, 1);
  if (rot) ctx.rotate((rot * Math.PI) / 2);
  ctx.translate(-cx, -cy);

  // Line width = 1/3 of cell size (divides cell into 3 bands)
  const lineW = Math.max(2, Math.round(cellSize / 3));
  const halfLW = lineW / 2;

  // C-shape path: top/bottom bars span full cell width,
  // opening is only in the middle row on the right side
  const left = x0 + halfLW;
  const right = x0 + cellSize - halfLW;
  const top = y0 + halfLW;
  const bottom = y0 + cellSize - halfLW;

  // Corner radius from settings, clamped to available space
  const cornerR = Math.min(cellRadius, (cellSize - lineW) / 2);

  ctx.beginPath();
  ctx.moveTo(right, top);         // start: top-right (2/3 point)

  if (cornerR > 0) {
    ctx.arcTo(left, top, left, bottom, cornerR);     // top-left corner
    ctx.arcTo(left, bottom, right, bottom, cornerR); // bottom-left corner
  } else {
    ctx.lineTo(left, top);         // sharp top-left corner
    ctx.lineTo(left, bottom);      // sharp bottom-left corner
  }

  ctx.lineTo(right, bottom);      // end: bottom-right (2/3 point)

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineW;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.stroke();

  ctx.restore();
}

/**
 * Renders marks on a letter preview canvas.
 * Similar to renderMarks but uses direct pixel coordinates without pan/zoom.
 *
 * @param ctx - Canvas 2D context
 * @param marks - Array of CellMark entries
 * @param cellPx - Cell pixel size in the preview
 * @param gapPx - Gap pixel size in the preview
 * @param bgColor - Background color for erasing
 * @param drawColor - Color of the mark (same as letter cells)
 */
export function renderPreviewMarks(
  ctx: CanvasRenderingContext2D,
  marks: CellMark[],
  cellPx: number,
  gapPx: number,
  bgColor: string,
  drawColor: string = '#22C55E'
): void {
  if (!marks || marks.length === 0) return;

  const fakeConfig: RenderConfig = {
    cellSize: cellPx,
    gapSize: gapPx,
    canvasBgColor: bgColor,
    // Fill in minimal required fields
    cellRadius: Math.max(1, Math.floor(cellPx * 0.2)),
    axisEvery: 0,
    showAxis: false,
    axisColor: '',
    showRulers: false,
    zoom: 1,
    drawColor: drawColor,
    panX: 0,
    panY: 0,
    padding: 0,
    emptyCellColor: 'transparent',
  };

  for (const mark of marks) {
    switch (mark.type) {
      case 'kaf-s':
        drawKafS(ctx, mark.col, mark.row, fakeConfig, mark.rot, mark.flipH);
        break;
      case 'hamzah':
        drawHamzah(ctx, mark.col, mark.row, fakeConfig, mark.rot, mark.flipH);
        break;
    }
  }
}
