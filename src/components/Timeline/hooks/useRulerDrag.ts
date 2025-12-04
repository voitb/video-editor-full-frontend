/**
 * Hook for handling ruler drag-to-seek behavior
 */

import { useCallback, useEffect, useState } from 'react';

interface UseRulerDragOptions {
  timeRulerScrollRef: React.RefObject<HTMLDivElement>;
  pixelToTime: (pixel: number) => number;
  durationUs: number;
  onSeek?: (timeUs: number) => void;
}

interface UseRulerDragReturn {
  isRulerDragging: boolean;
  handleRulerMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Hook that manages drag-to-seek behavior on the time ruler
 */
export function useRulerDrag({
  timeRulerScrollRef,
  pixelToTime,
  durationUs,
  onSeek,
}: UseRulerDragOptions): UseRulerDragReturn {
  const [isRulerDragging, setIsRulerDragging] = useState(false);

  // Handle ruler mouse down to start dragging
  const handleRulerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onSeek || !timeRulerScrollRef.current) return;

      setIsRulerDragging(true);

      const rect = timeRulerScrollRef.current.getBoundingClientRect();
      const scrollLeftVal = timeRulerScrollRef.current.scrollLeft;
      const x = e.clientX - rect.left + scrollLeftVal;
      const time = pixelToTime(x);
      const clampedTime = Math.max(0, Math.min(time, durationUs));
      onSeek(clampedTime);
    },
    [onSeek, pixelToTime, durationUs, timeRulerScrollRef]
  );

  // Handle ruler drag for scrubbing playhead
  useEffect(() => {
    if (!isRulerDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timeRulerScrollRef.current || !onSeek) return;

      const rect = timeRulerScrollRef.current.getBoundingClientRect();
      const scrollLeftVal = timeRulerScrollRef.current.scrollLeft;
      const x = e.clientX - rect.left + scrollLeftVal;
      const time = pixelToTime(x);
      const clampedTime = Math.max(0, Math.min(time, durationUs));
      onSeek(clampedTime);
    };

    const handleMouseUp = () => {
      setIsRulerDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isRulerDragging, pixelToTime, durationUs, onSeek, timeRulerScrollRef]);

  return { isRulerDragging, handleRulerMouseDown };
}
