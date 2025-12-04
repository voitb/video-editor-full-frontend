/**
 * Hook for managing scroll synchronization in the Timeline
 */

import { useCallback, useRef, useState } from 'react';

interface UseTimelineScrollOptions {
  containerWidth: number;
  totalTimelineWidth: number;
  viewport: {
    startTimeUs: number;
    zoomLevel: number;
  };
  onViewportScroll?: (scrollLeft: number, containerWidth: number, totalWidth: number) => void;
  getScrollLeft?: (containerWidth: number, totalWidth: number) => number;
}

interface UseTimelineScrollReturn {
  scrollLeft: number;
  isScrollSyncingRef: React.MutableRefObject<boolean>;
  handleContentScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  syncScrollPosition: (
    scrollContainerRef: React.RefObject<HTMLDivElement | null>,
    timeRulerScrollRef: React.RefObject<HTMLDivElement | null>
  ) => void;
}

/**
 * Hook that manages scroll synchronization between timeline elements
 */
export function useTimelineScroll({
  containerWidth,
  totalTimelineWidth,
  viewport: _viewport,
  onViewportScroll,
  getScrollLeft,
}: UseTimelineScrollOptions): UseTimelineScrollReturn {
  const isScrollSyncingRef = useRef(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const timeRulerScrollRefInternal = useRef<HTMLDivElement | null>(null);

  // Handle scroll synchronization
  const handleContentScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (isScrollSyncingRef.current) return;

      isScrollSyncingRef.current = true;

      const target = e.currentTarget;
      const newScrollLeft = target.scrollLeft;

      setScrollLeft(newScrollLeft);

      if (timeRulerScrollRefInternal.current) {
        timeRulerScrollRefInternal.current.scrollLeft = newScrollLeft;
      }

      if (onViewportScroll) {
        onViewportScroll(newScrollLeft, containerWidth, totalTimelineWidth);
      }

      requestAnimationFrame(() => {
        isScrollSyncingRef.current = false;
      });
    },
    [onViewportScroll, containerWidth, totalTimelineWidth]
  );

  // Sync scroll position when viewport changes externally
  const syncScrollPosition = useCallback(
    (
      scrollContainerRef: React.RefObject<HTMLDivElement | null>,
      timeRulerScrollRef: React.RefObject<HTMLDivElement | null>
    ) => {
      timeRulerScrollRefInternal.current = timeRulerScrollRef.current;

      if (!scrollContainerRef.current || !getScrollLeft) return;

      const targetScroll = getScrollLeft(containerWidth, totalTimelineWidth);
      const currentScroll = scrollContainerRef.current.scrollLeft;

      if (Math.abs(targetScroll - currentScroll) > 1) {
        scrollContainerRef.current.scrollLeft = targetScroll;
      }
    },
    [containerWidth, totalTimelineWidth, getScrollLeft]
  );

  return {
    scrollLeft,
    isScrollSyncingRef,
    handleContentScroll,
    syncScrollPosition,
  };
}
