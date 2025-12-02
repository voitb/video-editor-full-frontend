/**
 * Video Editor V2 - useTimeline Hook
 * React hook for timeline viewport and interactions.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import type { TimelineViewport, TrackUIState } from '../core/types';
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
  /** Reset viewport to show full timeline (optionally with a new duration) */
  resetViewport: (newDurationUs?: number) => void;
  /** Convert timeline time to pixel position */
  timeToPixel: (timeUs: number, containerWidth: number) => number;
  /** Convert pixel position to timeline time */
  pixelToTime: (pixel: number, containerWidth: number) => number;
  /** Get visible duration */
  visibleDurationUs: number;
  /** Pixels per microsecond at current zoom */
  pixelsPerUs: (containerWidth: number) => number;
  /** Zoom at a specific position (ratio 0-1 within visible viewport) */
  zoomAtPosition: (positionRatio: number, direction: 'in' | 'out') => void;

  // Scroll synchronization
  /** Set viewport from scroll position */
  setViewportFromScroll: (scrollLeft: number, containerWidth: number, totalWidth: number) => void;
  /** Get scroll position from current viewport */
  getScrollLeft: (containerWidth: number, totalWidth: number) => number;
  /** Get total timeline width for current zoom */
  getTotalWidth: (containerWidth: number) => number;

  // Track UI state
  /** Track UI states (mute/solo/lock/height) */
  trackStates: Record<string, TrackUIState>;
  /** Set track muted state */
  setTrackMuted: (trackId: string, muted: boolean) => void;
  /** Set track solo state */
  setTrackSolo: (trackId: string, solo: boolean) => void;
  /** Set track locked state */
  setTrackLocked: (trackId: string, locked: boolean) => void;
  /** Set track height */
  setTrackHeight: (trackId: string, height: number) => void;
  /** Get effective track height (from state or default) */
  getTrackHeight: (trackId: string) => number;
  /** Initialize track state if not exists */
  initTrackState: (trackId: string) => void;
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

  // Reset viewport (accepts optional new duration to avoid stale closure issues)
  const resetViewport = useCallback((newDurationUs?: number) => {
    const effectiveDuration = newDurationUs ?? durationUs ?? TIMELINE.MIN_VISIBLE_DURATION_US;
    setViewport({
      startTimeUs: 0,
      endTimeUs: effectiveDuration,
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

  // Zoom at a specific position (DaVinci Resolve style - keeps cursor point stationary)
  const zoomAtPosition = useCallback((positionRatio: number, direction: 'in' | 'out') => {
    setViewport(prev => {
      const currentDuration = prev.endTimeUs - prev.startTimeUs;

      // Anchor point: time at cursor position
      const cursorTimeUs = prev.startTimeUs + positionRatio * currentDuration;

      // New zoom level
      const newZoom = direction === 'in'
        ? Math.min(prev.zoomLevel * TIMELINE.ZOOM_STEP, TIMELINE.MAX_ZOOM_LEVEL)
        : Math.max(prev.zoomLevel / TIMELINE.ZOOM_STEP, 1);

      // New visible duration
      const newDuration = Math.max(durationUs / newZoom, TIMELINE.MIN_VISIBLE_DURATION_US);

      // Keep cursor at same position ratio
      let newStartTimeUs = cursorTimeUs - positionRatio * newDuration;
      let newEndTimeUs = newStartTimeUs + newDuration;

      // Clamp to bounds
      if (newStartTimeUs < 0) {
        newStartTimeUs = 0;
        newEndTimeUs = newDuration;
      }
      if (newEndTimeUs > durationUs) {
        newEndTimeUs = durationUs;
        newStartTimeUs = Math.max(0, durationUs - newDuration);
      }

      return {
        startTimeUs: newStartTimeUs,
        endTimeUs: newEndTimeUs,
        zoomLevel: newZoom,
      };
    });
  }, [durationUs]);

  // ============================================================================
  // SCROLL SYNCHRONIZATION
  // ============================================================================

  // Get total timeline width for current zoom level
  const getTotalWidth = useCallback((containerWidth: number): number => {
    if (containerWidth <= 0) return containerWidth;
    const effectiveDuration = Math.max(durationUs, TIMELINE.MIN_VISIBLE_DURATION_US);
    // At zoom=1, totalWidth = containerWidth (fits exactly)
    // At zoom>1, totalWidth > containerWidth (enables scrolling)
    return containerWidth * viewport.zoomLevel;
  }, [durationUs, viewport.zoomLevel]);

  // Set viewport from scroll position (called when user scrolls)
  const setViewportFromScroll = useCallback((
    scrollLeft: number,
    containerWidth: number,
    totalWidth: number
  ) => {
    if (totalWidth <= containerWidth || containerWidth <= 0) return;

    const effectiveDuration = Math.max(durationUs, TIMELINE.MIN_VISIBLE_DURATION_US);
    const visibleDuration = effectiveDuration / viewport.zoomLevel;

    // Calculate new start time from scroll position
    const scrollRatio = scrollLeft / (totalWidth - containerWidth);
    const maxStartTime = effectiveDuration - visibleDuration;
    const newStartTime = scrollRatio * maxStartTime;

    setViewport(prev => ({
      ...prev,
      startTimeUs: Math.max(0, newStartTime),
      endTimeUs: Math.min(effectiveDuration, newStartTime + visibleDuration),
    }));
  }, [durationUs, viewport.zoomLevel]);

  // Get scroll position from current viewport
  const getScrollLeft = useCallback((containerWidth: number, totalWidth: number): number => {
    if (totalWidth <= containerWidth || containerWidth <= 0) return 0;

    const effectiveDuration = Math.max(durationUs, TIMELINE.MIN_VISIBLE_DURATION_US);
    const visibleDuration = viewport.endTimeUs - viewport.startTimeUs;
    const maxStartTime = effectiveDuration - visibleDuration;

    if (maxStartTime <= 0) return 0;

    const scrollRatio = viewport.startTimeUs / maxStartTime;
    return scrollRatio * (totalWidth - containerWidth);
  }, [durationUs, viewport.startTimeUs, viewport.endTimeUs]);

  // ============================================================================
  // TRACK UI STATE
  // ============================================================================

  const [trackStates, setTrackStates] = useState<Record<string, TrackUIState>>({});

  // Initialize track state if not exists
  const initTrackState = useCallback((trackId: string) => {
    setTrackStates(prev => {
      if (prev[trackId]) return prev;
      return {
        ...prev,
        [trackId]: {
          muted: false,
          solo: false,
          locked: false,
          height: TIMELINE.DEFAULT_TRACK_HEIGHT,
        },
      };
    });
  }, []);

  // Set track muted state
  const setTrackMuted = useCallback((trackId: string, muted: boolean) => {
    setTrackStates(prev => ({
      ...prev,
      [trackId]: {
        ...(prev[trackId] ?? { muted: false, solo: false, locked: false, height: TIMELINE.DEFAULT_TRACK_HEIGHT }),
        muted,
      },
    }));
  }, []);

  // Set track solo state
  const setTrackSolo = useCallback((trackId: string, solo: boolean) => {
    setTrackStates(prev => ({
      ...prev,
      [trackId]: {
        ...(prev[trackId] ?? { muted: false, solo: false, locked: false, height: TIMELINE.DEFAULT_TRACK_HEIGHT }),
        solo,
      },
    }));
  }, []);

  // Set track locked state
  const setTrackLocked = useCallback((trackId: string, locked: boolean) => {
    setTrackStates(prev => ({
      ...prev,
      [trackId]: {
        ...(prev[trackId] ?? { muted: false, solo: false, locked: false, height: TIMELINE.DEFAULT_TRACK_HEIGHT }),
        locked,
      },
    }));
  }, []);

  // Set track height
  const setTrackHeight = useCallback((trackId: string, height: number) => {
    const clampedHeight = Math.max(TIMELINE.MIN_TRACK_HEIGHT, Math.min(height, TIMELINE.MAX_TRACK_HEIGHT));
    setTrackStates(prev => ({
      ...prev,
      [trackId]: {
        ...(prev[trackId] ?? { muted: false, solo: false, locked: false, height: TIMELINE.DEFAULT_TRACK_HEIGHT }),
        height: clampedHeight,
      },
    }));
  }, []);

  // Get track height (from state or default)
  const getTrackHeight = useCallback((trackId: string): number => {
    return trackStates[trackId]?.height ?? TIMELINE.DEFAULT_TRACK_HEIGHT;
  }, [trackStates]);

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
    // Scroll sync
    setViewportFromScroll,
    getScrollLeft,
    getTotalWidth,
    // Track UI state
    trackStates,
    setTrackMuted,
    setTrackSolo,
    setTrackLocked,
    setTrackHeight,
    getTrackHeight,
    initTrackState,
  };
}
