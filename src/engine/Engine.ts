/**
 * Video Editor - Engine
 * Main thread orchestrator for video playback and composition.
 * Coordinates between audio, video rendering, and source loading.
 */

import type { Composition } from '../core/Composition';
import type { ActiveClip } from '../core/types';
import type { HlsSource } from '../core/HlsSource';
import type { FileSource } from '../core/FileSource';
import type { RenderWorkerEvent } from '../workers/messages/renderMessages';
import { TIME } from '../constants';
import { createLogger } from '../utils/logger';

// Import engine modules
import type { EngineState, EngineOptions, EngineEventCallback } from './types';
import { AudioController } from './AudioController';
import { EngineEventEmitter } from './EngineEvents';
import { WorkerBridge } from './worker';
import { SourceLoader } from './sources';
import { PlaybackCoordinator, SyncManager } from './playback';

const logger = createLogger('Engine');

// Re-export types for external use
export type { EngineState, EngineOptions, EngineEvent, EngineEventCallback } from './types';

/**
 * Main engine class for video playback and composition orchestration.
 */
export class Engine {
  private composition: Composition;

  private _state: EngineState = 'idle';
  private _currentTimeUs = 0;
  private _isPlaying = false;

  // Modules
  private audio: AudioController;
  private events: EngineEventEmitter;
  private workerBridge: WorkerBridge;
  private sourceLoader: SourceLoader;
  private playback: PlaybackCoordinator;
  private syncManager: SyncManager;

  // Active clips state
  private lastActiveClips: ActiveClip[] = [];
  private lastHasClipsAtTime = false;
  private lastCompositionDurationUs = 0;

  constructor(options: EngineOptions) {
    this.composition = options.composition;
    this.audio = new AudioController();
    this.events = new EngineEventEmitter();
    this.workerBridge = new WorkerBridge();

    // Initialize source loader
    this.sourceLoader = new SourceLoader({
      composition: this.composition,
      events: this.events,
      audio: this.audio,
      workerBridge: this.workerBridge,
      setLoading: () => this.setState('loading'),
    });

    // Initialize playback coordinator
    this.playback = new PlaybackCoordinator({
      composition: this.composition,
      audio: this.audio,
      workerBridge: this.workerBridge,
      getCurrentTimeUs: () => this._currentTimeUs,
      setCurrentTimeUs: (timeUs) => { this._currentTimeUs = timeUs; },
      getIsPlaying: () => this._isPlaying,
      onTimeUpdate: (timeUs) => this.events.emit({ type: 'timeUpdate', currentTimeUs: timeUs }),
      onSeekStart: () => {},
      onSeekComplete: () => {},
      startSyncInterval: () => this.syncManager.start(),
      stopSyncInterval: () => this.syncManager.stop(),
      updateActiveClips: () => this.updateActiveClips(),
    });

    // Initialize sync manager
    this.syncManager = new SyncManager({
      composition: this.composition,
      audio: this.audio,
      getCurrentTimeUs: () => this._currentTimeUs,
      getIsPlaying: () => this._isPlaying,
      isSeekInProgress: () => this.playback.isSeekInProgress,
      updateActiveClips: () => this.updateActiveClips(),
      pause: () => this.pause(),
      seek: (timeUs) => this.seek(timeUs),
    });

    // Initialize worker
    this.initializeWorker(options.canvas);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeWorker(canvas: HTMLCanvasElement): void {
    const offscreenCanvas = canvas.transferControlToOffscreen();

    this.workerBridge.setMessageHandler(this.handleWorkerMessage.bind(this));
    this.workerBridge.setErrorHandler((error) => this.setError(error));
    this.workerBridge.initialize(offscreenCanvas);
  }

  private handleWorkerMessage(event: RenderWorkerEvent): void {
    switch (event.type) {
      case 'WORKER_READY':
        logger.info('RenderWorker ready');
        this.setState('ready');
        break;

      case 'SOURCE_READY': {
        const source = this.composition.getSource(event.sourceId);
        if (source && event.width && event.height) {
          source.setDimensions(event.width, event.height);
        }
        logger.info('Source ready', { sourceId: event.sourceId, durationUs: event.durationUs, width: event.width, height: event.height });
        this.events.emit({ type: 'sourceReady', sourceId: event.sourceId });
        this.events.emit({ type: 'durationChange', durationUs: this.composition.durationUs });
        break;
      }

      case 'SOURCE_PLAYABLE':
        logger.info('Source playable', { sourceId: event.sourceId });
        this.events.emit({ type: 'sourcePlayable', sourceId: event.sourceId });
        break;

      case 'TIME_UPDATE':
        this._currentTimeUs = event.currentTimeUs;
        this.events.emit({ type: 'timeUpdate', currentTimeUs: event.currentTimeUs });
        if (!this.playback.isSeekInProgress) {
          this.updateActiveClips();
        }
        break;

      case 'PLAYBACK_STATE':
        this._isPlaying = event.isPlaying;
        this.setState(event.isPlaying ? 'playing' : 'paused');
        break;

      case 'SEEK_COMPLETE':
        this.playback.handleSeekComplete(event.timeUs);
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
  // SOURCE LOADING (Delegated to SourceLoader)
  // ============================================================================

  async loadHlsSource(url: string): Promise<HlsSource> {
    return this.sourceLoader.loadHlsSource(url);
  }

  async loadFileSource(file: File): Promise<FileSource> {
    return this.sourceLoader.loadFileSource(file);
  }

  loadSourceBuffer(sourceId: string, buffer: ArrayBuffer, durationHint?: number): void {
    this.sourceLoader.loadSourceBuffer(sourceId, buffer, durationHint);
  }

  removeSource(sourceId: string): void {
    this.sourceLoader.removeSource(sourceId);
  }

  // ============================================================================
  // PLAYBACK CONTROL (Delegated to PlaybackCoordinator)
  // ============================================================================

  play(): void {
    if (this._state === 'error') return;
    this.playback.play();
  }

  pause(): void {
    this.playback.pause();
  }

  seek(timeUs: number): void {
    this.playback.seek(timeUs);
  }

  seekSeconds(seconds: number): void {
    this.playback.seekSeconds(seconds);
  }

  togglePlayPause(): void {
    this.playback.togglePlayPause();
  }

  setMasterVolume(volume: number): void {
    this.audio.setMasterVolume(volume);
  }

  // ============================================================================
  // ACTIVE CLIPS
  // ============================================================================

  private updateActiveClips(): void {
    if (!this.workerBridge.isInitialized) return;

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

    this.workerBridge.postCommand({
      type: 'SET_ACTIVE_CLIPS',
      clips: activeClips,
      hasClipsAtTime,
      compositionDurationUs,
    });

    if (clipsChanged) {
      this.audio.stopAll();
      if (this._isPlaying && !this.playback.isSeekInProgress) {
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
    this.syncManager.stop();
    this.audio.dispose();
    this.workerBridge.terminate();
    this.events.clear();
    this._state = 'idle';
  }
}
