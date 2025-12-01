// ============================================================================
// CENTRALIZED CONSTANTS
// ============================================================================
// All magic numbers and configuration values in one place for easy maintenance.

/**
 * Time conversion constants
 */
export const TIME = {
  /** Microseconds per second (1,000,000) */
  MICROSECONDS_PER_SECOND: 1_000_000,
  /** Microseconds per millisecond (1,000) */
  MICROSECONDS_PER_MILLISECOND: 1_000,
} as const;

/**
 * Timeline viewport and zoom constants
 */
export const TIMELINE = {
  /** Minimum visible duration in microseconds (1 second) - prevents over-zoom */
  MIN_VISIBLE_DURATION_US: 1_000_000,
  /** Maximum zoom level (10x) */
  MAX_ZOOM_LEVEL: 10,
  /** Zoom multiplier per step */
  ZOOM_STEP: 1.5,
  /** Minimum trim duration in microseconds (100ms) */
  MIN_TRIM_DURATION_US: 100_000,
  /** Throttle delay for seek operations during drag (ms) */
  SEEK_THROTTLE_MS: 50,
} as const;

/**
 * Video playback constants
 */
export const PLAYBACK = {
  /** Maximum frames to queue in decoder */
  MAX_QUEUE_SIZE: 8,
  /** Maximum acceptable frame lag before dropping frames (100ms) */
  MAX_FRAME_LAG_US: 100_000,
} as const;

/**
 * Video preview UI constants
 */
export const VIDEO_PREVIEW = {
  /** Default preview width in pixels */
  WIDTH: 640,
  /** Default preview height in pixels */
  HEIGHT: 360,
} as const;

/**
 * File validation constants
 */
export const FILE_VALIDATION = {
  /** Maximum file size in bytes (500MB) */
  MAX_FILE_SIZE: 500 * 1024 * 1024,
  /** Accepted video MIME types */
  ACCEPTED_TYPES: ['video/mp4', 'video/webm'] as const,
} as const;

/**
 * Export constants
 */
export const EXPORT = {
  /** Maximum concurrent decode operations */
  MAX_DECODE_QUEUE: 4,
  /** Progress update interval (frames) */
  PROGRESS_UPDATE_FRAMES: 10,
  /** Default video bitrate for encoding (8 Mbps) */
  DEFAULT_VIDEO_BITRATE: 8_000_000,
  /** Default audio bitrate (128 kbps) */
  DEFAULT_AUDIO_BITRATE: 128_000,
  /** Maximum export duration in seconds (5 minutes) */
  MAX_EXPORT_DURATION_SECONDS: 300,
} as const;

/**
 * Minimap UI constants
 */
export const MINIMAP = {
  /** Minimum region width percentage for visibility */
  MIN_REGION_WIDTH_PERCENT: 2,
} as const;

/**
 * Color constants (matching Tailwind classes)
 */
export const COLORS = {
  /** Sprite background color - matches Tailwind gray-800 */
  SPRITE_BACKGROUND: '#1f2937',
} as const;

// Re-export SPRITE_CONFIG from spriteTypes for convenience
// (keeping it in spriteTypes.ts since it has computed properties)
export { SPRITE_CONFIG } from '../worker/spriteTypes';
