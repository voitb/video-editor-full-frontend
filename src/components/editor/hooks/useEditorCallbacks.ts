/**
 * Editor Callbacks Hook
 * Orchestrates all editor event handlers using extracted sub-hooks.
 */

import type { Composition } from '../../../core/Composition';
import type { Track } from '../../../core/Track';
import type { OverlayClip } from '../../../core/OverlayClip';
import type { SubtitleClip } from '../../../core/SubtitleClip';
import type { OverlayPosition } from '../../../core/types';
import type { SidebarTab } from '../../sidebar';
import { useSourceCallbacks } from './useSourceCallbacks';
import { useClipCallbacks } from './useClipCallbacks';
import { useTrackCallbacks } from './useTrackCallbacks';
import { useSubtitleCallbacks } from './useSubtitleCallbacks';
import { useOverlayCallbacks } from './useOverlayCallbacks';

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

  // Source callbacks
  const { handleLoadHls, handleLoadFile } = useSourceCallbacks({
    loadHlsSource,
    loadFileSource,
    resetViewport,
    setIsLoading,
  });

  // Clip callbacks
  const {
    handleExternalDropToTrack,
    handleClipSelect,
    handleSeek,
    handleClipTrimStart,
    handleClipTrimEnd,
    handleClipMove,
    handleClipMoveToTrack,
    handleClipUnlink,
    handleClipDelete,
  } = useClipCallbacks({
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
  });

  // Track callbacks
  const {
    handleTrackAdd,
    handleTrackRemove,
    handleTrackRename,
    handleTrackColorChange,
    handleTrackInsert,
    handleTrackReorder,
  } = useTrackCallbacks({
    composition,
    tracks,
    createTrack,
    removeTrack,
    refresh,
    notifyCompositionChanged,
  });

  // Subtitle callbacks
  const {
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
  } = useSubtitleCallbacks({
    composition,
    tracks,
    setSelectedClipId,
    refresh,
    notifyCompositionChanged,
  });

  // Overlay callbacks
  const {
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
  } = useOverlayCallbacks({
    composition,
    tracks,
    setSelectedClipId,
    setActiveTab,
    refresh,
    notifyCompositionChanged,
  });

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
