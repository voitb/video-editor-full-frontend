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
  AudioDataEvent,
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
  private masterGainNode: GainNode | null = null;
  private audioBuffers: Map<string, { buffer: AudioBuffer; timestampUs: number }[]> = new Map();
  private audioReady: Map<string, boolean> = new Map();
  private currentAudioNodes: Map<string, AudioBufferSourceNode> = new Map();
  private gainNodes: Map<string, GainNode> = new Map();

  // Sync state
  private syncIntervalId: number | null = null;
  private lastActiveClips: ActiveClip[] = [];
  private lastHasClipsAtTime = false;
  private lastCompositionDurationUs = 0;

  // Seek acknowledgment state
  private pendingSeekTimeUs: number | null = null;
  private isSeekingWhilePlaying = false;
  private seekInProgress = false;

  // Audio-video drift tracking
  private audioScheduledAtTimeUs = 0;
  private audioScheduledAtAudioContextTime = 0;

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
        // Don't update active clips during seek - wait for SEEK_COMPLETE
        // This prevents audio state corruption from TIME_UPDATE events arriving during seek
        if (!this.seekInProgress) {
          this.updateActiveClips();
        }
        break;

      case 'PLAYBACK_STATE':
        this._isPlaying = event.isPlaying;
        this.setState(event.isPlaying ? 'playing' : 'paused');
        break;

      case 'SEEK_COMPLETE':
        // Unlock audio operations - seek is complete
        this.seekInProgress = false;

        // Only schedule audio if we were playing when seek started
        // and we're still at the seek position and still playing
        if (
          this.isSeekingWhilePlaying &&
          this.pendingSeekTimeUs === event.timeUs &&
          this._isPlaying
        ) {
          this.scheduleAllAudio();
        }
        this.pendingSeekTimeUs = null;
        this.isSeekingWhilePlaying = false;
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

    // CRITICAL: Register source with worker IMMEDIATELY before any chunks arrive
    // This fixes the race condition where chunks were sent before source was registered
    if (this.worker) {
      const cmd: RenderWorkerCommand = {
        type: 'START_SOURCE_STREAM',
        sourceId: source.id,
        durationHint: undefined, // Will be updated when playable
      };
      this.worker.postMessage(cmd);
    }

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
            // Source is already registered with worker (done upfront)
            // Just emit the playable event
            this.emit({ type: 'sourcePlayable', sourceId: source.id });
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

    // Remove audio buffers for this source
    this.audioBuffers.delete(sourceId);
    this.audioReady.delete(sourceId);

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

    // Create master gain node for volume control
    if (!this.masterGainNode && this.audioContext) {
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.connect(this.audioContext.destination);
    }

    // Resume audio context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Update active clips before playing
    this.updateActiveClips();

    // Start playback
    const cmd: RenderWorkerCommand = { type: 'PLAY' };
    this.worker.postMessage(cmd);

    // Schedule audio for all active clips
    this.scheduleAllAudio();

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

    // Lock audio operations during seek to prevent race conditions
    this.seekInProgress = true;

    // Clamp to valid range
    const clampedTime = Math.max(0, Math.min(timeUs, this.composition.durationUs));
    this._currentTimeUs = clampedTime;

    // Stop current audio immediately
    this.stopAllAudio();

    // Update active clips FIRST (before seek) to ensure worker has correct clips for rendering
    this.updateActiveClips();

    // Track if we need to reschedule audio after seek completes
    // DON'T schedule audio here - wait for SEEK_COMPLETE event from worker
    // This ensures audio starts only after video is at correct position
    this.isSeekingWhilePlaying = this._isPlaying;
    this.pendingSeekTimeUs = clampedTime;

    // Then send seek command
    const cmd: RenderWorkerCommand = {
      type: 'SEEK',
      timeUs: clampedTime,
    };
    this.worker.postMessage(cmd);

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

  /**
   * Set master volume (0-1)
   */
  setMasterVolume(volume: number): void {
    // Create master gain node if it doesn't exist yet
    if (!this.masterGainNode && this.audioContext) {
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.connect(this.audioContext.destination);
    }
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = Math.max(0, Math.min(1, volume));
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
    const hasClipsAtTime = activeClips.length > 0;
    const compositionDurationUs = this.composition.durationUs;

    // Only update if clips, hasClipsAtTime, or duration changed
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

    // Always stop audio when clips change - prevents stale audio nodes
    // This handles entering/exiting clips both during playback and when paused
    if (clipsChanged) {
      this.stopAllAudio();
      // Only reschedule if playing and not in the middle of a seek
      // Use seekInProgress flag instead of pendingSeekTimeUs for more reliable locking
      if (this._isPlaying && !this.seekInProgress) {
        this.scheduleAllAudio();
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

  /**
   * Force update active clips to worker.
   * Call this after modifying clip trim points or any composition change.
   */
  forceUpdateActiveClips(): void {
    // Reset cached state to force update
    this.lastActiveClips = [];
    this.lastHasClipsAtTime = false;
    this.lastCompositionDurationUs = 0;
    this.updateActiveClips();

    // Don't clamp playhead during trim operations - let the user decide
    // if they want to seek. The playhead should stay where it is.
  }

  // ============================================================================
  // AUDIO HANDLING
  // ============================================================================

  private handleAudioData(event: AudioDataEvent): void {
    if (!this.audioContext) {
      // Create audio context if not exists (will be resumed on first play)
      this.audioContext = new AudioContext();
    }

    const { sourceId, audioData, sampleRate, channels, timestampUs, isComplete } = event;

    // If this is the completion marker, mark source as audio-ready
    if (isComplete) {
      this.audioReady.set(sourceId, true);
      logger.info('Audio decoding complete', { sourceId });
      return;
    }

    // Skip empty buffers
    if (audioData.byteLength === 0) return;

    // Convert ArrayBuffer to AudioBuffer
    const pcmData = new Float32Array(audioData);
    const frameCount = Math.floor(pcmData.length / channels);

    if (frameCount === 0) return;

    const audioBuffer = this.audioContext.createBuffer(channels, frameCount, sampleRate);

    // Copy interleaved PCM data to separate channels
    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = pcmData[i * channels + ch] ?? 0;
      }
    }

    // Store buffer with timestamp
    if (!this.audioBuffers.has(sourceId)) {
      this.audioBuffers.set(sourceId, []);
    }
    this.audioBuffers.get(sourceId)!.push({ buffer: audioBuffer, timestampUs });

    logger.info('Buffered audio', {
      sourceId,
      timestampUs,
      frames: frameCount,
      channels,
      sampleRate,
      totalBuffers: this.audioBuffers.get(sourceId)!.length,
    });
  }

  private stopAllAudio(): void {
    // Stop all playing audio source nodes
    for (const source of this.currentAudioNodes.values()) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Ignore errors if already stopped
      }
    }
    this.currentAudioNodes.clear();

    // Disconnect gain nodes
    for (const gain of this.gainNodes.values()) {
      try {
        gain.disconnect();
      } catch {
        // Ignore errors
      }
    }
    this.gainNodes.clear();

    // Reset drift tracking to prevent false positives after resume
    // This ensures the next scheduleAllAudio() starts fresh
    this.audioScheduledAtTimeUs = 0;
    this.audioScheduledAtAudioContextTime = 0;
  }

  /**
   * Schedule audio playback for a specific clip
   */
  private scheduleAudio(clip: ActiveClip): void {
    if (!this.audioContext) return;

    // CRITICAL: Only play audio for clips on audio tracks
    // Video track clips should not produce audio - audio comes from audio tracks only
    if (clip.trackType !== 'audio') return;

    // NOTE: We don't validate clip timing here because scheduleAllAudio() already
    // queries fresh clips from composition.getActiveClipsAt(). Adding validation
    // here caused false rejections due to timing edge cases.

    const buffers = this.audioBuffers.get(clip.sourceId);
    if (!buffers || buffers.length === 0) {
      logger.info('No audio buffers for source', { sourceId: clip.sourceId });
      return;
    }

    // Create gain node for clip volume control
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = clip.volume;
    // Route through master gain node for global volume control
    gainNode.connect(this.masterGainNode ?? this.audioContext.destination);
    this.gainNodes.set(clip.clipId, gainNode);

    // Calculate the source time we need to start from
    const sourceTimeUs = this._currentTimeUs - clip.timelineStartUs + clip.sourceStartUs;
    const currentAudioTime = this.audioContext.currentTime;

    logger.info('Scheduling audio', {
      clipId: clip.clipId,
      sourceId: clip.sourceId,
      sourceTimeUs,
      currentTimeUs: this._currentTimeUs,
      buffersCount: buffers.length,
      volume: clip.volume,
    });

    // Find and schedule audio buffers
    for (let i = 0; i < buffers.length; i++) {
      const { buffer, timestampUs } = buffers[i]!;

      // Calculate when this buffer should play relative to the source time
      const bufferStartInSourceUs = timestampUs;
      const bufferEndInSourceUs = timestampUs + (buffer.duration * TIME.US_PER_SECOND);

      // Skip buffers that end before our current position
      if (bufferEndInSourceUs < sourceTimeUs) continue;

      // Skip buffers that start after the clip ends
      const clipEndSourceUs = clip.sourceEndUs;
      if (bufferStartInSourceUs >= clipEndSourceUs) continue;

      // Create source node
      const sourceNode = this.audioContext.createBufferSource();
      sourceNode.buffer = buffer;
      sourceNode.connect(gainNode);

      // Calculate offset and start time
      let offsetInBuffer = 0;
      let startDelay = 0;

      if (bufferStartInSourceUs < sourceTimeUs) {
        // Buffer started before current time - need to skip into it
        offsetInBuffer = (sourceTimeUs - bufferStartInSourceUs) / TIME.US_PER_SECOND;
      } else {
        // Buffer starts after current time - schedule for future
        startDelay = (bufferStartInSourceUs - sourceTimeUs) / TIME.US_PER_SECOND;
      }

      // Calculate duration to play (accounting for clip boundaries)
      const remainingBufferDuration = buffer.duration - offsetInBuffer;
      const timeUntilClipEnd = (clipEndSourceUs - Math.max(bufferStartInSourceUs, sourceTimeUs)) / TIME.US_PER_SECOND;
      const playDuration = Math.min(remainingBufferDuration, timeUntilClipEnd);

      if (playDuration <= 0) continue;

      // Start the audio source
      sourceNode.start(currentAudioTime + startDelay, offsetInBuffer, playDuration);

      // Store reference for cleanup
      this.currentAudioNodes.set(`${clip.clipId}-${i}`, sourceNode);
    }
  }

  /**
   * Schedule audio for all active clips
   */
  private scheduleAllAudio(): void {
    // CRITICAL: Query fresh clips instead of using cached lastActiveClips
    // This prevents scheduling wrong audio after seek or clip changes
    const currentActiveClips = this.composition.getActiveClipsAt(this._currentTimeUs);

    // Update cache to stay in sync
    this.lastActiveClips = currentActiveClips;

    // Record timing for drift detection
    this.audioScheduledAtTimeUs = this._currentTimeUs;
    this.audioScheduledAtAudioContextTime = this.audioContext?.currentTime ?? 0;

    logger.info('Scheduling all audio', {
      currentTimeUs: this._currentTimeUs,
      clipCount: currentActiveClips.length,
      audioClips: currentActiveClips.filter(c => c.trackType === 'audio').map(c => c.clipId),
    });

    for (const clip of currentActiveClips) {
      this.scheduleAudio(clip);
    }
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

    // Don't run sync checks during seek - wait for seek to complete
    if (this.seekInProgress) return;

    // Update active clips periodically
    this.updateActiveClips();

    // Check for audio-video drift during playback
    // Only check drift if we've been playing for a bit (avoid initial sync issues)
    const minStablePlaybackMs = 200;
    const playbackElapsedMs = this.audioContext?.currentTime
      ? (this.audioContext.currentTime - this.audioScheduledAtAudioContextTime) * 1000
      : 0;

    if (
      this._isPlaying &&
      this.audioContext &&
      this.currentAudioNodes.size > 0 &&
      this.audioScheduledAtAudioContextTime > 0 &&
      playbackElapsedMs > minStablePlaybackMs // Wait for stable playback before checking drift
    ) {
      const expectedVideoTimeUs = this._currentTimeUs;
      const audioElapsed = this.audioContext.currentTime - this.audioScheduledAtAudioContextTime;
      const expectedAudioTimeUs = this.audioScheduledAtTimeUs + audioElapsed * TIME.US_PER_SECOND;
      const driftUs = Math.abs(expectedVideoTimeUs - expectedAudioTimeUs);

      // If drift exceeds threshold, reschedule audio
      if (driftUs > PLAYBACK.AUDIO_DRIFT_THRESHOLD_US) {
        logger.warn('Audio drift detected, rescheduling', {
          driftUs,
          expectedVideoTimeUs,
          expectedAudioTimeUs,
          playbackElapsedMs,
        });
        this.stopAllAudio();
        this.scheduleAllAudio();
      }
    }
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

    // Clear audio buffers
    this.audioBuffers.clear();
    this.audioReady.clear();

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
