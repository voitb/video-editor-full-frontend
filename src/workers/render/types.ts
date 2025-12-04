/**
 * Render Worker Types
 * Type definitions for the render worker modules.
 */

import type { MP4File, MP4VideoTrack, MP4AudioTrack, MP4Sample } from 'mp4box';

/**
 * Decoded frame entry in the frame queue
 */
export interface DecodedFrame {
  frame: VideoFrame;
  timestampUs: number;
}

/**
 * Decoded audio chunk
 */
export interface DecodedAudioChunk {
  data: Float32Array;
  timestampUs: number;
  durationUs: number;
}

/**
 * State for a single video/audio source being decoded
 */
export interface SourceDecodeState {
  sourceId: string;
  mp4File: MP4File;
  decoder: VideoDecoder | null;
  videoTrack: MP4VideoTrack | null;
  samples: MP4Sample[];
  keyframeIndices: number[];
  frameQueue: DecodedFrame[];
  durationUs: number;
  width: number;
  height: number;
  isReady: boolean;
  isStreaming: boolean;
  streamOffset: number;
  lastQueuedSample: number;

  // Audio decoding
  audioTrack: MP4AudioTrack | null;
  audioDecoder: AudioDecoder | null;
  decodedAudioChunks: DecodedAudioChunk[];
  audioSampleRate: number;
  audioChannels: number;
  audioDecodingComplete: boolean;
}

/**
 * Overall worker state
 */
export type WorkerState = 'idle' | 'ready' | 'playing';

/**
 * MP4ArrayBuffer with fileStart property required by mp4box
 */
export interface MP4ArrayBuffer extends ArrayBuffer {
  fileStart: number;
}
