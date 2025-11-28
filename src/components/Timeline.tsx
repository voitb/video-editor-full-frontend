import { useRef, useEffect } from 'react';
import { secondsToUs, usToSeconds } from '../utils/time';
import { TimelineSprites } from './TimelineSprites';
import { TimelineMinimap } from './TimelineMinimap';
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

  // Format time for display
  const formatTime = (us: number) => {
    const secs = usToSeconds(us);
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${String(remainingSecs).padStart(2, '0')}`;
  };

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

        {/* Active region (between in and out points) */}
        <div
          ref={activeRegionRef}
          className="absolute top-0 h-full bg-gray-600/30"
          style={{
            left: `${inPercent}%`,
            width: `${outPercent - inPercent}%`,
          }}
        />

        {/* Inactive regions (dimmed) */}
        <div
          ref={inactiveLeftRef}
          className="absolute top-0 h-full bg-gray-900/70"
          style={{ left: 0, width: `${inPercent}%` }}
        />
        <div
          ref={inactiveRightRef}
          className="absolute top-0 h-full bg-gray-900/70"
          style={{ left: `${outPercent}%`, right: 0 }}
        />

        {/* In point handle */}
        <div
          ref={inHandleRef}
          className="absolute top-0 h-full w-[12px] bg-green-500 cursor-ew-resize hover:bg-green-400 z-10"
          style={{ left: `calc(${inPercent}% - 6px)` }}
          onMouseDown={handleInMouseDown}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-green-400 whitespace-nowrap">
            IN
          </div>
        </div>

        {/* Out point handle */}
        <div
          ref={outHandleRef}
          className="absolute top-0 h-full w-[12px] bg-red-500 cursor-ew-resize hover:bg-red-400 z-10"
          style={{ left: `calc(${outPercent}% - 6px)` }}
          onMouseDown={handleOutMouseDown}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-red-400 whitespace-nowrap">
            OUT
          </div>
        </div>

        {/* Playhead */}
        <div
          ref={playheadRef}
          className="absolute top-0 h-full w-4 cursor-ew-resize z-20 flex justify-center"
          style={{ left: `calc(${playheadPercent}% - 8px)` }}
          onMouseDown={handlePlayheadMouseDown}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-0.5 h-full bg-white" />
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-white" />
        </div>
      </div>

      {/* Time labels and zoom controls */}
      <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
        <span>{formatTime(viewport.startTimeUs)}</span>

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onZoomOut}
            disabled={!canZoomOut}
            className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
            title="Zoom Out"
          >
            −
          </button>
          <span className="min-w-[50px] text-center">
            {Math.round(viewport.zoomLevel * 100)}%
          </span>
          <button
            onClick={onZoomIn}
            disabled={!canZoomIn}
            className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
            title="Zoom In"
          >
            +
          </button>
          <button
            onClick={onZoomToFit}
            disabled={viewport.zoomLevel === 1}
            className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
            title="Zoom to Fit"
          >
            Fit
          </button>
        </div>

        <span>{formatTime(viewport.endTimeUs)}</span>
      </div>
    </div>
  );
}
