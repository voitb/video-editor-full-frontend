/**
 * useTimelineDimensions Hook
 * Manages container measurements and time/pixel conversions for the timeline.
 */

import { useMemo, useCallback, useEffect, type RefObject } from 'react';
import { TIMELINE } from '../../../constants';

export interface TimelineDimensions {
  effectiveDuration: number;
  effectiveVisibleDuration: number;
  pixelsPerSecond: number;
  totalTimelineWidth: number;
  timeToPixel: (timeUs: number) => number;
  pixelToTime: (pixel: number) => number;
  showScrollbar: boolean;
}

export interface UseTimelineDimensionsParams {
  containerRef: RefObject<HTMLDivElement | null>;
  containerWidth: number;
  setContainerWidth: (width: number) => void;
  durationUs: number;
  viewport: {
    startTimeUs: number;
    endTimeUs: number;
    zoomLevel: number;
  };
}

export function useTimelineDimensions({
  containerRef,
  containerWidth,
  setContainerWidth,
  durationUs,
  viewport,
}: UseTimelineDimensionsParams): TimelineDimensions {
  // Track container width for responsive timeline
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const width = container.clientWidth - TIMELINE.TRACK_HEADER_WIDTH;
      setContainerWidth(Math.max(width, 100));
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [containerRef, setContainerWidth]);

  // Calculate effective durations
  const effectiveDuration = Math.max(durationUs, TIMELINE.MIN_VISIBLE_DURATION_US);
  const visibleDuration = viewport.endTimeUs - viewport.startTimeUs;
  const effectiveVisibleDuration = Math.max(visibleDuration, TIMELINE.MIN_VISIBLE_DURATION_US);

  // Calculate pixels per second
  const pixelsPerSecond = useMemo(() => {
    if (containerWidth <= 0) return 100;
    return containerWidth / (effectiveVisibleDuration / 1_000_000);
  }, [containerWidth, effectiveVisibleDuration]);

  // Calculate total timeline width
  const totalTimelineWidth = useMemo(() => {
    const contentWidth = (effectiveDuration / 1_000_000) * pixelsPerSecond;
    return Math.max(contentWidth, containerWidth, 100);
  }, [effectiveDuration, pixelsPerSecond, containerWidth]);

  // Time-to-pixel conversion
  const timeToPixel = useCallback((timeUs: number): number => {
    return (timeUs / 1_000_000) * pixelsPerSecond;
  }, [pixelsPerSecond]);

  // Pixel-to-time conversion
  const pixelToTime = useCallback((pixel: number): number => {
    return (pixel / pixelsPerSecond) * 1_000_000;
  }, [pixelsPerSecond]);

  // Check if scrollbar should be visible
  const showScrollbar = totalTimelineWidth > containerWidth;

  return {
    effectiveDuration,
    effectiveVisibleDuration,
    pixelsPerSecond,
    totalTimelineWidth,
    timeToPixel,
    pixelToTime,
    showScrollbar,
  };
}
