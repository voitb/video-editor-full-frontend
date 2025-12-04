/**
 * Audio Scheduler
 * Handles scheduling of audio playback for clips.
 */

import type { ActiveClip } from '../../core/types';
import type { TimestampedAudioBuffer } from '../types';
import { TIME } from '../../constants';
import { createLogger } from '../../utils/logger';

const logger = createLogger('AudioScheduler');

/**
 * Manages scheduling of audio playback.
 */
export class AudioScheduler {
  // Currently playing audio nodes
  private currentAudioNodes: Map<string, AudioBufferSourceNode> = new Map();
  private gainNodes: Map<string, GainNode> = new Map();

  // Audio-video drift tracking
  private audioScheduledAtTimeUs = 0;
  private audioScheduledAtAudioContextTime = 0;

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
   * Schedule audio playback for a specific clip.
   */
  scheduleClip(
    clip: ActiveClip,
    currentTimeUs: number,
    buffers: TimestampedAudioBuffer[],
    audioContext: AudioContext,
    masterGainNode: GainNode | null
  ): void {
    // Only play audio for clips on audio tracks
    if (clip.trackType !== 'audio') return;

    if (buffers.length === 0) {
      logger.info('No audio buffers for source', { sourceId: clip.sourceId });
      return;
    }

    // Create gain node for clip volume control
    const gainNode = audioContext.createGain();
    gainNode.gain.value = clip.volume;
    // Route through master gain node for global volume control
    gainNode.connect(masterGainNode ?? audioContext.destination);
    this.gainNodes.set(clip.clipId, gainNode);

    // Calculate the source time we need to start from
    const sourceTimeUs = currentTimeUs - clip.timelineStartUs + clip.sourceStartUs;
    const currentAudioTime = audioContext.currentTime;

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
      const sourceNode = audioContext.createBufferSource();
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
  scheduleAll(
    clips: ActiveClip[],
    currentTimeUs: number,
    getBuffers: (sourceId: string) => TimestampedAudioBuffer[] | undefined,
    audioContext: AudioContext,
    masterGainNode: GainNode | null
  ): void {
    // Record timing for drift detection
    this.audioScheduledAtTimeUs = currentTimeUs;
    this.audioScheduledAtAudioContextTime = audioContext.currentTime;

    logger.info('Scheduling all audio', {
      currentTimeUs,
      clipCount: clips.length,
      audioClips: clips.filter((c) => c.trackType === 'audio').map((c) => c.clipId),
    });

    for (const clip of clips) {
      const buffers = getBuffers(clip.sourceId);
      if (buffers) {
        this.scheduleClip(clip, currentTimeUs, buffers, audioContext, masterGainNode);
      }
    }
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
}
