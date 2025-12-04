/**
 * Audio Buffer Manager
 * Handles storage, loading, and management of audio buffers.
 */

import type { AudioDataEvent } from '../../workers/messages/renderMessages';
import type { TimestampedAudioBuffer } from '../types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('AudioBufferManager');

/**
 * Manages audio buffer storage and loading.
 */
export class AudioBufferManager {
  // Audio buffer storage by source ID
  private audioBuffers: Map<string, TimestampedAudioBuffer[]> = new Map();
  private audioReady: Map<string, boolean> = new Map();

  /**
   * Check if audio is ready for a source.
   */
  isSourceReady(sourceId: string): boolean {
    return this.audioReady.get(sourceId) ?? false;
  }

  /**
   * Get audio buffers for a source.
   */
  getBuffers(sourceId: string): TimestampedAudioBuffer[] | undefined {
    return this.audioBuffers.get(sourceId);
  }

  /**
   * Handle audio data received from worker.
   */
  handleAudioData(event: AudioDataEvent, audioContext: AudioContext): void {
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

    const audioBuffer = audioContext.createBuffer(channels, frameCount, sampleRate);

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
  async loadAudioOnlySource(
    sourceId: string,
    buffer: ArrayBuffer,
    audioContext: AudioContext
  ): Promise<void> {
    try {
      // Decode audio data using Web Audio API
      const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));

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
   * Clear all stored buffers.
   */
  clear(): void {
    this.audioBuffers.clear();
    this.audioReady.clear();
  }
}
