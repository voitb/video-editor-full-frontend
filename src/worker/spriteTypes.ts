// ============================================================================
// SPRITE WORKER TYPES
// ============================================================================
// Type definitions for sprite generation worker communication

// Sprite sheet configuration
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
