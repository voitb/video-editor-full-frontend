/**
 * Viewport Pan Hook
 * Pan and center operations for timeline viewport.
 */

import { useCallback } from 'react';
import type { TimelineViewport } from '../../core/types';

interface UseViewportPanOptions {
  durationUs: number;
  setViewport: React.Dispatch<React.SetStateAction<TimelineViewport>>;
}

interface UseViewportPanResult {
  pan: (deltaUs: number) => void;
  centerOn: (timeUs: number) => void;
}

export function useViewportPan({
  durationUs,
  setViewport,
}: UseViewportPanOptions): UseViewportPanResult {
  const pan = useCallback(
    (deltaUs: number) => {
      setViewport((prev) => {
        const duration = prev.endTimeUs - prev.startTimeUs;
        let newStart = prev.startTimeUs + deltaUs;
        let newEnd = prev.endTimeUs + deltaUs;

        if (newStart < 0) {
          newStart = 0;
          newEnd = duration;
        }
        if (newEnd > durationUs) {
          newEnd = durationUs;
          newStart = Math.max(0, durationUs - duration);
        }

        return { ...prev, startTimeUs: newStart, endTimeUs: newEnd };
      });
    },
    [durationUs, setViewport]
  );

  const centerOn = useCallback(
    (timeUs: number) => {
      setViewport((prev) => {
        const duration = prev.endTimeUs - prev.startTimeUs;
        const halfDuration = duration / 2;
        let newStart = timeUs - halfDuration;
        let newEnd = timeUs + halfDuration;

        if (newStart < 0) {
          newStart = 0;
          newEnd = duration;
        }
        if (newEnd > durationUs) {
          newEnd = durationUs;
          newStart = Math.max(0, durationUs - duration);
        }

        return { ...prev, startTimeUs: newStart, endTimeUs: newEnd };
      });
    },
    [durationUs, setViewport]
  );

  return { pan, centerOn };
}
