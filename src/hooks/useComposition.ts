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
  /** Remove a clip */
  removeClip: (clipId: string) => boolean;
  /** Get a clip by ID */
  getClip: (clipId: string) => { clip: Clip; track: Track } | undefined;
  /** Update a clip */
  updateClip: (clipId: string, updates: Partial<ClipConfig>) => boolean;
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
    removeClip,
    getClip,
    updateClip,
    clear,
    refresh,
    toJSON,
  };
}
