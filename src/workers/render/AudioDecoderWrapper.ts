/**
 * Audio Decoder Wrapper
 * Wrapper around the WebCodecs AudioDecoder API.
 */

import type { MP4File, MP4AudioTrack, MP4Sample } from 'mp4box';
import { TIME } from '../../constants';
import type { DecodedAudioChunk } from './types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('AudioDecoderWrapper');

export type AudioDecoderOutputCallback = (chunk: DecodedAudioChunk) => void;
export type AudioDecoderErrorCallback = (error: Error) => void;

/**
 * Options for creating an AudioDecoderWrapper
 */
export interface AudioDecoderWrapperOptions {
  onOutput?: AudioDecoderOutputCallback;
  onError?: AudioDecoderErrorCallback;
}

/**
 * Wrapper around the WebCodecs AudioDecoder API.
 * Handles configuration, decoding, and audio chunk output.
 */
export class AudioDecoderWrapper {
  private decoder: AudioDecoder | null = null;
  private readonly onOutput?: AudioDecoderOutputCallback;
  private readonly onError?: AudioDecoderErrorCallback;
  private decodedChunks: DecodedAudioChunk[] = [];
  private sampleRate = 0;
  private channels = 0;

  constructor(options: AudioDecoderWrapperOptions = {}) {
    this.onOutput = options.onOutput;
    this.onError = options.onError;
  }

  /**
   * Configure the decoder for an audio track.
   */
  configure(mp4File: MP4File, audioTrack: MP4AudioTrack): void {
    this.sampleRate = audioTrack.audio.sample_rate;
    this.channels = audioTrack.audio.channel_count;

    const codecDescription = this.getCodecDescription(mp4File, audioTrack.id);

    this.decoder = new AudioDecoder({
      output: (audioData: AudioData) => {
        const chunk = this.processAudioData(audioData);
        this.decodedChunks.push(chunk);
        this.onOutput?.(chunk);
        audioData.close();
      },
      error: (err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Audio decoder error', { error: error.message });
        this.onError?.(error);
      },
    });

    this.decoder.configure({
      codec: audioTrack.codec,
      sampleRate: audioTrack.audio.sample_rate,
      numberOfChannels: audioTrack.audio.channel_count,
      description: codecDescription ?? undefined,
    });
  }

  /**
   * Decode a single audio sample.
   */
  decode(sample: MP4Sample): void {
    if (!this.decoder || this.decoder.state !== 'configured') {
      return;
    }

    const chunk = new EncodedAudioChunk({
      type: sample.is_sync ? 'key' : 'delta',
      timestamp: Math.round((sample.cts / sample.timescale) * TIME.US_PER_SECOND),
      duration: Math.round((sample.duration / sample.timescale) * TIME.US_PER_SECOND),
      data: sample.data,
    });

    this.decoder.decode(chunk);
  }

  /**
   * Flush the decoder and return remaining chunks.
   */
  async flush(): Promise<DecodedAudioChunk[]> {
    if (this.decoder?.state === 'configured') {
      await this.decoder.flush();
    }
    return this.takeChunks();
  }

  /**
   * Take all accumulated chunks and clear the internal buffer.
   */
  takeChunks(): DecodedAudioChunk[] {
    const chunks = this.decodedChunks;
    this.decodedChunks = [];
    return chunks;
  }

  /**
   * Get accumulated chunks count.
   */
  get chunksCount(): number {
    return this.decodedChunks.length;
  }

  /**
   * Close the decoder.
   */
  close(): void {
    if (this.decoder?.state !== 'closed') {
      this.decoder?.close();
    }
    this.decoder = null;
    this.decodedChunks = [];
  }

  /**
   * Get the decoder state.
   */
  get state(): 'unconfigured' | 'configured' | 'closed' | 'uninitialized' {
    return this.decoder?.state ?? 'uninitialized';
  }

  /**
   * Get the sample rate.
   */
  getSampleRate(): number {
    return this.sampleRate;
  }

  /**
   * Get the number of channels.
   */
  getChannels(): number {
    return this.channels;
  }

  /**
   * Process AudioData into interleaved Float32Array.
   */
  private processAudioData(audioData: AudioData): DecodedAudioChunk {
    const numberOfChannels = audioData.numberOfChannels;
    const numberOfFrames = audioData.numberOfFrames;

    // Create interleaved Float32Array for all channels
    const pcmData = new Float32Array(numberOfFrames * numberOfChannels);

    // Copy each channel's data and interleave
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const channelData = new Float32Array(numberOfFrames);
      audioData.copyTo(channelData, { planeIndex: ch, format: 'f32-planar' });

      // Interleave the channel data
      for (let i = 0; i < numberOfFrames; i++) {
        pcmData[i * numberOfChannels + ch] = channelData[i]!;
      }
    }

    return {
      data: pcmData,
      timestampUs: audioData.timestamp,
      durationUs: audioData.duration,
    };
  }

  /**
   * Extract audio codec description from MP4 file.
   */
  private getCodecDescription(mp4File: MP4File, trackId: number): Uint8Array | null {
    const track = mp4File.getTrackById(trackId);
    if (!track) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const entry of (track as any).mdia.minf.stbl.stsd.entries) {
      // AAC codec specific data (esds box)
      const esds = entry.esds;
      if (esds && esds.esd && esds.esd.descs) {
        for (const desc of esds.esd.descs) {
          if (desc.tag === 5 && desc.data) {
            return new Uint8Array(desc.data);
          }
        }
      }
      // Try mp4a box
      if (entry.type === 'mp4a' && entry.esds) {
        const esdsData = entry.esds;
        if (esdsData.esd && esdsData.esd.descs) {
          for (const desc of esdsData.esd.descs) {
            if (desc.tag === 5 && desc.data) {
              return new Uint8Array(desc.data);
            }
          }
        }
      }
    }
    return null;
  }
}

/**
 * Combine multiple audio chunks into a single buffer.
 */
export function combineAudioChunks(chunks: DecodedAudioChunk[]): {
  data: Float32Array;
  timestampUs: number;
  durationUs: number;
} | null {
  if (chunks.length === 0) return null;

  const totalSamples = chunks.reduce((sum, c) => sum + c.data.length, 0);
  const combined = new Float32Array(totalSamples);

  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk.data, offset);
    offset += chunk.data.length;
  }

  const firstChunk = chunks[0]!;
  const lastChunk = chunks[chunks.length - 1]!;
  const totalDurationUs = lastChunk.timestampUs + lastChunk.durationUs - firstChunk.timestampUs;

  return {
    data: combined,
    timestampUs: firstChunk.timestampUs,
    durationUs: totalDurationUs,
  };
}
