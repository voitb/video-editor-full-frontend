/**
 * Video Editor V2 - File Source
 * Loads local video and audio files from the user's device.
 */

import { Source } from './Source';
import type { SourceType, SourceRefJSON } from './types';
import { createLogger } from '../utils/logger';
import {
  isAudioFile,
  validateFileType,
  getSupportedFormatsString,
  extractVideoMetadata,
  extractAudioMetadata,
  estimateDuration,
} from './file';

const logger = createLogger('FileSource');

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
    // Audio files always have audio; video files will be determined by metadata
    this._hasAudio = isAudioFile(this.fileName);
  }

  /**
   * Load the file
   */
  async load(): Promise<void> {
    if (this._state !== 'idle') {
      throw new Error(`Cannot load source in state: ${this._state}`);
    }

    // Validate file type
    if (!validateFileType(this.fileName, this.file.type)) {
      this.setError(`Unsupported file type. Supported formats: ${getSupportedFormatsString()}`);
      return;
    }

    this.setState('loading');

    try {
      // Read file as ArrayBuffer
      logger.info('Loading file', { name: this.fileName, size: this.file.size });

      this.buffer = await this.readFileAsArrayBuffer();
      logger.info('File loaded into buffer', { size: this.buffer.byteLength });

      // Extract metadata
      if (!this.options.skipMetadata) {
        await this.loadMetadata();
      } else {
        // Estimate duration based on typical bitrate
        this._durationUs = estimateDuration(this.file.size);
      }

      this.emitProgress(this.file.size, this.file.size);
      this.setState('ready');
      logger.info('File source ready', {
        duration: this._durationUs / 1_000_000,
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
   * Load metadata from the file buffer.
   */
  private async loadMetadata(): Promise<void> {
    if (!this.buffer) {
      throw new Error('Buffer not loaded');
    }

    const metadata = isAudioFile(this.fileName)
      ? await extractAudioMetadata(this.buffer)
      : await extractVideoMetadata(this.buffer);

    this._durationUs = metadata.durationUs;
    this._width = metadata.width;
    this._height = metadata.height;
    this._hasAudio = metadata.hasAudio;
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
