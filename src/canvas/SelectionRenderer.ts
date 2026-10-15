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
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
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

  ctx.save();
  ctx.globalAlpha = 0.55;

  // Draw cells with rounded corners matching the grid appearance
  const r = Math.min(config.cellRadius, Math.floor(cs / 2));
  const cellRadii: [number, number, number, number] = [r, r, r, r];
  for (const { lx, ly, c } of data.cells) {
    const x = pad + (data.ox + lx) * total;
    const y = pad + (data.oy + ly) * total;
    ctx.fillStyle = c || config.drawColor;
    drawRoundedRect(ctx, x, y, cs, cs, cellRadii);
    ctx.fill();
  }

  // Draw gap-H
  for (const { lx, ly, c } of data.gH) {
    const x = pad + (data.ox + lx) * total;
    const y = pad + (data.oy + ly + 1) * total - gs;
    ctx.fillStyle = c || config.drawColor;
    ctx.fillRect(x, y, cs, gs);
  }

  // Draw gap-V
  for (const { lx, ly, c } of data.gV) {
    const x = pad + (data.ox + lx + 1) * total - gs;
    const y = pad + (data.oy + ly) * total;
    ctx.fillStyle = c || config.drawColor;
    ctx.fillRect(x, y, gs, cs);
  }

  // Draw gap-D
  for (const { lx, ly, c } of data.gD) {
    const x = pad + (data.ox + lx + 1) * total - gs;
    const y = pad + (data.oy + ly + 1) * total - gs;
    ctx.fillStyle = c || config.drawColor;
    ctx.fillRect(x, y, gs, gs);
  }

  // Border outline
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#42A5F5';
  ctx.lineWidth = 2;
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
