/**
 * Track Operations Callbacks Hook
 * Handles track add, remove, rename, reorder, and color change operations.
 */

import { useCallback } from 'react';
import type { Track } from '../../../core/Track';
import type { TrackCallbackDeps } from './types';

export interface TrackCallbacks {
  handleTrackAdd: (type: 'video' | 'audio' | 'subtitle' | 'overlay') => void;
  handleTrackRemove: (trackId: string) => void;
  handleTrackRename: (trackId: string, newLabel: string) => void;
  handleTrackColorChange: (trackId: string, color: string | undefined) => void;
  handleTrackInsert: (type: 'video' | 'audio' | 'subtitle' | 'overlay', referenceTrackId: string, position: 'above' | 'below') => Track | undefined;
  handleTrackReorder: (trackId: string, newOrder: number) => void;
}

function getTrackLabel(type: string, trackCount: number): string {
  switch (type) {
    case 'video': return `Video ${trackCount}`;
    case 'audio': return `Audio ${trackCount}`;
    case 'overlay': return `Overlay ${trackCount}`;
    case 'subtitle': return `Subtitles ${trackCount}`;
    default: return `Track ${trackCount}`;
  }
}

export function useTrackCallbacks(deps: TrackCallbackDeps): TrackCallbacks {
  const {
    composition,
    tracks,
    createTrack,
    removeTrack,
    refresh,
    notifyCompositionChanged,
  } = deps;

  const handleTrackAdd = useCallback((type: 'video' | 'audio' | 'subtitle' | 'overlay') => {
    const trackCount = tracks.filter(t => t.type === type).length + 1;
    const label = getTrackLabel(type, trackCount);
    createTrack({ type, label });
  }, [createTrack, tracks]);

  const handleTrackRemove = useCallback((trackId: string) => {
    removeTrack(trackId);
    notifyCompositionChanged();
  }, [removeTrack, notifyCompositionChanged]);

  const handleTrackRename = useCallback((trackId: string, newLabel: string) => {
    const track = composition.getTrack(trackId);
    if (track) {
      track.setLabel(newLabel);
      refresh();
      notifyCompositionChanged();
    }
  }, [composition, refresh, notifyCompositionChanged]);

  const handleTrackColorChange = useCallback((trackId: string, color: string | undefined) => {
    const track = composition.getTrack(trackId);
    if (track) {
      track.setColor(color);
      refresh();
      notifyCompositionChanged();
    }
  }, [composition, refresh, notifyCompositionChanged]);

  const handleTrackInsert = useCallback((
    type: 'video' | 'audio' | 'subtitle' | 'overlay',
    referenceTrackId: string,
    position: 'above' | 'below'
  ) => {
    const trackCount = tracks.filter(t => t.type === type).length + 1;
    const label = getTrackLabel(type, trackCount);

    const refTrackIndex = tracks.findIndex(t => t.id === referenceTrackId);
    let order = tracks.length;

    if (refTrackIndex !== -1) {
      order = position === 'above' ? refTrackIndex : refTrackIndex + 1;
    }

    const newTrack = createTrack({ type, label, order });
    return newTrack;
  }, [createTrack, tracks]);

  const handleTrackReorder = useCallback((trackId: string, newOrder: number) => {
    composition.reorderTrack(trackId, newOrder);
    refresh();
    notifyCompositionChanged();
  }, [composition, refresh, notifyCompositionChanged]);

  return {
    handleTrackAdd,
    handleTrackRemove,
    handleTrackRename,
    handleTrackColorChange,
    handleTrackInsert,
    handleTrackReorder,
  };
}
