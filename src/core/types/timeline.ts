/**
 * Video Editor - Timeline Type Definitions
 * Types for timeline viewport and track UI state.
 */

/** Timeline viewport state for zoom/pan */
export interface TimelineViewport {
  /** Visible start time (microseconds) */
  startTimeUs: number;
  /** Visible end time (microseconds) */
  endTimeUs: number;
  /** Zoom level (1.0 = full view, higher = more zoomed) */
  zoomLevel: number;
}

/** Track UI state (session-only, not persisted with composition) */
export interface TrackUIState {
  /** Whether the track is muted (excluded from playback) */
  muted: boolean;
  /** Whether the track is soloed (only soloed tracks play) */
  solo: boolean;
  /** Whether the track is locked (prevents editing) */
  locked: boolean;
  /** Custom track height in pixels */
  height: number;
}
