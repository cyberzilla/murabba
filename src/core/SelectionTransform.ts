/**
 * SelectionTransform — Geometric transforms for floating SelectionData.
 * Provides rotate (90° CW/CCW) and flip (horizontal/vertical) operations.
 * Gap types swap correctly on rotation (gapH ↔ gapV).
 */

import type { SelectionData } from '../types/grid';

type FloatElement = { lx: number; ly: number; c: string };

/**
 * Rotates SelectionData 90° clockwise.
 *
 * Coordinate mapping (old w×h → new h×w):
 *   Cell(lx, ly)  → Cell(h-1-ly, lx)
 *   GapH(lx, ly)  → GapV(h-2-ly, lx)   (vertical connection becomes horizontal)
 *   GapV(lx, ly)  → GapH(h-1-ly, lx)   (horizontal connection becomes vertical)
 *   GapD(lx, ly)  → GapD(h-2-ly, lx)
 */
export function rotateSelectionCW(data: SelectionData): SelectionData {
  const { w, h } = data;

  const cells: FloatElement[] = data.cells.map(({ lx, ly, c }) => ({
    lx: h - 1 - ly, ly: lx, c,
  }));

  // GapH → GapV (horizontal bridge becomes vertical bridge)
  const newGV: FloatElement[] = data.gH.map(({ lx, ly, c }) => ({
    lx: h - 2 - ly, ly: lx, c,
  }));

  // GapV → GapH (vertical bridge becomes horizontal bridge)
  const newGH: FloatElement[] = data.gV.map(({ lx, ly, c }) => ({
    lx: h - 1 - ly, ly: lx, c,
  }));

  // GapD → GapD (corner dot stays corner dot, just repositioned)
  const gD: FloatElement[] = data.gD.map(({ lx, ly, c }) => ({
    lx: h - 2 - ly, ly: lx, c,
  }));

  return {
    cells, gH: newGH, gV: newGV, gD,
    ox: data.ox, oy: data.oy,
    w: h, h: w,
  };
}

/**
 * Rotates SelectionData 90° counter-clockwise.
 * Equivalent to 3× clockwise rotations.
 *
 * Coordinate mapping (old w×h → new h×w):
 *   Cell(lx, ly)  → Cell(ly, w-1-lx)
 *   GapH(lx, ly)  → GapV(ly, w-1-lx)
 *   GapV(lx, ly)  → GapH(ly, w-2-lx)
 *   GapD(lx, ly)  → GapD(ly, w-2-lx)
 */
export function rotateSelectionCCW(data: SelectionData): SelectionData {
  const { w, h } = data;

  const cells: FloatElement[] = data.cells.map(({ lx, ly, c }) => ({
    lx: ly, ly: w - 1 - lx, c,
  }));

  // GapH → GapV
  const newGV: FloatElement[] = data.gH.map(({ lx, ly, c }) => ({
    lx: ly, ly: w - 1 - lx, c,
  }));

  // GapV → GapH
  const newGH: FloatElement[] = data.gV.map(({ lx, ly, c }) => ({
    lx: ly, ly: w - 2 - lx, c,
  }));

  // GapD → GapD
  const gD: FloatElement[] = data.gD.map(({ lx, ly, c }) => ({
    lx: ly, ly: w - 2 - lx, c,
  }));

  return {
    cells, gH: newGH, gV: newGV, gD,
    ox: data.ox, oy: data.oy,
    w: h, h: w,
  };
}

/**
 * Flips SelectionData horizontally (mirror left ↔ right).
 *
 * Coordinate mapping (dimensions unchanged):
 *   Cell(lx, ly)  → Cell(w-1-lx, ly)
 *   GapH(lx, ly)  → GapH(w-1-lx, ly)
 *   GapV(lx, ly)  → GapV(w-2-lx, ly)
 *   GapD(lx, ly)  → GapD(w-2-lx, ly)
 */
export function flipSelectionH(data: SelectionData): SelectionData {
  const { w } = data;

  const cells: FloatElement[] = data.cells.map(({ lx, ly, c }) => ({
    lx: w - 1 - lx, ly, c,
  }));

  const gH: FloatElement[] = data.gH.map(({ lx, ly, c }) => ({
    lx: w - 1 - lx, ly, c,
  }));

  const gV: FloatElement[] = data.gV.map(({ lx, ly, c }) => ({
    lx: w - 2 - lx, ly, c,
  }));

  const gD: FloatElement[] = data.gD.map(({ lx, ly, c }) => ({
    lx: w - 2 - lx, ly, c,
  }));

  return { cells, gH, gV, gD, ox: data.ox, oy: data.oy, w: data.w, h: data.h };
}

/**
 * Flips SelectionData vertically (mirror top ↔ bottom).
 *
 * Coordinate mapping (dimensions unchanged):
 *   Cell(lx, ly)  → Cell(lx, h-1-ly)
 *   GapH(lx, ly)  → GapH(lx, h-2-ly)
 *   GapV(lx, ly)  → GapV(lx, h-1-ly)
 *   GapD(lx, ly)  → GapD(lx, h-2-ly)
 */
export function flipSelectionV(data: SelectionData): SelectionData {
  const { h } = data;

  const cells: FloatElement[] = data.cells.map(({ lx, ly, c }) => ({
    lx, ly: h - 1 - ly, c,
  }));

  const gH: FloatElement[] = data.gH.map(({ lx, ly, c }) => ({
    lx, ly: h - 2 - ly, c,
  }));

  const gV: FloatElement[] = data.gV.map(({ lx, ly, c }) => ({
    lx, ly: h - 1 - ly, c,
  }));

  const gD: FloatElement[] = data.gD.map(({ lx, ly, c }) => ({
    lx, ly: h - 2 - ly, c,
  }));

  return { cells, gH, gV, gD, ox: data.ox, oy: data.oy, w: data.w, h: data.h };
}
