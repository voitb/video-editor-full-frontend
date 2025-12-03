/**
 * Video Editor - Subtitle Renderer
 * Renders subtitle text to an OffscreenCanvas for burn-in during export.
 * Uses Canvas 2D API for text rendering, output is used as WebGL texture.
 */

import type { SubtitleCue, SubtitleStyle } from '../core/types';

/**
 * Active cue information for rendering
 */
export interface ActiveSubtitleCue {
  text: string;
  style: SubtitleStyle;
}

/**
 * Renders subtitles to an OffscreenCanvas.
 * The canvas can be used as a texture source for WebGL compositing.
 */
export class SubtitleRenderer {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas = new OffscreenCanvas(width, height);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context for subtitle rendering');
    this.ctx = ctx;
  }

  /**
   * Render active cues to the canvas.
   * Returns the canvas for use as a texture source.
   *
   * @param cues - Array of active cues with their styles
   * @returns The OffscreenCanvas with rendered subtitles
   */
  render(cues: ActiveSubtitleCue[]): OffscreenCanvas {
    const { ctx, width, height } = this;

    // Clear canvas (transparent)
    ctx.clearRect(0, 0, width, height);

    if (cues.length === 0) {
      return this.canvas;
    }

    // Render each cue (bottom to top if multiple)
    let yOffset = 0;

    for (let i = cues.length - 1; i >= 0; i--) {
      const { text, style } = cues[i]!;
      yOffset = this.renderCue(text, style, yOffset);
    }

    return this.canvas;
  }

  /**
   * Render a single cue at the bottom of the canvas.
   *
   * @param text - The subtitle text
   * @param style - Style settings
   * @param yOffset - Additional offset from bottom (for stacking)
   * @returns New yOffset for next cue
   */
  private renderCue(text: string, style: SubtitleStyle, yOffset: number): number {
    const { ctx, width, height } = this;

    // Scale font size based on canvas height (reference: 1080p)
    const scale = height / 1080;
    const scaledFontSize = Math.round(style.fontSize * scale);

    // Set font
    ctx.font = `${scaledFontSize}px ${style.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Split text into lines
    const lines = text.split('\n');

    // Calculate dimensions
    const lineHeight = scaledFontSize * 1.3;
    const maxWidth = width * 0.9;
    const padding = scaledFontSize * 0.4;

    // Wrap lines if needed and measure total dimensions
    const wrappedLines = this.wrapText(lines, maxWidth - padding * 2);
    const textHeight = wrappedLines.length * lineHeight;

    // Calculate total block height
    const blockHeight = textHeight + (style.showBackground ? padding * 2 : 0);

    // Position at bottom with offset
    const bottomMargin = height * 0.05;
    const baseY = height - bottomMargin - yOffset;

    // Draw background if enabled
    if (style.showBackground) {
      // Calculate background dimensions
      let bgWidth = 0;
      for (const line of wrappedLines) {
        const metrics = ctx.measureText(line);
        bgWidth = Math.max(bgWidth, metrics.width);
      }
      bgWidth += padding * 2;

      const bgX = (width - bgWidth) / 2;
      const bgY = baseY - blockHeight;

      ctx.fillStyle = style.backgroundColor;
      ctx.roundRect(bgX, bgY, bgWidth, blockHeight, scaledFontSize * 0.1);
      ctx.fill();
    }

    // Draw text with outline
    const textY = baseY - (style.showBackground ? padding : 0);

    for (let i = wrappedLines.length - 1; i >= 0; i--) {
      const line = wrappedLines[i]!;
      const y = textY - (wrappedLines.length - 1 - i) * lineHeight;

      // Draw outline (stroke)
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = scaledFontSize * 0.08;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, width / 2, y);

      // Draw fill
      ctx.fillStyle = style.color;
      ctx.fillText(line, width / 2, y);
    }

    // Return new offset for stacking
    return yOffset + blockHeight + scaledFontSize * 0.3;
  }

  /**
   * Wrap text lines to fit within maxWidth.
   */
  private wrapText(lines: string[], maxWidth: number): string[] {
    const { ctx } = this;
    const result: string[] = [];

    for (const line of lines) {
      const words = line.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine) {
          result.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        result.push(currentLine);
      }
    }

    return result;
  }

  /**
   * Clear the canvas.
   */
  clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Get the underlying canvas for texture upload.
   */
  getCanvas(): OffscreenCanvas {
    return this.canvas;
  }

  /**
   * Resize the renderer canvas.
   */
  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;

    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }
}

/**
 * Helper to get active subtitle cues at a specific time.
 * Used in export worker context.
 */
export function getActiveSubtitleCuesAt(
  subtitleTracks: Array<{
    clips: Array<{
      startUs: number;
      cues: SubtitleCue[];
      style: SubtitleStyle;
    }>;
  }>,
  timelineTimeUs: number
): ActiveSubtitleCue[] {
  const activeCues: ActiveSubtitleCue[] = [];

  for (const track of subtitleTracks) {
    for (const clip of track.clips) {
      // Get clip duration from last cue end
      const clipDurationUs =
        clip.cues.length > 0 ? Math.max(...clip.cues.map((c) => c.endUs)) : 0;
      const clipEndUs = clip.startUs + clipDurationUs;

      // Check if clip is active
      if (timelineTimeUs < clip.startUs || timelineTimeUs >= clipEndUs) {
        continue;
      }

      // Convert timeline time to clip-relative time
      const clipRelativeTimeUs = timelineTimeUs - clip.startUs;

      // Find active cues within this clip
      for (const cue of clip.cues) {
        if (clipRelativeTimeUs >= cue.startUs && clipRelativeTimeUs < cue.endUs) {
          activeCues.push({
            text: cue.text,
            style: clip.style,
          });
        }
      }
    }
  }

  return activeCues;
}
