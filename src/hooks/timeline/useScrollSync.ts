/**
 * Scroll Sync Hook
 * Scroll synchronization between DOM scroll and viewport state.
 */

import { useCallback } from 'react';
import type { TimelineViewport } from '../../core/types';
import { TIMELINE } from '../../constants';

interface UseScrollSyncOptions {
  durationUs: number;
  viewport: TimelineViewport;
  setViewport: React.Dispatch<React.SetStateAction<TimelineViewport>>;
}

interface UseScrollSyncResult {
  getTotalWidth: (containerWidth: number) => number;
  setViewportFromScroll: (scrollLeft: number, containerWidth: number, totalWidth: number) => void;
  getScrollLeft: (containerWidth: number, totalWidth: number) => number;
}

export function useScrollSync({
  durationUs,
  viewport,
  setViewport,
}: UseScrollSyncOptions): UseScrollSyncResult {
  const getTotalWidth = useCallback(
    (containerWidth: number): number => {
      if (containerWidth <= 0) return containerWidth;
      return containerWidth * viewport.zoomLevel;
    },
    [viewport.zoomLevel]
  );

  const setViewportFromScroll = useCallback(
    (scrollLeft: number, containerWidth: number, totalWidth: number) => {
      if (totalWidth <= containerWidth || containerWidth <= 0) return;

      const effectiveDuration = Math.max(durationUs, TIMELINE.MIN_VISIBLE_DURATION_US);
      const visibleDuration = effectiveDuration / viewport.zoomLevel;
      const scrollRatio = scrollLeft / (totalWidth - containerWidth);
      const maxStartTime = effectiveDuration - visibleDuration;
      const newStartTime = scrollRatio * maxStartTime;

      setViewport((prev) => ({
        ...prev,
        startTimeUs: Math.max(0, newStartTime),
        endTimeUs: Math.min(effectiveDuration, newStartTime + visibleDuration),
      }));
    },
    [durationUs, viewport.zoomLevel, setViewport]
  );

  const getScrollLeft = useCallback(
    (containerWidth: number, totalWidth: number): number => {
      if (totalWidth <= containerWidth || containerWidth <= 0) return 0;

      const effectiveDuration = Math.max(durationUs, TIMELINE.MIN_VISIBLE_DURATION_US);
      const visibleDuration = viewport.endTimeUs - viewport.startTimeUs;
      const maxStartTime = effectiveDuration - visibleDuration;

      if (maxStartTime <= 0) return 0;

      const scrollRatio = viewport.startTimeUs / maxStartTime;
      return scrollRatio * (totalWidth - containerWidth);
    },
    [durationUs, viewport.startTimeUs, viewport.endTimeUs]
  );

  return { getTotalWidth, setViewportFromScroll, getScrollLeft };
}
