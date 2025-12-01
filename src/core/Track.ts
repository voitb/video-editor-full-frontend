/**
 * Video Editor V2 - Track Class
 * A track contains multiple clips of the same type (video or audio).
 */

import type { TrackType, TrackConfig, TrackJSON, ClipConfig } from './types';
import { Clip } from './Clip';
import { createTrackId } from '../utils/id';

export class Track {
  readonly id: string;
  readonly type: TrackType;
  label: string;

  private _clips: Clip[] = [];

  constructor(config: TrackConfig, id?: string) {
    this.id = id ?? createTrackId();
    this.type = config.type;
    this.label = config.label;
  }

  /**
   * Get all clips (read-only)
   */
  get clips(): readonly Clip[] {
    return this._clips;
  }

  /**
   * Get track duration (end of last clip)
   */
  get durationUs(): number {
    if (this._clips.length === 0) return 0;
    return Math.max(...this._clips.map(c => c.endUs));
  }

  /**
   * Get clip count
   */
  get clipCount(): number {
    return this._clips.length;
  }

  /**
   * Add a clip to the track
   */
  addClip(clip: Clip): void {
    this._clips.push(clip);
    this.sortClips();
  }

  /**
   * Create and add a clip from config
   */
  createClip(config: ClipConfig): Clip {
    const clip = new Clip(config);
    this.addClip(clip);
    return clip;
  }

  /**
   * Remove a clip by ID
   */
  removeClip(clipId: string): boolean {
    const index = this._clips.findIndex(c => c.id === clipId);
    if (index === -1) return false;
    this._clips.splice(index, 1);
    return true;
  }

  /**
   * Get a clip by ID
   */
  getClip(clipId: string): Clip | undefined {
    return this._clips.find(c => c.id === clipId);
  }

  /**
   * Get clips that overlap a time range
   */
  getClipsInRange(startUs: number, endUs: number): Clip[] {
    return this._clips.filter(clip => clip.overlapsRange(startUs, endUs));
  }

  /**
   * Get the clip at a specific timeline time
   */
  getClipAt(timelineTimeUs: number): Clip | undefined {
    return this._clips.find(clip => clip.isActiveAt(timelineTimeUs));
  }

  /**
   * Get all clips that are active at a specific time
   * (For audio tracks, multiple clips might overlap)
   */
  getActiveClipsAt(timelineTimeUs: number): Clip[] {
    return this._clips.filter(clip => clip.isActiveAt(timelineTimeUs));
  }

  /**
   * Check if adding a clip at given position would overlap existing clips
   * (Useful for video tracks where overlaps are overlays)
   */
  wouldOverlap(startUs: number, endUs: number, excludeClipId?: string): boolean {
    return this._clips.some(
      clip => clip.id !== excludeClipId && clip.overlapsRange(startUs, endUs)
    );
  }

  /**
   * Find the first gap in the track where a clip of given duration could fit
   */
  findGap(durationUs: number, afterUs: number = 0): number {
    // Sort clips by start time
    const sorted = [...this._clips].sort((a, b) => a.startUs - b.startUs);

    let currentEnd = afterUs;
    for (const clip of sorted) {
      if (clip.startUs >= currentEnd + durationUs) {
        // Found a gap
        return currentEnd;
      }
      currentEnd = Math.max(currentEnd, clip.endUs);
    }

    // No gap found, append at end
    return currentEnd;
  }

  /**
   * Sort clips by start time
   */
  private sortClips(): void {
    this._clips.sort((a, b) => a.startUs - b.startUs);
  }

  /**
   * Clone the track with new ID
   */
  clone(): Track {
    const track = new Track({ type: this.type, label: this.label });
    for (const clip of this._clips) {
      track.addClip(clip.clone());
    }
    return track;
  }

  /**
   * Clear all clips
   */
  clear(): void {
    this._clips = [];
  }

  /**
   * Serialize to JSON
   */
  toJSON(): TrackJSON {
    return {
      id: this.id,
      type: this.type,
      label: this.label,
      clips: this._clips.map(c => c.toJSON()),
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(json: TrackJSON): Track {
    const track = new Track({ type: json.type, label: json.label }, json.id);
    for (const clipJson of json.clips) {
      track.addClip(Clip.fromJSON(clipJson));
    }
    return track;
  }
}
