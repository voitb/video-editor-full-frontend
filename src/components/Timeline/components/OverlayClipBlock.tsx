/**
 * Overlay Clip Block
 * Overlay clip with trim handles, drag support, and context menu.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { OverlayClipBlockProps } from '../types';
import { TIMELINE_COLORS } from '../../../constants';
import { ContextMenu, MenuItem, MenuSeparator } from '../../ui';
import { getClipColor } from '../utils/colors';
import { useSpecialClipDrag } from './clip';

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

  // Use shared drag hook
  const {
    dragState,
    handleTrimStartMouseDown,
    handleTrimEndMouseDown,
    handleBodyMouseDown,
    handleClick,
    isMoving,
    isTrimming,
  } = useSpecialClipDrag({
    clipId: clip.id,
    clipStartUs: clip.startUs,
    clipEndUs: clip.endUs,
    clipDurationUs: clip.durationUs,
    trackId,
    compatibleTrackType: 'overlay',
    isSelected,
    pixelToTime,
    onSelect,
    onMove,
    onMoveToTrack,
    onTrimStart,
    onTrimEnd,
    applySnap,
    setActiveSnapLine,
    setDropTargetTrackId,
  });

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && isSelected) {
        e.preventDefault();
        onDelete?.(clip.id);
      }
      if (e.key === 's' || e.key === 'S') {
        if (isSelected && canSplit) {
          e.preventDefault();
          onSplit?.(clip.id, currentTimeUs);
        }
      }
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
          ? '#aa77cc'
          : getClipColor('overlay', isSelected, isHovered),
        borderRadius: 4,
        cursor: isMoving ? 'grabbing' : isTrimming ? 'ew-resize' : 'grab',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
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
