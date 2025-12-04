/**
 * Track Lane
 * Track lane that renders clips with drag-drop support.
 */

import { useState, useCallback, useEffect } from 'react';
import type { TrackLaneProps } from '../types';
import type { Clip } from '../../../core/Clip';
import type { SubtitleClip } from '../../../core/SubtitleClip';
import type { OverlayClip } from '../../../core/OverlayClip';
import { isSubtitleClip, isOverlayClip } from '../../../core/Track';
import { TIMELINE_COLORS } from '../../../constants';
import { ContextMenu, MenuItem } from '../../ui';
import { getTrackBgColor } from '../utils/colors';
import { ClipBlock } from './ClipBlock';
import { SubtitleClipBlock } from './SubtitleClipBlock';
import { OverlayClipBlock } from './OverlayClipBlock';

/** Data type for external drag-and-drop from media library */
const EXTERNAL_DRAG_DATA_TYPE = 'application/x-video-editor-source';

export function TrackLane(props: TrackLaneProps) {
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
    onClipUnlink,
    onClipDelete,
    onExternalDropToTrack,
    applySnap,
    setActiveSnapLine,
    setDropTargetTrackId,
    allTracks,
    pixelsPerSecond,
    hoveredLinkedClipId,
    setHoveredLinkedClipId,
    scrollLeft,
    onDragPreview,
    dragPreviewMap,
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
    currentTimeUs,
    tracks,
  } = props;

  // Context menu state for subtitle track
  const [trackContextMenu, setTrackContextMenu] = useState<{
    x: number;
    y: number;
    timeUs: number;
  } | null>(null);

  // Handle right-click on empty subtitle/overlay track area
  const handleTrackContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only show context menu for subtitle or overlay tracks
      if (track.type !== 'subtitle' && track.type !== 'overlay') return;

      e.preventDefault();

      // Calculate click position in time
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left + scrollLeft;
      const clickTimeUs = (clickX / pixelsPerSecond) * 1_000_000;

      setTrackContextMenu({
        x: e.clientX,
        y: e.clientY,
        timeUs: Math.max(0, clickTimeUs),
      });
    },
    [track.type, scrollLeft, pixelsPerSecond]
  );

  // Close track context menu when clicking elsewhere
  useEffect(() => {
    if (!trackContextMenu) return;
    const handleClickOutside = () => setTrackContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [trackContextMenu]);

  // Handle external drag over (from media library)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Check if this is an external source drag
    if (!e.dataTransfer.types.includes(EXTERNAL_DRAG_DATA_TYPE)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTargetTrackId(track.id);
  }, [track.id, setDropTargetTrackId]);

  // Handle external drag leave
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if we're actually leaving this element (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDropTargetTrackId(null);
  }, [setDropTargetTrackId]);

  // Handle external drop (from media library)
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetTrackId(null);

    const sourceId = e.dataTransfer.getData(EXTERNAL_DRAG_DATA_TYPE);
    if (!sourceId || !onExternalDropToTrack) return;

    // Calculate drop position in time
    const rect = e.currentTarget.getBoundingClientRect();
    const dropX = e.clientX - rect.left + scrollLeft;
    const dropTimeUs = (dropX / pixelsPerSecond) * 1_000_000;

    // Clamp to 0
    const clampedTimeUs = Math.max(0, dropTimeUs);

    onExternalDropToTrack(sourceId, track.id, clampedTimeUs);
  }, [track.id, onExternalDropToTrack, pixelsPerSecond, scrollLeft, setDropTargetTrackId]);

  return (
    <div
      data-track-id={track.id}
      data-track-type={track.type}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleTrackContextMenu}
      style={{
        height,
        backgroundColor: getTrackBgColor(track.type, isDropTarget),
        borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
        position: 'relative',
        transition: 'background-color 0.15s',
        opacity: isLocked ? 0.6 : 1,
        pointerEvents: isLocked ? 'none' : 'auto',
      }}
    >
      {/* Clips */}
      {track.clips.map((clip) =>
        isSubtitleClip(clip) ? (
          <SubtitleClipBlock
            key={clip.id}
            clip={clip as SubtitleClip}
            trackId={track.id}
            timeToPixel={timeToPixel}
            pixelToTime={pixelToTime}
            isSelected={clip.id === selectedClipId}
            onSelect={onClipSelect}
            onMove={onSubtitleMove}
            onMoveToTrack={onSubtitleMoveToTrack}
            onTrimStart={onSubtitleTrimStart}
            onTrimEnd={onSubtitleTrimEnd}
            onDelete={onClipDelete}
            onEdit={onSubtitleEdit}
            onDuplicate={onSubtitleDuplicate}
            onSplit={onSubtitleSplit}
            onAddCue={onSubtitleAddCue}
            currentTimeUs={currentTimeUs}
            allTracks={tracks}
            applySnap={applySnap}
            setActiveSnapLine={setActiveSnapLine}
            setDropTargetTrackId={setDropTargetTrackId}
          />
        ) : isOverlayClip(clip) ? (
          <OverlayClipBlock
            key={clip.id}
            clip={clip as OverlayClip}
            trackId={track.id}
            timeToPixel={timeToPixel}
            pixelToTime={pixelToTime}
            isSelected={clip.id === selectedClipId}
            onSelect={onClipSelect}
            onMove={onOverlayMove}
            onMoveToTrack={onOverlayMoveToTrack}
            onTrimStart={onOverlayTrimStart}
            onTrimEnd={onOverlayTrimEnd}
            onDelete={onClipDelete}
            onEdit={onOverlayEdit}
            onDuplicate={onOverlayDuplicate}
            onSplit={onOverlaySplit}
            currentTimeUs={currentTimeUs}
            allTracks={tracks}
            applySnap={applySnap}
            setActiveSnapLine={setActiveSnapLine}
            setDropTargetTrackId={setDropTargetTrackId}
          />
        ) : (
          <ClipBlock
            key={clip.id}
            clip={clip as Clip}
            trackId={track.id}
            trackType={track.type as 'video' | 'audio'}
            timeToPixel={timeToPixel}
            pixelToTime={pixelToTime}
            isSelected={clip.id === selectedClipId}
            onSelect={onClipSelect}
            onMove={onClipMove}
            onMoveToTrack={onClipMoveToTrack}
            onTrimStart={onClipTrimStart}
            onTrimEnd={onClipTrimEnd}
            onSeek={onSeek}
            onUnlink={onClipUnlink}
            onDelete={onClipDelete}
            applySnap={applySnap}
            setActiveSnapLine={setActiveSnapLine}
            setDropTargetTrackId={setDropTargetTrackId}
            allTracks={allTracks}
            isLinkedHighlighted={clip.id === hoveredLinkedClipId}
            onHoverLinked={setHoveredLinkedClipId}
            onDragPreview={onDragPreview}
            previewStartUs={dragPreviewMap.get(clip.id)}
          />
        )
      )}

      {/* Track context menu (for adding subtitle/overlay clips) */}
      <ContextMenu
        open={trackContextMenu !== null}
        onClose={() => setTrackContextMenu(null)}
        x={trackContextMenu?.x ?? 0}
        y={trackContextMenu?.y ?? 0}
        minWidth={140}
      >
        {track.type === 'subtitle' && trackContextMenu && (
          <MenuItem
            onClick={() => {
              onAddSubtitleClip?.(track.id, trackContextMenu.timeUs);
              setTrackContextMenu(null);
            }}
          >
            <span>+</span>
            <span>Add Subtitle</span>
          </MenuItem>
        )}
        {track.type === 'overlay' && trackContextMenu && (
          <MenuItem
            onClick={() => {
              onAddOverlayClip?.(track.id, trackContextMenu.timeUs);
              setTrackContextMenu(null);
            }}
          >
            <span>+</span>
            <span>Add Overlay</span>
          </MenuItem>
        )}
      </ContextMenu>
    </div>
  );
}
