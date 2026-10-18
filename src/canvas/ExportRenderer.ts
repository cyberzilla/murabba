/**
 * ExportRenderer — Offscreen canvas rendering for PNG export.
 */
import type { GridModel } from '../core/GridModel';
import type { RenderConfig, BgProps } from '../types/grid';
import { computeCellRadius, computeGapHRadius, computeGapVRadius, computeGapDRadius } from '../core/RadiusCalculator';
import { drawRoundedRect } from './GridRenderer';
import { renderMarks } from './MarkRenderer';

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

  // Draw marks (kaf-s, hamzah)
  if (model.marks && model.marks.length > 0) {
    const exportConfig: RenderConfig = {
      ...config,
      padding: offX,  // use export offset as padding
      // When exporting without background, marks should clear to transparent
      canvasBgColor: options.withBackground ? config.canvasBgColor : 'transparent',
    };
    // offY may differ from offX if grid is non-square, adjust per-mark
    // Since padding is used for both X and Y in mark rendering,
    // we need to translate if offX !== offY
    if (offX !== offY) {
      ctx.save();
      ctx.translate(0, offY - offX);
      renderMarks(ctx, model.marks, exportConfig);
      ctx.restore();
    } else {
      renderMarks(ctx, model.marks, exportConfig);
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

  // Marks (kaf-s, hamzah) — SVG equivalent of canvas mark rendering
  const svgBgColor = options.withBackground ? config.canvasBgColor : 'none';
  if (model.marks && model.marks.length > 0) {
    let clipId = 0;
    for (const mark of model.marks) {
      const markColor = mark.c || config.drawColor;
      if (mark.type === 'kaf-s') {
        const areaW = 2 * cs + gs;
        const areaH = 2 * cs + gs;
        const mx = offX + mark.col * total;
        const my = offY + mark.row * total;
        const r = Math.min(config.cellRadius, Math.floor(cs / 2));
        const lineW = Math.max(2, Math.round(cs / 2));
        const halfLW = lineW / 2;

        // Center of mark area for transforms
        const kcx = mx + areaW / 2;
        const kcy = my + areaH / 2;
        const transforms: string[] = [];
        if (mark.flipH) transforms.push(`translate(${kcx},${kcy}) scale(-1,1) translate(${-kcx},${-kcy})`);
        if (mark.rot) transforms.push(`rotate(${mark.rot * 90},${kcx},${kcy})`);
        const transformAttr = transforms.length > 0 ? ` transform="${transforms.join(' ')}"` : '';

        // Clip path for rounded area
        const cid = `mark-clip-${clipId++}`;
        if (r > 0) {
          elements.push(`<defs><clipPath id="${cid}"><rect x="${mx}" y="${my}" width="${areaW}" height="${areaH}" rx="${r}"/></clipPath></defs>`);
        }

        const clipAttr = r > 0 ? ` clip-path="url(#${cid})"` : '';

        // Wrap in group for transforms
        if (transformAttr) elements.push(`<g${transformAttr}>`);

        // Erase area (background rect)
        elements.push(`<rect x="${mx}" y="${my}" width="${areaW}" height="${areaH}" fill="${svgBgColor}"${clipAttr}/>`);

        // S-path
        const sx = mx + halfLW;
        const sy = my + halfLW;
        const sw = areaW - lineW;
        const sh = areaH - lineW;
        const y1 = sy;
        const y3 = sy + sh * 0.5;
        const y5 = sy + sh;
        const xL = sx;
        const xR = sx + sw;

        const sPath = `M${xR},${y1} L${xL},${y1} L${xL},${y3} L${xR},${y3} L${xR},${y5} L${xL},${y5}`;
        elements.push(`<path d="${sPath}" fill="none" stroke="${markColor}" stroke-width="${lineW}" stroke-linecap="square" stroke-linejoin="miter"${clipAttr}/>`);

        if (transformAttr) elements.push(`</g>`);

      } else if (mark.type === 'hamzah') {
        const mx = offX + mark.col * total;
        const my = offY + mark.row * total;
        const r = Math.min(config.cellRadius, Math.floor(cs / 2));
        // C-shape: lineWidth = cellSize / 3 (matches canvas renderer)
        const lineW = Math.max(2, Math.round(cs / 3));
        const halfLW = lineW / 2;

        // Center of mark area for transforms
        const hcx = mx + cs / 2;
        const hcy = my + cs / 2;
        const transforms: string[] = [];
        if (mark.flipH) transforms.push(`translate(${hcx},${hcy}) scale(-1,1) translate(${-hcx},${-hcy})`);
        if (mark.rot) transforms.push(`rotate(${mark.rot * 90},${hcx},${hcy})`);
        const transformAttr = transforms.length > 0 ? ` transform="${transforms.join(' ')}"` : '';

        const cid = `mark-clip-${clipId++}`;
        if (r > 0) {
          elements.push(`<defs><clipPath id="${cid}"><rect x="${mx}" y="${my}" width="${cs}" height="${cs}" rx="${r}"/></clipPath></defs>`);
        }

        const clipAttr = r > 0 ? ` clip-path="url(#${cid})"` : '';

        // Wrap in group for transforms
        if (transformAttr) elements.push(`<g${transformAttr}>`);

        // Erase area
        elements.push(`<rect x="${mx}" y="${my}" width="${cs}" height="${cs}" fill="${svgBgColor}"${clipAttr}/>`);

        // C-shape path: top bar → left bar → bottom bar (open right)
        const left = mx + halfLW;
        const right = mx + cs - halfLW;
        const top = my + halfLW;
        const bottom = my + cs - halfLW;
        const cornerR = Math.min(config.cellRadius, (cs - lineW) / 2);

        let cPath: string;
        if (cornerR > 0) {
          // C-shape with rounded corners using SVG arcs
          // Start at top-right, arc to top-left, line down, arc to bottom-left, line to bottom-right
          cPath = `M${right},${top}` +
            ` L${left + cornerR},${top}` +
            ` A${cornerR},${cornerR} 0 0,0 ${left},${top + cornerR}` +
            ` L${left},${bottom - cornerR}` +
            ` A${cornerR},${cornerR} 0 0,0 ${left + cornerR},${bottom}` +
            ` L${right},${bottom}`;
        } else {
          // Sharp corners
          cPath = `M${right},${top} L${left},${top} L${left},${bottom} L${right},${bottom}`;
        }

        elements.push(`<path d="${cPath}" fill="none" stroke="${markColor}" stroke-width="${lineW}" stroke-linecap="square" stroke-linejoin="miter"${clipAttr}/>`);

        if (transformAttr) elements.push(`</g>`);
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">
${elements.join('\n')}
</svg>`;
}

/**
 * Converts a hex color string to PostScript RGB components (0–1 range).
 */
function hexToPS(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`;
}

/**
 * Exports the grid to an EPS (Encapsulated PostScript) string.
 * Generates clean vector output compatible with Adobe Illustrator, CorelDRAW, and Inkscape.
 */
export function exportToEPS(
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

  const epsW = (bb.maxX - bb.minX + 1) * total + pad * 2;
  const epsH = (bb.maxY - bb.minY + 1) * total + pad * 2;
  const offX = pad - bb.minX * total;
  const offY = pad - bb.minY * total;

  const lines: string[] = [];

  // EPS header
  lines.push('%!PS-Adobe-3.0 EPSF-3.0');
  lines.push(`%%BoundingBox: 0 0 ${Math.ceil(epsW)} ${Math.ceil(epsH)}`);
  lines.push(`%%HiResBoundingBox: 0 0 ${epsW} ${epsH}`);
  lines.push('%%Title: Murabba Export');
  lines.push('%%Creator: Murabba Square Kufic Editor');
  lines.push(`%%CreationDate: ${new Date().toISOString()}`);
  lines.push('%%LanguageLevel: 2');
  lines.push('%%Pages: 1');
  lines.push('%%EndComments');
  lines.push('');

  // PostScript helper: rounded rect procedure
  // Stack: x y w h r rrect -> filled rounded rect
  lines.push('% Rounded rect procedure: x y w h r rrect');
  lines.push('/rrect {');
  lines.push('  /r exch def /h exch def /w exch def /y exch def /x exch def');
  lines.push('  newpath');
  lines.push('  x r add y moveto');
  lines.push('  x w add y x w add y h add r arcto 4 {pop} repeat');
  lines.push('  x w add y h add x y h add r arcto 4 {pop} repeat');
  lines.push('  x y h add x y r arcto 4 {pop} repeat');
  lines.push('  x y x w add y r arcto 4 {pop} repeat');
  lines.push('  closepath');
  lines.push('} def');
  lines.push('');

  // PostScript helper: 4-corner rounded rect procedure
  // Stack: x y w h tl tr br bl rrect4 -> path with 4 different corner radii
  lines.push('% 4-corner rounded rect: x y w h tl tr br bl rrect4');
  lines.push('/rrect4 {');
  lines.push('  /rbl exch def /rbr exch def /rtr exch def /rtl exch def');
  lines.push('  /h exch def /w exch def /y exch def /x exch def');
  lines.push('  newpath');
  lines.push('  x rtl add y moveto');
  lines.push('  x w add rtr sub y lineto');
  lines.push('  rtr 0 gt { x w add y x w add y rtr add rtr arcto 4 {pop} repeat } if');
  lines.push('  x w add y h add rbr sub lineto');
  lines.push('  rbr 0 gt { x w add y h add x w add rbr sub y h add rbr arcto 4 {pop} repeat } if');
  lines.push('  x rbl add y h add lineto');
  lines.push('  rbl 0 gt { x y h add x y h add rbl sub rbl arcto 4 {pop} repeat } if');
  lines.push('  x y rtl add lineto');
  lines.push('  rtl 0 gt { x y x rtl add y rtl arcto 4 {pop} repeat } if');
  lines.push('  closepath');
  lines.push('} def');
  lines.push('');

  // Flip Y axis: PostScript origin is bottom-left, we work top-left
  lines.push(`% Flip coordinate system to top-left origin`);
  lines.push(`0 ${epsH} translate`);
  lines.push('1 -1 scale');
  lines.push('');

  // Background
  if (options.withBackground) {
    lines.push(`% Background`);
    lines.push(`${hexToPS(config.canvasBgColor)} setrgbcolor`);
    lines.push(`0 0 ${epsW} ${epsH} 0 rrect fill`);
    lines.push('');
  }

  // Helper to emit a filled rounded rect with 4 radii
  function epsRect(x: number, y: number, w: number, h: number, color: string, r: [number, number, number, number]) {
    const maxR = Math.min(w, h) / 2;
    lines.push(`${hexToPS(color)} setrgbcolor`);
    if (r[0] === r[1] && r[1] === r[2] && r[2] === r[3]) {
      const cr = Math.min(r[0], maxR);
      lines.push(`${x} ${y} ${w} ${h} ${cr} rrect fill`);
    } else {
      const tl = Math.min(r[0], maxR);
      const tr = Math.min(r[1], maxR);
      const br = Math.min(r[2], maxR);
      const bl = Math.min(r[3], maxR);
      lines.push(`${x} ${y} ${w} ${h} ${tl} ${tr} ${br} ${bl} rrect4 fill`);
    }
  }

  // Gap-H
  for (let gy = 0; gy < model.rows - 1; gy++) {
    for (let gx = 0; gx < model.cols; gx++) {
      if (!model.isFilledGapH(gx, gy)) continue;
      const color = model.getGapHColor(gx, gy) || config.drawColor;
      const radii = computeGapHRadius(model, gx, gy, config.cellRadius);
      epsRect(offX + gx * total, offY + (gy + 1) * total - gs, cs, gs, color, radii);
    }
  }

  // Gap-V
  for (let gy = 0; gy < model.rows; gy++) {
    for (let gx = 0; gx < model.cols - 1; gx++) {
      if (!model.isFilledGapV(gx, gy)) continue;
      const color = model.getGapVColor(gx, gy) || config.drawColor;
      const radii = computeGapVRadius(model, gx, gy, config.cellRadius);
      epsRect(offX + (gx + 1) * total - gs, offY + gy * total, gs, cs, color, radii);
    }
  }

  // Gap-D
  for (let gy = 0; gy < model.rows - 1; gy++) {
    for (let gx = 0; gx < model.cols - 1; gx++) {
      if (!model.isFilledGapD(gx, gy)) continue;
      const color = model.getGapDColor(gx, gy) || config.drawColor;
      const radii = computeGapDRadius(model, gx, gy, config.cellRadius, gs);
      epsRect(offX + (gx + 1) * total - gs, offY + (gy + 1) * total - gs, gs, gs, color, radii);
    }
  }

  // Cells
  for (let y = 0; y < model.rows; y++) {
    for (let x = 0; x < model.cols; x++) {
      if (!model.isFilledCell(x, y)) continue;
      const color = model.getCellColor(x, y) || config.drawColor;
      const radii = computeCellRadius(model, x, y, config.cellRadius);
      epsRect(offX + x * total, offY + y * total, cs, cs, color, radii);
    }
  }

  // Marks (kaf-s, hamzah)
  const epsBgColor = options.withBackground ? config.canvasBgColor : null;
  if (model.marks && model.marks.length > 0) {
    lines.push('');
    lines.push('% Marks');
    for (const mark of model.marks) {
      const markColor = mark.c || config.drawColor;

      if (mark.type === 'kaf-s') {
        const areaW = 2 * cs + gs;
        const areaH = 2 * cs + gs;
        const mx = offX + mark.col * total;
        const my = offY + mark.row * total;
        const r = Math.min(config.cellRadius, Math.floor(cs / 2));
        const lineW = Math.max(2, Math.round(cs / 2));
        const halfLW = lineW / 2;

        // Center of mark area
        const kcx = mx + areaW / 2;
        const kcy = my + areaH / 2;

        lines.push('gsave');
        // Apply transforms (translate to center, apply, translate back)
        if (mark.flipH || mark.rot) {
          lines.push(`${kcx} ${kcy} translate`);
          if (mark.flipH) lines.push('-1 1 scale');
          if (mark.rot) lines.push(`${mark.rot * 90} rotate`);
          lines.push(`${-kcx} ${-kcy} translate`);
        }

        // Clip to rounded area
        if (r > 0) {
          lines.push(`${mx} ${my} ${areaW} ${areaH} ${r} rrect clip`);
        }

        // Erase area (background rect)
        if (epsBgColor) {
          lines.push(`${hexToPS(epsBgColor)} setrgbcolor`);
          lines.push(`${mx} ${my} ${areaW} ${areaH} 0 rrect fill`);
        }

        // S-zigzag path
        const sx = mx + halfLW;
        const sy = my + halfLW;
        const sw = areaW - lineW;
        const sh = areaH - lineW;
        const y1 = sy;
        const y3 = sy + sh * 0.5;
        const y5 = sy + sh;
        const xL = sx;
        const xR = sx + sw;

        lines.push(`${hexToPS(markColor)} setrgbcolor`);
        lines.push(`${lineW} setlinewidth`);
        lines.push('0 setlinecap 0 setlinejoin');
        lines.push('newpath');
        lines.push(`${xR} ${y1} moveto`);
        lines.push(`${xL} ${y1} lineto`);
        lines.push(`${xL} ${y3} lineto`);
        lines.push(`${xR} ${y3} lineto`);
        lines.push(`${xR} ${y5} lineto`);
        lines.push(`${xL} ${y5} lineto`);
        lines.push('stroke');

        lines.push('grestore');

      } else if (mark.type === 'hamzah') {
        const mx = offX + mark.col * total;
        const my = offY + mark.row * total;
        const r = Math.min(config.cellRadius, Math.floor(cs / 2));
        const lineW = Math.max(2, Math.round(cs / 3));
        const halfLW = lineW / 2;

        // Center of mark area
        const hcx = mx + cs / 2;
        const hcy = my + cs / 2;

        lines.push('gsave');
        if (mark.flipH || mark.rot) {
          lines.push(`${hcx} ${hcy} translate`);
          if (mark.flipH) lines.push('-1 1 scale');
          if (mark.rot) lines.push(`${mark.rot * 90} rotate`);
          lines.push(`${-hcx} ${-hcy} translate`);
        }

        // Clip to rounded area
        if (r > 0) {
          lines.push(`${mx} ${my} ${cs} ${cs} ${r} rrect clip`);
        }

        // Erase area
        if (epsBgColor) {
          lines.push(`${hexToPS(epsBgColor)} setrgbcolor`);
          lines.push(`${mx} ${my} ${cs} ${cs} 0 rrect fill`);
        }

        // C-shape path (open right)
        const left = mx + halfLW;
        const right = mx + cs - halfLW;
        const top = my + halfLW;
        const bottom = my + cs - halfLW;
        const cornerR = Math.min(config.cellRadius, (cs - lineW) / 2);

        lines.push(`${hexToPS(markColor)} setrgbcolor`);
        lines.push(`${lineW} setlinewidth`);
        lines.push('0 setlinecap 0 setlinejoin');
        lines.push('newpath');
        if (cornerR > 0) {
          // C-shape with rounded corners using arcto
          lines.push(`${right} ${top} moveto`);
          lines.push(`${left} ${top} ${left} ${bottom} ${cornerR} arcto 4 {pop} repeat`);
          lines.push(`${left} ${bottom} ${right} ${bottom} ${cornerR} arcto 4 {pop} repeat`);
          lines.push(`${right} ${bottom} lineto`);
        } else {
          lines.push(`${right} ${top} moveto`);
          lines.push(`${left} ${top} lineto`);
          lines.push(`${left} ${bottom} lineto`);
          lines.push(`${right} ${bottom} lineto`);
        }
        lines.push('stroke');

        lines.push('grestore');
      }
    }
  }

  // EPS footer
  lines.push('');
  lines.push('showpage');
  lines.push('%%EOF');

  return lines.join('\n');
}
