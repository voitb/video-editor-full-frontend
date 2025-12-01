/**
 * Video Editor V2 - RenderWorker Message Types
 * Strongly-typed messages for main thread <-> RenderWorker communication.
 */

import type { ActiveClip } from '../../core/types';

// ============================================================================
// COMMANDS (Main Thread -> Worker)
// ============================================================================

/** Initialize canvas for rendering */
export interface InitCanvasCommand {
  type: 'INIT_CANVAS';
  canvas: OffscreenCanvas;
}

/** Load a complete source from buffer */
export interface LoadSourceCommand {
  type: 'LOAD_SOURCE';
  sourceId: string;
  buffer: ArrayBuffer;
  durationHint?: number;
}

/** Start streaming source (for progressive HLS) */
export interface StartSourceStreamCommand {
  type: 'START_SOURCE_STREAM';
  sourceId: string;
  durationHint?: number;
}

/** Append chunk to streaming source */
export interface AppendSourceChunkCommand {
  type: 'APPEND_SOURCE_CHUNK';
  sourceId: string;
  chunk: ArrayBuffer;
  isLast: boolean;
}

/** Remove a source */
export interface RemoveSourceCommand {
  type: 'REMOVE_SOURCE';
  sourceId: string;
}

/** Set which clips are active for rendering */
export interface SetActiveClipsCommand {
  type: 'SET_ACTIVE_CLIPS';
  clips: ActiveClip[];
}

/** Seek to a specific time */
export interface SeekCommand {
  type: 'SEEK';
  timeUs: number;
}

/** Start playback */
export interface PlayCommand {
  type: 'PLAY';
}

/** Pause playback */
export interface PauseCommand {
  type: 'PAUSE';
}

/** Sync video to audio time (for drift correction) */
export interface SyncToTimeCommand {
  type: 'SYNC_TO_TIME';
  timeUs: number;
}

/** Request first frame thumbnail */
export interface RequestFirstFrameCommand {
  type: 'REQUEST_FIRST_FRAME';
  sourceId: string;
}

/** All possible commands */
export type RenderWorkerCommand =
  | InitCanvasCommand
  | LoadSourceCommand
  | StartSourceStreamCommand
  | AppendSourceChunkCommand
  | RemoveSourceCommand
  | SetActiveClipsCommand
  | SeekCommand
  | PlayCommand
  | PauseCommand
  | SyncToTimeCommand
  | RequestFirstFrameCommand;

// ============================================================================
// EVENTS (Worker -> Main Thread)
// ============================================================================

/** Source is fully loaded and ready */
export interface SourceReadyEvent {
  type: 'SOURCE_READY';
  sourceId: string;
  durationUs: number;
  width: number;
  height: number;
}

/** Source has enough data to start playback (streaming) */
export interface SourcePlayableEvent {
  type: 'SOURCE_PLAYABLE';
  sourceId: string;
  durationUs: number;
  width: number;
  height: number;
  loadedSamples: number;
}

/** Source was removed */
export interface SourceRemovedEvent {
  type: 'SOURCE_REMOVED';
  sourceId: string;
}

/** Playback time update */
export interface TimeUpdateEvent {
  type: 'TIME_UPDATE';
  currentTimeUs: number;
}

/** Playback state changed */
export interface PlaybackStateEvent {
  type: 'PLAYBACK_STATE';
  isPlaying: boolean;
}

/** First frame rendered (thumbnail) */
export interface FirstFrameEvent {
  type: 'FIRST_FRAME';
  sourceId: string;
  blob: Blob;
  width: number;
  height: number;
}

/** Audio data extracted from source */
export interface AudioDataEvent {
  type: 'AUDIO_DATA';
  sourceId: string;
  audioData: ArrayBuffer;
  sampleRate: number;
  channels: number;
  durationUs: number;
}

/** Error occurred */
export interface ErrorEvent {
  type: 'ERROR';
  message: string;
  sourceId?: string;
}

/** Worker is ready */
export interface WorkerReadyEvent {
  type: 'WORKER_READY';
}

/** All possible events */
export type RenderWorkerEvent =
  | SourceReadyEvent
  | SourcePlayableEvent
  | SourceRemovedEvent
  | TimeUpdateEvent
  | PlaybackStateEvent
  | FirstFrameEvent
  | AudioDataEvent
  | ErrorEvent
  | WorkerReadyEvent;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isRenderWorkerEvent(msg: unknown): msg is RenderWorkerEvent {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    typeof (msg as { type: unknown }).type === 'string'
  );
}
