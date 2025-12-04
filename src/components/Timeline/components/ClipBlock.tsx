/**
 * Clip Block
 * Video/audio clip with trim handles, drag support, and context menu.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { ClipBlockProps } from '../types';

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

  // Drag state for trim handles and move
  const [dragState, setDragState] = useState<{
    type: 'trim-start' | 'trim-end' | 'move';
    initialTimeUs: number;
    initialMouseX: number;
    initialMouseY: number;
    previewStartUs?: number;
    targetTrackId?: string;
  } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Track if a drag actually happened (to prevent seek after drag)
  const didDragRef = useRef(false);

  const left = timeToPixel(clip.startUs);
  const width = timeToPixel(clip.startUs + clip.durationUs) - left;

  // Use preview position during drag (either from local drag state or from parent when linked clip is being dragged)
  const displayLeft = dragState?.type === 'move' && dragState.previewStartUs !== undefined
    ? timeToPixel(dragState.previewStartUs)
    : externalPreviewStartUs !== undefined
    ? timeToPixel(externalPreviewStartUs)
    : left;

  // Handle click on clip: first click selects, click on selected seeks
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();

    // Skip seek if a drag just happened (click fires after mouseup from drag)
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }

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

  // Handle right-click for context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  // Handle unlink from context menu
  const handleUnlink = useCallback(() => {
    onUnlink?.(clip.id);
    setContextMenu(null);
  }, [clip.id, onUnlink]);

  // Handle delete from context menu
  const handleDelete = useCallback(() => {
    onDelete?.(clip.id);
    setContextMenu(null);
  }, [clip.id, onDelete]);

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

    // Check if clicking on trim handles (first/last 16px)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 16 || x > rect.width - 16) return;

    e.stopPropagation();
    e.preventDefault();

    // Reset drag tracking ref
    didDragRef.current = false;

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
        // Mark that a drag movement occurred (to prevent seek after drag)
        didDragRef.current = true;

        // Calculate new start position
        let newStartUs = Math.max(0, dragState.initialTimeUs + deltaTimeUs);

        // Apply snapping only if Shift is NOT held (standard NLE behavior)
        if (!e.shiftKey) {
          const snapResult = applySnap(newStartUs, clip.durationUs, clip.id);
          newStartUs = snapResult.snappedTimeUs;

          // Show snap line if snapped
          if (snapResult.snappedTo) {
            setActiveSnapLine(snapResult.snappedTo.timeUs);
          } else {
            setActiveSnapLine(null);
          }
        } else {
          // Shift held - disable snapping, clear snap line
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

        // Notify parent of drag preview (for linked clip synchronization)
        const delta = newStartUs - clip.startUs;
        onDragPreview?.(clip.id, newStartUs, clip.linkedClipId || undefined, delta);
      }
    };

    const handleMouseUp = (_e: MouseEvent) => {
      if (dragState.type === 'move') {
        setActiveSnapLine(null);
        setDropTargetTrackId(null);

        // Clear drag preview for linked clips
        onDragPreview?.(clip.id, null);

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
    clip.startUs,
    clip.linkedClipId,
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
    onDragPreview,
  ]);

  // Clip colors based on type, selection, drag state, and linked highlight
  const isMoving = dragState?.type === 'move';
  const getBackgroundColor = () => {
    if (isMoving) return '#5593dd'; // Blue during drag
    if (isLinkedHighlighted) return trackType === 'video' ? '#6a9fd4' : '#6ad49f'; // Highlight linked
    if (isSelected) return trackType === 'video' ? '#4f83cc' : '#4fcc83';
    return trackType === 'video' ? '#3b5998' : '#3b9858';
  };
  const backgroundColor = getBackgroundColor();

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
        backgroundColor,
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
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: 4,
            padding: 4,
            zIndex: 1000,
            minWidth: 120,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {clip.linkedClipId && (
            <button
              onClick={handleUnlink}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 12px',
                backgroundColor: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: 12,
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: 2,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}>
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Unlink
            </button>
          )}
          <button
            onClick={handleDelete}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 12px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#ff6b6b',
              fontSize: 12,
              textAlign: 'left',
              cursor: 'pointer',
              borderRadius: 2,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}>
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
