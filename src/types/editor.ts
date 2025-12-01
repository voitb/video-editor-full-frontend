// Editor state
export interface EditorState {
  duration: number;      // Total duration in seconds
  currentTime: number;   // Current playhead position in seconds
  isPlaying: boolean;
  isReady: boolean;
  videoWidth: number;
  videoHeight: number;
  clip: {
    inPoint: number;     // microseconds
    outPoint: number;    // microseconds
  } | null;
}

// Multi-track timeline types
export type TrackType = 'video' | 'audio';
export type TrackOrigin = 'recording' | 'overlay';
export type ClipEdge = 'start' | 'end';

export interface TrackClip {
  id: string;
  label: string;
  startUs: number;        // Position on timeline (microseconds)
  durationUs: number;     // Visible duration on timeline (microseconds)
  sourceId: string;
  origin: TrackOrigin;
  sourceType?: 'file' | 'hls';
  isMuted?: boolean;
  // Per-clip trim (relative to source)
  trimInUs: number;       // Trim in-point in source (default: 0)
  trimOutUs: number;      // Trim out-point in source (default: sourceDurationUs)
  sourceDurationUs: number; // Original source duration for trim bounds
}

export interface MediaTrack {
  id: string;
  label: string;
  type: TrackType;
  clips: TrackClip[];
}

export type ClipChange =
  | {
      type: 'move';
      trackId: string;
      clipId: string;
      sourceId: string;
      newStartUs: number;
    }
  | {
      type: 'trim';
      trackId: string;
      clipId: string;
      sourceId: string;
      edge: ClipEdge;
      newStartUs: number;
      newDurationUs: number;
      // Source-relative trim values
      newTrimInUs: number;
      newTrimOutUs: number;
    };

// Timeline viewport state for zoom/pan
export interface TimelineViewport {
  startTimeUs: number;   // Visible start time (microseconds)
  endTimeUs: number;     // Visible end time (microseconds)
  zoomLevel: number;     // 1.0 = 100% (full video visible), 10.0 = 10x zoom (1/10th visible)
}

// Sample data for sprite generation
export interface TransferableSample {
  index: number;
  cts: number;
  timescale: number;
  is_sync: boolean;
  duration: number;
  data: ArrayBuffer;
}

// Sprite initialization data
export interface SpriteInitData {
  samples: TransferableSample[];
  keyframeIndices: number[];
  videoWidth: number;
  videoHeight: number;
  codecDescription: Uint8Array | null;
  codec: string;
}

// ============================================================================
// MULTI-SOURCE VIDEO COMPOSITING TYPES
// ============================================================================

/**
 * Per-source state for multi-source video architecture.
 * Each loaded source maintains its own demuxer, decoder, and frame queue.
 */
export interface SourceState {
  sourceId: string;
  durationUs: number;
  width: number;
  height: number;
  isReady: boolean;
}

/**
 * Active clip information for playback coordination.
 * Describes which portion of a source should be rendered at a given timeline position.
 */
export interface ActiveClip {
  sourceId: string;
  clipId: string;
  trackIndex: number;        // Z-order (higher = on top for video, mixing for audio)
  startTimeUs: number;       // When clip starts on timeline
  sourceStartUs: number;     // Trim in-point in source (offset into source)
  sourceEndUs: number;       // Trim out-point in source
  opacity?: number;          // For overlay blending (0-1), default 1
}

/**
 * Audio data extracted from a source for AudioContext playback
 */
export interface SourceAudioData {
  sourceId: string;
  audioData: ArrayBuffer;    // Raw audio data (PCM or encoded)
  sampleRate: number;
  channels: number;
  durationUs: number;
}

// ============================================================================
// WORKER COMMANDS
// ============================================================================

// Messages sent from main thread to worker
export type WorkerCommand =
  // Canvas initialization
  | { type: 'INIT_CANVAS'; payload: { canvas: OffscreenCanvas } }
  // Single-source loading (legacy, still supported)
  | { type: 'LOAD_FILE'; payload: { file: File } }
  | { type: 'LOAD_BUFFER'; payload: { buffer: ArrayBuffer; durationHint?: number } }
  // Streaming
  | { type: 'START_STREAM'; payload: { durationHint?: number } }
  | { type: 'APPEND_STREAM_CHUNK'; payload: { chunk: ArrayBuffer; isLast?: boolean } }
  // Playback control
  | { type: 'SEEK'; payload: { timeUs: number } }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SET_TRIM'; payload: { inPoint: number; outPoint: number } }
  // Multi-source management
  | { type: 'LOAD_SOURCE'; payload: { sourceId: string; file?: File; buffer?: ArrayBuffer } }
  | { type: 'REMOVE_SOURCE'; payload: { sourceId: string } }
  | { type: 'SET_ACTIVE_CLIPS'; payload: { clips: ActiveClip[] } }
  // Sync command for audio-video coordination
  | { type: 'SYNC_TO_TIME'; payload: { timeUs: number } };

// ============================================================================
// WORKER RESPONSES
// ============================================================================

// Messages sent from worker to main thread
export type WorkerResponse =
  // Ready states
  | { type: 'READY'; payload: { duration: number; width: number; height: number } }
  | { type: 'SOURCE_READY'; payload: { sourceId: string; duration: number; width: number; height: number } }
  | { type: 'SOURCE_REMOVED'; payload: { sourceId: string } }
  // Playback state
  | { type: 'TIME_UPDATE'; payload: { currentTimeUs: number } }
  | { type: 'PLAYBACK_STATE'; payload: { isPlaying: boolean } }
  // Media data
  | { type: 'FIRST_FRAME'; payload: { blob: Blob; width: number; height: number } }
  | { type: 'AUDIO_DATA'; payload: SourceAudioData }
  // Errors
  | { type: 'ERROR'; payload: { message: string } };
