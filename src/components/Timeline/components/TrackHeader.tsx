/**
 * Track Header
 * Header component with M/S/L buttons, drag handle, and resize handle.
 */

import { useState, useRef, useEffect } from 'react';
import type { TrackHeaderProps } from '../types';
import { TIMELINE, TIMELINE_COLORS } from '../../../constants';
import { getTrackBgColor, getClipColor } from '../utils/colors';

export function TrackHeader({
  track,
  height,
  isDropTarget,
  trackState,
  onRemove,
  onMute,
  onSolo,
  onLock,
  onResize,
  onRename: _onRename,
  onColorChange: _onColorChange,
  onContextMenu,
  dragHandleProps,
  isDragging,
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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(track.id, e.clientX, e.clientY);
  };

  return (
    <div
      style={{
        height,
        display: 'flex',
        flexDirection: 'row',
        borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
        backgroundColor: isDropTarget
          ? getTrackBgColor(track.type, true)
          : 'transparent',
        transition: 'background-color 0.15s',
        position: 'relative',
        opacity: isDragging ? 0.5 : 1,
      }}
      onContextMenu={handleContextMenu}
    >
      {/* Drag handle */}
      {dragHandleProps && (
        <div
          {...dragHandleProps}
          style={{
            width: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isDragging ? 'grabbing' : 'grab',
            color: TIMELINE_COLORS.textMuted,
            flexShrink: 0,
            touchAction: 'none',
          }}
          title="Drag to reorder track"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="3" cy="2" r="1.5" />
            <circle cx="7" cy="2" r="1.5" />
            <circle cx="3" cy="7" r="1.5" />
            <circle cx="7" cy="7" r="1.5" />
            <circle cx="3" cy="12" r="1.5" />
            <circle cx="7" cy="12" r="1.5" />
          </svg>
        </div>
      )}

      {/* Color indicator bar */}
      <div
        style={{
          width: 4,
          backgroundColor: track.color || 'transparent',
          flexShrink: 0,
        }}
      />

      {/* Main content wrapper */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
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
                backgroundColor: getClipColor(track.type, false, false),
                borderRadius: 3,
                flexShrink: 0,
              }}
            >
              {track.type === 'video' ? 'V' : track.type === 'audio' ? 'A' : track.type === 'overlay' ? 'O' : 'S'}
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
            {/* Mute button (not shown for subtitle tracks) */}
            {onMute && track.type !== 'subtitle' && (
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
            {/* Solo button (not shown for subtitle tracks) */}
            {onSolo && track.type !== 'subtitle' && (
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
    </div>
  );
}
