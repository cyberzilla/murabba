/**
 * Murabba - Bresenham's Line Algorithm
 * Computes contiguous grid cell coordinates between any two points.
 */

import { CellCoord } from '../types/grid';

/**
 * Computes an ordered array of integer cell coordinates forming a straight line
 * between (x0, y0) and (x1, y1) using Bresenham's line algorithm.
 *
 * Handles all slopes, directions, horizontal, vertical lines, and single point segments.
 *
 * @param x0 Starting X coordinate
 * @param y0 Starting Y coordinate
 * @param x1 Ending X coordinate
 * @param y1 Ending Y coordinate
 * @returns Array of integer coordinates inclusive of start and end points
 */
export function bresenhamLine(x0: number, y0: number, x1: number, y1: number): CellCoord[] {
  let currX = Math.round(x0);
  let currY = Math.round(y0);
  const targetX = Math.round(x1);
  const targetY = Math.round(y1);

  const points: CellCoord[] = [];

  const dx = Math.abs(targetX - currX);
  const dy = Math.abs(targetY - currY);

  const sx = currX < targetX ? 1 : -1;
  const sy = currY < targetY ? 1 : -1;

  let err = dx - dy;

  while (true) {
    points.push({ x: currX, y: currY });

    if (currX === targetX && currY === targetY) {
      break;
    }

    const e2 = 2 * err;

    if (e2 > -dy) {
      err -= dy;
      currX += sx;
    }

    if (e2 < dx) {
      err += dx;
      currY += sy;
    }
  }

  return points;
}

/**
 * Alias for bresenhamLine.
 */
export const bresenham = bresenhamLine;

export default bresenham;
