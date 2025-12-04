/**
 * File module exports
 */

export {
  SUPPORTED_VIDEO_EXTENSIONS,
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_EXTENSIONS,
  SUPPORTED_VIDEO_MIME_TYPES,
  SUPPORTED_AUDIO_MIME_TYPES,
  SUPPORTED_MIME_TYPES,
  getFileExtension,
  isAudioFile,
  validateFileType,
  getSupportedFormatsString,
} from './FileTypeValidator';

export type { ExtractedMetadata } from './MetadataExtractor';
export {
  extractVideoMetadata,
  extractAudioMetadata,
  estimateDuration,
} from './MetadataExtractor';
