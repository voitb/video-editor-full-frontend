/**
 * Editor Callbacks Hook
 * Extracts all editor event handlers from EditorApp.
 */

import { useCallback } from 'react';
import type { Composition } from '../../../core/Composition';
import type { Track } from '../../../core/Track';
import type { OverlayClip } from '../../../core/OverlayClip';
import type { SubtitleClip } from '../../../core/SubtitleClip';
import type { OverlayPosition } from '../../../core/types';
import type { SidebarTab } from '../../sidebar';

export interface UseEditorCallbacksParams {
  composition: Composition;
  tracks: Track[];
  currentTimeUs: number;
  selectedClipId: string | undefined;
  linkedSelection: boolean;
  // Composition actions
  addVideoClipWithAudio: (trackId: string, options: {
    sourceId: string;
    startUs: number;
    trimIn: number;
    trimOut: number;
    label: string;
  }) => void;
  moveClipWithLinked: (clipId: string, newStartUs: number) => boolean;
  moveClipToTrack: (clipId: string, targetTrackId: string, newStartUs: number) => boolean;
  unlinkClip: (clipId: string) => void;
  createTrack: (options: { type: string; label: string; order?: number }) => Track;
  removeTrack: (trackId: string) => void;
  refresh: () => void;
  // Engine actions
  loadHlsSource: (url: string) => Promise<{ durationUs: number }>;
  loadFileSource: (file: File) => Promise<{ durationUs: number }>;
  seek: (timeUs: number) => void;
  notifyCompositionChanged: () => void;
  // Timeline actions
  resetViewport: (durationUs: number) => void;
  // State setters
  setIsLoading: (loading: boolean) => void;
  setSelectedClipId: (clipId: string | undefined) => void;
  setActiveTab: (tab: SidebarTab) => void;
  // Export range actions
  setInPoint: (timeUs: number) => void;
  setOutPoint: (timeUs: number) => void;
  clearInPoint: () => void;
  clearOutPoint: () => void;
}

export interface EditorCallbacks {
  // Source loading
  handleLoadHls: (url: string) => Promise<void>;
  handleLoadFile: (file: File) => Promise<void>;
  // External drop
  handleExternalDropToTrack: (sourceId: string, targetTrackId: string, startTimeUs: number) => void;
  // Clip operations
  handleClipSelect: (clipId: string) => void;
  handleSeek: (timeUs: number) => void;
  handleClipTrimStart: (clipId: string, newStartUs: number) => void;
  handleClipTrimEnd: (clipId: string, newEndUs: number) => void;
  handleClipMove: (clipId: string, newStartUs: number) => boolean;
  handleClipMoveToTrack: (clipId: string, targetTrackId: string, newStartUs: number) => boolean;
  handleClipUnlink: (clipId: string) => void;
  handleClipDelete: (clipId: string) => void;
  // Track operations
  handleTrackAdd: (type: 'video' | 'audio' | 'subtitle' | 'overlay') => void;
  handleTrackRemove: (trackId: string) => void;
  handleTrackRename: (trackId: string, newLabel: string) => void;
  handleTrackColorChange: (trackId: string, color: string | undefined) => void;
  handleTrackInsert: (type: 'video' | 'audio' | 'subtitle' | 'overlay', referenceTrackId: string, position: 'above' | 'below') => Track | undefined;
  handleTrackReorder: (trackId: string, newOrder: number) => void;
  // Subtitle operations
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
  // Overlay operations
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

export function useEditorCallbacks(params: UseEditorCallbacksParams): EditorCallbacks {
  const {
    composition,
    tracks,
    selectedClipId,
    linkedSelection,
    addVideoClipWithAudio,
    moveClipWithLinked,
    moveClipToTrack,
    unlinkClip,
    createTrack,
    removeTrack,
    refresh,
    loadHlsSource,
    loadFileSource,
    seek,
    notifyCompositionChanged,
    resetViewport,
    setIsLoading,
    setSelectedClipId,
    setActiveTab,
  } = params;

  // Helper to get source duration for trimming
  const getSourceDuration = useCallback((sourceId: string): number => {
    const source = composition.getSource(sourceId);
    return source?.durationUs ?? Infinity;
  }, [composition]);

  // ============================================================================
  // SOURCE LOADING
  // ============================================================================

  const handleLoadHls = useCallback(async (url: string) => {
    if (!url) return;
    setIsLoading(true);
    try {
      const source = await loadHlsSource(url);
      resetViewport(source.durationUs);
    } catch (err) {
      console.error('Failed to load HLS source:', err);
    } finally {
      setIsLoading(false);
    }
  }, [loadHlsSource, resetViewport, setIsLoading]);

  const handleLoadFile = useCallback(async (file: File) => {
    if (!file) return;
    setIsLoading(true);
    try {
      const source = await loadFileSource(file);
      resetViewport(source.durationUs);
    } catch (err) {
      console.error('Failed to load file source:', err);
    } finally {
      setIsLoading(false);
    }
  }, [loadFileSource, resetViewport, setIsLoading]);

  // ============================================================================
  // EXTERNAL DROP
  // ============================================================================

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

  // ============================================================================
  // CLIP OPERATIONS
  // ============================================================================

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

  // ============================================================================
  // TRACK OPERATIONS
  // ============================================================================

  const handleTrackAdd = useCallback((type: 'video' | 'audio' | 'subtitle' | 'overlay') => {
    const trackCount = tracks.filter(t => t.type === type).length + 1;
    const label = type === 'video'
      ? `Video ${trackCount}`
      : type === 'audio'
      ? `Audio ${trackCount}`
      : type === 'overlay'
      ? `Overlay ${trackCount}`
      : `Subtitles ${trackCount}`;
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
    const label = type === 'video'
      ? `Video ${trackCount}`
      : type === 'audio'
      ? `Audio ${trackCount}`
      : type === 'overlay'
      ? `Overlay ${trackCount}`
      : `Subtitles ${trackCount}`;

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

  // ============================================================================
  // SUBTITLE OPERATIONS
  // ============================================================================

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

  // ============================================================================
  // OVERLAY OPERATIONS
  // ============================================================================

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
    // Source loading
    handleLoadHls,
    handleLoadFile,
    // External drop
    handleExternalDropToTrack,
    // Clip operations
    handleClipSelect,
    handleSeek,
    handleClipTrimStart,
    handleClipTrimEnd,
    handleClipMove,
    handleClipMoveToTrack,
    handleClipUnlink,
    handleClipDelete,
    // Track operations
    handleTrackAdd,
    handleTrackRemove,
    handleTrackRename,
    handleTrackColorChange,
    handleTrackInsert,
    handleTrackReorder,
    // Subtitle operations
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
    // Overlay operations
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
