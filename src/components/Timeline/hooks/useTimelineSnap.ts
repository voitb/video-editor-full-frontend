/**
 * Hook for managing snap functionality in the Timeline
 */

import { useCallback, useMemo } from 'react';
import { TIMELINE } from '../../../constants';
import type { Track } from '../../../core/Track';
import type { SnapTarget, SnapResult } from '../types';
import { calculateSnapTargets, applySnapToPosition } from '../utils/snapTargets';

interface UseTimelineSnapOptions {
  tracks: readonly Track[];
  currentTimeUs: number;
  pixelToTime: (pixel: number) => number;
}

interface UseTimelineSnapReturn {
  snapTargets: SnapTarget[];
  applySnap: (
    proposedStartUs: number,
    clipDurationUs: number,
    excludeClipId?: string
  ) => SnapResult;
}

/**
 * Hook that provides snap functionality for timeline clips
 */
export function useTimelineSnap({
  tracks,
  currentTimeUs,
  pixelToTime,
}: UseTimelineSnapOptions): UseTimelineSnapReturn {
  // Calculate all snap targets from tracks and playhead
  const snapTargets = useMemo(
    () => calculateSnapTargets(tracks, currentTimeUs),
    [tracks, currentTimeUs]
  );

  // Apply snapping to a proposed position
  const applySnap = useCallback(
    (
      proposedStartUs: number,
      clipDurationUs: number,
      excludeClipId?: string
    ): SnapResult => {
      const snapThresholdUs = pixelToTime(TIMELINE.SNAP_THRESHOLD_PX) - pixelToTime(0);
      return applySnapToPosition(
        proposedStartUs,
        clipDurationUs,
        snapTargets,
        snapThresholdUs,
        excludeClipId
      );
    },
    [snapTargets, pixelToTime]
  );

  return { snapTargets, applySnap };
}
