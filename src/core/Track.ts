/**
 * Video Editor V2 - Track Class
 * A track contains multiple clips of the same type (video, audio, or subtitle).
 */

import type {
  TrackType,
  TrackConfig,
  TrackJSON,
  ClipConfig,
  SubtitleClipConfig,
} from './types';
import { Clip } from './Clip';
import { SubtitleClip } from './SubtitleClip';
import { createTrackId } from '../utils/id';

/** Union type for all clip types */
export type AnyClip = Clip | SubtitleClip;

/** Type guard for SubtitleClip */
export function isSubtitleClip(clip: AnyClip): clip is SubtitleClip {
  return clip instanceof SubtitleClip;
}

/** Type guard for regular Clip */
export function isMediaClip(clip: AnyClip): clip is Clip {
  return clip instanceof Clip;
}

export class Track {
  readonly id: string;
  readonly type: TrackType;
  label: string;

  private _clips: AnyClip[] = [];

  constructor(config: TrackConfig, id?: string) {
    this.id = id ?? createTrackId();
    this.type = config.type;
    this.label = config.label;
  }

  /**
   * Check if this is a subtitle track
   */
  isSubtitleTrack(): boolean {
    return this.type === 'subtitle';
  }

  /**
   * Get all clips (read-only)
   */
  get clips(): readonly AnyClip[] {
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
  addClip(clip: AnyClip): void {
    this._clips.push(clip);
    this.sortClips();
  }

  /**
   * Create and add a media clip from config (for video/audio tracks)
   */
  createClip(config: ClipConfig): Clip {
    const clip = new Clip(config);
    this.addClip(clip);
    return clip;
  }

  /**
   * Create and add a subtitle clip from config (for subtitle tracks)
   */
  createSubtitleClip(config: SubtitleClipConfig): SubtitleClip {
    const clip = new SubtitleClip(config);
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
  getClip(clipId: string): AnyClip | undefined {
    return this._clips.find((c) => c.id === clipId);
  }

  /**
   * Get clips that overlap a time range
   */
  getClipsInRange(startUs: number, endUs: number): AnyClip[] {
    return this._clips.filter((clip) => clip.overlapsRange(startUs, endUs));
  }

  /**
   * Get the clip at a specific timeline time
   */
  getClipAt(timelineTimeUs: number): AnyClip | undefined {
    return this._clips.find((clip) => clip.isActiveAt(timelineTimeUs));
  }

  /**
   * Get all clips that are active at a specific time
   * (For audio tracks, multiple clips might overlap)
   */
  getActiveClipsAt(timelineTimeUs: number): AnyClip[] {
    return this._clips.filter((clip) => clip.isActiveAt(timelineTimeUs));
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
    const mediaClips = this._clips.filter(isMediaClip);
    const subtitleClips = this._clips.filter(isSubtitleClip);

    return {
      id: this.id,
      type: this.type,
      label: this.label,
      clips: mediaClips.map((c) => c.toJSON()),
      subtitleClips:
        subtitleClips.length > 0
          ? subtitleClips.map((c) => c.toJSON())
          : undefined,
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(json: TrackJSON): Track {
    const track = new Track({ type: json.type, label: json.label }, json.id);

    // Load media clips
    for (const clipJson of json.clips) {
      track.addClip(Clip.fromJSON(clipJson));
    }

    // Load subtitle clips
    if (json.subtitleClips) {
      for (const subClipJson of json.subtitleClips) {
        track.addClip(SubtitleClip.fromJSON(subClipJson));
      }
    }

    return track;
  }
}
