/**
 * Overlay Processor
 * Handles overlay rendering to canvas for compositing.
 *
 * Note: OverlayRenderer pre-renders overlays to full-frame ImageBitmaps
 * with the overlay already positioned correctly within the frame.
 * This processor simply draws those bitmaps to the compositing canvas.
 */

import type { OverlayPosition } from './types';

/**
 * Render an overlay bitmap to a canvas for compositing.
 * Returns a canvas that can be used as a texture source.
 *
 * The bitmap is expected to be a full-frame image with the overlay
 * already positioned correctly by OverlayRenderer. We draw it at (0,0)
 * to preserve the pre-calculated positioning.
 *
 * @param bitmap - Pre-rendered overlay bitmap (full-frame with positioning applied)
 * @param _position - Position data (unused - positioning already applied in bitmap)
 * @param compositionWidth - Output composition width
 * @param compositionHeight - Output composition height
 */
export function renderOverlayToCanvas(
  bitmap: ImageBitmap,
  _position: OverlayPosition,
  compositionWidth: number,
  compositionHeight: number
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(compositionWidth, compositionHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Draw the full-frame bitmap at origin - positioning is already baked into the bitmap
  // by OverlayRenderer (which centers overlays on xPercent/yPercent coordinates)
  ctx.drawImage(bitmap, 0, 0);

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
