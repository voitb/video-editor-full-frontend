/**
 * Subtitle Operations Callbacks Hook
 * Handles subtitle clip add, edit, trim, move, duplicate, split operations.
 */

import { useCallback } from 'react';
import type { SubtitleClip } from '../../../core/SubtitleClip';
import type { Track } from '../../../core/Track';
import type { SubtitleCallbackDeps } from './types';

export interface SubtitleCallbacks {
  handleAddSubtitleClip: (trackId: string, clip: SubtitleClip) => void;
  handleSubtitleClipUpdate: (clipId: string, clip: SubtitleClip) => void;
  handleAddSubtitleClipAtPosition: (trackId: string, startUs: number) => Promise<void>;
  handleSubtitleEdit: (clipId: string) => void;
  handleSubtitleTrimStart: (clipId: string, newStartUs: number) => void;
  handleSubtitleTrimEnd: (clipId: string, newEndUs: number) => void;
  handleSubtitleMove: (clipId: string, newStartUs: number) => void;
  handleSubtitleMoveToTrack: (clipId: string, targetTrackId: string, newStartUs: number) => boolean;
  handleSubtitleDuplicate: (clipId: string) => void;
  handleSubtitleSplit: (clipId: string, timeUs: number) => void;
  handleSubtitleAddCue: (clipId: string, timeUs: number) => void;
}

export function useSubtitleCallbacks(deps: SubtitleCallbackDeps): SubtitleCallbacks {
  const {
    composition,
    setSelectedClipId,
    refresh,
    notifyCompositionChanged,
  } = deps;

  const handleAddSubtitleClip = useCallback(
    (trackId: string, clip: SubtitleClip) => {
      const track = composition.getTrack(trackId);
      if (!track || track.type !== 'subtitle') return;
      track.addClip(clip);
      refresh();
      notifyCompositionChanged();
      setSelectedClipId(clip.id);
    },
    [composition, refresh, notifyCompositionChanged, setSelectedClipId]
  );

  const handleSubtitleClipUpdate = useCallback(
    (_clipId: string, _clip: SubtitleClip) => {
      refresh();
      notifyCompositionChanged();
    },
    [refresh, notifyCompositionChanged]
  );

  const handleAddSubtitleClipAtPosition = useCallback(
    async (trackId: string, startUs: number) => {
      const track = composition.getTrack(trackId);
      if (!track || track.type !== 'subtitle') return;

      const { SubtitleClip } = await import('../../../core/SubtitleClip');
      const newClip = SubtitleClip.createEmpty(startUs);
      track.addClip(newClip);
      refresh();
      notifyCompositionChanged();
      setSelectedClipId(newClip.id);
    },
    [composition, refresh, notifyCompositionChanged, setSelectedClipId]
  );

  const handleSubtitleEdit = useCallback((clipId: string) => {
    setSelectedClipId(clipId);
  }, [setSelectedClipId]);

  const handleSubtitleTrimStart = useCallback((clipId: string, newStartUs: number) => {
    for (const track of composition.tracks) {
      if (track.type !== 'subtitle') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'trimStart' in clip) {
          (clip as SubtitleClip).trimStart(newStartUs);
          refresh();
          notifyCompositionChanged();
          return;
        }
      }
    }
  }, [composition, refresh, notifyCompositionChanged]);

  const handleSubtitleTrimEnd = useCallback((clipId: string, newEndUs: number) => {
    for (const track of composition.tracks) {
      if (track.type !== 'subtitle') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'trimEnd' in clip) {
          (clip as SubtitleClip).trimEnd(newEndUs);
          refresh();
          notifyCompositionChanged();
          return;
        }
      }
    }
  }, [composition, refresh, notifyCompositionChanged]);

  const handleSubtitleMove = useCallback((clipId: string, newStartUs: number) => {
    for (const track of composition.tracks) {
      if (track.type !== 'subtitle') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'moveTo' in clip) {
          (clip as SubtitleClip).moveTo(newStartUs);
          refresh();
          notifyCompositionChanged();
          return;
        }
      }
    }
  }, [composition, refresh, notifyCompositionChanged]);

  const handleSubtitleMoveToTrack = useCallback((clipId: string, targetTrackId: string, newStartUs: number) => {
    let sourceTrack: Track | null = null;
    let clipToMove: SubtitleClip | null = null;

    for (const track of composition.tracks) {
      if (track.type !== 'subtitle') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'moveTo' in clip) {
          sourceTrack = track;
          clipToMove = clip as SubtitleClip;
          break;
        }
      }
      if (clipToMove) break;
    }

    if (!sourceTrack || !clipToMove) return false;

    const targetTrack = composition.getTrack(targetTrackId);
    if (!targetTrack || targetTrack.type !== 'subtitle') return false;

    sourceTrack.removeClip(clipId);
    clipToMove.moveTo(newStartUs);
    targetTrack.addClip(clipToMove);

    refresh();
    notifyCompositionChanged();
    return true;
  }, [composition, refresh, notifyCompositionChanged]);

  const handleSubtitleDuplicate = useCallback((clipId: string) => {
    for (const track of composition.tracks) {
      if (track.type !== 'subtitle') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'clone' in clip) {
          const originalClip = clip as SubtitleClip;
          const clonedClip = originalClip.clone();
          clonedClip.moveTo(originalClip.endUs);
          track.addClip(clonedClip);
          refresh();
          notifyCompositionChanged();
          setSelectedClipId(clonedClip.id);
          return;
        }
      }
    }
  }, [composition, refresh, notifyCompositionChanged, setSelectedClipId]);

  const handleSubtitleSplit = useCallback((clipId: string, timeUs: number) => {
    for (const track of composition.tracks) {
      if (track.type !== 'subtitle') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'splitAt' in clip) {
          const originalClip = clip as SubtitleClip;
          const secondClip = originalClip.splitAt(timeUs);
          if (secondClip) {
            track.addClip(secondClip);
            refresh();
            notifyCompositionChanged();
            setSelectedClipId(secondClip.id);
          }
          return;
        }
      }
    }
  }, [composition, refresh, notifyCompositionChanged, setSelectedClipId]);

  const handleSubtitleAddCue = useCallback((clipId: string, timeUs: number) => {
    for (const track of composition.tracks) {
      if (track.type !== 'subtitle') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'addCue' in clip) {
          const subtitleClip = clip as SubtitleClip;
          const clipRelativeTime = timeUs - subtitleClip.startUs + subtitleClip.trimStartUs;
          subtitleClip.addCue({
            startUs: clipRelativeTime,
            endUs: clipRelativeTime + 3_000_000,
            text: 'New subtitle',
          });
          refresh();
          notifyCompositionChanged();
          return;
        }
      }
    }
  }, [composition, refresh, notifyCompositionChanged]);

  return {
    handleAddSubtitleClip,
    handleSubtitleClipUpdate,
    handleAddSubtitleClipAtPosition,
    handleSubtitleEdit,
    handleSubtitleTrimStart,
    handleSubtitleTrimEnd,
    handleSubtitleMove,
    handleSubtitleMoveToTrack,
    handleSubtitleDuplicate,
    handleSubtitleSplit,
    handleSubtitleAddCue,
  };
}
