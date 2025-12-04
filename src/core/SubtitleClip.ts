/**
 * Video Editor V2 - SubtitleClip Class
 * Represents a subtitle segment on a subtitle track.
 * Self-contained (no source reference) - stores cues and style directly.
 */

import type {
  SubtitleCue,
  SubtitleStyle,
  SubtitleClipConfig,
  SubtitleClipJSON,
} from './types';
import { createSubtitleClipId, createCueId } from '../utils/id';
import { SUBTITLE } from '../constants';

export class SubtitleClip {
  readonly id: string;

  /** Position on timeline (microseconds) */
  startUs: number;

  /** Array of subtitle cues */
  private _cues: SubtitleCue[];

  /** Style settings */
  style: SubtitleStyle;

  /** Display label */
  label: string;

  /** Trim offset from original cue start (microseconds) - used for left-edge trimming */
  private _trimStartUs: number = 0;

  /** Explicit duration override (microseconds) - used for right-edge trimming */
  private _explicitDurationUs?: number;

  constructor(config: SubtitleClipConfig, id?: string) {
    this.id = id ?? createSubtitleClipId();
    this.startUs = config.startUs;
    this._cues = [...config.cues];
    this.style = { ...config.style };
    this.label = config.label ?? 'Subtitles';
    this._trimStartUs = config.trimStartUs ?? 0;
    this._explicitDurationUs = config.explicitDurationUs;

    this.sortCues();
  }

  /**
   * Get all cues (read-only)
   */
  get cues(): readonly SubtitleCue[] {
    return this._cues;
  }

  /**
   * Get cue count
   */
  get cueCount(): number {
    return this._cues.length;
  }

  /**
   * Duration on timeline (respects explicit duration if set, otherwise computed from cues)
   */
  get durationUs(): number {
    if (this._explicitDurationUs !== undefined) {
      return this._explicitDurationUs;
    }
    // Computed from cues minus trim offset
    const cueEnd = this._cues.length === 0
      ? SUBTITLE.DEFAULT_CUE_DURATION_US
      : Math.max(...this._cues.map((c) => c.endUs));
    return Math.max(0, cueEnd - this._trimStartUs);
  }

  /**
   * End position on timeline
   */
  get endUs(): number {
    return this.startUs + this.durationUs;
  }

  /**
   * Visible start offset within cue data (for filtering which cues to render)
   */
  get visibleStartUs(): number {
    return this._trimStartUs;
  }

  /**
   * Visible end offset within cue data (for filtering which cues to render)
   */
  get visibleEndUs(): number {
    return this._trimStartUs + this.durationUs;
  }

  /**
   * Get trim start offset (read-only access)
   */
  get trimStartUs(): number {
    return this._trimStartUs;
  }

  /**
   * Get explicit duration (read-only access)
   */
  get explicitDurationUs(): number | undefined {
    return this._explicitDurationUs;
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
   * Get active cues at a specific timeline time
   * Returns cues that should be displayed at the given time.
   * Filters cues based on the visible range (respects trimming).
   */
  getActiveCuesAt(timelineTimeUs: number): SubtitleCue[] {
    if (!this.isActiveAt(timelineTimeUs)) return [];

    // Convert timeline time to cue-relative time (accounting for trim offset)
    const cueRelativeTimeUs = timelineTimeUs - this.startUs + this._trimStartUs;

    return this._cues.filter((cue) => {
      // Cue must be within the visible range
      const cueIsInVisibleRange =
        cue.endUs > this._trimStartUs && cue.startUs < this.visibleEndUs;
      // And the current time must be within the cue's range
      const timeIsInCue =
        cueRelativeTimeUs >= cue.startUs && cueRelativeTimeUs < cue.endUs;
      return cueIsInVisibleRange && timeIsInCue;
    });
  }

  /**
   * Get all cues within the visible range (for display in SubtitlePanel)
   */
  getVisibleCues(): SubtitleCue[] {
    return this._cues.filter(
      (cue) =>
        cue.endUs > this._trimStartUs && cue.startUs < this.visibleEndUs
    );
  }

  /**
   * Add a new cue
   */
  addCue(cue: Omit<SubtitleCue, 'id'>): SubtitleCue {
    const newCue: SubtitleCue = {
      ...cue,
      id: createCueId(),
    };
    this._cues.push(newCue);
    this.sortCues();
    return newCue;
  }

  /**
   * Update an existing cue
   */
  updateCue(cueId: string, updates: Partial<Omit<SubtitleCue, 'id'>>): boolean {
    const cue = this._cues.find((c) => c.id === cueId);
    if (!cue) return false;

    if (updates.startUs !== undefined) cue.startUs = updates.startUs;
    if (updates.endUs !== undefined) cue.endUs = updates.endUs;
    if (updates.text !== undefined) cue.text = updates.text;

    this.sortCues();
    return true;
  }

  /**
   * Remove a cue by ID
   */
  removeCue(cueId: string): boolean {
    const index = this._cues.findIndex((c) => c.id === cueId);
    if (index === -1) return false;
    this._cues.splice(index, 1);
    return true;
  }

  /**
   * Get a cue by ID
   */
  getCue(cueId: string): SubtitleCue | undefined {
    return this._cues.find((c) => c.id === cueId);
  }

  /**
   * Move clip to a new timeline position
   */
  moveTo(newStartUs: number): void {
    this.startUs = Math.max(0, newStartUs);
  }

  /**
   * Trim the start of the clip (left edge drag)
   * Adjusts both the timeline position and the visible cue offset
   */
  trimStart(newStartUs: number): void {
    const delta = newStartUs - this.startUs;
    this.startUs = Math.max(0, newStartUs);
    this._trimStartUs = Math.max(0, this._trimStartUs + delta);

    // If we have an explicit duration, reduce it by the trim amount
    if (this._explicitDurationUs !== undefined) {
      this._explicitDurationUs = Math.max(0, this._explicitDurationUs - delta);
    }
  }

  /**
   * Trim the end of the clip (right edge drag)
   * Sets an explicit duration
   */
  trimEnd(newEndUs: number): void {
    const newDuration = newEndUs - this.startUs;
    this._explicitDurationUs = Math.max(0, newDuration);
  }

  /**
   * Set explicit duration (for manual resizing)
   */
  setDuration(durationUs: number): void {
    this._explicitDurationUs = Math.max(0, durationUs);
  }

  /**
   * Split the clip at a specific timeline time
   * Returns the second half as a new clip, or null if split point is invalid
   */
  splitAt(timelineTimeUs: number): SubtitleClip | null {
    // Validate split point is within the clip
    if (timelineTimeUs <= this.startUs || timelineTimeUs >= this.endUs) {
      return null;
    }

    // Calculate the split point in cue-relative time
    const splitPointInCues = timelineTimeUs - this.startUs + this._trimStartUs;

    // Create the second clip (after the split)
    const secondClip = new SubtitleClip({
      startUs: timelineTimeUs,
      cues: this._cues.map((c) => ({ ...c, id: createCueId() })),
      style: { ...this.style },
      label: this.label,
      trimStartUs: splitPointInCues,
      explicitDurationUs: this.endUs - timelineTimeUs,
    });

    // Adjust this clip's duration to end at the split point
    this._explicitDurationUs = timelineTimeUs - this.startUs;

    return secondClip;
  }

  /**
   * Sort cues by start time
   */
  private sortCues(): void {
    this._cues.sort((a, b) => a.startUs - b.startUs);
  }

  /**
   * Clone this clip with a new ID
   */
  clone(): SubtitleClip {
    return new SubtitleClip({
      startUs: this.startUs,
      cues: this._cues.map((c) => ({ ...c, id: createCueId() })),
      style: { ...this.style },
      label: this.label,
      trimStartUs: this._trimStartUs,
      explicitDurationUs: this._explicitDurationUs,
    });
  }

  /**
   * Serialize to JSON
   */
  toJSON(): SubtitleClipJSON {
    return {
      id: this.id,
      startUs: this.startUs,
      cues: this._cues.map((c) => ({ ...c })),
      style: { ...this.style },
      label: this.label,
      trimStartUs: this._trimStartUs || undefined,
      explicitDurationUs: this._explicitDurationUs,
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(json: SubtitleClipJSON): SubtitleClip {
    return new SubtitleClip(
      {
        startUs: json.startUs,
        cues: json.cues,
        style: json.style,
        label: json.label,
        trimStartUs: json.trimStartUs,
        explicitDurationUs: json.explicitDurationUs,
      },
      json.id
    );
  }

  /**
   * Create an empty subtitle clip with default style
   */
  static createEmpty(startUs: number = 0): SubtitleClip {
    return new SubtitleClip({
      startUs,
      cues: [],
      style: { ...SUBTITLE.DEFAULT_STYLE },
    });
  }
}
