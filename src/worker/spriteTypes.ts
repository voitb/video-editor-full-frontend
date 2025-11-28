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
function getDeviceTier(): DeviceTier {
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

// Resolution config per device tier
const RESOLUTION_BY_TIER: Record<DeviceTier, { width: number; height: number }> = {
  low: { width: 128, height: 72 },    // 2x smaller for low-end
  medium: { width: 160, height: 90 }, // Standard
  high: { width: 160, height: 90 },   // Standard (could go higher if needed)
};

// Cached config (computed once per session)
let cachedSpriteConfig: ReturnType<typeof createSpriteConfig> | null = null;

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
