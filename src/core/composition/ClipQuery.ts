/**
 * Clip Query
 * Finds clips across tracks.
 */

import { Track, isMediaClip, isSubtitleClip } from '../Track';
import type { AnyClip } from '../Track';
import { Clip } from '../Clip';
import { SubtitleClip } from '../SubtitleClip';

/**
 * Get any clip by ID (searches all tracks)
 */
export function getAnyClip(
  tracks: Track[],
  clipId: string
): { clip: AnyClip; track: Track } | undefined {
  for (const track of tracks) {
    const clip = track.getClip(clipId);
    if (clip) return { clip, track };
  }
  return undefined;
}

/**
 * Get a media clip by ID (searches all tracks)
 */
export function getClip(
  tracks: Track[],
  clipId: string
): { clip: Clip; track: Track } | undefined {
  const result = getAnyClip(tracks, clipId);
  if (result && isMediaClip(result.clip)) {
    return { clip: result.clip, track: result.track };
  }
  return undefined;
}

/**
 * Get a subtitle clip by ID (searches all tracks)
 */
export function getSubtitleClip(
  tracks: Track[],
  clipId: string
): { clip: SubtitleClip; track: Track } | undefined {
  const result = getAnyClip(tracks, clipId);
  if (result && isSubtitleClip(result.clip)) {
    return { clip: result.clip, track: result.track };
  }
  return undefined;
}
