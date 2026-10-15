/**
 * Murabba - Mathematical and Color Utilities
 */

import { RGBColor } from '../types/grid';

/**
 * Clamps a numerical value between a minimum and maximum bound.
 *
 * @param value The value to clamp
 * @param min The minimum allowable value
 * @param max The maximum allowable value
 * @returns The clamped value within [min, max]
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    const temp = min;
    min = max;
    max = temp;
  }
  return Math.max(min, Math.min(max, value));
}

/**
 * Linearly interpolates between two numbers.
 *
 * @param a Start value
 * @param b End value
 * @param t Interpolation factor (0.0 - 1.0)
 * @returns Interpolated value
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Converts a hex color string (#RGB, #RRGGBB, or with optional alpha) to an RGBColor object.
 *
 * @param hex Hex color string (e.g. "#22C55E", "22C55E", "#FFF")
 * @returns RGBColor object or null if invalid
 */
export function hexToRgb(hex: string): RGBColor | null {
  if (!hex || typeof hex !== 'string') {
    return null;
  }

  // Remove leading '#' if present
  let cleanHex = hex.trim();
  if (cleanHex.startsWith('#')) {
    cleanHex = cleanHex.slice(1);
  }

  // Handle 3-character hex shorthand (#RGB -> #RRGGBB)
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map((char) => char + char)
      .join('');
  } else if (cleanHex.length === 4) {
    // #RGBA -> #RRGGBBAA (keep first 6 for RGB)
    cleanHex = cleanHex
      .slice(0, 3)
      .split('')
      .map((char) => char + char)
      .join('');
  } else if (cleanHex.length > 6) {
    // Truncate to first 6 chars for RGB
    cleanHex = cleanHex.slice(0, 6);
  }

  if (cleanHex.length !== 6) {
    return null;
  }

  if (!/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
    return null;
  }

  const intVal = parseInt(cleanHex, 16);
  if (isNaN(intVal)) {
    return null;
  }

  const r = (intVal >> 16) & 255;
  const g = (intVal >> 8) & 255;
  const b = intVal & 255;

  return { r, g, b };
}

/**
 * Converts RGB components to a standard 6-character hex color string (#RRGGBB).
 *
 * @param r Red component (0 - 255)
 * @param g Green component (0 - 255)
 * @param b Blue component (0 - 255)
 * @returns Hex string formatted as #RRGGBB
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clampComponent = (c: number): string => {
    const val = clamp(Math.round(c), 0, 255);
    return val.toString(16).padStart(2, '0').toUpperCase();
  };

  return `#${clampComponent(r)}${clampComponent(g)}${clampComponent(b)}`;
}

/**
 * Converts RGBA components to a standard CSS rgba(...) string.
 *
 * @param r Red component (0 - 255)
 * @param g Green component (0 - 255)
 * @param b Blue component (0 - 255)
 * @param a Alpha component (0.0 - 1.0)
 * @returns CSS rgba() string
 */
export function rgbaToString(r: number, g: number, b: number, a: number = 1): string {
  const cr = clamp(Math.round(r), 0, 255);
  const cg = clamp(Math.round(g), 0, 255);
  const cb = clamp(Math.round(b), 0, 255);
  const ca = clamp(a, 0, 1);
  return `rgba(${cr}, ${cg}, ${cb}, ${ca})`;
}

/**
 * Calculates Euclidean distance between two points (x1, y1) and (x2, y2).
 *
 * @param x1 First X coordinate
 * @param y1 First Y coordinate
 * @param x2 Second X coordinate
 * @param y2 Second Y coordinate
 * @returns Euclidean distance
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Converts degrees to radians.
 *
 * @param degrees Angle in degrees
 * @returns Angle in radians
 */
export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Converts radians to degrees.
 *
 * @param radians Angle in radians
 * @returns Angle in degrees
 */
export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}
