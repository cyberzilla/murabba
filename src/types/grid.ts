/**
 * Murabba - Grid and Calligraphy Types
 * Core type definitions for grid model, tools, rendering, and serialization.
 */

/**
 * Type of gap between cells:
 * - 'h': Horizontal gap (between vertical rows)
 * - 'v': Vertical gap (between horizontal columns)
 * - 'd': Diagonal / intersection dot (between 4 neighboring cells)
 */
export type GapType = 'h' | 'v' | 'd';

/**
 * Available editor tools.
 */
export type ToolType = 'draw' | 'erase' | 'fill' | 'brush' | 'pan' | 'select';

/**
 * Brush thickness mode: 1 (single cell), 2 (2x2), 3 (3x3).
 */
export type BrushMode = 1 | 2 | 3;

/**
 * Background layer canvas blend modes.
 */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'lighten';

/**
 * 2D Cell coordinate on the grid.
 */
export interface CellCoord {
  x: number;
  y: number;
}

/**
 * Coordinate and type of a gap element on the grid.
 */
export interface GapCoord {
  gx: number;
  gy: number;
  type: GapType;
}

/**
 * Normalized crop rectangle (values from 0.0 to 1.0).
 */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Background reference image transformation and blending properties.
 */
export interface BgProps {
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  blend: BlendMode;
  rotate: number;
  crop: CropRect;
}

/**
 * Internal raw state of the grid model.
 */
export interface GridState {
  cols: number;
  rows: number;
  cells: Uint8Array;         // flat index: y * cols + x
  gapH: Uint8Array;          // flat index: gy * cols + gx, size: (rows - 1) * cols
  gapV: Uint8Array;          // flat index: gy * (cols - 1) + gx, size: rows * (cols - 1)
  gapD: Uint8Array;          // flat index: gy * (cols - 1) + gx, size: (rows - 1) * (cols - 1)
  cellColors: Map<number, string>;
  gapHColors: Map<number, string>;
  gapVColors: Map<number, string>;
  gapDColors: Map<number, string>;
}

/**
 * Snapshot for undo/redo history stack.
 */
export interface HistorySnapshot {
  cols: number;
  rows: number;
  cells: Uint8Array;
  gapH: Uint8Array;
  gapV: Uint8Array;
  gapD: Uint8Array;
  cellColors: Map<number, string>;
  gapHColors: Map<number, string>;
  gapVColors: Map<number, string>;
  gapDColors: Map<number, string>;
}

/**
 * Letter glyph entry stored in library.
 */
export interface LetterEntry {
  ch: string;
  name: string;
  m: number[][];    // cell matrix [row][col]
  gH: number[][];   // gap-H matrix
  gV: number[][];   // gap-V matrix
  gD: number[][];   // gap-D matrix
  _builtin?: boolean;
}

/**
 * Block element data for stamped letters/glyphs.
 */
export interface BlockData {
  id: number;
  ch: string;
  cells: CellCoord[];
  color: string;
  gapOffsets: Array<{ t: GapType; lx: number; ly: number }>;
  originX: number;
  originY: number;
}

/**
 * Serialized project file format (v7 compatible).
 */
export interface ProjectData {
  cols: number;
  rows: number;
  grid: number[][];
  gapH: number[][];
  gapV: number[][];
  gapD: number[][];
  cellColors: Record<string, string>;
  gapHColors: Record<string, string>;
  gapVColors: Record<string, string>;
  gapDColors: Record<string, string>;
  drawColor: string;
  bgProps: BgProps;
  bgImg: string | null;
  bgVisible: boolean;
  v: number;
  version?: number;
  config?: Partial<RenderConfig>;
  cells?: Uint8Array;
}

/**
 * Configuration options for rendering the grid on HTML5 Canvas.
 */
export interface RenderConfig {
  cellSize: number;
  gapSize: number;
  cellRadius: number;
  padding: number;
  zoom: number;
  panX: number;
  panY: number;
  drawColor: string;
  emptyCellColor: string;
  canvasBgColor: string;
  showAxis: boolean;
  axisColor: string;
  axisEvery: number;
  showRulers: boolean;
}

/**
 * Selection data structure for cut/copy/paste and floating selections.
 */
export interface SelectionData {
  cells: Array<{ lx: number; ly: number; c: string }>;
  gH: Array<{ lx: number; ly: number; c: string }>;
  gV: Array<{ lx: number; ly: number; c: string }>;
  gD: Array<{ lx: number; ly: number; c: string }>;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

/**
 * Corner radii tuple: [top-left, top-right, bottom-right, bottom-left].
 */
export type CornerRadii = [number, number, number, number];

/**
 * Axis-aligned bounding box of filled elements.
 */
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 2D Rectangle with origin and dimensions.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Screen pixel coordinate.
 */
export interface ScreenCoord {
  px: number;
  py: number;
}

/**
 * Point in 2D space.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * RGB color component representation.
 */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * RGBA color component representation.
 */
export interface RGBAColor extends RGBColor {
  a: number;
}

/**
 * Result of a pointer hit test on the canvas grid.
 */
export interface HitResult {
  type: 'cell' | 'gapH' | 'gapV' | 'gapD';
  x: number;
  y: number;
}

/**
 * Supported language codes for i18n.
 */
export type SupportedLang = 'ar' | 'en' | 'id';

/**
 * Auto-save session data structure (serialized to localStorage / IDB).
 */
export interface SessionData {
  cols: number;
  rows: number;
  cells: number[];
  gapH: number[];
  gapV: number[];
  gapD: number[];
  cellColors: Record<string, string>;
  gapHColors: Record<string, string>;
  gapVColors: Record<string, string>;
  gapDColors: Record<string, string>;
  drawColor: string;
  config?: Partial<RenderConfig>;
  bgProps: BgProps;
  bgImg?: string | null;
  bgVisible: boolean;
  ts: number;
}
