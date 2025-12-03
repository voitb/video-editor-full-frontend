/**
 * Video Editor - ExportWorker Message Types
 * Strongly-typed messages for main thread <-> ExportWorker communication.
 */

import type {
  CompositionConfig,
  TrackJSON,
  ExportPresetKey,
  ExportPhase,
} from '../../core/types';

// ============================================================================
// SOURCE DATA FOR EXPORT
// ============================================================================

/** Source data bundle for export */
export interface ExportSourceData {
  /** Source identifier */
  sourceId: string;
  /** Complete MP4 buffer for this source */
  buffer: ArrayBuffer;
  /** Source duration in microseconds */
  durationUs: number;
  /** Video width */
  width: number;
  /** Video height */
  height: number;
  /** Whether this source has video track */
  hasVideo: boolean;
  /** Whether this source has audio track */
  hasAudio: boolean;
}

// ============================================================================
// COMMANDS (Main Thread -> Worker)
// ============================================================================

/** Start export command */
export interface StartExportCommand {
  type: 'START_EXPORT';
  /** Composition configuration */
  compositionConfig: CompositionConfig;
  /** Track data with clips */
  tracks: TrackJSON[];
  /** Source data for all sources used in composition */
  sources: ExportSourceData[];
  /** Export configuration */
  exportConfig: {
    /** Quality preset */
    preset: ExportPresetKey;
    /** In-point in microseconds */
    inPointUs: number;
    /** Out-point in microseconds */
    outPointUs: number;
    /** Output width (after scale) */
    outputWidth: number;
    /** Output height (after scale) */
    outputHeight: number;
    /** Video bitrate */
    videoBitrate: number;
    /** Audio bitrate */
    audioBitrate: number;
  };
}

/** Cancel export command */
export interface CancelExportCommand {
  type: 'CANCEL_EXPORT';
}

/** All possible commands */
export type ExportWorkerCommand = StartExportCommand | CancelExportCommand;

// ============================================================================
// EVENTS (Worker -> Main Thread)
// ============================================================================

/** Worker is ready */
export interface ExportWorkerReadyEvent {
  type: 'EXPORT_WORKER_READY';
}

/** Export progress update */
export interface ExportProgressEvent {
  type: 'EXPORT_PROGRESS';
  /** Current frame being processed */
  currentFrame: number;
  /** Total frames to process */
  totalFrames: number;
  /** Completion percentage (0-100) */
  percent: number;
  /** Current export phase */
  phase: ExportPhase;
  /** Estimated time remaining in milliseconds (if available) */
  estimatedTimeRemainingMs?: number;
}

/** Export completed successfully */
export interface ExportCompleteEvent {
  type: 'EXPORT_COMPLETE';
  /** Final MP4 data */
  mp4Data: ArrayBuffer;
  /** Total export duration in milliseconds */
  durationMs: number;
  /** File size in bytes */
  fileSizeBytes: number;
}

/** Export was cancelled */
export interface ExportCancelledEvent {
  type: 'EXPORT_CANCELLED';
}

/** Export error occurred */
export interface ExportErrorEvent {
  type: 'EXPORT_ERROR';
  /** Error message */
  message: string;
  /** Phase where error occurred */
  phase: ExportPhase;
  /** Additional error details */
  details?: string;
}

/** All possible events */
export type ExportWorkerEvent =
  | ExportWorkerReadyEvent
  | ExportProgressEvent
  | ExportCompleteEvent
  | ExportCancelledEvent
  | ExportErrorEvent;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isExportWorkerEvent(msg: unknown): msg is ExportWorkerEvent {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    typeof (msg as { type: unknown }).type === 'string'
  );
}

export function isExportWorkerCommand(msg: unknown): msg is ExportWorkerCommand {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    typeof (msg as { type: unknown }).type === 'string'
  );
}
