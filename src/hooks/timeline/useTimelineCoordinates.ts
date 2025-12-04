/**
 * Timeline Coordinates Hook
 * Time/pixel coordinate conversion utilities.
 */

import { useCallback } from 'react';
import type { TimelineViewport } from '../../core/types';

interface UseTimelineCoordinatesOptions {
  viewport: TimelineViewport;
}

interface UseTimelineCoordinatesResult {
  timeToPixel: (timeUs: number, containerWidth: number) => number;
  pixelToTime: (pixel: number, containerWidth: number) => number;
  pixelsPerUs: (containerWidth: number) => number;
}

export function useTimelineCoordinates({
  viewport,
}: UseTimelineCoordinatesOptions): UseTimelineCoordinatesResult {
  const timeToPixel = useCallback(
    (timeUs: number, containerWidth: number): number => {
      const duration = viewport.endTimeUs - viewport.startTimeUs;
      if (duration === 0) return 0;
      const relativeTime = timeUs - viewport.startTimeUs;
      return (relativeTime / duration) * containerWidth;
    },
    [viewport]
  );

  const pixelToTime = useCallback(
    (pixel: number, containerWidth: number): number => {
      if (containerWidth === 0) return viewport.startTimeUs;
      const duration = viewport.endTimeUs - viewport.startTimeUs;
      const relativeTime = (pixel / containerWidth) * duration;
      return viewport.startTimeUs + relativeTime;
    },
    [viewport]
  );

  const pixelsPerUs = useCallback(
    (containerWidth: number): number => {
      const duration = viewport.endTimeUs - viewport.startTimeUs;
      if (duration === 0) return 0;
      return containerWidth / duration;
    },
    [viewport]
  );

  return { timeToPixel, pixelToTime, pixelsPerUs };
}
