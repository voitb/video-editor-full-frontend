import { useRef, useCallback, useState, useEffect } from 'react';
import { secondsToUs, usToSeconds } from '../utils/time';
import { TimelineSprites } from './TimelineSprites';
import type { SpriteData } from '../hooks/useSpriteWorker';
import type { TimelineViewport } from '../types/editor';

// Constants
const SEEK_THROTTLE_MS = 50; // Throttle for decoder seeks (not visual updates)
const MIN_TRIM_DURATION_US = 100_000; // 100ms minimum trim duration

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
}: TimelineProps) {
  // Calculate visible duration from viewport
  const visibleDurationUs = viewport.endTimeUs - viewport.startTimeUs;
  const visibleDurationSec = usToSeconds(visibleDurationUs);
  const trackRef = useRef<HTMLDivElement>(null);
  const lastSeekRef = useRef<number>(0); // Initialized on first use, not during render
  const cachedRectRef = useRef<DOMRect | null>(null); // Cache getBoundingClientRect during drag
  const [isDragging, setIsDragging] = useState<'playhead' | 'in' | 'out' | null>(null);

  // Refs for direct DOM manipulation during drag (zero re-renders)
  const playheadRef = useRef<HTMLDivElement>(null);
  const inHandleRef = useRef<HTMLDivElement>(null);
  const outHandleRef = useRef<HTMLDivElement>(null);
  const activeRegionRef = useRef<HTMLDivElement>(null);
  const inactiveLeftRef = useRef<HTMLDivElement>(null);
  const inactiveRightRef = useRef<HTMLDivElement>(null);
  const dragPositionRef = useRef<number | null>(null); // Store position during drag

  // Helper to convert time to viewport-relative percentage
  const timeToViewportPercent = useCallback(
    (timeUs: number): number => {
      if (visibleDurationUs === 0) return 0;
      return ((timeUs - viewport.startTimeUs) / visibleDurationUs) * 100;
    },
    [viewport.startTimeUs, visibleDurationUs]
  );

  // Calculate percentages relative to viewport (not total duration)
  const inPercent = timeToViewportPercent(inPoint);
  const outPercent = timeToViewportPercent(outPoint);
  const playheadPercent = timeToViewportPercent(secondsToUs(currentTime));

  const getTimeFromMouseX = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return 0;

      // Use cached rect during drag to avoid layout thrashing
      const rect = cachedRectRef.current ?? trackRef.current.getBoundingClientRect();

      const x = clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      // Convert percentage to time within current viewport
      return viewport.startTimeUs + percent * visibleDurationUs;
    },
    [viewport.startTimeUs, visibleDurationUs]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, type: 'playhead' | 'in' | 'out') => {
      e.preventDefault();

      // Cache getBoundingClientRect at start of drag
      if (trackRef.current) {
        cachedRectRef.current = trackRef.current.getBoundingClientRect();
      }

      setIsDragging(type);
    },
    []
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;
      const timeUs = getTimeFromMouseX(e.clientX);
      const clampedTime = Math.max(inPoint, Math.min(timeUs, outPoint));
      onSeek(clampedTime);
    },
    [getTimeFromMouseX, inPoint, outPoint, onSeek, isDragging]
  );

  // Helper to update DOM elements directly (zero re-renders)
  const updatePlayheadDOM = useCallback((percent: number) => {
    if (playheadRef.current) {
      playheadRef.current.style.left = `calc(${percent}% - 8px)`;
    }
  }, []);

  const updateTrimHandlesDOM = useCallback((newInPercent: number, newOutPercent: number) => {
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
  }, []);

  // Mouse wheel zoom handler (Ctrl/Cmd + scroll)
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const handleWheel = (e: WheelEvent) => {
      // Only zoom when Ctrl (Windows/Linux) or Cmd (Mac) is held
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();

      // Zoom in/out based on scroll direction
      if (e.deltaY < 0) {
        onZoomIn();
      } else {
        onZoomOut();
      }
    };

    track.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      track.removeEventListener('wheel', handleWheel);
    };
  }, [onZoomIn, onZoomOut]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const timeUs = getTimeFromMouseX(e.clientX);

      if (isDragging === 'playhead') {
        const clampedTimeUs = Math.max(inPoint, Math.min(timeUs, outPoint));

        // DIRECT DOM UPDATE: Zero re-renders during drag
        // Calculate viewport-relative percentage
        const percent = ((clampedTimeUs - viewport.startTimeUs) / visibleDurationUs) * 100;
        updatePlayheadDOM(percent);

        // Store position for commit on mouseup
        dragPositionRef.current = clampedTimeUs;

        // THROTTLED SEEK: Send seek to decoder at throttled rate
        const now = Date.now();
        const elapsed = now - lastSeekRef.current;

        if (elapsed >= SEEK_THROTTLE_MS) {
          lastSeekRef.current = now;
          onSeek(clampedTimeUs);
        }
      } else if (isDragging === 'in') {
        const newInPoint = Math.max(0, Math.min(timeUs, outPoint - MIN_TRIM_DURATION_US));
        // Calculate viewport-relative percentages
        const newInPercent = ((newInPoint - viewport.startTimeUs) / visibleDurationUs) * 100;
        const currentOutPercent = ((outPoint - viewport.startTimeUs) / visibleDurationUs) * 100;

        // DIRECT DOM UPDATE for trim handles
        updateTrimHandlesDOM(newInPercent, currentOutPercent);

        // Store for commit on mouseup
        dragPositionRef.current = newInPoint;

        // Throttled state update for trim
        const now = Date.now();
        const elapsed = now - lastSeekRef.current;

        if (elapsed >= SEEK_THROTTLE_MS) {
          lastSeekRef.current = now;
          onTrimChange(newInPoint, outPoint);
          const currentTimeUs = secondsToUs(currentTime);
          if (currentTimeUs < newInPoint || currentTimeUs > outPoint) {
            onSeek(newInPoint);
          }
        }
      } else if (isDragging === 'out') {
        const maxUs = secondsToUs(duration);
        const newOutPoint = Math.max(inPoint + MIN_TRIM_DURATION_US, Math.min(timeUs, maxUs));
        // Calculate viewport-relative percentages
        const currentInPercent = ((inPoint - viewport.startTimeUs) / visibleDurationUs) * 100;
        const newOutPercent = ((newOutPoint - viewport.startTimeUs) / visibleDurationUs) * 100;

        // DIRECT DOM UPDATE for trim handles
        updateTrimHandlesDOM(currentInPercent, newOutPercent);

        // Store for commit on mouseup
        dragPositionRef.current = newOutPoint;

        // Throttled state update for trim
        const now = Date.now();
        const elapsed = now - lastSeekRef.current;

        if (elapsed >= SEEK_THROTTLE_MS) {
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
      // Commit final position to React state
      if (dragPositionRef.current !== null) {
        if (isDragging === 'playhead') {
          onSeek(dragPositionRef.current);
        } else if (isDragging === 'in') {
          onTrimChange(dragPositionRef.current, outPoint);
        } else if (isDragging === 'out') {
          onTrimChange(inPoint, dragPositionRef.current);
        }
      }

      dragPositionRef.current = null;
      cachedRectRef.current = null;
      setIsDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, getTimeFromMouseX, inPoint, outPoint, duration, onSeek, onTrimChange, currentTime, updatePlayheadDOM, updateTrimHandlesDOM, viewport.startTimeUs, visibleDurationUs]);

  if (duration === 0) {
    return (
      <div className="w-full h-16 bg-gray-800 rounded-lg flex items-center justify-center text-gray-500">
        Load a video to see timeline
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative w-full h-12 bg-gray-800 rounded cursor-pointer overflow-hidden"
        onClick={handleTrackClick}
      >
        {/* Sprite thumbnails (background layer) */}
        <TimelineSprites
          sprites={sprites}
          duration={duration}
          isGenerating={isGeneratingSprites}
          progress={spriteProgress}
          viewport={viewport}
        />

        {/* Active region (between in and out points) - semi-transparent to show sprites */}
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
          style={{
            left: 0,
            width: `${inPercent}%`,
          }}
        />
        <div
          ref={inactiveRightRef}
          className="absolute top-0 h-full bg-gray-900/70"
          style={{
            left: `${outPercent}%`,
            right: 0,
          }}
        />

        {/* In point handle */}
        <div
          ref={inHandleRef}
          className="absolute top-0 h-full w-[12px] bg-green-500 cursor-ew-resize hover:bg-green-400 z-10"
          style={{ left: `calc(${inPercent}% - 6px)` }}
          onMouseDown={(e) => handleMouseDown(e, 'in')}
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
          onMouseDown={(e) => handleMouseDown(e, 'out')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-red-400 whitespace-nowrap">
            OUT
          </div>
        </div>

        {/* Playhead - wide hit area with thin visual line */}
        <div
          ref={playheadRef}
          className="absolute top-0 h-full w-4 cursor-ew-resize z-20 flex justify-center"
          style={{ left: `calc(${playheadPercent}% - 8px)` }}
          onMouseDown={(e) => handleMouseDown(e, 'playhead')}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Visual line */}
          <div className="w-0.5 h-full bg-white" />
          {/* Triangle indicator */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-white" />
        </div>
      </div>

      {/* Time labels and zoom controls */}
      <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
        {/* Viewport time range */}
        <span>
          {Math.floor(usToSeconds(viewport.startTimeUs) / 60)}:
          {String(Math.floor(usToSeconds(viewport.startTimeUs) % 60)).padStart(2, '0')}
        </span>

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

        {/* Viewport end time */}
        <span>
          {Math.floor(usToSeconds(viewport.endTimeUs) / 60)}:
          {String(Math.floor(usToSeconds(viewport.endTimeUs) % 60)).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}
