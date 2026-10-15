/**
 * BackgroundRenderer — Draws the reference background image layer.
 */
import type { BgProps, RenderConfig } from '../types/grid';

/**
 * Renders the background reference image onto the canvas context.
 * Handles position, scale, opacity, rotation, crop, and blend mode.
 */
export function renderBackground(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  props: BgProps,
  config: RenderConfig
): void {
  if (!image || !image.complete || image.naturalWidth === 0) return;

  const crop = props.crop || { x: 0, y: 0, w: 1, h: 1 };
  const cw = Math.min(1, Math.max(0.01, crop.w));
  const ch = Math.min(1, Math.max(0.01, crop.h));
  const cx = Math.min(1 - cw, Math.max(0, crop.x));
  const cy = Math.min(1 - ch, Math.max(0, crop.y));

  const sx = cx * image.naturalWidth;
  const sy = cy * image.naturalHeight;
  const sw = cw * image.naturalWidth;
  const sh = ch * image.naturalHeight;

  const dx = config.padding + props.x;
  const dy = config.padding + props.y;
  const dw = props.w;
  const dh = props.h;

  ctx.save();
  ctx.globalAlpha = props.opacity;

  // Map CSS blend modes to canvas composite operations
  const blendMap: Record<string, GlobalCompositeOperation> = {
    normal: 'source-over',
    multiply: 'multiply',
    screen: 'screen',
    overlay: 'overlay',
    lighten: 'lighter',
  };
  ctx.globalCompositeOperation = blendMap[props.blend] || 'source-over';

  // Apply rotation around the center of the image
  const centerX = dx + dw / 2;
  const centerY = dy + dh / 2;
  ctx.translate(centerX, centerY);
  ctx.rotate((props.rotate * Math.PI) / 180);

  try {
    ctx.drawImage(image, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  } catch {
    // Image may not be loaded yet
  }

  ctx.restore();
}
