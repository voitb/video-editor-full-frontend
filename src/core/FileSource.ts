/**
 * Video Editor V2 - File Source
 * Loads local video files from the user's device.
 */

import { Source } from './Source';
import type { SourceType, SourceRefJSON } from './types';
import { TIME } from '../constants';
import { createLogger } from '../utils/logger';
import * as MP4Box from 'mp4box';

const logger = createLogger('FileSource');

/** Supported file extensions */
const SUPPORTED_EXTENSIONS = ['.mp4', '.mov', '.m4v'];

/** Supported MIME types */
const SUPPORTED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
];

export interface FileSourceOptions {
  /** Skip metadata extraction (use file size estimate for duration) */
  skipMetadata?: boolean;
}

export class FileSource extends Source {
  readonly type: SourceType = 'file';
  readonly file: File;
  readonly fileName: string;

  private options: Required<FileSourceOptions>;
  private buffer: ArrayBuffer | null = null;

  constructor(file: File, options: FileSourceOptions = {}, id?: string) {
    super(id);
    this.file = file;
    this.fileName = file.name;
    this.options = {
      skipMetadata: options.skipMetadata ?? false,
    };
    // Most video files contain audio
    this._hasAudio = true;
  }

  /**
   * Validate file type before loading
   */
  private validateFileType(): boolean {
    // Check extension
    const ext = this.fileName.toLowerCase().slice(this.fileName.lastIndexOf('.'));
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return false;
    }

    // Check MIME type if available
    if (this.file.type && !SUPPORTED_MIME_TYPES.includes(this.file.type)) {
      return false;
    }

    return true;
  }

  /**
   * Load the file
   */
  async load(): Promise<void> {
    if (this._state !== 'idle') {
      throw new Error(`Cannot load source in state: ${this._state}`);
    }

    // Validate file type
    if (!this.validateFileType()) {
      this.setError(`Unsupported file type. Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}`);
      return;
    }

    this.setState('loading');

    try {
      // Read file as ArrayBuffer
      logger.info('Loading file', { name: this.fileName, size: this.file.size });

      this.buffer = await this.readFileAsArrayBuffer();
      logger.info('File loaded into buffer', { size: this.buffer.byteLength });

      // Extract metadata using MP4Box
      if (!this.options.skipMetadata) {
        await this.extractMetadata();
      } else {
        // Estimate duration based on typical bitrate (rough estimate)
        const estimatedBitrate = 8_000_000; // 8 Mbps
        this._durationUs = Math.round((this.file.size * 8 / estimatedBitrate) * TIME.US_PER_SECOND);
      }

      this.emitProgress(this.file.size, this.file.size);
      this.setState('ready');
      logger.info('File source ready', {
        duration: this._durationUs / TIME.US_PER_SECOND,
        dimensions: `${this._width}x${this._height}`,
        hasAudio: this._hasAudio,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load file';
      logger.error('Failed to load file', { error: message });
      this.setError(message);
    }
  }

  /**
   * Read file as ArrayBuffer with progress
   */
  private readFileAsArrayBuffer(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          this.emitProgress(e.loaded, e.total);
        }
      };

      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as ArrayBuffer'));
        }
      };

      reader.onerror = () => {
        reject(reader.error || new Error('File read error'));
      };

      reader.readAsArrayBuffer(this.file);
    });
  }

  /**
   * Extract metadata using MP4Box.js
   */
  private async extractMetadata(): Promise<void> {
    if (!this.buffer) {
      throw new Error('Buffer not loaded');
    }

    return new Promise((resolve, reject) => {
      const mp4boxfile = MP4Box.createFile();
      let resolved = false;

      const handleReady = (info: MP4BoxInfo) => {
        if (resolved) return;
        resolved = true;

        // Extract duration - prefer video track duration, fallback to moov duration
        const videoTrack = info.videoTracks?.[0];
        if (videoTrack && videoTrack.duration && videoTrack.timescale) {
          this._durationUs = Math.round((videoTrack.duration / videoTrack.timescale) * TIME.US_PER_SECOND);
        } else if (info.duration && info.timescale) {
          this._durationUs = Math.round((info.duration / info.timescale) * TIME.US_PER_SECOND);
        }

        // Extract video dimensions
        if (videoTrack) {
          this._width = videoTrack.video?.width ?? videoTrack.track_width ?? 0;
          this._height = videoTrack.video?.height ?? videoTrack.track_height ?? 0;
        }

        // Check for audio tracks
        this._hasAudio = (info.audioTracks?.length ?? 0) > 0;

        logger.info('Extracted metadata', {
          duration: this._durationUs,
          width: this._width,
          height: this._height,
          hasAudio: this._hasAudio,
          videoCodec: videoTrack?.codec,
          audioTracks: info.audioTracks?.length ?? 0,
        });

        resolve();
      };

      const handleError = (error: string | Error) => {
        if (resolved) return;
        resolved = true;
        const message = typeof error === 'string' ? error : error.message;
        logger.error('MP4Box error', { error: message });
        reject(new Error(`Failed to parse video metadata: ${message}`));
      };

      // Set up callbacks BEFORE appending buffer
      mp4boxfile.onReady = handleReady;
      mp4boxfile.onError = handleError;

      // Feed buffer to MP4Box
      try {
        // MP4Box expects the buffer to have a fileStart property
        const bufferWithPosition = this.buffer!.slice(0) as ArrayBuffer & { fileStart: number };
        bufferWithPosition.fileStart = 0;
        mp4boxfile.appendBuffer(bufferWithPosition);
        mp4boxfile.flush();

        // Set a timeout in case onReady doesn't fire
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            // If we got this far without onReady, something's wrong
            reject(new Error('Timeout waiting for MP4Box to parse file'));
          }
        }, 5000);
      } catch (error) {
        if (!resolved) {
          resolved = true;
          const message = error instanceof Error ? error.message : String(error);
          logger.error('Failed to parse with MP4Box', { error: message });
          reject(new Error(`Failed to parse video file: ${message}`));
        }
      }
    });
  }

  /**
   * Get the raw buffer for transfer to worker
   */
  getBuffer(): ArrayBuffer | null {
    return this.buffer;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.buffer = null;
  }

  /**
   * Get reference data for serialization
   */
  override toRefJSON(): SourceRefJSON {
    return {
      id: this.id,
      type: this.type,
      durationUs: this._durationUs,
      width: this._width,
      height: this._height,
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
