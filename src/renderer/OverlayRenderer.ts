/**
 * Video Editor - Overlay Renderer
 * Renders overlay clips to ImageBitmap for burn-in during export.
 * Uses Canvas 2D API for text content and html2canvas for HTML content.
 * Runs in main thread (requires DOM access for html2canvas).
 */

// Lazy load html2canvas only when HTML rendering is needed (reduces initial bundle)
let html2canvasModule: typeof import('html2canvas') | null = null;
async function getHtml2Canvas() {
  if (!html2canvasModule) {
    html2canvasModule = await import('html2canvas');
  }
  return html2canvasModule.default;
}

import type {
  OverlayClipJSON,
  OverlayStyle,
  OverlayPosition,
} from '../core/types';

/**
 * Renders overlay clips to ImageBitmap.
 * The bitmaps can be transferred to a worker for WebGL compositing.
 */
export class OverlayRenderer {
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /**
   * Render an overlay clip to ImageBitmap.
   * The bitmap is a full-frame RGBA image with the overlay composited at its position.
   *
   * @param clip - Overlay clip data
   * @returns ImageBitmap ready for transfer to worker
   */
  async render(clip: OverlayClipJSON): Promise<ImageBitmap> {
    if (clip.contentType === 'html') {
      return this.renderHtml(clip.content, clip.style, clip.position);
    } else {
      // 'text' and 'widget' both render as text
      return this.renderText(clip.content, clip.style, clip.position);
    }
  }

  /**
   * Render text content using Canvas 2D API.
   * Similar approach to SubtitleRenderer but positioned anywhere on screen.
   */
  private async renderText(
    content: string,
    style: OverlayStyle,
    position: OverlayPosition
  ): Promise<ImageBitmap> {
    const canvas = new OffscreenCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context for overlay rendering');

    // Clear canvas (transparent)
    ctx.clearRect(0, 0, this.width, this.height);

    // Scale font size based on canvas height (reference: 1080p)
    const scale = this.height / 1080;
    const scaledFontSize = Math.round(style.fontSize * scale);
    const scaledPadding = Math.round(style.padding * scale);
    const scaledBorderRadius = Math.round(style.borderRadius * scale);

    // Set font for measuring
    const fontWeight = style.fontWeight === 'bold' ? 'bold' : 'normal';
    ctx.font = `${fontWeight} ${scaledFontSize}px ${style.fontFamily}`;
    ctx.textAlign = style.textAlign;
    ctx.textBaseline = 'middle';

    // Split content into lines
    const lines = content.split('\n');
    const lineHeight = scaledFontSize * 1.3;

    // Measure text dimensions
    let maxWidth = 0;
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      maxWidth = Math.max(maxWidth, metrics.width);
    }

    const textHeight = lines.length * lineHeight;
    const boxWidth = maxWidth + scaledPadding * 2;
    const boxHeight = textHeight + scaledPadding * 2;

    // Calculate position (percentage to pixels)
    const centerX = (position.xPercent / 100) * this.width;
    const centerY = (position.yPercent / 100) * this.height;

    // Box position (centered on position point)
    const boxX = centerX - boxWidth / 2;
    const boxY = centerY - boxHeight / 2;

    // Draw background box if has background color
    const bgColor = style.backgroundColor;
    if (bgColor && bgColor !== 'transparent' && !bgColor.endsWith(', 0)')) {
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, scaledBorderRadius);
      ctx.fill();
    }

    // Apply global opacity
    ctx.globalAlpha = style.opacity;

    // Draw text
    ctx.fillStyle = style.color;

    // Calculate text X position based on alignment
    let textX: number;
    if (style.textAlign === 'left') {
      textX = boxX + scaledPadding;
    } else if (style.textAlign === 'right') {
      textX = boxX + boxWidth - scaledPadding;
    } else {
      textX = centerX;
    }

    // Draw each line
    const textStartY = centerY - (textHeight / 2) + lineHeight / 2;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const y = textStartY + i * lineHeight;
      ctx.fillText(line, textX, y);
    }

    ctx.globalAlpha = 1;

    return canvas.transferToImageBitmap();
  }

  /**
   * Render HTML content using html2canvas.
   * Creates a temporary DOM element, renders it, then removes it.
   */
  private async renderHtml(
    content: string,
    style: OverlayStyle,
    position: OverlayPosition
  ): Promise<ImageBitmap> {
    // Scale based on output resolution (reference: 1080p)
    const scale = this.height / 1080;
    const scaledFontSize = Math.round(style.fontSize * scale);
    const scaledPadding = Math.round(style.padding * scale);
    const scaledBorderRadius = Math.round(style.borderRadius * scale);

    // Create container element
    const container = document.createElement('div');
    container.innerHTML = content;

    // Apply base styles
    container.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      font-family: ${style.fontFamily};
      font-size: ${scaledFontSize}px;
      font-weight: ${style.fontWeight};
      color: ${style.color};
      background-color: ${style.backgroundColor};
      padding: ${scaledPadding}px;
      border-radius: ${scaledBorderRadius}px;
      text-align: ${style.textAlign};
      opacity: ${style.opacity};
      max-width: ${this.width * 0.9}px;
      box-sizing: border-box;
      z-index: -1;
    `;

    // Append to body for rendering
    document.body.appendChild(container);

    try {
      // Render the HTML to canvas using html2canvas (lazy loaded)
      const html2canvas = await getHtml2Canvas();
      const htmlCanvas = await html2canvas(container, {
        backgroundColor: null, // Transparent background
        scale: 1,
        logging: false,
        useCORS: true,
        allowTaint: true,
      });

      // Remove the container
      document.body.removeChild(container);

      // Create full-frame canvas with overlay positioned correctly
      const canvas = new OffscreenCanvas(this.width, this.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get 2D context');

      // Clear canvas (transparent)
      ctx.clearRect(0, 0, this.width, this.height);

      // Calculate position (percentage to pixels, centered)
      const centerX = (position.xPercent / 100) * this.width;
      const centerY = (position.yPercent / 100) * this.height;
      const drawX = centerX - htmlCanvas.width / 2;
      const drawY = centerY - htmlCanvas.height / 2;

      // Draw the rendered HTML
      ctx.drawImage(htmlCanvas, drawX, drawY);

      return canvas.transferToImageBitmap();
    } catch (error) {
      // Clean up on error
      if (container.parentNode) {
        document.body.removeChild(container);
      }
      throw error;
    }
  }

  /**
   * Resize the renderer output dimensions.
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }
}

/**
 * Pre-render all overlay clips for export.
 * Returns array of rendered overlays with timing and position data.
 */
export interface RenderedOverlay {
  clipId: string;
  startUs: number;
  durationUs: number;
  bitmap: ImageBitmap;
  position: OverlayPosition;
  opacity: number;
  trackIndex: number;
}

/**
 * Helper function to pre-render all overlay clips from tracks.
 * Returns rendered overlays sorted by track index for proper z-ordering.
 *
 * @param tracks - Array of track JSON data
 * @param outputWidth - Export output width
 * @param outputHeight - Export output height
 * @returns Array of rendered overlays
 */
export async function preRenderOverlays(
  tracks: Array<{
    type: string;
    overlayClips?: OverlayClipJSON[];
  }>,
  outputWidth: number,
  outputHeight: number
): Promise<RenderedOverlay[]> {
  const renderer = new OverlayRenderer(outputWidth, outputHeight);
  const results: RenderedOverlay[] = [];

  // Find all overlay tracks and their clips
  let trackIndex = 0;
  for (const track of tracks) {
    if (track.type !== 'overlay' || !track.overlayClips) {
      continue;
    }

    // Render each overlay clip in this track
    for (const clip of track.overlayClips) {
      try {
        const bitmap = await renderer.render(clip);
        results.push({
          clipId: clip.id,
          startUs: clip.startUs,
          durationUs: clip.explicitDurationUs ?? 5_000_000, // Default 5 seconds
          bitmap,
          position: clip.position,
          opacity: clip.style.opacity,
          trackIndex,
        });
      } catch (error) {
        console.error(`Failed to render overlay ${clip.id}:`, error);
        // Skip failed overlays but continue with others
      }
    }

    trackIndex++;
  }

  return results;
}
