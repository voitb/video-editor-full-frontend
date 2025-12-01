import { useEffect, useRef, useState, useCallback } from 'react';
import type { WorkerCommand, WorkerResponse, EditorState, ActiveClip, SourceAudioData, SourceState } from '../types/editor';
import { TIME } from '../constants';
import { logger } from '../utils/logger';

// Import worker using Vite's worker syntax
import VideoWorker from '../worker/VideoWorker?worker';

const { MICROSECONDS_PER_SECOND } = TIME;

interface UseVideoWorkerReturn {
  state: EditorState;
  firstFrameUrl: string | null;
  sources: Map<string, SourceState>;
  initCanvas: (canvas: HTMLCanvasElement) => void;
  loadFile: (file: File) => void;
  loadBuffer: (buffer: ArrayBuffer, durationHint?: number) => void;
  startStream: (durationHint?: number) => void;
  appendStreamChunk: (chunk: ArrayBuffer, isLast?: boolean) => void;
  seek: (timeUs: number) => void;
  play: () => void;
  pause: () => void;
  setTrim: (inPoint: number, outPoint: number) => void;
  // Multi-source API
  loadSource: (sourceId: string, file?: File, buffer?: ArrayBuffer) => void;
  removeSource: (sourceId: string) => void;
  setActiveClips: (clips: ActiveClip[]) => void;
  syncToTime: (timeUs: number) => void;
  // Streaming source API (progressive HLS)
  startSourceStream: (sourceId: string, durationHint?: number) => void;
  appendSourceChunk: (sourceId: string, chunk: ArrayBuffer, isLast?: boolean) => void;
  // Audio data callback
  onAudioData?: (data: SourceAudioData) => void;
}

export function useVideoWorker(): UseVideoWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  // Queue for canvas init message if called before worker is ready
  const pendingCanvasRef = useRef<{
    message: WorkerCommand;
    transfer: OffscreenCanvas;
  } | null>(null);

  // Audio data callback ref (allows updating without recreating worker listener)
  const audioDataCallbackRef = useRef<((data: SourceAudioData) => void) | null>(null);

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

  // Multi-source state
  const [sources, setSources] = useState<Map<string, SourceState>>(new Map());

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

        // Multi-source responses
        case 'SOURCE_READY': {
          const { sourceId, duration, width, height } = e.data.payload;
          setSources((prev) => {
            const next = new Map(prev);
            next.set(sourceId, {
              sourceId,
              durationUs: duration * MICROSECONDS_PER_SECOND,
              width,
              height,
              isReady: true,
            });
            return next;
          });
          logger.log(`Source ready: ${sourceId}`, { duration, width, height });
          break;
        }

        case 'SOURCE_PLAYABLE': {
          const { sourceId, duration, width, height, loadedSamples } = e.data.payload;
          setSources((prev) => {
            const next = new Map(prev);
            // Mark as ready when playable (even though still loading)
            next.set(sourceId, {
              sourceId,
              durationUs: duration * MICROSECONDS_PER_SECOND,
              width,
              height,
              isReady: true,
            });
            return next;
          });
          logger.log(`Source playable: ${sourceId}`, { duration, width, height, loadedSamples });
          break;
        }

        case 'SOURCE_REMOVED': {
          const { sourceId } = e.data.payload;
          setSources((prev) => {
            const next = new Map(prev);
            next.delete(sourceId);
            return next;
          });
          logger.log(`Source removed: ${sourceId}`);
          break;
        }

        case 'AUDIO_DATA': {
          const audioData = e.data.payload;
          logger.log(`Audio data received for source: ${audioData.sourceId}`);
          audioDataCallbackRef.current?.(audioData);
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

  // Multi-source commands
  const loadSource = useCallback((sourceId: string, file?: File, buffer?: ArrayBuffer) => {
    if (buffer) {
      // Transfer the buffer to avoid copying
      workerRef.current?.postMessage(
        { type: 'LOAD_SOURCE', payload: { sourceId, buffer } },
        [buffer]
      );
    } else if (file) {
      workerRef.current?.postMessage({ type: 'LOAD_SOURCE', payload: { sourceId, file } });
    }
  }, []);

  const removeSource = useCallback((sourceId: string) => {
    workerRef.current?.postMessage({ type: 'REMOVE_SOURCE', payload: { sourceId } });
  }, []);

  const setActiveClips = useCallback((clips: ActiveClip[]) => {
    workerRef.current?.postMessage({ type: 'SET_ACTIVE_CLIPS', payload: { clips } });
  }, []);

  const syncToTime = useCallback((timeUs: number) => {
    workerRef.current?.postMessage({ type: 'SYNC_TO_TIME', payload: { timeUs } });
  }, []);

  // Streaming source API (progressive HLS)
  const startSourceStream = useCallback((sourceId: string, durationHint?: number) => {
    workerRef.current?.postMessage({
      type: 'START_SOURCE_STREAM',
      payload: { sourceId, durationHint },
    });
  }, []);

  const appendSourceChunk = useCallback((sourceId: string, chunk: ArrayBuffer, isLast?: boolean) => {
    // Transfer the chunk to avoid copying
    workerRef.current?.postMessage(
      { type: 'APPEND_SOURCE_CHUNK', payload: { sourceId, chunk, isLast } },
      [chunk]
    );
  }, []);

  // Setter for audio data callback
  const setOnAudioData = useCallback((callback: ((data: SourceAudioData) => void) | undefined) => {
    audioDataCallbackRef.current = callback ?? null;
  }, []);

  return {
    state,
    firstFrameUrl,
    sources,
    initCanvas,
    loadFile,
    loadBuffer,
    startStream,
    appendStreamChunk,
    seek,
    play,
    pause,
    setTrim,
    // Multi-source API
    loadSource,
    removeSource,
    setActiveClips,
    syncToTime,
    // Streaming source API (progressive HLS)
    startSourceStream,
    appendSourceChunk,
    // Audio data callback setter
    set onAudioData(callback: ((data: SourceAudioData) => void) | undefined) {
      setOnAudioData(callback);
    },
  };
}
