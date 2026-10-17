/**
 * SelectionRenderer — Draw selection overlays, ghost previews, and brush previews.
 */
import type { RenderConfig, SelectionData, CellCoord, GapCoord } from '../types/grid';
import { drawRoundedRect } from './GridRenderer';

/**
 * Draws a dashed marquee selection frame.
 */
export function renderSelectionFrame(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  config: RenderConfig
): void {
  const total = config.cellSize + config.gapSize;
  const pad = config.padding;

  const nx1 = Math.min(x1, x2);
  const ny1 = Math.min(y1, y2);
  const nx2 = Math.max(x1, x2);
  const ny2 = Math.max(y1, y2);

  const left = pad + nx1 * total;
  const top = pad + ny1 * total;
  const width = (nx2 - nx1 + 1) * total;
  const height = (ny2 - ny1 + 1) * total;

  ctx.save();
  ctx.strokeStyle = '#42A5F5';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.lineDashOffset = (Date.now() / 50) % 10; // animated dash

  ctx.strokeRect(left, top, width, height);

  // Draw corner handles
  ctx.setLineDash([]);
  ctx.fillStyle = '#42A5F5';
  const handleSize = 8;
  const corners = [
    [left, top],
    [left + width, top],
    [left, top + height],
    [left + width, top + height],
    [left + width / 2, top],
    [left + width / 2, top + height],
    [left, top + height / 2],
    [left + width, top + height / 2],
  ];
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, handleSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dimension badge
  const label = `${nx2 - nx1 + 1} × ${ny2 - ny1 + 1}`;
  ctx.font = '11px Tajawal, sans-serif';
  ctx.fillStyle = 'rgba(66, 165, 245, 0.85)';
  const textW = ctx.measureText(label).width + 12;
  const badgeX = left + width / 2 - textW / 2;
  const badgeY = top + height + 6;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(badgeX, badgeY, textW, 20, 4);
  } else {
    ctx.rect(badgeX, badgeY, textW, 20);
  }
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, left + width / 2, badgeY + 10);

  ctx.restore();
}

/**
 * Draws a semi-transparent ghost preview of a floating selection.
 * Computes adaptive corner radii per element based on neighbor lookups
 * within the float data, matching the main grid's RadiusCalculator logic.
 */
export function renderSelectionGhost(
  ctx: CanvasRenderingContext2D,
  data: SelectionData,
  config: RenderConfig
): void {
  const total = config.cellSize + config.gapSize;
  const pad = config.padding;
  const cs = config.cellSize;
  const gs = config.gapSize;
  const r = Math.min(config.cellRadius, Math.floor(cs / 2));
  const rGap = Math.min(r, Math.floor(gs / 2));

  // Build Set lookups from float data for neighbor queries
  const cellSet = new Set<string>();
  const gHSet = new Set<string>();
  const gVSet = new Set<string>();
  const gDSet = new Set<string>();
  for (const { lx, ly } of data.cells) cellSet.add(`${lx},${ly}`);
  for (const { lx, ly } of data.gH) gHSet.add(`${lx},${ly}`);
  for (const { lx, ly } of data.gV) gVSet.add(`${lx},${ly}`);
  for (const { lx, ly } of data.gD) gDSet.add(`${lx},${ly}`);

  ctx.save();
  ctx.globalAlpha = 0.55;

  // Draw cells with adaptive rounded corners
  if (r > 0) {
    for (const { lx, ly, c } of data.cells) {
      const px = pad + (data.ox + lx) * total;
      const py = pad + (data.oy + ly) * total;
      ctx.fillStyle = c || config.drawColor;

      // Same logic as computeCellRadius: corner blocked by adjacent gap/diagonal
      const tl = (gVSet.has(`${lx - 1},${ly}`) || gHSet.has(`${lx},${ly - 1}`) || gDSet.has(`${lx - 1},${ly - 1}`)) ? 0 : r;
      const tr = (gVSet.has(`${lx},${ly}`)     || gHSet.has(`${lx},${ly - 1}`) || gDSet.has(`${lx},${ly - 1}`))     ? 0 : r;
      const br = (gVSet.has(`${lx},${ly}`)     || gHSet.has(`${lx},${ly}`)     || gDSet.has(`${lx},${ly}`))         ? 0 : r;
      const bl = (gVSet.has(`${lx - 1},${ly}`) || gHSet.has(`${lx},${ly}`)     || gDSet.has(`${lx - 1},${ly}`))     ? 0 : r;

      drawRoundedRect(ctx, px, py, cs, cs, [tl, tr, br, bl]);
      ctx.fill();
    }
  } else {
    for (const { lx, ly, c } of data.cells) {
      const px = pad + (data.ox + lx) * total;
      const py = pad + (data.oy + ly) * total;
      ctx.fillStyle = c || config.drawColor;
      ctx.fillRect(px, py, cs, cs);
    }
  }

  // Draw gap-H with adaptive rounded corners
  for (const { lx, ly, c } of data.gH) {
    const px = pad + (data.ox + lx) * total;
    const py = pad + (data.oy + ly + 1) * total - gs;
    ctx.fillStyle = c || config.drawColor;

    if (rGap > 0) {
      // Same logic as computeGapHRadius
      const tl = (cellSet.has(`${lx},${ly}`)     || gVSet.has(`${lx - 1},${ly}`) || gDSet.has(`${lx - 1},${ly}`)) ? 0 : rGap;
      const tr = (cellSet.has(`${lx},${ly}`)     || gVSet.has(`${lx},${ly}`)     || gDSet.has(`${lx},${ly}`))     ? 0 : rGap;
      const br = (cellSet.has(`${lx},${ly + 1}`) || gVSet.has(`${lx},${ly + 1}`) || gDSet.has(`${lx},${ly}`))     ? 0 : rGap;
      const bl = (cellSet.has(`${lx},${ly + 1}`) || gVSet.has(`${lx - 1},${ly + 1}`) || gDSet.has(`${lx - 1},${ly}`)) ? 0 : rGap;
      drawRoundedRect(ctx, px, py, cs, gs, [tl, tr, br, bl]);
      ctx.fill();
    } else {
      ctx.fillRect(px, py, cs, gs);
    }
  }

  // Draw gap-V with adaptive rounded corners
  for (const { lx, ly, c } of data.gV) {
    const px = pad + (data.ox + lx + 1) * total - gs;
    const py = pad + (data.oy + ly) * total;
    ctx.fillStyle = c || config.drawColor;

    if (rGap > 0) {
      // Same logic as computeGapVRadius
      const tl = (cellSet.has(`${lx},${ly}`)     || gHSet.has(`${lx},${ly - 1}`)     || gDSet.has(`${lx},${ly - 1}`)) ? 0 : rGap;
      const tr = (cellSet.has(`${lx + 1},${ly}`) || gHSet.has(`${lx + 1},${ly - 1}`) || gDSet.has(`${lx},${ly - 1}`)) ? 0 : rGap;
      const br = (cellSet.has(`${lx + 1},${ly}`) || gHSet.has(`${lx + 1},${ly}`)     || gDSet.has(`${lx},${ly}`))     ? 0 : rGap;
      const bl = (cellSet.has(`${lx},${ly}`)     || gHSet.has(`${lx},${ly}`)         || gDSet.has(`${lx},${ly}`))     ? 0 : rGap;
      drawRoundedRect(ctx, px, py, gs, cs, [tl, tr, br, bl]);
      ctx.fill();
    } else {
      ctx.fillRect(px, py, gs, cs);
    }
  }

  // Draw gap-D with adaptive rounded corners
  for (const { lx, ly, c } of data.gD) {
    const px = pad + (data.ox + lx + 1) * total - gs;
    const py = pad + (data.oy + ly + 1) * total - gs;
    ctx.fillStyle = c || config.drawColor;

    if (rGap > 0) {
      // Same logic as computeGapDRadius
      const tl = (cellSet.has(`${lx},${ly}`)     || gHSet.has(`${lx},${ly}`)     || gVSet.has(`${lx},${ly}`))     ? 0 : rGap;
      const tr = (cellSet.has(`${lx + 1},${ly}`) || gHSet.has(`${lx + 1},${ly}`) || gVSet.has(`${lx},${ly}`))     ? 0 : rGap;
      const br = (cellSet.has(`${lx + 1},${ly + 1}`) || gHSet.has(`${lx + 1},${ly}`) || gVSet.has(`${lx},${ly + 1}`)) ? 0 : rGap;
      const bl = (cellSet.has(`${lx},${ly + 1}`) || gHSet.has(`${lx},${ly}`)     || gVSet.has(`${lx},${ly + 1}`)) ? 0 : rGap;
      drawRoundedRect(ctx, px, py, gs, gs, [tl, tr, br, bl]);
      ctx.fill();
    } else {
      ctx.fillRect(px, py, gs, gs);
    }
  }

  // Border outline
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#42A5F5';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(
    pad + data.ox * total,
    pad + data.oy * total,
    data.w * total,
    data.h * total
  );

  ctx.restore();
}

/**
 * Renders brush preview highlights on candidate cells.
 * Preview accurately reflects what each brush mode commits:
 *   Mode 1: cells + connecting gaps between consecutive points
 *   Mode 2: matches fillMode2 — horizontal: gapV+gapD, vertical: gapH+gapD
 *   Mode 3: cells + all 8 surrounding gaps per cell
 */
export function renderBrushPreview(
  ctx: CanvasRenderingContext2D,
  points: CellCoord[],
  config: RenderConfig,
  brushMode: number = 1
): void {
  if (points.length === 0) return;

  const total = config.cellSize + config.gapSize;
  const gap = config.gapSize;
  const cs = config.cellSize;
  const pad = config.padding;

  ctx.save();
  // Light cyan-green tint to distinguish preview from committed green cells
  ctx.fillStyle = 'rgba(134, 239, 172, 0.18)';
  ctx.strokeStyle = 'rgba(134, 239, 172, 0.4)';
  ctx.lineWidth = 1;

  if (brushMode === 3) {
    // Mode 3: bold — cell + all surrounding gaps
    for (const { x, y } of points) {
      const px = pad + x * total;
      const py = pad + y * total;
      ctx.fillRect(px, py, cs, cs);
      ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
      ctx.fillRect(px + cs, py, gap, cs);
      if (x > 0) ctx.fillRect(px - gap, py, gap, cs);
      ctx.fillRect(px, py + cs, cs, gap);
      if (y > 0) ctx.fillRect(px, py - gap, cs, gap);
      ctx.fillRect(px + cs, py + cs, gap, gap);
      if (x > 0) ctx.fillRect(px - gap, py + cs, gap, gap);
      if (y > 0) ctx.fillRect(px + cs, py - gap, gap, gap);
      if (x > 0 && y > 0) ctx.fillRect(px - gap, py - gap, gap, gap);
    }
  } else if (brushMode === 2) {
    // Mode 2: gaps only — per-step staircase matching fillConnectorStep
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;

      if (dx !== 0 && dy === 0) {
        // Horizontal step → gapV
        const gx = Math.min(cur.x, prev.x);
        ctx.fillRect(pad + gx * total + cs, pad + cur.y * total, gap, cs);
      } else if (dx === 0 && dy !== 0) {
        // Vertical step → gapH
        const gy = Math.min(cur.y, prev.y);
        ctx.fillRect(pad + cur.x * total, pad + gy * total + cs, cs, gap);
      } else if (dx !== 0 && dy !== 0) {
        // Diagonal step → L-shape: gapV + gapH + gapD corner dot
        const gx = Math.min(cur.x, prev.x);
        const gy = Math.min(cur.y, prev.y);
        ctx.fillRect(pad + gx * total + cs, pad + prev.y * total, gap, cs);
        ctx.fillRect(pad + cur.x * total, pad + gy * total + cs, cs, gap);
        ctx.fillRect(pad + gx * total + cs, pad + gy * total + cs, gap, gap);
      }
    }
  } else {
    // Mode 1: cells + connecting gaps between consecutive points
    for (let i = 0; i < points.length; i++) {
      const { x, y } = points[i];
      const px = pad + x * total;
      const py = pad + y * total;

      // Draw cell body
      ctx.fillRect(px, py, cs, cs);
      ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);

      // Draw connecting gaps to previous point
      if (i > 0) {
        const prev = points[i - 1];
        const dx = x - prev.x;
        const dy = y - prev.y;

        if (dy === 0 && dx !== 0) {
          // Horizontal neighbor → gapV
          const gx = Math.min(x, prev.x);
          ctx.fillRect(pad + gx * total + cs, pad + y * total, gap, cs);
        } else if (dx === 0 && dy !== 0) {
          // Vertical neighbor → gapH
          const gy = Math.min(y, prev.y);
          ctx.fillRect(pad + x * total, pad + gy * total + cs, cs, gap);
        } else if (dx !== 0 && dy !== 0) {
          // Diagonal → both gaps + corner gapD
          const lx = Math.min(x, prev.x);
          const ly = Math.min(y, prev.y);
          ctx.fillRect(pad + lx * total + cs, pad + prev.y * total, gap, cs);
          ctx.fillRect(pad + lx * total + cs, pad + y * total, gap, cs);
          ctx.fillRect(pad + prev.x * total, pad + ly * total + cs, cs, gap);
          ctx.fillRect(pad + x * total, pad + ly * total + cs, cs, gap);
          ctx.fillRect(pad + lx * total + cs, pad + ly * total + cs, gap, gap);
        }
      }
    }
  }

  ctx.restore();
}

/**
 * Renders a hover highlight on a specific gap element for mode 2 (connect) brush.
 * Shows which connector gap will be placed when the user clicks.
 *
 * @param ctx Canvas 2D rendering context
 * @param gap The gap coordinate being hovered
 * @param config Current render configuration
 */
export function renderGapHoverPreview(
  ctx: CanvasRenderingContext2D,
  gap: GapCoord,
  config: RenderConfig
): void {
  const total = config.cellSize + config.gapSize;
  const cs = config.cellSize;
  const gs = config.gapSize;
  const pad = config.padding;

  ctx.save();
  ctx.fillStyle = 'rgba(134, 239, 172, 0.35)';
  ctx.strokeStyle = 'rgba(134, 239, 172, 0.6)';
  ctx.lineWidth = 1;

  let px: number;
  let py: number;
  let w: number;
  let h: number;

  switch (gap.type) {
    case 'h':
      // Horizontal gap: below cell(gx,gy), connects row gy to row gy+1
      px = pad + gap.gx * total;
      py = pad + gap.gy * total + cs;
      w = cs;
      h = gs;
      break;
    case 'v':
      // Vertical gap: right of cell(gx,gy), connects col gx to col gx+1
      px = pad + gap.gx * total + cs;
      py = pad + gap.gy * total;
      w = gs;
      h = cs;
      break;
    case 'd':
      // Corner dot: bottom-right of cell(gx,gy)
      px = pad + gap.gx * total + cs;
      py = pad + gap.gy * total + cs;
      w = gs;
      h = gs;
      break;
    default:
      ctx.restore();
      return;
  }

  ctx.fillRect(px, py, w, h);
  ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);

  ctx.restore();
}
