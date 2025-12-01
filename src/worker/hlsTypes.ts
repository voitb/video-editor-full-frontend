// ============================================================================
// HLS TYPES
// ============================================================================
// Type definitions for HLS loading and transmuxing communication.

/**
 * HLS quality level (rendition) from master playlist
 */
export interface HlsQualityLevel {
  bandwidth: number;
  width: number;
  height: number;
  uri: string;
}

/**
 * HLS segment from media playlist
 */
export interface HlsSegment {
  uri: string;
  duration: number;
  byteRange?: { offset: number; length: number };
}

/**
 * Parsed HLS manifest data
 */
export interface HlsManifest {
  isMaster: boolean;
  levels: HlsQualityLevel[];
  segments: HlsSegment[];
  totalDuration: number;
}

/**
 * HLS loading progress stages
 */
export type HlsLoadingStage =
  | 'fetching_manifest'
  | 'parsing_manifest'
  | 'fetching_segments'
  | 'transmuxing'
  | 'complete';

/**
 * HLS loading progress state
 */
export interface HlsLoadingProgress {
  stage: HlsLoadingStage;
  percent: number;
  message: string;
}

// ============================================================================
// TRANSMUX WORKER COMMUNICATION
// ============================================================================

/**
 * Commands sent to HlsTransmuxWorker
 */
export type HlsTransmuxCommand =
  | { type: 'START_STREAM' }
  | { type: 'PUSH_SEGMENT'; payload: { segment: ArrayBuffer; index: number; total: number; isLast?: boolean } }
  | { type: 'ABORT' };

/**
 * Responses from HlsTransmuxWorker
 */
export type HlsTransmuxResponse =
  | { type: 'PROGRESS'; payload: { processed: number; total: number } }
  | { type: 'INIT_SEGMENT'; payload: { segment: ArrayBuffer } }
  | { type: 'MEDIA_SEGMENT'; payload: { segment: ArrayBuffer; isLast?: boolean } }
  | { type: 'COMPLETE' }
  | { type: 'ERROR'; payload: { message: string } };
