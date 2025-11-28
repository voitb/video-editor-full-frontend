import { useRef, useState, useEffect, useCallback } from 'react';
import type { RefObject } from 'react';
import { TIMELINE } from '../constants';

const { SEEK_THROTTLE_MS } = TIMELINE;

interface UseTimelineDragOptions {
  /** Reference to the track container element */
  trackRef: RefObject<HTMLDivElement | null>;
  /** Reference to the playhead element for direct DOM updates */
  playheadRef: RefObject<HTMLDivElement | null>;
  /** Viewport start time in microseconds */
  viewportStartUs: number;
  /** Visible duration in microseconds */
  visibleDurationUs: number;
  /** In point (trim start) in microseconds */
  inPoint: number;
  /** Out point (trim end) in microseconds */
  outPoint: number;
  /** Callback when seeking to a new position */
  onSeek: (timeUs: number) => void;
}

interface UseTimelineDragReturn {
  /** Whether playhead is currently being dragged */
  isDragging: boolean;
  /** Handler for playhead mouse down */
  handlePlayheadMouseDown: (e: React.MouseEvent) => void;
  /** Handler for track click (seek to position) */
  handleTrackClick: (e: React.MouseEvent) => void;
}

/**
 * Hook for managing playhead dragging on the timeline.
 * Uses direct DOM manipulation during drag for zero re-renders,
 * then commits final position to React state on mouse up.
 */
export function useTimelineDrag({
  trackRef,
  playheadRef,
  viewportStartUs,
  visibleDurationUs,
  inPoint,
  outPoint,
  onSeek,
}: UseTimelineDragOptions): UseTimelineDragReturn {
  const [isDragging, setIsDragging] = useState(false);
  const lastSeekRef = useRef<number>(0);
  const cachedRectRef = useRef<DOMRect | null>(null);
  const dragPositionRef = useRef<number | null>(null);

  // Convert mouse X position to time in microseconds
  const getTimeFromMouseX = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return 0;
      const rect = cachedRectRef.current ?? trackRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      return viewportStartUs + percent * visibleDurationUs;
    },
    [trackRef, viewportStartUs, visibleDurationUs]
  );

  // Update playhead DOM directly (zero re-renders)
  const updatePlayheadDOM = useCallback(
    (percent: number) => {
      if (playheadRef.current) {
        playheadRef.current.style.left = `calc(${percent}% - 8px)`;
      }
    },
    [playheadRef]
  );

  // Handle playhead mouse down
  const handlePlayheadMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Cache getBoundingClientRect at start of drag
      if (trackRef.current) {
        cachedRectRef.current = trackRef.current.getBoundingClientRect();
      }

      setIsDragging(true);
    },
    [trackRef]
  );

  // Handle track click (seek to clicked position)
  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;
      const timeUs = getTimeFromMouseX(e.clientX);
      const clampedTime = Math.max(inPoint, Math.min(timeUs, outPoint));
      onSeek(clampedTime);
    },
    [isDragging, getTimeFromMouseX, inPoint, outPoint, onSeek]
  );

  // Mouse move/up listeners during drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const timeUs = getTimeFromMouseX(e.clientX);
      const clampedTimeUs = Math.max(inPoint, Math.min(timeUs, outPoint));

      // Direct DOM update for smooth visual feedback
      const percent = ((clampedTimeUs - viewportStartUs) / visibleDurationUs) * 100;
      updatePlayheadDOM(percent);

      // Store position for commit on mouseup
      dragPositionRef.current = clampedTimeUs;

      // Throttled seek to decoder
      const now = Date.now();
      if (now - lastSeekRef.current >= SEEK_THROTTLE_MS) {
        lastSeekRef.current = now;
        onSeek(clampedTimeUs);
      }
    };

    const handleMouseUp = () => {
      // Commit final position
      if (dragPositionRef.current !== null) {
        onSeek(dragPositionRef.current);
      }

      dragPositionRef.current = null;
      cachedRectRef.current = null;
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDragging,
    getTimeFromMouseX,
    inPoint,
    outPoint,
    viewportStartUs,
    visibleDurationUs,
    updatePlayheadDOM,
    onSeek,
  ]);

  return {
    isDragging,
    handlePlayheadMouseDown,
    handleTrackClick,
  };
}
