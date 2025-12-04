/**
 * Overlay Operations Callbacks Hook
 * Handles overlay clip add, edit, trim, move, duplicate, split operations.
 */

import { useCallback } from 'react';
import type { OverlayClip } from '../../../core/OverlayClip';
import type { OverlayPosition } from '../../../core/types';
import type { Track } from '../../../core/Track';
import type { OverlayCallbackDeps } from './types';

export interface OverlayCallbacks {
  handleAddOverlayClip: (trackId: string, clip: OverlayClip) => void;
  handleAddOverlayClipAtPosition: (trackId: string, startUs: number) => Promise<void>;
  handleOverlayClipUpdate: (clipId: string, clip: OverlayClip) => void;
  handleOverlayPositionChange: (clipId: string, position: OverlayPosition) => void;
  handleOverlayTrimStart: (clipId: string, newStartUs: number) => void;
  handleOverlayTrimEnd: (clipId: string, newEndUs: number) => void;
  handleOverlayMove: (clipId: string, newStartUs: number) => void;
  handleOverlayMoveToTrack: (clipId: string, targetTrackId: string, newStartUs: number) => boolean;
  handleOverlayDuplicate: (clipId: string) => void;
  handleOverlaySplit: (clipId: string, timeUs: number) => void;
  handleOverlayClipSelect: (clipId: string, trackId: string) => void;
  handleOverlayEdit: (clipId: string) => void;
}

export function useOverlayCallbacks(deps: OverlayCallbackDeps): OverlayCallbacks {
  const {
    composition,
    setSelectedClipId,
    setActiveTab,
    refresh,
    notifyCompositionChanged,
  } = deps;

  const handleAddOverlayClip = useCallback((trackId: string, clip: OverlayClip) => {
    const track = composition.getTrack(trackId);
    if (!track || track.type !== 'overlay') return;
    track.addClip(clip);
    refresh();
    notifyCompositionChanged();
    setSelectedClipId(clip.id);
    setActiveTab('overlays');
  }, [composition, refresh, notifyCompositionChanged, setSelectedClipId, setActiveTab]);

  const handleAddOverlayClipAtPosition = useCallback(
    async (trackId: string, startUs: number) => {
      const track = composition.getTrack(trackId);
      if (!track || track.type !== 'overlay') return;

      const { OverlayClip } = await import('../../../core/OverlayClip');
      const newClip = OverlayClip.createText(startUs, 'New Overlay');
      track.addClip(newClip);
      refresh();
      notifyCompositionChanged();
      setSelectedClipId(newClip.id);
      setActiveTab('overlays');
    },
    [composition, refresh, notifyCompositionChanged, setSelectedClipId, setActiveTab]
  );

  const handleOverlayClipUpdate = useCallback((_clipId: string, _clip: OverlayClip) => {
    refresh();
    notifyCompositionChanged();
  }, [refresh, notifyCompositionChanged]);

  const handleOverlayPositionChange = useCallback((clipId: string, position: OverlayPosition) => {
    for (const track of composition.tracks) {
      if (track.type !== 'overlay') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'setPosition' in clip) {
          (clip as OverlayClip).setPosition(position);
          refresh();
          notifyCompositionChanged();
          return;
        }
      }
    }
  }, [composition, refresh, notifyCompositionChanged]);

  const handleOverlayTrimStart = useCallback((clipId: string, newStartUs: number) => {
    for (const track of composition.tracks) {
      if (track.type !== 'overlay') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'trimStart' in clip) {
          (clip as OverlayClip).trimStart(newStartUs);
          refresh();
          notifyCompositionChanged();
          return;
        }
      }
    }
  }, [composition, refresh, notifyCompositionChanged]);

  const handleOverlayTrimEnd = useCallback((clipId: string, newEndUs: number) => {
    for (const track of composition.tracks) {
      if (track.type !== 'overlay') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'trimEnd' in clip) {
          (clip as OverlayClip).trimEnd(newEndUs);
          refresh();
          notifyCompositionChanged();
          return;
        }
      }
    }
  }, [composition, refresh, notifyCompositionChanged]);

  const handleOverlayMove = useCallback((clipId: string, newStartUs: number) => {
    for (const track of composition.tracks) {
      if (track.type !== 'overlay') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'moveTo' in clip) {
          (clip as OverlayClip).moveTo(newStartUs);
          refresh();
          notifyCompositionChanged();
          return;
        }
      }
    }
  }, [composition, refresh, notifyCompositionChanged]);

  const handleOverlayMoveToTrack = useCallback((clipId: string, targetTrackId: string, newStartUs: number) => {
    let sourceTrack: Track | null = null;
    let clipToMove: OverlayClip | null = null;

    for (const track of composition.tracks) {
      if (track.type !== 'overlay') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'moveTo' in clip) {
          sourceTrack = track;
          clipToMove = clip as OverlayClip;
          break;
        }
      }
      if (clipToMove) break;
    }

    if (!sourceTrack || !clipToMove) return false;

    const targetTrack = composition.getTrack(targetTrackId);
    if (!targetTrack || targetTrack.type !== 'overlay') return false;

    sourceTrack.removeClip(clipId);
    clipToMove.moveTo(newStartUs);
    targetTrack.addClip(clipToMove);

    refresh();
    notifyCompositionChanged();
    return true;
  }, [composition, refresh, notifyCompositionChanged]);

  const handleOverlayDuplicate = useCallback((clipId: string) => {
    for (const track of composition.tracks) {
      if (track.type !== 'overlay') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'clone' in clip) {
          const originalClip = clip as OverlayClip;
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

  const handleOverlaySplit = useCallback((clipId: string, timeUs: number) => {
    for (const track of composition.tracks) {
      if (track.type !== 'overlay') continue;
      for (const clip of track.clips) {
        if (clip.id === clipId && 'splitAt' in clip) {
          const originalClip = clip as OverlayClip;
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

  const handleOverlayClipSelect = useCallback((clipId: string, _trackId: string) => {
    setSelectedClipId(clipId);
    setActiveTab('overlays');
  }, [setSelectedClipId, setActiveTab]);

  const handleOverlayEdit = useCallback((clipId: string) => {
    setSelectedClipId(clipId);
    setActiveTab('overlays');
  }, [setSelectedClipId, setActiveTab]);

  return {
    handleAddOverlayClip,
    handleAddOverlayClipAtPosition,
    handleOverlayClipUpdate,
    handleOverlayPositionChange,
    handleOverlayTrimStart,
    handleOverlayTrimEnd,
    handleOverlayMove,
    handleOverlayMoveToTrack,
    handleOverlayDuplicate,
    handleOverlaySplit,
    handleOverlayClipSelect,
    handleOverlayEdit,
  };
}
