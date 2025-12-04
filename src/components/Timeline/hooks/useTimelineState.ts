/**
 * useTimelineState Hook
 * Manages local state for the Timeline component.
 */

import { useState, useCallback, useEffect } from 'react';
import type { Track } from '../../../core/Track';

export interface TrackHeaderMenu {
  trackId: string;
  x: number;
  y: number;
}

export interface TimelineState {
  activeSnapLine: number | null;
  setActiveSnapLine: React.Dispatch<React.SetStateAction<number | null>>;
  dropTargetTrackId: string | null;
  setDropTargetTrackId: React.Dispatch<React.SetStateAction<string | null>>;
  containerWidth: number;
  setContainerWidth: React.Dispatch<React.SetStateAction<number>>;
  scrollLeft: number;
  setScrollLeft: React.Dispatch<React.SetStateAction<number>>;
  hoveredLinkedClipId: string | null;
  setHoveredLinkedClipId: React.Dispatch<React.SetStateAction<string | null>>;
  dragPreviewMap: Map<string, number>;
  setDragPreviewMap: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  addTrackDropdownOpen: boolean;
  setAddTrackDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  trackHeaderMenu: TrackHeaderMenu | null;
  setTrackHeaderMenu: React.Dispatch<React.SetStateAction<TrackHeaderMenu | null>>;
  activeTrackId: string | null;
  setActiveTrackId: React.Dispatch<React.SetStateAction<string | null>>;
  handleDragPreview: (
    clipId: string,
    previewStartUs: number | null,
    linkedClipId?: string,
    delta?: number
  ) => void;
}

export function useTimelineState(tracks: readonly Track[]): TimelineState {
  const [activeSnapLine, setActiveSnapLine] = useState<number | null>(null);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hoveredLinkedClipId, setHoveredLinkedClipId] = useState<string | null>(null);
  const [dragPreviewMap, setDragPreviewMap] = useState<Map<string, number>>(new Map());
  const [addTrackDropdownOpen, setAddTrackDropdownOpen] = useState(false);
  const [trackHeaderMenu, setTrackHeaderMenu] = useState<TrackHeaderMenu | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);

  // Handle drag preview updates
  const handleDragPreview = useCallback((
    clipId: string,
    previewStartUs: number | null,
    linkedClipId?: string,
    delta?: number
  ) => {
    if (previewStartUs === null) {
      setDragPreviewMap(new Map());
    } else {
      const newMap = new Map<string, number>();
      newMap.set(clipId, previewStartUs);

      if (linkedClipId && delta !== undefined) {
        for (const track of tracks) {
          const linkedClip = track.clips.find(c => c.id === linkedClipId);
          if (linkedClip) {
            newMap.set(linkedClipId, linkedClip.startUs + delta);
            break;
          }
        }
      }

      setDragPreviewMap(newMap);
    }
  }, [tracks]);

  // Close track header menu when clicking elsewhere
  useEffect(() => {
    if (!trackHeaderMenu) return;
    const handleClickOutside = () => setTrackHeaderMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [trackHeaderMenu]);

  return {
    activeSnapLine,
    setActiveSnapLine,
    dropTargetTrackId,
    setDropTargetTrackId,
    containerWidth,
    setContainerWidth,
    scrollLeft,
    setScrollLeft,
    hoveredLinkedClipId,
    setHoveredLinkedClipId,
    dragPreviewMap,
    setDragPreviewMap,
    addTrackDropdownOpen,
    setAddTrackDropdownOpen,
    trackHeaderMenu,
    setTrackHeaderMenu,
    activeTrackId,
    setActiveTrackId,
    handleDragPreview,
  };
}
