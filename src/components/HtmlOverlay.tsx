/**
 * Video Editor V2 - HTML Overlay Component
 * Renders HTML overlays on the video preview.
 * Supports drag positioning when interactive.
 */

import type { CSSProperties } from 'react';
import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { Track } from '../core/Track';
import { isOverlayClip } from '../core/Track';
import type { OverlayClip } from '../core/OverlayClip';
import type { OverlayPosition, OverlayStyle } from '../core/types';

interface HtmlOverlayProps {
  /** Current playback time (microseconds) */
  currentTimeUs: number;
  /** All tracks (will filter for overlay tracks) */
  tracks: readonly Track[];
  /** Composition width (for scaling) */
  compositionWidth: number;
  /** Composition height (for scaling) */
  compositionHeight: number;
  /** Container width (actual display size) */
  containerWidth: number;
  /** Container height (actual display size) */
  containerHeight: number;
  /** Currently selected clip ID */
  selectedClipId?: string;
  /** Callback when overlay position is changed via drag */
  onPositionChange?: (clipId: string, position: OverlayPosition) => void;
  /** Whether overlays can be dragged (typically false during playback) */
  isInteractive?: boolean;
}

interface ActiveOverlay {
  clip: OverlayClip;
  position: OverlayPosition;
  style: OverlayStyle;
}

export function HtmlOverlay({
  currentTimeUs,
  tracks,
  compositionWidth,
  compositionHeight: _compositionHeight,
  containerWidth,
  containerHeight,
  selectedClipId,
  onPositionChange,
  isInteractive = false,
}: HtmlOverlayProps) {
  // Get all active overlays at current time
  const activeOverlays = useMemo(() => {
    const overlays: ActiveOverlay[] = [];

    for (const track of tracks) {
      if (track.type !== 'overlay') continue;

      for (const clip of track.clips) {
        if (!isOverlayClip(clip)) continue;
        if (!clip.isActiveAt(currentTimeUs)) continue;

        overlays.push({
          clip,
          position: clip.position,
          style: clip.style,
        });
      }
    }

    return overlays;
  }, [currentTimeUs, tracks]);

  // Don't render if no active overlays
  if (activeOverlays.length === 0) return null;

  // Calculate scale factor for font size based on container width
  const scaleX = containerWidth / compositionWidth;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 20, // Above subtitle overlay
      }}
    >
      {activeOverlays.map(({ clip, position, style }) => (
        <OverlayElement
          key={clip.id}
          clip={clip}
          position={position}
          style={style}
          scaleX={scaleX}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          isSelected={clip.id === selectedClipId}
          isInteractive={isInteractive}
          onPositionChange={onPositionChange}
        />
      ))}
    </div>
  );
}

// ============================================================================
// OVERLAY ELEMENT
// ============================================================================

interface OverlayElementProps {
  clip: OverlayClip;
  position: OverlayPosition;
  style: OverlayStyle;
  scaleX: number;
  containerWidth: number;
  containerHeight: number;
  isSelected: boolean;
  isInteractive: boolean;
  onPositionChange?: (clipId: string, position: OverlayPosition) => void;
}

function OverlayElement({
  clip,
  position,
  style,
  scaleX,
  containerWidth,
  containerHeight,
  isSelected,
  isInteractive,
  onPositionChange,
}: OverlayElementProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const elementRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0, xPercent: 0, yPercent: 0 });

  // Calculate scaled font size
  const scaledFontSize = style.fontSize * scaleX;
  const scaledPadding = style.padding * scaleX;
  const scaledBorderRadius = style.borderRadius * scaleX;

  // Handle mouse down for drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isInteractive || !isSelected) return;

      e.preventDefault();
      e.stopPropagation();

      setIsDragging(true);
      startPosRef.current = {
        x: e.clientX,
        y: e.clientY,
        xPercent: position.xPercent,
        yPercent: position.yPercent,
      };
    },
    [isInteractive, isSelected, position.xPercent, position.yPercent]
  );

  // Handle mouse move for dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startPosRef.current.x;
      const deltaY = e.clientY - startPosRef.current.y;

      // Convert pixel delta to percentage
      const deltaXPercent = (deltaX / containerWidth) * 100;
      const deltaYPercent = (deltaY / containerHeight) * 100;

      setDragOffset({ x: deltaXPercent, y: deltaYPercent });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        // Commit the position change
        const newXPercent = Math.max(0, Math.min(100, startPosRef.current.xPercent + dragOffset.x));
        const newYPercent = Math.max(0, Math.min(100, startPosRef.current.yPercent + dragOffset.y));

        onPositionChange?.(clip.id, {
          ...position,
          xPercent: newXPercent,
          yPercent: newYPercent,
        });

        setDragOffset({ x: 0, y: 0 });
        setIsDragging(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, containerWidth, containerHeight, clip.id, position, onPositionChange]);

  // Calculate display position (including drag offset)
  const displayXPercent = position.xPercent + (isDragging ? dragOffset.x : 0);
  const displayYPercent = position.yPercent + (isDragging ? dragOffset.y : 0);
  const displayXPx = (displayXPercent / 100) * containerWidth;
  const displayYPx = (displayYPercent / 100) * containerHeight;

  // Build element style
  const elementStyle: CSSProperties = {
    position: 'absolute',
    left: displayXPx,
    top: displayYPx,
    transform: 'translate(-50%, -50%)', // Center on position
    fontFamily: style.fontFamily,
    fontSize: scaledFontSize,
    fontWeight: style.fontWeight,
    color: style.color,
    backgroundColor: style.backgroundColor,
    padding: scaledPadding,
    borderRadius: scaledBorderRadius,
    opacity: style.opacity,
    textAlign: style.textAlign,
    whiteSpace: 'pre-wrap',
    pointerEvents: isInteractive && isSelected ? 'auto' : 'none',
    cursor: isInteractive && isSelected ? (isDragging ? 'grabbing' : 'grab') : 'default',
    userSelect: 'none',
    // Selection indicator
    outline: isSelected ? '2px solid #3b82f6' : 'none',
    outlineOffset: 2,
    // Size constraints
    maxWidth: position.widthPercent ? `${position.widthPercent}%` : '80%',
    maxHeight: position.heightPercent ? `${position.heightPercent}%` : undefined,
  };

  // Render based on content type
  const renderContent = () => {
    switch (clip.contentType) {
      case 'text':
        return <span>{clip.content}</span>;

      case 'html':
        // Use dangerouslySetInnerHTML for HTML content
        // In production, this should be sanitized with DOMPurify
        return <div dangerouslySetInnerHTML={{ __html: clip.content }} />;

      case 'widget':
        // Widget placeholder - could be extended to support various widget types
        return (
          <div
            style={{
              padding: 16,
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px dashed #3b82f6',
              borderRadius: 4,
              color: '#3b82f6',
              fontSize: 12,
            }}
          >
            Widget: {clip.content}
          </div>
        );

      default:
        return <span>{clip.content}</span>;
    }
  };

  return (
    <div ref={elementRef} style={elementStyle} onMouseDown={handleMouseDown}>
      {renderContent()}
      {/* Drag handle indicator for selected items */}
      {isSelected && isInteractive && !isDragging && (
        <div
          style={{
            position: 'absolute',
            top: -24,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '2px 8px',
            backgroundColor: '#3b82f6',
            borderRadius: 4,
            fontSize: 10,
            color: '#fff',
            whiteSpace: 'nowrap',
          }}
        >
          Drag to move
        </div>
      )}
    </div>
  );
}
