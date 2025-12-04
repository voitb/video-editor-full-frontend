/**
 * Sidebar Types
 * Type definitions for the tabbed sidebar component.
 */

import type { Source } from '../../core/Source';
import type { Track } from '../../core/Track';
import type { SubtitleClip } from '../../core/SubtitleClip';
import type { OverlayClip } from '../../core/OverlayClip';
import type { TrackType } from '../../core/types';

/** Tab type */
export type SidebarTab = 'media' | 'subtitles' | 'overlays';

/** Data type for drag-and-drop */
export const DRAG_DATA_TYPE = 'application/x-video-editor-source';

export interface TabbedSidebarProps {
  /** Active tab */
  activeTab: SidebarTab;
  /** Callback when tab changes */
  onTabChange: (tab: SidebarTab) => void;

  // Media tab props
  sources: ReadonlyMap<string, Source>;
  onLoadHls: (url: string) => Promise<void>;
  onLoadFile?: (file: File) => Promise<void>;
  isLoading: boolean;
  loadingProgress: number;

  // Subtitles tab props
  tracks: readonly Track[];
  selectedClipId?: string;
  currentTimeUs: number;
  onSeek?: (timeUs: number) => void;
  onSubtitleClipUpdate?: (clipId: string, clip: SubtitleClip) => void;
  onAddSubtitleClip?: (trackId: string, clip: SubtitleClip) => void;
  onSubtitleClipSelect?: (clipId: string, trackId: string) => void;

  // Overlays tab props
  onOverlayClipUpdate?: (clipId: string, clip: OverlayClip) => void;
  onAddOverlayClip?: (trackId: string, clip: OverlayClip) => void;
  onOverlayClipSelect?: (clipId: string, trackId: string) => void;

  // Common
  onRefresh?: () => void;

  // Track creation
  onTrackAdd?: (type: TrackType) => void;
}

export interface TabBarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

export const SIDEBAR_WIDTH = 320;
