/**
 * Video Editor V2 - Timeline Component
 * NLE-style timeline with tracks and clips.
 */

import type { CSSProperties } from 'react';
import { useCallback, useMemo, useRef } from 'react';
import type { Track } from '../core/Track';
import type { Clip } from '../core/Clip';
import type { TimelineViewport } from '../core/types';
import { formatTimecodeShort } from '../utils/time';

// ============================================================================
// TYPES
// ============================================================================

export interface TimelineProps {
  /** Tracks to display */
  tracks: readonly Track[];
  /** Current playhead position (microseconds) */
  currentTimeUs: number;
  /** Total duration (microseconds) */
  durationUs: number;
  /** Viewport state (from useTimeline) */
  viewport: TimelineViewport;
  /** Callback when seeking */
  onSeek?: (timeUs: number) => void;
  /** Callback when a clip is selected */
  onClipSelect?: (clipId: string, trackId: string) => void;
  /** Callback when a clip is moved */
  onClipMove?: (clipId: string, newStartUs: number) => void;
  /** Callback when a clip is trimmed from start */
  onClipTrimStart?: (clipId: string, newStartUs: number) => void;
  /** Callback when a clip is trimmed from end */
  onClipTrimEnd?: (clipId: string, newEndUs: number) => void;
  /** Currently selected clip ID */
  selectedClipId?: string;
  /** Height per track in pixels */
  trackHeight?: number;
  /** CSS class name */
  className?: string;
  /** CSS styles */
  style?: CSSProperties;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * NLE-style timeline component for video editing.
 *
 * @example
 * ```tsx
 * const { tracks, durationUs } = useComposition();
 * const { viewport, timeToPixel, pixelToTime } = useTimeline({ durationUs });
 * const { currentTimeUs, seek } = useEngine({ composition });
 *
 * return (
 *   <Timeline
 *     tracks={tracks}
 *     currentTimeUs={currentTimeUs}
 *     durationUs={durationUs}
 *     viewport={viewport}
 *     onSeek={seek}
 *     onClipSelect={(clipId) => setSelectedClip(clipId)}
 *   />
 * );
 * ```
 */
export function Timeline(props: TimelineProps) {
  const {
    tracks,
    currentTimeUs,
    durationUs,
    viewport,
    onSeek,
    onClipSelect,
    onClipMove,
    onClipTrimStart,
    onClipTrimEnd,
    selectedClipId,
    trackHeight = 60,
    className,
    style,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate pixels per microsecond
  const visibleDuration = viewport.endTimeUs - viewport.startTimeUs;

  // Time-to-pixel conversion
  const timeToPixel = useCallback((timeUs: number): number => {
    if (!containerRef.current || visibleDuration === 0) return 0;
    const width = containerRef.current.clientWidth;
    const relativeTime = timeUs - viewport.startTimeUs;
    return (relativeTime / visibleDuration) * width;
  }, [viewport.startTimeUs, visibleDuration]);

  // Pixel-to-time conversion
  const pixelToTime = useCallback((pixel: number): number => {
    if (!containerRef.current) return viewport.startTimeUs;
    const width = containerRef.current.clientWidth;
    const relativeTime = (pixel / width) * visibleDuration;
    return viewport.startTimeUs + relativeTime;
  }, [viewport.startTimeUs, visibleDuration]);

  // Handle timeline click for seeking
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!onSeek || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = pixelToTime(x);

    // Clamp to valid range
    const clampedTime = Math.max(0, Math.min(time, durationUs));
    onSeek(clampedTime);
  }, [onSeek, pixelToTime, durationUs]);

  // Generate time markers
  const timeMarkers = useMemo(() => {
    const markers: { timeUs: number; label: string }[] = [];
    const step = getTimeStep(visibleDuration);

    const start = Math.floor(viewport.startTimeUs / step) * step;
    for (let time = start; time <= viewport.endTimeUs; time += step) {
      if (time >= 0) {
        markers.push({
          timeUs: time,
          label: formatTimecodeShort(time),
        });
      }
    }

    return markers;
  }, [viewport.startTimeUs, viewport.endTimeUs, visibleDuration]);

  // Playhead position
  const playheadPosition = timeToPixel(currentTimeUs);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Time ruler */}
      <div
        style={{
          height: 24,
          backgroundColor: '#1a1a1a',
          borderBottom: '1px solid #333',
          position: 'relative',
        }}
        onClick={handleTimelineClick}
      >
        {timeMarkers.map((marker) => (
          <div
            key={marker.timeUs}
            style={{
              position: 'absolute',
              left: timeToPixel(marker.timeUs),
              top: 0,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              fontSize: 10,
              color: '#888',
              transform: 'translateX(-50%)',
            }}
          >
            <span>{marker.label}</span>
          </div>
        ))}
      </div>

      {/* Tracks */}
      <div style={{ position: 'relative' }}>
        {tracks.map((track) => (
          <TrackLane
            key={track.id}
            track={track}
            height={trackHeight}
            timeToPixel={timeToPixel}
            selectedClipId={selectedClipId}
            onClipSelect={onClipSelect}
            onClipMove={onClipMove}
            onClipTrimStart={onClipTrimStart}
            onClipTrimEnd={onClipTrimEnd}
          />
        ))}
      </div>

      {/* Playhead */}
      <div
        style={{
          position: 'absolute',
          left: playheadPosition,
          top: 0,
          bottom: 0,
          width: 1,
          backgroundColor: '#ff4444',
          pointerEvents: 'none',
          zIndex: 100,
        }}
      >
        {/* Playhead head */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: -5,
            width: 11,
            height: 11,
            backgroundColor: '#ff4444',
            clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// TRACK LANE
// ============================================================================

interface TrackLaneProps {
  track: Track;
  height: number;
  timeToPixel: (timeUs: number) => number;
  selectedClipId?: string;
  onClipSelect?: (clipId: string, trackId: string) => void;
  onClipMove?: (clipId: string, newStartUs: number) => void;
  onClipTrimStart?: (clipId: string, newStartUs: number) => void;
  onClipTrimEnd?: (clipId: string, newEndUs: number) => void;
}

function TrackLane(props: TrackLaneProps) {
  const {
    track,
    height,
    timeToPixel,
    selectedClipId,
    onClipSelect,
  } = props;

  return (
    <div
      style={{
        height,
        backgroundColor: track.type === 'video' ? '#1e293b' : '#1e3b2e',
        borderBottom: '1px solid #333',
        position: 'relative',
      }}
    >
      {/* Track label */}
      <div
        style={{
          position: 'absolute',
          left: 4,
          top: 4,
          fontSize: 10,
          color: '#888',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        {track.label}
      </div>

      {/* Clips */}
      {track.clips.map((clip) => (
        <ClipBlock
          key={clip.id}
          clip={clip}
          trackId={track.id}
          trackType={track.type}
          timeToPixel={timeToPixel}
          isSelected={clip.id === selectedClipId}
          onSelect={onClipSelect}
        />
      ))}
    </div>
  );
}

// ============================================================================
// CLIP BLOCK
// ============================================================================

interface ClipBlockProps {
  clip: Clip;
  trackId: string;
  trackType: 'video' | 'audio';
  timeToPixel: (timeUs: number) => number;
  isSelected: boolean;
  onSelect?: (clipId: string, trackId: string) => void;
}

function ClipBlock(props: ClipBlockProps) {
  const {
    clip,
    trackId,
    trackType,
    timeToPixel,
    isSelected,
    onSelect,
  } = props;

  const left = timeToPixel(clip.startUs);
  const width = timeToPixel(clip.startUs + clip.durationUs) - left;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(clip.id, trackId);
  }, [clip.id, trackId, onSelect]);

  // Clip colors based on type and selection
  const backgroundColor = isSelected
    ? (trackType === 'video' ? '#4f83cc' : '#4fcc83')
    : (trackType === 'video' ? '#3b5998' : '#3b9858');

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'absolute',
        left,
        top: 4,
        bottom: 4,
        width: Math.max(width, 1),
        backgroundColor,
        borderRadius: 4,
        border: isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 8,
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: '#fff',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {clip.label || 'Untitled'}
      </span>

      {/* Trim handles (visual only for now) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: 'ew-resize',
          backgroundColor: 'rgba(255,255,255,0.1)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: 'ew-resize',
          backgroundColor: 'rgba(255,255,255,0.1)',
        }}
      />
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calculate appropriate time step for markers based on visible duration
 */
function getTimeStep(visibleDurationUs: number): number {
  const targetMarkers = 10;
  const roughStep = visibleDurationUs / targetMarkers;

  // Standard intervals in microseconds
  const intervals = [
    100_000,      // 0.1s
    250_000,      // 0.25s
    500_000,      // 0.5s
    1_000_000,    // 1s
    2_000_000,    // 2s
    5_000_000,    // 5s
    10_000_000,   // 10s
    30_000_000,   // 30s
    60_000_000,   // 1min
    300_000_000,  // 5min
  ];

  // Find the smallest interval that's larger than the rough step
  for (const interval of intervals) {
    if (interval >= roughStep) {
      return interval;
    }
  }

  return intervals[intervals.length - 1] ?? 60_000_000;
}
