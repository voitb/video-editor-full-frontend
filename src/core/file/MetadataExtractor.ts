/**
 * Metadata Extractor
 * Extracts metadata from video and audio files.
 */

import * as MP4Box from 'mp4box';
import { TIME } from '../../constants';
import { createLogger } from '../../utils/logger';

const logger = createLogger('MetadataExtractor');

/**
 * Extracted video/audio metadata.
 */
export interface ExtractedMetadata {
  durationUs: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/**
 * MP4Box info structure (subset of what we use).
 */
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

/**
 * Extract metadata from video files using MP4Box.js.
 */
export function extractVideoMetadata(buffer: ArrayBuffer): Promise<ExtractedMetadata> {
  return new Promise((resolve, reject) => {
    const mp4boxfile = MP4Box.createFile();
    let resolved = false;

    const handleReady = (info: MP4BoxInfo) => {
      if (resolved) return;
      resolved = true;

      const metadata: ExtractedMetadata = {
        durationUs: 0,
        width: 0,
        height: 0,
        hasAudio: false,
      };

      // Extract duration - prefer video track duration, fallback to moov duration
      const videoTrack = info.videoTracks?.[0];
      if (videoTrack && videoTrack.duration && videoTrack.timescale) {
        metadata.durationUs = Math.round((videoTrack.duration / videoTrack.timescale) * TIME.US_PER_SECOND);
      } else if (info.duration && info.timescale) {
        metadata.durationUs = Math.round((info.duration / info.timescale) * TIME.US_PER_SECOND);
      }

      // Extract video dimensions
      if (videoTrack) {
        metadata.width = videoTrack.video?.width ?? videoTrack.track_width ?? 0;
        metadata.height = videoTrack.video?.height ?? videoTrack.track_height ?? 0;
      }

      // Check for audio tracks
      metadata.hasAudio = (info.audioTracks?.length ?? 0) > 0;

      logger.info('Extracted video metadata', {
        duration: metadata.durationUs,
        width: metadata.width,
        height: metadata.height,
        hasAudio: metadata.hasAudio,
        videoCodec: videoTrack?.codec,
        audioTracks: info.audioTracks?.length ?? 0,
      });

      resolve(metadata);
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
      const bufferWithPosition = buffer.slice(0) as ArrayBuffer & { fileStart: number };
      bufferWithPosition.fileStart = 0;
      mp4boxfile.appendBuffer(bufferWithPosition);
      mp4boxfile.flush();

      // Set a timeout in case onReady doesn't fire
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
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
 * Extract metadata from audio files using Web Audio API.
 */
export async function extractAudioMetadata(buffer: ArrayBuffer): Promise<ExtractedMetadata> {
  logger.info('Extracting audio metadata using Web Audio API');

  // Use Web Audio API to decode and get metadata
  const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

  try {
    // decodeAudioData needs a copy of the buffer as it may detach it
    const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));

    const metadata: ExtractedMetadata = {
      durationUs: Math.round(audioBuffer.duration * TIME.US_PER_SECOND),
      width: 0,  // Audio-only has no dimensions
      height: 0,
      hasAudio: true,
    };

    logger.info('Extracted audio metadata', {
      duration: metadata.durationUs,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
    });

    return metadata;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to decode audio';
    logger.error('Failed to extract audio metadata', { error: message });
    throw new Error(`Failed to parse audio file: ${message}`);
  } finally {
    audioContext.close();
  }
}

/**
 * Estimate duration based on file size (fallback when metadata extraction is skipped).
 */
export function estimateDuration(fileSize: number): number {
  // Estimate duration based on typical bitrate (rough estimate)
  const estimatedBitrate = 8_000_000; // 8 Mbps
  return Math.round((fileSize * 8 / estimatedBitrate) * TIME.US_PER_SECOND);
}
