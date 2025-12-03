/**
 * Video Editor V2 - OverlayClip Class
 * Represents an HTML overlay segment on an overlay track.
 * Self-contained (no source reference) - stores content and style directly.
 */

import type {
  OverlayContentType,
  OverlayPosition,
  OverlayStyle,
  OverlayClipConfig,
  OverlayClipJSON,
} from './types';
import { createOverlayClipId } from '../utils/id';
import { OVERLAY } from '../constants';

export class OverlayClip {
  readonly id: string;

  /** Position on timeline (microseconds) */
  startUs: number;

  /** Content type discriminator */
  contentType: OverlayContentType;

  /** Content string (plain text, HTML, or widget identifier) */
  content: string;

  /** Position on preview */
  position: OverlayPosition;

  /** Style settings */
  style: OverlayStyle;

  /** Display label */
  label: string;

  /** Explicit duration (microseconds) */
  private _explicitDurationUs: number;

  constructor(config: OverlayClipConfig, id?: string) {
    this.id = id ?? createOverlayClipId();
    this.startUs = config.startUs;
    this.contentType = config.contentType;
    this.content = config.content;
    this.position = { ...config.position };
    this.style = { ...config.style };
    this.label = config.label ?? 'Overlay';
    this._explicitDurationUs = config.explicitDurationUs ?? OVERLAY.DEFAULT_DURATION_US;
  }

  /**
   * Duration on timeline
   */
  get durationUs(): number {
    return this._explicitDurationUs;
  }

  /**
   * End position on timeline
   */
  get endUs(): number {
    return this.startUs + this.durationUs;
  }

  /**
   * Check if clip is active at a given timeline time
   */
  isActiveAt(timelineTimeUs: number): boolean {
    return timelineTimeUs >= this.startUs && timelineTimeUs < this.endUs;
  }

  /**
   * Check if a timeline time range overlaps with this clip
   */
  overlapsRange(rangeStartUs: number, rangeEndUs: number): boolean {
    return this.startUs < rangeEndUs && this.endUs > rangeStartUs;
  }

  /**
   * Move clip to a new timeline position
   */
  moveTo(newStartUs: number): void {
    this.startUs = Math.max(0, newStartUs);
  }

  /**
   * Trim the start of the clip (left edge drag)
   * Moves the start time and reduces duration
   */
  trimStart(newStartUs: number): void {
    const delta = newStartUs - this.startUs;
    const newDuration = this._explicitDurationUs - delta;

    if (newDuration < OVERLAY.MIN_DURATION_US) {
      return; // Don't trim below minimum duration
    }

    this.startUs = Math.max(0, newStartUs);
    this._explicitDurationUs = newDuration;
  }

  /**
   * Trim the end of the clip (right edge drag)
   * Sets a new duration
   */
  trimEnd(newEndUs: number): void {
    const newDuration = newEndUs - this.startUs;
    this._explicitDurationUs = Math.max(OVERLAY.MIN_DURATION_US, newDuration);
  }

  /**
   * Set explicit duration (for manual resizing)
   */
  setDuration(durationUs: number): void {
    this._explicitDurationUs = Math.max(OVERLAY.MIN_DURATION_US, durationUs);
  }

  /**
   * Set position on preview
   */
  setPosition(position: Partial<OverlayPosition>): void {
    if (position.xPercent !== undefined) {
      this.position.xPercent = Math.max(0, Math.min(100, position.xPercent));
    }
    if (position.yPercent !== undefined) {
      this.position.yPercent = Math.max(0, Math.min(100, position.yPercent));
    }
    if (position.widthPercent !== undefined) {
      this.position.widthPercent = position.widthPercent;
    }
    if (position.heightPercent !== undefined) {
      this.position.heightPercent = position.heightPercent;
    }
  }

  /**
   * Update content
   */
  setContent(content: string, contentType?: OverlayContentType): void {
    this.content = content;
    if (contentType !== undefined) {
      this.contentType = contentType;
    }
  }

  /**
   * Split the clip at a specific timeline time
   * Returns the second half as a new clip, or null if split point is invalid
   */
  splitAt(timelineTimeUs: number): OverlayClip | null {
    // Validate split point is within the clip
    if (timelineTimeUs <= this.startUs || timelineTimeUs >= this.endUs) {
      return null;
    }

    // Calculate durations
    const firstDuration = timelineTimeUs - this.startUs;
    const secondDuration = this.endUs - timelineTimeUs;

    // Ensure both clips meet minimum duration
    if (firstDuration < OVERLAY.MIN_DURATION_US || secondDuration < OVERLAY.MIN_DURATION_US) {
      return null;
    }

    // Create the second clip (after the split)
    const secondClip = new OverlayClip({
      startUs: timelineTimeUs,
      contentType: this.contentType,
      content: this.content,
      position: { ...this.position },
      style: { ...this.style },
      label: this.label,
      explicitDurationUs: secondDuration,
    });

    // Adjust this clip's duration to end at the split point
    this._explicitDurationUs = firstDuration;

    return secondClip;
  }

  /**
   * Clone this clip with a new ID
   */
  clone(): OverlayClip {
    return new OverlayClip({
      startUs: this.startUs,
      contentType: this.contentType,
      content: this.content,
      position: { ...this.position },
      style: { ...this.style },
      label: this.label,
      explicitDurationUs: this._explicitDurationUs,
    });
  }

  /**
   * Serialize to JSON
   */
  toJSON(): OverlayClipJSON {
    return {
      id: this.id,
      startUs: this.startUs,
      contentType: this.contentType,
      content: this.content,
      position: { ...this.position },
      style: { ...this.style },
      label: this.label,
      explicitDurationUs: this._explicitDurationUs,
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(json: OverlayClipJSON): OverlayClip {
    return new OverlayClip(
      {
        startUs: json.startUs,
        contentType: json.contentType,
        content: json.content,
        position: json.position,
        style: json.style,
        label: json.label,
        explicitDurationUs: json.explicitDurationUs,
      },
      json.id
    );
  }

  /**
   * Create an empty overlay clip with default style
   */
  static createEmpty(startUs: number = 0): OverlayClip {
    return new OverlayClip({
      startUs,
      contentType: 'text',
      content: 'New Overlay',
      position: { ...OVERLAY.DEFAULT_POSITION },
      style: { ...OVERLAY.DEFAULT_STYLE },
    });
  }

  /**
   * Create a text overlay with specified content
   */
  static createText(startUs: number, text: string): OverlayClip {
    return new OverlayClip({
      startUs,
      contentType: 'text',
      content: text,
      position: { ...OVERLAY.DEFAULT_POSITION },
      style: { ...OVERLAY.DEFAULT_STYLE },
      label: 'Text Overlay',
    });
  }

  /**
   * Create an HTML overlay with specified content
   */
  static createHtml(startUs: number, html: string): OverlayClip {
    return new OverlayClip({
      startUs,
      contentType: 'html',
      content: html,
      position: { ...OVERLAY.DEFAULT_POSITION },
      style: { ...OVERLAY.DEFAULT_STYLE },
      label: 'HTML Overlay',
    });
  }
}
