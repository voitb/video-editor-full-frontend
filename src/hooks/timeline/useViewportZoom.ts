/**
 * Viewport Zoom Hook
 * Zoom operations for timeline viewport.
 */

import { useCallback } from 'react';
import type { TimelineViewport } from '../../core/types';
import { TIMELINE } from '../../constants';

interface UseViewportZoomOptions {
  durationUs: number;
  setViewport: React.Dispatch<React.SetStateAction<TimelineViewport>>;
}

interface UseViewportZoomResult {
  zoomIn: () => void;
  zoomOut: () => void;
  setZoom: (level: number) => void;
  zoomAtPosition: (positionRatio: number, direction: 'in' | 'out') => void;
  resetViewport: (newDurationUs?: number) => void;
}

export function useViewportZoom({
  durationUs,
  setViewport,
}: UseViewportZoomOptions): UseViewportZoomResult {
  const zoomIn = useCallback(() => {
    setViewport((prev) => {
      const newZoom = Math.min(prev.zoomLevel * TIMELINE.ZOOM_STEP, TIMELINE.MAX_ZOOM_LEVEL);
      const center = (prev.startTimeUs + prev.endTimeUs) / 2;
      const newDuration = Math.max(durationUs / newZoom, TIMELINE.MIN_VISIBLE_DURATION_US);
      const halfDuration = newDuration / 2;

      return {
        startTimeUs: Math.max(0, center - halfDuration),
        endTimeUs: Math.min(durationUs, center + halfDuration),
        zoomLevel: newZoom,
      };
    });
  }, [durationUs, setViewport]);

  const zoomOut = useCallback(() => {
    setViewport((prev) => {
      const newZoom = Math.max(prev.zoomLevel / TIMELINE.ZOOM_STEP, 1);
      const center = (prev.startTimeUs + prev.endTimeUs) / 2;
      const newDuration = durationUs / newZoom;
      const halfDuration = newDuration / 2;

      let startTimeUs = center - halfDuration;
      let endTimeUs = center + halfDuration;

      if (startTimeUs < 0) {
        startTimeUs = 0;
        endTimeUs = newDuration;
      }
      if (endTimeUs > durationUs) {
        endTimeUs = durationUs;
        startTimeUs = Math.max(0, durationUs - newDuration);
      }

      return { startTimeUs, endTimeUs, zoomLevel: newZoom };
    });
  }, [durationUs, setViewport]);

  const setZoom = useCallback(
    (level: number) => {
      const clampedZoom = Math.max(1, Math.min(level, TIMELINE.MAX_ZOOM_LEVEL));
      setViewport((prev) => {
        const center = (prev.startTimeUs + prev.endTimeUs) / 2;
        const newDuration = Math.max(durationUs / clampedZoom, TIMELINE.MIN_VISIBLE_DURATION_US);
        const halfDuration = newDuration / 2;

        return {
          startTimeUs: Math.max(0, center - halfDuration),
          endTimeUs: Math.min(durationUs, center + halfDuration),
          zoomLevel: clampedZoom,
        };
      });
    },
    [durationUs, setViewport]
  );

  const zoomAtPosition = useCallback(
    (positionRatio: number, direction: 'in' | 'out') => {
      setViewport((prev) => {
        const currentDuration = prev.endTimeUs - prev.startTimeUs;
        const cursorTimeUs = prev.startTimeUs + positionRatio * currentDuration;

        const newZoom =
          direction === 'in'
            ? Math.min(prev.zoomLevel * TIMELINE.ZOOM_STEP, TIMELINE.MAX_ZOOM_LEVEL)
            : Math.max(prev.zoomLevel / TIMELINE.ZOOM_STEP, 1);

        const newDuration = Math.max(durationUs / newZoom, TIMELINE.MIN_VISIBLE_DURATION_US);

        let newStartTimeUs = cursorTimeUs - positionRatio * newDuration;
        let newEndTimeUs = newStartTimeUs + newDuration;

        if (newStartTimeUs < 0) {
          newStartTimeUs = 0;
          newEndTimeUs = newDuration;
        }
        if (newEndTimeUs > durationUs) {
          newEndTimeUs = durationUs;
          newStartTimeUs = Math.max(0, durationUs - newDuration);
        }

        return { startTimeUs: newStartTimeUs, endTimeUs: newEndTimeUs, zoomLevel: newZoom };
      });
    },
    [durationUs, setViewport]
  );

  const resetViewport = useCallback(
    (newDurationUs?: number) => {
      const effectiveDuration = newDurationUs ?? durationUs ?? TIMELINE.MIN_VISIBLE_DURATION_US;
      setViewport({
        startTimeUs: 0,
        endTimeUs: effectiveDuration,
        zoomLevel: 1,
      });
    },
    [durationUs, setViewport]
  );

  return { zoomIn, zoomOut, setZoom, zoomAtPosition, resetViewport };
}
