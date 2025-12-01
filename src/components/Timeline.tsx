import { useRef, useEffect } from 'react';
import { secondsToUs, formatTimeCompact } from '../utils/time';
import { TimelineSprites } from './TimelineSprites';
import { TimelineMinimap } from './TimelineMinimap';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineZoomControls } from './TimelineZoomControls';
import { useTimelineDrag } from '../hooks/useTimelineDrag';
import type { ClipChange, MediaTrack, TimelineViewport } from '../types/editor';
import { TrackLabelColumn, TrackLanes } from './multitrack/TimelineTracks';
import { TIME } from '../constants';

const { MICROSECONDS_PER_SECOND } = TIME;
const TRACK_LABEL_WIDTH = 156;
const DEFAULT_LANE_HEIGHT = 48;

interface TimelineProps {
  duration: number; // seconds
  currentTime: number; // seconds
  timelineDurationUs?: number; // optional override for multi-track compositions
  tracks?: MediaTrack[];
  laneHeight?: number;
  onSeek: (timeUs: number) => void;
  posterUrl?: string;
  // Viewport/zoom props
  viewport: TimelineViewport;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onViewportChange: (viewport: TimelineViewport) => void;
  onClipChange?: (change: ClipChange) => void;
}

export function Timeline({
  duration,
  currentTime,
  timelineDurationUs,
  tracks,
  laneHeight = DEFAULT_LANE_HEIGHT,
  onSeek,
  posterUrl,
  viewport,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  canZoomIn,
  canZoomOut,
  onViewportChange,
  onClipChange,
}: TimelineProps) {
  const trackList = tracks ?? [];
  const hasTracks = trackList.length > 0;
  const labelWidth = hasTracks ? TRACK_LABEL_WIDTH : 0;
  const trackAreaHeight = hasTracks
    ? Math.max(trackList.length * laneHeight, laneHeight)
    : 48;
  const totalDurationUs = timelineDurationUs ?? secondsToUs(duration);
  const durationSecondsForSprites = totalDurationUs / MICROSECONDS_PER_SECOND;

  // Derived values
  const visibleDurationUs = Math.max(viewport.endTimeUs - viewport.startTimeUs, 1);

  // DOM refs
  const trackRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  // Playhead dragging hook (no longer constrained by global trim)
  const { isDragging, handlePlayheadMouseDown, handleTrackClick } = useTimelineDrag({
    trackRef,
    playheadRef,
    viewportStartUs: viewport.startTimeUs,
    visibleDurationUs,
    inPoint: 0,
    outPoint: totalDurationUs,
    onSeek,
  });

  // Calculate percentages relative to viewport
  const timeToViewportPercent = (timeUs: number): number => {
    if (visibleDurationUs === 0) return 0;
    return ((timeUs - viewport.startTimeUs) / visibleDurationUs) * 100;
  };

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

  // Check if dragging for track click handling
  const isAnyDragging = isDragging;

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
            <TrackLanes
              tracks={trackList}
              viewport={viewport}
              laneHeight={laneHeight}
              trackRef={trackRef}
              visibleDurationUs={visibleDurationUs}
              onClipChange={onClipChange}
            />
          )}

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
