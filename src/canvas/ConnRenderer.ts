/**
 * ConnRenderer — Renders connection markers on the main canvas.
 * Each marker is a colored bar on a specific side of a grid element,
 * or a dot in the center.
 */

import type { ConnectionMarker, RenderConfig } from '../types/grid';

const CONN_COLORS: Record<string, string> = {
  'conn-in': '#c7a2cc',
  'conn-best': '#f067a6',
  'conn-out': '#8ed6f7',
  'conn-alt': '#7fc251',
};

/**
 * Renders connection markers onto the canvas.
 */
export function renderConnections(
  ctx: CanvasRenderingContext2D,
  conns: ConnectionMarker[],
  config: RenderConfig
): void {
  if (!conns || conns.length === 0) return;

  const { cellSize, gapSize, padding } = config;
  const total = cellSize + gapSize;

  for (const cn of conns) {
    const color = CONN_COLORS[cn.type] || '#fff';
    ctx.fillStyle = color;

    // Calculate pixel position of the element
    let px: number, py: number, pw: number, ph: number;

    switch (cn.el) {
      case 'cell':
        px = padding + cn.col * total;
        py = padding + cn.row * total;
        pw = cellSize;
        ph = cellSize;
        break;
      case 'gH': // horizontal gap: between row r and r+1, at col c
        px = padding + cn.col * total;
        py = padding + cn.row * total + cellSize;
        pw = cellSize;
        ph = gapSize;
        break;
      case 'gV': // vertical gap: between col c and c+1, at row r
        px = padding + cn.col * total + cellSize;
        py = padding + cn.row * total;
        pw = gapSize;
        ph = cellSize;
        break;
      case 'gD': // diagonal gap: intersection dot
        px = padding + cn.col * total + cellSize;
        py = padding + cn.row * total + cellSize;
        pw = gapSize;
        ph = gapSize;
        break;
      default:
        continue;
    }

    const barThickness = Math.max(2, Math.min(3, gapSize * 0.4));
    const inset = Math.max(1, pw * 0.1);

    ctx.globalAlpha = 0.85;

    switch (cn.side) {
      case 'top':
        ctx.fillRect(px + inset, py, pw - inset * 2, barThickness);
        break;
      case 'bottom':
        ctx.fillRect(px + inset, py + ph - barThickness, pw - inset * 2, barThickness);
        break;
      case 'left':
        ctx.fillRect(px, py + inset, barThickness, ph - inset * 2);
        break;
      case 'right':
        ctx.fillRect(px + pw - barThickness, py + inset, barThickness, ph - inset * 2);
        break;
      case 'center': {
        const dotR = Math.max(2, Math.min(3, Math.min(pw, ph) * 0.2));
        const cx = px + pw / 2;
        const cy = py + ph / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }

  ctx.globalAlpha = 1;
}
