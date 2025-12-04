/**
 * Video Editor V2 - useTimeline Hook
 * React hook for timeline viewport and interactions.
 * Composes smaller specialized hooks for maintainability.
 */

import { useViewportState } from './useViewportState';
import { useViewportZoom } from './useViewportZoom';
import { useViewportPan } from './useViewportPan';
import { useTimelineCoordinates } from './useTimelineCoordinates';
import { useScrollSync } from './useScrollSync';
import { useTrackUIState } from './useTrackUIState';

export interface UseTimelineOptions {
  durationUs: number;
  initialZoom?: number;
}

export interface UseTimelineReturn {
  viewport: import('../../core/types').TimelineViewport;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoom: (level: number) => void;
  pan: (deltaUs: number) => void;
  centerOn: (timeUs: number) => void;
  resetViewport: (newDurationUs?: number) => void;
  timeToPixel: (timeUs: number, containerWidth: number) => number;
  pixelToTime: (pixel: number, containerWidth: number) => number;
  visibleDurationUs: number;
  pixelsPerUs: (containerWidth: number) => number;
  zoomAtPosition: (positionRatio: number, direction: 'in' | 'out') => void;
  setViewportFromScroll: (scrollLeft: number, containerWidth: number, totalWidth: number) => void;
  getScrollLeft: (containerWidth: number, totalWidth: number) => number;
  getTotalWidth: (containerWidth: number) => number;
  trackStates: Record<string, import('../../core/types').TrackUIState>;
  setTrackMuted: (trackId: string, muted: boolean) => void;
  setTrackSolo: (trackId: string, solo: boolean) => void;
  setTrackLocked: (trackId: string, locked: boolean) => void;
  setTrackHeight: (trackId: string, height: number) => void;
  getTrackHeight: (trackId: string) => number;
  initTrackState: (trackId: string) => void;
}

export function useTimeline(options: UseTimelineOptions): UseTimelineReturn {
  const { durationUs, initialZoom } = options;

  // Base viewport state
  const { viewport, setViewport, visibleDurationUs } = useViewportState({
    durationUs,
    initialZoom,
  });

  // Zoom operations
  const { zoomIn, zoomOut, setZoom, zoomAtPosition, resetViewport } = useViewportZoom({
    durationUs,
    setViewport,
  });

  // Pan operations
  const { pan, centerOn } = useViewportPan({
    durationUs,
    setViewport,
  });

  // Coordinate conversion
  const { timeToPixel, pixelToTime, pixelsPerUs } = useTimelineCoordinates({
    viewport,
  });

  // Scroll synchronization
  const { getTotalWidth, setViewportFromScroll, getScrollLeft } = useScrollSync({
    durationUs,
    viewport,
    setViewport,
  });

  // Track UI state
  const {
    trackStates,
    setTrackMuted,
    setTrackSolo,
    setTrackLocked,
    setTrackHeight,
    getTrackHeight,
    initTrackState,
  } = useTrackUIState();

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
    zoomAtPosition,
    setViewportFromScroll,
    getScrollLeft,
    getTotalWidth,
    trackStates,
    setTrackMuted,
    setTrackSolo,
    setTrackLocked,
    setTrackHeight,
    getTrackHeight,
    initTrackState,
  };
}
