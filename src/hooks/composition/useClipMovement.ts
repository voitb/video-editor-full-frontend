/**
 * useClipMovement Hook
 * Clip movement and track transfer operations.
 */

import { useCallback } from 'react';
import type { Composition } from '../../core/Composition';
import { Clip } from '../../core/Clip';

export interface UseClipMovementOptions {
  composition: Composition;
  refresh: () => void;
}

export function useClipMovement(options: UseClipMovementOptions) {
  const { composition, refresh } = options;

  // Move clip (overlaps allowed - standard NLE behavior)
  const moveClip = useCallback(
    (clipId: string, newStartUs: number): boolean => {
      const found = composition.getClip(clipId);
      if (!found) return false;

      const { clip } = found;
      clip.moveTo(newStartUs);
      refresh();
      return true;
    },
    [composition, refresh]
  );

  // Move clip along with its linked clip (overlaps allowed - standard NLE behavior)
  const moveClipWithLinked = useCallback(
    (clipId: string, newStartUs: number): boolean => {
      const found = composition.getClip(clipId);
      if (!found) return false;

      // Move using composition method which handles linked clips
      composition.moveClipWithLinked(clipId, newStartUs);
      refresh();
      return true;
    },
    [composition, refresh]
  );

  // Move clip to a different track
  const moveClipToTrack = useCallback(
    (clipId: string, targetTrackId: string, newStartUs?: number): boolean => {
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
      const newClip = new Clip(
        {
          sourceId: clip.sourceId,
          startUs,
          trimIn: clip.trimIn,
          trimOut: clip.trimOut,
          opacity: clip.opacity,
          volume: clip.volume,
          label: clip.label,
        },
        clip.id
      ); // Preserve clip ID

      targetTrack.addClip(newClip);
      refresh();
      return true;
    },
    [composition, refresh, moveClip]
  );

  return {
    moveClip,
    moveClipWithLinked,
    moveClipToTrack,
  };
}
