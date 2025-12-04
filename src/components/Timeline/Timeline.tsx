/**
 * Video Editor V2 - Timeline Component
 * Professional NLE-style timeline with tracks, clips, minimap, and zoom controls.
 * Refactored to use extracted subcomponents.
 */

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { formatTimecodeAdaptive } from '../../utils/time';
import { TIMELINE, TIMELINE_COLORS, TRACK_COLOR_OPTIONS } from '../../constants';
import { ContextMenu, MenuItem, MenuSeparator, MenuHeader } from '../ui';
import { Dropdown } from '../ui';

// Import types
import type { TimelineProps, SnapTarget, SnapResult } from './types';

// Import utilities
import { getGridLines } from './utils/gridLines';

// Import components
import {
  ZoomSlider,
  Scrollbar,
  Minimap,
  SortableTrackRow,
  TrackHeader,
  TrackLane,
} from './components';

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
    onTrackRename,
    onTrackColorChange,
    onTrackInsert,
    onTrackReorder,
    onClipUnlink,
    onFitToView,
    onExternalDropToTrack,
    onClipDelete,
    linkedSelection: _linkedSelection = true,
    inPointUs,
    outPointUs,
    hasInPoint,
    hasOutPoint,
    onAddSubtitleClip,
    onSubtitleEdit,
    onSubtitleTrimStart,
    onSubtitleTrimEnd,
    onSubtitleMoveToTrack,
    onSubtitleMove,
    onSubtitleDuplicate,
    onSubtitleSplit,
    onSubtitleAddCue,
    onAddOverlayClip,
    onOverlayEdit,
    onOverlayTrimStart,
    onOverlayTrimEnd,
    onOverlayMoveToTrack,
    onOverlayMove,
    onOverlayDuplicate,
    onOverlaySplit,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timeRulerScrollRef = useRef<HTMLDivElement>(null);
  const isScrollSyncingRef = useRef(false);
  const [activeSnapLine, setActiveSnapLine] = useState<number | null>(null);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isRulerDragging, setIsRulerDragging] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hoveredLinkedClipId, setHoveredLinkedClipId] = useState<string | null>(null);
  const [dragPreviewMap, setDragPreviewMap] = useState<Map<string, number>>(new Map());
  const [addTrackDropdownOpen, setAddTrackDropdownOpen] = useState(false);
  const [trackHeaderMenu, setTrackHeaderMenu] = useState<{
    trackId: string;
    x: number;
    y: number;
  } | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);

  // Configure sensors for track reordering drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle track drag start
  const handleTrackDragStart = useCallback((event: DragStartEvent) => {
    setActiveTrackId(event.active.id as string);
  }, []);

  // Handle track drag end - reorder tracks
  const handleTrackDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTrackId(null);

    if (over && active.id !== over.id) {
      const oldIndex = tracks.findIndex(t => t.id === active.id);
      const newIndex = tracks.findIndex(t => t.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        onTrackReorder?.(active.id as string, newIndex);
      }
    }
  }, [tracks, onTrackReorder]);

  // Track container width for responsive timeline
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const width = container.clientWidth - TIMELINE.TRACK_HEADER_WIDTH;
      setContainerWidth(Math.max(width, 100));
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Calculate effective durations
  const effectiveDuration = Math.max(durationUs, TIMELINE.MIN_VISIBLE_DURATION_US);
  const visibleDuration = viewport.endTimeUs - viewport.startTimeUs;
  const effectiveVisibleDuration = Math.max(visibleDuration, TIMELINE.MIN_VISIBLE_DURATION_US);

  // Calculate pixels per second
  const pixelsPerSecond = useMemo(() => {
    if (containerWidth <= 0) return 100;
    return containerWidth / (effectiveVisibleDuration / 1_000_000);
  }, [containerWidth, effectiveVisibleDuration]);

  // Calculate total timeline width
  const totalTimelineWidth = useMemo(() => {
    const contentWidth = (effectiveDuration / 1_000_000) * pixelsPerSecond;
    return Math.max(contentWidth, containerWidth, 100);
  }, [effectiveDuration, pixelsPerSecond, containerWidth]);

  // Time-to-pixel conversion
  const timeToPixel = useCallback((timeUs: number): number => {
    return (timeUs / 1_000_000) * pixelsPerSecond;
  }, [pixelsPerSecond]);

  // Pixel-to-time conversion
  const pixelToTime = useCallback((pixel: number): number => {
    return (pixel / pixelsPerSecond) * 1_000_000;
  }, [pixelsPerSecond]);

  // Handle scroll synchronization
  const handleContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (isScrollSyncingRef.current) return;

    isScrollSyncingRef.current = true;

    const target = e.currentTarget;
    const newScrollLeft = target.scrollLeft;

    setScrollLeft(newScrollLeft);

    if (timeRulerScrollRef.current) {
      timeRulerScrollRef.current.scrollLeft = newScrollLeft;
    }

    if (onViewportScroll) {
      onViewportScroll(newScrollLeft, containerWidth, totalTimelineWidth);
    }

    requestAnimationFrame(() => {
      isScrollSyncingRef.current = false;
    });
  }, [onViewportScroll, containerWidth, totalTimelineWidth]);

  // Sync scroll position when viewport changes externally
  useEffect(() => {
    if (!scrollContainerRef.current || !getScrollLeft) return;

    const targetScroll = getScrollLeft(containerWidth, totalTimelineWidth);
    const currentScroll = scrollContainerRef.current.scrollLeft;

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
        targets.push({ timeUs: clip.startUs, type: 'clip-start', clipId: clip.id });
        targets.push({ timeUs: clip.endUs, type: 'clip-end', clipId: clip.id });
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

    const filteredTargets = snapTargets.filter(target => {
      if (!excludeClipId) return true;
      return target.clipId !== excludeClipId;
    });

    for (const target of filteredTargets) {
      const deltaStart = Math.abs(proposedStartUs - target.timeUs);
      if (deltaStart < snapThresholdUs && deltaStart < bestDelta) {
        bestDelta = deltaStart;
        bestSnap = target;
        snappedStartUs = target.timeUs;
      }

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

  // Handle drag preview updates
  const handleDragPreview = useCallback((
    clipId: string,
    previewStartUs: number | null,
    linkedClipId?: string,
    delta?: number
  ) => {
    if (previewStartUs === null) {
      setDragPreviewMap(new Map());
    } else {
      const newMap = new Map<string, number>();
      newMap.set(clipId, previewStartUs);

      if (linkedClipId && delta !== undefined) {
        for (const track of tracks) {
          const linkedClip = track.clips.find(c => c.id === linkedClipId);
          if (linkedClip) {
            newMap.set(linkedClipId, linkedClip.startUs + delta);
            break;
          }
        }
      }

      setDragPreviewMap(newMap);
    }
  }, [tracks]);

  // Handle wheel events for zooming
  useEffect(() => {
    const el = timelineContentRef.current;
    if (!el) return;

    const handleWheelNative = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();

      if (!onZoomAtPosition) return;

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const positionRatio = Math.max(0, Math.min(1, mouseX / rect.width));
      const direction = e.deltaY < 0 ? 'in' : 'out';

      onZoomAtPosition(positionRatio, direction);
    };

    el.addEventListener('wheel', handleWheelNative, { passive: false });

    return () => {
      el.removeEventListener('wheel', handleWheelNative);
    };
  }, [onZoomAtPosition]);

  // Handle timeline click for seeking
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!onSeek || !timelineContentRef.current) return;

    const rect = timelineContentRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = pixelToTime(x);
    const clampedTime = Math.max(0, Math.min(time, durationUs));
    onSeek(clampedTime);
  }, [onSeek, pixelToTime, durationUs]);

  // Handle ruler mouse down for drag-to-seek
  const handleRulerMouseDown = useCallback((e: React.MouseEvent) => {
    if (!onSeek || !timeRulerScrollRef.current) return;

    setIsRulerDragging(true);

    const rect = timeRulerScrollRef.current.getBoundingClientRect();
    const scrollLeftVal = timeRulerScrollRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeftVal;
    const time = pixelToTime(x);
    const clampedTime = Math.max(0, Math.min(time, durationUs));
    onSeek(clampedTime);
  }, [onSeek, pixelToTime, durationUs]);

  // Handle ruler drag for scrubbing playhead
  useEffect(() => {
    if (!isRulerDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timeRulerScrollRef.current || !onSeek) return;

      const rect = timeRulerScrollRef.current.getBoundingClientRect();
      const scrollLeftVal = timeRulerScrollRef.current.scrollLeft;
      const x = e.clientX - rect.left + scrollLeftVal;
      const time = pixelToTime(x);
      const clampedTime = Math.max(0, Math.min(time, durationUs));
      onSeek(clampedTime);
    };

    const handleMouseUp = () => {
      setIsRulerDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isRulerDragging, pixelToTime, durationUs, onSeek]);

  // Generate grid lines and time markers
  const { timeMarkers, gridLines } = useMemo(() => {
    const lines = getGridLines(
      effectiveVisibleDuration,
      viewport.startTimeUs,
      viewport.endTimeUs
    );

    const markers = lines
      .filter(l => l.type === 'major')
      .map(l => ({
        timeUs: l.timeUs,
        label: formatTimecodeAdaptive(l.timeUs, effectiveVisibleDuration),
      }))
      .filter(m => timeToPixel(m.timeUs) < totalTimelineWidth - 40);

    return { timeMarkers: markers, gridLines: lines };
  }, [effectiveVisibleDuration, viewport.startTimeUs, viewport.endTimeUs, timeToPixel, totalTimelineWidth]);

  // Playhead position
  const playheadPosition = timeToPixel(currentTimeUs);

  // In/Out marker positions
  const inPointPosition = hasInPoint && inPointUs !== undefined ? timeToPixel(inPointUs) : null;
  const outPointPosition = hasOutPoint && outPointUs !== undefined ? timeToPixel(outPointUs) : null;

  // Check if scrollbar should be visible
  const showScrollbar = totalTimelineWidth > containerWidth;

  // Close track header menu when clicking elsewhere
  useEffect(() => {
    if (!trackHeaderMenu) return;
    const handleClickOutside = () => setTrackHeaderMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [trackHeaderMenu]);

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
      {/* HEADER ROW */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexShrink: 0,
          height: TIMELINE.TIME_RULER_HEIGHT,
          borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
        }}
      >
        {/* Left corner with zoom slider, fit button, and add track dropdown */}
        <div
          style={{
            width: TIMELINE.TRACK_HEADER_WIDTH,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 4px',
            gap: 4,
            boxSizing: 'border-box',
            overflow: 'visible',
            backgroundColor: TIMELINE_COLORS.trackHeaderBg,
            borderRight: `1px solid ${TIMELINE_COLORS.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {onZoomChange && (
              <ZoomSlider
                zoomLevel={viewport.zoomLevel}
                minZoom={1}
                maxZoom={TIMELINE.MAX_ZOOM_LEVEL}
                onChange={onZoomChange}
              />
            )}
            {onFitToView && (
              <button
                onClick={onFitToView}
                style={{
                  padding: '2px 6px',
                  fontSize: 10,
                  backgroundColor: '#333',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 3,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title="Fit timeline to view"
              >
                Fit
              </button>
            )}
          </div>
          {onTrackAdd && (
            <Dropdown
              open={addTrackDropdownOpen}
              onOpenChange={setAddTrackDropdownOpen}
              placement="bottom-start"
              trigger={
                <button
                  type="button"
                  onClick={() => setAddTrackDropdownOpen(!addTrackDropdownOpen)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    backgroundColor: '#2a4a7a',
                    color: '#fff',
                    border: `1px solid ${TIMELINE_COLORS.border}`,
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  + Track
                </button>
              }
            >
              {[
                { type: 'video' as const, label: 'Video Track', color: '#2a4a7a' },
                { type: 'audio' as const, label: 'Audio Track', color: '#2a7a4a' },
                { type: 'subtitle' as const, label: 'Subtitle Track', color: TIMELINE_COLORS.clipSubtitle },
                { type: 'overlay' as const, label: 'Overlay Track', color: TIMELINE_COLORS.clipOverlay },
              ].map((item) => (
                <MenuItem
                  key={item.type}
                  onClick={() => {
                    onTrackAdd(item.type);
                    setAddTrackDropdownOpen(false);
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 2,
                      backgroundColor: item.color,
                      flexShrink: 0,
                    }}
                  />
                  {item.label}
                </MenuItem>
              ))}
            </Dropdown>
          )}
        </div>

        {/* Time ruler */}
        <div
          ref={timeRulerScrollRef}
          onMouseDown={handleRulerMouseDown}
          className="timeline-scroll-hide"
          style={{
            flex: 1,
            backgroundColor: TIMELINE_COLORS.rulerBg,
            overflowX: 'auto',
            overflowY: 'hidden',
            position: 'relative',
            zIndex: 5,
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
            cursor: isRulerDragging ? 'grabbing' : 'pointer',
          }}
        >
          <div
            style={{
              width: totalTimelineWidth,
              height: '100%',
              position: 'relative',
            }}
          >
            {timeMarkers.map((marker, index) => {
              const isFirstMarker = index === 0 && marker.timeUs === 0;
              return (
                <div
                  key={marker.timeUs}
                  style={{
                    position: 'absolute',
                    left: timeToPixel(marker.timeUs),
                    top: 0,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isFirstMarker ? 'flex-start' : 'center',
                    justifyContent: 'flex-end',
                    paddingBottom: 2,
                    transform: isFirstMarker ? 'none' : 'translateX(-50%)',
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      width: 1,
                      height: '100%',
                      backgroundColor: TIMELINE_COLORS.gridMajor,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      color: TIMELINE_COLORS.textMuted,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {marker.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* TRACKS AREA */}
      <div
        ref={scrollContainerRef}
        className="timeline-scroll-hide"
        style={{
          flex: 1,
          overflow: 'auto',
        }}
        onScroll={handleContentScroll}
      >
        <div
          ref={timelineContentRef}
          style={{
            width: totalTimelineWidth + TIMELINE.TRACK_HEADER_WIDTH,
            minWidth: totalTimelineWidth + TIMELINE.TRACK_HEADER_WIDTH,
            position: 'relative',
          }}
          onClick={handleTimelineClick}
        >
          {/* Grid lines */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: TIMELINE.TRACK_HEADER_WIDTH,
              right: 0,
              bottom: 0,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {gridLines.map((line) => (
              <div
                key={`grid-${line.timeUs}`}
                style={{
                  position: 'absolute',
                  left: timeToPixel(line.timeUs),
                  top: 0,
                  bottom: 0,
                  width: 1,
                  backgroundColor:
                    line.type === 'major'
                      ? TIMELINE_COLORS.gridMajor
                      : line.type === 'minor'
                      ? TIMELINE_COLORS.gridMinor
                      : TIMELINE_COLORS.gridSubMinor,
                }}
              />
            ))}
          </div>

          {/* Track rows */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleTrackDragStart}
            onDragEnd={handleTrackDragEnd}
          >
            <SortableContext
              items={tracks.map(t => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {tracks.map((track, trackIndex) => (
                <SortableTrackRow key={track.id} id={track.id}>
                  {(dragHandleProps, isDragging) => (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        height: getTrackHeight(track.id),
                      }}
                    >
                      {/* Sticky track header */}
                      <div
                        style={{
                          position: 'sticky',
                          left: 0,
                          width: TIMELINE.TRACK_HEADER_WIDTH,
                          flexShrink: 0,
                          zIndex: 10,
                          backgroundColor: TIMELINE_COLORS.trackHeaderBg,
                          borderRight: `1px solid ${TIMELINE_COLORS.border}`,
                        }}
                      >
                        <TrackHeader
                          track={track}
                          height={getTrackHeight(track.id)}
                          isDropTarget={dropTargetTrackId === track.id}
                          trackState={trackStates?.[track.id]}
                          onRemove={onTrackRemove}
                          onMute={onTrackMute}
                          onSolo={onTrackSolo}
                          onLock={onTrackLock}
                          onResize={onTrackResize}
                          onRename={onTrackRename}
                          onColorChange={onTrackColorChange}
                          onContextMenu={(trackId, x, y) => setTrackHeaderMenu({ trackId, x, y })}
                          dragHandleProps={dragHandleProps}
                          isDragging={isDragging}
                        />
                      </div>
                      {/* Track lane */}
                      <div style={{ position: 'relative', width: totalTimelineWidth }}>
                        <TrackLane
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
                          onClipUnlink={onClipUnlink}
                          onClipDelete={onClipDelete}
                          onExternalDropToTrack={onExternalDropToTrack}
                          applySnap={applySnap}
                          setActiveSnapLine={setActiveSnapLine}
                          setDropTargetTrackId={setDropTargetTrackId}
                          allTracks={tracks}
                          pixelsPerSecond={pixelsPerSecond}
                          scrollLeft={scrollLeft}
                          hoveredLinkedClipId={hoveredLinkedClipId}
                          setHoveredLinkedClipId={setHoveredLinkedClipId}
                          onDragPreview={handleDragPreview}
                          dragPreviewMap={dragPreviewMap}
                          onAddSubtitleClip={onAddSubtitleClip}
                          onSubtitleEdit={onSubtitleEdit}
                          onSubtitleTrimStart={onSubtitleTrimStart}
                          onSubtitleTrimEnd={onSubtitleTrimEnd}
                          onSubtitleMoveToTrack={onSubtitleMoveToTrack}
                          onSubtitleMove={onSubtitleMove}
                          onSubtitleDuplicate={onSubtitleDuplicate}
                          onSubtitleSplit={onSubtitleSplit}
                          onSubtitleAddCue={onSubtitleAddCue}
                          onAddOverlayClip={onAddOverlayClip}
                          onOverlayEdit={onOverlayEdit}
                          onOverlayTrimStart={onOverlayTrimStart}
                          onOverlayTrimEnd={onOverlayTrimEnd}
                          onOverlayMoveToTrack={onOverlayMoveToTrack}
                          onOverlayMove={onOverlayMove}
                          onOverlayDuplicate={onOverlayDuplicate}
                          onOverlaySplit={onOverlaySplit}
                          currentTimeUs={currentTimeUs}
                          tracks={tracks}
                        />
                      </div>
                    </div>
                  )}
                </SortableTrackRow>
              ))}
            </SortableContext>

            {/* Drag overlay */}
            <DragOverlay>
              {activeTrackId ? (
                <div
                  style={{
                    backgroundColor: TIMELINE_COLORS.trackHeaderBg,
                    border: `2px solid ${TIMELINE_COLORS.playhead}`,
                    borderRadius: 4,
                    padding: '8px 12px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  <span style={{ fontSize: 11, color: TIMELINE_COLORS.textSecondary }}>
                    {tracks.find(t => t.id === activeTrackId)?.label || 'Track'}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Snap indicator line */}
          {activeSnapLine !== null && (
            <div
              style={{
                position: 'absolute',
                left: TIMELINE.TRACK_HEADER_WIDTH + timeToPixel(activeSnapLine),
                top: 0,
                bottom: 0,
                width: 2,
                backgroundColor: TIMELINE_COLORS.snapLine,
                pointerEvents: 'none',
                zIndex: 90,
              }}
            />
          )}

          {/* In-point marker */}
          {inPointPosition !== null && (
            <div
              style={{
                position: 'absolute',
                left: TIMELINE.TRACK_HEADER_WIDTH + inPointPosition,
                top: 0,
                bottom: 0,
                width: 2,
                backgroundColor: '#00ffff',
                pointerEvents: 'none',
                zIndex: 95,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: -5,
                  width: 12,
                  height: 10,
                  backgroundColor: '#00ffff',
                  clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  left: -4,
                  fontSize: 9,
                  fontWeight: 'bold',
                  color: '#00ffff',
                  userSelect: 'none',
                }}
              >
                I
              </div>
            </div>
          )}

          {/* Out-point marker */}
          {outPointPosition !== null && (
            <div
              style={{
                position: 'absolute',
                left: TIMELINE.TRACK_HEADER_WIDTH + outPointPosition,
                top: 0,
                bottom: 0,
                width: 2,
                backgroundColor: '#ff00ff',
                pointerEvents: 'none',
                zIndex: 95,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: -5,
                  width: 12,
                  height: 10,
                  backgroundColor: '#ff00ff',
                  clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  left: -4,
                  fontSize: 9,
                  fontWeight: 'bold',
                  color: '#ff00ff',
                  userSelect: 'none',
                }}
              >
                O
              </div>
            </div>
          )}

          {/* Playhead */}
          <div
            style={{
              position: 'absolute',
              left: TIMELINE.TRACK_HEADER_WIDTH + playheadPosition,
              top: 0,
              bottom: 0,
              width: 2,
              backgroundColor: TIMELINE_COLORS.playhead,
              pointerEvents: 'none',
              zIndex: 100,
            }}
          >
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

      {/* FOOTER ROW */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexShrink: 0,
        }}
      >
        {/* Minimap label */}
        <div
          style={{
            width: TIMELINE.TRACK_HEADER_WIDTH,
            height: TIMELINE.MINIMAP_HEIGHT,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: TIMELINE_COLORS.trackHeaderBg,
            borderTop: `1px solid ${TIMELINE_COLORS.border}`,
            borderRight: `1px solid ${TIMELINE_COLORS.border}`,
          }}
        >
          <span style={{ fontSize: 9, color: TIMELINE_COLORS.textMuted }}>OVERVIEW</span>
        </div>

        {/* Minimap and scrollbar container */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderTop: `1px solid ${TIMELINE_COLORS.border}` }}>
          <Minimap
            tracks={tracks}
            durationUs={durationUs}
            currentTimeUs={currentTimeUs}
            viewport={viewport}
            containerWidth={containerWidth}
            onViewportChange={onViewportScroll ? (startTimeUs) => {
              const effectiveDur = Math.max(durationUs, TIMELINE.MIN_VISIBLE_DURATION_US);
              const visibleDur = effectiveDur / viewport.zoomLevel;
              const maxStartTime = effectiveDur - visibleDur;
              if (maxStartTime > 0) {
                const scrollRatio = startTimeUs / maxStartTime;
                const newScrollLeft = scrollRatio * (totalTimelineWidth - containerWidth);
                onViewportScroll(newScrollLeft, containerWidth, totalTimelineWidth);
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollLeft = newScrollLeft;
                }
              }
            } : undefined}
            onSeek={onSeek}
            trackStates={trackStates}
            getTrackHeight={getTrackHeight}
          />

          {showScrollbar && (
            <Scrollbar
              containerWidth={containerWidth}
              totalWidth={totalTimelineWidth}
              scrollLeft={scrollLeft}
              onScroll={(newScrollLeft) => {
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollLeft = newScrollLeft;
                }
                if (timeRulerScrollRef.current) {
                  timeRulerScrollRef.current.scrollLeft = newScrollLeft;
                }
              }}
            />
          )}
        </div>
      </div>

      {/* Track Header Context Menu */}
      <ContextMenu
        open={trackHeaderMenu !== null}
        onClose={() => setTrackHeaderMenu(null)}
        x={trackHeaderMenu?.x ?? 0}
        y={trackHeaderMenu?.y ?? 0}
      >
        {onTrackAdd && trackHeaderMenu && (
          <>
            <MenuHeader>Add Track</MenuHeader>
            {[
              { type: 'video' as const, label: 'Video Track Above' },
              { type: 'audio' as const, label: 'Audio Track Above' },
              { type: 'subtitle' as const, label: 'Subtitle Track Above' },
              { type: 'overlay' as const, label: 'Overlay Track Above' },
            ].map((item) => (
              <MenuItem
                key={item.type}
                onClick={() => {
                  onTrackInsert?.(item.type, trackHeaderMenu.trackId, 'above');
                  setTrackHeaderMenu(null);
                }}
              >
                {item.label}
              </MenuItem>
            ))}
            <MenuSeparator />
          </>
        )}

        {onTrackColorChange && trackHeaderMenu && (
          <>
            <MenuHeader>Track Color</MenuHeader>
            <div
              style={{
                padding: '4px 12px 8px',
                display: 'flex',
                gap: 4,
                flexWrap: 'wrap',
              }}
            >
              {TRACK_COLOR_OPTIONS.map((option) => (
                <button
                  key={option.name}
                  onClick={() => {
                    onTrackColorChange(trackHeaderMenu.trackId, option.value);
                    setTrackHeaderMenu(null);
                  }}
                  style={{
                    width: 20,
                    height: 20,
                    padding: 0,
                    backgroundColor: option.value || '#333',
                    border: option.value ? 'none' : `1px dashed ${TIMELINE_COLORS.border}`,
                    borderRadius: 3,
                    cursor: 'pointer',
                  }}
                  title={option.name}
                />
              ))}
            </div>
            <MenuSeparator />
          </>
        )}

        {onTrackRename && trackHeaderMenu && (
          <MenuItem
            onClick={() => {
              const track = tracks.find(t => t.id === trackHeaderMenu.trackId);
              const newLabel = window.prompt('Enter new track name:', track?.label || '');
              if (newLabel && newLabel.trim()) {
                onTrackRename(trackHeaderMenu.trackId, newLabel.trim());
              }
              setTrackHeaderMenu(null);
            }}
          >
            Rename Track
          </MenuItem>
        )}

        {onTrackRemove && trackHeaderMenu && (
          <MenuItem
            onClick={() => {
              onTrackRemove(trackHeaderMenu.trackId);
              setTrackHeaderMenu(null);
            }}
            danger
          >
            Delete Track
          </MenuItem>
        )}
      </ContextMenu>
    </div>
  );
}

// Re-export types for convenience
export type { TimelineProps } from './types';
