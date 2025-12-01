/**
 * Video Editor V2 - Public API
 */

// Core models
export { Composition } from './core/Composition';
export { Track } from './core/Track';
export { Clip } from './core/Clip';
export { Source } from './core/Source';
export { HlsSource } from './core/HlsSource';

// Engine
export { Engine } from './engine/Engine';
export type { EngineState, EngineOptions, EngineEvent, EngineEventCallback } from './engine/Engine';

// Types
export type {
  TrackType,
  SourceState,
  SourceType,
  CompositionConfig,
  ClipConfig,
  TrackConfig,
  ActiveClip,
  ClipJSON,
  TrackJSON,
  SourceRefJSON,
  CompositionJSON,
  SourceEvent,
  SourceEventCallback,
  SourceAudioData,
  TimelineViewport,
} from './core/types';

// Worker messages
export type {
  RenderWorkerCommand,
  RenderWorkerEvent,
} from './workers/messages/renderMessages';

export type {
  HlsWorkerCommand,
  HlsWorkerEvent,
  HlsManifest,
  HlsQualityLevel,
  HlsSegment,
} from './workers/messages/hlsMessages';

export type {
  TransmuxWorkerCommand,
  TransmuxWorkerEvent,
} from './workers/messages/transmuxMessages';

// Utilities
export {
  secondsToUs,
  usToSeconds,
  msToUs,
  usToMs,
  formatTimecode,
  formatTimecodeShort,
  clamp,
  clampTime,
  rangesOverlap,
  getOverlap,
  frameToUs,
  usToFrame,
  snapToFrame,
} from './utils/time';

export {
  createId,
  createCompositionId,
  createTrackId,
  createClipId,
  createSourceId,
} from './utils/id';

export {
  getTransferables,
  mergeArrayBuffers,
  cloneArrayBuffer,
} from './utils/transferable';

export { createLogger, setLogLevel } from './utils/logger';

// Constants
export {
  TIME,
  TIMELINE,
  PLAYBACK,
  COMPOSITION,
  HLS,
  EXPORT,
  RENDERER,
} from './constants';

// React hooks
export {
  useComposition,
  useEngine,
  useTimeline,
  type UseCompositionReturn,
  type UseCompositionOptions,
  type UseEngineReturn,
  type UseEngineOptions,
  type UseTimelineReturn,
  type UseTimelineOptions,
} from './hooks';

// React components
export {
  VideoPreview,
  type VideoPreviewProps,
  type VideoPreviewHandle,
  Timeline,
  type TimelineProps,
  EditorApp,
  type EditorAppProps,
} from './components';
