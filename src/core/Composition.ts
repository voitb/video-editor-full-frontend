/**
 * Video Editor V2 - Composition Class
 * Root container for the video composition model.
 * Facade over helper modules for track, source, clip, and duration management.
 */

import type {
  CompositionConfig,
  CompositionJSON,
  TrackConfig,
  ClipConfig,
  ActiveClip,
  SubtitleClipConfig,
} from './types';
import { Track } from './Track';
import type { AnyClip } from './Track';
import { Clip } from './Clip';
import { SubtitleClip } from './SubtitleClip';
import { Source } from './Source';
import { createCompositionId } from '../utils/id';
import { COMPOSITION } from '../constants';

// Import helper modules
import * as TrackManager from './composition/TrackManager';
import * as SourceManager from './composition/SourceManager';
import * as ClipQuery from './composition/ClipQuery';
import * as ClipMutator from './composition/ClipMutator';
import * as ClipLinker from './composition/ClipLinker';
import * as DurationCalculator from './composition/DurationCalculator';
import * as CompositionSerializer from './composition/CompositionSerializer';

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
    if (config?.fixedDurationUs !== undefined) {
      this._fixedDurationUs = config.fixedDurationUs;
    }
  }

  // ============================================================================
  // TRACK MANAGEMENT
  // ============================================================================

  get tracks(): readonly Track[] {
    return this._tracks;
  }

  get videoTracks(): Track[] {
    return TrackManager.getVideoTracks(this._tracks);
  }

  get audioTracks(): Track[] {
    return TrackManager.getAudioTracks(this._tracks);
  }

  get subtitleTracks(): Track[] {
    return TrackManager.getSubtitleTracks(this._tracks);
  }

  get trackCount(): number {
    return this._tracks.length;
  }

  addTrack(track: Track): void {
    TrackManager.addTrack(this._tracks, track);
  }

  createTrack(config: TrackConfig): Track {
    return TrackManager.createTrack(this._tracks, config);
  }

  removeTrack(trackId: string): boolean {
    return TrackManager.removeTrack(this._tracks, trackId);
  }

  getTrack(trackId: string): Track | undefined {
    return TrackManager.getTrack(this._tracks, trackId);
  }

  getTrackIndex(trackId: string): number {
    return TrackManager.getTrackIndex(this._tracks, trackId);
  }

  normalizeTrackOrders(): void {
    TrackManager.normalizeTrackOrders(this._tracks);
  }

  reorderTrack(trackId: string, targetOrder: number): void {
    TrackManager.reorderTrack(this._tracks, trackId, targetOrder);
  }

  // ============================================================================
  // SOURCE MANAGEMENT
  // ============================================================================

  get sources(): ReadonlyMap<string, Source> {
    return this._sources;
  }

  registerSource(source: Source): void {
    SourceManager.registerSource(this._sources, source);
  }

  unregisterSource(sourceId: string): boolean {
    return SourceManager.unregisterSource(this._sources, sourceId);
  }

  getSource(sourceId: string): Source | undefined {
    return SourceManager.getSource(this._sources, sourceId);
  }

  isSourceInUse(sourceId: string): boolean {
    return SourceManager.isSourceInUse(this._tracks, sourceId);
  }

  getClipsForSource(sourceId: string): Clip[] {
    return SourceManager.getClipsForSource(this._tracks, sourceId);
  }

  // ============================================================================
  // CLIP MANAGEMENT
  // ============================================================================

  getAnyClip(clipId: string): { clip: AnyClip; track: Track } | undefined {
    return ClipQuery.getAnyClip(this._tracks, clipId);
  }

  getClip(clipId: string): { clip: Clip; track: Track } | undefined {
    return ClipQuery.getClip(this._tracks, clipId);
  }

  getSubtitleClip(clipId: string): { clip: SubtitleClip; track: Track } | undefined {
    return ClipQuery.getSubtitleClip(this._tracks, clipId);
  }

  addClipToTrack(trackId: string, config: ClipConfig): Clip | undefined {
    return ClipMutator.addClipToTrack(this._tracks, trackId, config);
  }

  addSubtitleClipToTrack(trackId: string, config: SubtitleClipConfig): SubtitleClip | undefined {
    return ClipMutator.addSubtitleClipToTrack(this._tracks, trackId, config);
  }

  removeClip(clipId: string): boolean {
    return ClipMutator.removeClip(this._tracks, clipId);
  }

  removeClipWithLinked(clipId: string): boolean {
    return ClipMutator.removeClipWithLinked(this._tracks, clipId);
  }

  // ============================================================================
  // CLIP LINKING
  // ============================================================================

  getLinkedClip(clipId: string): { clip: Clip; track: Track } | undefined {
    return ClipLinker.getLinkedClip(this._tracks, clipId);
  }

  linkClips(clipId1: string, clipId2: string): boolean {
    return ClipLinker.linkClips(this._tracks, clipId1, clipId2);
  }

  unlinkClip(clipId: string): boolean {
    return ClipLinker.unlinkClip(this._tracks, clipId);
  }

  moveClipWithLinked(clipId: string, newStartUs: number): boolean {
    return ClipLinker.moveClipWithLinked(this._tracks, clipId, newStartUs);
  }

  trimStartWithLinked(
    clipId: string,
    newStartUs: number,
    getSourceDuration: (sourceId: string) => number
  ): boolean {
    return ClipLinker.trimStartWithLinked(this._tracks, clipId, newStartUs, getSourceDuration);
  }

  trimEndWithLinked(
    clipId: string,
    newEndUs: number,
    getSourceDuration: (sourceId: string) => number
  ): boolean {
    return ClipLinker.trimEndWithLinked(this._tracks, clipId, newEndUs, getSourceDuration);
  }

  // ============================================================================
  // DURATION & ACTIVE CLIPS
  // ============================================================================

  get durationUs(): number {
    return DurationCalculator.getDuration(this._tracks, this._fixedDurationUs);
  }

  get computedDurationUs(): number {
    return DurationCalculator.computeDuration(this._tracks);
  }

  get fixedDurationUs(): number | null {
    return this._fixedDurationUs;
  }

  set fixedDurationUs(value: number | null) {
    this._fixedDurationUs = value;
  }

  getActiveClipsAt(timelineTimeUs: number): ActiveClip[] {
    return DurationCalculator.getActiveClipsAt(this._tracks, timelineTimeUs);
  }

  getActiveClipsInRange(startUs: number, endUs: number): ActiveClip[] {
    return DurationCalculator.getActiveClipsInRange(this._tracks, startUs, endUs);
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  toJSON(): CompositionJSON {
    return CompositionSerializer.toJSON(
      this.id,
      this.config,
      this._tracks,
      this._sources,
      this._fixedDurationUs
    );
  }

  static fromJSON(json: CompositionJSON): Composition {
    const composition = new Composition(json.config, json.id);
    if (json.config.fixedDurationUs !== undefined) {
      composition.fixedDurationUs = json.config.fixedDurationUs;
    }
    const tracks = CompositionSerializer.tracksFromJSON(json);
    for (const track of tracks) {
      composition.addTrack(track);
    }
    return composition;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  clear(): void {
    for (const source of this._sources.values()) {
      source.dispose();
    }
    this._sources.clear();
    this._tracks = [];
  }

  clone(): Composition {
    const composition = new Composition(this.config);
    for (const track of this._tracks) {
      composition.addTrack(track.clone());
    }
    for (const [id, source] of this._sources) {
      composition._sources.set(id, source);
    }
    return composition;
  }
}
