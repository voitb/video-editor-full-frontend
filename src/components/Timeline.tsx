import { useRef, useEffect } from 'react';
import { secondsToUs, formatTimeCompact } from '../utils/time';
import { TimelineSprites } from './TimelineSprites';
import { TimelineMinimap } from './TimelineMinimap';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineTrimHandles } from './TimelineTrimHandles';
import { TimelineZoomControls } from './TimelineZoomControls';
import { useTimelineDrag } from '../hooks/useTimelineDrag';
import { useTimelineTrim } from '../hooks/useTimelineTrim';
import type { MediaTrack, TimelineViewport } from '../types/editor';
import { TrackLabelColumn, TrackLanes } from './multitrack/TimelineTracks';
import { TIME } from '../constants';

const { MICROSECONDS_PER_SECOND } = TIME;
const TRACK_LABEL_WIDTH = 156;
const DEFAULT_LANE_HEIGHT = 48;

interface TimelineProps {
  duration: number; // seconds
  currentTime: number; // seconds
  inPoint: number; // microseconds
  outPoint: number; // microseconds
  timelineDurationUs?: number; // optional override for multi-track compositions
  trimMaxUs?: number; // maximum allowed trim boundary
  tracks?: MediaTrack[];
  laneHeight?: number;
  onSeek: (timeUs: number) => void;
  onTrimChange: (inPoint: number, outPoint: number) => void;
  posterUrl?: string;
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
  timelineDurationUs,
  trimMaxUs,
  tracks,
  laneHeight = DEFAULT_LANE_HEIGHT,
  onSeek,
  onTrimChange,
  posterUrl,
  viewport,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  canZoomIn,
  canZoomOut,
  onViewportChange,
}: TimelineProps) {
  const trackList = tracks ?? [];
  const hasTracks = trackList.length > 0;
  const labelWidth = hasTracks ? TRACK_LABEL_WIDTH : 0;
  const trackAreaHeight = hasTracks
    ? Math.max(trackList.length * laneHeight, laneHeight)
    : 48;
  const totalDurationUs = timelineDurationUs ?? secondsToUs(duration);
  const trimBoundaryUs = trimMaxUs ?? totalDurationUs;
  const durationSecondsForSprites = totalDurationUs / MICROSECONDS_PER_SECOND;

  // Derived values
  const visibleDurationUs = Math.max(viewport.endTimeUs - viewport.startTimeUs, 1);

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
    maxTrimUs: trimBoundaryUs,
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

  if (totalDurationUs === 0) {
    return (
      <div className="w-full h-16 bg-gray-800 rounded-lg flex items-center justify-center text-gray-500">
        Load media to see the timeline and tracks
      </div>
    );
  }

  // Combine drag states for track click handling
  const isAnyDragging = isDragging || isDraggingTrim !== null;

  return (
    <div className="w-full">
      {/* Minimap (only visible when zoomed in) */}
      <div className="flex items-center gap-2 mb-1">
        {hasTracks && <div style={{ width: labelWidth }} />}
        <div className="flex-1">
          <TimelineMinimap
            totalDurationUs={totalDurationUs}
            viewport={viewport}
            onViewportChange={onViewportChange}
          />
        </div>
      </div>

      {/* Timeline track + labels */}
      <div className="flex">
        {hasTracks && (
          <TrackLabelColumn tracks={trackList} laneHeight={laneHeight} width={labelWidth} />
        )}

        <div
          ref={trackRef}
          className={`relative flex-1 bg-gray-800 rounded-lg cursor-pointer overflow-hidden ${
            hasTracks ? 'rounded-l-none' : ''
          }`}
          style={{ height: trackAreaHeight }}
          onClick={isAnyDragging ? undefined : handleTrackClick}
        >
          {/* Sprite thumbnails (background layer) */}
          <TimelineSprites
            posterUrl={posterUrl}
            duration={durationSecondsForSprites}
            viewport={viewport}
          />

          {/* Multitrack lanes (video + audio) */}
          {hasTracks && (
            <TrackLanes tracks={trackList} viewport={viewport} laneHeight={laneHeight} />
          )}

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
      </div>

      {/* Time labels and zoom controls */}
      <div className="flex items-center text-xs text-gray-400 mt-1">
        {hasTracks && <div style={{ width: labelWidth }} />}
        <div className="flex-1 flex justify-between items-center gap-3">
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
    </div>
  );
}
