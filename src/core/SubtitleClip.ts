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

  constructor(config: SubtitleClipConfig, id?: string) {
    this.id = id ?? createSubtitleClipId();
    this.startUs = config.startUs;
    this._cues = [...config.cues];
    this.style = { ...config.style };
    this.label = config.label ?? 'Subtitles';

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
   * Duration on timeline (computed from last cue end)
   */
  get durationUs(): number {
    if (this._cues.length === 0) return SUBTITLE.DEFAULT_CUE_DURATION_US;
    return Math.max(...this._cues.map((c) => c.endUs));
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
   * Get active cues at a specific timeline time
   * Returns cues that should be displayed at the given time
   */
  getActiveCuesAt(timelineTimeUs: number): SubtitleCue[] {
    if (!this.isActiveAt(timelineTimeUs)) return [];

    // Convert timeline time to clip-relative time
    const clipRelativeTimeUs = timelineTimeUs - this.startUs;

    return this._cues.filter(
      (cue) =>
        clipRelativeTimeUs >= cue.startUs && clipRelativeTimeUs < cue.endUs
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
