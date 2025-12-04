/**
 * Render Worker Modules
 * Barrel export for all render worker related modules.
 */

// Types
export type {
  DecodedFrame,
  DecodedAudioChunk,
  SourceDecodeState,
  WorkerState,
  MP4ArrayBuffer,
  SourceState,
  WorkerContext,
} from './types';

// Frame handling
export { FrameBuffer } from './FrameBuffer';
export {
  findSampleAtTime,
  findKeyframeBefore,
  sampleToUs,
  sampleDurationToUs,
} from './FrameSelector';

// Demuxing
export { Demuxer, demuxBuffer } from './Demuxer';
export type { DemuxerOptions, DemuxerReadyCallback } from './Demuxer';

// Video decoding
export { VideoDecoderWrapper } from './VideoDecoderWrapper';
export type {
  VideoDecoderWrapperOptions,
  VideoDecoderOutputCallback,
  VideoDecoderErrorCallback,
} from './VideoDecoderWrapper';

// Audio decoding
export { AudioDecoderWrapper, combineAudioChunks } from './AudioDecoderWrapper';
export type {
  AudioDecoderWrapperOptions,
  AudioDecoderOutputCallback,
  AudioDecoderErrorCallback,
} from './AudioDecoderWrapper';

// Source state management
export {
  createSourceState,
  loadSource,
  startSourceStream,
  appendSourceChunk,
  removeSource,
} from './SourceStateManager';

// Audio processing
export { sendAudioChunks, flushAudioDecoder } from './AudioProcessor';

// Playback control
export {
  handleSetActiveClips,
  play,
  pause,
  seek,
  syncToTime,
  playbackLoop,
} from './PlaybackController';

// Frame rendering
export { renderFrame, requestFirstFrame, isClipActiveAt } from './FrameRenderer';

// Decoder queue
export { feedDecoders, flushAllDecoders } from './DecoderQueue';
