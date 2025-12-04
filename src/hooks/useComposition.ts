/**
 * Video Editor V2 - useComposition Hook
 * React hook for managing a video composition.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { Composition } from '../core/Composition';
import { Track } from '../core/Track';
import { Clip } from '../core/Clip';
import type {
  CompositionConfig,
  TrackConfig,
  ClipConfig,
} from '../core/types';

export interface UseCompositionReturn {
  /** The composition instance */
  composition: Composition;
  /** All tracks */
  tracks: readonly Track[];
  /** Video tracks only */
  videoTracks: Track[];
  /** Audio tracks only */
  audioTracks: Track[];
  /** Total duration in microseconds */
  durationUs: number;
  /** Create a new track */
  createTrack: (config: TrackConfig) => Track;
  /** Remove a track */
  removeTrack: (trackId: string) => boolean;
  /** Get a track by ID */
  getTrack: (trackId: string) => Track | undefined;
  /** Add a clip to a track */
  addClip: (trackId: string, config: ClipConfig) => Clip | undefined;
  /** Add a video clip with auto-extracted linked audio clip */
  addVideoClipWithAudio: (
    videoTrackId: string,
    config: ClipConfig,
    audioTrackId?: string
  ) => { videoClip: Clip | undefined; audioClip: Clip | undefined };
  /** Remove a clip */
  removeClip: (clipId: string) => boolean;
  /** Get a clip by ID */
  getClip: (clipId: string) => { clip: Clip; track: Track } | undefined;
  /** Update a clip */
  updateClip: (clipId: string, updates: Partial<ClipConfig>) => boolean;
  /** Move a clip to a new start time (with collision detection) */
  moveClip: (clipId: string, newStartUs: number) => boolean;
  /** Move a clip along with its linked clip */
  moveClipWithLinked: (clipId: string, newStartUs: number) => boolean;
  /** Move a clip to a different track (with collision detection) */
  moveClipToTrack: (clipId: string, targetTrackId: string, newStartUs?: number) => boolean;
  /** Unlink a clip from its linked clip */
  unlinkClip: (clipId: string) => boolean;
  /** Clear all tracks and sources */
  clear: () => void;
  /** Force re-render */
  refresh: () => void;
  /** Export composition as JSON */
  toJSON: () => ReturnType<Composition['toJSON']>;
}

export interface UseCompositionOptions {
  /** Initial composition config */
  config?: Partial<CompositionConfig>;
  /** Existing composition to use */
  composition?: Composition;
}

/**
 * React hook for managing a video composition.
 *
 * @example
 * ```tsx
 * const { composition, tracks, createTrack, addClip } = useComposition({
 *   config: { width: 1920, height: 1080, frameRate: 30 }
 * });
 *
 * // Create a video track
 * const videoTrack = createTrack({ type: 'video', label: 'Main Video' });
 *
 * // Add a clip
 * const clip = addClip(videoTrack.id, {
 *   sourceId: 'source-1',
 *   startUs: 0,
 *   trimIn: 0,
 *   trimOut: 5_000_000, // 5 seconds
 * });
 * ```
 */
export function useComposition(options: UseCompositionOptions = {}): UseCompositionReturn {
  // Create or use existing composition
  const compositionRef = useRef<Composition>(
    options.composition ?? new Composition(options.config)
  );

  // Force re-render state
  const [, setRenderCount] = useState(0);
  const refresh = useCallback(() => setRenderCount(c => c + 1), []);

  const composition = compositionRef.current;

  // Track management
  const createTrack = useCallback((config: TrackConfig): Track => {
    const track = composition.createTrack(config);
    refresh();
    return track;
  }, [composition, refresh]);

  const removeTrack = useCallback((trackId: string): boolean => {
    const result = composition.removeTrack(trackId);
    if (result) refresh();
    return result;
  }, [composition, refresh]);

  const getTrack = useCallback((trackId: string): Track | undefined => {
    return composition.getTrack(trackId);
  }, [composition]);

  // Clip management
  const addClip = useCallback((trackId: string, config: ClipConfig): Clip | undefined => {
    const clip = composition.addClipToTrack(trackId, config);
    if (clip) refresh();
    return clip;
  }, [composition, refresh]);

  /**
   * Add a video clip with automatically created linked audio clip
   */
  const addVideoClipWithAudio = useCallback((
    videoTrackId: string,
    config: ClipConfig,
    audioTrackId?: string
  ): { videoClip: Clip | undefined; audioClip: Clip | undefined } => {
    // Add video clip
    const videoClip = composition.addClipToTrack(videoTrackId, config);
    if (!videoClip) {
      return { videoClip: undefined, audioClip: undefined };
    }

    // Check if source has audio
    const source = composition.getSource(config.sourceId);
    if (!source?.hasAudio) {
      refresh();
      return { videoClip, audioClip: undefined };
    }

    // Find or create audio track
    let audioTrack: Track | undefined;
    if (audioTrackId) {
      audioTrack = composition.getTrack(audioTrackId);
    } else {
      // Use first audio track or create one
      audioTrack = composition.audioTracks[0];
      if (!audioTrack) {
        audioTrack = composition.createTrack({ type: 'audio', label: 'Audio 1' });
      }
    }

    if (!audioTrack) {
      refresh();
      return { videoClip, audioClip: undefined };
    }

    // Create linked audio clip with same timing
    const audioClip = audioTrack.createClip({
      ...config,
      label: config.label ? `${config.label} (Audio)` : 'Audio',
      linkedClipId: videoClip.id,
    });

    // Link video clip back to audio clip
    videoClip.linkedClipId = audioClip.id;

    refresh();
    return { videoClip, audioClip };
  }, [composition, refresh]);

  const removeClip = useCallback((clipId: string): boolean => {
    const result = composition.removeClip(clipId);
    if (result) refresh();
    return result;
  }, [composition, refresh]);

  const getClip = useCallback((clipId: string): { clip: Clip; track: Track } | undefined => {
    return composition.getClip(clipId);
  }, [composition]);

  const updateClip = useCallback((clipId: string, updates: Partial<ClipConfig>): boolean => {
    const found = composition.getClip(clipId);
    if (!found) return false;

    const { clip } = found;

    if (updates.startUs !== undefined) clip.startUs = updates.startUs;
    if (updates.trimIn !== undefined) clip.trimIn = updates.trimIn;
    if (updates.trimOut !== undefined) clip.trimOut = updates.trimOut;
    if (updates.opacity !== undefined) clip.opacity = updates.opacity;
    if (updates.volume !== undefined) clip.volume = updates.volume;
    if (updates.label !== undefined) clip.label = updates.label;

    refresh();
    return true;
  }, [composition, refresh]);

  // Move clip (overlaps allowed - standard NLE behavior)
  const moveClip = useCallback((clipId: string, newStartUs: number): boolean => {
    const found = composition.getClip(clipId);
    if (!found) return false;

    const { clip } = found;
    clip.moveTo(newStartUs);
    refresh();
    return true;
  }, [composition, refresh]);

  // Move clip along with its linked clip (overlaps allowed - standard NLE behavior)
  const moveClipWithLinked = useCallback((clipId: string, newStartUs: number): boolean => {
    const found = composition.getClip(clipId);
    if (!found) return false;

    // Move using composition method which handles linked clips
    composition.moveClipWithLinked(clipId, newStartUs);
    refresh();
    return true;
  }, [composition, refresh]);

  // Unlink a clip from its linked clip
  const unlinkClip = useCallback((clipId: string): boolean => {
    const result = composition.unlinkClip(clipId);
    if (result) refresh();
    return result;
  }, [composition, refresh]);

  // Move clip to a different track
  const moveClipToTrack = useCallback((
    clipId: string,
    targetTrackId: string,
    newStartUs?: number
  ): boolean => {
    const found = composition.getClip(clipId);
    if (!found) return false;

    const { clip, track: sourceTrack } = found;
    const targetTrack = composition.getTrack(targetTrackId);

    if (!targetTrack) return false;

    // Ensure same track type (video to video, audio to audio)
    if (sourceTrack.type !== targetTrack.type) return false;

    // If same track, just move position
    if (sourceTrack.id === targetTrackId) {
      if (newStartUs !== undefined) {
        return moveClip(clipId, newStartUs);
      }
      return true;
    }

    const startUs = newStartUs ?? clip.startUs;

    // Remove from source track (overlaps allowed - standard NLE behavior)
    sourceTrack.removeClip(clipId);

    // Create new clip on target track with same properties
    const newClip = new Clip({
      sourceId: clip.sourceId,
      startUs,
      trimIn: clip.trimIn,
      trimOut: clip.trimOut,
      opacity: clip.opacity,
      volume: clip.volume,
      label: clip.label,
    }, clip.id); // Preserve clip ID

    targetTrack.addClip(newClip);
    refresh();
    return true;
  }, [composition, refresh, moveClip]);

  // Clear all
  const clear = useCallback(() => {
    composition.clear();
    refresh();
  }, [composition, refresh]);

  // Export
  const toJSON = useCallback(() => {
    return composition.toJSON();
  }, [composition]);

  // Computed values
  const tracks = composition.tracks;
  const videoTracks = useMemo(() => composition.videoTracks, [composition, tracks]);
  const audioTracks = useMemo(() => composition.audioTracks, [composition, tracks]);
  const durationUs = composition.durationUs;

  return {
    composition,
    tracks,
    videoTracks,
    audioTracks,
    durationUs,
    createTrack,
    removeTrack,
    getTrack,
    addClip,
    addVideoClipWithAudio,
    removeClip,
    getClip,
    updateClip,
    moveClip,
    moveClipWithLinked,
    moveClipToTrack,
    unlinkClip,
    clear,
    refresh,
    toJSON,
  };
}
