/**
 * File Type Validator
 * Validates file types for video and audio sources.
 */

/** Supported video file extensions */
export const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v'];

/** Supported audio file extensions */
export const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav'];

/** All supported file extensions */
export const SUPPORTED_EXTENSIONS = [...SUPPORTED_VIDEO_EXTENSIONS, ...SUPPORTED_AUDIO_EXTENSIONS];

/** Supported video MIME types */
export const SUPPORTED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
];

/** Supported audio MIME types */
export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
];

/** All supported MIME types */
export const SUPPORTED_MIME_TYPES = [...SUPPORTED_VIDEO_MIME_TYPES, ...SUPPORTED_AUDIO_MIME_TYPES];

/**
 * Get the file extension from a filename.
 */
export function getFileExtension(fileName: string): string {
  return fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
}

/**
 * Check if a file is an audio-only file (MP3, WAV).
 */
export function isAudioFile(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return SUPPORTED_AUDIO_EXTENSIONS.includes(ext);
}

/**
 * Validate that a file type is supported.
 */
export function validateFileType(fileName: string, mimeType?: string): boolean {
  // Check extension
  const ext = getFileExtension(fileName);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return false;
  }

  // Check MIME type if available
  if (mimeType && !SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return false;
  }

  return true;
}

/**
 * Get a human-readable list of supported formats.
 */
export function getSupportedFormatsString(): string {
  return SUPPORTED_EXTENSIONS.join(', ');
}
