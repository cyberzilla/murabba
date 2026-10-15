/**
 * Murabba - Core Grid Data Model
 * Manages cellular and gap state, color mappings, snapshots, and serialization.
 */

import {
  BgProps,
  BoundingBox,
  GridState,
  HistorySnapshot,
  ProjectData,
  SessionData,
} from '../types/grid';

/**
 * GridModel stores the low-level data arrays and color registries for the Kufic canvas.
 * Elements consist of main square cells, horizontal gaps (gapH), vertical gaps (gapV),
 * and corner dot gaps (gapD).
 */
export class GridModel {
  private _cols: number;
  private _rows: number;

  private _cells: Uint8Array;
  private _gapH: Uint8Array;
  private _gapV: Uint8Array;
  private _gapD: Uint8Array;

  private _cellColors: Map<number, string>;
  private _gapHColors: Map<number, string>;
  private _gapVColors: Map<number, string>;
  private _gapDColors: Map<number, string>;

  /**
   * Initializes a new GridModel with the specified dimensions.
   *
   * @param cols Number of cell columns (default: 44)
   * @param rows Number of cell rows (default: 44)
   */
  constructor(cols: number = 44, rows: number = 44) {
    this._cols = Math.max(1, cols);
    this._rows = Math.max(1, rows);

    this._cells = new Uint8Array(this._cols * this._rows);
    this._gapH = new Uint8Array(Math.max(0, this._rows - 1) * this._cols);
    this._gapV = new Uint8Array(this._rows * Math.max(0, this._cols - 1));
    this._gapD = new Uint8Array(Math.max(0, this._rows - 1) * Math.max(0, this._cols - 1));

    this._cellColors = new Map();
    this._gapHColors = new Map();
    this._gapVColors = new Map();
    this._gapDColors = new Map();
  }

  // ──────────────────────── Getters ────────────────────────

  /**
   * Number of columns in the grid.
   */
  public get cols(): number {
    return this._cols;
  }

  /**
   * Number of rows in the grid.
   */
  public get rows(): number {
    return this._rows;
  }

  /**
   * Total number of filled main cells.
   */
  public get filledCellCount(): number {
    let count = 0;
    const len = this._cells.length;
    for (let i = 0; i < len; i++) {
      if (this._cells[i] === 1) {
        count++;
      }
    }
    return count;
  }

  /**
   * Returns a copy of the raw grid state.
   */
  public getState(): GridState {
    return {
      cols: this._cols,
      rows: this._rows,
      cells: new Uint8Array(this._cells),
      gapH: new Uint8Array(this._gapH),
      gapV: new Uint8Array(this._gapV),
      gapD: new Uint8Array(this._gapD),
      cellColors: new Map(this._cellColors),
      gapHColors: new Map(this._gapHColors),
      gapVColors: new Map(this._gapVColors),
      gapDColors: new Map(this._gapDColors),
    };
  }

  // ──────────────────────── Flat Index Helpers ────────────────────────

  /**
   * Calculates flat 1D index for a cell at (x, y).
   */
  public cellIndex(x: number, y: number): number {
    return y * this._cols + x;
  }

  /**
   * Calculates flat 1D index for a horizontal gap at (gx, gy).
   */
  public gapHIndex(gx: number, gy: number): number {
    return gy * this._cols + gx;
  }

  /**
   * Calculates flat 1D index for a vertical gap at (gx, gy).
   */
  public gapVIndex(gx: number, gy: number): number {
    return gy * (this._cols - 1) + gx;
  }

  /**
   * Calculates flat 1D index for a diagonal corner dot at (gx, gy).
   */
  public gapDIndex(gx: number, gy: number): number {
    return gy * (this._cols - 1) + gx;
  }

  // ──────────────────────── Bounds Validation ────────────────────────

  /**
   * Checks if cell coordinate is within grid bounds.
   */
  public isCellInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this._cols && y >= 0 && y < this._rows;
  }

  /**
   * Checks if horizontal gap coordinate is within bounds.
   */
  public isGapHInBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gx < this._cols && gy >= 0 && gy < this._rows - 1;
  }

  /**
   * Checks if vertical gap coordinate is within bounds.
   */
  public isGapVInBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gx < this._cols - 1 && gy >= 0 && gy < this._rows;
  }

  /**
   * Checks if diagonal dot gap coordinate is within bounds.
   */
  public isGapDInBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gx < this._cols - 1 && gy >= 0 && gy < this._rows - 1;
  }

  // ──────────────────────── Cell Accessors ────────────────────────

  /**
   * Retrieves cell value (1 for filled, 0 for empty).
   */
  public getCell(x: number, y: number): number {
    if (!this.isCellInBounds(x, y)) {
      return 0;
    }
    return this._cells[this.cellIndex(x, y)];
  }

  /**
   * Sets cell value (1 or 0). Clears color if set to 0.
   */
  public setCell(x: number, y: number, value: number): boolean {
    if (!this.isCellInBounds(x, y)) {
      return false;
    }
    const idx = this.cellIndex(x, y);
    const val = value ? 1 : 0;
    this._cells[idx] = val;
    if (val === 0) {
      this._cellColors.delete(idx);
    }
    return true;
  }

  /**
   * Checks whether cell at (x, y) is filled.
   */
  public isFilledCell(x: number, y: number): boolean {
    return this.getCell(x, y) === 1;
  }

  /**
   * Retrieves custom color of cell at (x, y).
   */
  public getCellColor(x: number, y: number): string | undefined {
    if (!this.isCellInBounds(x, y)) {
      return undefined;
    }
    return this._cellColors.get(this.cellIndex(x, y));
  }

  /**
   * Sets custom color for cell at (x, y).
   */
  public setCellColor(x: number, y: number, color: string | undefined): void {
    if (!this.isCellInBounds(x, y)) {
      return;
    }
    const idx = this.cellIndex(x, y);
    if (color) {
      this._cellColors.set(idx, color);
    } else {
      this._cellColors.delete(idx);
    }
  }

  /**
   * Clears (removes) the custom color for cell at (x, y).
   */
  public clearCellColor(x: number, y: number): void {
    this.setCellColor(x, y, undefined);
  }

  // ──────────────────────── Gap-H Accessors ────────────────────────

  /**
   * Retrieves horizontal gap value (1 for filled, 0 for empty).
   */
  public getGapH(gx: number, gy: number): number {
    if (!this.isGapHInBounds(gx, gy)) {
      return 0;
    }
    return this._gapH[this.gapHIndex(gx, gy)];
  }

  /**
   * Sets horizontal gap value (1 or 0). Clears color if set to 0.
   */
  public setGapH(gx: number, gy: number, value: number): boolean {
    if (!this.isGapHInBounds(gx, gy)) {
      return false;
    }
    const idx = this.gapHIndex(gx, gy);
    const val = value ? 1 : 0;
    this._gapH[idx] = val;
    if (val === 0) {
      this._gapHColors.delete(idx);
    }
    return true;
  }

  /**
   * Checks whether horizontal gap at (gx, gy) is filled.
   */
  public isFilledGapH(gx: number, gy: number): boolean {
    return this.getGapH(gx, gy) === 1;
  }

  /**
   * Retrieves custom color of horizontal gap at (gx, gy).
   */
  public getGapHColor(gx: number, gy: number): string | undefined {
    if (!this.isGapHInBounds(gx, gy)) {
      return undefined;
    }
    return this._gapHColors.get(this.gapHIndex(gx, gy));
  }

  /**
   * Sets custom color for horizontal gap at (gx, gy).
   */
  public setGapHColor(gx: number, gy: number, color: string | undefined): void {
    if (!this.isGapHInBounds(gx, gy)) {
      return;
    }
    const idx = this.gapHIndex(gx, gy);
    if (color) {
      this._gapHColors.set(idx, color);
    } else {
      this._gapHColors.delete(idx);
    }
  }

  /**
   * Clears (removes) the custom color for horizontal gap at (gx, gy).
   */
  public clearGapHColor(gx: number, gy: number): void {
    this.setGapHColor(gx, gy, undefined);
  }

  // ──────────────────────── Gap-V Accessors ────────────────────────

  /**
   * Retrieves vertical gap value (1 for filled, 0 for empty).
   */
  public getGapV(gx: number, gy: number): number {
    if (!this.isGapVInBounds(gx, gy)) {
      return 0;
    }
    return this._gapV[this.gapVIndex(gx, gy)];
  }

  /**
   * Sets vertical gap value (1 or 0). Clears color if set to 0.
   */
  public setGapV(gx: number, gy: number, value: number): boolean {
    if (!this.isGapVInBounds(gx, gy)) {
      return false;
    }
    const idx = this.gapVIndex(gx, gy);
    const val = value ? 1 : 0;
    this._gapV[idx] = val;
    if (val === 0) {
      this._gapVColors.delete(idx);
    }
    return true;
  }

  /**
   * Checks whether vertical gap at (gx, gy) is filled.
   */
  public isFilledGapV(gx: number, gy: number): boolean {
    return this.getGapV(gx, gy) === 1;
  }

  /**
   * Retrieves custom color of vertical gap at (gx, gy).
   */
  public getGapVColor(gx: number, gy: number): string | undefined {
    if (!this.isGapVInBounds(gx, gy)) {
      return undefined;
    }
    return this._gapVColors.get(this.gapVIndex(gx, gy));
  }

  /**
   * Sets custom color for vertical gap at (gx, gy).
   */
  public setGapVColor(gx: number, gy: number, color: string | undefined): void {
    if (!this.isGapVInBounds(gx, gy)) {
      return;
    }
    const idx = this.gapVIndex(gx, gy);
    if (color) {
      this._gapVColors.set(idx, color);
    } else {
      this._gapVColors.delete(idx);
    }
  }

  /**
   * Clears (removes) the custom color for vertical gap at (gx, gy).
   */
  public clearGapVColor(gx: number, gy: number): void {
    this.setGapVColor(gx, gy, undefined);
  }

  // ──────────────────────── Gap-D Accessors ────────────────────────

  /**
   * Retrieves diagonal corner dot gap value (1 for filled, 0 for empty).
   */
  public getGapD(gx: number, gy: number): number {
    if (!this.isGapDInBounds(gx, gy)) {
      return 0;
    }
    return this._gapD[this.gapDIndex(gx, gy)];
  }

  /**
   * Sets diagonal corner dot gap value (1 or 0). Clears color if set to 0.
   */
  public setGapD(gx: number, gy: number, value: number): boolean {
    if (!this.isGapDInBounds(gx, gy)) {
      return false;
    }
    const idx = this.gapDIndex(gx, gy);
    const val = value ? 1 : 0;
    this._gapD[idx] = val;
    if (val === 0) {
      this._gapDColors.delete(idx);
    }
    return true;
  }

  /**
   * Checks whether diagonal dot gap at (gx, gy) is filled.
   */
  public isFilledGapD(gx: number, gy: number): boolean {
    return this.getGapD(gx, gy) === 1;
  }

  /**
   * Retrieves custom color of diagonal dot gap at (gx, gy).
   */
  public getGapDColor(gx: number, gy: number): string | undefined {
    if (!this.isGapDInBounds(gx, gy)) {
      return undefined;
    }
    return this._gapDColors.get(this.gapDIndex(gx, gy));
  }

  /**
   * Sets custom color for diagonal dot gap at (gx, gy).
   */
  public setGapDColor(gx: number, gy: number, color: string | undefined): void {
    if (!this.isGapDInBounds(gx, gy)) {
      return;
    }
    const idx = this.gapDIndex(gx, gy);
    if (color) {
      this._gapDColors.set(idx, color);
    } else {
      this._gapDColors.delete(idx);
    }
  }

  /**
   * Clears (removes) the custom color for diagonal gap at (gx, gy).
   */
  public clearGapDColor(gx: number, gy: number): void {
    this.setGapDColor(gx, gy, undefined);
  }

  // ──────────────────────── Bulk Operations ────────────────────────

  /**
   * Clears all cells and gaps to 0 and clears all color maps.
   */
  public clear(): void {
    this._cells.fill(0);
    this._gapH.fill(0);
    this._gapV.fill(0);
    this._gapD.fill(0);
    this._cellColors.clear();
    this._gapHColors.clear();
    this._gapVColors.clear();
    this._gapDColors.clear();
  }

  /**
   * Resizes the grid dimensions, preserving existing cell and gap data that fit
   * within the newly specified boundaries.
   *
   * @param newCols New column count
   * @param newRows New row count
   */
  public resize(newCols: number, newRows: number): void {
    newCols = Math.max(1, Math.round(newCols));
    newRows = Math.max(1, Math.round(newRows));

    if (newCols === this._cols && newRows === this._rows) {
      return;
    }

    const oldCols = this._cols;
    const oldRows = this._rows;

    const newCells = new Uint8Array(newCols * newRows);
    const newGapH = new Uint8Array(Math.max(0, newRows - 1) * newCols);
    const newGapV = new Uint8Array(newRows * Math.max(0, newCols - 1));
    const newGapD = new Uint8Array(Math.max(0, newRows - 1) * Math.max(0, newCols - 1));

    const newCellColors = new Map<number, string>();
    const newGapHColors = new Map<number, string>();
    const newGapVColors = new Map<number, string>();
    const newGapDColors = new Map<number, string>();

    const minCols = Math.min(oldCols, newCols);
    const minRows = Math.min(oldRows, newRows);

    // Copy cells
    for (let y = 0; y < minRows; y++) {
      for (let x = 0; x < minCols; x++) {
        const oldIdx = y * oldCols + x;
        const newIdx = y * newCols + x;
        const val = this._cells[oldIdx];
        newCells[newIdx] = val;
        if (this._cellColors.has(oldIdx)) {
          newCellColors.set(newIdx, this._cellColors.get(oldIdx)!);
        }
      }
    }

    // Copy gapH: gy from 0 to minRows - 2
    const minGapHRows = Math.min(Math.max(0, oldRows - 1), Math.max(0, newRows - 1));
    for (let gy = 0; gy < minGapHRows; gy++) {
      for (let gx = 0; gx < minCols; gx++) {
        const oldIdx = gy * oldCols + gx;
        const newIdx = gy * newCols + gx;
        newGapH[newIdx] = this._gapH[oldIdx];
        if (this._gapHColors.has(oldIdx)) {
          newGapHColors.set(newIdx, this._gapHColors.get(oldIdx)!);
        }
      }
    }

    // Copy gapV: gx from 0 to minCols - 2
    const minGapVCols = Math.min(Math.max(0, oldCols - 1), Math.max(0, newCols - 1));
    for (let gy = 0; gy < minRows; gy++) {
      for (let gx = 0; gx < minGapVCols; gx++) {
        const oldIdx = gy * (oldCols - 1) + gx;
        const newIdx = gy * (newCols - 1) + gx;
        newGapV[newIdx] = this._gapV[oldIdx];
        if (this._gapVColors.has(oldIdx)) {
          newGapVColors.set(newIdx, this._gapVColors.get(oldIdx)!);
        }
      }
    }

    // Copy gapD: gy < minGapHRows and gx < minGapVCols
    for (let gy = 0; gy < minGapHRows; gy++) {
      for (let gx = 0; gx < minGapVCols; gx++) {
        const oldIdx = gy * (oldCols - 1) + gx;
        const newIdx = gy * (newCols - 1) + gx;
        newGapD[newIdx] = this._gapD[oldIdx];
        if (this._gapDColors.has(oldIdx)) {
          newGapDColors.set(newIdx, this._gapDColors.get(oldIdx)!);
        }
      }
    }

    this._cols = newCols;
    this._rows = newRows;
    this._cells = newCells;
    this._gapH = newGapH;
    this._gapV = newGapV;
    this._gapD = newGapD;
    this._cellColors = newCellColors;
    this._gapHColors = newGapHColors;
    this._gapVColors = newGapVColors;
    this._gapDColors = newGapDColors;
  }

  /**
   * Creates a deep-clone snapshot of current grid state for undo/redo history.
   */
  public snapshot(): HistorySnapshot {
    return {
      cells: new Uint8Array(this._cells),
      gapH: new Uint8Array(this._gapH),
      gapV: new Uint8Array(this._gapV),
      gapD: new Uint8Array(this._gapD),
      cellColors: new Map(this._cellColors),
      gapHColors: new Map(this._gapHColors),
      gapVColors: new Map(this._gapVColors),
      gapDColors: new Map(this._gapDColors),
    };
  }

  /**
   * Alias for snapshot() to provide explicit snapshot creation.
   */
  public createSnapshot(): HistorySnapshot {
    return this.snapshot();
  }

  /**
   * Restores grid state from a previously created snapshot.
   */
  public applySnapshot(snap: HistorySnapshot): void {
    this._cells = new Uint8Array(snap.cells);
    this._gapH = new Uint8Array(snap.gapH);
    this._gapV = new Uint8Array(snap.gapV);
    this._gapD = new Uint8Array(snap.gapD);
    this._cellColors = new Map(snap.cellColors);
    this._gapHColors = new Map(snap.gapHColors);
    this._gapVColors = new Map(snap.gapVColors);
    this._gapDColors = new Map(snap.gapDColors);
  }

  /**
   * Computes the bounding box enclosing all filled cells on the grid.
   * Returns null if no cells are filled.
   */
  public getBoundingBox(): BoundingBox | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasFilled = false;

    for (let y = 0; y < this._rows; y++) {
      for (let x = 0; x < this._cols; x++) {
        if (this._cells[this.cellIndex(x, y)] === 1) {
          hasFilled = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!hasFilled) {
      return null;
    }

    return { minX, minY, maxX, maxY };
  }

  // ──────────────────────── Serialization ────────────────────────

  /**
   * Serializes current grid state to a ProjectData object.
   *
   * @param drawColor Active brush/pen color (default: '#22C55E')
   * @param bgProps Background image settings
   * @param bgImg Base64 or URL data of background image
   * @param bgVisible Background visibility flag
   * @returns Serialized ProjectData
   */
  public toProjectData(
    drawColor: string = '#22C55E',
    bgProps: BgProps = {
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      opacity: 0.5,
      blend: 'normal',
      rotate: 0,
      crop: { x: 0, y: 0, w: 1, h: 1 },
    },
    bgImg: string | null = null,
    bgVisible: boolean = true
  ): ProjectData {
    // 2D grid
    const grid: number[][] = Array.from({ length: this._rows }, (_, y) =>
      Array.from({ length: this._cols }, (_, x) => this.getCell(x, y))
    );

    // 2D gapH: (rows - 1) x cols
    const gapHRows = Math.max(0, this._rows - 1);
    const gapH: number[][] = Array.from({ length: gapHRows }, (_, gy) =>
      Array.from({ length: this._cols }, (_, gx) => this.getGapH(gx, gy))
    );

    // 2D gapV: rows x (cols - 1)
    const gapVCols = Math.max(0, this._cols - 1);
    const gapV: number[][] = Array.from({ length: this._rows }, (_, gy) =>
      Array.from({ length: gapVCols }, (_, gx) => this.getGapV(gx, gy))
    );

    // 2D gapD: (rows - 1) x (cols - 1)
    const gapD: number[][] = Array.from({ length: gapHRows }, (_, gy) =>
      Array.from({ length: gapVCols }, (_, gx) => this.getGapD(gx, gy))
    );

    // Color dictionaries with key format "x,y"
    const cellColors: Record<string, string> = {};
    for (const [idx, color] of this._cellColors.entries()) {
      const x = idx % this._cols;
      const y = Math.floor(idx / this._cols);
      cellColors[`${x},${y}`] = color;
    }

    const gapHColors: Record<string, string> = {};
    for (const [idx, color] of this._gapHColors.entries()) {
      const gx = idx % this._cols;
      const gy = Math.floor(idx / this._cols);
      gapHColors[`${gx},${gy}`] = color;
    }

    const gapVColsCount = Math.max(1, this._cols - 1);
    const gapVColors: Record<string, string> = {};
    for (const [idx, color] of this._gapVColors.entries()) {
      const gx = idx % gapVColsCount;
      const gy = Math.floor(idx / gapVColsCount);
      gapVColors[`${gx},${gy}`] = color;
    }

    const gapDColors: Record<string, string> = {};
    for (const [idx, color] of this._gapDColors.entries()) {
      const gx = idx % gapVColsCount;
      const gy = Math.floor(idx / gapVColsCount);
      gapDColors[`${gx},${gy}`] = color;
    }

    return {
      cols: this._cols,
      rows: this._rows,
      grid,
      gapH,
      gapV,
      gapD,
      cellColors,
      gapHColors,
      gapVColors,
      gapDColors,
      drawColor,
      bgProps,
      bgImg,
      bgVisible,
      v: 7,
    };
  }

  /**
   * Deserializes and loads grid state from a ProjectData or SessionData object.
   *
   * @param data The ProjectData or SessionData object to load
   */
  public fromProjectData(data: ProjectData | SessionData): void {
    if (!data || typeof data.cols !== 'number' || typeof data.rows !== 'number') {
      throw new Error('Invalid project data: cols and rows must be specified.');
    }

    this._cols = data.cols;
    this._rows = data.rows;
    this._cells = new Uint8Array(this._cols * this._rows);
    this._gapH = new Uint8Array(Math.max(0, this._rows - 1) * this._cols);
    this._gapV = new Uint8Array(this._rows * Math.max(0, this._cols - 1));
    this._gapD = new Uint8Array(Math.max(0, this._rows - 1) * Math.max(0, this._cols - 1));
    this._cellColors.clear();
    this._gapHColors.clear();
    this._gapVColors.clear();
    this._gapDColors.clear();

    // Load cells (supports 2D grid or flat 1D cells array)
    if ('grid' in data && Array.isArray((data as ProjectData).grid)) {
      for (let y = 0; y < this._rows; y++) {
        const row = (data as ProjectData).grid[y];
        if (row && Array.isArray(row)) {
          for (let x = 0; x < this._cols; x++) {
            if (row[x]) {
              this.setCell(x, y, 1);
            }
          }
        }
      }
    } else if (data.cells && (Array.isArray(data.cells) || data.cells instanceof Uint8Array)) {
      const len = Math.min(data.cells.length, this._cells.length);
      for (let i = 0; i < len; i++) {
        if (data.cells[i]) {
          this._cells[i] = 1;
        }
      }
    }

    // Load gapH (supports 2D matrix or flat 1D array)
    if (Array.isArray(data.gapH)) {
      if (data.gapH.length > 0 && Array.isArray(data.gapH[0])) {
        const matrix = data.gapH as unknown as number[][];
        const maxH = Math.min(matrix.length, this._rows - 1);
        for (let gy = 0; gy < maxH; gy++) {
          const row = matrix[gy];
          if (row && Array.isArray(row)) {
            for (let gx = 0; gx < this._cols; gx++) {
              if (row[gx]) {
                this.setGapH(gx, gy, 1);
              }
            }
          }
        }
      } else {
        const len = Math.min(data.gapH.length, this._gapH.length);
        for (let i = 0; i < len; i++) {
          if (data.gapH[i]) {
            this._gapH[i] = 1;
          }
        }
      }
    }

    // Load gapV (supports 2D matrix or flat 1D array)
    if (Array.isArray(data.gapV)) {
      if (data.gapV.length > 0 && Array.isArray(data.gapV[0])) {
        const matrix = data.gapV as unknown as number[][];
        const maxVRows = Math.min(matrix.length, this._rows);
        for (let gy = 0; gy < maxVRows; gy++) {
          const row = matrix[gy];
          if (row && Array.isArray(row)) {
            const maxVCols = Math.min(row.length, this._cols - 1);
            for (let gx = 0; gx < maxVCols; gx++) {
              if (row[gx]) {
                this.setGapV(gx, gy, 1);
              }
            }
          }
        }
      } else {
        const len = Math.min(data.gapV.length, this._gapV.length);
        for (let i = 0; i < len; i++) {
          if (data.gapV[i]) {
            this._gapV[i] = 1;
          }
        }
      }
    }

    // Load gapD (supports 2D matrix or flat 1D array)
    if (Array.isArray(data.gapD)) {
      if (data.gapD.length > 0 && Array.isArray(data.gapD[0])) {
        const matrix = data.gapD as unknown as number[][];
        const maxDRows = Math.min(matrix.length, this._rows - 1);
        for (let gy = 0; gy < maxDRows; gy++) {
          const row = matrix[gy];
          if (row && Array.isArray(row)) {
            const maxDCols = Math.min(row.length, this._cols - 1);
            for (let gx = 0; gx < maxDCols; gx++) {
              if (row[gx]) {
                this.setGapD(gx, gy, 1);
              }
            }
          }
        }
      } else {
        const len = Math.min(data.gapD.length, this._gapD.length);
        for (let i = 0; i < len; i++) {
          if (data.gapD[i]) {
            this._gapD[i] = 1;
          }
        }
      }
    }

    // Load cell colors (supports "x,y" keys or numeric flat indices)
    if (data.cellColors && typeof data.cellColors === 'object') {
      for (const [key, color] of Object.entries(data.cellColors)) {
        if (key.includes(',')) {
          const [xStr, yStr] = key.split(',');
          const x = parseInt(xStr, 10);
          const y = parseInt(yStr, 10);
          if (!isNaN(x) && !isNaN(y) && this.isCellInBounds(x, y)) {
            this.setCellColor(x, y, color);
          }
        } else {
          const idx = parseInt(key, 10);
          if (!isNaN(idx) && idx >= 0 && idx < this._cells.length) {
            this._cellColors.set(idx, color);
          }
        }
      }
    }

    // Load gapH colors (supports "gx,gy" keys or numeric flat indices)
    if (data.gapHColors && typeof data.gapHColors === 'object') {
      for (const [key, color] of Object.entries(data.gapHColors)) {
        if (key.includes(',')) {
          const [gxStr, gyStr] = key.split(',');
          const gx = parseInt(gxStr, 10);
          const gy = parseInt(gyStr, 10);
          if (!isNaN(gx) && !isNaN(gy) && this.isGapHInBounds(gx, gy)) {
            this.setGapHColor(gx, gy, color);
          }
        } else {
          const idx = parseInt(key, 10);
          if (!isNaN(idx) && idx >= 0 && idx < this._gapH.length) {
            this._gapHColors.set(idx, color);
          }
        }
      }
    }

    // Load gapV colors (supports "gx,gy" keys or numeric flat indices)
    if (data.gapVColors && typeof data.gapVColors === 'object') {
      for (const [key, color] of Object.entries(data.gapVColors)) {
        if (key.includes(',')) {
          const [gxStr, gyStr] = key.split(',');
          const gx = parseInt(gxStr, 10);
          const gy = parseInt(gyStr, 10);
          if (!isNaN(gx) && !isNaN(gy) && this.isGapVInBounds(gx, gy)) {
            this.setGapVColor(gx, gy, color);
          }
        } else {
          const idx = parseInt(key, 10);
          if (!isNaN(idx) && idx >= 0 && idx < this._gapV.length) {
            this._gapVColors.set(idx, color);
          }
        }
      }
    }

    // Load gapD colors (supports "gx,gy" keys or numeric flat indices)
    if (data.gapDColors && typeof data.gapDColors === 'object') {
      for (const [key, color] of Object.entries(data.gapDColors)) {
        if (key.includes(',')) {
          const [gxStr, gyStr] = key.split(',');
          const gx = parseInt(gxStr, 10);
          const gy = parseInt(gyStr, 10);
          if (!isNaN(gx) && !isNaN(gy) && this.isGapDInBounds(gx, gy)) {
            this.setGapDColor(gx, gy, color);
          }
        } else {
          const idx = parseInt(key, 10);
          if (!isNaN(idx) && idx >= 0 && idx < this._gapD.length) {
            this._gapDColors.set(idx, color);
          }
        }
      }
    }
  }
}
