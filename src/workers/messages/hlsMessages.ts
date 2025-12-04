/**
 * Video Editor V2 - HLS Worker Message Types
 * Strongly-typed messages for main thread <-> HlsLoaderWorker communication.
 */

// ============================================================================
// HLS TYPES
// ============================================================================

/** Quality level from HLS manifest */
export interface HlsQualityLevel {
  width: number;
  height: number;
  bandwidth: number;
  url: string;
}

/** Segment info from playlist */
export interface HlsSegment {
  uri: string;
  duration: number;
  byteRange?: { length: number; offset: number };
}

/** Parsed manifest data */
export interface HlsManifest {
  isMaster: boolean;
  levels: HlsQualityLevel[];
  segments: HlsSegment[];
  totalDuration: number;
}

// ============================================================================
// COMMANDS (Main Thread -> Worker)
// ============================================================================

/** Start loading HLS stream */
export interface LoadHlsCommand {
  type: 'LOAD_HLS';
  url: string;
  maxResolution?: number;
}

/** Abort current loading */
export interface AbortHlsCommand {
  type: 'ABORT';
}

/** All possible commands */
export type HlsWorkerCommand = LoadHlsCommand | AbortHlsCommand;

// ============================================================================
// EVENTS (Worker -> Main Thread)
// ============================================================================

/** Manifest parsed, duration known */
export interface HlsManifestParsedEvent {
  type: 'MANIFEST_PARSED';
  manifest: HlsManifest;
  selectedLevel: HlsQualityLevel;
}

/** fMP4 chunk ready (init segment or media segment) */
export interface HlsChunkEvent {
  type: 'HLS_CHUNK';
  chunk: ArrayBuffer;
  isInitSegment: boolean;
  isLast: boolean;
  segmentIndex: number;
  totalSegments: number;
}

/** Loading progress */
export interface HlsProgressEvent {
  type: 'HLS_PROGRESS';
  loaded: number;
  total: number;
  phase: 'manifest' | 'segments';
}

/** Stream is playable (enough segments loaded) */
export interface HlsPlayableEvent {
  type: 'HLS_PLAYABLE';
  loadedSegments: number;
  totalSegments: number;
}

/** Loading complete */
export interface HlsCompleteEvent {
  type: 'HLS_COMPLETE';
  totalSegments: number;
  totalBytes: number;
}

/** Error occurred */
export interface HlsErrorEvent {
  type: 'HLS_ERROR';
  message: string;
  phase: 'manifest' | 'segments' | 'transmux';
  recoverable: boolean;
}

/** All possible events */
export type HlsWorkerEvent =
  | HlsManifestParsedEvent
  | HlsChunkEvent
  | HlsProgressEvent
  | HlsPlayableEvent
  | HlsCompleteEvent
  | HlsErrorEvent;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isHlsWorkerEvent(msg: unknown): msg is HlsWorkerEvent {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    typeof (msg as { type: unknown }).type === 'string' &&
    (msg as { type: string }).type.startsWith('HLS_') ||
    (msg as { type: string }).type === 'MANIFEST_PARSED'
  );
}
