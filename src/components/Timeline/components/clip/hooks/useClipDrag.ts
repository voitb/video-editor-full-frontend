/**
 * useClipDrag Hook
 * Handles drag state management for trim and move operations on clips.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Track } from '../../../../../core/Track';

export interface ClipDragState {
  type: 'trim-start' | 'trim-end' | 'move';
  initialTimeUs: number;
  initialMouseX: number;
  initialMouseY: number;
  previewStartUs?: number;
  targetTrackId?: string;
}

export interface UseClipDragOptions {
  clipId: string;
  clipStartUs: number;
  clipDurationUs: number;
  linkedClipId?: string;
  trackId: string;
  trackType: 'video' | 'audio';
  pixelToTime: (pixel: number) => number;
  onMove?: (clipId: string, newStartUs: number) => void;
  onMoveToTrack?: (clipId: string, trackId: string, newStartUs: number) => void;
  onTrimStart?: (clipId: string, newStartUs: number) => void;
  onTrimEnd?: (clipId: string, newEndUs: number) => void;
  applySnap: (timeUs: number, durationUs: number, clipId: string) => { snappedTimeUs: number; snappedTo: { timeUs: number } | null };
  setActiveSnapLine: (timeUs: number | null) => void;
  setDropTargetTrackId: (trackId: string | null) => void;
  allTracks: readonly Track[];
  onDragPreview?: (clipId: string, previewStartUs: number | null, linkedClipId?: string, delta?: number) => void;
}

export function useClipDrag(options: UseClipDragOptions) {
  const {
    clipId,
    clipStartUs,
    clipDurationUs,
    linkedClipId,
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
    onDragPreview,
  } = options;

  const [dragState, setDragState] = useState<ClipDragState | null>(null);
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
      initialTimeUs: clipStartUs + clipDurationUs,
      initialMouseX: e.clientX,
      initialMouseY: e.clientY,
    });
  }, [clipStartUs, clipDurationUs]);

  // Body drag (move) start
  const startMoveDrag = useCallback((e: React.MouseEvent) => {
    didDragRef.current = false;
    setDragState({
      type: 'move',
      initialTimeUs: clipStartUs,
      initialMouseX: e.clientX,
      initialMouseY: e.clientY,
      previewStartUs: clipStartUs,
      targetTrackId: trackId,
    });
  }, [clipStartUs, trackId]);

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
        const newEndUs = dragState.initialTimeUs + deltaTimeUs;
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
        let targetTrackType: 'video' | 'audio' | null = null;

        for (const el of trackElements) {
          const rect = el.getBoundingClientRect();
          if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
            targetTrackId = el.getAttribute('data-track-id') || trackId;
            targetTrackType = el.getAttribute('data-track-type') as 'video' | 'audio';
            break;
          }
        }

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

        // Notify parent of drag preview
        const delta = newStartUs - clipStartUs;
        onDragPreview?.(clipId, newStartUs, linkedClipId, delta);
      }
    };

    const handleMouseUp = () => {
      if (dragState.type === 'move') {
        setActiveSnapLine(null);
        setDropTargetTrackId(null);
        onDragPreview?.(clipId, null);

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
    linkedClipId,
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
    onDragPreview,
  ]);

  return {
    dragState,
    didDragRef,
    handleTrimStartMouseDown,
    handleTrimEndMouseDown,
    startMoveDrag,
    isMoving: dragState?.type === 'move',
    isTrimming: dragState?.type === 'trim-start' || dragState?.type === 'trim-end',
  };
}
