/**
 * Overlay Processor
 * Handles overlay rendering to canvas for compositing.
 */

import type { OverlayPosition } from './types';

/**
 * Render an overlay bitmap to a canvas at the specified position.
 * Returns a canvas that can be used as a texture source.
 */
export function renderOverlayToCanvas(
  bitmap: ImageBitmap,
  position: OverlayPosition,
  compositionWidth: number,
  compositionHeight: number
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(compositionWidth, compositionHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Calculate pixel position from percentages
  const x = (position.xPercent / 100) * compositionWidth;
  const y = (position.yPercent / 100) * compositionHeight;

  // Calculate dimensions
  let width = bitmap.width;
  let height = bitmap.height;

  if (position.widthPercent !== null) {
    width = (position.widthPercent / 100) * compositionWidth;
    // Maintain aspect ratio if only width is specified
    if (position.heightPercent === null) {
      height = (width / bitmap.width) * bitmap.height;
    }
  }

  if (position.heightPercent !== null) {
    height = (position.heightPercent / 100) * compositionHeight;
    // Maintain aspect ratio if only height is specified
    if (position.widthPercent === null) {
      width = (height / bitmap.height) * bitmap.width;
    }
  }

  ctx.drawImage(bitmap, x, y, width, height);

  return canvas;
}

/**
 * Create a black canvas for compositing backgrounds.
 */
export function createBlackCanvas(
  width: number,
  height: number
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);
  }
  return canvas;
}
