/**
 * Video Editor V2 - HLS Source
 * Loads HLS streams with progressive playback support.
 */

import { Source } from './Source';
import type { SourceType, SourceRefJSON } from './types';
import { parseManifest, selectQuality, hasEncryption, isValidHlsUrl } from '../hls/hlsParser';
import { fetchManifest, fetchWithRetry } from '../hls/segmentFetcher';
import type { HlsManifest, HlsQualityLevel, HlsSegment } from '../hls/hlsTypes';
import type {
  TransmuxWorkerCommand,
  TransmuxWorkerEvent,
} from '../workers/messages/transmuxMessages';
import { HLS, TIME } from '../constants';
import { mergeArrayBuffers } from '../utils/transferable';
import { createLogger } from '../utils/logger';
import * as MP4Box from 'mp4box';

const logger = createLogger('HlsSource');

export interface HlsSourceOptions {
  /** Maximum resolution height */
  maxResolution?: number;
  /** Fetch timeout per segment */
  fetchTimeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
}

export class HlsSource extends Source {
  readonly type: SourceType = 'hls';
  readonly url: string;

  private options: Required<HlsSourceOptions>;
  private abortController: AbortController | null = null;
  private transmuxWorker: Worker | null = null;

  // Loading state
  private manifest: HlsManifest | null = null;
  private selectedQuality: HlsQualityLevel | null = null;
  private chunks: ArrayBuffer[] = [];
  private initSegment: ArrayBuffer | null = null;

  // Progress tracking
  loadedSegments = 0;
  totalSegments = 0;
  private receivedMediaSegments = 0;

  constructor(url: string, options: HlsSourceOptions = {}, id?: string) {
    super(id);
    this.url = url;
    this.options = {
      maxResolution: options.maxResolution ?? HLS.MAX_RESOLUTION,
      fetchTimeout: options.fetchTimeout ?? HLS.FETCH_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? HLS.MAX_RETRIES,
    };
    // Most HLS video sources contain audio
    this._hasAudio = true;
  }

  /**
   * Load the HLS stream
   */
  async load(): Promise<void> {
    if (this._state !== 'idle') {
      throw new Error(`Cannot load source in state: ${this._state}`);
    }

    // Validate URL
    if (!isValidHlsUrl(this.url)) {
      this.setError('Invalid HLS URL');
      return;
    }

    this.setState('loading');
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      // Fetch and parse master manifest
      logger.info('Fetching HLS manifest', { url: this.url });
      const manifestContent = await fetchManifest(this.url, {
        timeout: this.options.fetchTimeout,
        signal,
      });

      // Check for encryption
      if (hasEncryption(manifestContent)) {
        throw new Error('Encrypted HLS streams are not supported');
      }

      // Parse manifest
      this.manifest = parseManifest(manifestContent, this.url);

      // Handle master playlist
      let segments: HlsSegment[];
      if (this.manifest.isMaster) {
        this.selectedQuality = selectQuality(this.manifest.levels, this.options.maxResolution);
        if (!this.selectedQuality) {
          throw new Error('No valid quality level found');
        }

        // Set video dimensions from selected quality
        this._width = this.selectedQuality.width;
        this._height = this.selectedQuality.height;

        logger.info('Selected quality', {
          width: this.selectedQuality.width,
          height: this.selectedQuality.height,
          bandwidth: this.selectedQuality.bandwidth,
        });

        // Fetch media playlist
        const mediaContent = await fetchManifest(this.selectedQuality.uri, {
          timeout: this.options.fetchTimeout,
          signal,
        });
        const mediaManifest = parseManifest(mediaContent, this.selectedQuality.uri);
        segments = mediaManifest.segments;
        this._durationUs = Math.round(mediaManifest.totalDuration * TIME.US_PER_SECOND);
      } else {
        // Direct media playlist
        segments = this.manifest.segments;
        this._durationUs = Math.round(this.manifest.totalDuration * TIME.US_PER_SECOND);
      }

      this.totalSegments = segments.length;
      this.receivedMediaSegments = 0;
      logger.info('Starting segment loading', { segments: this.totalSegments, durationUs: this._durationUs });

      // Initialize transmux worker
      this.transmuxWorker = new Worker(
        new URL('../workers/TransmuxWorker.ts', import.meta.url),
        { type: 'module' }
      );

      // Set up worker message handling
      await this.processSegmentsWithWorker(segments, signal);

      // Build final buffer
      if (this.initSegment && this.chunks.length > 0) {
        this.setState('ready');
        logger.info('HLS source ready', { chunks: this.chunks.length });
      } else {
        throw new Error('No data received from transmuxer');
      }
    } catch (err) {
      if (signal.aborted) {
        logger.info('HLS loading aborted');
        this._state = 'idle';
      } else {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error('HLS loading failed', { error: message });
        this.setError(message);
      }
    } finally {
      this.cleanupWorker();
    }
  }

  /**
   * Process segments through transmux worker
   */
  private processSegmentsWithWorker(segments: HlsSegment[], signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.transmuxWorker) {
        reject(new Error('Transmux worker not initialized'));
        return;
      }

      const worker = this.transmuxWorker;

      // Handle worker messages
      worker.onmessage = (e: MessageEvent<TransmuxWorkerEvent>) => {
        const event = e.data;

        switch (event.type) {
          case 'INIT_SEGMENT':
            this.initSegment = event.data;
            this.chunks.push(event.data);
            // Extract dimensions from init segment if not set from master playlist
            if (this._width === 0 && this._height === 0) {
              this.extractDimensionsFromInitSegment(event.data);
            }
            // Emit fMP4 init segment to streaming consumers
            this.emitChunk(event.data, false);
            break;

          case 'MEDIA_SEGMENT':
            this.chunks.push(event.data);
            // Track and emit fMP4 media segments
            const isLastMedia = this.receivedMediaSegments >= this.totalSegments - 1;
            this.receivedMediaSegments++;
            this.emitChunk(event.data, isLastMedia);
            break;

          case 'TRANSMUX_PROGRESS':
            this.loadedSegments = event.processed;
            this.emitProgress(event.processed, event.total);

            // Emit playable when we have enough segments
            if (
              this._state === 'loading' &&
              this.loadedSegments >= HLS.PLAYABLE_SEGMENT_COUNT &&
              this.initSegment
            ) {
              this.setState('playable');
            }
            break;

          case 'TRANSMUX_COMPLETE':
            resolve();
            break;

          case 'TRANSMUX_ERROR':
            reject(new Error(event.message));
            break;
        }
      };

      worker.onerror = (err) => {
        reject(new Error(`Worker error: ${err.message}`));
      };

      // Start transmuxer
      const startCmd: TransmuxWorkerCommand = { type: 'START_TRANSMUX' };
      worker.postMessage(startCmd);

      // Fetch and push segments sequentially
      this.fetchAndPushSegments(segments, worker, signal).catch(reject);
    });
  }

  /**
   * Fetch segments and push to transmux worker
   */
  private async fetchAndPushSegments(
    segments: HlsSegment[],
    worker: Worker,
    signal: AbortSignal
  ): Promise<void> {
    for (let i = 0; i < segments.length; i++) {
      if (signal.aborted) {
        throw new Error('Aborted');
      }

      const segment = segments[i]!;
      const buffer = await fetchWithRetry(segment.uri, {
        timeout: this.options.fetchTimeout,
        maxRetries: this.options.maxRetries,
        signal,
      });

      const isLast = i === segments.length - 1;

      // Push to transmuxer (transmuxed fMP4 chunks are emitted via worker message handler)
      const cmd: TransmuxWorkerCommand = {
        type: 'PUSH_SEGMENT',
        segment: buffer,
        index: i,
        isLast,
      };
      worker.postMessage(cmd, [buffer]);
    }
  }

  /**
   * Clean up transmux worker
   */
  private cleanupWorker(): void {
    if (this.transmuxWorker) {
      this.transmuxWorker.terminate();
      this.transmuxWorker = null;
    }
  }

  /**
   * Get the complete fMP4 buffer
   */
  getBuffer(): ArrayBuffer | null {
    if (this.chunks.length === 0) return null;
    return mergeArrayBuffers(this.chunks);
  }

  /**
   * Get init segment only
   */
  getInitSegment(): ArrayBuffer | null {
    return this.initSegment;
  }

  /**
   * Get individual chunks for progressive loading
   */
  getChunks(): ArrayBuffer[] {
    return this.chunks;
  }

  /**
   * Extract video dimensions from fMP4 init segment using MP4Box.js
   * Used for non-master playlists where resolution isn't in the manifest
   */
  private extractDimensionsFromInitSegment(initSegment: ArrayBuffer): void {
    try {
      const mp4boxfile = MP4Box.createFile();
      let resolved = false;

      mp4boxfile.onReady = (info: MP4BoxInfo) => {
        if (resolved) return;
        resolved = true;

        const videoTrack = info.videoTracks?.[0];
        if (videoTrack) {
          this._width = videoTrack.video?.width ?? videoTrack.track_width ?? 0;
          this._height = videoTrack.video?.height ?? videoTrack.track_height ?? 0;
          // Also check for audio tracks
          this._hasAudio = (info.audioTracks?.length ?? 0) > 0;

          logger.info('Extracted dimensions from init segment', {
            width: this._width,
            height: this._height,
            hasAudio: this._hasAudio,
          });
        }
      };

      mp4boxfile.onError = (error: Error) => {
        if (resolved) return;
        resolved = true;
        logger.warn('Failed to parse init segment for dimensions', { error: error.message });
      };

      // MP4Box expects the buffer to have a fileStart property
      const bufferWithPosition = initSegment.slice(0) as ArrayBuffer & { fileStart: number };
      bufferWithPosition.fileStart = 0;
      mp4boxfile.appendBuffer(bufferWithPosition);
      mp4boxfile.flush();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Error extracting dimensions from init segment', { error: message });
    }
  }

  /**
   * Abort loading
   */
  abort(): void {
    this.abortController?.abort();
    if (this.transmuxWorker) {
      const cmd: TransmuxWorkerCommand = { type: 'ABORT' };
      this.transmuxWorker.postMessage(cmd);
    }
    this.cleanupWorker();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.abort();
    this.chunks = [];
    this.initSegment = null;
    this.manifest = null;
    this.selectedQuality = null;
  }

  /**
   * Serialize to JSON reference
   */
  toRefJSON(): SourceRefJSON {
    return {
      ...super.toRefJSON(),
      url: this.url,
    };
  }
}

// Type definitions for MP4Box.js (subset of what we use)
interface MP4BoxInfo {
  duration?: number;
  timescale?: number;
  isFragmented?: boolean;
  videoTracks?: Array<{
    id: number;
    codec: string;
    duration?: number;
    timescale?: number;
    track_width?: number;
    track_height?: number;
    video?: {
      width: number;
      height: number;
    };
  }>;
  audioTracks?: Array<{
    id: number;
    codec: string;
    channel_count?: number;
    sample_rate?: number;
  }>;
}
