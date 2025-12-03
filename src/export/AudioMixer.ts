/**
 * Video Editor - Audio Mixer
 * Uses OfflineAudioContext to mix multiple audio clips for export.
 */

import type { ClipJSON, TrackJSON } from '../core/types';
import { EXPORT } from '../constants';

/** Audio clip data with decoded buffer */
export interface AudioClipData {
  /** Clip ID */
  clipId: string;
  /** Source ID */
  sourceId: string;
  /** Decoded audio buffer */
  audioBuffer: AudioBuffer;
  /** Position on timeline in microseconds */
  startUs: number;
  /** Trim in-point in source (microseconds) */
  trimIn: number;
  /** Trim out-point in source (microseconds) */
  trimOut: number;
  /** Volume (0-1) */
  volume: number;
}

/** Result of audio mixing */
export interface MixedAudio {
  /** Interleaved stereo PCM data (Float32Array) */
  pcmData: Float32Array;
  /** Sample rate */
  sampleRate: number;
  /** Number of channels (always 2 for stereo) */
  channels: number;
  /** Duration in microseconds */
  durationUs: number;
}

/**
 * Mix multiple audio clips into a single stereo output using OfflineAudioContext.
 */
export class AudioMixer {
  private sampleRate: number;
  private channels: number;

  constructor(sampleRate = EXPORT.DEFAULT_AUDIO_SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.channels = EXPORT.AUDIO_CHANNELS;
  }

  /**
   * Mix audio clips within a time range.
   * @param clips - Array of audio clip data with decoded buffers
   * @param inPointUs - Export start time in microseconds
   * @param outPointUs - Export end time in microseconds
   * @returns Mixed stereo audio
   */
  async mix(
    clips: AudioClipData[],
    inPointUs: number,
    outPointUs: number
  ): Promise<MixedAudio> {
    const durationUs = outPointUs - inPointUs;
    const durationSec = durationUs / 1_000_000;

    // Create offline context for rendering
    const offlineCtx = new OfflineAudioContext(
      this.channels,
      Math.ceil(durationSec * this.sampleRate),
      this.sampleRate
    );

    // Schedule each clip
    for (const clip of clips) {
      await this.scheduleClip(offlineCtx, clip, inPointUs, outPointUs);
    }

    // Render the mixed audio
    const renderedBuffer = await offlineCtx.startRendering();

    // Convert to interleaved stereo
    const pcmData = this.interleaveChannels(renderedBuffer);

    return {
      pcmData,
      sampleRate: this.sampleRate,
      channels: this.channels,
      durationUs,
    };
  }

  /**
   * Schedule a single clip in the offline context.
   */
  private async scheduleClip(
    ctx: OfflineAudioContext,
    clip: AudioClipData,
    inPointUs: number,
    outPointUs: number
  ): Promise<void> {
    const { audioBuffer, startUs, trimIn, trimOut, volume } = clip;

    // Calculate clip's effective range on timeline
    const clipEndUs = startUs + (trimOut - trimIn);

    // Check if clip overlaps with export range
    if (clipEndUs <= inPointUs || startUs >= outPointUs) {
      return; // Clip is outside export range
    }

    // Calculate when to start playback relative to export start
    const playStartUs = Math.max(startUs, inPointUs);
    const playEndUs = Math.min(clipEndUs, outPointUs);

    // Calculate source offset (where to start reading from source)
    const sourceOffsetUs = trimIn + (playStartUs - startUs);

    // Convert to seconds
    const playStartSec = (playStartUs - inPointUs) / 1_000_000;
    const sourceOffsetSec = sourceOffsetUs / 1_000_000;
    const durationSec = (playEndUs - playStartUs) / 1_000_000;

    // Create source node
    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;

    // Create gain node for volume control
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;

    // Connect nodes
    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Schedule playback
    sourceNode.start(playStartSec, sourceOffsetSec, durationSec);
  }

  /**
   * Convert AudioBuffer channels to interleaved stereo Float32Array.
   */
  private interleaveChannels(buffer: AudioBuffer): Float32Array {
    const numSamples = buffer.length;
    const interleaved = new Float32Array(numSamples * this.channels);

    // Get channel data (mono becomes duplicated to stereo)
    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.numberOfChannels > 1
      ? buffer.getChannelData(1)
      : leftChannel;

    // Interleave channels: L0, R0, L1, R1, ...
    for (let i = 0; i < numSamples; i++) {
      interleaved[i * 2] = leftChannel[i]!;
      interleaved[i * 2 + 1] = rightChannel[i]!;
    }

    return interleaved;
  }

  /**
   * Extract audio clips from tracks with their decoded buffers.
   * @param tracks - Track data from composition
   * @param audioBuffers - Map of sourceId to decoded AudioBuffer
   * @param inPointUs - Export start time
   * @param outPointUs - Export end time
   * @returns Array of audio clips within the export range
   */
  static extractAudioClips(
    tracks: TrackJSON[],
    audioBuffers: Map<string, AudioBuffer>,
    inPointUs: number,
    outPointUs: number
  ): AudioClipData[] {
    const audioClips: AudioClipData[] = [];

    for (const track of tracks) {
      if (track.type !== 'audio') continue;

      for (const clip of track.clips) {
        const audioBuffer = audioBuffers.get(clip.sourceId);
        if (!audioBuffer) continue;

        const clipEndUs = clip.startUs + (clip.trimOut - clip.trimIn);

        // Check if clip overlaps with export range
        if (clipEndUs <= inPointUs || clip.startUs >= outPointUs) {
          continue;
        }

        audioClips.push({
          clipId: clip.id,
          sourceId: clip.sourceId,
          audioBuffer,
          startUs: clip.startUs,
          trimIn: clip.trimIn,
          trimOut: clip.trimOut,
          volume: clip.volume,
        });
      }
    }

    return audioClips;
  }
}

/**
 * Decode audio from an ArrayBuffer using AudioContext.
 */
export async function decodeAudioBuffer(
  buffer: ArrayBuffer,
  sampleRate = EXPORT.DEFAULT_AUDIO_SAMPLE_RATE
): Promise<AudioBuffer> {
  // Create a temporary AudioContext for decoding
  const ctx = new AudioContext({ sampleRate });
  try {
    const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
    return audioBuffer;
  } finally {
    await ctx.close();
  }
}
