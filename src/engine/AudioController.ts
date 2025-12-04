/**
 * Audio Controller
 * Manages Web Audio API for audio playback in the engine.
 */

import type { ActiveClip } from '../core/types';
import type { AudioDataEvent } from '../workers/messages/renderMessages';
import type { TimestampedAudioBuffer } from './types';
import { TIME } from '../constants';
import { createLogger } from '../utils/logger';

const logger = createLogger('AudioController');

/**
 * Controller for audio playback and scheduling using Web Audio API.
 */
export class AudioController {
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;

  // Audio buffer storage
  private audioBuffers: Map<string, TimestampedAudioBuffer[]> = new Map();
  private audioReady: Map<string, boolean> = new Map();

  // Currently playing audio nodes
  private currentAudioNodes: Map<string, AudioBufferSourceNode> = new Map();
  private gainNodes: Map<string, GainNode> = new Map();

  // Audio-video drift tracking
  private audioScheduledAtTimeUs = 0;
  private audioScheduledAtAudioContextTime = 0;

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
    return this.currentAudioNodes.size;
  }

  /**
   * Get audio scheduled timing info for drift detection.
   */
  get scheduledTiming(): { atTimeUs: number; atAudioContextTime: number } {
    return {
      atTimeUs: this.audioScheduledAtTimeUs,
      atAudioContextTime: this.audioScheduledAtAudioContextTime,
    };
  }

  /**
   * Check if audio is ready for a source.
   */
  isSourceReady(sourceId: string): boolean {
    return this.audioReady.get(sourceId) ?? false;
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
    this.ensureContext();

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

    const audioBuffer = this.audioContext!.createBuffer(channels, frameCount, sampleRate);

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

  /**
   * Load an audio-only source (MP3, WAV) using Web Audio API.
   * This handles non-MP4 audio formats that can't be demuxed by the worker.
   */
  async loadAudioOnlySource(sourceId: string, buffer: ArrayBuffer): Promise<void> {
    try {
      const ctx = this.ensureContext();

      // Decode audio data using Web Audio API
      const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));

      // Store the entire decoded audio as a single buffer at timestamp 0
      this.audioBuffers.set(sourceId, [{ buffer: audioBuffer, timestampUs: 0 }]);
      this.audioReady.set(sourceId, true);

      logger.info('Loaded audio-only source', {
        sourceId,
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decode audio';
      logger.error('Failed to load audio-only source', { sourceId, error: message });
      throw new Error(message);
    }
  }

  /**
   * Remove audio buffers for a source.
   */
  removeSource(sourceId: string): void {
    this.audioBuffers.delete(sourceId);
    this.audioReady.delete(sourceId);
  }

  /**
   * Stop all currently playing audio.
   */
  stopAll(): void {
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
    this.audioScheduledAtTimeUs = 0;
    this.audioScheduledAtAudioContextTime = 0;
  }

  /**
   * Schedule audio playback for a specific clip.
   */
  scheduleClip(clip: ActiveClip, currentTimeUs: number): void {
    if (!this.audioContext) return;

    // Only play audio for clips on audio tracks
    if (clip.trackType !== 'audio') return;

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
    const sourceTimeUs = currentTimeUs - clip.timelineStartUs + clip.sourceStartUs;
    const currentAudioTime = this.audioContext.currentTime;

    logger.info('Scheduling audio', {
      clipId: clip.clipId,
      sourceId: clip.sourceId,
      sourceTimeUs,
      currentTimeUs,
      buffersCount: buffers.length,
      volume: clip.volume,
    });

    // Find and schedule audio buffers
    for (let i = 0; i < buffers.length; i++) {
      const { buffer, timestampUs } = buffers[i]!;

      // Calculate when this buffer should play relative to the source time
      const bufferStartInSourceUs = timestampUs;
      const bufferEndInSourceUs = timestampUs + buffer.duration * TIME.US_PER_SECOND;

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
      const timeUntilClipEnd =
        (clipEndSourceUs - Math.max(bufferStartInSourceUs, sourceTimeUs)) / TIME.US_PER_SECOND;
      const playDuration = Math.min(remainingBufferDuration, timeUntilClipEnd);

      if (playDuration <= 0) continue;

      // Start the audio source
      sourceNode.start(currentAudioTime + startDelay, offsetInBuffer, playDuration);

      // Store reference for cleanup
      this.currentAudioNodes.set(`${clip.clipId}-${i}`, sourceNode);
    }
  }

  /**
   * Schedule audio for multiple clips.
   */
  scheduleAll(clips: ActiveClip[], currentTimeUs: number): void {
    // Record timing for drift detection
    this.audioScheduledAtTimeUs = currentTimeUs;
    this.audioScheduledAtAudioContextTime = this.audioContext?.currentTime ?? 0;

    logger.info('Scheduling all audio', {
      currentTimeUs,
      clipCount: clips.length,
      audioClips: clips.filter((c) => c.trackType === 'audio').map((c) => c.clipId),
    });

    for (const clip of clips) {
      this.scheduleClip(clip, currentTimeUs);
    }
  }

  /**
   * Dispose of all audio resources.
   */
  dispose(): void {
    this.stopAll();
    this.audioBuffers.clear();
    this.audioReady.clear();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.masterGainNode = null;
  }
}
