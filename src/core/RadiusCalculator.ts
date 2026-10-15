/**
 * Murabba - Smart Corner Radius Calculator
 * Determines smart rounded corners for cells and gaps to achieve seamless connected shapes.
 * Returns corner radii as a 4-tuple [top-left, top-right, bottom-right, bottom-left].
 */

import { CornerRadii } from '../types/grid';
import { GridModel } from './GridModel';

const _reusableRadii: CornerRadii = [0, 0, 0, 0];
const _reusableRadiiH: CornerRadii = [0, 0, 0, 0];
const _reusableRadiiV: CornerRadii = [0, 0, 0, 0];
const _reusableRadiiD: CornerRadii = [0, 0, 0, 0];

/**
 * Computes corner radii [tl, tr, br, bl] for a main cell at (x, y).
 * A corner is flattened (radius = 0) if connected to an adjacent filled gap or diagonal element.
 *
 * @param model The grid model instance
 * @param x Column index of the cell
 * @param y Row index of the cell
 * @param radius Desired corner radius
 * @returns 4-tuple of radii: [tl, tr, br, bl]
 */
export function computeCellRadius(
  model: GridModel,
  x: number,
  y: number,
  radius: number
): CornerRadii {
  if (radius <= 0) {
    _reusableRadii[0] = 0;
    _reusableRadii[1] = 0;
    _reusableRadii[2] = 0;
    _reusableRadii[3] = 0;
    return _reusableRadii;
  }

  // Top-Left corner: blocked by left gapV, top gapH, or top-left gapD
  const tlBlocked =
    model.isFilledGapV(x - 1, y) ||
    model.isFilledGapH(x, y - 1) ||
    model.isFilledGapD(x - 1, y - 1);

  // Top-Right corner: blocked by right gapV, top gapH, or top-right gapD
  const trBlocked =
    model.isFilledGapV(x, y) ||
    model.isFilledGapH(x, y - 1) ||
    model.isFilledGapD(x, y - 1);

  // Bottom-Right corner: blocked by right gapV, bottom gapH, or bottom-right gapD
  const brBlocked =
    model.isFilledGapV(x, y) ||
    model.isFilledGapH(x, y) ||
    model.isFilledGapD(x, y);

  // Bottom-Left corner: blocked by left gapV, bottom gapH, or bottom-left gapD
  const blBlocked =
    model.isFilledGapV(x - 1, y) ||
    model.isFilledGapH(x, y) ||
    model.isFilledGapD(x - 1, y);

  _reusableRadii[0] = tlBlocked ? 0 : radius;
  _reusableRadii[1] = trBlocked ? 0 : radius;
  _reusableRadii[2] = brBlocked ? 0 : radius;
  _reusableRadii[3] = blBlocked ? 0 : radius;
  return _reusableRadii;
}

/**
 * Computes corner radii [tl, tr, br, bl] for a horizontal gap (gapH) at (gx, gy).
 * A corner is flattened (0) if an adjacent cell, gapV, or gapD is filled.
 *
 * @param model The grid model instance
 * @param gx Column index of the gap
 * @param gy Row index of the gap (between row gy and gy+1)
 * @param radius Desired corner radius
 * @param gapSize Physical dimension of the gap (optional)
 * @returns 4-tuple of radii: [tl, tr, br, bl]
 */
export function computeGapHRadius(
  model: GridModel,
  gx: number,
  gy: number,
  radius: number,
  gapSize?: number
): CornerRadii {
  if (radius <= 0 || (gapSize !== undefined && gapSize <= 0)) {
    _reusableRadiiH[0] = 0;
    _reusableRadiiH[1] = 0;
    _reusableRadiiH[2] = 0;
    _reusableRadiiH[3] = 0;
    return _reusableRadiiH;
  }

  const maxR = gapSize !== undefined ? Math.min(radius, Math.floor(gapSize / 2)) : radius;
  if (maxR <= 0) {
    _reusableRadiiH[0] = 0;
    _reusableRadiiH[1] = 0;
    _reusableRadiiH[2] = 0;
    _reusableRadiiH[3] = 0;
    return _reusableRadiiH;
  }

  // Top-Left corner: cell above, gapV top-left, gapD left
  const tlBlocked =
    model.isFilledCell(gx, gy) ||
    model.isFilledGapV(gx - 1, gy) ||
    model.isFilledGapD(gx - 1, gy);

  // Top-Right corner: cell above, gapV top-right, gapD right
  const trBlocked =
    model.isFilledCell(gx, gy) ||
    model.isFilledGapV(gx, gy) ||
    model.isFilledGapD(gx, gy);

  // Bottom-Right corner: cell below, gapV bottom-right, gapD right
  const brBlocked =
    model.isFilledCell(gx, gy + 1) ||
    model.isFilledGapV(gx, gy + 1) ||
    model.isFilledGapD(gx, gy);

  // Bottom-Left corner: cell below, gapV bottom-left, gapD left
  const blBlocked =
    model.isFilledCell(gx, gy + 1) ||
    model.isFilledGapV(gx - 1, gy + 1) ||
    model.isFilledGapD(gx - 1, gy);

  _reusableRadiiH[0] = tlBlocked ? 0 : maxR;
  _reusableRadiiH[1] = trBlocked ? 0 : maxR;
  _reusableRadiiH[2] = brBlocked ? 0 : maxR;
  _reusableRadiiH[3] = blBlocked ? 0 : maxR;
  return _reusableRadiiH;
}

/**
 * Computes corner radii [tl, tr, br, bl] for a vertical gap (gapV) at (gx, gy).
 * A corner is flattened (0) if an adjacent cell, gapH, or gapD is filled.
 *
 * @param model The grid model instance
 * @param gx Column index of the gap (between column gx and gx+1)
 * @param gy Row index of the gap
 * @param radius Desired corner radius
 * @param gapSize Physical dimension of the gap (optional)
 * @returns 4-tuple of radii: [tl, tr, br, bl]
 */
export function computeGapVRadius(
  model: GridModel,
  gx: number,
  gy: number,
  radius: number,
  gapSize?: number
): CornerRadii {
  if (radius <= 0 || (gapSize !== undefined && gapSize <= 0)) {
    _reusableRadiiV[0] = 0;
    _reusableRadiiV[1] = 0;
    _reusableRadiiV[2] = 0;
    _reusableRadiiV[3] = 0;
    return _reusableRadiiV;
  }

  const maxR = gapSize !== undefined ? Math.min(radius, Math.floor(gapSize / 2)) : radius;
  if (maxR <= 0) {
    _reusableRadiiV[0] = 0;
    _reusableRadiiV[1] = 0;
    _reusableRadiiV[2] = 0;
    _reusableRadiiV[3] = 0;
    return _reusableRadiiV;
  }

  // Top-Left corner: cell left, gapH top-left, gapD top
  const tlBlocked =
    model.isFilledCell(gx, gy) ||
    model.isFilledGapH(gx, gy - 1) ||
    model.isFilledGapD(gx, gy - 1);

  // Top-Right corner: cell right, gapH top-right, gapD top
  const trBlocked =
    model.isFilledCell(gx + 1, gy) ||
    model.isFilledGapH(gx + 1, gy - 1) ||
    model.isFilledGapD(gx, gy - 1);

  // Bottom-Right corner: cell right, gapH bottom-right, gapD bottom
  const brBlocked =
    model.isFilledCell(gx + 1, gy) ||
    model.isFilledGapH(gx + 1, gy) ||
    model.isFilledGapD(gx, gy);

  // Bottom-Left corner: cell left, gapH bottom-left, gapD bottom
  const blBlocked =
    model.isFilledCell(gx, gy) ||
    model.isFilledGapH(gx, gy) ||
    model.isFilledGapD(gx, gy);

  _reusableRadiiV[0] = tlBlocked ? 0 : maxR;
  _reusableRadiiV[1] = trBlocked ? 0 : maxR;
  _reusableRadiiV[2] = brBlocked ? 0 : maxR;
  _reusableRadiiV[3] = blBlocked ? 0 : maxR;
  return _reusableRadiiV;
}

/**
 * Computes corner radii [tl, tr, br, bl] for a diagonal corner dot (gapD) at (gx, gy).
 * Max radius is clamped to half the gap size.
 *
 * @param model The grid model instance
 * @param gx Column index of the corner dot
 * @param gy Row index of the corner dot
 * @param radius Desired corner radius
 * @param gapSize Physical dimension of the gap
 * @returns 4-tuple of radii: [tl, tr, br, bl]
 */
export function computeGapDRadius(
  model: GridModel,
  gx: number,
  gy: number,
  radius: number,
  gapSize: number
): CornerRadii {
  if (radius <= 0 || gapSize <= 0) {
    _reusableRadiiD[0] = 0;
    _reusableRadiiD[1] = 0;
    _reusableRadiiD[2] = 0;
    _reusableRadiiD[3] = 0;
    return _reusableRadiiD;
  }

  const maxR = Math.min(radius, Math.floor(gapSize / 2));
  if (maxR <= 0) {
    _reusableRadiiD[0] = 0;
    _reusableRadiiD[1] = 0;
    _reusableRadiiD[2] = 0;
    _reusableRadiiD[3] = 0;
    return _reusableRadiiD;
  }

  // Top-Left corner: cell (gx, gy), gapH (gx, gy), gapV (gx, gy)
  const tlBlocked =
    model.isFilledCell(gx, gy) ||
    model.isFilledGapH(gx, gy) ||
    model.isFilledGapV(gx, gy);

  // Top-Right corner: cell (gx+1, gy), gapH (gx+1, gy), gapV (gx, gy)
  const trBlocked =
    model.isFilledCell(gx + 1, gy) ||
    model.isFilledGapH(gx + 1, gy) ||
    model.isFilledGapV(gx, gy);

  // Bottom-Right corner: cell (gx+1, gy+1), gapH (gx+1, gy), gapV (gx, gy+1)
  const brBlocked =
    model.isFilledCell(gx + 1, gy + 1) ||
    model.isFilledGapH(gx + 1, gy) ||
    model.isFilledGapV(gx, gy + 1);

  // Bottom-Left corner: cell (gx, gy+1), gapH (gx, gy), gapV (gx, gy+1)
  const blBlocked =
    model.isFilledCell(gx, gy + 1) ||
    model.isFilledGapH(gx, gy) ||
    model.isFilledGapV(gx, gy + 1);

  _reusableRadiiD[0] = tlBlocked ? 0 : maxR;
  _reusableRadiiD[1] = trBlocked ? 0 : maxR;
  _reusableRadiiD[2] = brBlocked ? 0 : maxR;
  _reusableRadiiD[3] = blBlocked ? 0 : maxR;
  return _reusableRadiiD;
}

/**
 * Formats a CornerRadii tuple into a CSS border-radius string (e.g. "5px 5px 0px 5px").
 *
 * @param radii 4-tuple of radii [tl, tr, br, bl]
 * @returns CSS formatted border-radius string
 */
export function formatCornerRadii(radii: CornerRadii): string {
  const [tl, tr, br, bl] = radii;
  return `${tl}px ${tr}px ${br}px ${bl}px`;
}

/**
 * Returns true if all radii in the 4-tuple are zero.
 */
export function allRadiiZero(radii: CornerRadii): boolean {
  return radii[0] === 0 && radii[1] === 0 && radii[2] === 0 && radii[3] === 0;
}
