/**
 * Video Editor V2 - Centralized Constants
 * All configuration values in one place for easy maintenance.
 */

/** Time conversion constants */
export const TIME = {
  /** Microseconds per second */
  US_PER_SECOND: 1_000_000,
  /** Microseconds per millisecond */
  US_PER_MS: 1_000,
  /** Nanoseconds per microsecond */
  NS_PER_US: 1_000,
} as const;

/** Timeline and viewport constants */
export const TIMELINE = {
  /** Minimum visible duration in microseconds (1 second) */
  MIN_VISIBLE_DURATION_US: 1_000_000,
  /** Maximum zoom level */
  MAX_ZOOM_LEVEL: 10,
  /** Zoom multiplier per step */
  ZOOM_STEP: 1.5,
  /** Minimum clip duration in microseconds (100ms) */
  MIN_CLIP_DURATION_US: 100_000,
  /** Throttle delay for seek during drag (ms) */
  SEEK_THROTTLE_MS: 50,
} as const;

/** Playback constants */
export const PLAYBACK = {
  /** Maximum frames to queue per source in decoder */
  MAX_QUEUE_SIZE: 8,
  /** Maximum frame lag before dropping (100ms) */
  MAX_FRAME_LAG_US: 100_000,
  /** Audio-video sync threshold (16ms = 1 frame at 60fps) */
  SYNC_THRESHOLD_US: 16_000,
  /** Sync check interval (ms) */
  SYNC_CHECK_INTERVAL_MS: 100,
  /** Buffer ahead threshold for streaming sources (500ms) */
  BUFFER_AHEAD_THRESHOLD_US: 500_000,
  /** Playable threshold - samples needed before playback can start */
  PLAYABLE_SAMPLE_COUNT: 45,
} as const;

/** Composition defaults */
export const COMPOSITION = {
  /** Default width */
  DEFAULT_WIDTH: 1920,
  /** Default height */
  DEFAULT_HEIGHT: 1080,
  /** Default frame rate */
  DEFAULT_FRAME_RATE: 30,
} as const;

/** HLS loading constants */
export const HLS = {
  /** Maximum resolution for auto-quality selection */
  MAX_RESOLUTION: 1080,
  /** Parallel segment fetch batch size */
  SEGMENT_BATCH_SIZE: 10,
  /** Segment fetch timeout (ms) */
  FETCH_TIMEOUT_MS: 60_000,
  /** Transmux worker timeout (10 minutes) */
  TRANSMUX_TIMEOUT_MS: 600_000,
  /** Maximum retry attempts */
  MAX_RETRIES: 3,
  /** Retry backoff base (ms) */
  RETRY_BACKOFF_BASE_MS: 1_000,
  /** Segments needed before 'playable' state */
  PLAYABLE_SEGMENT_COUNT: 5,
} as const;

/** Export/encoding constants */
export const EXPORT = {
  /** Maximum concurrent decode operations */
  MAX_DECODE_QUEUE: 4,
  /** Progress update interval (frames) */
  PROGRESS_UPDATE_FRAMES: 10,
  /** Default video bitrate (8 Mbps) */
  DEFAULT_VIDEO_BITRATE: 8_000_000,
  /** Default audio bitrate (128 kbps) */
  DEFAULT_AUDIO_BITRATE: 128_000,
  /** Default audio sample rate */
  DEFAULT_AUDIO_SAMPLE_RATE: 48_000,
} as const;

/** WebGL renderer constants */
export const RENDERER = {
  /** Clear color (black) */
  CLEAR_COLOR: [0, 0, 0, 1] as const,
} as const;
