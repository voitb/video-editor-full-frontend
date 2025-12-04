/**
 * Shared types for editor callback hooks
 */

import type { Composition } from '../../../core/Composition';
import type { Track } from '../../../core/Track';
import type { SidebarTab } from '../../sidebar';

/**
 * Common dependencies shared across all callback hooks
 */
export interface CallbackDependencies {
  composition: Composition;
  tracks: Track[];
  refresh: () => void;
  notifyCompositionChanged: () => void;
}

/**
 * Dependencies for source loading callbacks
 */
export interface SourceCallbackDeps {
  loadHlsSource: (url: string) => Promise<{ durationUs: number }>;
  loadFileSource: (file: File) => Promise<{ durationUs: number }>;
  resetViewport: (durationUs: number) => void;
  setIsLoading: (loading: boolean) => void;
}

/**
 * Dependencies for clip callbacks
 */
export interface ClipCallbackDeps extends CallbackDependencies {
  selectedClipId: string | undefined;
  linkedSelection: boolean;
  moveClipWithLinked: (clipId: string, newStartUs: number) => boolean;
  moveClipToTrack: (clipId: string, targetTrackId: string, newStartUs: number) => boolean;
  unlinkClip: (clipId: string) => void;
  seek: (timeUs: number) => void;
  setSelectedClipId: (clipId: string | undefined) => void;
  addVideoClipWithAudio: (trackId: string, options: {
    sourceId: string;
    startUs: number;
    trimIn: number;
    trimOut: number;
    label: string;
  }) => void;
}

/**
 * Dependencies for track callbacks
 */
export interface TrackCallbackDeps extends CallbackDependencies {
  createTrack: (options: { type: string; label: string; order?: number }) => Track;
  removeTrack: (trackId: string) => void;
}

/**
 * Dependencies for subtitle callbacks
 */
export interface SubtitleCallbackDeps extends CallbackDependencies {
  setSelectedClipId: (clipId: string | undefined) => void;
}

/**
 * Dependencies for overlay callbacks
 */
export interface OverlayCallbackDeps extends CallbackDependencies {
  setSelectedClipId: (clipId: string | undefined) => void;
  setActiveTab: (tab: SidebarTab) => void;
}
