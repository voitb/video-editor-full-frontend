/**
 * Video Editor V2 - Timeline Component
 * Professional NLE-style timeline with tracks, clips, minimap, and zoom controls.
 * Refactored to use extracted subcomponents and hooks.
 */

import { useCallback, useMemo, useRef, useEffect } from 'react';
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
import { TIMELINE, TIMELINE_COLORS } from '../../constants';

// Import types
import type { TimelineProps } from './types';

// Import utilities
import { getGridLines } from './utils/gridLines';

// Import hooks
import {
  useTimelineSnap,
  useRulerDrag,
  useTimelineZoom,
  useTimelineState,
  useTimelineDimensions,
} from './hooks';

// Import components
import {
  SortableTrackRow,
  TrackHeader,
  TrackLane,
  generateTimeMarkers,
  PlayheadMarker,
  InOutMarker,
  SnapIndicator,
  TimelineContextMenu,
  TimelineHeader,
  TimelineFooter,
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

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timeRulerScrollRef = useRef<HTMLDivElement>(null);
  const isScrollSyncingRef = useRef(false);

  // Use extracted state hook
  const timelineState = useTimelineState(tracks);
  const {
    activeSnapLine,
    setActiveSnapLine,
    dropTargetTrackId,
    setDropTargetTrackId,
    containerWidth,
    setContainerWidth,
    scrollLeft,
    setScrollLeft,
    hoveredLinkedClipId,
    setHoveredLinkedClipId,
    dragPreviewMap,
    addTrackDropdownOpen,
    setAddTrackDropdownOpen,
    trackHeaderMenu,
    setTrackHeaderMenu,
    activeTrackId,
    setActiveTrackId,
    handleDragPreview,
  } = timelineState;

  // Configure sensors for track reordering drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Use extracted dimensions hook
  const dimensions = useTimelineDimensions({
    containerRef,
    containerWidth,
    setContainerWidth,
    durationUs,
    viewport,
  });
  const {
    effectiveVisibleDuration,
    pixelsPerSecond,
    totalTimelineWidth,
    timeToPixel,
    pixelToTime,
    showScrollbar,
  } = dimensions;

  // Use extracted hooks
  const { applySnap } = useTimelineSnap({ tracks, currentTimeUs, pixelToTime });
  const { isRulerDragging, handleRulerMouseDown } = useRulerDrag({
    timeRulerScrollRef,
    pixelToTime,
    durationUs,
    onSeek,
  });
  useTimelineZoom({ timelineContentRef, onZoomAtPosition });

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
  }, [onViewportScroll, containerWidth, totalTimelineWidth, setScrollLeft]);

  // Sync scroll position when viewport changes externally
  useEffect(() => {
    if (!scrollContainerRef.current || !getScrollLeft) return;

    const targetScroll = getScrollLeft(containerWidth, totalTimelineWidth);
    const currentScroll = scrollContainerRef.current.scrollLeft;

    if (Math.abs(targetScroll - currentScroll) > 1) {
      scrollContainerRef.current.scrollLeft = targetScroll;
    }
  }, [viewport.startTimeUs, viewport.zoomLevel, containerWidth, totalTimelineWidth, getScrollLeft]);

  // Get track height from state or default
  const getTrackHeight = useCallback((trackId: string): number => {
    return trackStates?.[trackId]?.height ?? TIMELINE.DEFAULT_TRACK_HEIGHT;
  }, [trackStates]);

  // Handle timeline click for seeking
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!onSeek || !timelineContentRef.current) return;

    const rect = timelineContentRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = pixelToTime(x);
    const clampedTime = Math.max(0, Math.min(time, durationUs));
    onSeek(clampedTime);
  }, [onSeek, pixelToTime, durationUs]);

  // Handle track drag start/end
  const handleTrackDragStart = useCallback((event: DragStartEvent) => {
    setActiveTrackId(event.active.id as string);
  }, [setActiveTrackId]);

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
  }, [tracks, onTrackReorder, setActiveTrackId]);

  // Generate grid lines and time markers
  const { timeMarkers, gridLines } = useMemo(() => {
    const lines = getGridLines(effectiveVisibleDuration, viewport.startTimeUs, viewport.endTimeUs);
    const markers = generateTimeMarkers(lines, effectiveVisibleDuration, timeToPixel, totalTimelineWidth);
    return { timeMarkers: markers, gridLines: lines };
  }, [effectiveVisibleDuration, viewport.startTimeUs, viewport.endTimeUs, timeToPixel, totalTimelineWidth]);

  // Playhead and marker positions
  const playheadPosition = timeToPixel(currentTimeUs);
  const inPointPosition = hasInPoint && inPointUs !== undefined ? timeToPixel(inPointUs) : null;
  const outPointPosition = hasOutPoint && outPointUs !== undefined ? timeToPixel(outPointUs) : null;

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
      <TimelineHeader
        viewport={viewport}
        totalTimelineWidth={totalTimelineWidth}
        timeToPixel={timeToPixel}
        timeMarkers={timeMarkers}
        isRulerDragging={isRulerDragging}
        onRulerMouseDown={handleRulerMouseDown}
        timeRulerScrollRef={timeRulerScrollRef}
        addTrackDropdownOpen={addTrackDropdownOpen}
        setAddTrackDropdownOpen={setAddTrackDropdownOpen}
        onZoomChange={onZoomChange}
        onFitToView={onFitToView}
        onTrackAdd={onTrackAdd}
      />

      {/* TRACKS AREA */}
      <div
        ref={scrollContainerRef}
        className="timeline-scroll-hide"
        style={{ flex: 1, overflow: 'auto' }}
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
            <SnapIndicator timeUs={activeSnapLine} timeToPixel={timeToPixel} />
          )}

          {/* In-point marker */}
          {inPointPosition !== null && <InOutMarker position={inPointPosition} type="in" />}

          {/* Out-point marker */}
          {outPointPosition !== null && <InOutMarker position={outPointPosition} type="out" />}

          {/* Playhead */}
          <PlayheadMarker position={playheadPosition} />
        </div>
      </div>

      {/* FOOTER ROW */}
      <TimelineFooter
        tracks={tracks}
        durationUs={durationUs}
        currentTimeUs={currentTimeUs}
        viewport={viewport}
        containerWidth={containerWidth}
        totalTimelineWidth={totalTimelineWidth}
        showScrollbar={showScrollbar}
        scrollLeft={scrollLeft}
        scrollContainerRef={scrollContainerRef}
        timeRulerScrollRef={timeRulerScrollRef}
        trackStates={trackStates}
        getTrackHeight={getTrackHeight}
        onViewportScroll={onViewportScroll}
        onSeek={onSeek}
      />

      {/* Track Header Context Menu */}
      <TimelineContextMenu
        trackHeaderMenu={trackHeaderMenu}
        tracks={tracks}
        onClose={() => setTrackHeaderMenu(null)}
        onTrackAdd={onTrackAdd}
        onTrackInsert={onTrackInsert}
        onTrackColorChange={onTrackColorChange}
        onTrackRename={onTrackRename}
        onTrackRemove={onTrackRemove}
      />
    </div>
  );
}

// Re-export types for convenience
export type { TimelineProps } from './types';
