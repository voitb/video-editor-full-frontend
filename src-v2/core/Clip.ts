/**
 * Video Editor V2 - Clip Class
 * Represents a segment of a source placed on a track.
 */

import type { ClipConfig, ClipJSON } from './types';
import { createClipId } from '../utils/id';
import { TIMELINE } from '../constants';

export class Clip {
  readonly id: string;
  readonly sourceId: string;

  /** Position on timeline (microseconds) */
  startUs: number;

  /** Trim in-point in source (microseconds) */
  trimIn: number;

  /** Trim out-point in source (microseconds) */
  trimOut: number;

  /** Opacity for video overlays (0-1) */
  opacity: number;

  /** Volume for audio (0-1) */
  volume: number;

  /** Display label */
  label: string;

  constructor(config: ClipConfig, id?: string) {
    this.id = id ?? createClipId();
    this.sourceId = config.sourceId;
    this.startUs = config.startUs;
    this.trimIn = config.trimIn;
    this.trimOut = config.trimOut;
    this.opacity = config.opacity ?? 1;
    this.volume = config.volume ?? 1;
    this.label = config.label ?? '';

    this.validate();
  }

  /**
   * Visible duration on timeline (computed from trim)
   */
  get durationUs(): number {
    return this.trimOut - this.trimIn;
  }

  /**
   * End position on timeline
   */
  get endUs(): number {
    return this.startUs + this.durationUs;
  }

  /**
   * Source duration (same as durationUs for clips)
   */
  get sourceDurationUs(): number {
    return this.trimOut - this.trimIn;
  }

  /**
   * Check if clip is active at a given timeline time
   */
  isActiveAt(timelineTimeUs: number): boolean {
    return timelineTimeUs >= this.startUs && timelineTimeUs < this.endUs;
  }

  /**
   * Convert timeline time to source time
   * Returns the position within the source that corresponds to the timeline time
   */
  timelineToSource(timelineTimeUs: number): number {
    const offsetInClip = timelineTimeUs - this.startUs;
    return this.trimIn + offsetInClip;
  }

  /**
   * Convert source time to timeline time
   */
  sourceToTimeline(sourceTimeUs: number): number {
    const offsetInSource = sourceTimeUs - this.trimIn;
    return this.startUs + offsetInSource;
  }

  /**
   * Check if a timeline time range overlaps with this clip
   */
  overlapsRange(startUs: number, endUs: number): boolean {
    return this.startUs < endUs && this.endUs > startUs;
  }

  /**
   * Move clip to a new timeline position
   */
  moveTo(newStartUs: number): void {
    this.startUs = Math.max(0, newStartUs);
  }

  /**
   * Set trim points (validates constraints)
   */
  setTrim(trimIn: number, trimOut: number, sourceDurationUs: number): void {
    // Clamp to valid range
    const validTrimIn = Math.max(0, Math.min(trimIn, sourceDurationUs));
    const validTrimOut = Math.max(validTrimIn + TIMELINE.MIN_CLIP_DURATION_US, Math.min(trimOut, sourceDurationUs));

    this.trimIn = validTrimIn;
    this.trimOut = validTrimOut;
  }

  /**
   * Trim from the start (left edge drag)
   * Adjusts both timeline position and source trim
   */
  trimStart(newStartUs: number, sourceDurationUs: number): void {
    const delta = newStartUs - this.startUs;
    const newTrimIn = this.trimIn + delta;

    // Ensure minimum duration and valid trim
    if (newTrimIn >= 0 && newTrimIn < this.trimOut - TIMELINE.MIN_CLIP_DURATION_US) {
      this.startUs = newStartUs;
      this.trimIn = newTrimIn;
    }
  }

  /**
   * Trim from the end (right edge drag)
   */
  trimEnd(newEndUs: number, sourceDurationUs: number): void {
    const newDuration = newEndUs - this.startUs;
    const newTrimOut = this.trimIn + newDuration;

    // Ensure minimum duration and valid trim
    if (newTrimOut <= sourceDurationUs && newTrimOut > this.trimIn + TIMELINE.MIN_CLIP_DURATION_US) {
      this.trimOut = newTrimOut;
    }
  }

  /**
   * Clone this clip with a new ID
   */
  clone(): Clip {
    return new Clip({
      sourceId: this.sourceId,
      startUs: this.startUs,
      trimIn: this.trimIn,
      trimOut: this.trimOut,
      opacity: this.opacity,
      volume: this.volume,
      label: this.label,
    });
  }

  /**
   * Validate clip state
   */
  private validate(): void {
    if (this.startUs < 0) {
      throw new Error('Clip startUs cannot be negative');
    }
    if (this.trimIn < 0) {
      throw new Error('Clip trimIn cannot be negative');
    }
    if (this.trimOut <= this.trimIn) {
      throw new Error('Clip trimOut must be greater than trimIn');
    }
    if (this.opacity < 0 || this.opacity > 1) {
      throw new Error('Clip opacity must be between 0 and 1');
    }
    if (this.volume < 0 || this.volume > 1) {
      throw new Error('Clip volume must be between 0 and 1');
    }
  }

  /**
   * Serialize to JSON
   */
  toJSON(): ClipJSON {
    return {
      id: this.id,
      sourceId: this.sourceId,
      startUs: this.startUs,
      trimIn: this.trimIn,
      trimOut: this.trimOut,
      opacity: this.opacity,
      volume: this.volume,
      label: this.label,
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(json: ClipJSON): Clip {
    return new Clip(
      {
        sourceId: json.sourceId,
        startUs: json.startUs,
        trimIn: json.trimIn,
        trimOut: json.trimOut,
        opacity: json.opacity,
        volume: json.volume,
        label: json.label,
      },
      json.id
    );
  }
}
