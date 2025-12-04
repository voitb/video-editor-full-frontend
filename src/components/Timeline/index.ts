/**
 * Timeline Module
 * Barrel export for timeline components.
 */

// Main component
export { Timeline } from './Timeline';

// Types
export type {
  TimelineProps,
  SnapTarget,
  SnapResult,
  GridLine,
  TrackHeaderProps,
  TrackLaneProps,
  ClipBlockProps,
  SubtitleClipBlockProps,
  OverlayClipBlockProps,
  ZoomSliderProps,
  MinimapProps,
  ScrollbarProps,
} from './types';

// Utilities
export { getTrackBgColor, getClipColor, getTimeStep, getGridLines } from './utils';
