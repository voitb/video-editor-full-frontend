import { useEffect, useRef, useState, useCallback } from 'react';
import type { WorkerCommand, WorkerResponse, EditorState, SpriteInitData } from '../types/editor';
import { TIME } from '../constants';
import { logger } from '../utils/logger';

// Import worker using Vite's worker syntax
import VideoWorker from '../worker/VideoWorker?worker';

const { MICROSECONDS_PER_SECOND } = TIME;

interface UseVideoWorkerReturn {
  state: EditorState;
  sampleData: SpriteInitData | null;
  initCanvas: (canvas: HTMLCanvasElement) => void;
  loadFile: (file: File) => void;
  loadBuffer: (buffer: ArrayBuffer, durationHint?: number) => void;
  seek: (timeUs: number) => void;
  play: () => void;
  pause: () => void;
  setTrim: (inPoint: number, outPoint: number) => void;
  requestSampleData: () => void;
}

export function useVideoWorker(): UseVideoWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  // Queue for canvas init message if called before worker is ready
  const pendingCanvasRef = useRef<{
    message: WorkerCommand;
    transfer: OffscreenCanvas;
  } | null>(null);

  const [state, setState] = useState<EditorState>({
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    isReady: false,
    videoWidth: 0,
    videoHeight: 0,
    clip: null,
  });

  const [sampleData, setSampleData] = useState<SpriteInitData | null>(null);

  // Initialize worker
  useEffect(() => {
    const worker = new VideoWorker();
    workerRef.current = worker;

    // Send any queued canvas init message
    if (pendingCanvasRef.current) {
      const { message, transfer } = pendingCanvasRef.current;
      worker.postMessage(message, [transfer]);
      pendingCanvasRef.current = null;
    }

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { type } = e.data;

      switch (type) {
        case 'READY': {
          const { duration, width, height } = e.data.payload;
          setState((prev) => ({
            ...prev,
            duration,
            videoWidth: width,
            videoHeight: height,
            isReady: true,
            clip: {
              inPoint: 0,
              outPoint: duration * MICROSECONDS_PER_SECOND,
            },
          }));
          break;
        }

        case 'TIME_UPDATE': {
          const { currentTimeUs } = e.data.payload;
          setState((prev) => ({
            ...prev,
            currentTime: currentTimeUs / MICROSECONDS_PER_SECOND, // Convert to seconds
          }));
          break;
        }

        case 'PLAYBACK_STATE': {
          const { isPlaying } = e.data.payload;
          setState((prev) => ({
            ...prev,
            isPlaying,
          }));
          break;
        }

        case 'SAMPLES_FOR_SPRITES': {
          setSampleData(e.data.payload);
          break;
        }

        case 'ERROR': {
          logger.error('Worker error:', e.data.payload.message);
          break;
        }
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Canvas initialization - useCallback with empty deps for stability
  // (used as prop, consumers might rely on stable reference)
  const initCanvas = useCallback((canvas: HTMLCanvasElement) => {
    try {
      const offscreen = canvas.transferControlToOffscreen();
      const message: WorkerCommand = { type: 'INIT_CANVAS', payload: { canvas: offscreen } };

      if (workerRef.current) {
        workerRef.current.postMessage(message, [offscreen]);
      } else {
        pendingCanvasRef.current = { message, transfer: offscreen };
      }
    } catch (error) {
      logger.error('Failed to initialize canvas:', error);
      // Canvas may have already been transferred or is invalid
    }
  }, []);

  // Command functions - useCallback with empty deps
  // These only access workerRef which is stable, so empty deps is correct
  const loadFile = useCallback((file: File) => {
    workerRef.current?.postMessage({ type: 'LOAD_FILE', payload: { file } });
  }, []);

  const loadBuffer = useCallback((buffer: ArrayBuffer, durationHint?: number) => {
    // Transfer the buffer to avoid copying
    workerRef.current?.postMessage(
      { type: 'LOAD_BUFFER', payload: { buffer, durationHint } },
      [buffer]
    );
  }, []);

  const seek = useCallback((timeUs: number) => {
    workerRef.current?.postMessage({ type: 'SEEK', payload: { timeUs } });
  }, []);

  const play = useCallback(() => {
    workerRef.current?.postMessage({ type: 'PLAY' });
  }, []);

  const pause = useCallback(() => {
    workerRef.current?.postMessage({ type: 'PAUSE' });
  }, []);

  const setTrim = useCallback((inPoint: number, outPoint: number) => {
    workerRef.current?.postMessage({ type: 'SET_TRIM', payload: { inPoint, outPoint } });
    setState((prev) => ({
      ...prev,
      clip: { inPoint, outPoint },
    }));
  }, []);

  const requestSampleData = useCallback(() => {
    workerRef.current?.postMessage({ type: 'GET_SAMPLES_FOR_SPRITES' });
  }, []);

  return {
    state,
    sampleData,
    initCanvas,
    loadFile,
    loadBuffer,
    seek,
    play,
    pause,
    setTrim,
    requestSampleData,
  };
}
