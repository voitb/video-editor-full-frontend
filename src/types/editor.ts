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

// Messages sent from main thread to worker
export type WorkerCommand =
  | { type: 'INIT_CANVAS'; payload: { canvas: OffscreenCanvas } }
  | { type: 'LOAD_FILE'; payload: { file: File } }
  | { type: 'SEEK'; payload: { timeUs: number } }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SET_TRIM'; payload: { inPoint: number; outPoint: number } };

// Messages sent from worker to main thread
export type WorkerResponse =
  | { type: 'READY'; payload: { duration: number; width: number; height: number } }
  | { type: 'TIME_UPDATE'; payload: { currentTimeUs: number } }
  | { type: 'PLAYBACK_STATE'; payload: { isPlaying: boolean } }
  | { type: 'ERROR'; payload: { message: string } };
