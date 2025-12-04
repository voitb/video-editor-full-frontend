/// <reference lib="webworker" />
/**
 * Render Worker
 * Main entry point for the render worker.
 * Coordinates message routing between specialized modules.
 */

import type {
  RenderWorkerCommand,
  RenderWorkerEvent,
  ErrorEvent,
} from '../messages/renderMessages';
import type { WorkerContext, SourceState } from './types';
import { WebGLRenderer } from '../../renderer/WebGLRenderer';
import { Compositor } from '../../renderer/Compositor';
import { setLogLevel } from '../../utils/logger';

// Import specialized modules
import {
  loadSource,
  startSourceStream,
  appendSourceChunk,
  removeSource,
} from './SourceStateManager';
import {
  handleSetActiveClips,
  play,
  pause,
  seek,
  syncToTime,
} from './PlaybackController';
import { requestFirstFrame } from './FrameRenderer';

const workerCtx = self as unknown as DedicatedWorkerGlobalScope;
setLogLevel('debug');

// ============================================================================
// WORKER CONTEXT
// ============================================================================

function postResponse(event: RenderWorkerEvent, transfer?: Transferable[]): void {
  workerCtx.postMessage(event, { transfer: transfer ?? [] });
}

function postError(message: string, sourceId?: string): void {
  const event: ErrorEvent = { type: 'ERROR', message, sourceId };
  postResponse(event);
}

const ctx: WorkerContext = {
  // Canvas and renderers
  canvas: null,
  renderer: null,
  compositor: null,

  // Source management
  sources: new Map<string, SourceState>(),

  // Active clip state
  activeClips: [],
  hasClipsAtCurrentTime: false,
  compositionDurationUs: 0,

  // Playback state
  state: 'idle',
  currentTimeUs: 0,
  playbackStartTimeUs: 0,
  playbackStartWallTime: 0,
  animationFrameId: null,
  pendingPausedRender: false,

  // Communication
  postResponse,
  postError,
};

// ============================================================================
// CANVAS INITIALIZATION
// ============================================================================

function initCanvas(offscreen: OffscreenCanvas): void {
  ctx.canvas = offscreen;
  ctx.renderer = new WebGLRenderer(ctx.canvas);
  ctx.compositor = new Compositor(ctx.canvas);
  ctx.state = 'ready';
  postResponse({ type: 'WORKER_READY' });
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

workerCtx.onmessage = async (e: MessageEvent<RenderWorkerCommand>) => {
  const cmd = e.data;

  try {
    switch (cmd.type) {
      case 'INIT_CANVAS':
        initCanvas(cmd.canvas);
        break;

      case 'LOAD_SOURCE':
        await loadSource(ctx, cmd.sourceId, cmd.buffer, cmd.durationHint);
        break;

      case 'START_SOURCE_STREAM':
        startSourceStream(ctx, cmd.sourceId, cmd.durationHint);
        break;

      case 'APPEND_SOURCE_CHUNK':
        appendSourceChunk(ctx, cmd.sourceId, cmd.chunk, cmd.isLast);
        break;

      case 'REMOVE_SOURCE':
        removeSource(ctx, cmd.sourceId);
        break;

      case 'SET_ACTIVE_CLIPS':
        handleSetActiveClips(ctx, cmd.clips, cmd.hasClipsAtTime, cmd.compositionDurationUs);
        break;

      case 'SEEK':
        await seek(ctx, cmd.timeUs);
        break;

      case 'PLAY':
        play(ctx);
        break;

      case 'PAUSE':
        pause(ctx);
        break;

      case 'SYNC_TO_TIME':
        syncToTime(ctx, cmd.timeUs);
        break;

      case 'REQUEST_FIRST_FRAME':
        await requestFirstFrame(ctx, cmd.sourceId);
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    postError(message);
  }
};
