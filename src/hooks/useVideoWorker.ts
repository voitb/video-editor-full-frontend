import { useEffect, useRef, useState, useCallback } from 'react';
import type { WorkerCommand, WorkerResponse, EditorState } from '../types/editor';
import { TIME } from '../constants';
import { logger } from '../utils/logger';

// Import worker using Vite's worker syntax
import VideoWorker from '../worker/VideoWorker?worker';

const { MICROSECONDS_PER_SECOND } = TIME;

interface UseVideoWorkerReturn {
  state: EditorState;
  firstFrameUrl: string | null;
  initCanvas: (canvas: HTMLCanvasElement) => void;
  loadFile: (file: File) => void;
  loadBuffer: (buffer: ArrayBuffer, durationHint?: number) => void;
  startStream: (durationHint?: number) => void;
  appendStreamChunk: (chunk: ArrayBuffer, isLast?: boolean) => void;
  seek: (timeUs: number) => void;
  play: () => void;
  pause: () => void;
  setTrim: (inPoint: number, outPoint: number) => void;
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

  const [firstFrameUrl, setFirstFrameUrl] = useState<string | null>(null);
  const resetEditorState = useCallback(() => {
    setState({
      duration: 0,
      currentTime: 0,
      isPlaying: false,
      isReady: false,
      videoWidth: 0,
      videoHeight: 0,
      clip: null,
    });
  }, []);

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

        case 'FIRST_FRAME': {
          const { blob } = e.data.payload;
          setFirstFrameUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
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
      setFirstFrameUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
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
    setFirstFrameUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    resetEditorState();
    workerRef.current?.postMessage({ type: 'LOAD_FILE', payload: { file } });
  }, [resetEditorState]);

  const loadBuffer = useCallback((buffer: ArrayBuffer, durationHint?: number) => {
    setFirstFrameUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    resetEditorState();
    // Transfer the buffer to avoid copying
    workerRef.current?.postMessage(
      { type: 'LOAD_BUFFER', payload: { buffer, durationHint } },
      [buffer]
    );
  }, [resetEditorState]);

  const startStream = useCallback((durationHint?: number) => {
    setFirstFrameUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    resetEditorState();
    workerRef.current?.postMessage({ type: 'START_STREAM', payload: { durationHint } });
  }, [resetEditorState]);

  const appendStreamChunk = useCallback((chunk: ArrayBuffer, isLast?: boolean) => {
    workerRef.current?.postMessage(
      { type: 'APPEND_STREAM_CHUNK', payload: { chunk, isLast } },
      [chunk]
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

  return {
    state,
    firstFrameUrl,
    initCanvas,
    loadFile,
    loadBuffer,
    startStream,
    appendStreamChunk,
    seek,
    play,
    pause,
    setTrim,
  };
}
