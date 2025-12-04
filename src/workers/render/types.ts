/**
 * Render Worker Types
 * Type definitions for the render worker modules.
 */

import type { MP4File, MP4VideoTrack, MP4AudioTrack, MP4Sample } from 'mp4box';
import type { ActiveClip } from '../../core/types';
import type { RenderWorkerEvent } from '../messages/renderMessages';
import type { Demuxer } from './Demuxer';
import type { VideoDecoderWrapper } from './VideoDecoderWrapper';
import type { AudioDecoderWrapper } from './AudioDecoderWrapper';
import type { FrameBuffer } from './FrameBuffer';
import type { WebGLRenderer } from '../../renderer/WebGLRenderer';
import type { Compositor } from '../../renderer/Compositor';

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

/**
 * Source state managed by SourceStateManager
 */
export interface SourceState {
  sourceId: string;
  demuxer: Demuxer;
  videoDecoder: VideoDecoderWrapper;
  audioDecoder: AudioDecoderWrapper | null;
  frameBuffer: FrameBuffer;
  durationUs: number;
  width: number;
  height: number;
  isReady: boolean;
  isStreaming: boolean;
  audioDecodingComplete: boolean;
}

/**
 * Shared worker context passed between modules
 */
export interface WorkerContext {
  // Canvas and renderers
  canvas: OffscreenCanvas | null;
  renderer: WebGLRenderer | null;
  compositor: Compositor | null;

  // Source management
  sources: Map<string, SourceState>;

  // Active clip state
  activeClips: ActiveClip[];
  hasClipsAtCurrentTime: boolean;
  compositionDurationUs: number;

  // Playback state
  state: WorkerState;
  currentTimeUs: number;
  playbackStartTimeUs: number;
  playbackStartWallTime: number;
  animationFrameId: number | null;
  pendingPausedRender: boolean;

  // Communication
  postResponse: (event: RenderWorkerEvent, transfer?: Transferable[]) => void;
  postError: (message: string, sourceId?: string) => void;
}
