/**
 * Timeline Types
 * Type definitions for timeline components.
 */

import type { CSSProperties } from 'react';
import type { Track } from '../../core/Track';
import type { Clip } from '../../core/Clip';
import type { SubtitleClip } from '../../core/SubtitleClip';
import type { OverlayClip } from '../../core/OverlayClip';
import type { TimelineViewport, TrackUIState, TrackType } from '../../core/types';

// ============================================================================
// TIMELINE PROPS
// ============================================================================

export interface TimelineProps {
  /** Tracks to display */
  tracks: readonly Track[];
  /** Current playhead position (microseconds) */
  currentTimeUs: number;
  /** Total duration (microseconds) */
  durationUs: number;
  /** Viewport state (from useTimeline) */
  viewport: TimelineViewport;
  /** Callback when seeking */
  onSeek?: (timeUs: number) => void;
  /** Callback when a clip is selected */
  onClipSelect?: (clipId: string, trackId: string) => void;
  /** Callback when a clip is moved */
  onClipMove?: (clipId: string, newStartUs: number) => boolean;
  /** Callback when a clip is moved to a different track */
  onClipMoveToTrack?: (clipId: string, targetTrackId: string, newStartUs: number) => boolean;
  /** Callback when a clip is trimmed from start */
  onClipTrimStart?: (clipId: string, newStartUs: number) => void;
  /** Callback when a clip is trimmed from end */
  onClipTrimEnd?: (clipId: string, newEndUs: number) => void;
  /** Callback when adding a track */
  onTrackAdd?: (type: 'video' | 'audio' | 'subtitle' | 'overlay') => void;
  /** Callback when removing a track */
  onTrackRemove?: (trackId: string) => void;
  /** Currently selected clip ID */
  selectedClipId?: string;
  /** CSS class name */
  className?: string;
  /** CSS styles */
  style?: CSSProperties;
  /** Callback when zooming at position (positionRatio: 0-1, direction: 'in' | 'out') */
  onZoomAtPosition?: (positionRatio: number, direction: 'in' | 'out') => void;
  /** Callback to set zoom level directly (for slider) */
  onZoomChange?: (zoomLevel: number) => void;
  /** Callback when viewport scrolls (for scroll sync) */
  onViewportScroll?: (scrollLeft: number, containerWidth: number, totalWidth: number) => void;
  /** Get scroll position from viewport state */
  getScrollLeft?: (containerWidth: number, totalWidth: number) => number;
  /** Track UI states (mute/solo/lock/height) */
  trackStates?: Record<string, TrackUIState>;
  /** Callback when track is muted */
  onTrackMute?: (trackId: string, muted: boolean) => void;
  /** Callback when track is soloed */
  onTrackSolo?: (trackId: string, solo: boolean) => void;
  /** Callback when track is locked */
  onTrackLock?: (trackId: string, locked: boolean) => void;
  /** Callback when track height changes */
  onTrackResize?: (trackId: string, height: number) => void;
  /** Callback when track is renamed */
  onTrackRename?: (trackId: string, newLabel: string) => void;
  /** Callback when track color is changed */
  onTrackColorChange?: (trackId: string, color: string | undefined) => void;
  /** Callback when inserting a track relative to another */
  onTrackInsert?: (type: 'video' | 'audio' | 'subtitle' | 'overlay', referenceTrackId: string, position: 'above' | 'below') => void;
  /** Callback when a track is reordered via drag-and-drop */
  onTrackReorder?: (trackId: string, newOrder: number) => void;
  /** Callback when a clip is unlinked */
  onClipUnlink?: (clipId: string) => void;
  /** Callback when fit to view is requested */
  onFitToView?: () => void;
  /** Callback when an external source is dropped onto a track */
  onExternalDropToTrack?: (sourceId: string, trackId: string, startTimeUs: number) => void;
  /** Export in-point marker (microseconds) */
  inPointUs?: number;
  /** Export out-point marker (microseconds) */
  outPointUs?: number;
  /** Whether in-point has been explicitly set */
  hasInPoint?: boolean;
  /** Whether out-point has been explicitly set */
  hasOutPoint?: boolean;
  /** Callback when a clip is deleted */
  onClipDelete?: (clipId: string) => void;
  /** Whether linked selection mode is enabled (affects linked clip operations) */
  linkedSelection?: boolean;
  /** Callback when adding a subtitle clip at position */
  onAddSubtitleClip?: (trackId: string, startUs: number) => void;
  /** Callback when edit is requested on a subtitle clip */
  onSubtitleEdit?: (clipId: string) => void;
  /** Callback when a subtitle clip is trimmed from start */
  onSubtitleTrimStart?: (clipId: string, newStartUs: number) => void;
  /** Callback when a subtitle clip is trimmed from end */
  onSubtitleTrimEnd?: (clipId: string, newEndUs: number) => void;
  /** Callback when a subtitle clip is moved to a different track */
  onSubtitleMoveToTrack?: (clipId: string, targetTrackId: string, newStartUs: number) => void;
  /** Callback when a subtitle clip is moved (within same track) */
  onSubtitleMove?: (clipId: string, newStartUs: number) => void;
  /** Callback when a subtitle clip is duplicated */
  onSubtitleDuplicate?: (clipId: string) => void;
  /** Callback when a subtitle clip is split */
  onSubtitleSplit?: (clipId: string, timeUs: number) => void;
  /** Callback when a cue is added to a subtitle clip */
  onSubtitleAddCue?: (clipId: string, timeUs: number) => void;
  /** Callback when adding an overlay clip at position */
  onAddOverlayClip?: (trackId: string, startUs: number) => void;
  /** Callback when edit is requested on an overlay clip */
  onOverlayEdit?: (clipId: string) => void;
  /** Callback when an overlay clip is trimmed from start */
  onOverlayTrimStart?: (clipId: string, newStartUs: number) => void;
  /** Callback when an overlay clip is trimmed from end */
  onOverlayTrimEnd?: (clipId: string, newEndUs: number) => void;
  /** Callback when an overlay clip is moved to a different track */
  onOverlayMoveToTrack?: (clipId: string, targetTrackId: string, newStartUs: number) => void;
  /** Callback when an overlay clip is moved (within same track) */
  onOverlayMove?: (clipId: string, newStartUs: number) => void;
  /** Callback when an overlay clip is duplicated */
  onOverlayDuplicate?: (clipId: string) => void;
  /** Callback when an overlay clip is split */
  onOverlaySplit?: (clipId: string, timeUs: number) => void;
}

// ============================================================================
// SNAP TYPES
// ============================================================================

export interface SnapTarget {
  timeUs: number;
  type: 'playhead' | 'clip-start' | 'clip-end' | 'timeline-start';
  clipId?: string;
}

export interface SnapResult {
  snappedTimeUs: number;
  snappedTo: SnapTarget | null;
}

// ============================================================================
// GRID TYPES
// ============================================================================

export interface GridLine {
  timeUs: number;
  type: 'major' | 'minor' | 'sub-minor';
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface TrackHeaderProps {
  track: Track;
  height: number;
  isDropTarget: boolean;
  trackState?: TrackUIState;
  onRemove?: (trackId: string) => void;
  onMute?: (trackId: string, muted: boolean) => void;
  onSolo?: (trackId: string, solo: boolean) => void;
  onLock?: (trackId: string, locked: boolean) => void;
  onResize?: (trackId: string, height: number) => void;
  onRename?: (trackId: string, newLabel: string) => void;
  onColorChange?: (trackId: string, color: string | undefined) => void;
  onContextMenu?: (trackId: string, x: number, y: number) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
}

export interface TrackLaneProps {
  track: Track;
  trackIndex: number;
  height: number;
  timeToPixel: (timeUs: number) => number;
  pixelToTime: (pixel: number) => number;
  selectedClipId?: string;
  isDropTarget: boolean;
  isLocked: boolean;
  onClipSelect?: (clipId: string, trackId: string) => void;
  onClipMove?: (clipId: string, newStartUs: number) => boolean;
  onClipMoveToTrack?: (clipId: string, targetTrackId: string, newStartUs: number) => boolean;
  onClipTrimStart?: (clipId: string, newStartUs: number) => void;
  onClipTrimEnd?: (clipId: string, newEndUs: number) => void;
  onSeek?: (timeUs: number) => void;
  onClipUnlink?: (clipId: string) => void;
  onClipDelete?: (clipId: string) => void;
  onExternalDropToTrack?: (sourceId: string, trackId: string, startTimeUs: number) => void;
  applySnap: (proposedStartUs: number, clipDurationUs: number, excludeClipId?: string) => SnapResult;
  setActiveSnapLine: (timeUs: number | null) => void;
  setDropTargetTrackId: (trackId: string | null) => void;
  allTracks: readonly Track[];
  pixelsPerSecond: number;
  scrollLeft: number;
  hoveredLinkedClipId: string | null;
  setHoveredLinkedClipId: (clipId: string | null) => void;
  onDragPreview?: (clipId: string, previewStartUs: number | null, linkedClipId?: string, delta?: number) => void;
  dragPreviewMap: Map<string, number>;
  onAddSubtitleClip?: (trackId: string, startUs: number) => void;
  onSubtitleEdit?: (clipId: string) => void;
  onSubtitleTrimStart?: (clipId: string, newStartUs: number) => void;
  onSubtitleTrimEnd?: (clipId: string, newEndUs: number) => void;
  onSubtitleMoveToTrack?: (clipId: string, targetTrackId: string, newStartUs: number) => void;
  onSubtitleMove?: (clipId: string, newStartUs: number) => void;
  onSubtitleDuplicate?: (clipId: string) => void;
  onSubtitleSplit?: (clipId: string, timeUs: number) => void;
  onSubtitleAddCue?: (clipId: string, timeUs: number) => void;
  onAddOverlayClip?: (trackId: string, startUs: number) => void;
  onOverlayEdit?: (clipId: string) => void;
  onOverlayTrimStart?: (clipId: string, newStartUs: number) => void;
  onOverlayTrimEnd?: (clipId: string, newEndUs: number) => void;
  onOverlayMoveToTrack?: (clipId: string, targetTrackId: string, newStartUs: number) => void;
  onOverlayMove?: (clipId: string, newStartUs: number) => void;
  onOverlayDuplicate?: (clipId: string) => void;
  onOverlaySplit?: (clipId: string, timeUs: number) => void;
  currentTimeUs: number;
  tracks: readonly Track[];
}

export interface ClipBlockProps {
  clip: Clip;
  trackId: string;
  trackType: 'video' | 'audio';
  timeToPixel: (timeUs: number) => number;
  pixelToTime: (pixel: number) => number;
  isSelected: boolean;
  onSelect?: (clipId: string, trackId: string) => void;
  onMove?: (clipId: string, newStartUs: number) => boolean;
  onMoveToTrack?: (clipId: string, targetTrackId: string, newStartUs: number) => boolean;
  onTrimStart?: (clipId: string, newStartUs: number) => void;
  onTrimEnd?: (clipId: string, newEndUs: number) => void;
  onSeek?: (timeUs: number) => void;
  onUnlink?: (clipId: string) => void;
  onDelete?: (clipId: string) => void;
  applySnap: (proposedStartUs: number, clipDurationUs: number, excludeClipId?: string) => SnapResult;
  setActiveSnapLine: (timeUs: number | null) => void;
  setDropTargetTrackId: (trackId: string | null) => void;
  allTracks: readonly Track[];
  isLinkedHighlighted?: boolean;
  onHoverLinked?: (linkedClipId: string | null) => void;
  onDragPreview?: (clipId: string, previewStartUs: number | null, linkedClipId?: string, delta?: number) => void;
  previewStartUs?: number;
}

export interface SubtitleClipBlockProps {
  clip: SubtitleClip;
  trackId: string;
  timeToPixel: (timeUs: number) => number;
  pixelToTime: (pixel: number) => number;
  isSelected: boolean;
  onSelect?: (clipId: string, trackId: string) => void;
  onMove?: (clipId: string, newStartUs: number) => boolean | void;
  onMoveToTrack?: (clipId: string, targetTrackId: string, newStartUs: number) => boolean | void;
  onTrimStart?: (clipId: string, newStartUs: number) => void;
  onTrimEnd?: (clipId: string, newEndUs: number) => void;
  onDelete?: (clipId: string) => void;
  onEdit?: (clipId: string) => void;
  onDuplicate?: (clipId: string) => void;
  onSplit?: (clipId: string, timeUs: number) => void;
  onAddCue?: (clipId: string, timeUs: number) => void;
  currentTimeUs: number;
  allTracks: readonly Track[];
  applySnap: (proposedStartUs: number, clipDurationUs: number, excludeClipId?: string) => SnapResult;
  setActiveSnapLine: (timeUs: number | null) => void;
  setDropTargetTrackId: (trackId: string | null) => void;
}

export interface OverlayClipBlockProps {
  clip: OverlayClip;
  trackId: string;
  timeToPixel: (timeUs: number) => number;
  pixelToTime: (pixel: number) => number;
  isSelected: boolean;
  onSelect?: (clipId: string, trackId: string) => void;
  onMove?: (clipId: string, newStartUs: number) => boolean | void;
  onMoveToTrack?: (clipId: string, targetTrackId: string, newStartUs: number) => boolean | void;
  onTrimStart?: (clipId: string, newStartUs: number) => void;
  onTrimEnd?: (clipId: string, newEndUs: number) => void;
  onDelete?: (clipId: string) => void;
  onEdit?: (clipId: string) => void;
  onDuplicate?: (clipId: string) => void;
  onSplit?: (clipId: string, timeUs: number) => void;
  currentTimeUs: number;
  allTracks: readonly Track[];
  applySnap: (proposedStartUs: number, clipDurationUs: number, excludeClipId?: string) => SnapResult;
  setActiveSnapLine: (timeUs: number | null) => void;
  setDropTargetTrackId: (trackId: string | null) => void;
}

export interface SortableTrackRowProps {
  id: string;
  children: (dragHandleProps: React.HTMLAttributes<HTMLDivElement>, isDragging: boolean) => React.ReactNode;
}

export interface ZoomSliderProps {
  zoomLevel: number;
  minZoom: number;
  maxZoom: number;
  onChange: (level: number) => void;
}

export interface MinimapProps {
  tracks: readonly Track[];
  durationUs: number;
  currentTimeUs: number;
  viewport: TimelineViewport;
  containerWidth: number;
  onViewportChange?: (startTimeUs: number) => void;
  onSeek?: (timeUs: number) => void;
  trackStates?: Record<string, TrackUIState>;
  getTrackHeight: (trackId: string) => number;
}

export interface ScrollbarProps {
  containerWidth: number;
  totalWidth: number;
  scrollLeft: number;
  onScroll: (scrollLeft: number) => void;
}

// Re-export types needed by timeline components
export type { Track, Clip, SubtitleClip, OverlayClip, TimelineViewport, TrackUIState, TrackType };
