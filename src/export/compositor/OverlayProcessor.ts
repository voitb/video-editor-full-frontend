/**
 * Overlay Processor
 * Handles positioning and rendering overlays to canvas.
 */

import type { OverlayPosition } from './types';

/**
 * Render an overlay bitmap to a positioned canvas.
 * The bitmap is drawn at the correct position based on percentage coordinates.
 */
export function renderOverlayToCanvas(
  bitmap: ImageBitmap,
  position: OverlayPosition,
  width: number,
  height: number
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  // Clear canvas (transparent)
  ctx.clearRect(0, 0, width, height);

  // Calculate center position (percentages to pixels)
  const centerX = (position.xPercent / 100) * width;
  const centerY = (position.yPercent / 100) * height;

  // Draw centered (matching HtmlOverlay.tsx transform: translate(-50%, -50%))
  const drawX = centerX - bitmap.width / 2;
  const drawY = centerY - bitmap.height / 2;

  ctx.drawImage(bitmap, drawX, drawY);

  return canvas;
}

/**
 * Create a black canvas for use as base texture
 */
export function createBlackCanvas(width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);
  return canvas;
}
