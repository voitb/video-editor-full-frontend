/**
 * Video Editor V2 - HLS Type Definitions
 */

/** Quality level from HLS master playlist */
export interface HlsQualityLevel {
  bandwidth: number;
  width: number;
  height: number;
  uri: string;
}

/** Segment from HLS media playlist */
export interface HlsSegment {
  uri: string;
  duration: number;
  byteRange?: {
    offset: number;
    length: number;
  };
}

/** Parsed HLS manifest */
export interface HlsManifest {
  isMaster: boolean;
  levels: HlsQualityLevel[];
  segments: HlsSegment[];
  totalDuration: number;
}

/** Progress callback for segment fetching */
export type FetchProgressCallback = (fetched: number, total: number) => void;

/** HLS loading options */
export interface HlsLoadOptions {
  /** Maximum resolution height (default: 1080) */
  maxResolution?: number;
  /** Fetch timeout per segment in ms (default: 60000) */
  fetchTimeout?: number;
  /** Parallel batch size for fetching (default: 10) */
  batchSize?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Progress callback */
  onProgress?: FetchProgressCallback;
}

/** Result of HLS loading */
export interface HlsLoadResult {
  /** Complete fMP4 buffer */
  buffer: ArrayBuffer;
  /** Total duration in seconds */
  duration: number;
  /** Selected quality level */
  quality: HlsQualityLevel;
  /** Number of segments */
  segmentCount: number;
}
