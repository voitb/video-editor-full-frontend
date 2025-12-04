/**
 * Timeline Scrollbar
 * Custom horizontal scrollbar for timeline.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { ScrollbarProps } from '../types';
import { TIMELINE, TIMELINE_COLORS } from '../../../constants';

interface ExtendedScrollbarProps extends ScrollbarProps {
  /** Whether to show the left spacer matching track header width */
  showLeftSpacer?: boolean;
}

export function Scrollbar({
  containerWidth,
  totalWidth,
  scrollLeft,
  onScroll,
  showLeftSpacer = false,
}: ExtendedScrollbarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);

  // Check if scrollbar should be visible
  const isVisible = totalWidth > containerWidth;

  const thumbWidth = isVisible ? Math.max(30, (containerWidth / totalWidth) * containerWidth) : 0;
  const maxScroll = isVisible ? totalWidth - containerWidth : 1;
  const thumbPosition = isVisible ? (scrollLeft / maxScroll) * (containerWidth - thumbWidth) : 0;

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isVisible) return;
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Account for left spacer if present
      const offsetX = showLeftSpacer ? TIMELINE.TRACK_HEADER_WIDTH : 0;
      const clickX = e.clientX - rect.left - offsetX;
      const trackWidth = showLeftSpacer ? rect.width - TIMELINE.TRACK_HEADER_WIDTH : rect.width;

      // Calculate new scroll position (center thumb on click)
      const clickRatio = (clickX - thumbWidth / 2) / (trackWidth - thumbWidth);
      const newScroll = Math.max(0, Math.min(maxScroll, clickRatio * maxScroll));
      onScroll(newScroll);
    },
    [isVisible, thumbWidth, maxScroll, onScroll, showLeftSpacer]
  );

  const handleThumbMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setIsDragging(true);
      dragStartX.current = e.clientX;
      dragStartScroll.current = scrollLeft;
    },
    [scrollLeft]
  );

  useEffect(() => {
    if (!isDragging || !isVisible) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;

      const trackWidth = showLeftSpacer ? rect.width - TIMELINE.TRACK_HEADER_WIDTH : rect.width;
      const deltaX = e.clientX - dragStartX.current;
      const scrollDelta = (deltaX / (trackWidth - thumbWidth)) * maxScroll;
      const newScroll = Math.max(0, Math.min(maxScroll, dragStartScroll.current + scrollDelta));

      onScroll(newScroll);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isVisible, maxScroll, thumbWidth, onScroll, showLeftSpacer]);

  // Don't render if content fits
  if (!isVisible) {
    return null;
  }

  return (
    <div
      ref={trackRef}
      onClick={handleTrackClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        height: TIMELINE.SCROLLBAR_HEIGHT,
        backgroundColor: TIMELINE_COLORS.scrollbarBg,
        borderTop: `1px solid ${TIMELINE_COLORS.border}`,
        flexShrink: 0,
      }}
    >
      {/* Left spacer matching track header width (optional) */}
      {showLeftSpacer && (
        <div
          style={{
            width: TIMELINE.TRACK_HEADER_WIDTH,
            backgroundColor: TIMELINE_COLORS.trackHeaderBg,
            borderRight: `1px solid ${TIMELINE_COLORS.border}`,
            flexShrink: 0,
          }}
        />
      )}

      {/* Scrollbar track */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          cursor: 'pointer',
        }}
      >
        {/* Thumb */}
        <div
          onMouseDown={handleThumbMouseDown}
          style={{
            position: 'absolute',
            top: 2,
            bottom: 2,
            left: thumbPosition,
            width: thumbWidth,
            backgroundColor:
              isDragging || isHovered
                ? TIMELINE_COLORS.scrollbarThumbHover
                : TIMELINE_COLORS.scrollbarThumb,
            borderRadius: 4,
            cursor: isDragging ? 'grabbing' : 'grab',
            transition: isDragging ? 'none' : 'background-color 0.15s',
          }}
        />
      </div>
    </div>
  );
}
