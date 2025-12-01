/**
 * Video Editor V2 - Engine
 * Main thread orchestrator for video playback and composition.
 */

import type { Composition } from '../core/Composition';
import type { ActiveClip } from '../core/types';
import { HlsSource } from '../core/HlsSource';
import type {
  RenderWorkerCommand,
  RenderWorkerEvent,
} from '../workers/messages/renderMessages';
import { TIME, PLAYBACK } from '../constants';
import { createLogger } from '../utils/logger';

const logger = createLogger('Engine');

// ============================================================================
// ENGINE TYPES
// ============================================================================

export type EngineState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

export interface EngineOptions {
  /** Canvas element for video preview */
  canvas: HTMLCanvasElement;
  /** Composition to render */
  composition: Composition;
}

export type EngineEvent =
  | { type: 'stateChange'; state: EngineState }
  | { type: 'timeUpdate'; currentTimeUs: number }
  | { type: 'durationChange'; durationUs: number }
  | { type: 'sourceLoading'; sourceId: string; progress: number }
  | { type: 'sourceReady'; sourceId: string }
  | { type: 'sourcePlayable'; sourceId: string }
  | { type: 'sourceError'; sourceId: string; message: string }
  | { type: 'error'; message: string };

export type EngineEventCallback = (event: EngineEvent) => void;

// ============================================================================
// ENGINE CLASS
// ============================================================================

export class Engine {
  private composition: Composition;
  private worker: Worker | null = null;
  private offscreenCanvas: OffscreenCanvas | null = null;

  private _state: EngineState = 'idle';
  private _currentTimeUs = 0;
  private _isPlaying = false;

  // Audio context for playback
  private audioContext: AudioContext | null = null;
  private audioSources: Map<string, AudioBufferSourceNode> = new Map();

  // Sync state
  private syncIntervalId: number | null = null;
  private lastActiveClips: ActiveClip[] = [];

  // Event listeners
  private listeners: Set<EngineEventCallback> = new Set();

  constructor(options: EngineOptions) {
    this.composition = options.composition;
    this.initializeCanvas(options.canvas);
    this.initializeWorker();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeCanvas(canvas: HTMLCanvasElement): void {
    // Transfer canvas control to worker
    this.offscreenCanvas = canvas.transferControlToOffscreen();
  }

  private initializeWorker(): void {
    this.worker = new Worker(
      new URL('../workers/RenderWorker.ts', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    this.worker.onerror = (err) => {
      logger.error('Worker error', { error: err.message });
      this.setError(`Worker error: ${err.message}`);
    };

    // Send canvas to worker
    if (this.offscreenCanvas) {
      const cmd: RenderWorkerCommand = {
        type: 'INIT_CANVAS',
        canvas: this.offscreenCanvas,
      };
      this.worker.postMessage(cmd, [this.offscreenCanvas]);
    }
  }

  private handleWorkerMessage(e: MessageEvent<RenderWorkerEvent>): void {
    const event = e.data;

    switch (event.type) {
      case 'WORKER_READY':
        logger.info('RenderWorker ready');
        this.setState('ready');
        break;

      case 'SOURCE_READY':
        logger.info('Source ready', { sourceId: event.sourceId, durationUs: event.durationUs });
        this.emit({ type: 'sourceReady', sourceId: event.sourceId });
        this.emit({ type: 'durationChange', durationUs: this.composition.durationUs });
        break;

      case 'SOURCE_PLAYABLE':
        logger.info('Source playable', { sourceId: event.sourceId });
        this.emit({ type: 'sourcePlayable', sourceId: event.sourceId });
        break;

      case 'TIME_UPDATE':
        this._currentTimeUs = event.currentTimeUs;
        this.emit({ type: 'timeUpdate', currentTimeUs: event.currentTimeUs });
        this.updateActiveClips();
        break;

      case 'PLAYBACK_STATE':
        this._isPlaying = event.isPlaying;
        this.setState(event.isPlaying ? 'playing' : 'paused');
        break;

      case 'AUDIO_DATA':
        this.handleAudioData(event);
        break;

      case 'ERROR':
        logger.error('Worker error', { message: event.message, sourceId: event.sourceId });
        if (event.sourceId) {
          this.emit({ type: 'sourceError', sourceId: event.sourceId, message: event.message });
        } else {
          this.setError(event.message);
        }
        break;
    }
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  get state(): EngineState {
    return this._state;
  }

  get currentTimeUs(): number {
    return this._currentTimeUs;
  }

  get currentTimeSeconds(): number {
    return this._currentTimeUs / TIME.US_PER_SECOND;
  }

  get durationUs(): number {
    return this.composition.durationUs;
  }

  get durationSeconds(): number {
    return this.composition.durationUs / TIME.US_PER_SECOND;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  private setState(state: EngineState): void {
    if (this._state === state) return;
    this._state = state;
    this.emit({ type: 'stateChange', state });
  }

  private setError(message: string): void {
    this._state = 'error';
    this.emit({ type: 'error', message });
  }

  // ============================================================================
  // SOURCE LOADING
  // ============================================================================

  /**
   * Load an HLS source
   */
  async loadHlsSource(url: string): Promise<HlsSource> {
    const source = new HlsSource(url);
    this.composition.registerSource(source);

    // Listen to source events
    source.on((event) => {
      switch (event.type) {
        case 'progress':
          this.emit({
            type: 'sourceLoading',
            sourceId: source.id,
            progress: event.total > 0 ? event.loaded / event.total : 0,
          });
          break;

        case 'stateChange':
          if (event.state === 'playable') {
            // Start streaming to worker
            this.startSourceStream(source);
          } else if (event.state === 'ready') {
            this.emit({ type: 'sourceReady', sourceId: source.id });
          } else if (event.state === 'error') {
            this.emit({ type: 'sourceError', sourceId: source.id, message: source.errorMessage ?? 'Unknown error' });
          }
          break;

        case 'chunk':
          // Append chunk to worker
          this.appendSourceChunk(source.id, event.chunk, event.isLast);
          break;
      }
    });

    // Start loading
    this.setState('loading');
    await source.load();

    return source;
  }

  /**
   * Start streaming a source to the worker
   */
  private startSourceStream(source: HlsSource): void {
    if (!this.worker) return;

    const cmd: RenderWorkerCommand = {
      type: 'START_SOURCE_STREAM',
      sourceId: source.id,
      durationHint: source.durationUs,
    };
    this.worker.postMessage(cmd);

    // Send any already-loaded chunks
    const chunks = source.getChunks();
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const isLast = i === chunks.length - 1 && source.state === 'ready';
      this.appendSourceChunk(source.id, chunk, isLast);
    }

    this.emit({ type: 'sourcePlayable', sourceId: source.id });
  }

  /**
   * Append a chunk to a streaming source
   */
  private appendSourceChunk(sourceId: string, chunk: ArrayBuffer, isLast: boolean): void {
    if (!this.worker) return;

    // Clone the buffer for transfer
    const clonedChunk = chunk.slice(0);
    const cmd: RenderWorkerCommand = {
      type: 'APPEND_SOURCE_CHUNK',
      sourceId,
      chunk: clonedChunk,
      isLast,
    };
    this.worker.postMessage(cmd, [clonedChunk]);
  }

  /**
   * Load a complete source buffer (non-streaming)
   */
  loadSourceBuffer(sourceId: string, buffer: ArrayBuffer, durationHint?: number): void {
    if (!this.worker) return;

    const clonedBuffer = buffer.slice(0);
    const cmd: RenderWorkerCommand = {
      type: 'LOAD_SOURCE',
      sourceId,
      buffer: clonedBuffer,
      durationHint,
    };
    this.worker.postMessage(cmd, [clonedBuffer]);
  }

  /**
   * Remove a source
   */
  removeSource(sourceId: string): void {
    // Remove from composition
    const source = this.composition.getSource(sourceId);
    if (source) {
      source.dispose();
      this.composition.unregisterSource(sourceId);
    }

    // Remove from worker
    if (this.worker) {
      const cmd: RenderWorkerCommand = {
        type: 'REMOVE_SOURCE',
        sourceId,
      };
      this.worker.postMessage(cmd);
    }
  }

  // ============================================================================
  // PLAYBACK CONTROL
  // ============================================================================

  /**
   * Start playback
   */
  play(): void {
    if (!this.worker || this._state === 'error') return;

    // Initialize audio context on first play (requires user gesture)
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    // Update active clips before playing
    this.updateActiveClips();

    // Start playback
    const cmd: RenderWorkerCommand = { type: 'PLAY' };
    this.worker.postMessage(cmd);

    // Start sync interval
    this.startSyncInterval();
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.worker) return;

    const cmd: RenderWorkerCommand = { type: 'PAUSE' };
    this.worker.postMessage(cmd);

    // Stop sync interval
    this.stopSyncInterval();

    // Stop all audio
    this.stopAllAudio();
  }

  /**
   * Seek to a specific time
   */
  seek(timeUs: number): void {
    if (!this.worker) return;

    // Clamp to valid range
    const clampedTime = Math.max(0, Math.min(timeUs, this.composition.durationUs));
    this._currentTimeUs = clampedTime;

    // Stop current audio
    this.stopAllAudio();

    // Send seek command
    const cmd: RenderWorkerCommand = {
      type: 'SEEK',
      timeUs: clampedTime,
    };
    this.worker.postMessage(cmd);

    // Update active clips
    this.updateActiveClips();

    // Emit time update
    this.emit({ type: 'timeUpdate', currentTimeUs: clampedTime });
  }

  /**
   * Seek to a specific time in seconds
   */
  seekSeconds(seconds: number): void {
    this.seek(Math.round(seconds * TIME.US_PER_SECOND));
  }

  /**
   * Toggle play/pause
   */
  togglePlayPause(): void {
    if (this._isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  // ============================================================================
  // ACTIVE CLIPS
  // ============================================================================

  /**
   * Update active clips in the worker
   */
  private updateActiveClips(): void {
    if (!this.worker) return;

    const activeClips = this.composition.getActiveClipsAt(this._currentTimeUs);

    // Only update if clips changed
    if (this.activeClipsEqual(activeClips, this.lastActiveClips)) {
      return;
    }

    this.lastActiveClips = activeClips;

    const cmd: RenderWorkerCommand = {
      type: 'SET_ACTIVE_CLIPS',
      clips: activeClips,
    };
    this.worker.postMessage(cmd);
  }

  private activeClipsEqual(a: ActiveClip[], b: ActiveClip[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i]!.clipId !== b[i]!.clipId) return false;
    }
    return true;
  }

  // ============================================================================
  // AUDIO HANDLING
  // ============================================================================

  private handleAudioData(event: { sourceId: string; audioData: ArrayBuffer; sampleRate: number; channels: number }): void {
    // Store audio data for later playback
    // TODO: Implement full audio engine with mixing
    logger.info('Received audio data', { sourceId: event.sourceId, channels: event.channels });
  }

  private stopAllAudio(): void {
    for (const source of this.audioSources.values()) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Ignore errors if already stopped
      }
    }
    this.audioSources.clear();
  }

  // ============================================================================
  // SYNC
  // ============================================================================

  private startSyncInterval(): void {
    if (this.syncIntervalId !== null) return;

    this.syncIntervalId = window.setInterval(() => {
      this.syncCheck();
    }, PLAYBACK.SYNC_CHECK_INTERVAL_MS);
  }

  private stopSyncInterval(): void {
    if (this.syncIntervalId !== null) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  private syncCheck(): void {
    // Check if we've reached the end
    if (this._currentTimeUs >= this.composition.durationUs) {
      this.pause();
      this.seek(this.composition.durationUs);
      return;
    }

    // Update active clips periodically
    this.updateActiveClips();
  }

  // ============================================================================
  // EVENT SYSTEM
  // ============================================================================

  /**
   * Subscribe to engine events
   */
  on(callback: EngineEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: EngineEvent): void {
    for (const callback of this.listeners) {
      try {
        callback(event);
      } catch (err) {
        logger.error('Event listener error', { error: err });
      }
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.pause();
    this.stopSyncInterval();
    this.stopAllAudio();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.listeners.clear();
    this._state = 'idle';
  }
}
