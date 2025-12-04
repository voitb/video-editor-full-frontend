/**
 * Duration Calculator
 * Handles duration computation and active clip retrieval.
 */

import { Track, isMediaClip } from '../Track';
import type { ActiveClip } from '../types';

/**
 * Compute duration from tracks (ignoring fixed duration)
 */
export function computeDuration(tracks: Track[]): number {
  if (tracks.length === 0) return 0;
  return Math.max(...tracks.map(t => t.durationUs));
}

/**
 * Get total composition duration
 * Returns fixed duration if set, otherwise computes from tracks
 */
export function getDuration(tracks: Track[], fixedDurationUs: number | null): number {
  if (fixedDurationUs !== null) {
    return fixedDurationUs;
  }
  return computeDuration(tracks);
}

/**
 * Get active clips at a specific timeline time
 * Returns clips sorted by track index for proper z-ordering
 * Note: Subtitle clips are excluded - they use HTML overlay rendering
 */
export function getActiveClipsAt(tracks: Track[], timelineTimeUs: number): ActiveClip[] {
  const result: ActiveClip[] = [];

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex]!;

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
export function getActiveClipsInRange(
  tracks: Track[],
  startUs: number,
  endUs: number
): ActiveClip[] {
  const result: ActiveClip[] = [];
  const seen = new Set<string>();

  // Sample at regular intervals to catch all clips
  const step = Math.min(100_000, (endUs - startUs) / 100);
  for (let time = startUs; time <= endUs; time += step) {
    for (const clip of getActiveClipsAt(tracks, time)) {
      if (!seen.has(clip.clipId)) {
        seen.add(clip.clipId);
        result.push(clip);
      }
    }
  }

  return result;
}
