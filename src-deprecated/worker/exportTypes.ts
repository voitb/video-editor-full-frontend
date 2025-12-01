// ============================================================================
// EXPORT WORKER TYPES
// ============================================================================
// Type definitions for export worker communication

/**
 * Configuration for export operation
 */
export interface ExportConfig {
  /** Source video file (optional if sourceBuffer provided) */
  file?: File;
  /** Pre-loaded source buffer (used for HLS content) */
  sourceBuffer?: ArrayBuffer;
  /** Source name for filename generation */
  sourceName?: string;
  /** Trim start point in microseconds */
  inPointUs: number;
  /** Trim end point in microseconds */
  outPointUs: number;
}

/**
 * Export progress information
 */
export interface ExportProgress {
  /** Current export stage */
  stage: 'demuxing' | 'decoding' | 'encoding' | 'muxing' | 'finalizing';
  /** Video encoding progress (0-100) */
  videoProgress: number;
  /** Audio encoding progress (0-100) */
  audioProgress: number;
  /** Combined overall progress (0-100) */
  overallProgress: number;
  /** Current position being processed in microseconds */
  currentTimeUs: number;
  /** Estimated time remaining in milliseconds (null if unknown) */
  estimatedRemainingMs: number | null;
}

/**
 * Commands sent from main thread to export worker
 */
export type ExportWorkerCommand =
  | { type: 'START_EXPORT'; payload: ExportConfig }
  | { type: 'ABORT_EXPORT' };

/**
 * Responses sent from export worker to main thread
 */
export type ExportWorkerResponse =
  | { type: 'EXPORT_STARTED'; payload: { estimatedFrames: number; hasAudio: boolean } }
  | { type: 'EXPORT_PROGRESS'; payload: ExportProgress }
  | { type: 'EXPORT_COMPLETE'; payload: { blob: Blob; filename: string; durationMs: number } }
  | { type: 'EXPORT_ERROR'; payload: { message: string; recoverable: boolean } }
  | { type: 'EXPORT_ABORTED' };
