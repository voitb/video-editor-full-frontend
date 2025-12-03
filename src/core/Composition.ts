/**
 * Video Editor V2 - Composition Class
 * Root container for the video composition model.
 */

import type {
  CompositionConfig,
  CompositionJSON,
  TrackConfig,
  ClipConfig,
  ActiveClip,
  SubtitleClipConfig,
} from './types';
import { Track, isMediaClip, isSubtitleClip } from './Track';
import type { AnyClip } from './Track';
import { Clip } from './Clip';
import { SubtitleClip } from './SubtitleClip';
import { Source } from './Source';
import { createCompositionId } from '../utils/id';
import { COMPOSITION } from '../constants';

export class Composition {
  readonly id: string;
  readonly config: CompositionConfig;

  private _tracks: Track[] = [];
  private _sources: Map<string, Source> = new Map();
  private _fixedDurationUs: number | null = null;

  constructor(config?: Partial<CompositionConfig>, id?: string) {
    this.id = id ?? createCompositionId();
    this.config = {
      width: config?.width ?? COMPOSITION.DEFAULT_WIDTH,
      height: config?.height ?? COMPOSITION.DEFAULT_HEIGHT,
      frameRate: config?.frameRate ?? COMPOSITION.DEFAULT_FRAME_RATE,
    };
    // Initialize fixed duration from config if provided
    if (config?.fixedDurationUs !== undefined) {
      this._fixedDurationUs = config.fixedDurationUs;
    }
  }

  // ============================================================================
  // TRACK MANAGEMENT
  // ============================================================================

  /**
   * Get all tracks (read-only)
   */
  get tracks(): readonly Track[] {
    return this._tracks;
  }

  /**
   * Get video tracks only
   */
  get videoTracks(): Track[] {
    return this._tracks.filter(t => t.type === 'video');
  }

  /**
   * Get audio tracks only
   */
  get audioTracks(): Track[] {
    return this._tracks.filter((t) => t.type === 'audio');
  }

  /**
   * Get subtitle tracks only
   */
  get subtitleTracks(): Track[] {
    return this._tracks.filter((t) => t.type === 'subtitle');
  }

  /**
   * Get track count
   */
  get trackCount(): number {
    return this._tracks.length;
  }

  /**
   * Add a track
   */
  addTrack(track: Track): void {
    this._tracks.push(track);
    this.sortTracks();
  }

  /**
   * Create and add a track
   */
  createTrack(config: TrackConfig): Track {
    const track = new Track(config);
    this.addTrack(track);
    return track;
  }

  /**
   * Remove a track by ID
   */
  removeTrack(trackId: string): boolean {
    const index = this._tracks.findIndex(t => t.id === trackId);
    if (index === -1) return false;
    this._tracks.splice(index, 1);
    return true;
  }

  /**
   * Get a track by ID
   */
  getTrack(trackId: string): Track | undefined {
    return this._tracks.find(t => t.id === trackId);
  }

  /**
   * Get track index (for z-ordering)
   */
  getTrackIndex(trackId: string): number {
    return this._tracks.findIndex(t => t.id === trackId);
  }

  /**
   * Sort tracks: video first, then audio, then subtitle
   */
  private sortTracks(): void {
    const typeOrder: Record<string, number> = { video: 0, audio: 1, subtitle: 2 };
    this._tracks.sort((a, b) => {
      return (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
    });
  }

  // ============================================================================
  // SOURCE MANAGEMENT
  // ============================================================================

  /**
   * Get all sources
   */
  get sources(): ReadonlyMap<string, Source> {
    return this._sources;
  }

  /**
   * Register a source
   */
  registerSource(source: Source): void {
    this._sources.set(source.id, source);
  }

  /**
   * Unregister a source
   */
  unregisterSource(sourceId: string): boolean {
    return this._sources.delete(sourceId);
  }

  /**
   * Get a source by ID
   */
  getSource(sourceId: string): Source | undefined {
    return this._sources.get(sourceId);
  }

  /**
   * Check if a source is used by any clip
   */
  isSourceInUse(sourceId: string): boolean {
    for (const track of this._tracks) {
      for (const clip of track.clips) {
        if (isMediaClip(clip) && clip.sourceId === sourceId) return true;
      }
    }
    return false;
  }

  /**
   * Get all clips that use a source
   */
  getClipsForSource(sourceId: string): Clip[] {
    const clips: Clip[] = [];
    for (const track of this._tracks) {
      for (const clip of track.clips) {
        if (isMediaClip(clip) && clip.sourceId === sourceId) {
          clips.push(clip);
        }
      }
    }
    return clips;
  }

  // ============================================================================
  // CLIP MANAGEMENT (Convenience methods)
  // ============================================================================

  /**
   * Get any clip by ID (searches all tracks)
   */
  getAnyClip(clipId: string): { clip: AnyClip; track: Track } | undefined {
    for (const track of this._tracks) {
      const clip = track.getClip(clipId);
      if (clip) return { clip, track };
    }
    return undefined;
  }

  /**
   * Get a media clip by ID (searches all tracks)
   */
  getClip(clipId: string): { clip: Clip; track: Track } | undefined {
    const result = this.getAnyClip(clipId);
    if (result && isMediaClip(result.clip)) {
      return { clip: result.clip, track: result.track };
    }
    return undefined;
  }

  /**
   * Get a subtitle clip by ID (searches all tracks)
   */
  getSubtitleClip(
    clipId: string
  ): { clip: SubtitleClip; track: Track } | undefined {
    const result = this.getAnyClip(clipId);
    if (result && isSubtitleClip(result.clip)) {
      return { clip: result.clip, track: result.track };
    }
    return undefined;
  }

  /**
   * Add a media clip to a track
   */
  addClipToTrack(trackId: string, config: ClipConfig): Clip | undefined {
    const track = this.getTrack(trackId);
    if (!track) return undefined;
    return track.createClip(config);
  }

  /**
   * Add a subtitle clip to a track
   */
  addSubtitleClipToTrack(
    trackId: string,
    config: SubtitleClipConfig
  ): SubtitleClip | undefined {
    const track = this.getTrack(trackId);
    if (!track || track.type !== 'subtitle') return undefined;
    return track.createSubtitleClip(config);
  }

  /**
   * Remove a clip from any track
   */
  removeClip(clipId: string): boolean {
    for (const track of this._tracks) {
      if (track.removeClip(clipId)) return true;
    }
    return false;
  }

  /**
   * Remove a clip and its linked clip
   */
  removeClipWithLinked(clipId: string): boolean {
    const result = this.getClip(clipId);
    if (!result) return false;

    const linkedClipId = result.clip.linkedClipId;

    // Remove the primary clip
    this.removeClip(clipId);

    // Remove the linked clip if it exists
    if (linkedClipId) {
      this.removeClip(linkedClipId);
    }

    return true;
  }

  // ============================================================================
  // CLIP LINKING
  // ============================================================================

  /**
   * Get the linked clip for a given clip
   */
  getLinkedClip(clipId: string): { clip: Clip; track: Track } | undefined {
    const result = this.getClip(clipId);
    if (!result || !result.clip.linkedClipId) return undefined;
    return this.getClip(result.clip.linkedClipId);
  }

  /**
   * Link two clips bidirectionally
   */
  linkClips(clipId1: string, clipId2: string): boolean {
    const result1 = this.getClip(clipId1);
    const result2 = this.getClip(clipId2);
    if (!result1 || !result2) return false;

    result1.clip.linkedClipId = clipId2;
    result2.clip.linkedClipId = clipId1;
    return true;
  }

  /**
   * Unlink a clip (removes link in both directions)
   */
  unlinkClip(clipId: string): boolean {
    const result = this.getClip(clipId);
    if (!result || !result.clip.linkedClipId) return false;

    const linkedResult = this.getClip(result.clip.linkedClipId);
    if (linkedResult) {
      linkedResult.clip.linkedClipId = undefined;
    }
    result.clip.linkedClipId = undefined;
    return true;
  }

  /**
   * Move a clip along with its linked clip
   */
  moveClipWithLinked(clipId: string, newStartUs: number): boolean {
    const result = this.getClip(clipId);
    if (!result) return false;

    const oldStartUs = result.clip.startUs;
    const delta = newStartUs - oldStartUs;

    // Move the primary clip
    result.clip.moveTo(newStartUs);

    // Move the linked clip by the same delta
    if (result.clip.linkedClipId) {
      const linkedResult = this.getClip(result.clip.linkedClipId);
      if (linkedResult) {
        linkedResult.clip.moveTo(linkedResult.clip.startUs + delta);
      }
    }

    return true;
  }

  /**
   * Trim clip start (left edge) along with its linked clip
   */
  trimStartWithLinked(
    clipId: string,
    newStartUs: number,
    getSourceDuration: (sourceId: string) => number
  ): boolean {
    const result = this.getClip(clipId);
    if (!result) return false;

    const sourceDuration = getSourceDuration(result.clip.sourceId);

    // Calculate the delta before trimming
    const oldStartUs = result.clip.startUs;
    const delta = newStartUs - oldStartUs;

    // Trim the primary clip
    result.clip.trimStart(newStartUs, sourceDuration);

    // Trim the linked clip by the same amount
    if (result.clip.linkedClipId) {
      const linkedResult = this.getClip(result.clip.linkedClipId);
      if (linkedResult) {
        const linkedSourceDuration = getSourceDuration(linkedResult.clip.sourceId);
        const linkedNewStart = linkedResult.clip.startUs + delta;
        linkedResult.clip.trimStart(linkedNewStart, linkedSourceDuration);
      }
    }

    return true;
  }

  /**
   * Trim clip end (right edge) along with its linked clip
   */
  trimEndWithLinked(
    clipId: string,
    newEndUs: number,
    getSourceDuration: (sourceId: string) => number
  ): boolean {
    const result = this.getClip(clipId);
    if (!result) return false;

    const sourceDuration = getSourceDuration(result.clip.sourceId);

    // Calculate the delta before trimming
    const oldEndUs = result.clip.endUs;
    const delta = newEndUs - oldEndUs;

    // Trim the primary clip
    result.clip.trimEnd(newEndUs, sourceDuration);

    // Trim the linked clip by the same amount
    if (result.clip.linkedClipId) {
      const linkedResult = this.getClip(result.clip.linkedClipId);
      if (linkedResult) {
        const linkedSourceDuration = getSourceDuration(linkedResult.clip.sourceId);
        const linkedNewEnd = linkedResult.clip.endUs + delta;
        linkedResult.clip.trimEnd(linkedNewEnd, linkedSourceDuration);
      }
    }

    return true;
  }

  // ============================================================================
  // DURATION & ACTIVE CLIPS
  // ============================================================================

  /**
   * Get total composition duration.
   * Returns fixed duration if set, otherwise computes from longest track.
   */
  get durationUs(): number {
    if (this._fixedDurationUs !== null) {
      return this._fixedDurationUs;
    }
    if (this._tracks.length === 0) return 0;
    return Math.max(...this._tracks.map(t => t.durationUs));
  }

  /**
   * Get computed duration from clips (ignoring fixed duration)
   */
  get computedDurationUs(): number {
    if (this._tracks.length === 0) return 0;
    return Math.max(...this._tracks.map(t => t.durationUs));
  }

  /**
   * Get fixed duration (null means use computed duration)
   */
  get fixedDurationUs(): number | null {
    return this._fixedDurationUs;
  }

  /**
   * Set fixed duration (null to use computed duration)
   */
  set fixedDurationUs(value: number | null) {
    this._fixedDurationUs = value;
  }

  /**
   * Get active clips at a specific timeline time
   * Returns clips sorted by track index for proper z-ordering
   * Note: Subtitle clips are excluded - they use HTML overlay rendering
   */
  getActiveClipsAt(timelineTimeUs: number): ActiveClip[] {
    const result: ActiveClip[] = [];

    for (let trackIndex = 0; trackIndex < this._tracks.length; trackIndex++) {
      const track = this._tracks[trackIndex]!;

      // Skip subtitle tracks - they use HTML overlay rendering
      if (track.type === 'subtitle') continue;

      for (const clip of track.getActiveClipsAt(timelineTimeUs)) {
        // Only process media clips
        if (!isMediaClip(clip)) continue;

        result.push({
          clipId: clip.id,
          sourceId: clip.sourceId,
          trackType: track.type,
          trackIndex,
          timelineStartUs: clip.startUs,
          sourceStartUs: clip.trimIn,
          sourceEndUs: clip.trimOut,
          opacity: clip.opacity,
          volume: clip.volume,
        });
      }
    }

    // Sort by track index (video: lower = background, audio: all mix together)
    return result.sort((a, b) => a.trackIndex - b.trackIndex);
  }

  /**
   * Get all active clips in a time range
   */
  getActiveClipsInRange(startUs: number, endUs: number): ActiveClip[] {
    const result: ActiveClip[] = [];
    const seen = new Set<string>();

    // Sample at regular intervals to catch all clips
    const step = Math.min(100_000, (endUs - startUs) / 100); // 100ms or 1% of range
    for (let time = startUs; time <= endUs; time += step) {
      for (const clip of this.getActiveClipsAt(time)) {
        if (!seen.has(clip.clipId)) {
          seen.add(clip.clipId);
          result.push(clip);
        }
      }
    }

    return result;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Serialize to JSON
   */
  toJSON(): CompositionJSON {
    return {
      id: this.id,
      config: {
        ...this.config,
        fixedDurationUs: this._fixedDurationUs ?? undefined,
      },
      tracks: this._tracks.map(t => t.toJSON()),
      sources: Array.from(this._sources.values()).map(s => s.toRefJSON()),
    };
  }

  /**
   * Create from JSON (sources must be re-loaded separately)
   */
  static fromJSON(json: CompositionJSON): Composition {
    const composition = new Composition(json.config, json.id);
    // Restore fixed duration from config
    if (json.config.fixedDurationUs !== undefined) {
      composition.fixedDurationUs = json.config.fixedDurationUs;
    }
    for (const trackJson of json.tracks) {
      composition.addTrack(Track.fromJSON(trackJson));
    }
    return composition;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Clear all tracks and sources
   */
  clear(): void {
    for (const source of this._sources.values()) {
      source.dispose();
    }
    this._sources.clear();
    this._tracks = [];
  }

  /**
   * Clone the composition (shallow - sources are shared)
   */
  clone(): Composition {
    const composition = new Composition(this.config);
    for (const track of this._tracks) {
      composition.addTrack(track.clone());
    }
    // Sources are shared, not cloned
    for (const [id, source] of this._sources) {
      composition._sources.set(id, source);
    }
    return composition;
  }
}
