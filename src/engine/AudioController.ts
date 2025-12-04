/**
 * Audio Controller
 * Manages Web Audio API for audio playback in the engine.
 * Orchestrates buffer management and scheduling modules.
 */

import type { ActiveClip } from '../core/types';
import type { AudioDataEvent } from '../workers/messages/renderMessages';
import { AudioBufferManager, AudioScheduler } from './audio';

/**
 * Controller for audio playback and scheduling using Web Audio API.
 */
export class AudioController {
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;

  // Delegate to specialized modules
  private bufferManager = new AudioBufferManager();
  private scheduler = new AudioScheduler();

  /**
   * Initialize or get the audio context.
   * Creates on first call, resumes if suspended.
   */
  ensureContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }

    // Create master gain node for volume control
    if (!this.masterGainNode && this.audioContext) {
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.connect(this.audioContext.destination);
    }

    return this.audioContext;
  }

  /**
   * Resume audio context if suspended (browser autoplay policy).
   */
  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Get current audio context time.
   */
  get currentTime(): number {
    return this.audioContext?.currentTime ?? 0;
  }

  /**
   * Get the number of currently playing audio nodes.
   */
  get playingNodeCount(): number {
    return this.scheduler.playingNodeCount;
  }

  /**
   * Get audio scheduled timing info for drift detection.
   */
  get scheduledTiming(): { atTimeUs: number; atAudioContextTime: number } {
    return this.scheduler.scheduledTiming;
  }

  /**
   * Check if audio is ready for a source.
   */
  isSourceReady(sourceId: string): boolean {
    return this.bufferManager.isSourceReady(sourceId);
  }

  /**
   * Set master volume (0-1).
   */
  setMasterVolume(volume: number): void {
    if (!this.masterGainNode && this.audioContext) {
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.connect(this.audioContext.destination);
    }
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Handle audio data received from worker.
   */
  handleAudioData(event: AudioDataEvent): void {
    const ctx = this.ensureContext();
    this.bufferManager.handleAudioData(event, ctx);
  }

  /**
   * Load an audio-only source (MP3, WAV) using Web Audio API.
   * This handles non-MP4 audio formats that can't be demuxed by the worker.
   */
  async loadAudioOnlySource(sourceId: string, buffer: ArrayBuffer): Promise<void> {
    const ctx = this.ensureContext();
    await this.bufferManager.loadAudioOnlySource(sourceId, buffer, ctx);
  }

  /**
   * Remove audio buffers for a source.
   */
  removeSource(sourceId: string): void {
    this.bufferManager.removeSource(sourceId);
  }

  /**
   * Stop all currently playing audio.
   */
  stopAll(): void {
    this.scheduler.stopAll();
  }

  /**
   * Schedule audio playback for a specific clip.
   */
  scheduleClip(clip: ActiveClip, currentTimeUs: number): void {
    if (!this.audioContext) return;

    const buffers = this.bufferManager.getBuffers(clip.sourceId);
    if (!buffers || buffers.length === 0) return;

    this.scheduler.scheduleClip(
      clip,
      currentTimeUs,
      buffers,
      this.audioContext,
      this.masterGainNode
    );
  }

  /**
   * Schedule audio for multiple clips.
   */
  scheduleAll(clips: ActiveClip[], currentTimeUs: number): void {
    if (!this.audioContext) return;

    this.scheduler.scheduleAll(
      clips,
      currentTimeUs,
      (sourceId) => this.bufferManager.getBuffers(sourceId),
      this.audioContext,
      this.masterGainNode
    );
  }

  /**
   * Dispose of all audio resources.
   */
  dispose(): void {
    this.scheduler.stopAll();
    this.bufferManager.clear();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.masterGainNode = null;
  }
}
