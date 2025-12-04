/**
 * Cue Manager Hook
 * Handles CRUD operations for subtitle cues.
 */

import { useCallback } from 'react';
import type { SubtitleClip } from '../../../core/SubtitleClip';
import type { SubtitleCue, SubtitleStyle } from '../../../core/types';
import { SUBTITLE } from '../../../constants';

import type { Track } from '../../../core/Track';

interface SelectedClipInfo {
  clip: SubtitleClip;
  track: Track;
  trackId: string;
}

interface UseCueManagerOptions {
  selectedClip: SelectedClipInfo | null;
  currentTimeUs: number;
  onClipUpdate?: (clipId: string, clip: SubtitleClip) => void;
  onRefresh?: () => void;
}

interface UseCueManagerResult {
  handleAddCue: () => string | null;
  handleUpdateCue: (cueId: string, updates: Partial<Omit<SubtitleCue, 'id'>>) => void;
  handleDeleteCue: (cueId: string) => void;
  handleStyleUpdate: (updates: Partial<SubtitleStyle>) => void;
}

export function useCueManager({
  selectedClip,
  currentTimeUs,
  onClipUpdate,
  onRefresh,
}: UseCueManagerOptions): UseCueManagerResult {
  const handleAddCue = useCallback(() => {
    if (!selectedClip) return null;

    const { clip } = selectedClip;
    const relativeTime = Math.max(0, currentTimeUs - clip.startUs);

    const newCue = clip.addCue({
      startUs: relativeTime,
      endUs: relativeTime + SUBTITLE.DEFAULT_CUE_DURATION_US,
      text: 'New subtitle',
    });

    onClipUpdate?.(clip.id, clip);
    onRefresh?.();
    return newCue.id;
  }, [selectedClip, currentTimeUs, onClipUpdate, onRefresh]);

  const handleUpdateCue = useCallback(
    (cueId: string, updates: Partial<Omit<SubtitleCue, 'id'>>) => {
      if (!selectedClip) return;

      const { clip } = selectedClip;
      clip.updateCue(cueId, updates);
      onClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedClip, onClipUpdate, onRefresh]
  );

  const handleDeleteCue = useCallback(
    (cueId: string) => {
      if (!selectedClip) return;

      const { clip } = selectedClip;
      clip.removeCue(cueId);
      onClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedClip, onClipUpdate, onRefresh]
  );

  const handleStyleUpdate = useCallback(
    (updates: Partial<SubtitleStyle>) => {
      if (!selectedClip) return;

      const { clip } = selectedClip;
      clip.style = { ...clip.style, ...updates };
      onClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedClip, onClipUpdate, onRefresh]
  );

  return {
    handleAddCue,
    handleUpdateCue,
    handleDeleteCue,
    handleStyleUpdate,
  };
}
