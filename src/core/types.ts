/**
 * Video Editor V2 - Core Type Definitions
 * Framework-agnostic types for the composition model.
 */

// ============================================================================
// BASIC TYPES
// ============================================================================

/** Track type identifier */
export type TrackType = 'video' | 'audio' | 'subtitle' | 'overlay';

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
  /** ID of linked clip (for video-audio linking) */
  linkedClipId?: string;
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
  /** Track type for determining audio/video behavior */
  trackType: TrackType;
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
  /** ID of linked clip (for video-audio linking) */
  linkedClipId?: string;
}

/** Serialized track for persistence */
export interface TrackJSON {
  id: string;
  type: TrackType;
  label: string;
  clips: ClipJSON[];
  subtitleClips?: SubtitleClipJSON[];
  overlayClips?: OverlayClipJSON[];
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

// ============================================================================
// TRACK UI STATE
// ============================================================================

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

// ============================================================================
// EXPORT TYPES
// ============================================================================

/** Export range for In/Out points */
export interface ExportRange {
  /** In-point in microseconds (null = start of composition) */
  inPointUs: number | null;
  /** Out-point in microseconds (null = end of composition) */
  outPointUs: number | null;
}

/** Export quality preset type */
export type ExportPresetKey = 'low' | 'medium' | 'high' | 'original';

/** Export preset configuration */
export interface ExportPreset {
  /** Display name */
  name: string;
  /** Video bitrate in bits per second */
  videoBitrate: number;
  /** Audio bitrate in bits per second */
  audioBitrate: number;
  /** Scale factor (0.5 = 720p, 0.75 = 810p, 1.0 = 1080p) */
  scale: number;
}

/** Export configuration for starting an export */
export interface ExportConfig {
  /** Selected quality preset */
  preset: ExportPresetKey;
  /** In-point in microseconds */
  inPointUs: number;
  /** Out-point in microseconds */
  outPointUs: number;
}

/** Export phase for progress tracking */
export type ExportPhase =
  | 'initializing'
  | 'encoding_audio'
  | 'encoding_video'
  | 'muxing'
  | 'finalizing';

/** Export progress information */
export interface ExportProgress {
  /** Current frame being processed */
  currentFrame: number;
  /** Total frames to process */
  totalFrames: number;
  /** Completion percentage (0-100) */
  percent: number;
  /** Current export phase */
  phase: ExportPhase;
}

/** Export result on completion */
export interface ExportResult {
  /** MP4 file data */
  mp4Data: ArrayBuffer;
  /** Export duration in milliseconds */
  durationMs: number;
  /** File size in bytes */
  fileSizeBytes: number;
}

// ============================================================================
// SUBTITLE TYPES
// ============================================================================

/** A single subtitle cue (text segment) */
export interface SubtitleCue {
  /** Unique identifier */
  id: string;
  /** Start time relative to clip start (microseconds) */
  startUs: number;
  /** End time relative to clip start (microseconds) */
  endUs: number;
  /** Text content (may contain newlines) */
  text: string;
}

/** Subtitle styling options */
export interface SubtitleStyle {
  /** Font family (web-safe) */
  fontFamily: string;
  /** Font size in pixels (at 1080p reference) */
  fontSize: number;
  /** Text color (hex) */
  color: string;
  /** Background color (hex with alpha) */
  backgroundColor: string;
  /** Whether to show background box */
  showBackground: boolean;
}

/** Configuration for creating a subtitle clip */
export interface SubtitleClipConfig {
  /** Position on timeline (microseconds) */
  startUs: number;
  /** Array of cues */
  cues: SubtitleCue[];
  /** Style settings */
  style: SubtitleStyle;
  /** Optional label */
  label?: string;
  /** Trim offset from original start (microseconds) - for left-edge trimming */
  trimStartUs?: number;
  /** Explicit duration override (microseconds) - for right-edge trimming */
  explicitDurationUs?: number;
}

/** Serialized subtitle clip for persistence */
export interface SubtitleClipJSON {
  id: string;
  startUs: number;
  cues: SubtitleCue[];
  style: SubtitleStyle;
  label: string;
  /** Trim offset from original start (microseconds) */
  trimStartUs?: number;
  /** Explicit duration override (microseconds) */
  explicitDurationUs?: number;
}

// ============================================================================
// OVERLAY TYPES
// ============================================================================

/** Overlay content type discriminator */
export type OverlayContentType = 'text' | 'html' | 'widget';

/** Overlay position as percentages of composition dimensions */
export interface OverlayPosition {
  /** X position as percentage (0-100) of composition width */
  xPercent: number;
  /** Y position as percentage (0-100) of composition height */
  yPercent: number;
  /** Width as percentage (0-100) of composition width, null for auto */
  widthPercent: number | null;
  /** Height as percentage (0-100) of composition height, null for auto */
  heightPercent: number | null;
}

/** Overlay styling options */
export interface OverlayStyle {
  /** Font family (web-safe) */
  fontFamily: string;
  /** Font size in pixels (at 1080p reference) */
  fontSize: number;
  /** Text color (hex) */
  color: string;
  /** Background color (hex with alpha) */
  backgroundColor: string;
  /** Padding in pixels */
  padding: number;
  /** Border radius in pixels */
  borderRadius: number;
  /** Opacity (0-1) */
  opacity: number;
  /** Text alignment */
  textAlign: 'left' | 'center' | 'right';
  /** Font weight */
  fontWeight: 'normal' | 'bold';
}

/** Configuration for creating an overlay clip */
export interface OverlayClipConfig {
  /** Position on timeline (microseconds) */
  startUs: number;
  /** Content type discriminator */
  contentType: OverlayContentType;
  /** Content string (plain text, HTML, or widget identifier) */
  content: string;
  /** Position on preview */
  position: OverlayPosition;
  /** Style settings */
  style: OverlayStyle;
  /** Optional label */
  label?: string;
  /** Explicit duration (microseconds) */
  explicitDurationUs?: number;
}

/** Serialized overlay clip for persistence */
export interface OverlayClipJSON {
  id: string;
  startUs: number;
  contentType: OverlayContentType;
  content: string;
  position: OverlayPosition;
  style: OverlayStyle;
  label: string;
  /** Explicit duration (microseconds) */
  explicitDurationUs?: number;
}
