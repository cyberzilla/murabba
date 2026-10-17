/**
 * ExportRenderer — Offscreen canvas rendering for PNG export.
 */
import type { GridModel } from '../core/GridModel';
import type { RenderConfig, BgProps } from '../types/grid';
import { computeCellRadius, computeGapHRadius, computeGapVRadius, computeGapDRadius } from '../core/RadiusCalculator';
import { drawRoundedRect } from './GridRenderer';

export interface ExportOptions {
  withBackground?: boolean;
  bgImage?: HTMLImageElement | null;
  bgProps?: BgProps;
  /** Scale factor for export resolution (1 = 72dpi, 2 = 144dpi, 4 = 288dpi, etc.) */
  scale?: number;
}

/**
 * Renders the grid content to an offscreen canvas and returns a data URL.
 */
function renderToOffscreen(
  model: GridModel,
  config: RenderConfig,
  options: ExportOptions = {},
  format: 'png' | 'webp'
): string {
  const total = config.cellSize + config.gapSize;
  const pad = config.padding;
  const cs = config.cellSize;
  const gs = config.gapSize;

  // Find bounding box of filled content
  let bb = model.getBoundingBox();
  if (!bb) {
    // Empty grid — export full grid
    bb = { minX: 0, minY: 0, maxX: model.cols - 1, maxY: model.rows - 1 };
  }

  const cw = (bb.maxX - bb.minX + 1) * total + pad * 2;
  const ch = (bb.maxY - bb.minY + 1) * total + pad * 2;
  const offX = pad - bb.minX * total;
  const offY = pad - bb.minY * total;

  const scale = options.scale || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cw * scale);
  canvas.height = Math.round(ch * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Background color (only when exporting with background, otherwise transparent)
  if (options.withBackground) {
    ctx.fillStyle = config.canvasBgColor;
    ctx.fillRect(0, 0, cw, ch);
  }

  // Background image
  if (options.withBackground && options.bgImage && options.bgProps) {
    const bp = options.bgProps;
    const img = options.bgImage;
    const crop = bp.crop || { x: 0, y: 0, w: 1, h: 1 };

    ctx.save();
    ctx.globalAlpha = bp.opacity;
    const blendMap: Record<string, GlobalCompositeOperation> = {
      normal: 'source-over',
      multiply: 'multiply',
      screen: 'screen',
      overlay: 'overlay',
      lighten: 'lighten',
    };
    ctx.globalCompositeOperation = blendMap[bp.blend] || 'source-over';

    const bx = offX + bp.x;
    const by = offY + bp.y;
    ctx.translate(bx + bp.w / 2, by + bp.h / 2);
    ctx.rotate((bp.rotate * Math.PI) / 180);
    try {
      ctx.drawImage(
        img,
        crop.x * img.naturalWidth, crop.y * img.naturalHeight,
        crop.w * img.naturalWidth, crop.h * img.naturalHeight,
        -bp.w / 2, -bp.h / 2, bp.w, bp.h
      );
    } catch { /* image not ready */ }
    ctx.restore();
  }

  // Reset composite
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // Draw gap-H
  for (let gy = 0; gy < model.rows - 1; gy++) {
    for (let gx = 0; gx < model.cols; gx++) {
      if (!model.isFilledGapH(gx, gy)) continue;
      ctx.fillStyle = model.getGapHColor(gx, gy) || config.drawColor;
      const radii = computeGapHRadius(model, gx, gy, config.cellRadius);
      const rx = offX + gx * total;
      const ry = offY + (gy + 1) * total - gs;
      drawRoundedRect(ctx, rx, ry, cs, gs, radii);
      ctx.fill();
    }
  }

  // Draw gap-V
  for (let gy = 0; gy < model.rows; gy++) {
    for (let gx = 0; gx < model.cols - 1; gx++) {
      if (!model.isFilledGapV(gx, gy)) continue;
      ctx.fillStyle = model.getGapVColor(gx, gy) || config.drawColor;
      const radii = computeGapVRadius(model, gx, gy, config.cellRadius);
      const rx = offX + (gx + 1) * total - gs;
      const ry = offY + gy * total;
      drawRoundedRect(ctx, rx, ry, gs, cs, radii);
      ctx.fill();
    }
  }

  // Draw gap-D
  for (let gy = 0; gy < model.rows - 1; gy++) {
    for (let gx = 0; gx < model.cols - 1; gx++) {
      if (!model.isFilledGapD(gx, gy)) continue;
      ctx.fillStyle = model.getGapDColor(gx, gy) || config.drawColor;
      const radii = computeGapDRadius(model, gx, gy, config.cellRadius, config.gapSize);
      const rx = offX + (gx + 1) * total - gs;
      const ry = offY + (gy + 1) * total - gs;
      drawRoundedRect(ctx, rx, ry, gs, gs, radii);
      ctx.fill();
    }
  }

  // Draw filled cells
  for (let y = 0; y < model.rows; y++) {
    for (let x = 0; x < model.cols; x++) {
      if (!model.isFilledCell(x, y)) continue;
      ctx.fillStyle = model.getCellColor(x, y) || config.drawColor;
      const radii = computeCellRadius(model, x, y, config.cellRadius);
      const rx = offX + x * total;
      const ry = offY + y * total;
      drawRoundedRect(ctx, rx, ry, cs, cs, radii);
      ctx.fill();
    }
  }

  if (format === 'webp') {
    return canvas.toDataURL('image/webp', 0.92);
  }
  return canvas.toDataURL('image/png');
}

/**
 * Exports the grid to a PNG data URL.
 * Calculates tight bounding box of filled content and renders to an offscreen canvas.
 */
export function exportToPNG(
  model: GridModel,
  config: RenderConfig,
  options: ExportOptions = {}
): string {
  return renderToOffscreen(model, config, options, 'png');
}

/**
 * Exports the grid to a WebP data URL.
 * Uses the same rendering pipeline as PNG but outputs WebP format.
 */
export function exportToWebP(
  model: GridModel,
  config: RenderConfig,
  options: ExportOptions = {}
): string {
  return renderToOffscreen(model, config, options, 'webp');
}

/**
 * Exports the grid to an SVG string.
 * Generates clean vector output with rounded rectangles.
 */
export function exportToSVG(
  model: GridModel,
  config: RenderConfig,
  options: ExportOptions = {}
): string {
  const total = config.cellSize + config.gapSize;
  const pad = config.padding;
  const cs = config.cellSize;
  const gs = config.gapSize;

  let bb = model.getBoundingBox();
  if (!bb) {
    bb = { minX: 0, minY: 0, maxX: model.cols - 1, maxY: model.rows - 1 };
  }

  const svgW = (bb.maxX - bb.minX + 1) * total + pad * 2;
  const svgH = (bb.maxY - bb.minY + 1) * total + pad * 2;
  const offX = pad - bb.minX * total;
  const offY = pad - bb.minY * total;

  const elements: string[] = [];

  // Background color + image
  if (options.withBackground) {
    elements.push(`<rect width="${svgW}" height="${svgH}" fill="${config.canvasBgColor}"/>`);

    if (options.bgImage && options.bgProps) {
      const bp = options.bgProps;
      const img = options.bgImage;
      try {
        const crop = bp.crop || { x: 0, y: 0, w: 1, h: 1 };
        const srcX = crop.x * img.naturalWidth;
        const srcY = crop.y * img.naturalHeight;
        const srcW = crop.w * img.naturalWidth;
        const srcH = crop.h * img.naturalHeight;
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = srcW;
        tmpCanvas.height = srcH;
        const tmpCtx = tmpCanvas.getContext('2d')!;
        tmpCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
        const dataUrl = tmpCanvas.toDataURL('image/png');

        const bx = offX + bp.x;
        const by = offY + bp.y;
        const cx = bx + bp.w / 2;
        const cy = by + bp.h / 2;
        const transforms: string[] = [];
        if (bp.rotate) transforms.push(`rotate(${bp.rotate} ${cx} ${cy})`);
        const tfAttr = transforms.length ? ` transform="${transforms.join(' ')}"` : '';

        elements.push(
          `<image href="${dataUrl}" x="${bx}" y="${by}" width="${bp.w}" height="${bp.h}" opacity="${bp.opacity}"${tfAttr} preserveAspectRatio="none"/>`
        );
      } catch { /* image not ready or tainted */ }
    }
  }

  // Helper to create SVG rect with individual corner radii
  function svgRect(x: number, y: number, w: number, h: number, color: string, r: [number, number, number, number]) {
    const maxR = Math.min(w, h) / 2;
    if (r[0] === r[1] && r[1] === r[2] && r[2] === r[3]) {
      elements.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(r[0], maxR)}" fill="${color}"/>`);
    } else {
      const tl = Math.min(r[0], maxR);
      const tr = Math.min(r[1], maxR);
      const br = Math.min(r[2], maxR);
      const bl = Math.min(r[3], maxR);
      const d = `M${x + tl},${y}`
        + `H${x + w - tr}`
        + `A${tr},${tr},0,0,1,${x + w},${y + tr}`
        + `V${y + h - br}`
        + `A${br},${br},0,0,1,${x + w - br},${y + h}`
        + `H${x + bl}`
        + `A${bl},${bl},0,0,1,${x},${y + h - bl}`
        + `V${y + tl}`
        + `A${tl},${tl},0,0,1,${x + tl},${y}`
        + `Z`;
      elements.push(`<path d="${d}" fill="${color}"/>`);
    }
  }

  // Gap-H
  for (let gy = 0; gy < model.rows - 1; gy++) {
    for (let gx = 0; gx < model.cols; gx++) {
      if (!model.isFilledGapH(gx, gy)) continue;
      const color = model.getGapHColor(gx, gy) || config.drawColor;
      const radii = computeGapHRadius(model, gx, gy, config.cellRadius);
      svgRect(offX + gx * total, offY + (gy + 1) * total - gs, cs, gs, color, radii);
    }
  }

  // Gap-V
  for (let gy = 0; gy < model.rows; gy++) {
    for (let gx = 0; gx < model.cols - 1; gx++) {
      if (!model.isFilledGapV(gx, gy)) continue;
      const color = model.getGapVColor(gx, gy) || config.drawColor;
      const radii = computeGapVRadius(model, gx, gy, config.cellRadius);
      svgRect(offX + (gx + 1) * total - gs, offY + gy * total, gs, cs, color, radii);
    }
  }

  // Gap-D
  for (let gy = 0; gy < model.rows - 1; gy++) {
    for (let gx = 0; gx < model.cols - 1; gx++) {
      if (!model.isFilledGapD(gx, gy)) continue;
      const color = model.getGapDColor(gx, gy) || config.drawColor;
      const radii = computeGapDRadius(model, gx, gy, config.cellRadius, gs);
      svgRect(offX + (gx + 1) * total - gs, offY + (gy + 1) * total - gs, gs, gs, color, radii);
    }
  }

  // Cells
  for (let y = 0; y < model.rows; y++) {
    for (let x = 0; x < model.cols; x++) {
      if (!model.isFilledCell(x, y)) continue;
      const color = model.getCellColor(x, y) || config.drawColor;
      const radii = computeCellRadius(model, x, y, config.cellRadius);
      svgRect(offX + x * total, offY + y * total, cs, cs, color, radii);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">
${elements.join('\n')}
</svg>`;
}
