/**
 * Export Worker Types
 * Type definitions for the export worker modules.
 */

import type { MP4File, MP4VideoTrack, MP4AudioTrack, MP4Sample } from 'mp4box';
import type { OverlayPosition } from '../../core/types';

/**
 * State for a source being decoded for export
 */
export interface ExportSourceState {
  sourceId: string;
  mp4File: MP4File;
  videoDecoder: VideoDecoder | null;
  audioDecoder: AudioDecoder | null;
  videoTrack: MP4VideoTrack | null;
  audioTrack: MP4AudioTrack | null;
  videoSamples: MP4Sample[];
  audioSamples: MP4Sample[];
  keyframeIndices: number[];
  durationUs: number;
  width: number;
  height: number;
  isReady: boolean;
  // Decoded audio data
  decodedAudio: Float32Array[];
  audioSampleRate: number;
  audioChannels: number;
}

/**
 * Active clip information for rendering
 */
export interface ActiveClipInfo {
  clipId: string;
  sourceId: string;
  trackType: 'video' | 'audio';
  trackIndex: number;
  timelineStartUs: number;
  sourceStartUs: number;
  sourceEndUs: number;
  opacity: number;
  volume: number;
}

/**
 * Pre-rendered overlay info for compositing
 */
export interface ActiveOverlayInfo {
  clipId: string;
  trackIndex: number;
  startUs: number;
  endUs: number;
  bitmap: ImageBitmap;
  position: OverlayPosition;
  opacity: number;
}

/**
 * MP4ArrayBuffer with fileStart property required by mp4box
 */
export interface MP4ArrayBuffer extends ArrayBuffer {
  fileStart: number;
}
