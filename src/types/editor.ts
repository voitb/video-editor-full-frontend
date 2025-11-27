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

// Messages sent from main thread to worker
export type WorkerCommand =
  | { type: 'INIT_CANVAS'; payload: { canvas: OffscreenCanvas } }
  | { type: 'LOAD_FILE'; payload: { file: File } }
  | { type: 'SEEK'; payload: { timeUs: number } }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SET_TRIM'; payload: { inPoint: number; outPoint: number } }
  | { type: 'GET_SAMPLES_FOR_SPRITES' };

// Messages sent from worker to main thread
export type WorkerResponse =
  | { type: 'READY'; payload: { duration: number; width: number; height: number } }
  | { type: 'TIME_UPDATE'; payload: { currentTimeUs: number } }
  | { type: 'PLAYBACK_STATE'; payload: { isPlaying: boolean } }
  | { type: 'SAMPLES_FOR_SPRITES'; payload: SpriteInitData }
  | { type: 'ERROR'; payload: { message: string } };
