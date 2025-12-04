/**
 * Viewport State Hook
 * Base state management for timeline viewport.
 */

import { useState, useMemo } from 'react';
import type { TimelineViewport } from '../../core/types';
import { TIMELINE } from '../../constants';

interface UseViewportStateOptions {
  durationUs: number;
  initialZoom?: number;
}

interface UseViewportStateResult {
  viewport: TimelineViewport;
  setViewport: React.Dispatch<React.SetStateAction<TimelineViewport>>;
  visibleDurationUs: number;
}

export function useViewportState({
  durationUs,
  initialZoom = 1,
}: UseViewportStateOptions): UseViewportStateResult {
  const [viewport, setViewport] = useState<TimelineViewport>(() => ({
    startTimeUs: 0,
    endTimeUs: durationUs || TIMELINE.MIN_VISIBLE_DURATION_US,
    zoomLevel: initialZoom,
  }));

  const visibleDurationUs = useMemo(() => {
    return viewport.endTimeUs - viewport.startTimeUs;
  }, [viewport]);

  return {
    viewport,
    setViewport,
    visibleDurationUs,
  };
}
