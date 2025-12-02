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
  /** Snap threshold in pixels for clip movement */
  SNAP_THRESHOLD_PX: 10,
  /** Track header width in pixels */
  TRACK_HEADER_WIDTH: 120,
  /** Minimum track height in pixels */
  MIN_TRACK_HEIGHT: 40,
  /** Maximum track height in pixels */
  MAX_TRACK_HEIGHT: 200,
  /** Default track height in pixels */
  DEFAULT_TRACK_HEIGHT: 60,
  /** Minimap height in pixels */
  MINIMAP_HEIGHT: 40,
  /** Scrollbar height in pixels */
  SCROLLBAR_HEIGHT: 14,
  /** Zoom slider width in pixels */
  ZOOM_SLIDER_WIDTH: 150,
  /** Time ruler height in pixels */
  TIME_RULER_HEIGHT: 28,
} as const;

/** Timeline color palette */
export const TIMELINE_COLORS = {
  // Backgrounds
  background: '#0a0a0a',
  trackHeaderBg: '#151515',
  trackVideoBg: '#1e293b',
  trackAudioBg: '#1e3b2e',
  trackVideoDropBg: '#2a4a6a',
  trackAudioDropBg: '#2a6a4a',
  rulerBg: '#1a1a1a',
  minimapBg: '#0d0d0d',
  scrollbarBg: '#1a1a1a',
  scrollbarThumb: '#444',
  scrollbarThumbHover: '#555',

  // Clips
  clipVideo: '#3b5998',
  clipVideoSelected: '#4f83cc',
  clipVideoHover: '#4a6fb5',
  clipAudio: '#3b9858',
  clipAudioSelected: '#4fcc83',
  clipAudioHover: '#4ab56a',

  // UI Elements
  playhead: '#ff4444',
  snapLine: '#ffcc00',
  selection: 'rgba(79, 131, 204, 0.3)',
  viewportRect: 'rgba(255, 255, 255, 0.15)',
  viewportBorder: 'rgba(255, 255, 255, 0.4)',

  // Track states
  mutedOverlay: 'rgba(0, 0, 0, 0.5)',
  lockedOverlay: 'rgba(255, 0, 0, 0.05)',

  // Text
  textPrimary: '#fff',
  textSecondary: '#ccc',
  textMuted: '#888',

  // Borders
  border: '#333',
  borderLight: '#444',

  // Grid lines (hierarchical)
  gridMajor: 'rgba(255, 255, 255, 0.15)',
  gridMinor: 'rgba(255, 255, 255, 0.08)',
  gridSubMinor: 'rgba(255, 255, 255, 0.04)',
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

/** Audio constants */
export const AUDIO = {
  /** Maximum decoded audio chunks to hold before sending to main thread */
  MAX_PENDING_CHUNKS: 50,
  /** Audio buffer ahead threshold (ms) */
  BUFFER_AHEAD_MS: 500,
  /** Resync threshold if audio drifts (ms) */
  RESYNC_THRESHOLD_MS: 50,
} as const;
