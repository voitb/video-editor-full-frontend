/**
 * Video Editor V2 - Timeline Component
 * Professional NLE-style timeline with tracks, clips, minimap, and zoom controls.
 */

import type { CSSProperties } from 'react';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { Track } from '../core/Track';
import type { Clip } from '../core/Clip';
import type { TimelineViewport, TrackUIState } from '../core/types';
import { formatTimecodeShort } from '../utils/time';
import { TIMELINE, TIMELINE_COLORS } from '../constants';

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
  /** CSS class name */
  className?: string;
  /** CSS styles */
  style?: CSSProperties;
  /** Callback when zooming at position (positionRatio: 0-1, direction: 'in' | 'out') */
  onZoomAtPosition?: (positionRatio: number, direction: 'in' | 'out') => void;
  /** Callback to set zoom level directly (for slider) */
  onZoomChange?: (zoomLevel: number) => void;
  /** Callback when viewport scrolls (for scroll sync) */
  onViewportScroll?: (scrollLeft: number, containerWidth: number, totalWidth: number) => void;
  /** Get scroll position from viewport state */
  getScrollLeft?: (containerWidth: number, totalWidth: number) => number;
  /** Track UI states (mute/solo/lock/height) */
  trackStates?: Record<string, TrackUIState>;
  /** Callback when track is muted */
  onTrackMute?: (trackId: string, muted: boolean) => void;
  /** Callback when track is soloed */
  onTrackSolo?: (trackId: string, solo: boolean) => void;
  /** Callback when track is locked */
  onTrackLock?: (trackId: string, locked: boolean) => void;
  /** Callback when track height changes */
  onTrackResize?: (trackId: string, height: number) => void;
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
    className,
    style,
    onZoomAtPosition,
    onZoomChange,
    onViewportScroll,
    getScrollLeft,
    trackStates,
    onTrackMute,
    onTrackSolo,
    onTrackLock,
    onTrackResize,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timeRulerScrollRef = useRef<HTMLDivElement>(null);
  const [activeSnapLine, setActiveSnapLine] = useState<number | null>(null);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Track container width for responsive timeline
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      // Subtract track header width to get timeline content area width
      const width = container.clientWidth - TIMELINE.TRACK_HEADER_WIDTH;
      setContainerWidth(Math.max(width, 100));
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Calculate effective durations with minimums to handle edge cases
  const effectiveDuration = Math.max(durationUs, TIMELINE.MIN_VISIBLE_DURATION_US);
  const visibleDuration = viewport.endTimeUs - viewport.startTimeUs;
  const effectiveVisibleDuration = Math.max(visibleDuration, TIMELINE.MIN_VISIBLE_DURATION_US);

  // Calculate pixels per second based on container width and visible duration
  // This ensures the visible portion of the timeline fills the container
  const pixelsPerSecond = useMemo(() => {
    if (containerWidth <= 0) return 100; // Default before container is measured
    // Pixels per second = container width / visible duration in seconds
    return containerWidth / (effectiveVisibleDuration / 1_000_000);
  }, [containerWidth, effectiveVisibleDuration]);

  // Calculate total timeline width based on total duration
  // When zoomed in, this will be larger than container (enables scrolling)
  // When zoomed out to fit, this equals container width
  const totalTimelineWidth = useMemo(() => {
    const contentWidth = (effectiveDuration / 1_000_000) * pixelsPerSecond;
    // Ensure minimum width is at least the container width
    return Math.max(contentWidth, containerWidth, 100);
  }, [effectiveDuration, pixelsPerSecond, containerWidth]);

  // Time-to-pixel conversion (absolute positioning)
  const timeToPixel = useCallback((timeUs: number): number => {
    return (timeUs / 1_000_000) * pixelsPerSecond;
  }, [pixelsPerSecond]);

  // Pixel-to-time conversion (accounts for scroll position when needed)
  const pixelToTime = useCallback((pixel: number): number => {
    return (pixel / pixelsPerSecond) * 1_000_000;
  }, [pixelsPerSecond]);

  // Handle scroll synchronization between time ruler and track content
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;

    // Sync time ruler scroll
    if (timeRulerScrollRef.current) {
      timeRulerScrollRef.current.scrollLeft = scrollLeft;
    }

    // Notify parent of viewport scroll for viewport sync
    if (onViewportScroll) {
      onViewportScroll(scrollLeft, containerWidth, totalTimelineWidth);
    }
  }, [onViewportScroll, containerWidth, totalTimelineWidth]);

  // Sync scroll position when viewport changes externally (e.g., from zoom)
  useEffect(() => {
    if (!scrollContainerRef.current || !getScrollLeft) return;

    const targetScroll = getScrollLeft(containerWidth, totalTimelineWidth);
    const currentScroll = scrollContainerRef.current.scrollLeft;

    // Only update if difference is significant (avoid loops)
    if (Math.abs(targetScroll - currentScroll) > 1) {
      scrollContainerRef.current.scrollLeft = targetScroll;
    }
  }, [viewport.startTimeUs, viewport.zoomLevel, containerWidth, totalTimelineWidth, getScrollLeft]);

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

  // Get track height from state or default
  const getTrackHeight = useCallback((trackId: string): number => {
    return trackStates?.[trackId]?.height ?? TIMELINE.DEFAULT_TRACK_HEIGHT;
  }, [trackStates]);

  // Handle wheel events for zooming (Ctrl/Cmd + scroll)
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // Only handle Ctrl/Cmd + scroll for zoom
    if (!e.ctrlKey && !e.metaKey) return;

    e.preventDefault();

    if (!onZoomAtPosition || !timelineContentRef.current) return;

    // Get mouse position relative to timeline content area
    const rect = timelineContentRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Calculate position ratio (0-1) within the timeline content
    const positionRatio = Math.max(0, Math.min(1, mouseX / rect.width));

    // Determine zoom direction
    const direction = e.deltaY < 0 ? 'in' : 'out';

    onZoomAtPosition(positionRatio, direction);
  }, [onZoomAtPosition]);

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

  // Generate time markers based on viewport visible duration (adapts to zoom)
  const timeMarkers = useMemo(() => {
    const markers: { timeUs: number; label: string }[] = [];
    const step = getTimeStep(effectiveVisibleDuration);

    // Start from the beginning of the viewport (aligned to step)
    const start = Math.floor(viewport.startTimeUs / step) * step;

    // Generate markers across the visible range plus buffer for smooth scrolling
    for (let time = start; time <= viewport.endTimeUs + step; time += step) {
      if (time >= 0) {
        markers.push({
          timeUs: time,
          label: formatTimecodeShort(time),
        });
      }
    }

    return markers;
  }, [effectiveVisibleDuration, viewport.startTimeUs, viewport.endTimeUs]);

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
      {/* Top row: header corner with zoom slider + time ruler (synced with horizontal scroll) */}
      <div style={{ display: 'flex', flexShrink: 0, height: TIMELINE.TIME_RULER_HEIGHT }}>
        {/* Header corner with zoom slider */}
        <div
          style={{
            width: TIMELINE.TRACK_HEADER_WIDTH,
            height: TIMELINE.TIME_RULER_HEIGHT,
            backgroundColor: TIMELINE_COLORS.trackHeaderBg,
            borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
            borderRight: `1px solid ${TIMELINE_COLORS.border}`,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 8px',
          }}
        >
          {/* Zoom Slider */}
          {onZoomChange && (
            <TimelineZoomSlider
              zoomLevel={viewport.zoomLevel}
              minZoom={1}
              maxZoom={TIMELINE.MAX_ZOOM_LEVEL}
              onChange={onZoomChange}
            />
          )}
        </div>

        {/* Time ruler container - syncs scroll with track content */}
        <div
          ref={timeRulerScrollRef}
          style={{
            flex: 1,
            height: TIMELINE.TIME_RULER_HEIGHT,
            backgroundColor: TIMELINE_COLORS.rulerBg,
            borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
            overflow: 'hidden',
          }}
        >
          {/* Time ruler inner - has full timeline width */}
          <div
            style={{
              width: totalTimelineWidth,
              height: '100%',
              position: 'relative',
            }}
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
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingBottom: 4,
                }}
              >
                {/* Tick mark */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    width: 1,
                    height: 8,
                    backgroundColor: TIMELINE_COLORS.textMuted,
                  }}
                />
                {/* Label */}
                <span
                  style={{
                    fontSize: 10,
                    color: TIMELINE_COLORS.textMuted,
                    transform: 'translateX(-50%)',
                  }}
                >
                  {marker.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable tracks area - handles both horizontal and vertical scroll */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflow: 'auto',
        }}
        onScroll={handleScroll}
      >
        {/* Content row - contains sticky headers + track lanes */}
        <div
          style={{
            display: 'flex',
            width: totalTimelineWidth + TIMELINE.TRACK_HEADER_WIDTH,
            minHeight: '100%',
          }}
        >
          {/* Sticky track headers column */}
          <div
            style={{
              width: TIMELINE.TRACK_HEADER_WIDTH,
              backgroundColor: TIMELINE_COLORS.trackHeaderBg,
              borderRight: `1px solid ${TIMELINE_COLORS.border}`,
              flexShrink: 0,
              position: 'sticky',
              left: 0,
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {tracks.map((track) => (
              <TrackHeader
                key={track.id}
                track={track}
                height={getTrackHeight(track.id)}
                isDropTarget={dropTargetTrackId === track.id}
                trackState={trackStates?.[track.id]}
                onRemove={onTrackRemove}
                onMute={onTrackMute}
                onSolo={onTrackSolo}
                onLock={onTrackLock}
                onResize={onTrackResize}
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
            ref={timelineContentRef}
            style={{
              width: totalTimelineWidth,
              position: 'relative',
            }}
            onClick={handleTimelineClick}
            onWheel={handleWheel}
          >
            {/* Grid lines - vertical lines at time intervals (DaVinci Resolve style) */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            >
              {timeMarkers.map((marker) => (
                <div
                  key={`grid-${marker.timeUs}`}
                  style={{
                    position: 'absolute',
                    left: timeToPixel(marker.timeUs),
                    top: 0,
                    bottom: 0,
                    width: 1,
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  }}
                />
              ))}
            </div>

            {tracks.map((track, trackIndex) => (
              <TrackLane
                key={track.id}
                track={track}
                trackIndex={trackIndex}
                height={getTrackHeight(track.id)}
                timeToPixel={timeToPixel}
                pixelToTime={pixelToTime}
                selectedClipId={selectedClipId}
                isDropTarget={dropTargetTrackId === track.id}
                isLocked={trackStates?.[track.id]?.locked ?? false}
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
                  backgroundColor: TIMELINE_COLORS.snapLine,
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
                width: 2,
                backgroundColor: TIMELINE_COLORS.playhead,
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
                  width: 12,
                  height: 12,
                  backgroundColor: TIMELINE_COLORS.playhead,
                  clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Minimap */}
      <TimelineMinimap
        tracks={tracks}
        durationUs={durationUs}
        currentTimeUs={currentTimeUs}
        viewport={viewport}
        containerWidth={containerWidth}
        totalTimelineWidth={totalTimelineWidth}
        onViewportChange={onViewportScroll ? (startTimeUs) => {
          // Calculate scroll position from start time
          const effectiveDuration = Math.max(durationUs, TIMELINE.MIN_VISIBLE_DURATION_US);
          const visibleDuration = effectiveDuration / viewport.zoomLevel;
          const maxStartTime = effectiveDuration - visibleDuration;
          if (maxStartTime > 0) {
            const scrollRatio = startTimeUs / maxStartTime;
            const scrollLeft = scrollRatio * (totalTimelineWidth - containerWidth);
            onViewportScroll(scrollLeft, containerWidth, totalTimelineWidth);
            // Also update the scroll container
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollLeft = scrollLeft;
            }
          }
        } : undefined}
        onSeek={onSeek}
        trackStates={trackStates}
        getTrackHeight={getTrackHeight}
      />

      {/* Custom Horizontal Scrollbar */}
      <TimelineScrollbar
        containerWidth={containerWidth}
        totalWidth={totalTimelineWidth}
        scrollLeft={scrollContainerRef.current?.scrollLeft ?? 0}
        onScroll={(scrollLeft) => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = scrollLeft;
          }
        }}
      />
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
  trackState?: TrackUIState;
  onRemove?: (trackId: string) => void;
  onMute?: (trackId: string, muted: boolean) => void;
  onSolo?: (trackId: string, solo: boolean) => void;
  onLock?: (trackId: string, locked: boolean) => void;
  onResize?: (trackId: string, height: number) => void;
}

function TrackHeader({
  track,
  height,
  isDropTarget,
  trackState,
  onRemove,
  onMute,
  onSolo,
  onLock,
  onResize,
}: TrackHeaderProps) {
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(height);

  const isMuted = trackState?.muted ?? false;
  const isSolo = trackState?.solo ?? false;
  const isLocked = trackState?.locked ?? false;

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizeStartY.current;
      const newHeight = Math.max(
        TIMELINE.MIN_TRACK_HEIGHT,
        Math.min(TIMELINE.MAX_TRACK_HEIGHT, resizeStartHeight.current + deltaY)
      );
      onResize?.(track.id, newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, track.id, onResize]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = height;
  };

  return (
    <div
      style={{
        height,
        display: 'flex',
        flexDirection: 'column',
        borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
        backgroundColor: isDropTarget
          ? (track.type === 'video' ? TIMELINE_COLORS.trackVideoDropBg : TIMELINE_COLORS.trackAudioDropBg)
          : 'transparent',
        transition: 'background-color 0.15s',
        position: 'relative',
      }}
    >
      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 6px',
          minHeight: 0,
        }}
      >
        {/* Left: Track type icon + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span
            style={{
              width: 18,
              height: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 600,
              backgroundColor: track.type === 'video' ? TIMELINE_COLORS.clipVideo : TIMELINE_COLORS.clipAudio,
              borderRadius: 3,
              flexShrink: 0,
            }}
          >
            {track.type === 'video' ? 'V' : 'A'}
          </span>
          <span
            style={{
              fontSize: 11,
              color: TIMELINE_COLORS.textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {track.label}
          </span>
        </div>

        {/* Right: M/S/L buttons + remove */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Mute button */}
          {onMute && (
            <button
              onClick={() => onMute(track.id, !isMuted)}
              style={{
                width: 20,
                height: 20,
                padding: 0,
                backgroundColor: isMuted ? TIMELINE_COLORS.playhead : 'transparent',
                color: isMuted ? '#fff' : TIMELINE_COLORS.textMuted,
                border: `1px solid ${isMuted ? TIMELINE_COLORS.playhead : TIMELINE_COLORS.border}`,
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600,
                lineHeight: 1,
                transition: 'all 0.15s',
              }}
              title={isMuted ? 'Unmute track' : 'Mute track'}
            >
              M
            </button>
          )}
          {/* Solo button */}
          {onSolo && (
            <button
              onClick={() => onSolo(track.id, !isSolo)}
              style={{
                width: 20,
                height: 20,
                padding: 0,
                backgroundColor: isSolo ? TIMELINE_COLORS.snapLine : 'transparent',
                color: isSolo ? '#000' : TIMELINE_COLORS.textMuted,
                border: `1px solid ${isSolo ? TIMELINE_COLORS.snapLine : TIMELINE_COLORS.border}`,
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600,
                lineHeight: 1,
                transition: 'all 0.15s',
              }}
              title={isSolo ? 'Unsolo track' : 'Solo track'}
            >
              S
            </button>
          )}
          {/* Lock button */}
          {onLock && (
            <button
              onClick={() => onLock(track.id, !isLocked)}
              style={{
                width: 20,
                height: 20,
                padding: 0,
                backgroundColor: isLocked ? TIMELINE_COLORS.textMuted : 'transparent',
                color: isLocked ? '#000' : TIMELINE_COLORS.textMuted,
                border: `1px solid ${isLocked ? TIMELINE_COLORS.textMuted : TIMELINE_COLORS.border}`,
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600,
                lineHeight: 1,
                transition: 'all 0.15s',
              }}
              title={isLocked ? 'Unlock track' : 'Lock track'}
            >
              L
            </button>
          )}
          {/* Remove button */}
          {onRemove && (
            <button
              onClick={() => onRemove(track.id)}
              style={{
                width: 20,
                height: 20,
                padding: 0,
                backgroundColor: 'transparent',
                color: TIMELINE_COLORS.textMuted,
                border: 'none',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
              }}
              title="Remove track"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Resize handle */}
      {onResize && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            cursor: 'ns-resize',
            backgroundColor: isResizing ? TIMELINE_COLORS.borderLight : 'transparent',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!isResizing) {
              e.currentTarget.style.backgroundColor = TIMELINE_COLORS.borderLight;
            }
          }}
          onMouseLeave={(e) => {
            if (!isResizing) {
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }}
        />
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
  isLocked: boolean;
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
    isLocked,
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
          ? (track.type === 'video' ? TIMELINE_COLORS.trackVideoDropBg : TIMELINE_COLORS.trackAudioDropBg)
          : (track.type === 'video' ? TIMELINE_COLORS.trackVideoBg : TIMELINE_COLORS.trackAudioBg),
        borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
        position: 'relative',
        transition: 'background-color 0.15s',
        opacity: isLocked ? 0.6 : 1,
        pointerEvents: isLocked ? 'none' : 'auto',
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

// ============================================================================
// ZOOM SLIDER
// ============================================================================

interface TimelineZoomSliderProps {
  zoomLevel: number;
  minZoom: number;
  maxZoom: number;
  onChange: (level: number) => void;
}

function TimelineZoomSlider({ zoomLevel, minZoom, maxZoom, onChange }: TimelineZoomSliderProps) {
  // Use logarithmic scale for more natural feel
  const logMin = Math.log(minZoom);
  const logMax = Math.log(maxZoom);
  const logValue = Math.log(zoomLevel);
  const sliderValue = ((logValue - logMin) / (logMax - logMin)) * 100;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    const logZoom = logMin + (value / 100) * (logMax - logMin);
    onChange(Math.exp(logZoom));
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
      }}
    >
      <span style={{ fontSize: 9, color: TIMELINE_COLORS.textMuted }}>−</span>
      <input
        type="range"
        min={0}
        max={100}
        value={sliderValue}
        onChange={handleChange}
        style={{
          flex: 1,
          height: 4,
          WebkitAppearance: 'none',
          appearance: 'none',
          background: `linear-gradient(to right, ${TIMELINE_COLORS.clipVideo} 0%, ${TIMELINE_COLORS.clipVideo} ${sliderValue}%, ${TIMELINE_COLORS.border} ${sliderValue}%, ${TIMELINE_COLORS.border} 100%)`,
          borderRadius: 2,
          outline: 'none',
          cursor: 'pointer',
        }}
      />
      <span style={{ fontSize: 9, color: TIMELINE_COLORS.textMuted }}>+</span>
    </div>
  );
}

// ============================================================================
// MINIMAP
// ============================================================================

interface TimelineMinimapProps {
  tracks: readonly Track[];
  durationUs: number;
  currentTimeUs: number;
  viewport: TimelineViewport;
  containerWidth: number;
  totalTimelineWidth: number;
  onViewportChange?: (startTimeUs: number) => void;
  onSeek?: (timeUs: number) => void;
  trackStates?: Record<string, TrackUIState>;
  getTrackHeight: (trackId: string) => number;
}

function TimelineMinimap({
  tracks,
  durationUs,
  currentTimeUs,
  viewport,
  containerWidth,
  totalTimelineWidth,
  onViewportChange,
  onSeek,
  trackStates,
  getTrackHeight,
}: TimelineMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
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
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const dpr = window.devicePixelRatio || 1;

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
      ctx.fillStyle = track.type === 'video'
        ? 'rgba(59, 89, 152, 0.2)'
        : 'rgba(59, 152, 88, 0.2)';
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

    ctx.strokeStyle = TIMELINE_COLORS.viewportBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(viewportX + 0.5, 0.5, viewportWidth - 1, height - 1);

    // Draw playhead
    const playheadX = (currentTimeUs / effectiveDuration) * width;
    ctx.fillStyle = TIMELINE_COLORS.playhead;
    ctx.fillRect(playheadX - 1, 0, 2, height);

  }, [tracks, durationUs, currentTimeUs, viewport, effectiveDuration, totalTracksHeight, trackStates, getTrackHeight]);

  // Handle click on minimap (seek or navigate)
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = e.clientX - rect.left;
    const clickRatio = clickX / rect.width;
    const clickTimeUs = clickRatio * effectiveDuration;

    // Check if click is within viewport rectangle
    const viewportX = (viewport.startTimeUs / effectiveDuration) * rect.width;
    const viewportWidth = ((viewport.endTimeUs - viewport.startTimeUs) / effectiveDuration) * rect.width;

    if (clickX >= viewportX && clickX <= viewportX + viewportWidth) {
      // Click inside viewport - seek to position
      onSeek?.(clickTimeUs);
    } else {
      // Click outside viewport - center viewport on click position
      const visibleDuration = viewport.endTimeUs - viewport.startTimeUs;
      const newStartTime = Math.max(0, Math.min(effectiveDuration - visibleDuration, clickTimeUs - visibleDuration / 2));
      onViewportChange?.(newStartTime);
    }
  }, [isDragging, effectiveDuration, viewport, onSeek, onViewportChange]);

  // Handle drag to pan viewport
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = e.clientX - rect.left;
    const viewportX = (viewport.startTimeUs / effectiveDuration) * rect.width;
    const viewportWidth = ((viewport.endTimeUs - viewport.startTimeUs) / effectiveDuration) * rect.width;

    // Only start drag if clicking on viewport rectangle
    if (clickX >= viewportX && clickX <= viewportX + viewportWidth) {
      e.preventDefault();
      setIsDragging(true);
      dragStartX.current = e.clientX;
      dragStartViewport.current = viewport.startTimeUs;
    }
  }, [effectiveDuration, viewport]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const deltaX = e.clientX - dragStartX.current;
      const deltaTime = (deltaX / rect.width) * effectiveDuration;
      const visibleDuration = viewport.endTimeUs - viewport.startTimeUs;
      const newStartTime = Math.max(0, Math.min(effectiveDuration - visibleDuration, dragStartViewport.current + deltaTime));

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
  }, [isDragging, effectiveDuration, viewport, onViewportChange]);

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      style={{
        display: 'flex',
        height: TIMELINE.MINIMAP_HEIGHT,
        borderTop: `1px solid ${TIMELINE_COLORS.border}`,
        cursor: isDragging ? 'grabbing' : 'pointer',
      }}
    >
      {/* Left spacer matching track header width */}
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

      {/* Canvas minimap */}
      <canvas
        ref={canvasRef}
        width={containerWidth}
        height={TIMELINE.MINIMAP_HEIGHT}
        style={{
          flex: 1,
          height: TIMELINE.MINIMAP_HEIGHT,
        }}
      />
    </div>
  );
}

// ============================================================================
// SCROLLBAR
// ============================================================================

interface TimelineScrollbarProps {
  containerWidth: number;
  totalWidth: number;
  scrollLeft: number;
  onScroll: (scrollLeft: number) => void;
}

function TimelineScrollbar({ containerWidth, totalWidth, scrollLeft, onScroll }: TimelineScrollbarProps) {
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

  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (!isVisible) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = e.clientX - rect.left - TIMELINE.TRACK_HEADER_WIDTH;
    const trackWidth = rect.width - TIMELINE.TRACK_HEADER_WIDTH;

    // Calculate new scroll position (center thumb on click)
    const clickRatio = (clickX - thumbWidth / 2) / (trackWidth - thumbWidth);
    const newScroll = Math.max(0, Math.min(maxScroll, clickRatio * maxScroll));
    onScroll(newScroll);
  }, [isVisible, thumbWidth, maxScroll, onScroll]);

  const handleThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartScroll.current = scrollLeft;
  }, [scrollLeft]);

  useEffect(() => {
    if (!isDragging || !isVisible) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;

      const deltaX = e.clientX - dragStartX.current;
      const trackWidth = rect.width - TIMELINE.TRACK_HEADER_WIDTH;
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
  }, [isDragging, isVisible, maxScroll, thumbWidth, onScroll]);

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
      }}
    >
      {/* Left spacer matching track header width */}
      <div
        style={{
          width: TIMELINE.TRACK_HEADER_WIDTH,
          backgroundColor: TIMELINE_COLORS.trackHeaderBg,
          borderRight: `1px solid ${TIMELINE_COLORS.border}`,
          flexShrink: 0,
        }}
      />

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
            backgroundColor: isDragging || isHovered
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
