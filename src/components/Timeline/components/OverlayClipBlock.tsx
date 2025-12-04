/**
 * Overlay Clip Block
 * Overlay clip with trim handles, drag support, and context menu.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { OverlayClipBlockProps } from '../types';
import { TIMELINE_COLORS } from '../../../constants';
import { ContextMenu, MenuItem, MenuSeparator } from '../../ui';
import { getClipColor } from '../utils/colors';

export function OverlayClipBlock(props: OverlayClipBlockProps) {
  const {
    clip,
    trackId,
    timeToPixel,
    pixelToTime,
    isSelected,
    onSelect,
    onMove,
    onMoveToTrack,
    onTrimStart,
    onTrimEnd,
    onDelete,
    onEdit,
    onDuplicate,
    onSplit,
    currentTimeUs,
    allTracks: _allTracks,
    applySnap,
    setActiveSnapLine,
    setDropTargetTrackId,
  } = props;

  const [isHovered, setIsHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Drag state for trim handles and move
  const [dragState, setDragState] = useState<{
    type: 'trim-start' | 'trim-end' | 'move';
    initialTimeUs: number;
    initialMouseX: number;
    initialMouseY: number;
    previewStartUs?: number;
    targetTrackId?: string;
  } | null>(null);

  // Track if a drag actually happened (to prevent seek after drag)
  const didDragRef = useRef(false);

  const left = timeToPixel(clip.startUs);
  const width = Math.max(timeToPixel(clip.endUs) - left, 20);

  // Use preview position during move drag
  const displayLeft = dragState?.type === 'move' && dragState.previewStartUs !== undefined
    ? timeToPixel(dragState.previewStartUs)
    : left;

  // Get preview text based on clip width and content type
  const previewText = useMemo(() => {
    if (width < 60) return clip.contentType === 'text' ? 'T' : clip.contentType === 'html' ? 'H' : 'W';
    if (width < 100) return clip.contentType;
    const maxLen = Math.max(10, Math.floor(width / 7));
    const content = clip.content || '(empty)';
    return content.length > maxLen ? content.substring(0, maxLen) + '...' : content;
  }, [clip, width]);

  // Get icon based on content type
  const typeIcon = useMemo(() => {
    switch (clip.contentType) {
      case 'text': return 'T';
      case 'html': return '<>';
      case 'widget': return '\u2699';
      default: return 'T';
    }
  }, [clip.contentType]);

  // Check if playhead is within this clip (for split action)
  const canSplit = currentTimeUs > clip.startUs && currentTimeUs < clip.endUs;

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
      initialTimeUs: clip.endUs,
      initialMouseX: e.clientX,
      initialMouseY: e.clientY,
    });
  }, [clip.endUs]);

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

  // Handle click (to prevent seek after drag)
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();

    // Skip if a drag just happened (click fires after mouseup from drag)
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
  }, []);

  // Global mouse move/up handlers during drag
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragState.initialMouseX;
      const deltaTimeUs = pixelToTime(deltaX) - pixelToTime(0);

      if (dragState.type === 'trim-start') {
        const newStartUs = Math.max(0, dragState.initialTimeUs + deltaTimeUs);
        onTrimStart?.(clip.id, newStartUs);
      } else if (dragState.type === 'trim-end') {
        const newEndUs = Math.max(clip.startUs + 100000, dragState.initialTimeUs + deltaTimeUs); // Min 100ms
        onTrimEnd?.(clip.id, newEndUs);
      } else if (dragState.type === 'move') {
        // Mark that a drag movement occurred (to prevent seek after drag)
        didDragRef.current = true;

        // Calculate new start position
        let newStartUs = Math.max(0, dragState.initialTimeUs + deltaTimeUs);

        // Apply snapping only if Shift is NOT held
        if (!e.shiftKey) {
          const snapResult = applySnap(newStartUs, clip.durationUs, clip.id);
          newStartUs = snapResult.snappedTimeUs;

          if (snapResult.snappedTo) {
            setActiveSnapLine(snapResult.snappedTo.timeUs);
          } else {
            setActiveSnapLine(null);
          }
        } else {
          setActiveSnapLine(null);
        }

        // Detect target track from vertical position (only overlay tracks)
        const trackElements = document.querySelectorAll('[data-track-id]');
        let targetTrackId = trackId;
        let targetTrackType: string | null = null;

        for (const el of trackElements) {
          const rect = el.getBoundingClientRect();
          if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
            targetTrackId = el.getAttribute('data-track-id') || trackId;
            targetTrackType = el.getAttribute('data-track-type');
            break;
          }
        }

        // Only allow drop on overlay tracks
        const isCompatibleTrack = targetTrackType === 'overlay';

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

    const handleMouseUp = () => {
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
    clip.startUs,
    trackId,
    pixelToTime,
    onTrimStart,
    onTrimEnd,
    onMove,
    onMoveToTrack,
    applySnap,
    setActiveSnapLine,
    setDropTargetTrackId,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && isSelected) {
        e.preventDefault();
        onDelete?.(clip.id);
      }
      // Split at playhead with 'S' key
      if (e.key === 's' || e.key === 'S') {
        if (isSelected && canSplit) {
          e.preventDefault();
          onSplit?.(clip.id, currentTimeUs);
        }
      }
      // Duplicate with Cmd/Ctrl+D
      if ((e.key === 'd' || e.key === 'D') && (e.metaKey || e.ctrlKey)) {
        if (isSelected) {
          e.preventDefault();
          onDuplicate?.(clip.id);
        }
      }
    },
    [clip.id, isSelected, onDelete, onSplit, onDuplicate, canSplit, currentTimeUs]
  );

  // Handle right-click for context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Handle double-click to edit
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onEdit?.(clip.id);
  }, [clip.id, onEdit]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    if (!contextMenu) return;
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  const isMoving = dragState?.type === 'move';
  const isTrimming = dragState?.type === 'trim-start' || dragState?.type === 'trim-end';

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      onMouseDown={handleBodyMouseDown}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        left: displayLeft,
        top: 2,
        bottom: 2,
        width,
        backgroundColor: isMoving
          ? '#aa77cc' // Lighter during drag
          : getClipColor('overlay', isSelected, isHovered),
        borderRadius: 4,
        cursor: isMoving ? 'grabbing' : isTrimming ? 'ew-resize' : 'grab',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px', // Room for trim handles
        boxSizing: 'border-box',
        boxShadow: isSelected ? '0 0 0 2px rgba(255,255,255,0.5)' : 'none',
        outline: 'none',
        opacity: isMoving ? 0.9 : 1,
        transition: isMoving ? 'none' : 'background-color 0.15s',
        zIndex: isMoving ? 50 : 'auto',
      }}
    >
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
          backgroundColor: dragState?.type === 'trim-start'
            ? 'rgba(255,255,255,0.3)'
            : isHovered
              ? 'rgba(255,255,255,0.15)'
              : 'rgba(255,255,255,0.1)',
          borderRadius: '4px 0 0 4px',
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
          backgroundColor: dragState?.type === 'trim-end'
            ? 'rgba(255,255,255,0.3)'
            : isHovered
              ? 'rgba(255,255,255,0.15)'
              : 'rgba(255,255,255,0.1)',
          borderRadius: '0 4px 4px 0',
        }}
      />

      {/* Type icon */}
      <span
        style={{
          marginRight: 6,
          fontSize: 12,
          opacity: 0.8,
          pointerEvents: 'none',
          fontFamily: 'monospace',
          fontWeight: 600,
        }}
      >
        {typeIcon}
      </span>

      {/* Preview text */}
      <span
        style={{
          flex: 1,
          fontSize: 11,
          color: TIMELINE_COLORS.textPrimary,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          pointerEvents: 'none',
        }}
      >
        {previewText}
      </span>

      {/* Context menu */}
      <ContextMenu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
      >
        <MenuItem onClick={() => { onEdit?.(clip.id); setContextMenu(null); }}>
          Edit Overlay
        </MenuItem>
        <MenuItem onClick={() => { onDuplicate?.(clip.id); setContextMenu(null); }}>
          <span>Duplicate</span>
          <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Cmd+D</span>
        </MenuItem>
        <MenuItem
          onClick={() => { if (canSplit) { onSplit?.(clip.id, currentTimeUs); } setContextMenu(null); }}
          disabled={!canSplit}
        >
          <span>Split at Playhead</span>
          <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>S</span>
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => { onDelete?.(clip.id); setContextMenu(null); }} danger>
          <span>Delete</span>
          <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Del</span>
        </MenuItem>
      </ContextMenu>
    </div>
  );
}
