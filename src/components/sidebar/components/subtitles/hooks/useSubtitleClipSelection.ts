/**
 * useSubtitleClipSelection Hook
 * Find and track selected subtitle clip from tracks.
 */

import { useMemo } from 'react';
import type { Track } from '../../../../../core/Track';
import type { SubtitleClip } from '../../../../../core/SubtitleClip';
import { isSubtitleClip } from '../../../../../core/Track';

export interface SelectedSubtitleClip {
  clip: SubtitleClip;
  track: Track;
}

export interface UseSubtitleClipSelectionOptions {
  tracks: readonly Track[];
  selectedClipId?: string;
}

export function useSubtitleClipSelection(
  options: UseSubtitleClipSelectionOptions
): {
  selectedClip: SelectedSubtitleClip | null;
  subtitleTracks: Track[];
  firstSubtitleTrack: Track | undefined;
} {
  const { tracks, selectedClipId } = options;

  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of tracks) {
      if (track.type !== 'subtitle') continue;
      for (const clip of track.clips) {
        if (clip.id === selectedClipId && isSubtitleClip(clip)) {
          return { clip, track };
        }
      }
    }
    return null;
  }, [tracks, selectedClipId]);

  const subtitleTracks = useMemo(
    () => tracks.filter((t) => t.type === 'subtitle'),
    [tracks]
  );

  const firstSubtitleTrack = subtitleTracks[0];

  return {
    selectedClip,
    subtitleTracks,
    firstSubtitleTrack,
  };
}
