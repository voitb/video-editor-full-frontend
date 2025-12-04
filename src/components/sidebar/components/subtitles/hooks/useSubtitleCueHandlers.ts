/**
 * useSubtitleCueHandlers Hook
 * Handlers for adding, updating, and deleting subtitle cues.
 */

import { useCallback } from 'react';
import type { SubtitleClip } from '../../../../../core/SubtitleClip';
import type { SubtitleCue, SubtitleStyle } from '../../../../../core/types';
import { SUBTITLE } from '../../../../../constants';

export interface SelectedSubtitleClip {
  clip: SubtitleClip;
}

export interface UseSubtitleCueHandlersOptions {
  selectedClip: SelectedSubtitleClip | null;
  currentTimeUs: number;
  onSubtitleClipUpdate?: (clipId: string, clip: SubtitleClip) => void;
  onRefresh?: () => void;
  setEditingCueId: (id: string | null) => void;
}

export function useSubtitleCueHandlers(options: UseSubtitleCueHandlersOptions) {
  const {
    selectedClip,
    currentTimeUs,
    onSubtitleClipUpdate,
    onRefresh,
    setEditingCueId,
  } = options;

  const handleAddCue = useCallback(() => {
    if (!selectedClip) return;
    const { clip } = selectedClip;
    const relativeTime = Math.max(0, currentTimeUs - clip.startUs);

    const newCue = clip.addCue({
      startUs: relativeTime,
      endUs: relativeTime + SUBTITLE.DEFAULT_CUE_DURATION_US,
      text: 'New subtitle',
    });

    setEditingCueId(newCue.id);
    onSubtitleClipUpdate?.(clip.id, clip);
    onRefresh?.();
  }, [selectedClip, currentTimeUs, onSubtitleClipUpdate, onRefresh, setEditingCueId]);

  const handleUpdateCue = useCallback(
    (cueId: string, updates: Partial<Omit<SubtitleCue, 'id'>>) => {
      if (!selectedClip) return;
      const { clip } = selectedClip;
      clip.updateCue(cueId, updates);
      onSubtitleClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedClip, onSubtitleClipUpdate, onRefresh]
  );

  const handleDeleteCue = useCallback(
    (cueId: string) => {
      if (!selectedClip) return;
      const { clip } = selectedClip;
      clip.removeCue(cueId);
      onSubtitleClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedClip, onSubtitleClipUpdate, onRefresh]
  );

  const handleStyleUpdate = useCallback(
    (updates: Partial<SubtitleStyle>) => {
      if (!selectedClip) return;
      const { clip } = selectedClip;
      clip.style = { ...clip.style, ...updates };
      onSubtitleClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedClip, onSubtitleClipUpdate, onRefresh]
  );

  return {
    handleAddCue,
    handleUpdateCue,
    handleDeleteCue,
    handleStyleUpdate,
  };
}
