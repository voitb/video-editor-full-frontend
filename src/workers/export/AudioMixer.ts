/**
 * Audio Mixer
 * Handles mixing multiple audio clips into a single stereo output buffer.
 */

import type { ClipJSON, TrackJSON } from '../../core/types';
import type { ExportSourceState } from './types';
import { TIME } from '../../constants';

export interface AudioMixerConfig {
  sampleRate: number;
  channels: number;
  inPointUs: number;
  outPointUs: number;
}

export interface MixedAudioResult {
  buffer: Float32Array;
  totalSamples: number;
}

/**
 * Mix audio clips from multiple tracks into a single stereo buffer.
 *
 * @param tracks - All tracks in the composition
 * @param sources - Map of source states with decoded audio
 * @param config - Mixer configuration
 * @returns Mixed audio buffer
 */
export function mixAudioTracks(
  tracks: TrackJSON[],
  sources: Map<string, ExportSourceState>,
  config: AudioMixerConfig
): MixedAudioResult {
  const { sampleRate, channels, inPointUs, outPointUs } = config;
  const durationUs = outPointUs - inPointUs;
  const totalSamples = Math.ceil((durationUs / TIME.US_PER_SECOND) * sampleRate);

  // Create output buffer
  const outputBuffer = new Float32Array(totalSamples * channels);

  // Get all audio clips in range
  const audioClips = getAudioClipsInRange(tracks, inPointUs, outPointUs);

  // Mix each clip into output buffer
  for (const { clip } of audioClips) {
    mixClipIntoBuffer(clip, sources, outputBuffer, config);
  }

  // Clamp output to [-1, 1]
  clampBuffer(outputBuffer);

  return {
    buffer: outputBuffer,
    totalSamples,
  };
}

/**
 * Get all audio clips that overlap with the export range.
 */
function getAudioClipsInRange(
  tracks: TrackJSON[],
  inPointUs: number,
  outPointUs: number
): { clip: ClipJSON; trackIndex: number }[] {
  const audioClips: { clip: ClipJSON; trackIndex: number }[] = [];

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex]!;
    if (track.type !== 'audio') continue;

    for (const clip of track.clips) {
      const clipDurationUs = clip.trimOut - clip.trimIn;
      const clipEndUs = clip.startUs + clipDurationUs;

      // Check if clip overlaps with export range
      if (clipEndUs > inPointUs && clip.startUs < outPointUs) {
        audioClips.push({ clip, trackIndex });
      }
    }
  }

  return audioClips;
}

/**
 * Mix a single clip into the output buffer.
 */
function mixClipIntoBuffer(
  clip: ClipJSON,
  sources: Map<string, ExportSourceState>,
  outputBuffer: Float32Array,
  config: AudioMixerConfig
): void {
  const { sampleRate, channels, inPointUs, outPointUs } = config;

  const source = sources.get(clip.sourceId);
  if (!source || source.decodedAudio.length === 0) return;

  // Combine all decoded audio chunks into single buffer
  const sourceAudio = combineDecodedAudio(source.decodedAudio);

  // Calculate clip boundaries
  const clipDurationUs = clip.trimOut - clip.trimIn;
  const clipEndUs = clip.startUs + clipDurationUs;

  const playStartUs = Math.max(clip.startUs, inPointUs);
  const playEndUs = Math.min(clipEndUs, outPointUs);

  // Calculate sample positions
  const sourceOffsetUs = clip.trimIn + (playStartUs - clip.startUs);
  const outputOffsetUs = playStartUs - inPointUs;

  const sourceStartSample = Math.floor((sourceOffsetUs / TIME.US_PER_SECOND) * source.audioSampleRate);
  const outputStartSample = Math.floor((outputOffsetUs / TIME.US_PER_SECOND) * sampleRate);
  const numSamples = Math.floor(((playEndUs - playStartUs) / TIME.US_PER_SECOND) * sampleRate);

  // Mix audio with volume
  const volume = clip.volume;
  const sourceChannels = source.audioChannels;

  for (let i = 0; i < numSamples; i++) {
    const srcIdx = (sourceStartSample + i) * sourceChannels;
    const outIdx = (outputStartSample + i) * channels;

    if (srcIdx < sourceAudio.length && outIdx < outputBuffer.length) {
      // Get left and right samples (duplicate mono to stereo if needed)
      const left = sourceAudio[srcIdx] ?? 0;
      const right = sourceChannels > 1 ? (sourceAudio[srcIdx + 1] ?? left) : left;

      // Add to output with volume applied
      outputBuffer[outIdx] = (outputBuffer[outIdx] ?? 0) + left * volume;
      outputBuffer[outIdx + 1] = (outputBuffer[outIdx + 1] ?? 0) + right * volume;
    }
  }
}

/**
 * Combine multiple decoded audio chunks into a single buffer.
 */
function combineDecodedAudio(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, arr) => sum + arr.length, 0);
  const combined = new Float32Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return combined;
}

/**
 * Clamp all values in buffer to [-1, 1] range.
 */
function clampBuffer(buffer: Float32Array): void {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = Math.max(-1, Math.min(1, buffer[i]!));
  }
}

/**
 * Encode mixed audio buffer to AAC using AudioEncoder.
 *
 * @param audioEncoder - Configured audio encoder
 * @param mixedAudio - Mixed audio result
 * @param config - Mixer configuration
 * @param onCancelled - Callback to check if export was cancelled
 */
export async function encodeAudioBuffer(
  audioEncoder: AudioEncoder,
  mixedAudio: MixedAudioResult,
  config: AudioMixerConfig,
  onCancelled?: () => boolean
): Promise<void> {
  const { sampleRate, channels, inPointUs } = config;
  const { buffer, totalSamples } = mixedAudio;

  const samplesPerChunk = 1024;

  for (let i = 0; i < totalSamples; i += samplesPerChunk) {
    if (onCancelled?.()) return;

    const chunkSamples = Math.min(samplesPerChunk, totalSamples - i);

    // Create PLANAR format data (all left samples, then all right samples)
    const planarData = new Float32Array(chunkSamples * channels);

    for (let j = 0; j < chunkSamples; j++) {
      const interleavedIdx = (i + j) * channels;
      // Left channel: first half of planar buffer
      planarData[j] = buffer[interleavedIdx] ?? 0;
      // Right channel: second half of planar buffer
      planarData[chunkSamples + j] = buffer[interleavedIdx + 1] ?? 0;
    }

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: chunkSamples,
      numberOfChannels: channels,
      timestamp: Math.round((i / sampleRate) * TIME.US_PER_SECOND + inPointUs),
      data: planarData,
    });

    audioEncoder.encode(audioData);
    audioData.close();
  }
}
