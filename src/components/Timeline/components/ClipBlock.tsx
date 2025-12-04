/**
 * Clip Block
 * Video/audio clip with trim handles, drag support, and context menu.
 */

import { useCallback } from 'react';
import type { ClipBlockProps } from '../types';
import { useClipDrag, useClipContextMenu, ClipContextMenu } from './clip';

export function ClipBlock(props: ClipBlockProps) {
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
    onUnlink,
    onDelete,
    applySnap,
    setActiveSnapLine,
    setDropTargetTrackId,
    allTracks,
    isLinkedHighlighted,
    onHoverLinked,
    onDragPreview,
    previewStartUs: externalPreviewStartUs,
  } = props;

  // Use extracted hooks
  const {
    dragState,
    didDragRef,
    handleTrimStartMouseDown,
    handleTrimEndMouseDown,
    startMoveDrag,
    isMoving,
  } = useClipDrag({
    clipId: clip.id,
    clipStartUs: clip.startUs,
    clipDurationUs: clip.durationUs,
    linkedClipId: clip.linkedClipId,
    trackId,
    trackType,
    pixelToTime,
    onMove,
    onMoveToTrack,
    onTrimStart,
    onTrimEnd,
    applySnap,
    setActiveSnapLine,
    setDropTargetTrackId,
    allTracks,
    onDragPreview,
  });

  const {
    contextMenu,
    handleContextMenu,
    handleUnlink,
    handleDelete,
  } = useClipContextMenu({
    clipId: clip.id,
    linkedClipId: clip.linkedClipId,
    onUnlink,
    onDelete,
  });

  const left = timeToPixel(clip.startUs);
  const width = timeToPixel(clip.startUs + clip.durationUs) - left;

  // Use preview position during drag
  const displayLeft = dragState?.type === 'move' && dragState.previewStartUs !== undefined
    ? timeToPixel(dragState.previewStartUs)
    : externalPreviewStartUs !== undefined
    ? timeToPixel(externalPreviewStartUs)
    : left;

  // Handle click on clip: first click selects, click on selected seeks
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();

    // Skip seek if a drag just happened
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }

    if (isSelected && onSeek) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clipProgress = clickX / rect.width;
      const seekTimeUs = clip.startUs + Math.round(clip.durationUs * clipProgress);
      onSeek(seekTimeUs);
    } else {
      onSelect?.(clip.id, trackId);
    }
  }, [isSelected, clip, trackId, onSelect, onSeek, didDragRef]);

  // Body drag (move) mouse down
  const handleBodyMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 16 || x > rect.width - 16) return;

    e.stopPropagation();
    e.preventDefault();

    if (!isSelected) {
      onSelect?.(clip.id, trackId);
    }

    startMoveDrag(e);
  }, [clip.id, trackId, isSelected, onSelect, startMoveDrag]);

  // Get background color based on state
  const getBackgroundColor = () => {
    if (isMoving) return '#5593dd';
    if (isLinkedHighlighted) return trackType === 'video' ? '#6a9fd4' : '#6ad49f';
    if (isSelected) return trackType === 'video' ? '#4f83cc' : '#4fcc83';
    return trackType === 'video' ? '#3b5998' : '#3b9858';
  };

  // Handle mouse enter/leave for linked clip highlighting
  const handleMouseEnter = useCallback(() => {
    if (clip.linkedClipId) {
      onHoverLinked?.(clip.linkedClipId);
    }
  }, [clip.linkedClipId, onHoverLinked]);

  const handleMouseLeave = useCallback(() => {
    if (clip.linkedClipId) {
      onHoverLinked?.(null);
    }
  }, [clip.linkedClipId, onHoverLinked]);

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleBodyMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'absolute',
        left: displayLeft,
        top: 4,
        bottom: 4,
        width: Math.max(width, 1),
        backgroundColor: getBackgroundColor(),
        borderRadius: 4,
        border: isSelected
          ? '2px solid #fff'
          : isLinkedHighlighted
            ? '2px solid rgba(255,255,255,0.5)'
            : '1px solid rgba(255,255,255,0.2)',
        cursor: isMoving ? 'grabbing' : 'grab',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 8,
        boxSizing: 'border-box',
        opacity: isMoving ? 0.9 : 1,
        transition: isMoving ? 'none' : 'background-color 0.15s, border 0.15s',
        zIndex: isMoving ? 50 : 'auto',
      }}
    >
      {/* Link indicator */}
      {clip.linkedClipId && (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            marginRight: 4,
            pointerEvents: 'none',
          }}
          title="Linked to another clip"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.8)"
            strokeWidth="2.5"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </span>
      )}

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
          width: 16,
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
          width: 16,
          cursor: 'ew-resize',
          backgroundColor: dragState?.type === 'trim-end' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
        }}
      />

      {/* Context menu */}
      {contextMenu && (
        <ClipContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          hasLinkedClip={!!clip.linkedClipId}
          onUnlink={handleUnlink}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
