/**
 * Video Editor V2 - Timeline Component
 * NLE-style timeline with tracks and clips.
 */

import type { CSSProperties } from 'react';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { Track } from '../core/Track';
import type { Clip } from '../core/Clip';
import type { TimelineViewport } from '../core/types';
import { formatTimecodeShort } from '../utils/time';
import { TIMELINE } from '../constants';

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
  onClipMove?: (clipId: string, newStartUs: number) => boolean;
  /** Callback when a clip is moved to a different track */
  onClipMoveToTrack?: (clipId: string, targetTrackId: string, newStartUs: number) => boolean;
  /** Callback when a clip is trimmed from start */
  onClipTrimStart?: (clipId: string, newStartUs: number) => void;
  /** Callback when a clip is trimmed from end */
  onClipTrimEnd?: (clipId: string, newEndUs: number) => void;
  /** Callback when adding a track */
  onTrackAdd?: (type: 'video' | 'audio') => void;
  /** Callback when removing a track */
  onTrackRemove?: (trackId: string) => void;
  /** Currently selected clip ID */
  selectedClipId?: string;
  /** Height per track in pixels */
  trackHeight?: number;
  /** CSS class name */
  className?: string;
  /** CSS styles */
  style?: CSSProperties;
}

interface SnapTarget {
  timeUs: number;
  type: 'playhead' | 'clip-start' | 'clip-end' | 'timeline-start';
}

interface SnapResult {
  snappedTimeUs: number;
  snappedTo: SnapTarget | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Timeline(props: TimelineProps) {
  const {
    tracks,
    currentTimeUs,
    durationUs,
    viewport,
    onSeek,
    onClipSelect,
    onClipMove,
    onClipMoveToTrack,
    onClipTrimStart,
    onClipTrimEnd,
    onTrackAdd,
    onTrackRemove,
    selectedClipId,
    trackHeight = 60,
    className,
    style,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const [activeSnapLine, setActiveSnapLine] = useState<number | null>(null);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);

  // Calculate pixels per microsecond
  const visibleDuration = viewport.endTimeUs - viewport.startTimeUs;

  // Time-to-pixel conversion (relative to timeline content area)
  const timeToPixel = useCallback((timeUs: number): number => {
    if (!timelineContentRef.current || visibleDuration === 0) return 0;
    const width = timelineContentRef.current.clientWidth;
    const relativeTime = timeUs - viewport.startTimeUs;
    return (relativeTime / visibleDuration) * width;
  }, [viewport.startTimeUs, visibleDuration]);

  // Pixel-to-time conversion
  const pixelToTime = useCallback((pixel: number): number => {
    if (!timelineContentRef.current) return viewport.startTimeUs;
    const width = timelineContentRef.current.clientWidth;
    const relativeTime = (pixel / width) * visibleDuration;
    return viewport.startTimeUs + relativeTime;
  }, [viewport.startTimeUs, visibleDuration]);

  // Calculate snap targets
  const snapTargets = useMemo((): SnapTarget[] => {
    const targets: SnapTarget[] = [
      { timeUs: 0, type: 'timeline-start' },
      { timeUs: currentTimeUs, type: 'playhead' },
    ];

    for (const track of tracks) {
      for (const clip of track.clips) {
        targets.push({ timeUs: clip.startUs, type: 'clip-start' });
        targets.push({ timeUs: clip.endUs, type: 'clip-end' });
      }
    }

    return targets;
  }, [tracks, currentTimeUs]);

  // Apply snapping to a proposed position
  const applySnap = useCallback((
    proposedStartUs: number,
    clipDurationUs: number,
    excludeClipId?: string
  ): SnapResult => {
    const snapThresholdUs = pixelToTime(TIMELINE.SNAP_THRESHOLD_PX) - pixelToTime(0);
    const clipEndUs = proposedStartUs + clipDurationUs;
    let bestSnap: SnapTarget | null = null;
    let bestDelta = Infinity;
    let snappedStartUs = proposedStartUs;

    // Filter out snap targets from the clip being moved
    const filteredTargets = snapTargets.filter(target => {
      if (!excludeClipId) return true;
      // Don't snap to the clip's own edges
      return true; // We'd need clip info to filter properly, skip for now
    });

    for (const target of filteredTargets) {
      // Snap clip start to target
      const deltaStart = Math.abs(proposedStartUs - target.timeUs);
      if (deltaStart < snapThresholdUs && deltaStart < bestDelta) {
        bestDelta = deltaStart;
        bestSnap = target;
        snappedStartUs = target.timeUs;
      }

      // Snap clip end to target
      const deltaEnd = Math.abs(clipEndUs - target.timeUs);
      if (deltaEnd < snapThresholdUs && deltaEnd < bestDelta) {
        bestDelta = deltaEnd;
        bestSnap = target;
        snappedStartUs = target.timeUs - clipDurationUs;
      }
    }

    return { snappedTimeUs: Math.max(0, snappedStartUs), snappedTo: bestSnap };
  }, [snapTargets, pixelToTime]);

  // Handle timeline click for seeking
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!onSeek || !timelineContentRef.current) return;

    const rect = timelineContentRef.current.getBoundingClientRect();
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
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {/* Top row: empty header corner + time ruler */}
      <div style={{ display: 'flex' }}>
        {/* Header corner (empty space above track headers) */}
        <div
          style={{
            width: TIMELINE.TRACK_HEADER_WIDTH,
            height: 24,
            backgroundColor: '#151515',
            borderBottom: '1px solid #333',
            borderRight: '1px solid #333',
            flexShrink: 0,
          }}
        />

        {/* Time ruler */}
        <div
          ref={timelineContentRef}
          style={{
            flex: 1,
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
      </div>

      {/* Tracks area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Track headers column */}
        <div
          style={{
            width: TIMELINE.TRACK_HEADER_WIDTH,
            backgroundColor: '#151515',
            borderRight: '1px solid #333',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {tracks.map((track) => (
            <TrackHeader
              key={track.id}
              track={track}
              height={trackHeight}
              isDropTarget={dropTargetTrackId === track.id}
              onRemove={onTrackRemove}
            />
          ))}

          {/* Add track buttons */}
          {onTrackAdd && (
            <div
              style={{
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <button
                onClick={() => onTrackAdd('video')}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  backgroundColor: '#2a4a7a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                + Video Track
              </button>
              <button
                onClick={() => onTrackAdd('audio')}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  backgroundColor: '#2a7a4a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                + Audio Track
              </button>
            </div>
          )}
        </div>

        {/* Timeline content (tracks with clips) */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
          }}
          onClick={handleTimelineClick}
        >
          {tracks.map((track, trackIndex) => (
            <TrackLane
              key={track.id}
              track={track}
              trackIndex={trackIndex}
              height={trackHeight}
              timeToPixel={timeToPixel}
              pixelToTime={pixelToTime}
              selectedClipId={selectedClipId}
              isDropTarget={dropTargetTrackId === track.id}
              onClipSelect={onClipSelect}
              onClipMove={onClipMove}
              onClipMoveToTrack={onClipMoveToTrack}
              onClipTrimStart={onClipTrimStart}
              onClipTrimEnd={onClipTrimEnd}
              onSeek={onSeek}
              applySnap={applySnap}
              setActiveSnapLine={setActiveSnapLine}
              setDropTargetTrackId={setDropTargetTrackId}
              allTracks={tracks}
            />
          ))}

          {/* Snap indicator line */}
          {activeSnapLine !== null && (
            <div
              style={{
                position: 'absolute',
                left: timeToPixel(activeSnapLine),
                top: 0,
                bottom: 0,
                width: 2,
                backgroundColor: '#ffcc00',
                pointerEvents: 'none',
                zIndex: 90,
              }}
            />
          )}

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
      </div>
    </div>
  );
}

// ============================================================================
// TRACK HEADER
// ============================================================================

interface TrackHeaderProps {
  track: Track;
  height: number;
  isDropTarget: boolean;
  onRemove?: (trackId: string) => void;
}

function TrackHeader({ track, height, isDropTarget, onRemove }: TrackHeaderProps) {
  return (
    <div
      style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
        borderBottom: '1px solid #333',
        backgroundColor: isDropTarget ? '#3a5a3a' : 'transparent',
        transition: 'background-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Track type icon */}
        <span
          style={{
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            backgroundColor: track.type === 'video' ? '#3b5998' : '#3b9858',
            borderRadius: 3,
          }}
        >
          {track.type === 'video' ? 'V' : 'A'}
        </span>
        {/* Track label */}
        <span style={{ fontSize: 11, color: '#ccc' }}>{track.label}</span>
      </div>

      {/* Remove button */}
      {onRemove && (
        <button
          onClick={() => onRemove(track.id)}
          style={{
            width: 18,
            height: 18,
            padding: 0,
            backgroundColor: 'transparent',
            color: '#666',
            border: 'none',
            borderRadius: 3,
            cursor: 'pointer',
            fontSize: 12,
            lineHeight: 1,
          }}
          title="Remove track"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ============================================================================
// TRACK LANE
// ============================================================================

interface TrackLaneProps {
  track: Track;
  trackIndex: number;
  height: number;
  timeToPixel: (timeUs: number) => number;
  pixelToTime: (pixel: number) => number;
  selectedClipId?: string;
  isDropTarget: boolean;
  onClipSelect?: (clipId: string, trackId: string) => void;
  onClipMove?: (clipId: string, newStartUs: number) => boolean;
  onClipMoveToTrack?: (clipId: string, targetTrackId: string, newStartUs: number) => boolean;
  onClipTrimStart?: (clipId: string, newStartUs: number) => void;
  onClipTrimEnd?: (clipId: string, newEndUs: number) => void;
  onSeek?: (timeUs: number) => void;
  applySnap: (proposedStartUs: number, clipDurationUs: number, excludeClipId?: string) => SnapResult;
  setActiveSnapLine: (timeUs: number | null) => void;
  setDropTargetTrackId: (trackId: string | null) => void;
  allTracks: readonly Track[];
}

function TrackLane(props: TrackLaneProps) {
  const {
    track,
    height,
    timeToPixel,
    pixelToTime,
    selectedClipId,
    isDropTarget,
    onClipSelect,
    onClipMove,
    onClipMoveToTrack,
    onClipTrimStart,
    onClipTrimEnd,
    onSeek,
    applySnap,
    setActiveSnapLine,
    setDropTargetTrackId,
    allTracks,
  } = props;

  return (
    <div
      data-track-id={track.id}
      data-track-type={track.type}
      style={{
        height,
        backgroundColor: isDropTarget
          ? (track.type === 'video' ? '#2a4a6a' : '#2a6a4a')
          : (track.type === 'video' ? '#1e293b' : '#1e3b2e'),
        borderBottom: '1px solid #333',
        position: 'relative',
        transition: 'background-color 0.15s',
      }}
    >
      {/* Clips */}
      {track.clips.map((clip) => (
        <ClipBlock
          key={clip.id}
          clip={clip}
          trackId={track.id}
          trackType={track.type}
          timeToPixel={timeToPixel}
          pixelToTime={pixelToTime}
          isSelected={clip.id === selectedClipId}
          onSelect={onClipSelect}
          onMove={onClipMove}
          onMoveToTrack={onClipMoveToTrack}
          onTrimStart={onClipTrimStart}
          onTrimEnd={onClipTrimEnd}
          onSeek={onSeek}
          applySnap={applySnap}
          setActiveSnapLine={setActiveSnapLine}
          setDropTargetTrackId={setDropTargetTrackId}
          allTracks={allTracks}
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
  pixelToTime: (pixel: number) => number;
  isSelected: boolean;
  onSelect?: (clipId: string, trackId: string) => void;
  onMove?: (clipId: string, newStartUs: number) => boolean;
  onMoveToTrack?: (clipId: string, targetTrackId: string, newStartUs: number) => boolean;
  onTrimStart?: (clipId: string, newStartUs: number) => void;
  onTrimEnd?: (clipId: string, newEndUs: number) => void;
  onSeek?: (timeUs: number) => void;
  applySnap: (proposedStartUs: number, clipDurationUs: number, excludeClipId?: string) => SnapResult;
  setActiveSnapLine: (timeUs: number | null) => void;
  setDropTargetTrackId: (trackId: string | null) => void;
  allTracks: readonly Track[];
}

function ClipBlock(props: ClipBlockProps) {
  const {
    clip,
    trackId,
    trackType,
    timeToPixel,
    pixelToTime,
    isSelected,
    onSelect,
    onMove,
    onMoveToTrack,
    onTrimStart,
    onTrimEnd,
    onSeek,
    applySnap,
    setActiveSnapLine,
    setDropTargetTrackId,
    allTracks,
  } = props;

  // Drag state for trim handles and move
  const [dragState, setDragState] = useState<{
    type: 'trim-start' | 'trim-end' | 'move';
    initialTimeUs: number;
    initialMouseX: number;
    initialMouseY: number;
    previewStartUs?: number;
    isColliding?: boolean;
    targetTrackId?: string;
  } | null>(null);

  const left = timeToPixel(clip.startUs);
  const width = timeToPixel(clip.startUs + clip.durationUs) - left;

  // Use preview position during drag
  const displayLeft = dragState?.type === 'move' && dragState.previewStartUs !== undefined
    ? timeToPixel(dragState.previewStartUs)
    : left;

  // Handle click on clip: first click selects, click on selected seeks
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();

    if (isSelected && onSeek) {
      // Already selected - seek to click position within the clip
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clipProgress = clickX / rect.width;
      const seekTimeUs = clip.startUs + Math.round(clip.durationUs * clipProgress);
      onSeek(seekTimeUs);
    } else {
      // Not selected - just select
      onSelect?.(clip.id, trackId);
    }
  }, [isSelected, clip, trackId, onSelect, onSeek]);

  // Left trim handle mouse down
  const handleTrimStartMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    setDragState({
      type: 'trim-start',
      initialTimeUs: clip.startUs,
      initialMouseX: e.clientX,
      initialMouseY: e.clientY,
    });
  }, [clip.startUs]);

  // Right trim handle mouse down
  const handleTrimEndMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    setDragState({
      type: 'trim-end',
      initialTimeUs: clip.startUs + clip.durationUs,
      initialMouseX: e.clientX,
      initialMouseY: e.clientY,
    });
  }, [clip.startUs, clip.durationUs]);

  // Body drag (move) mouse down
  const handleBodyMouseDown = useCallback((e: React.MouseEvent) => {
    // Only trigger on left mouse button
    if (e.button !== 0) return;

    // Check if clicking on trim handles (first/last 6px)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 6 || x > rect.width - 6) return;

    e.stopPropagation();
    e.preventDefault();

    // Select if not already selected
    if (!isSelected) {
      onSelect?.(clip.id, trackId);
    }

    setDragState({
      type: 'move',
      initialTimeUs: clip.startUs,
      initialMouseX: e.clientX,
      initialMouseY: e.clientY,
      previewStartUs: clip.startUs,
      isColliding: false,
      targetTrackId: trackId,
    });
  }, [clip.startUs, clip.id, trackId, isSelected, onSelect]);

  // Global mouse move/up handlers during drag
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate delta in pixels and convert to time delta
      const deltaX = e.clientX - dragState.initialMouseX;
      const deltaTimeUs = pixelToTime(deltaX) - pixelToTime(0);

      if (dragState.type === 'trim-start') {
        const newStartUs = Math.max(0, dragState.initialTimeUs + deltaTimeUs);
        onTrimStart?.(clip.id, newStartUs);
      } else if (dragState.type === 'trim-end') {
        const newEndUs = dragState.initialTimeUs + deltaTimeUs;
        onTrimEnd?.(clip.id, newEndUs);
      } else if (dragState.type === 'move') {
        // Calculate new start position
        let newStartUs = Math.max(0, dragState.initialTimeUs + deltaTimeUs);

        // Apply snapping
        const snapResult = applySnap(newStartUs, clip.durationUs, clip.id);
        newStartUs = snapResult.snappedTimeUs;

        // Show snap line if snapped
        if (snapResult.snappedTo) {
          setActiveSnapLine(snapResult.snappedTo.timeUs);
        } else {
          setActiveSnapLine(null);
        }

        // Detect target track from vertical position
        const trackElements = document.querySelectorAll('[data-track-id]');
        let targetTrackId = trackId;
        let targetTrackType: 'video' | 'audio' | null = null;

        for (const el of trackElements) {
          const rect = el.getBoundingClientRect();
          if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
            targetTrackId = el.getAttribute('data-track-id') || trackId;
            targetTrackType = el.getAttribute('data-track-type') as 'video' | 'audio';
            break;
          }
        }

        // Only allow drop on compatible track type
        const isCompatibleTrack = targetTrackType === trackType;

        // Update drop target highlight
        if (targetTrackId !== trackId && isCompatibleTrack) {
          setDropTargetTrackId(targetTrackId);
        } else {
          setDropTargetTrackId(null);
        }

        // Update preview state
        setDragState(prev => prev ? {
          ...prev,
          previewStartUs: newStartUs,
          targetTrackId: isCompatibleTrack ? targetTrackId : trackId,
        } : null);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (dragState.type === 'move') {
        setActiveSnapLine(null);
        setDropTargetTrackId(null);

        if (dragState.previewStartUs !== undefined) {
          const targetTrack = dragState.targetTrackId || trackId;

          if (targetTrack !== trackId && onMoveToTrack) {
            // Moving to different track
            onMoveToTrack(clip.id, targetTrack, dragState.previewStartUs);
          } else if (onMove) {
            // Moving within same track
            onMove(clip.id, dragState.previewStartUs);
          }
        }
      }

      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    dragState,
    clip.id,
    clip.durationUs,
    trackId,
    trackType,
    pixelToTime,
    onTrimStart,
    onTrimEnd,
    onMove,
    onMoveToTrack,
    applySnap,
    setActiveSnapLine,
    setDropTargetTrackId,
    allTracks,
  ]);

  // Clip colors based on type, selection, and drag state
  const isMoving = dragState?.type === 'move';
  const backgroundColor = isMoving
    ? (dragState.isColliding ? '#cc4444' : '#5593dd')
    : isSelected
      ? (trackType === 'video' ? '#4f83cc' : '#4fcc83')
      : (trackType === 'video' ? '#3b5998' : '#3b9858');

  return (
    <div
      onClick={handleClick}
      onMouseDown={handleBodyMouseDown}
      style={{
        position: 'absolute',
        left: displayLeft,
        top: 4,
        bottom: 4,
        width: Math.max(width, 1),
        backgroundColor,
        borderRadius: 4,
        border: isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
        cursor: isMoving ? 'grabbing' : 'grab',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 8,
        boxSizing: 'border-box',
        opacity: isMoving ? 0.9 : 1,
        transition: isMoving ? 'none' : 'background-color 0.15s',
        zIndex: isMoving ? 50 : 'auto',
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: '#fff',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          pointerEvents: 'none',
        }}
      >
        {clip.label || 'Untitled'}
      </span>

      {/* Left trim handle */}
      <div
        onMouseDown={handleTrimStartMouseDown}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: 'ew-resize',
          backgroundColor: dragState?.type === 'trim-start' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
        }}
      />
      {/* Right trim handle */}
      <div
        onMouseDown={handleTrimEndMouseDown}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: 'ew-resize',
          backgroundColor: dragState?.type === 'trim-end' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
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
