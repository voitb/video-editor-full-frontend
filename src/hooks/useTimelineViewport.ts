import { useState, useCallback } from 'react';
import type { TimelineViewport } from '../types/editor';

// Constants
const MIN_VISIBLE_DURATION_US = 1_000_000; // 1 second minimum (max 10x zoom)
const MAX_ZOOM_LEVEL = 10; // Maximum zoom level
const ZOOM_STEP = 1.5; // Zoom multiplier per step

interface UseTimelineViewportOptions {
  durationUs: number; // Total video duration in microseconds
  currentTimeUs: number; // Current playhead position in microseconds (for zoom anchor)
}

interface UseTimelineViewportReturn {
  viewport: TimelineViewport;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  zoomTo: (level: number) => void;
  pan: (deltaTimeUs: number) => void;
  setViewport: (viewport: TimelineViewport) => void;
  visibleDurationUs: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

export function useTimelineViewport({
  durationUs,
  currentTimeUs,
}: UseTimelineViewportOptions): UseTimelineViewportReturn {
  const [viewport, setViewportState] = useState<TimelineViewport>(() => ({
    startTimeUs: 0,
    endTimeUs: durationUs,
    zoomLevel: 1,
  }));

  // Calculate visible duration - simple arithmetic, no need for useMemo
  const visibleDurationUs = viewport.endTimeUs - viewport.startTimeUs;

  // Check if we can zoom in/out
  const canZoomIn = viewport.zoomLevel < MAX_ZOOM_LEVEL;
  const canZoomOut = viewport.zoomLevel > 1;

  // Helper to clamp viewport to valid bounds
  const clampViewport = useCallback(
    (newViewport: TimelineViewport): TimelineViewport => {
      const visibleDuration = newViewport.endTimeUs - newViewport.startTimeUs;

      // Ensure minimum visible duration
      if (visibleDuration < MIN_VISIBLE_DURATION_US) {
        const center = (newViewport.startTimeUs + newViewport.endTimeUs) / 2;
        return {
          ...newViewport,
          startTimeUs: Math.max(0, center - MIN_VISIBLE_DURATION_US / 2),
          endTimeUs: Math.min(durationUs, center + MIN_VISIBLE_DURATION_US / 2),
        };
      }

      // Clamp to video bounds
      let startTimeUs = newViewport.startTimeUs;
      let endTimeUs = newViewport.endTimeUs;

      if (startTimeUs < 0) {
        endTimeUs = Math.min(durationUs, endTimeUs - startTimeUs);
        startTimeUs = 0;
      }

      if (endTimeUs > durationUs) {
        startTimeUs = Math.max(0, startTimeUs - (endTimeUs - durationUs));
        endTimeUs = durationUs;
      }

      return {
        ...newViewport,
        startTimeUs,
        endTimeUs,
      };
    },
    [durationUs]
  );

  // Zoom centered on playhead
  const zoomTo = useCallback(
    (newZoomLevel: number) => {
      const clampedZoom = Math.max(1, Math.min(MAX_ZOOM_LEVEL, newZoomLevel));
      const newVisibleDuration = durationUs / clampedZoom;

      // Anchor zoom on current playhead position
      const anchorTimeUs = Math.max(0, Math.min(durationUs, currentTimeUs));

      // Calculate anchor's relative position in current viewport (0-1)
      const anchorRelative = visibleDurationUs > 0
        ? (anchorTimeUs - viewport.startTimeUs) / visibleDurationUs
        : 0.5;

      // Calculate new viewport keeping anchor at same relative position
      const newStartTimeUs = anchorTimeUs - newVisibleDuration * anchorRelative;
      const newEndTimeUs = newStartTimeUs + newVisibleDuration;

      const newViewport = clampViewport({
        startTimeUs: newStartTimeUs,
        endTimeUs: newEndTimeUs,
        zoomLevel: clampedZoom,
      });

      setViewportState(newViewport);
    },
    [durationUs, currentTimeUs, viewport.startTimeUs, visibleDurationUs, clampViewport]
  );

  // Zoom in by one step
  const zoomIn = useCallback(() => {
    if (!canZoomIn) return;
    zoomTo(viewport.zoomLevel * ZOOM_STEP);
  }, [canZoomIn, viewport.zoomLevel, zoomTo]);

  // Zoom out by one step
  const zoomOut = useCallback(() => {
    if (!canZoomOut) return;
    zoomTo(viewport.zoomLevel / ZOOM_STEP);
  }, [canZoomOut, viewport.zoomLevel, zoomTo]);

  // Reset to fit entire video
  const zoomToFit = useCallback(() => {
    setViewportState({
      startTimeUs: 0,
      endTimeUs: durationUs,
      zoomLevel: 1,
    });
  }, [durationUs]);

  // Pan viewport by delta
  const pan = useCallback(
    (deltaTimeUs: number) => {
      const newViewport = clampViewport({
        ...viewport,
        startTimeUs: viewport.startTimeUs + deltaTimeUs,
        endTimeUs: viewport.endTimeUs + deltaTimeUs,
      });
      setViewportState(newViewport);
    },
    [viewport, clampViewport]
  );

  // Direct viewport setter (for external control)
  const setViewport = useCallback(
    (newViewport: TimelineViewport) => {
      setViewportState(clampViewport(newViewport));
    },
    [clampViewport]
  );

  // Update viewport when duration changes (e.g., new video loaded)
  // This is handled by the component that uses this hook resetting the viewport

  return {
    viewport,
    zoomIn,
    zoomOut,
    zoomToFit,
    zoomTo,
    pan,
    setViewport,
    visibleDurationUs,
    canZoomIn,
    canZoomOut,
  };
}
