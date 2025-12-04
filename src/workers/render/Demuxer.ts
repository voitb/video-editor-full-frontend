/**
 * Demuxer
 * MP4Box-based demuxing for extracting video and audio samples from MP4 files.
 */

import * as MP4Box from 'mp4box';
import type { MP4File, MP4VideoTrack, MP4AudioTrack, MP4Sample, MP4Info } from 'mp4box';
import { TIME } from '../../constants';
import type { MP4ArrayBuffer } from './types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('Demuxer');

/**
 * Callback for when demuxer is ready with track info
 */
export interface DemuxerReadyCallback {
  videoTrack: MP4VideoTrack | null;
  audioTrack: MP4AudioTrack | null;
  durationUs: number;
  width: number;
  height: number;
}

/**
 * Options for creating a Demuxer
 */
export interface DemuxerOptions {
  onReady?: (info: DemuxerReadyCallback) => void;
  onVideoSamples?: (samples: MP4Sample[]) => void;
  onAudioSamples?: (samples: MP4Sample[]) => void;
  onError?: (error: Error) => void;
}

/**
 * Demuxer for extracting samples from MP4 files using MP4Box.
 */
export class Demuxer {
  private mp4File: MP4File;
  private videoTrack: MP4VideoTrack | null = null;
  private audioTrack: MP4AudioTrack | null = null;
  private videoSamples: MP4Sample[] = [];
  private keyframeIndices: number[] = [];
  private streamOffset = 0;
  private isReady = false;

  private readonly onReady?: (info: DemuxerReadyCallback) => void;
  private readonly onVideoSamples?: (samples: MP4Sample[]) => void;
  private readonly onAudioSamples?: (samples: MP4Sample[]) => void;
  private readonly onError?: (error: Error) => void;

  constructor(options: DemuxerOptions = {}) {
    this.onReady = options.onReady;
    this.onVideoSamples = options.onVideoSamples;
    this.onAudioSamples = options.onAudioSamples;
    this.onError = options.onError;

    this.mp4File = MP4Box.createFile();
    this.setupCallbacks();
  }

  /**
   * Append a buffer to the demuxer.
   *
   * @param buffer - ArrayBuffer containing MP4 data
   * @param fileStart - Optional file offset (for streaming)
   */
  appendBuffer(buffer: ArrayBuffer, fileStart?: number): void {
    const ab = buffer.slice(0) as MP4ArrayBuffer;
    ab.fileStart = fileStart ?? this.streamOffset;
    this.streamOffset = ab.fileStart + buffer.byteLength;
    this.mp4File.appendBuffer(ab);
  }

  /**
   * Flush the demuxer (call when all data is appended).
   */
  flush(): void {
    this.mp4File.flush();
  }

  /**
   * Get the underlying MP4File instance.
   */
  getMp4File(): MP4File {
    return this.mp4File;
  }

  /**
   * Get the video track.
   */
  getVideoTrack(): MP4VideoTrack | null {
    return this.videoTrack;
  }

  /**
   * Get the audio track.
   */
  getAudioTrack(): MP4AudioTrack | null {
    return this.audioTrack;
  }

  /**
   * Get all video samples.
   */
  getVideoSamples(): MP4Sample[] {
    return this.videoSamples;
  }

  /**
   * Get keyframe indices.
   */
  getKeyframeIndices(): number[] {
    return this.keyframeIndices;
  }

  /**
   * Get the number of samples available.
   */
  get sampleCount(): number {
    return this.videoSamples.length;
  }

  /**
   * Check if demuxer is ready (has parsed track info).
   */
  get ready(): boolean {
    return this.isReady;
  }

  /**
   * Get current stream offset.
   */
  getStreamOffset(): number {
    return this.streamOffset;
  }

  /**
   * Reset stream offset (for seeking in streams).
   */
  resetStreamOffset(offset = 0): void {
    this.streamOffset = offset;
  }

  /**
   * Setup MP4Box callbacks.
   */
  private setupCallbacks(): void {
    this.mp4File.onReady = (info: MP4Info) => {
      const videoTrack = info.videoTracks[0] ?? null;
      const audioTrack = info.audioTracks[0] ?? null;

      this.videoTrack = videoTrack;
      this.audioTrack = audioTrack;
      this.isReady = true;

      let durationUs = 0;
      let width = 0;
      let height = 0;

      if (videoTrack) {
        width = videoTrack.video.width;
        height = videoTrack.video.height;
        durationUs = Math.round((videoTrack.duration / videoTrack.timescale) * TIME.US_PER_SECOND);

        // Request video samples
        this.mp4File.setExtractionOptions(videoTrack.id, 'video', { nbSamples: 1000 });
      }

      if (audioTrack) {
        // Request audio samples
        this.mp4File.setExtractionOptions(audioTrack.id, 'audio', { nbSamples: 1000 });
      }

      this.mp4File.start();

      this.onReady?.({
        videoTrack,
        audioTrack,
        durationUs,
        width,
        height,
      });
    };

    this.mp4File.onSamples = (trackId: number, _ref: unknown, samples: MP4Sample[]) => {
      const isAudioTrack = this.audioTrack && trackId === this.audioTrack.id;

      if (isAudioTrack) {
        // Audio samples
        this.onAudioSamples?.(samples);
      } else {
        // Video samples
        for (const sample of samples) {
          this.videoSamples.push(sample);
          if (sample.is_sync) {
            this.keyframeIndices.push(this.videoSamples.length - 1);
          }
        }
        this.onVideoSamples?.(samples);
      }
    };

    // MP4Box actually passes string to onError despite type definition saying Error
    (this.mp4File as unknown as { onError: (e: string) => void }).onError = (e: string) => {
      logger.error('MP4Box error', { error: e });
      this.onError?.(new Error(e));
    };
  }

  /**
   * Stop extraction and release resources.
   */
  stop(): void {
    this.mp4File.stop();
  }
}

/**
 * Create a demuxer and load an entire buffer at once.
 */
export async function demuxBuffer(
  buffer: ArrayBuffer,
  options: DemuxerOptions = {}
): Promise<Demuxer> {
  return new Promise((resolve, reject) => {
    const demuxer = new Demuxer({
      ...options,
      onReady: (info) => {
        options.onReady?.(info);
        resolve(demuxer);
      },
      onError: (err) => {
        options.onError?.(err);
        reject(err);
      },
    });

    demuxer.appendBuffer(buffer, 0);
    demuxer.flush();
  });
}
