import { useRef, useCallback, useState, useEffect } from 'react';
import type { TimelineViewport } from '../types/editor';

interface TimelineMinimapProps {
  totalDurationUs: number;
  viewport: TimelineViewport;
  onViewportChange: (newViewport: TimelineViewport) => void;
}

export function TimelineMinimap({
  totalDurationUs,
  viewport,
  onViewportChange,
}: TimelineMinimapProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; startTimeUs: number } | null>(null);

  // Calculate viewport region dimensions as percentages
  const visibleDurationUs = viewport.endTimeUs - viewport.startTimeUs;
  const regionWidthPercent = (visibleDurationUs / totalDurationUs) * 100;
  const regionLeftPercent = (viewport.startTimeUs / totalDurationUs) * 100;

  // Convert mouse X position to time
  const getTimeFromMouseX = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      return percent * totalDurationUs;
    },
    [totalDurationUs]
  );

  // Handle click on track (jump to position)
  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;

      const clickTimeUs = getTimeFromMouseX(e.clientX);

      // Center the viewport on the clicked position
      const halfVisible = visibleDurationUs / 2;
      let newStartTimeUs = clickTimeUs - halfVisible;
      let newEndTimeUs = clickTimeUs + halfVisible;

      // Clamp to bounds
      if (newStartTimeUs < 0) {
        newStartTimeUs = 0;
        newEndTimeUs = visibleDurationUs;
      }
      if (newEndTimeUs > totalDurationUs) {
        newEndTimeUs = totalDurationUs;
        newStartTimeUs = totalDurationUs - visibleDurationUs;
      }

      onViewportChange({
        ...viewport,
        startTimeUs: newStartTimeUs,
        endTimeUs: newEndTimeUs,
      });
    },
    [getTimeFromMouseX, visibleDurationUs, totalDurationUs, viewport, onViewportChange, isDragging]
  );

  // Handle region drag start
  const handleRegionMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDragging(true);
      dragStartRef.current = {
        mouseX: e.clientX,
        startTimeUs: viewport.startTimeUs,
      };
    },
    [viewport.startTimeUs]
  );

  // Handle drag move and end
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaTimeUs = (deltaX / rect.width) * totalDurationUs;

      let newStartTimeUs = dragStartRef.current.startTimeUs + deltaTimeUs;
      let newEndTimeUs = newStartTimeUs + visibleDurationUs;

      // Clamp to bounds
      if (newStartTimeUs < 0) {
        newStartTimeUs = 0;
        newEndTimeUs = visibleDurationUs;
      }
      if (newEndTimeUs > totalDurationUs) {
        newEndTimeUs = totalDurationUs;
        newStartTimeUs = totalDurationUs - visibleDurationUs;
      }

      onViewportChange({
        ...viewport,
        startTimeUs: newStartTimeUs,
        endTimeUs: newEndTimeUs,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, totalDurationUs, visibleDurationUs, viewport, onViewportChange]);

  // Don't render if at 100% zoom
  if (viewport.zoomLevel <= 1) {
    return null;
  }

  return (
    <div
      ref={trackRef}
      className="relative w-full h-2 bg-gray-700 rounded cursor-pointer mb-2"
      onClick={handleTrackClick}
    >
      {/* Viewport region indicator */}
      <div
        className={`absolute top-0 h-full bg-blue-500 rounded ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          left: `${regionLeftPercent}%`,
          width: `${Math.max(regionWidthPercent, 2)}%`, // Minimum 2% width for visibility
        }}
        onMouseDown={handleRegionMouseDown}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
