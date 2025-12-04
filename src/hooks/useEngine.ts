/**
 * Video Editor V2 - useEngine Hook
 * React hook for video playback engine.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Engine, type EngineState, type EngineEvent } from '../engine/Engine';
import type { Composition } from '../core/Composition';
import { HlsSource } from '../core/HlsSource';
import { FileSource } from '../core/FileSource';
import { TIME } from '../constants';

export interface UseEngineOptions {
  /** Composition to render */
  composition: Composition;
  /** Auto-initialize on mount */
  autoInit?: boolean;
}

export interface UseEngineReturn {
  /** Engine instance */
  engine: Engine | null;
  /** Current engine state */
  state: EngineState;
  /** Current playback time in microseconds */
  currentTimeUs: number;
  /** Current playback time in seconds */
  currentTime: number;
  /** Total duration in microseconds */
  durationUs: number;
  /** Total duration in seconds */
  duration: number;
  /** Whether currently playing */
  isPlaying: boolean;
  /** Loading progress (0-1) for sources */
  loadingProgress: Map<string, number>;
  /** Error message if any */
  error: string | null;
  /** Initialize engine with a canvas element */
  initialize: (canvas: HTMLCanvasElement) => void;
  /** Load an HLS source */
  loadHlsSource: (url: string) => Promise<HlsSource>;
  /** Load a local file source */
  loadFileSource: (file: File) => Promise<FileSource>;
  /** Play */
  play: () => void;
  /** Pause */
  pause: () => void;
  /** Toggle play/pause */
  togglePlayPause: () => void;
  /** Seek to time in microseconds */
  seek: (timeUs: number) => void;
  /** Seek to time in seconds */
  seekSeconds: (seconds: number) => void;
  /** Set master volume (0-1) */
  setMasterVolume: (volume: number) => void;
  /** Dispose engine */
  dispose: () => void;
  /** Notify engine that composition changed (e.g., after trim) */
  notifyCompositionChanged: () => void;
  /** Get source buffer for export */
  getSourceBuffer: (sourceId: string) => ArrayBuffer | null;
}

/**
 * React hook for managing the video playback engine.
 *
 * @example
 * ```tsx
 * const { composition } = useComposition();
 * const canvasRef = useRef<HTMLCanvasElement>(null);
 *
 * const {
 *   initialize,
 *   loadHlsSource,
 *   play,
 *   pause,
 *   currentTime,
 *   duration,
 *   isPlaying,
 * } = useEngine({ composition });
 *
 * useEffect(() => {
 *   if (canvasRef.current) {
 *     initialize(canvasRef.current);
 *   }
 * }, [initialize]);
 *
 * const handleLoadVideo = async () => {
 *   const source = await loadHlsSource('https://example.com/video.m3u8');
 *   // Create clip with source...
 * };
 * ```
 */
export function useEngine(options: UseEngineOptions): UseEngineReturn {
  const { composition } = options;

  const engineRef = useRef<Engine | null>(null);
  const [state, setState] = useState<EngineState>('idle');
  const [currentTimeUs, setCurrentTimeUs] = useState(0);
  const [durationUs, setDurationUs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Initialize engine with canvas
  const initialize = useCallback((canvas: HTMLCanvasElement) => {
    // Dispose existing engine
    if (engineRef.current) {
      engineRef.current.dispose();
    }

    // Create new engine
    const engine = new Engine({
      canvas,
      composition,
    });

    // Subscribe to events
    engine.on((event: EngineEvent) => {
      switch (event.type) {
        case 'stateChange':
          setState(event.state);
          if (event.state === 'playing') {
            setIsPlaying(true);
          } else if (event.state === 'paused') {
            setIsPlaying(false);
          }
          break;

        case 'timeUpdate':
          setCurrentTimeUs(event.currentTimeUs);
          break;

        case 'durationChange':
          setDurationUs(event.durationUs);
          break;

        case 'sourceLoading':
          setLoadingProgress(prev => {
            const next = new Map(prev);
            next.set(event.sourceId, event.progress);
            return next;
          });
          break;

        case 'sourceReady':
          setLoadingProgress(prev => {
            const next = new Map(prev);
            next.set(event.sourceId, 1);
            return next;
          });
          setDurationUs(composition.durationUs);
          break;

        case 'sourcePlayable':
          // Source has enough data to start playback
          break;

        case 'sourceError':
          setError(`Source ${event.sourceId}: ${event.message}`);
          break;

        case 'error':
          setError(event.message);
          break;
      }
    });

    engineRef.current = engine;
  }, [composition]);

  // Load HLS source
  const loadHlsSource = useCallback(async (url: string): Promise<HlsSource> => {
    if (!engineRef.current) {
      throw new Error('Engine not initialized');
    }
    return engineRef.current.loadHlsSource(url);
  }, []);

  // Load local file source
  const loadFileSource = useCallback(async (file: File): Promise<FileSource> => {
    if (!engineRef.current) {
      throw new Error('Engine not initialized');
    }
    return engineRef.current.loadFileSource(file);
  }, []);

  // Playback controls
  const play = useCallback(() => {
    engineRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  const togglePlayPause = useCallback(() => {
    engineRef.current?.togglePlayPause();
  }, []);

  const seek = useCallback((timeUs: number) => {
    engineRef.current?.seek(timeUs);
  }, []);

  const seekSeconds = useCallback((seconds: number) => {
    engineRef.current?.seekSeconds(seconds);
  }, []);

  const setMasterVolume = useCallback((volume: number) => {
    engineRef.current?.setMasterVolume(volume);
  }, []);

  // Dispose
  const dispose = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    setState('idle');
    setCurrentTimeUs(0);
    setIsPlaying(false);
    setError(null);
  }, []);

  // Notify composition changed (call after trim operations)
  const notifyCompositionChanged = useCallback(() => {
    engineRef.current?.forceUpdateActiveClips();
    setDurationUs(composition.durationUs);
  }, [composition]);

  // Get source buffer for export
  const getSourceBuffer = useCallback((sourceId: string): ArrayBuffer | null => {
    const source = composition.getSource(sourceId);
    if (!source) return null;
    // HlsSource has getBuffer() method
    if ('getBuffer' in source && typeof source.getBuffer === 'function') {
      return source.getBuffer();
    }
    return null;
  }, [composition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dispose();
    };
  }, [dispose]);

  return {
    engine: engineRef.current,
    state,
    currentTimeUs,
    currentTime: currentTimeUs / TIME.US_PER_SECOND,
    durationUs,
    duration: durationUs / TIME.US_PER_SECOND,
    isPlaying,
    loadingProgress,
    error,
    initialize,
    loadHlsSource,
    loadFileSource,
    play,
    pause,
    togglePlayPause,
    seek,
    seekSeconds,
    setMasterVolume,
    dispose,
    notifyCompositionChanged,
    getSourceBuffer,
  };
}
