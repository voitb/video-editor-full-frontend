/**
 * Video Editor - Export Type Definitions
 * Types for export configuration and progress tracking.
 */

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
