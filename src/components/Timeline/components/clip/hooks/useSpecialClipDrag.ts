/**
 * useSpecialClipDrag Hook
 * Shared drag behavior for subtitle and overlay clips.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface SpecialClipDragState {
  type: 'trim-start' | 'trim-end' | 'move';
  initialTimeUs: number;
  initialMouseX: number;
  initialMouseY: number;
  previewStartUs?: number;
  targetTrackId?: string;
}

export interface UseSpecialClipDragOptions {
  clipId: string;
  clipStartUs: number;
  clipEndUs: number;
  clipDurationUs: number;
  trackId: string;
  compatibleTrackType: 'subtitle' | 'overlay';
  isSelected: boolean;
  pixelToTime: (pixel: number) => number;
  onSelect?: (clipId: string, trackId: string) => void;
  onMove?: (clipId: string, newStartUs: number) => void;
  onMoveToTrack?: (clipId: string, trackId: string, newStartUs: number) => void;
  onTrimStart?: (clipId: string, newStartUs: number) => void;
  onTrimEnd?: (clipId: string, newEndUs: number) => void;
  applySnap: (timeUs: number, durationUs: number, clipId: string) => { snappedTimeUs: number; snappedTo: { timeUs: number } | null };
  setActiveSnapLine: (timeUs: number | null) => void;
  setDropTargetTrackId: (trackId: string | null) => void;
}

export function useSpecialClipDrag(options: UseSpecialClipDragOptions) {
  const {
    clipId,
    clipStartUs,
    clipEndUs,
    clipDurationUs,
    trackId,
    compatibleTrackType,
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
  } = options;

  const [dragState, setDragState] = useState<SpecialClipDragState | null>(null);
  const didDragRef = useRef(false);

  // Left trim handle mouse down
  const handleTrimStartMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDragState({
      type: 'trim-start',
      initialTimeUs: clipStartUs,
      initialMouseX: e.clientX,
      initialMouseY: e.clientY,
    });
  }, [clipStartUs]);

  // Right trim handle mouse down
  const handleTrimEndMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDragState({
      type: 'trim-end',
      initialTimeUs: clipEndUs,
      initialMouseX: e.clientX,
      initialMouseY: e.clientY,
    });
  }, [clipEndUs]);

  // Body drag (move) mouse down
  const handleBodyMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 16 || x > rect.width - 16) return;

    e.stopPropagation();
    e.preventDefault();

    didDragRef.current = false;

    if (!isSelected) {
      onSelect?.(clipId, trackId);
    }

    setDragState({
      type: 'move',
      initialTimeUs: clipStartUs,
      initialMouseX: e.clientX,
      initialMouseY: e.clientY,
      previewStartUs: clipStartUs,
      targetTrackId: trackId,
    });
  }, [clipStartUs, clipId, trackId, isSelected, onSelect]);

  // Handle click (to prevent seek after drag)
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (didDragRef.current) {
      didDragRef.current = false;
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
        onTrimStart?.(clipId, newStartUs);
      } else if (dragState.type === 'trim-end') {
        const newEndUs = Math.max(clipStartUs + 100000, dragState.initialTimeUs + deltaTimeUs);
        onTrimEnd?.(clipId, newEndUs);
      } else if (dragState.type === 'move') {
        didDragRef.current = true;

        let newStartUs = Math.max(0, dragState.initialTimeUs + deltaTimeUs);

        // Apply snapping only if Shift is NOT held
        if (!e.shiftKey) {
          const snapResult = applySnap(newStartUs, clipDurationUs, clipId);
          newStartUs = snapResult.snappedTimeUs;
          setActiveSnapLine(snapResult.snappedTo?.timeUs ?? null);
        } else {
          setActiveSnapLine(null);
        }

        // Detect target track from vertical position
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

        const isCompatibleTrack = targetTrackType === compatibleTrackType;

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
            onMoveToTrack(clipId, targetTrack, dragState.previewStartUs);
          } else if (onMove) {
            onMove(clipId, dragState.previewStartUs);
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
    clipId,
    clipDurationUs,
    clipStartUs,
    trackId,
    compatibleTrackType,
    pixelToTime,
    onTrimStart,
    onTrimEnd,
    onMove,
    onMoveToTrack,
    applySnap,
    setActiveSnapLine,
    setDropTargetTrackId,
  ]);

  return {
    dragState,
    didDragRef,
    handleTrimStartMouseDown,
    handleTrimEndMouseDown,
    handleBodyMouseDown,
    handleClick,
    isMoving: dragState?.type === 'move',
    isTrimming: dragState?.type === 'trim-start' || dragState?.type === 'trim-end',
  };
}
