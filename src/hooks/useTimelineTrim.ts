import { useRef, useState, useEffect, useCallback } from 'react';
import type { RefObject } from 'react';
import { secondsToUs } from '../utils/time';

const SEEK_THROTTLE_MS = 50;
const MIN_TRIM_DURATION_US = 100_000; // 100ms minimum trim duration

interface UseTimelineTrimOptions {
  /** Reference to the track container element */
  trackRef: RefObject<HTMLDivElement | null>;
  /** Reference to the in handle element */
  inHandleRef: RefObject<HTMLDivElement | null>;
  /** Reference to the out handle element */
  outHandleRef: RefObject<HTMLDivElement | null>;
  /** Reference to the active region element */
  activeRegionRef: RefObject<HTMLDivElement | null>;
  /** Reference to the left inactive region element */
  inactiveLeftRef: RefObject<HTMLDivElement | null>;
  /** Reference to the right inactive region element */
  inactiveRightRef: RefObject<HTMLDivElement | null>;
  /** Viewport start time in microseconds */
  viewportStartUs: number;
  /** Visible duration in microseconds */
  visibleDurationUs: number;
  /** Total video duration in seconds */
  duration: number;
  /** Current in point in microseconds */
  inPoint: number;
  /** Current out point in microseconds */
  outPoint: number;
  /** Current playhead time in seconds */
  currentTime: number;
  /** Callback when trim points change */
  onTrimChange: (inPoint: number, outPoint: number) => void;
  /** Callback to seek to a position */
  onSeek: (timeUs: number) => void;
}

interface UseTimelineTrimReturn {
  /** Which handle is being dragged */
  isDraggingTrim: 'in' | 'out' | null;
  /** Handler for in handle mouse down */
  handleInMouseDown: (e: React.MouseEvent) => void;
  /** Handler for out handle mouse down */
  handleOutMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Hook for managing trim handle dragging on the timeline.
 * Uses direct DOM manipulation during drag for zero re-renders.
 */
export function useTimelineTrim({
  trackRef,
  inHandleRef,
  outHandleRef,
  activeRegionRef,
  inactiveLeftRef,
  inactiveRightRef,
  viewportStartUs,
  visibleDurationUs,
  duration,
  inPoint,
  outPoint,
  currentTime,
  onTrimChange,
  onSeek,
}: UseTimelineTrimOptions): UseTimelineTrimReturn {
  const [isDraggingTrim, setIsDraggingTrim] = useState<'in' | 'out' | null>(null);
  const lastSeekRef = useRef<number>(0);
  const cachedRectRef = useRef<DOMRect | null>(null);
  const dragPositionRef = useRef<number | null>(null);

  // Convert mouse X to time
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

  // Update trim handles DOM directly
  const updateTrimHandlesDOM = useCallback(
    (newInPercent: number, newOutPercent: number) => {
      if (inHandleRef.current) {
        inHandleRef.current.style.left = `calc(${newInPercent}% - 6px)`;
      }
      if (outHandleRef.current) {
        outHandleRef.current.style.left = `calc(${newOutPercent}% - 6px)`;
      }
      if (activeRegionRef.current) {
        activeRegionRef.current.style.left = `${newInPercent}%`;
        activeRegionRef.current.style.width = `${newOutPercent - newInPercent}%`;
      }
      if (inactiveLeftRef.current) {
        inactiveLeftRef.current.style.width = `${newInPercent}%`;
      }
      if (inactiveRightRef.current) {
        inactiveRightRef.current.style.left = `${newOutPercent}%`;
      }
    },
    [inHandleRef, outHandleRef, activeRegionRef, inactiveLeftRef, inactiveRightRef]
  );

  // Handle in point mouse down
  const handleInMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (trackRef.current) {
        cachedRectRef.current = trackRef.current.getBoundingClientRect();
      }
      setIsDraggingTrim('in');
    },
    [trackRef]
  );

  // Handle out point mouse down
  const handleOutMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (trackRef.current) {
        cachedRectRef.current = trackRef.current.getBoundingClientRect();
      }
      setIsDraggingTrim('out');
    },
    [trackRef]
  );

  // Mouse move/up during trim drag
  useEffect(() => {
    if (!isDraggingTrim) return;

    const handleMouseMove = (e: MouseEvent) => {
      const timeUs = getTimeFromMouseX(e.clientX);

      if (isDraggingTrim === 'in') {
        const newInPoint = Math.max(0, Math.min(timeUs, outPoint - MIN_TRIM_DURATION_US));
        const newInPercent = ((newInPoint - viewportStartUs) / visibleDurationUs) * 100;
        const currentOutPercent = ((outPoint - viewportStartUs) / visibleDurationUs) * 100;

        updateTrimHandlesDOM(newInPercent, currentOutPercent);
        dragPositionRef.current = newInPoint;

        // Throttled update
        const now = Date.now();
        if (now - lastSeekRef.current >= SEEK_THROTTLE_MS) {
          lastSeekRef.current = now;
          onTrimChange(newInPoint, outPoint);
          const currentTimeUs = secondsToUs(currentTime);
          if (currentTimeUs < newInPoint || currentTimeUs > outPoint) {
            onSeek(newInPoint);
          }
        }
      } else if (isDraggingTrim === 'out') {
        const maxUs = secondsToUs(duration);
        const newOutPoint = Math.max(inPoint + MIN_TRIM_DURATION_US, Math.min(timeUs, maxUs));
        const currentInPercent = ((inPoint - viewportStartUs) / visibleDurationUs) * 100;
        const newOutPercent = ((newOutPoint - viewportStartUs) / visibleDurationUs) * 100;

        updateTrimHandlesDOM(currentInPercent, newOutPercent);
        dragPositionRef.current = newOutPoint;

        // Throttled update
        const now = Date.now();
        if (now - lastSeekRef.current >= SEEK_THROTTLE_MS) {
          lastSeekRef.current = now;
          onTrimChange(inPoint, newOutPoint);
          const currentTimeUs = secondsToUs(currentTime);
          if (currentTimeUs < inPoint || currentTimeUs > newOutPoint) {
            onSeek(inPoint);
          }
        }
      }
    };

    const handleMouseUp = () => {
      if (dragPositionRef.current !== null) {
        if (isDraggingTrim === 'in') {
          onTrimChange(dragPositionRef.current, outPoint);
        } else if (isDraggingTrim === 'out') {
          onTrimChange(inPoint, dragPositionRef.current);
        }
      }

      dragPositionRef.current = null;
      cachedRectRef.current = null;
      setIsDraggingTrim(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDraggingTrim,
    getTimeFromMouseX,
    inPoint,
    outPoint,
    duration,
    currentTime,
    viewportStartUs,
    visibleDurationUs,
    updateTrimHandlesDOM,
    onTrimChange,
    onSeek,
  ]);

  return {
    isDraggingTrim,
    handleInMouseDown,
    handleOutMouseDown,
  };
}
