/**
 * Track UI State Hook
 * Manages track UI states (mute, solo, lock, height).
 */

import { useState, useCallback } from 'react';
import type { TrackUIState } from '../../core/types';
import { TIMELINE } from '../../constants';

interface UseTrackUIStateResult {
  trackStates: Record<string, TrackUIState>;
  setTrackMuted: (trackId: string, muted: boolean) => void;
  setTrackSolo: (trackId: string, solo: boolean) => void;
  setTrackLocked: (trackId: string, locked: boolean) => void;
  setTrackHeight: (trackId: string, height: number) => void;
  getTrackHeight: (trackId: string) => number;
  initTrackState: (trackId: string) => void;
}

const DEFAULT_TRACK_STATE: TrackUIState = {
  muted: false,
  solo: false,
  locked: false,
  height: TIMELINE.DEFAULT_TRACK_HEIGHT,
};

export function useTrackUIState(): UseTrackUIStateResult {
  const [trackStates, setTrackStates] = useState<Record<string, TrackUIState>>({});

  const initTrackState = useCallback((trackId: string) => {
    setTrackStates((prev) => {
      if (prev[trackId]) return prev;
      return { ...prev, [trackId]: { ...DEFAULT_TRACK_STATE } };
    });
  }, []);

  const setTrackMuted = useCallback((trackId: string, muted: boolean) => {
    setTrackStates((prev) => ({
      ...prev,
      [trackId]: { ...(prev[trackId] ?? DEFAULT_TRACK_STATE), muted },
    }));
  }, []);

  const setTrackSolo = useCallback((trackId: string, solo: boolean) => {
    setTrackStates((prev) => ({
      ...prev,
      [trackId]: { ...(prev[trackId] ?? DEFAULT_TRACK_STATE), solo },
    }));
  }, []);

  const setTrackLocked = useCallback((trackId: string, locked: boolean) => {
    setTrackStates((prev) => ({
      ...prev,
      [trackId]: { ...(prev[trackId] ?? DEFAULT_TRACK_STATE), locked },
    }));
  }, []);

  const setTrackHeight = useCallback((trackId: string, height: number) => {
    const clampedHeight = Math.max(
      TIMELINE.MIN_TRACK_HEIGHT,
      Math.min(height, TIMELINE.MAX_TRACK_HEIGHT)
    );
    setTrackStates((prev) => ({
      ...prev,
      [trackId]: { ...(prev[trackId] ?? DEFAULT_TRACK_STATE), height: clampedHeight },
    }));
  }, []);

  const getTrackHeight = useCallback(
    (trackId: string): number => {
      return trackStates[trackId]?.height ?? TIMELINE.DEFAULT_TRACK_HEIGHT;
    },
    [trackStates]
  );

  return {
    trackStates,
    setTrackMuted,
    setTrackSolo,
    setTrackLocked,
    setTrackHeight,
    getTrackHeight,
    initTrackState,
  };
}
