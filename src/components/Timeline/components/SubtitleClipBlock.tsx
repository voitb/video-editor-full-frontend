/**
 * Subtitle Clip Block
 * Subtitle clip with trim handles, drag support, and context menu.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { SubtitleClipBlockProps } from '../types';
import { TIMELINE_COLORS } from '../../../constants';
import { ContextMenu, MenuItem, MenuSeparator } from '../../ui';
import { getClipColor } from '../utils/colors';
import { useSpecialClipDrag } from './clip';

export function SubtitleClipBlock(props: SubtitleClipBlockProps) {
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
    onAddCue,
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
    compatibleTrackType: 'subtitle',
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

  // Get preview text based on clip width
  const previewText = useMemo(() => {
    if (clip.cues.length === 0) return '(empty)';
    if (width < 80) return `${clip.cueCount}`;

    const visibleCues = clip.getVisibleCues();
    if (visibleCues.length === 0) return '(trimmed)';
    const firstCue = visibleCues[0]!.text;
    const maxLen = Math.max(10, Math.floor(width / 7));
    return firstCue.length > maxLen
      ? firstCue.substring(0, maxLen) + '...'
      : firstCue;
  }, [clip, width]);

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
          ? '#dd9955'
          : getClipColor('subtitle', isSelected, isHovered),
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

      {/* Subtitle icon */}
      <span
        style={{
          marginRight: 6,
          fontSize: 12,
          opacity: 0.8,
          pointerEvents: 'none',
        }}
      >
        CC
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

      {/* Cue count badge */}
      {clip.cueCount > 0 && (
        <span
          style={{
            marginLeft: 6,
            padding: '1px 4px',
            fontSize: 10,
            backgroundColor: 'rgba(0,0,0,0.3)',
            borderRadius: 3,
            color: TIMELINE_COLORS.textSecondary,
            pointerEvents: 'none',
          }}
        >
          {clip.cueCount}
        </span>
      )}

      {/* Context menu */}
      <ContextMenu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
      >
        <MenuItem onClick={() => { onEdit?.(clip.id); setContextMenu(null); }}>
          Edit Subtitles
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
        <MenuItem
          onClick={() => { if (canSplit) { onAddCue?.(clip.id, currentTimeUs); } setContextMenu(null); }}
          disabled={!canSplit}
        >
          Add Cue at Playhead
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
