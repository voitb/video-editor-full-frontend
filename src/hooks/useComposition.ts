/**
 * Video Editor V2 - useComposition Hook
 * React hook for managing a video composition.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { Composition } from '../core/Composition';
import type { Track } from '../core/Track';
import type { Clip } from '../core/Clip';
import type { CompositionConfig, TrackConfig, ClipConfig } from '../core/types';
import { useTrackManagement, useClipManagement, useClipMovement } from './composition';

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
  const refresh = useCallback(() => setRenderCount((c) => c + 1), []);

  const composition = compositionRef.current;

  // Track management
  const { createTrack, removeTrack, getTrack } = useTrackManagement({
    composition,
    refresh,
  });

  // Clip management
  const { addClip, addVideoClipWithAudio, removeClip, getClip, updateClip, unlinkClip } =
    useClipManagement({
      composition,
      refresh,
    });

  // Clip movement
  const { moveClip, moveClipWithLinked, moveClipToTrack } = useClipMovement({
    composition,
    refresh,
  });

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
