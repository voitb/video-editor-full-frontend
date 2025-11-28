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

// Re-export SPRITE_CONFIG from spriteTypes for convenience
// (keeping it in spriteTypes.ts since it has computed properties)
export { SPRITE_CONFIG } from '../worker/spriteTypes';
