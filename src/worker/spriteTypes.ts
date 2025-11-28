// ============================================================================
// SPRITE WORKER TYPES
// ============================================================================
// Type definitions for sprite generation worker communication

// ============================================================================
// DEVICE DETECTION (Worker-safe version)
// ============================================================================

type DeviceTier = 'low' | 'medium' | 'high';

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

/**
 * Detect device tier (works in both main thread and workers).
 */
export function getDeviceTier(): DeviceTier {
  // Use try-catch for worker compatibility
  try {
    const nav = navigator as NavigatorWithDeviceMemory;
    const memory = nav.deviceMemory ?? 4; // Default to 4GB if not available
    const cores = navigator.hardwareConcurrency ?? 4;
    const isMobile = typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // Low-end: <=2GB RAM OR mobile with <=3GB
    if (memory <= 2 || (isMobile && memory <= 3)) {
      return 'low';
    }

    // Medium: <=4GB RAM OR <=4 cores
    if (memory <= 4 || cores <= 4) {
      return 'medium';
    }

    return 'high';
  } catch {
    return 'medium'; // Safe default
  }
}

// ============================================================================
// SPRITE CONFIGURATION
// ============================================================================

// Pixel budget per device tier (maintains same total pixels regardless of aspect ratio)
const PIXEL_BUDGET_BY_TIER: Record<DeviceTier, number> = {
  low: 96 * 54,      // ~5,184 pixels - reduced for low-end reliability
  medium: 160 * 90,  // ~14,400 pixels
  high: 160 * 90,    // ~14,400 pixels
};

// Resolution config per device tier (legacy - used when video dimensions unknown)
const RESOLUTION_BY_TIER: Record<DeviceTier, { width: number; height: number }> = {
  low: { width: 96, height: 54 },     // Reduced for low-end reliability
  medium: { width: 160, height: 90 }, // Standard
  high: { width: 160, height: 90 },   // Standard (could go higher if needed)
};

// Cached config (computed once per session)
let cachedSpriteConfig: ReturnType<typeof createSpriteConfig> | null = null;

// Cached aspect-aware config (keyed by video dimensions)
let cachedAspectConfig: {
  videoWidth: number;
  videoHeight: number;
  config: ReturnType<typeof createSpriteConfig>;
} | null = null;

/**
 * Create sprite config with given dimensions.
 */
function createSpriteConfig(thumbnailWidth: number, thumbnailHeight: number) {
  return {
    thumbnailWidth,
    thumbnailHeight,
    columnsPerSheet: 10,
    rowsPerSheet: 10,
    get spritesPerSheet() {
      return this.columnsPerSheet * this.rowsPerSheet;
    },
    get sheetWidth() {
      return this.thumbnailWidth * this.columnsPerSheet;
    },
    get sheetHeight() {
      return this.thumbnailHeight * this.rowsPerSheet;
    },
  } as const;
}

/**
 * Get adaptive sprite configuration based on device capabilities.
 * Results are cached for the session.
 * @deprecated Use getAspectAwareSpriteConfig when video dimensions are available
 */
export function getSpriteConfig() {
  if (cachedSpriteConfig) {
    return cachedSpriteConfig;
  }

  const tier = getDeviceTier();
  const resolution = RESOLUTION_BY_TIER[tier];
  cachedSpriteConfig = createSpriteConfig(resolution.width, resolution.height);
  return cachedSpriteConfig;
}

/**
 * Calculate thumbnail dimensions that preserve video aspect ratio.
 * Uses a pixel budget approach to maintain consistent memory usage.
 */
export function getAspectAwareDimensions(
  videoWidth: number,
  videoHeight: number
): { width: number; height: number } {
  const tier = getDeviceTier();
  const pixelBudget = PIXEL_BUDGET_BY_TIER[tier];
  const aspectRatio = videoWidth / videoHeight;

  // Calculate dimensions that fit within pixel budget while preserving aspect ratio
  // height = sqrt(pixelBudget / aspectRatio)
  // width = height * aspectRatio
  const height = Math.round(Math.sqrt(pixelBudget / aspectRatio));
  const width = Math.round(height * aspectRatio);

  // Ensure minimum dimensions (at least 48px on smallest side)
  const minDimension = 48;
  if (width < minDimension || height < minDimension) {
    if (aspectRatio >= 1) {
      // Wider than tall
      return { width: Math.round(minDimension * aspectRatio), height: minDimension };
    } else {
      // Taller than wide
      return { width: minDimension, height: Math.round(minDimension / aspectRatio) };
    }
  }

  return { width, height };
}

/**
 * Get sprite configuration with aspect-ratio-aware dimensions.
 * Caches result for same video dimensions.
 */
export function getAspectAwareSpriteConfig(videoWidth: number, videoHeight: number) {
  // Return cached config if video dimensions match
  if (
    cachedAspectConfig &&
    cachedAspectConfig.videoWidth === videoWidth &&
    cachedAspectConfig.videoHeight === videoHeight
  ) {
    return cachedAspectConfig.config;
  }

  const dimensions = getAspectAwareDimensions(videoWidth, videoHeight);
  const config = createSpriteConfig(dimensions.width, dimensions.height);

  // Cache the result
  cachedAspectConfig = {
    videoWidth,
    videoHeight,
    config,
  };

  return config;
}

// ============================================================================
// TIMEOUT CONFIGURATION
// ============================================================================

export const SPRITE_TIMEOUTS = {
  /** Decoder flush timeout in milliseconds (10 seconds - moderate) */
  FLUSH_TIMEOUT_MS: 10000,
  /** Single frame decode timeout in milliseconds */
  FRAME_DECODE_TIMEOUT_MS: 5000,
  /** Maximum retries for decoder operations */
  MAX_RETRIES: 2,
} as const;

// Static config for backward compatibility (uses standard resolution)
export const SPRITE_CONFIG = {
  thumbnailWidth: 160,
  thumbnailHeight: 90,
  columnsPerSheet: 10,
  rowsPerSheet: 10,
  get spritesPerSheet() {
    return this.columnsPerSheet * this.rowsPerSheet;
  },
  get sheetWidth() {
    return this.thumbnailWidth * this.columnsPerSheet;
  },
  get sheetHeight() {
    return this.thumbnailHeight * this.rowsPerSheet;
  },
} as const;

// Sample data transferred from VideoWorker
export interface TransferableSample {
  index: number;
  cts: number;
  timescale: number;
  is_sync: boolean;
  duration: number;
  data: ArrayBuffer;
}

// Metadata for a single sprite within a sheet
export interface SpriteMetadata {
  timeUs: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// A complete sprite sheet with its thumbnails
export interface SpriteSheet {
  id: string;
  bitmap: ImageBitmap;
  startTimeUs: number;
  endTimeUs: number;
  sprites: SpriteMetadata[];
}

// Initialization data from VideoWorker
export interface SpriteInitData {
  samples: TransferableSample[];
  keyframeIndices: number[];
  videoWidth: number;
  videoHeight: number;
  codecDescription: Uint8Array | null;
  codec: string;
}

// ============================================================================
// SPRITE WORKER COMMANDS (Main Thread -> Worker)
// ============================================================================

export type SpriteWorkerCommand =
  | {
      type: 'INIT';
      payload: SpriteInitData;
    }
  | {
      type: 'GENERATE_SPRITES';
      payload: {
        startTimeUs: number;
        endTimeUs: number;
        intervalUs: number;
      };
    }
  | {
      type: 'GENERATE_ALL_SPRITES';
      payload: {
        intervalUs: number;
      };
    }
  | {
      type: 'SET_VISIBLE_RANGE';
      payload: {
        startTimeUs: number;
        endTimeUs: number;
      };
    }
  | {
      type: 'CLEAR';
    };

// ============================================================================
// SPRITE WORKER RESPONSES (Worker -> Main Thread)
// ============================================================================

export type SpriteWorkerResponse =
  | {
      type: 'SPRITE_SHEET_READY';
      payload: {
        sheetId: string;
        bitmap: ImageBitmap;
        startTimeUs: number;
        endTimeUs: number;
        sprites: SpriteMetadata[];
      };
    }
  | {
      type: 'PROGRESS';
      payload: {
        generated: number;
        total: number;
      };
    }
  | {
      type: 'GENERATION_COMPLETE';
    }
  | {
      type: 'ERROR';
      payload: {
        message: string;
        /** If true, operation can be retried. If false, this is a fatal error. */
        recoverable?: boolean;
      };
    };

// ============================================================================
// VIDEO WORKER SPRITE MESSAGES
// ============================================================================
// Additional messages for VideoWorker to expose sample data

export type VideoWorkerSpriteCommand = {
  type: 'GET_SAMPLES_FOR_SPRITES';
};

export type VideoWorkerSpriteResponse = {
  type: 'SAMPLES_FOR_SPRITES';
  payload: SpriteInitData;
};
