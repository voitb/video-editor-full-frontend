/**
 * Video Decoder Wrapper
 * Wrapper around the WebCodecs VideoDecoder API.
 */

import type { MP4File, MP4VideoTrack, MP4Sample } from 'mp4box';
import * as MP4Box from 'mp4box';
import { TIME } from '../../constants';
import { FrameBuffer } from './FrameBuffer';
import { createLogger } from '../../utils/logger';

const logger = createLogger('VideoDecoderWrapper');

export type VideoDecoderOutputCallback = (frame: VideoFrame) => void;
export type VideoDecoderErrorCallback = (error: Error) => void;

/**
 * Options for creating a VideoDecoderWrapper
 */
export interface VideoDecoderWrapperOptions {
  onOutput?: VideoDecoderOutputCallback;
  onError?: VideoDecoderErrorCallback;
}

/**
 * Wrapper around the WebCodecs VideoDecoder API.
 * Handles configuration, decoding, and frame output.
 */
export class VideoDecoderWrapper {
  private decoder: VideoDecoder | null = null;
  private readonly onOutput?: VideoDecoderOutputCallback;
  private readonly onError?: VideoDecoderErrorCallback;
  private frameBuffer: FrameBuffer;
  private lastQueuedSample = -1;

  constructor(options: VideoDecoderWrapperOptions = {}) {
    this.onOutput = options.onOutput;
    this.onError = options.onError;
    this.frameBuffer = new FrameBuffer();
  }

  /**
   * Configure the decoder for a video track.
   * After configure, the decoder requires a keyframe for the first decode.
   */
  configure(mp4File: MP4File, videoTrack: MP4VideoTrack): void {
    const codecDescription = this.getCodecDescription(mp4File, videoTrack.id);

    this.decoder = new VideoDecoder({
      output: (frame) => {
        this.frameBuffer.push(frame, frame.timestamp);
        this.onOutput?.(frame);
      },
      error: (err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Decoder error', { error: error.message });
        this.onError?.(error);
      },
    });

    this.decoder.configure({
      codec: videoTrack.codec,
      codedWidth: videoTrack.video.width,
      codedHeight: videoTrack.video.height,
      description: codecDescription ?? undefined,
    });

    // After configure, the decoder requires a keyframe for the first decode
    this.lastQueuedSample = -1;
  }

  /**
   * Reconfigure the decoder (after reset).
   */
  reconfigure(mp4File: MP4File, videoTrack: MP4VideoTrack): void {
    if (this.decoder?.state === 'configured') {
      this.decoder.reset();
    }
    this.configure(mp4File, videoTrack);
  }

  /**
   * Decode a single sample.
   */
  decode(sample: MP4Sample): void {
    if (!this.decoder || this.decoder.state !== 'configured') {
      return;
    }

    const chunk = new EncodedVideoChunk({
      type: sample.is_sync ? 'key' : 'delta',
      timestamp: Math.round((sample.cts / sample.timescale) * TIME.US_PER_SECOND),
      duration: Math.round((sample.duration / sample.timescale) * TIME.US_PER_SECOND),
      data: sample.data,
    });

    this.decoder.decode(chunk);
  }

  /**
   * Decode samples from startIdx to endIdx.
   */
  decodeSamples(samples: MP4Sample[], startIdx: number, endIdx: number): void {
    for (let i = startIdx; i <= endIdx; i++) {
      const sample = samples[i];
      if (sample) {
        this.decode(sample);
        this.lastQueuedSample = i;
      }
    }
  }

  /**
   * Flush the decoder and wait for all pending frames.
   * After flush, the decoder requires a keyframe, so we reset lastQueuedSample.
   */
  async flush(): Promise<void> {
    if (this.decoder?.state === 'configured') {
      await this.decoder.flush();
      // After flush, the decoder requires a keyframe for the next decode
      this.lastQueuedSample = -1;
    }
  }

  /**
   * Reset the decoder state.
   */
  reset(): void {
    this.frameBuffer.clear();
    this.lastQueuedSample = -1;
    if (this.decoder?.state === 'configured') {
      this.decoder.reset();
    }
  }

  /**
   * Close the decoder.
   */
  close(): void {
    this.frameBuffer.clear();
    if (this.decoder?.state !== 'closed') {
      this.decoder?.close();
    }
    this.decoder = null;
  }

  /**
   * Get the frame buffer.
   */
  getFrameBuffer(): FrameBuffer {
    return this.frameBuffer;
  }

  /**
   * Get last queued sample index.
   */
  getLastQueuedSample(): number {
    return this.lastQueuedSample;
  }

  /**
   * Set last queued sample index.
   */
  setLastQueuedSample(idx: number): void {
    this.lastQueuedSample = idx;
  }

  /**
   * Get the decoder state.
   */
  get state(): 'unconfigured' | 'configured' | 'closed' | 'uninitialized' {
    return this.decoder?.state ?? 'uninitialized';
  }

  /**
   * Get the native decoder instance.
   */
  get nativeDecoder(): VideoDecoder | null {
    return this.decoder;
  }

  /**
   * Extract codec description from MP4 file.
   */
  private getCodecDescription(mp4File: MP4File, trackId: number): Uint8Array | null {
    const track = mp4File.getTrackById(trackId);
    if (!track) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const entry of (track as any).mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC;
      if (box) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream = new (MP4Box as any).DataStream(undefined, 0, (MP4Box as any).DataStream.BIG_ENDIAN);
        box.write(stream);
        return new Uint8Array(stream.buffer.slice(8));
      }
    }
    return null;
  }
}
