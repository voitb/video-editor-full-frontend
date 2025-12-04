/**
 * Active Clip Resolver
 * Resolves active clips and overlays at specific timeline times.
 */

import type { TrackJSON, SubtitleClipJSON } from '../../core/types';
import type { ActiveClipInfo, ActiveOverlayInfo } from './types';

/**
 * Get all active clips at a specific timeline time.
 * Excludes subtitle and overlay tracks which are handled separately.
 */
export function getActiveClipsAt(
  tracks: TrackJSON[],
  timelineTimeUs: number
): ActiveClipInfo[] {
  const activeClips: ActiveClipInfo[] = [];

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex]!;

    // Skip subtitle and overlay tracks - they are handled separately
    if (track.type === 'subtitle' || track.type === 'overlay') continue;

    for (const clip of track.clips) {
      const clipDurationUs = clip.trimOut - clip.trimIn;
      const clipEndUs = clip.startUs + clipDurationUs;

      if (timelineTimeUs >= clip.startUs && timelineTimeUs < clipEndUs) {
        const offsetWithinClip = timelineTimeUs - clip.startUs;
        const sourceTimeUs = clip.trimIn + offsetWithinClip;

        activeClips.push({
          clipId: clip.id,
          sourceId: clip.sourceId,
          trackType: track.type,
          trackIndex,
          timelineStartUs: clip.startUs,
          sourceStartUs: sourceTimeUs,
          sourceEndUs: clip.trimOut,
          opacity: clip.opacity,
          volume: clip.volume,
        });
      }
    }
  }

  return activeClips;
}

/**
 * Subtitle track data for rendering.
 */
export interface SubtitleTrackData {
  clips: Array<{
    startUs: number;
    cues: SubtitleClipJSON['cues'];
    style: SubtitleClipJSON['style'];
  }>;
}

/**
 * Get subtitle tracks formatted for subtitle rendering.
 * Extracts subtitle clips from tracks for use with getActiveSubtitleCuesAt.
 */
export function getSubtitleTracks(tracks: TrackJSON[]): SubtitleTrackData[] {
  const subtitleTracks: SubtitleTrackData[] = [];

  for (const track of tracks) {
    if (track.type !== 'subtitle') continue;
    if (!track.subtitleClips || track.subtitleClips.length === 0) continue;

    const clips = track.subtitleClips.map((clip) => ({
      startUs: clip.startUs,
      cues: clip.cues,
      style: clip.style,
    }));

    subtitleTracks.push({ clips });
  }

  return subtitleTracks;
}

/**
 * Get active overlays at a specific timeline time.
 * Returns overlays sorted by trackIndex so that top tracks (lower index) render last (on top).
 */
export function getActiveOverlaysAt(
  overlayData: ActiveOverlayInfo[],
  timelineTimeUs: number
): ActiveOverlayInfo[] {
  return overlayData
    .filter((overlay) => timelineTimeUs >= overlay.startUs && timelineTimeUs < overlay.endUs)
    .sort((a, b) => b.trackIndex - a.trackIndex); // Higher trackIndex first, so lower (top) tracks render last = on top
}
