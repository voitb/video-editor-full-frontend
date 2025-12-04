/**
 * Clip Operations Callbacks Hook
 * Handles clip selection, move, trim, delete, and external drop operations.
 */

import { useCallback } from 'react';
import type { ClipCallbackDeps } from './types';

export interface ClipCallbacks {
  handleExternalDropToTrack: (sourceId: string, targetTrackId: string, startTimeUs: number) => void;
  handleClipSelect: (clipId: string) => void;
  handleSeek: (timeUs: number) => void;
  handleClipTrimStart: (clipId: string, newStartUs: number) => void;
  handleClipTrimEnd: (clipId: string, newEndUs: number) => void;
  handleClipMove: (clipId: string, newStartUs: number) => boolean;
  handleClipMoveToTrack: (clipId: string, targetTrackId: string, newStartUs: number) => boolean;
  handleClipUnlink: (clipId: string) => void;
  handleClipDelete: (clipId: string) => void;
}

export function useClipCallbacks(deps: ClipCallbackDeps): ClipCallbacks {
  const {
    composition,
    tracks,
    selectedClipId,
    linkedSelection,
    moveClipWithLinked,
    moveClipToTrack,
    unlinkClip,
    seek,
    setSelectedClipId,
    addVideoClipWithAudio,
    refresh,
    notifyCompositionChanged,
  } = deps;

  // Helper to get source duration for trimming
  const getSourceDuration = useCallback((sourceId: string): number => {
    const source = composition.getSource(sourceId);
    return source?.durationUs ?? Infinity;
  }, [composition]);

  const handleExternalDropToTrack = useCallback((
    sourceId: string,
    targetTrackId: string,
    startTimeUs: number
  ) => {
    const source = composition.getSource(sourceId);
    const track = tracks.find(t => t.id === targetTrackId);
    if (!source || !track) return;

    const isAudioOnlySource = source.isAudioOnly;
    const fileName = 'fileName' in source && typeof source.fileName === 'string'
      ? source.fileName
      : undefined;

    if (isAudioOnlySource) {
      if (track.type === 'audio') {
        composition.addClipToTrack(targetTrackId, {
          sourceId,
          startUs: startTimeUs,
          trimIn: 0,
          trimOut: source.durationUs,
          label: fileName || 'Audio',
          volume: 1,
        });
        refresh();
      } else {
        console.warn('Cannot drop audio-only source on video track');
        return;
      }
    } else if (track.type === 'video') {
      addVideoClipWithAudio(targetTrackId, {
        sourceId,
        startUs: startTimeUs,
        trimIn: 0,
        trimOut: source.durationUs,
        label: fileName || 'Video',
      });
    } else {
      composition.addClipToTrack(targetTrackId, {
        sourceId,
        startUs: startTimeUs,
        trimIn: 0,
        trimOut: source.durationUs,
        label: fileName ? `Audio from ${fileName}` : 'Audio',
        volume: 1,
      });
      refresh();
    }

    notifyCompositionChanged();
  }, [composition, tracks, addVideoClipWithAudio, refresh, notifyCompositionChanged]);

  const handleClipSelect = useCallback((clipId: string) => {
    setSelectedClipId(clipId);
  }, [setSelectedClipId]);

  const handleSeek = useCallback((timeUs: number) => {
    seek(timeUs);
  }, [seek]);

  const handleClipTrimStart = useCallback((clipId: string, newStartUs: number) => {
    composition.trimStartWithLinked(clipId, newStartUs, getSourceDuration);
    refresh();
    notifyCompositionChanged();
  }, [composition, getSourceDuration, refresh, notifyCompositionChanged]);

  const handleClipTrimEnd = useCallback((clipId: string, newEndUs: number) => {
    composition.trimEndWithLinked(clipId, newEndUs, getSourceDuration);
    refresh();
    notifyCompositionChanged();
  }, [composition, getSourceDuration, refresh, notifyCompositionChanged]);

  const handleClipMove = useCallback((clipId: string, newStartUs: number): boolean => {
    const success = moveClipWithLinked(clipId, newStartUs);
    if (success) {
      notifyCompositionChanged();
    }
    return success;
  }, [moveClipWithLinked, notifyCompositionChanged]);

  const handleClipMoveToTrack = useCallback((clipId: string, targetTrackId: string, newStartUs: number): boolean => {
    const success = moveClipToTrack(clipId, targetTrackId, newStartUs);
    if (success) {
      notifyCompositionChanged();
    }
    return success;
  }, [moveClipToTrack, notifyCompositionChanged]);

  const handleClipUnlink = useCallback((clipId: string) => {
    unlinkClip(clipId);
  }, [unlinkClip]);

  const handleClipDelete = useCallback((clipId: string) => {
    if (linkedSelection) {
      composition.removeClipWithLinked(clipId);
    } else {
      composition.removeClip(clipId);
    }
    if (selectedClipId === clipId) {
      setSelectedClipId(undefined);
    }
    refresh();
    notifyCompositionChanged();
  }, [composition, linkedSelection, selectedClipId, refresh, notifyCompositionChanged, setSelectedClipId]);

  return {
    handleExternalDropToTrack,
    handleClipSelect,
    handleSeek,
    handleClipTrimStart,
    handleClipTrimEnd,
    handleClipMove,
    handleClipMoveToTrack,
    handleClipUnlink,
    handleClipDelete,
  };
}
