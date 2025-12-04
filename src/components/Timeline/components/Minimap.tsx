/**
 * Timeline Minimap
 * Canvas-based minimap showing overview of timeline clips.
 */

import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import type { MinimapProps } from '../types';
import { TIMELINE, TIMELINE_COLORS } from '../../../constants';

interface ExtendedMinimapProps extends MinimapProps {
  /** Whether to show the left spacer matching track header width */
  showLeftSpacer?: boolean;
}

export function Minimap({
  tracks,
  durationUs,
  currentTimeUs,
  viewport,
  containerWidth,
  onViewportChange,
  onSeek,
  trackStates,
  getTrackHeight,
  showLeftSpacer = false,
}: ExtendedMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const dragStartX = useRef(0);
  const dragStartViewport = useRef(0);

  const effectiveDuration = Math.max(durationUs, TIMELINE.MIN_VISIBLE_DURATION_US);

  // Calculate total tracks height for proper scaling
  const totalTracksHeight = useMemo(() => {
    return tracks.reduce((sum, track) => sum + getTrackHeight(track.id), 0);
  }, [tracks, getTrackHeight]);

  // Render minimap on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || containerWidth <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = TIMELINE.MINIMAP_HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    const width = containerWidth;
    const height = TIMELINE.MINIMAP_HEIGHT;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = TIMELINE_COLORS.minimapBg;
    ctx.fillRect(0, 0, width, height);

    // Scale factors
    const timeScale = width / effectiveDuration;
    let yOffset = 0;

    // Draw track lanes and clips
    for (const track of tracks) {
      const trackHeight = getTrackHeight(track.id);
      const scaledTrackHeight = (trackHeight / Math.max(totalTracksHeight, 1)) * height;
      const isMuted = trackStates?.[track.id]?.muted ?? false;

      // Track background (subtle)
      ctx.fillStyle =
        track.type === 'video' ? 'rgba(59, 89, 152, 0.2)' : 'rgba(59, 152, 88, 0.2)';
      ctx.fillRect(0, yOffset, width, scaledTrackHeight);

      // Draw clips
      for (const clip of track.clips) {
        const clipX = clip.startUs * timeScale;
        const clipWidth = Math.max(1, clip.durationUs * timeScale);

        ctx.fillStyle = isMuted
          ? 'rgba(128, 128, 128, 0.5)'
          : track.type === 'video'
            ? TIMELINE_COLORS.clipVideo
            : TIMELINE_COLORS.clipAudio;

        ctx.fillRect(clipX, yOffset + 1, clipWidth, scaledTrackHeight - 2);
      }

      yOffset += scaledTrackHeight;
    }

    // Draw viewport rectangle
    const viewportX = (viewport.startTimeUs / effectiveDuration) * width;
    const viewportWidth = ((viewport.endTimeUs - viewport.startTimeUs) / effectiveDuration) * width;

    ctx.fillStyle = TIMELINE_COLORS.viewportRect;
    ctx.fillRect(viewportX, 0, viewportWidth, height);

    ctx.strokeStyle =
      isHovering || isDragging ? 'rgba(255, 255, 255, 0.6)' : TIMELINE_COLORS.viewportBorder;
    ctx.lineWidth = isHovering || isDragging ? 2 : 1;
    ctx.strokeRect(viewportX + 0.5, 0.5, viewportWidth - 1, height - 1);

    // Draw playhead
    const playheadX = (currentTimeUs / effectiveDuration) * width;
    ctx.fillStyle = TIMELINE_COLORS.playhead;
    ctx.fillRect(playheadX - 1, 0, 2, height);
  }, [
    tracks,
    durationUs,
    currentTimeUs,
    viewport,
    effectiveDuration,
    totalTracksHeight,
    trackStates,
    getTrackHeight,
    containerWidth,
    isDragging,
    isHovering,
  ]);

  // Check if mouse is over viewport rectangle
  const isOverViewport = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return false;

      const offsetX = showLeftSpacer ? TIMELINE.TRACK_HEADER_WIDTH : 0;
      const clickX = e.clientX - rect.left - offsetX;
      const adjustedWidth = showLeftSpacer ? rect.width - TIMELINE.TRACK_HEADER_WIDTH : rect.width;
      const viewportX = (viewport.startTimeUs / effectiveDuration) * adjustedWidth;
      const viewportWidth =
        ((viewport.endTimeUs - viewport.startTimeUs) / effectiveDuration) * adjustedWidth;

      return clickX >= viewportX && clickX <= viewportX + viewportWidth;
    },
    [effectiveDuration, viewport, showLeftSpacer]
  );

  // Handle mouse move for hover state
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) {
        setIsHovering(isOverViewport(e));
      }
    },
    [isDragging, isOverViewport]
  );

  // Handle click on minimap (seek or navigate)
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const offsetX = showLeftSpacer ? TIMELINE.TRACK_HEADER_WIDTH : 0;
      const clickX = e.clientX - rect.left - offsetX;
      const adjustedWidth = showLeftSpacer ? rect.width - TIMELINE.TRACK_HEADER_WIDTH : rect.width;
      const clickRatio = clickX / adjustedWidth;
      const clickTimeUs = clickRatio * effectiveDuration;

      if (isOverViewport(e)) {
        // Click inside viewport - seek to position
        onSeek?.(clickTimeUs);
      } else {
        // Click outside viewport - center viewport on click position
        const visibleDuration = viewport.endTimeUs - viewport.startTimeUs;
        const newStartTime = Math.max(
          0,
          Math.min(effectiveDuration - visibleDuration, clickTimeUs - visibleDuration / 2)
        );
        onViewportChange?.(newStartTime);
      }
    },
    [isDragging, effectiveDuration, viewport, onSeek, onViewportChange, isOverViewport, showLeftSpacer]
  );

  // Handle drag to pan viewport
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isOverViewport(e)) {
        e.preventDefault();
        setIsDragging(true);
        dragStartX.current = e.clientX;
        dragStartViewport.current = viewport.startTimeUs;
      }
    },
    [viewport, isOverViewport]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const adjustedWidth = showLeftSpacer ? rect.width - TIMELINE.TRACK_HEADER_WIDTH : rect.width;
      const deltaX = e.clientX - dragStartX.current;
      const deltaTime = (deltaX / adjustedWidth) * effectiveDuration;
      const visibleDuration = viewport.endTimeUs - viewport.startTimeUs;
      const newStartTime = Math.max(
        0,
        Math.min(effectiveDuration - visibleDuration, dragStartViewport.current + deltaTime)
      );

      onViewportChange?.(newStartTime);
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
  }, [isDragging, effectiveDuration, viewport, onViewportChange, showLeftSpacer]);

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setIsHovering(false)}
      style={{
        display: 'flex',
        height: TIMELINE.MINIMAP_HEIGHT,
        borderTop: `1px solid ${TIMELINE_COLORS.border}`,
        cursor: isDragging ? 'grabbing' : isHovering ? 'grab' : 'pointer',
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 9, color: TIMELINE_COLORS.textMuted }}>OVERVIEW</span>
        </div>
      )}

      {/* Canvas minimap */}
      <canvas
        ref={canvasRef}
        style={{
          width: containerWidth,
          height: TIMELINE.MINIMAP_HEIGHT,
          display: 'block',
        }}
      />
    </div>
  );
}
