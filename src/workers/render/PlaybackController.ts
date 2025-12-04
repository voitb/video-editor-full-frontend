/**
 * Playback Controller
 * Manages playback state, timing, and the main playback loop.
 */

import type { ActiveClip } from '../../core/types';
import type {
  TimeUpdateEvent,
  PlaybackStateEvent,
  SeekCompleteEvent,
} from '../messages/renderMessages';
import type { WorkerContext } from './types';
import { feedDecoders, flushAllDecoders } from './DecoderQueue';
import { renderFrame } from './FrameRenderer';
import { createLogger } from '../../utils/logger';

const logger = createLogger('PlaybackController');

/**
 * Handle SET_ACTIVE_CLIPS command
 */
export function handleSetActiveClips(
  ctx: WorkerContext,
  clips: ActiveClip[],
  hasClipsAtTime: boolean,
  durationUs: number
): void {
  ctx.activeClips = clips;
  ctx.hasClipsAtCurrentTime = hasClipsAtTime;
  ctx.compositionDurationUs = durationUs;

  logger.info('SET_ACTIVE_CLIPS', {
    count: ctx.activeClips.length,
    hasClipsAtTime: ctx.hasClipsAtCurrentTime,
    compositionDurationUs: ctx.compositionDurationUs,
    clipIds: ctx.activeClips.map(c => c.clipId),
    state: ctx.state,
    timelineTimeUs: ctx.currentTimeUs,
  });

  if (ctx.state !== 'playing') {
    const rendered = renderFrame(ctx, ctx.currentTimeUs);
    ctx.pendingPausedRender = !rendered;
  }
}

/**
 * Start playback
 */
export function play(ctx: WorkerContext): void {
  if (ctx.state !== 'ready') return;

  ctx.state = 'playing';
  ctx.pendingPausedRender = false;
  ctx.playbackStartTimeUs = ctx.currentTimeUs;
  ctx.playbackStartWallTime = performance.now();

  ctx.postResponse({ type: 'PLAYBACK_STATE', isPlaying: true } as PlaybackStateEvent);
  playbackLoop(ctx);
}

/**
 * Pause playback
 */
export function pause(ctx: WorkerContext): void {
  if (ctx.state !== 'playing') return;

  ctx.state = 'ready';
  if (ctx.animationFrameId !== null) {
    cancelAnimationFrame(ctx.animationFrameId);
    ctx.animationFrameId = null;
  }

  ctx.postResponse({ type: 'PLAYBACK_STATE', isPlaying: false } as PlaybackStateEvent);
}

/**
 * Seek to a specific time
 */
export async function seek(ctx: WorkerContext, timeUs: number): Promise<void> {
  ctx.currentTimeUs = timeUs;
  ctx.pendingPausedRender = ctx.state !== 'playing';

  logger.info('Seek requested', { timeUs, state: ctx.state, activeClips: ctx.activeClips.length });

  if (ctx.state === 'playing') {
    ctx.playbackStartTimeUs = timeUs;
    ctx.playbackStartWallTime = performance.now();
  }

  // Reset all decoders
  for (const sourceState of ctx.sources.values()) {
    sourceState.frameBuffer.clear();
    sourceState.videoDecoder.reset();

    const videoTrack = sourceState.demuxer.getVideoTrack();
    if (videoTrack) {
      sourceState.videoDecoder.configure(sourceState.demuxer.getMp4File(), videoTrack);
    }
  }

  feedDecoders(ctx, timeUs, { reason: 'seek' });

  if (ctx.state !== 'playing') {
    await flushAllDecoders(ctx);

    // Reset lastQueuedSample after flush
    for (const sourceState of ctx.sources.values()) {
      sourceState.videoDecoder.setLastQueuedSample(-1);
    }

    const rendered = renderFrame(ctx, timeUs);
    ctx.pendingPausedRender = !rendered;
  }

  ctx.postResponse({ type: 'TIME_UPDATE', currentTimeUs: timeUs } as TimeUpdateEvent);
  ctx.postResponse({ type: 'SEEK_COMPLETE', timeUs } as SeekCompleteEvent);
}

/**
 * Sync to a specific time (used for external time sync)
 */
export function syncToTime(ctx: WorkerContext, timeUs: number): void {
  if (ctx.state === 'playing') {
    ctx.playbackStartTimeUs = timeUs;
    ctx.playbackStartWallTime = performance.now();
  }
  ctx.currentTimeUs = timeUs;
}

/**
 * Main playback loop - called via requestAnimationFrame
 */
export function playbackLoop(ctx: WorkerContext): void {
  if (ctx.state !== 'playing') return;

  const elapsed = performance.now() - ctx.playbackStartWallTime;
  const targetTimeUs = ctx.playbackStartTimeUs + Math.round(elapsed * 1000);

  // Check for end of composition
  if (ctx.compositionDurationUs > 0 && targetTimeUs >= ctx.compositionDurationUs) {
    ctx.currentTimeUs = ctx.compositionDurationUs;
    pause(ctx);
    return;
  }

  ctx.currentTimeUs = targetTimeUs;

  feedDecoders(ctx, ctx.currentTimeUs, { reason: 'playback' });
  renderFrame(ctx, ctx.currentTimeUs);

  ctx.postResponse({ type: 'TIME_UPDATE', currentTimeUs: ctx.currentTimeUs } as TimeUpdateEvent);

  ctx.animationFrameId = requestAnimationFrame(() => playbackLoop(ctx));
}
