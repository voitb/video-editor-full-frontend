/**
 * useOverlayClipSelection Hook
 * Find and track selected overlay clip from tracks.
 */

import { useMemo } from 'react';
import type { Track } from '../../../../../core/Track';
import type { OverlayClip } from '../../../../../core/OverlayClip';
import { isOverlayClip } from '../../../../../core/Track';

export interface SelectedOverlayClip {
  clip: OverlayClip;
  track: Track;
}

export interface UseOverlayClipSelectionOptions {
  tracks: readonly Track[];
  selectedClipId?: string;
}

export function useOverlayClipSelection(
  options: UseOverlayClipSelectionOptions
): {
  selectedOverlay: SelectedOverlayClip | null;
  overlayTracks: Track[];
  firstOverlayTrack: Track | undefined;
} {
  const { tracks, selectedClipId } = options;

  const selectedOverlay = useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of tracks) {
      if (track.type !== 'overlay') continue;
      for (const clip of track.clips) {
        if (clip.id === selectedClipId && isOverlayClip(clip)) {
          return { clip, track };
        }
      }
    }
    return null;
  }, [tracks, selectedClipId]);

  const overlayTracks = useMemo(
    () => tracks.filter((t) => t.type === 'overlay'),
    [tracks]
  );

  const firstOverlayTrack = overlayTracks[0];

  return {
    selectedOverlay,
    overlayTracks,
    firstOverlayTrack,
  };
}
