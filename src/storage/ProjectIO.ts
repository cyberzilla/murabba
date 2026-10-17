/**
 * Project Import/Export and File Download utilities for Murabba
 */

import type {
  RenderConfig,
  BgProps,
  ProjectData,
} from '../types/grid';
import type { GridModel } from '../core/GridModel';

/**
 * Converts a Map or Record of colors to a plain Record<number, string>
 */
function serializeColorMap(
  colors: Map<number, string> | Record<number, string> | undefined
): Record<number, string> {
  const result: Record<number, string> = {};
  if (!colors) return result;

  if (colors instanceof Map) {
    for (const [key, val] of colors.entries()) {
      result[key] = val;
    }
  } else {
    for (const [key, val] of Object.entries(colors)) {
      result[Number(key)] = val;
    }
  }
  return result;
}

/**
 * Parses color dictionary which may use either flat indices (number)
 * or legacy coordinates ("x,y").
 */
function parseColorsToMap(
  rawColors: Record<string | number, string> | undefined,
  width: number
): Map<number, string> {
  const map = new Map<number, string>();
  if (!rawColors || typeof rawColors !== 'object') return map;

  for (const [key, color] of Object.entries(rawColors)) {
    if (typeof color !== 'string') continue;

    if (key.includes(',')) {
      const [xStr, yStr] = key.split(',');
      const x = Number(xStr);
      const y = Number(yStr);
      if (!Number.isNaN(x) && !Number.isNaN(y)) {
        map.set(y * width + x, color);
      }
    } else {
      const index = Number(key);
      if (!Number.isNaN(index)) {
        map.set(index, color);
      }
    }
  }
  return map;
}

/**
 * Exports a project model and settings to a JSON string.
 * Supports both v2 flat Uint8Array structure and 2D arrays for backwards compatibility.
 *
 * @param model - Current grid model
 * @param config - Current render configuration
 * @param bgImg - Base64 or URL of the reference background image
 * @param bgProps - Background image properties (position, scale, crop, blend)
 * @returns Serialized JSON string
 */
export function exportProject(
  model: GridModel,
  config: RenderConfig,
  bgImg: string | null = null,
  bgProps: BgProps = {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    opacity: 1,
    blend: 'normal',
    rotate: 0,
    crop: { x: 0, y: 0, w: 1, h: 1 },
  }
): string {
  const cols = model.cols;
  const rows = model.rows;
  const snapshot = model.createSnapshot();

  // Build flat arrays
  const cells = Array.from(snapshot.cells);
  const gapH = Array.from(snapshot.gapH);
  const gapV = Array.from(snapshot.gapV);
  const gapD = Array.from(snapshot.gapD);

  // Generate 2D arrays for legacy/external tool compatibility
  const grid2D: number[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) {
      row.push(cells[y * cols + x] ? 1 : 0);
    }
    grid2D.push(row);
  }

  const gapH2D: number[][] = [];
  for (let y = 0; y < rows - 1; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) {
      row.push(gapH[y * cols + x] ? 1 : 0);
    }
    gapH2D.push(row);
  }

  const gapV2D: number[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols - 1; x++) {
      row.push(gapV[y * (cols - 1) + x] ? 1 : 0);
    }
    gapV2D.push(row);
  }

  const gapD2D: number[][] = [];
  for (let y = 0; y < rows - 1; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols - 1; x++) {
      row.push(gapD[y * (cols - 1) + x] ? 1 : 0);
    }
    gapD2D.push(row);
  }

  const payload = {
    app: 'Murabba',
    appVersion: '2.0.0',
    description: 'Square Kufic Calligraphy Editor',
    url: 'https://github.com/cyberzilla/murabba',
    exportedAt: new Date().toISOString(),
    format: 'murabba-project',
    version: 2,
    v: 7, // Legacy version identifier
    cols,
    rows,
    cells,
    gapH,
    gapV,
    gapD,
    grid: grid2D,
    gapH2D,
    gapV2D,
    gapD2D,
    cellColors: serializeColorMap(snapshot.cellColors),
    gapHColors: serializeColorMap(snapshot.gapHColors),
    gapVColors: serializeColorMap(snapshot.gapVColors),
    gapDColors: serializeColorMap(snapshot.gapDColors),
    drawColor: config.drawColor || '#22C55E',
    config: {
      cellSize: config.cellSize,
      gapSize: config.gapSize,
      cellRadius: config.cellRadius,
      axisEvery: config.axisEvery,
      showAxis: config.showAxis,
      axisColor: config.axisColor,
      showRulers: config.showRulers,
      zoom: config.zoom,
      canvasBgColor: config.canvasBgColor,
    },
    bgProps: {
      x: bgProps.x,
      y: bgProps.y,
      w: bgProps.w,
      h: bgProps.h,
      opacity: bgProps.opacity,
      rotate: bgProps.rotate,
      blend: bgProps.blend,
      crop: bgProps.crop ? { ...bgProps.crop } : { x: 0, y: 0, w: 1, h: 1 },
    },
    bgImg: bgImg || null,
    bgVisible: true,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Validates and imports a JSON string representing a Murabba project.
 * Handles both v2 format and legacy v1 2D array formats.
 *
 * @param json - Raw JSON string to import
 * @returns Validated ProjectData object
 * @throws Error if the JSON is malformed or invalid
 */
export function importProject(json: string): ProjectData {
  if (typeof json !== 'string' || !json.trim()) {
    throw new Error('Project import failed: JSON content is empty.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error('Invalid JSON format: unable to parse project file.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid project file: expected a JSON object.');
  }

  const cols = Number(parsed.cols);
  const rows = Number(parsed.rows);

  if (!Number.isInteger(cols) || cols <= 0 || !Number.isInteger(rows) || rows <= 0) {
    throw new Error('Invalid project dimensions: cols and rows must be positive integers.');
  }

  const hasCells = Array.isArray(parsed.cells);
  const hasGrid = Array.isArray(parsed.grid);

  if (!hasCells && !hasGrid) {
    throw new Error('Invalid project file: missing grid or cells data.');
  }

  const cellCount = cols * rows;
  const cells = new Uint8Array(cellCount);

  if (hasCells) {
    const rawCells = parsed.cells as number[];
    for (let i = 0; i < Math.min(rawCells.length, cellCount); i++) {
      cells[i] = rawCells[i] ? 1 : 0;
    }
  } else if (hasGrid) {
    const rawGrid = parsed.grid as number[][];
    for (let y = 0; y < Math.min(rawGrid.length, rows); y++) {
      const row = rawGrid[y];
      if (Array.isArray(row)) {
        for (let x = 0; x < Math.min(row.length, cols); x++) {
          cells[y * cols + x] = row[x] ? 1 : 0;
        }
      }
    }
  }

  // Parse gapH
  const gapHCount = (rows - 1) * cols;
  const gapH = new Uint8Array(gapHCount);
  if (Array.isArray(parsed.gapH)) {
    const rawGapH = parsed.gapH as unknown[];
    if (rawGapH.length > 0 && Array.isArray(rawGapH[0])) {
      // 2D format
      const matrix = rawGapH as number[][];
      for (let y = 0; y < Math.min(matrix.length, rows - 1); y++) {
        const row = matrix[y];
        if (Array.isArray(row)) {
          for (let x = 0; x < Math.min(row.length, cols); x++) {
            gapH[y * cols + x] = row[x] ? 1 : 0;
          }
        }
      }
    } else {
      // 1D format
      const list = rawGapH as number[];
      for (let i = 0; i < Math.min(list.length, gapHCount); i++) {
        gapH[i] = list[i] ? 1 : 0;
      }
    }
  }

  // Parse gapV
  const gapVCount = rows * (cols - 1);
  const gapV = new Uint8Array(gapVCount);
  if (Array.isArray(parsed.gapV)) {
    const rawGapV = parsed.gapV as unknown[];
    if (rawGapV.length > 0 && Array.isArray(rawGapV[0])) {
      // 2D format
      const matrix = rawGapV as number[][];
      for (let y = 0; y < Math.min(matrix.length, rows); y++) {
        const row = matrix[y];
        if (Array.isArray(row)) {
          for (let x = 0; x < Math.min(row.length, cols - 1); x++) {
            gapV[y * (cols - 1) + x] = row[x] ? 1 : 0;
          }
        }
      }
    } else {
      // 1D format
      const list = rawGapV as number[];
      for (let i = 0; i < Math.min(list.length, gapVCount); i++) {
        gapV[i] = list[i] ? 1 : 0;
      }
    }
  }

  // Parse gapD
  const gapDCount = (rows - 1) * (cols - 1);
  const gapD = new Uint8Array(gapDCount);
  if (Array.isArray(parsed.gapD)) {
    const rawGapD = parsed.gapD as unknown[];
    if (rawGapD.length > 0 && Array.isArray(rawGapD[0])) {
      // 2D format
      const matrix = rawGapD as number[][];
      for (let y = 0; y < Math.min(matrix.length, rows - 1); y++) {
        const row = matrix[y];
        if (Array.isArray(row)) {
          for (let x = 0; x < Math.min(row.length, cols - 1); x++) {
            gapD[y * (cols - 1) + x] = row[x] ? 1 : 0;
          }
        }
      }
    } else {
      // 1D format
      const list = rawGapD as number[];
      for (let i = 0; i < Math.min(list.length, gapDCount); i++) {
        gapD[i] = list[i] ? 1 : 0;
      }
    }
  }

  // Parse color maps
  const cellColors = parseColorsToMap(
    parsed.cellColors as Record<string | number, string> | undefined,
    cols
  );
  const gapHColors = parseColorsToMap(
    parsed.gapHColors as Record<string | number, string> | undefined,
    cols
  );
  const gapVColors = parseColorsToMap(
    parsed.gapVColors as Record<string | number, string> | undefined,
    cols - 1
  );
  const gapDColors = parseColorsToMap(
    parsed.gapDColors as Record<string | number, string> | undefined,
    cols - 1
  );

  const rawBgProps = (parsed.bgProps as Partial<BgProps>) || {};
  const bgProps: BgProps = {
    x: Number(rawBgProps.x) || 0,
    y: Number(rawBgProps.y) || 0,
    w: Number(rawBgProps.w) || 0,
    h: Number(rawBgProps.h) || 0,
    opacity: typeof rawBgProps.opacity === 'number' ? rawBgProps.opacity : 1,
    rotate: Number(rawBgProps.rotate) || 0,
    blend: rawBgProps.blend || 'normal',
    crop: rawBgProps.crop
      ? {
          x: Number(rawBgProps.crop.x) || 0,
          y: Number(rawBgProps.crop.y) || 0,
          w: Number(rawBgProps.crop.w) || 1,
          h: Number(rawBgProps.crop.h) || 1,
        }
      : { x: 0, y: 0, w: 1, h: 1 },
  };

  // Convert Uint8Arrays to 2D arrays for ProjectData format
  const grid2D: number[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) {
      row.push(cells[y * cols + x] || 0);
    }
    grid2D.push(row);
  }

  const gapH2D: number[][] = [];
  for (let y = 0; y < rows - 1; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) {
      row.push(gapH[y * cols + x] || 0);
    }
    gapH2D.push(row);
  }

  const gapV2D: number[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols - 1; x++) {
      row.push(gapV[y * (cols - 1) + x] || 0);
    }
    gapV2D.push(row);
  }

  const gapD2D: number[][] = [];
  for (let y = 0; y < rows - 1; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols - 1; x++) {
      row.push(gapD[y * (cols - 1) + x] || 0);
    }
    gapD2D.push(row);
  }

  // Convert Maps to Record<string, string>
  const cellColorsRec: Record<string, string> = {};
  for (const [k, v] of cellColors) cellColorsRec[String(k)] = v;
  const gapHColorsRec: Record<string, string> = {};
  for (const [k, v] of gapHColors) gapHColorsRec[String(k)] = v;
  const gapVColorsRec: Record<string, string> = {};
  for (const [k, v] of gapVColors) gapVColorsRec[String(k)] = v;
  const gapDColorsRec: Record<string, string> = {};
  for (const [k, v] of gapDColors) gapDColorsRec[String(k)] = v;

  const projectData: ProjectData = {
    v: Number(parsed.version) || Number(parsed.v) || 2,
    cols,
    rows,
    grid: grid2D,
    gapH: gapH2D,
    gapV: gapV2D,
    gapD: gapD2D,
    cellColors: cellColorsRec,
    gapHColors: gapHColorsRec,
    gapVColors: gapVColorsRec,
    gapDColors: gapDColorsRec,
    drawColor: typeof parsed.drawColor === 'string' ? parsed.drawColor : '#22C55E',
    config: parsed.config as Partial<RenderConfig> | undefined,
    bgProps,
    bgImg: typeof parsed.bgImg === 'string' ? parsed.bgImg : null,
    bgVisible: parsed.bgVisible !== false,
  };

  return projectData;
}

/**
 * Triggers a browser download for a JSON string.
 *
 * @param data - The JSON string content
 * @param filename - Name for the downloaded file (e.g. 'project.json')
 */
export function downloadJSON(data: string, filename: string): void {
  if (typeof document === 'undefined') return;

  const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.json') ? filename : `${filename}.json`;

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}

/**
 * Triggers a browser download for a PNG data URL.
 *
 * @param dataUrl - Base64 PNG image data URL (canvas.toDataURL())
 * @param filename - Name for the downloaded image file (e.g. 'kufi.png')
 */
export function downloadPNG(dataUrl: string, filename: string): void {
  if (typeof document === 'undefined') return;

  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename.endsWith('.png') ? filename : `${filename}.png`;

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
