/**
 * Selected Clip Hook
 * Finds the selected subtitle clip from tracks.
 */

import { useMemo } from 'react';
import type { Track } from '../../../core/Track';
import { isSubtitleClip } from '../../../core/Track';
import type { SubtitleClip } from '../../../core/SubtitleClip';

interface SelectedClipInfo {
  clip: SubtitleClip;
  track: Track;
}

interface UseSelectedClipResult {
  selectedClip: SelectedClipInfo | null;
  subtitleTracks: Track[];
  firstSubtitleTrack: Track | undefined;
}

export function useSelectedClip(
  tracks: readonly Track[],
  selectedClipId?: string
): UseSelectedClipResult {
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
