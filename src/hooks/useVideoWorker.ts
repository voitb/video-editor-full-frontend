import { useEffect, useRef, useCallback, useState } from 'react';
import type { WorkerCommand, WorkerResponse, EditorState, SpriteInitData } from '../types/editor';

// Import worker using Vite's worker syntax
import VideoWorker from '../worker/VideoWorker?worker';

interface UseVideoWorkerReturn {
  state: EditorState;
  sampleData: SpriteInitData | null;
  initCanvas: (canvas: HTMLCanvasElement) => void;
  loadFile: (file: File) => void;
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
              outPoint: duration * 1_000_000,
            },
          }));
          break;
        }

        case 'TIME_UPDATE': {
          const { currentTimeUs } = e.data.payload;
          setState((prev) => ({
            ...prev,
            currentTime: currentTimeUs / 1_000_000, // Convert to seconds
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
          console.error('Worker error:', e.data.payload.message);
          break;
        }
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const sendCommand = useCallback((command: WorkerCommand) => {
    workerRef.current?.postMessage(command);
  }, []);

  const initCanvas = useCallback((canvas: HTMLCanvasElement) => {
    const offscreen = canvas.transferControlToOffscreen();
    const message: WorkerCommand = { type: 'INIT_CANVAS', payload: { canvas: offscreen } };

    if (workerRef.current) {
      // Worker is ready - send immediately
      workerRef.current.postMessage(message, [offscreen]);
    } else {
      // Worker not ready yet - queue for when it initializes
      pendingCanvasRef.current = { message, transfer: offscreen };
    }
  }, []);

  const loadFile = useCallback((file: File) => {
    sendCommand({ type: 'LOAD_FILE', payload: { file } });
  }, [sendCommand]);

  const seek = useCallback((timeUs: number) => {
    sendCommand({ type: 'SEEK', payload: { timeUs } });
  }, [sendCommand]);

  const play = useCallback(() => {
    sendCommand({ type: 'PLAY' });
  }, [sendCommand]);

  const pause = useCallback(() => {
    sendCommand({ type: 'PAUSE' });
  }, [sendCommand]);

  const setTrim = useCallback((inPoint: number, outPoint: number) => {
    sendCommand({ type: 'SET_TRIM', payload: { inPoint, outPoint } });
    setState((prev) => ({
      ...prev,
      clip: { inPoint, outPoint },
    }));
  }, [sendCommand]);

  const requestSampleData = useCallback(() => {
    sendCommand({ type: 'GET_SAMPLES_FOR_SPRITES' });
  }, [sendCommand]);

  return {
    state,
    sampleData,
    initCanvas,
    loadFile,
    seek,
    play,
    pause,
    setTrim,
    requestSampleData,
  };
}
