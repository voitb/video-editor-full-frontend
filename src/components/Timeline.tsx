import { useRef, useEffect } from 'react';
import { secondsToUs, formatTimeCompact } from '../utils/time';
import { TimelineSprites } from './TimelineSprites';
import { TimelineMinimap } from './TimelineMinimap';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineTrimHandles } from './TimelineTrimHandles';
import { TimelineZoomControls } from './TimelineZoomControls';
import { useTimelineDrag } from '../hooks/useTimelineDrag';
import { useTimelineTrim } from '../hooks/useTimelineTrim';
import type { SpriteData } from '../hooks/useSpriteWorker';
import type { TimelineViewport } from '../types/editor';

interface TimelineProps {
  duration: number; // seconds
  currentTime: number; // seconds
  inPoint: number; // microseconds
  outPoint: number; // microseconds
  onSeek: (timeUs: number) => void;
  onTrimChange: (inPoint: number, outPoint: number) => void;
  // Sprite props
  sprites?: SpriteData[];
  isGeneratingSprites?: boolean;
  spriteProgress?: { generated: number; total: number } | null;
  // Viewport/zoom props
  viewport: TimelineViewport;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onViewportChange: (viewport: TimelineViewport) => void;
}

export function Timeline({
  duration,
  currentTime,
  inPoint,
  outPoint,
  onSeek,
  onTrimChange,
  sprites = [],
  isGeneratingSprites = false,
  spriteProgress = null,
  viewport,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  canZoomIn,
  canZoomOut,
  onViewportChange,
}: TimelineProps) {
  // Derived values
  const visibleDurationUs = viewport.endTimeUs - viewport.startTimeUs;

  // DOM refs
  const trackRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const inHandleRef = useRef<HTMLDivElement>(null);
  const outHandleRef = useRef<HTMLDivElement>(null);
  const activeRegionRef = useRef<HTMLDivElement>(null);
  const inactiveLeftRef = useRef<HTMLDivElement>(null);
  const inactiveRightRef = useRef<HTMLDivElement>(null);

  // Playhead dragging hook
  const { isDragging, handlePlayheadMouseDown, handleTrackClick } = useTimelineDrag({
    trackRef,
    playheadRef,
    viewportStartUs: viewport.startTimeUs,
    visibleDurationUs,
    inPoint,
    outPoint,
    onSeek,
  });

  // Trim handle dragging hook
  const { isDraggingTrim, handleInMouseDown, handleOutMouseDown } = useTimelineTrim({
    trackRef,
    inHandleRef,
    outHandleRef,
    activeRegionRef,
    inactiveLeftRef,
    inactiveRightRef,
    viewportStartUs: viewport.startTimeUs,
    visibleDurationUs,
    duration,
    inPoint,
    outPoint,
    currentTime,
    onTrimChange,
    onSeek,
  });

  // Calculate percentages relative to viewport
  const timeToViewportPercent = (timeUs: number): number => {
    if (visibleDurationUs === 0) return 0;
    return ((timeUs - viewport.startTimeUs) / visibleDurationUs) * 100;
  };

  const inPercent = timeToViewportPercent(inPoint);
  const outPercent = timeToViewportPercent(outPoint);
  const playheadPercent = timeToViewportPercent(secondsToUs(currentTime));

  // Mouse wheel zoom handler (Ctrl/Cmd + scroll)
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        onZoomIn();
      } else {
        onZoomOut();
      }
    };

    track.addEventListener('wheel', handleWheel, { passive: false });
    return () => track.removeEventListener('wheel', handleWheel);
  }, [onZoomIn, onZoomOut]);

  if (duration === 0) {
    return (
      <div className="w-full h-16 bg-gray-800 rounded-lg flex items-center justify-center text-gray-500">
        Load a video to see timeline
      </div>
    );
  }

  // Combine drag states for track click handling
  const isAnyDragging = isDragging || isDraggingTrim !== null;

  return (
    <div className="w-full">
      {/* Minimap (only visible when zoomed in) */}
      <TimelineMinimap
        totalDurationUs={secondsToUs(duration)}
        viewport={viewport}
        onViewportChange={onViewportChange}
      />

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative w-full h-12 bg-gray-800 rounded cursor-pointer overflow-hidden"
        onClick={isAnyDragging ? undefined : handleTrackClick}
      >
        {/* Sprite thumbnails (background layer) */}
        <TimelineSprites
          sprites={sprites}
          duration={duration}
          isGenerating={isGeneratingSprites}
          progress={spriteProgress}
          viewport={viewport}
        />

        {/* Trim handles and regions */}
        <TimelineTrimHandles
          inHandleRef={inHandleRef}
          outHandleRef={outHandleRef}
          activeRegionRef={activeRegionRef}
          inactiveLeftRef={inactiveLeftRef}
          inactiveRightRef={inactiveRightRef}
          inPercent={inPercent}
          outPercent={outPercent}
          onInMouseDown={handleInMouseDown}
          onOutMouseDown={handleOutMouseDown}
        />

        {/* Playhead */}
        <TimelinePlayhead
          playheadRef={playheadRef}
          playheadPercent={playheadPercent}
          onMouseDown={handlePlayheadMouseDown}
        />
      </div>

      {/* Time labels and zoom controls */}
      <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
        <span>{formatTimeCompact(viewport.startTimeUs)}</span>

        <TimelineZoomControls
          zoomLevel={viewport.zoomLevel}
          canZoomIn={canZoomIn}
          canZoomOut={canZoomOut}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onZoomToFit={onZoomToFit}
        />

        <span>{formatTimeCompact(viewport.endTimeUs)}</span>
      </div>
    </div>
  );
}
