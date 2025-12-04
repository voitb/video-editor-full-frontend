/**
 * Hook for handling wheel-based zoom in the Timeline
 */

import { useEffect } from 'react';

interface UseTimelineZoomOptions {
  timelineContentRef: React.RefObject<HTMLDivElement | null>;
  onZoomAtPosition?: (positionRatio: number, direction: 'in' | 'out') => void;
}

/**
 * Hook that handles wheel events for zooming at cursor position
 */
export function useTimelineZoom({
  timelineContentRef,
  onZoomAtPosition,
}: UseTimelineZoomOptions): void {
  useEffect(() => {
    const el = timelineContentRef.current;
    if (!el) return;

    const handleWheelNative = (e: WheelEvent) => {
      // Only handle zoom when Ctrl/Cmd is pressed
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();

      if (!onZoomAtPosition) return;

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const positionRatio = Math.max(0, Math.min(1, mouseX / rect.width));
      const direction = e.deltaY < 0 ? 'in' : 'out';

      onZoomAtPosition(positionRatio, direction);
    };

    el.addEventListener('wheel', handleWheelNative, { passive: false });

    return () => {
      el.removeEventListener('wheel', handleWheelNative);
    };
  }, [timelineContentRef, onZoomAtPosition]);
}
