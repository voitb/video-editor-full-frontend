/**
 * Video Editor V2 - useTimeline Hook
 * React hook for timeline viewport and interactions.
 */

import { useState, useCallback, useMemo } from 'react';
import type { TimelineViewport } from '../core/types';
import { TIMELINE } from '../constants';

export interface UseTimelineOptions {
  /** Total duration in microseconds */
  durationUs: number;
  /** Initial zoom level */
  initialZoom?: number;
}

export interface UseTimelineReturn {
  /** Current viewport state */
  viewport: TimelineViewport;
  /** Zoom in */
  zoomIn: () => void;
  /** Zoom out */
  zoomOut: () => void;
  /** Set zoom level directly */
  setZoom: (level: number) => void;
  /** Pan viewport by delta (microseconds) */
  pan: (deltaUs: number) => void;
  /** Center viewport on time */
  centerOn: (timeUs: number) => void;
  /** Reset viewport to show full timeline */
  resetViewport: () => void;
  /** Convert timeline time to pixel position */
  timeToPixel: (timeUs: number, containerWidth: number) => number;
  /** Convert pixel position to timeline time */
  pixelToTime: (pixel: number, containerWidth: number) => number;
  /** Get visible duration */
  visibleDurationUs: number;
  /** Pixels per microsecond at current zoom */
  pixelsPerUs: (containerWidth: number) => number;
}

/**
 * React hook for managing the timeline viewport.
 *
 * @example
 * ```tsx
 * const { durationUs } = useComposition();
 * const {
 *   viewport,
 *   zoomIn,
 *   zoomOut,
 *   pan,
 *   timeToPixel,
 *   pixelToTime,
 * } = useTimeline({ durationUs });
 *
 * // Handle scroll wheel zoom
 * const handleWheel = (e: WheelEvent) => {
 *   if (e.ctrlKey) {
 *     e.deltaY < 0 ? zoomIn() : zoomOut();
 *   } else {
 *     pan(pixelToTime(e.deltaX, containerWidth));
 *   }
 * };
 * ```
 */
export function useTimeline(options: UseTimelineOptions): UseTimelineReturn {
  const { durationUs, initialZoom = 1 } = options;

  const [viewport, setViewport] = useState<TimelineViewport>(() => ({
    startTimeUs: 0,
    endTimeUs: durationUs || TIMELINE.MIN_VISIBLE_DURATION_US,
    zoomLevel: initialZoom,
  }));

  // Calculate visible duration
  const visibleDurationUs = useMemo(() => {
    return viewport.endTimeUs - viewport.startTimeUs;
  }, [viewport]);

  // Zoom in
  const zoomIn = useCallback(() => {
    setViewport(prev => {
      const newZoom = Math.min(prev.zoomLevel * TIMELINE.ZOOM_STEP, TIMELINE.MAX_ZOOM_LEVEL);
      const center = (prev.startTimeUs + prev.endTimeUs) / 2;
      const newDuration = Math.max(
        durationUs / newZoom,
        TIMELINE.MIN_VISIBLE_DURATION_US
      );
      const halfDuration = newDuration / 2;

      return {
        startTimeUs: Math.max(0, center - halfDuration),
        endTimeUs: Math.min(durationUs, center + halfDuration),
        zoomLevel: newZoom,
      };
    });
  }, [durationUs]);

  // Zoom out
  const zoomOut = useCallback(() => {
    setViewport(prev => {
      const newZoom = Math.max(prev.zoomLevel / TIMELINE.ZOOM_STEP, 1);
      const center = (prev.startTimeUs + prev.endTimeUs) / 2;
      const newDuration = durationUs / newZoom;
      const halfDuration = newDuration / 2;

      let startTimeUs = center - halfDuration;
      let endTimeUs = center + halfDuration;

      // Clamp to bounds
      if (startTimeUs < 0) {
        startTimeUs = 0;
        endTimeUs = newDuration;
      }
      if (endTimeUs > durationUs) {
        endTimeUs = durationUs;
        startTimeUs = Math.max(0, durationUs - newDuration);
      }

      return {
        startTimeUs,
        endTimeUs,
        zoomLevel: newZoom,
      };
    });
  }, [durationUs]);

  // Set zoom directly
  const setZoom = useCallback((level: number) => {
    const clampedZoom = Math.max(1, Math.min(level, TIMELINE.MAX_ZOOM_LEVEL));
    setViewport(prev => {
      const center = (prev.startTimeUs + prev.endTimeUs) / 2;
      const newDuration = Math.max(
        durationUs / clampedZoom,
        TIMELINE.MIN_VISIBLE_DURATION_US
      );
      const halfDuration = newDuration / 2;

      return {
        startTimeUs: Math.max(0, center - halfDuration),
        endTimeUs: Math.min(durationUs, center + halfDuration),
        zoomLevel: clampedZoom,
      };
    });
  }, [durationUs]);

  // Pan viewport
  const pan = useCallback((deltaUs: number) => {
    setViewport(prev => {
      const duration = prev.endTimeUs - prev.startTimeUs;
      let newStart = prev.startTimeUs + deltaUs;
      let newEnd = prev.endTimeUs + deltaUs;

      // Clamp to bounds
      if (newStart < 0) {
        newStart = 0;
        newEnd = duration;
      }
      if (newEnd > durationUs) {
        newEnd = durationUs;
        newStart = Math.max(0, durationUs - duration);
      }

      return {
        ...prev,
        startTimeUs: newStart,
        endTimeUs: newEnd,
      };
    });
  }, [durationUs]);

  // Center viewport on time
  const centerOn = useCallback((timeUs: number) => {
    setViewport(prev => {
      const duration = prev.endTimeUs - prev.startTimeUs;
      const halfDuration = duration / 2;
      let newStart = timeUs - halfDuration;
      let newEnd = timeUs + halfDuration;

      // Clamp to bounds
      if (newStart < 0) {
        newStart = 0;
        newEnd = duration;
      }
      if (newEnd > durationUs) {
        newEnd = durationUs;
        newStart = Math.max(0, durationUs - duration);
      }

      return {
        ...prev,
        startTimeUs: newStart,
        endTimeUs: newEnd,
      };
    });
  }, [durationUs]);

  // Reset viewport
  const resetViewport = useCallback(() => {
    setViewport({
      startTimeUs: 0,
      endTimeUs: durationUs || TIMELINE.MIN_VISIBLE_DURATION_US,
      zoomLevel: 1,
    });
  }, [durationUs]);

  // Convert time to pixel position
  const timeToPixel = useCallback((timeUs: number, containerWidth: number): number => {
    const duration = viewport.endTimeUs - viewport.startTimeUs;
    if (duration === 0) return 0;
    const relativeTime = timeUs - viewport.startTimeUs;
    return (relativeTime / duration) * containerWidth;
  }, [viewport]);

  // Convert pixel position to time
  const pixelToTime = useCallback((pixel: number, containerWidth: number): number => {
    if (containerWidth === 0) return viewport.startTimeUs;
    const duration = viewport.endTimeUs - viewport.startTimeUs;
    const relativeTime = (pixel / containerWidth) * duration;
    return viewport.startTimeUs + relativeTime;
  }, [viewport]);

  // Pixels per microsecond
  const pixelsPerUs = useCallback((containerWidth: number): number => {
    const duration = viewport.endTimeUs - viewport.startTimeUs;
    if (duration === 0) return 0;
    return containerWidth / duration;
  }, [viewport]);

  return {
    viewport,
    zoomIn,
    zoomOut,
    setZoom,
    pan,
    centerOn,
    resetViewport,
    timeToPixel,
    pixelToTime,
    visibleDurationUs,
    pixelsPerUs,
  };
}
