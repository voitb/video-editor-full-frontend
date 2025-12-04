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
  TRACK_HEADER_WIDTH: 160,
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
  trackSubtitleBg: '#3b2e1e',
  trackOverlayBg: '#2e1e3b',
  trackVideoDropBg: '#2a4a6a',
  trackAudioDropBg: '#2a6a4a',
  trackSubtitleDropBg: '#6a4a2a',
  trackOverlayDropBg: '#4a2a6a',
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
  clipSubtitle: '#cc6633',
  clipSubtitleSelected: '#ff8844',
  clipSubtitleHover: '#e07740',
  clipOverlay: '#9933cc',
  clipOverlaySelected: '#bb55ee',
  clipOverlayHover: '#aa44dd',

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

  // Grid lines (hierarchical) - increased opacity for professional visibility
  gridMajor: 'rgba(255, 255, 255, 0.35)',
  gridMinor: 'rgba(255, 255, 255, 0.18)',
  gridSubMinor: 'rgba(255, 255, 255, 0.08)',
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
  /** Audio drift threshold - reschedule audio if drift exceeds this (50ms) */
  AUDIO_DRIFT_THRESHOLD_US: 50_000,
} as const;

/** Composition defaults */
export const COMPOSITION = {
  /** Default width */
  DEFAULT_WIDTH: 1920,
  /** Default height */
  DEFAULT_HEIGHT: 1080,
  /** Default frame rate */
  DEFAULT_FRAME_RATE: 60,
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
  /** Audio channels for export (stereo) */
  AUDIO_CHANNELS: 2,
} as const;

/** Export quality presets */
export const EXPORT_PRESETS = {
  low: {
    name: 'Low (720p)',
    videoBitrate: 2_000_000,
    audioBitrate: 96_000,
    scale: 0.5,
  },
  medium: {
    name: 'Medium (1080p)',
    videoBitrate: 5_000_000,
    audioBitrate: 128_000,
    scale: 0.75,
  },
  high: {
    name: 'High (1080p)',
    videoBitrate: 8_000_000,
    audioBitrate: 192_000,
    scale: 1.0,
  },
  original: {
    name: 'Original',
    videoBitrate: 15_000_000,
    audioBitrate: 256_000,
    scale: 1.0,
  },
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

/** Media library constants */
export const MEDIA_LIBRARY = {
  /** Panel width in pixels */
  WIDTH: 280,
  /** List item height in pixels */
  ITEM_HEIGHT: 56,
} as const;

/** Subtitle constants */
export const SUBTITLE = {
  /** Default style settings */
  DEFAULT_STYLE: {
    fontFamily: 'Arial, sans-serif',
    fontSize: 48,
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    showBackground: true,
  },
  /** Minimum cue duration in microseconds (500ms) */
  MIN_CUE_DURATION_US: 500_000,
  /** Default cue duration in microseconds (2 seconds) */
  DEFAULT_CUE_DURATION_US: 2_000_000,
  /** Panel width in pixels */
  PANEL_WIDTH: 320,
  /** Rendering quality scale factor for subtitles (2 = 2x supersampling for better anti-aliasing) */
  RENDER_SCALE: 2,
} as const;

/** Track organization colors (for labeling tracks like DaVinci Resolve) */
export const TRACK_COLORS = {
  red: '#E54545',
  orange: '#E58A45',
  yellow: '#E5D145',
  green: '#45E545',
  cyan: '#45E5E5',
  blue: '#4585E5',
  purple: '#8A45E5',
  pink: '#E545E5',
  gray: '#808080',
} as const;

/** Track color options for UI selection */
export const TRACK_COLOR_OPTIONS = [
  { name: 'None', value: undefined },
  { name: 'Red', value: TRACK_COLORS.red },
  { name: 'Orange', value: TRACK_COLORS.orange },
  { name: 'Yellow', value: TRACK_COLORS.yellow },
  { name: 'Green', value: TRACK_COLORS.green },
  { name: 'Cyan', value: TRACK_COLORS.cyan },
  { name: 'Blue', value: TRACK_COLORS.blue },
  { name: 'Purple', value: TRACK_COLORS.purple },
  { name: 'Pink', value: TRACK_COLORS.pink },
  { name: 'Gray', value: TRACK_COLORS.gray },
] as const;

/** Overlay constants */
export const OVERLAY = {
  /** Default style settings */
  DEFAULT_STYLE: {
    fontFamily: 'Arial, sans-serif',
    fontSize: 36,
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    padding: 16,
    borderRadius: 8,
    opacity: 1,
    textAlign: 'center' as const,
    fontWeight: 'normal' as const,
  },
  /** Default position (centered) */
  DEFAULT_POSITION: {
    xPercent: 50,
    yPercent: 50,
    widthPercent: null,
    heightPercent: null,
  },
  /** Default duration in microseconds (5 seconds) */
  DEFAULT_DURATION_US: 5_000_000,
  /** Minimum duration in microseconds (500ms) */
  MIN_DURATION_US: 500_000,
  /** Rendering quality scale factor for overlays (2 = 2x supersampling for better anti-aliasing) */
  RENDER_SCALE: 2,
} as const;
