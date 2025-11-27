import { useEffect, useRef, useCallback, useState } from 'react';
import type { WorkerCommand, WorkerResponse, EditorState } from '../types/editor';

// Import worker using Vite's worker syntax
import VideoWorker from '../worker/VideoWorker?worker';

interface UseVideoWorkerReturn {
  state: EditorState;
  initCanvas: (canvas: HTMLCanvasElement) => void;
  loadFile: (file: File) => void;
  seek: (timeUs: number) => void;
  play: () => void;
  pause: () => void;
  setTrim: (inPoint: number, outPoint: number) => void;
}

export function useVideoWorker(): UseVideoWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<EditorState>({
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    isReady: false,
    videoWidth: 0,
    videoHeight: 0,
    clip: null,
  });

  // Initialize worker
  useEffect(() => {
    const worker = new VideoWorker();
    workerRef.current = worker;

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
    // Wait a tick to ensure worker is initialized
    setTimeout(() => {
      if (workerRef.current) {
        const offscreen = canvas.transferControlToOffscreen();
        workerRef.current.postMessage(
          { type: 'INIT_CANVAS', payload: { canvas: offscreen } } as WorkerCommand,
          [offscreen]
        );
      }
    }, 0);
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

  return {
    state,
    initCanvas,
    loadFile,
    seek,
    play,
    pause,
    setTrim,
  };
}
