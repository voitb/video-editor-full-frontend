/**
 * Clip Mutator
 * Handles adding and removing clips.
 */

import { Track } from '../Track';
import { Clip } from '../Clip';
import { SubtitleClip } from '../SubtitleClip';
import type { ClipConfig, SubtitleClipConfig } from '../types';
import { getTrack } from './TrackManager';
import { getClip } from './ClipQuery';

/**
 * Add a media clip to a track
 */
export function addClipToTrack(
  tracks: Track[],
  trackId: string,
  config: ClipConfig
): Clip | undefined {
  const track = getTrack(tracks, trackId);
  if (!track) return undefined;
  return track.createClip(config);
}

/**
 * Add a subtitle clip to a track
 */
export function addSubtitleClipToTrack(
  tracks: Track[],
  trackId: string,
  config: SubtitleClipConfig
): SubtitleClip | undefined {
  const track = getTrack(tracks, trackId);
  if (!track || track.type !== 'subtitle') return undefined;
  return track.createSubtitleClip(config);
}

/**
 * Remove a clip from any track
 */
export function removeClip(tracks: Track[], clipId: string): boolean {
  for (const track of tracks) {
    if (track.removeClip(clipId)) return true;
  }
  return false;
}

/**
 * Remove a clip and its linked clip
 */
export function removeClipWithLinked(tracks: Track[], clipId: string): boolean {
  const result = getClip(tracks, clipId);
  if (!result) return false;

  const linkedClipId = result.clip.linkedClipId;

  // Remove the primary clip
  removeClip(tracks, clipId);

  // Remove the linked clip if it exists
  if (linkedClipId) {
    removeClip(tracks, linkedClipId);
  }

  return true;
}
