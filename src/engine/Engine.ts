/**
 * Video Editor - Engine
 * Main thread orchestrator for video playback and composition.
 */

import type { Composition } from '../core/Composition';
import type { ActiveClip } from '../core/types';
import { HlsSource } from '../core/HlsSource';
import { FileSource } from '../core/FileSource';
import type { RenderWorkerCommand, RenderWorkerEvent } from '../workers/messages/renderMessages';
import { TIME, PLAYBACK } from '../constants';
import { createLogger } from '../utils/logger';

// Import refactored modules
import type { EngineState, EngineOptions, EngineEventCallback } from './types';
import { AudioController } from './AudioController';
import { EngineEventEmitter } from './EngineEvents';

const logger = createLogger('Engine');

// Re-export types for external use
export type { EngineState, EngineOptions, EngineEvent, EngineEventCallback } from './types';

/**
 * Main engine class for video playback and composition orchestration.
 */
export class Engine {
  private composition: Composition;
  private worker: Worker | null = null;
  private offscreenCanvas: OffscreenCanvas | null = null;

  private _state: EngineState = 'idle';
  private _currentTimeUs = 0;
  private _isPlaying = false;

  // Refactored modules
  private audio: AudioController;
  private events: EngineEventEmitter;

  // Sync state
  private syncIntervalId: number | null = null;
  private lastActiveClips: ActiveClip[] = [];
  private lastHasClipsAtTime = false;
  private lastCompositionDurationUs = 0;

  // Seek acknowledgment state
  private pendingSeekTimeUs: number | null = null;
  private isSeekingWhilePlaying = false;
  private seekInProgress = false;

  constructor(options: EngineOptions) {
    this.composition = options.composition;
    this.audio = new AudioController();
    this.events = new EngineEventEmitter();

    this.initializeCanvas(options.canvas);
    this.initializeWorker();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeCanvas(canvas: HTMLCanvasElement): void {
    this.offscreenCanvas = canvas.transferControlToOffscreen();
  }

  private initializeWorker(): void {
    this.worker = new Worker(
      new URL('../workers/render/RenderWorker.ts', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    this.worker.onerror = (err) => {
      logger.error('Worker error', { error: err.message });
      this.setError(`Worker error: ${err.message}`);
    };

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
        this.events.emit({ type: 'sourceReady', sourceId: event.sourceId });
        this.events.emit({ type: 'durationChange', durationUs: this.composition.durationUs });
        break;

      case 'SOURCE_PLAYABLE':
        logger.info('Source playable', { sourceId: event.sourceId });
        this.events.emit({ type: 'sourcePlayable', sourceId: event.sourceId });
        break;

      case 'TIME_UPDATE':
        this._currentTimeUs = event.currentTimeUs;
        this.events.emit({ type: 'timeUpdate', currentTimeUs: event.currentTimeUs });
        if (!this.seekInProgress) {
          this.updateActiveClips();
        }
        break;

      case 'PLAYBACK_STATE':
        this._isPlaying = event.isPlaying;
        this.setState(event.isPlaying ? 'playing' : 'paused');
        break;

      case 'SEEK_COMPLETE':
        this.seekInProgress = false;
        if (
          this.isSeekingWhilePlaying &&
          this.pendingSeekTimeUs === event.timeUs &&
          this._isPlaying
        ) {
          const clips = this.composition.getActiveClipsAt(this._currentTimeUs);
          this.audio.scheduleAll(clips, this._currentTimeUs);
        }
        this.pendingSeekTimeUs = null;
        this.isSeekingWhilePlaying = false;
        break;

      case 'AUDIO_DATA':
        this.audio.handleAudioData(event);
        break;

      case 'ERROR':
        logger.error('Worker error', { message: event.message, sourceId: event.sourceId });
        if (event.sourceId) {
          this.events.emit({ type: 'sourceError', sourceId: event.sourceId, message: event.message });
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
    this.events.emit({ type: 'stateChange', state });
  }

  private setError(message: string): void {
    this._state = 'error';
    this.events.emit({ type: 'error', message });
  }

  // ============================================================================
  // SOURCE LOADING
  // ============================================================================

  async loadHlsSource(url: string): Promise<HlsSource> {
    const source = new HlsSource(url);
    this.composition.registerSource(source);

    if (this.worker) {
      const cmd: RenderWorkerCommand = {
        type: 'START_SOURCE_STREAM',
        sourceId: source.id,
        durationHint: undefined,
      };
      this.worker.postMessage(cmd);
    }

    source.on((event) => {
      switch (event.type) {
        case 'progress':
          this.events.emit({
            type: 'sourceLoading',
            sourceId: source.id,
            progress: event.total > 0 ? event.loaded / event.total : 0,
          });
          break;

        case 'stateChange':
          if (event.state === 'playable') {
            this.events.emit({ type: 'sourcePlayable', sourceId: source.id });
          } else if (event.state === 'ready') {
            this.events.emit({ type: 'sourceReady', sourceId: source.id });
          } else if (event.state === 'error') {
            this.events.emit({
              type: 'sourceError',
              sourceId: source.id,
              message: source.errorMessage ?? 'Unknown error',
            });
          }
          break;

        case 'chunk':
          this.appendSourceChunk(source.id, event.chunk, event.isLast);
          break;
      }
    });

    this.setState('loading');
    await source.load();

    return source;
  }

  async loadFileSource(file: File): Promise<FileSource> {
    const source = new FileSource(file);
    this.composition.registerSource(source);

    source.on((event) => {
      switch (event.type) {
        case 'progress':
          this.events.emit({
            type: 'sourceLoading',
            sourceId: source.id,
            progress: event.total > 0 ? event.loaded / event.total : 0,
          });
          break;

        case 'stateChange':
          if (event.state === 'ready') {
            const buffer = source.getBuffer();
            if (buffer) {
              if (source.isAudioOnly) {
                this.loadAudioOnlySource(source.id, buffer);
              } else {
                this.loadSourceBuffer(source.id, buffer, source.durationUs);
              }
            }
            this.events.emit({ type: 'sourceReady', sourceId: source.id });
          } else if (event.state === 'error') {
            this.events.emit({
              type: 'sourceError',
              sourceId: source.id,
              message: source.errorMessage ?? 'Unknown error',
            });
          }
          break;
      }
    });

    this.setState('loading');
    await source.load();

    return source;
  }

  private async loadAudioOnlySource(sourceId: string, buffer: ArrayBuffer): Promise<void> {
    try {
      await this.audio.loadAudioOnlySource(sourceId, buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decode audio';
      this.events.emit({ type: 'sourceError', sourceId, message });
    }
  }

  private appendSourceChunk(sourceId: string, chunk: ArrayBuffer, isLast: boolean): void {
    if (!this.worker) return;

    const clonedChunk = chunk.slice(0);
    const cmd: RenderWorkerCommand = {
      type: 'APPEND_SOURCE_CHUNK',
      sourceId,
      chunk: clonedChunk,
      isLast,
    };
    this.worker.postMessage(cmd, [clonedChunk]);
  }

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

  removeSource(sourceId: string): void {
    const source = this.composition.getSource(sourceId);
    if (source) {
      source.dispose();
      this.composition.unregisterSource(sourceId);
    }

    this.audio.removeSource(sourceId);

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

  play(): void {
    if (!this.worker || this._state === 'error') return;

    this.audio.ensureContext();
    this.audio.resume();
    this.updateActiveClips();

    const cmd: RenderWorkerCommand = { type: 'PLAY' };
    this.worker.postMessage(cmd);

    const clips = this.composition.getActiveClipsAt(this._currentTimeUs);
    this.audio.scheduleAll(clips, this._currentTimeUs);
    this.startSyncInterval();
  }

  pause(): void {
    if (!this.worker) return;

    const cmd: RenderWorkerCommand = { type: 'PAUSE' };
    this.worker.postMessage(cmd);

    this.stopSyncInterval();
    this.audio.stopAll();
  }

  seek(timeUs: number): void {
    if (!this.worker) return;

    this.seekInProgress = true;
    const clampedTime = Math.max(0, Math.min(timeUs, this.composition.durationUs));
    this._currentTimeUs = clampedTime;

    this.audio.stopAll();
    this.updateActiveClips();

    this.isSeekingWhilePlaying = this._isPlaying;
    this.pendingSeekTimeUs = clampedTime;

    const cmd: RenderWorkerCommand = {
      type: 'SEEK',
      timeUs: clampedTime,
    };
    this.worker.postMessage(cmd);

    this.events.emit({ type: 'timeUpdate', currentTimeUs: clampedTime });
  }

  seekSeconds(seconds: number): void {
    this.seek(Math.round(seconds * TIME.US_PER_SECOND));
  }

  togglePlayPause(): void {
    if (this._isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  setMasterVolume(volume: number): void {
    this.audio.setMasterVolume(volume);
  }

  // ============================================================================
  // ACTIVE CLIPS
  // ============================================================================

  private updateActiveClips(): void {
    if (!this.worker) return;

    const activeClips = this.composition.getActiveClipsAt(this._currentTimeUs);
    const hasClipsAtTime = activeClips.length > 0;
    const compositionDurationUs = this.composition.durationUs;

    const clipsChanged = !this.activeClipsEqual(activeClips, this.lastActiveClips);
    const hasClipsChanged = hasClipsAtTime !== this.lastHasClipsAtTime;
    const durationChanged = compositionDurationUs !== this.lastCompositionDurationUs;

    if (!clipsChanged && !hasClipsChanged && !durationChanged) {
      return;
    }

    this.lastActiveClips = activeClips;
    this.lastHasClipsAtTime = hasClipsAtTime;
    this.lastCompositionDurationUs = compositionDurationUs;

    const cmd: RenderWorkerCommand = {
      type: 'SET_ACTIVE_CLIPS',
      clips: activeClips,
      hasClipsAtTime,
      compositionDurationUs,
    };
    this.worker.postMessage(cmd);

    if (clipsChanged) {
      this.audio.stopAll();
      if (this._isPlaying && !this.seekInProgress) {
        this.audio.scheduleAll(activeClips, this._currentTimeUs);
      }
    }
  }

  private activeClipsEqual(a: ActiveClip[], b: ActiveClip[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i]!.clipId !== b[i]!.clipId) return false;
    }
    return true;
  }

  forceUpdateActiveClips(): void {
    this.lastActiveClips = [];
    this.lastHasClipsAtTime = false;
    this.lastCompositionDurationUs = 0;
    this.updateActiveClips();
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
    if (this._currentTimeUs >= this.composition.durationUs) {
      this.pause();
      this.seek(this.composition.durationUs);
      return;
    }

    if (this.seekInProgress) return;

    this.updateActiveClips();

    // Check for audio-video drift
    const minStablePlaybackMs = 200;
    const { atTimeUs, atAudioContextTime } = this.audio.scheduledTiming;
    const playbackElapsedMs = this.audio.currentTime
      ? (this.audio.currentTime - atAudioContextTime) * 1000
      : 0;

    if (
      this._isPlaying &&
      this.audio.playingNodeCount > 0 &&
      atAudioContextTime > 0 &&
      playbackElapsedMs > minStablePlaybackMs
    ) {
      const expectedVideoTimeUs = this._currentTimeUs;
      const audioElapsed = this.audio.currentTime - atAudioContextTime;
      const expectedAudioTimeUs = atTimeUs + audioElapsed * TIME.US_PER_SECOND;
      const driftUs = Math.abs(expectedVideoTimeUs - expectedAudioTimeUs);

      if (driftUs > PLAYBACK.AUDIO_DRIFT_THRESHOLD_US) {
        logger.warn('Audio drift detected, rescheduling', {
          driftUs,
          expectedVideoTimeUs,
          expectedAudioTimeUs,
          playbackElapsedMs,
        });
        this.audio.stopAll();
        const clips = this.composition.getActiveClipsAt(this._currentTimeUs);
        this.audio.scheduleAll(clips, this._currentTimeUs);
      }
    }
  }

  // ============================================================================
  // EVENT SYSTEM
  // ============================================================================

  on(callback: EngineEventCallback): () => void {
    return this.events.on(callback);
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  dispose(): void {
    this.pause();
    this.stopSyncInterval();
    this.audio.dispose();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.events.clear();
    this._state = 'idle';
  }
}
