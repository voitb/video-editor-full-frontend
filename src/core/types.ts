/**
 * Video Editor V2 - Core Type Definitions
 * Framework-agnostic types for the composition model.
 */

// ============================================================================
// BASIC TYPES
// ============================================================================

/** Track type identifier */
export type TrackType = 'video' | 'audio';

/** Source loading states */
export type SourceState = 'idle' | 'loading' | 'playable' | 'ready' | 'error';

/** Source type identifier */
export type SourceType = 'hls' | 'file';

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/** Composition configuration */
export interface CompositionConfig {
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Target frame rate */
  frameRate: number;
  /** Fixed composition duration in microseconds (optional, overrides computed duration) */
  fixedDurationUs?: number;
}

/** Clip configuration for creation/updates */
export interface ClipConfig {
  /** Reference to source */
  sourceId: string;
  /** Position on timeline (microseconds) */
  startUs: number;
  /** Trim in-point in source (microseconds) */
  trimIn: number;
  /** Trim out-point in source (microseconds) */
  trimOut: number;
  /** Opacity for video overlays (0-1) */
  opacity?: number;
  /** Volume for audio (0-1) */
  volume?: number;
  /** Optional label */
  label?: string;
}

/** Track configuration for creation */
export interface TrackConfig {
  /** Track type */
  type: TrackType;
  /** Display label */
  label: string;
}

// ============================================================================
// ACTIVE CLIP (FOR RENDERING)
// ============================================================================

/**
 * Active clip information for rendering at a specific timeline time.
 * This is computed from Clips and passed to the RenderWorker.
 */
export interface ActiveClip {
  /** Clip identifier */
  clipId: string;
  /** Source identifier */
  sourceId: string;
  /** Track index for z-ordering (video) or mixing (audio) */
  trackIndex: number;
  /** Clip start time on timeline (microseconds) */
  timelineStartUs: number;
  /** Where to start in source (microseconds) */
  sourceStartUs: number;
  /** Where to end in source (microseconds) */
  sourceEndUs: number;
  /** Opacity for overlays (0-1) */
  opacity: number;
  /** Volume for audio (0-1) */
  volume: number;
}

// ============================================================================
// SERIALIZATION TYPES
// ============================================================================

/** Serialized clip for persistence */
export interface ClipJSON {
  id: string;
  sourceId: string;
  startUs: number;
  trimIn: number;
  trimOut: number;
  opacity: number;
  volume: number;
  label: string;
}

/** Serialized track for persistence */
export interface TrackJSON {
  id: string;
  type: TrackType;
  label: string;
  clips: ClipJSON[];
}

/** Serialized source reference for persistence */
export interface SourceRefJSON {
  id: string;
  type: SourceType;
  url?: string;
  durationUs: number;
  width: number;
  height: number;
}

/** Serialized composition for persistence */
export interface CompositionJSON {
  id: string;
  config: CompositionConfig;
  tracks: TrackJSON[];
  sources: SourceRefJSON[];
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/** Source events */
export type SourceEvent =
  | { type: 'stateChange'; state: SourceState }
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'chunk'; chunk: ArrayBuffer; isLast: boolean }
  | { type: 'error'; message: string };

/** Source event callback */
export type SourceEventCallback = (event: SourceEvent) => void;

// ============================================================================
// AUDIO TYPES
// ============================================================================

/** Audio data for a source */
export interface SourceAudioData {
  sourceId: string;
  audioBuffer: AudioBuffer;
  sampleRate: number;
  channels: number;
  durationUs: number;
}

// ============================================================================
// TIMELINE VIEWPORT
// ============================================================================

/** Timeline viewport state for zoom/pan */
export interface TimelineViewport {
  /** Visible start time (microseconds) */
  startTimeUs: number;
  /** Visible end time (microseconds) */
  endTimeUs: number;
  /** Zoom level (1.0 = full view, higher = more zoomed) */
  zoomLevel: number;
}
