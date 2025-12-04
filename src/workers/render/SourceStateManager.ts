/**
 * Source State Manager
 * Manages source lifecycle: create, load, stream, append, and remove.
 */

import type {
  SourceReadyEvent,
  SourcePlayableEvent,
} from '../messages/renderMessages';
import type { SourceState, WorkerContext } from './types';
import { Demuxer } from './Demuxer';
import { VideoDecoderWrapper } from './VideoDecoderWrapper';
import { AudioDecoderWrapper } from './AudioDecoderWrapper';
import { FrameBuffer } from './FrameBuffer';
import { PLAYBACK } from '../../constants';
import { sendAudioChunks, flushAudioDecoder } from './AudioProcessor';
import { renderFrame } from './FrameRenderer';
import { feedDecoders, flushAllDecoders } from './DecoderQueue';
import { createLogger } from '../../utils/logger';

const logger = createLogger('SourceStateManager');

/**
 * Create a new source state with decoder and demuxer
 */
export function createSourceState(
  ctx: WorkerContext,
  sourceId: string,
  isStreaming: boolean,
  durationHint?: number
): SourceState {
  const frameBuffer = new FrameBuffer();

  const videoDecoder = new VideoDecoderWrapper({
    onOutput: (frame) => {
      frameBuffer.push(frame, frame.timestamp);

      // If paused and waiting for frame, try to render
      if (ctx.state !== 'playing' && ctx.pendingPausedRender) {
        const rendered = renderFrame(ctx, ctx.currentTimeUs);
        if (rendered) ctx.pendingPausedRender = false;
      }
    },
    onError: (err) => ctx.postError(`Decoder error: ${err.message}`, sourceId),
  });

  let audioDecoder: AudioDecoderWrapper | null = null;

  // Create source state object first (needed for demuxer callbacks)
  const sourceState: SourceState = {
    sourceId,
    demuxer: null as unknown as Demuxer, // Will be set below
    videoDecoder,
    audioDecoder: null,
    frameBuffer,
    durationUs: durationHint ?? 0,
    width: 0,
    height: 0,
    isReady: false,
    isStreaming,
    audioDecodingComplete: false,
  };

  const demuxer = new Demuxer({
    onReady: (info) => {
      sourceState.width = info.width;
      sourceState.height = info.height;
      sourceState.durationUs = info.durationUs || durationHint || 0;

      // Configure video decoder
      if (info.videoTrack) {
        videoDecoder.configure(demuxer.getMp4File(), info.videoTrack);
      }

      // Configure audio decoder if audio track exists
      if (info.audioTrack) {
        audioDecoder = new AudioDecoderWrapper({
          onOutput: () => {
            // Batch audio chunks
            if (audioDecoder && audioDecoder.chunksCount >= 50) {
              sendAudioChunks(ctx, sourceState);
            }
          },
          onError: (err) => ctx.postError(`Audio decoder error: ${err.message}`, sourceId),
        });
        audioDecoder.configure(demuxer.getMp4File(), info.audioTrack);
        sourceState.audioDecoder = audioDecoder;
      } else {
        sourceState.audioDecodingComplete = true;
      }
    },
    onVideoSamples: () => {
      // Check if ready for non-streaming sources
      if (!isStreaming && !sourceState.isReady) {
        sourceState.isReady = true;
        flushAudioDecoder(ctx, sourceState);

        const event: SourceReadyEvent = {
          type: 'SOURCE_READY',
          sourceId,
          durationUs: sourceState.durationUs,
          width: sourceState.width,
          height: sourceState.height,
        };
        ctx.postResponse(event);
      }
    },
    onAudioSamples: (samples) => {
      if (audioDecoder && audioDecoder.state === 'configured') {
        for (const sample of samples) {
          audioDecoder.decode(sample);
        }
      }
    },
    onError: (err) => ctx.postError(err.message, sourceId),
  });

  sourceState.demuxer = demuxer;
  return sourceState;
}

/**
 * Load a complete source buffer
 */
export async function loadSource(
  ctx: WorkerContext,
  sourceId: string,
  buffer: ArrayBuffer,
  durationHint?: number
): Promise<void> {
  const sourceState = createSourceState(ctx, sourceId, false, durationHint);
  ctx.sources.set(sourceId, sourceState);

  sourceState.demuxer.appendBuffer(buffer, 0);
  sourceState.demuxer.flush();
}

/**
 * Start streaming a source
 */
export function startSourceStream(
  ctx: WorkerContext,
  sourceId: string,
  durationHint?: number
): void {
  const sourceState = createSourceState(ctx, sourceId, true, durationHint);
  ctx.sources.set(sourceId, sourceState);
}

/**
 * Append a chunk to a streaming source
 */
export function appendSourceChunk(
  ctx: WorkerContext,
  sourceId: string,
  chunk: ArrayBuffer,
  isLast: boolean
): void {
  const sourceState = ctx.sources.get(sourceId);
  if (!sourceState) {
    ctx.postError(`Source not found: ${sourceId}`, sourceId);
    return;
  }

  sourceState.demuxer.appendBuffer(chunk);

  // Check if playable for streaming sources
  if (!sourceState.isReady && sourceState.demuxer.sampleCount >= PLAYBACK.PLAYABLE_SAMPLE_COUNT) {
    const event: SourcePlayableEvent = {
      type: 'SOURCE_PLAYABLE',
      sourceId,
      durationUs: sourceState.durationUs,
      width: sourceState.width,
      height: sourceState.height,
      loadedSamples: sourceState.demuxer.sampleCount,
    };
    ctx.postResponse(event);
  }

  if (isLast) {
    sourceState.demuxer.flush();
    sourceState.isStreaming = false;
    flushAudioDecoder(ctx, sourceState);
  }

  // Retry render if paused and waiting
  if (ctx.pendingPausedRender && ctx.state !== 'playing') {
    feedDecoders(ctx, ctx.currentTimeUs, { reason: 'stream-pending' });
    void flushAllDecoders(ctx).then(() => {
      if (ctx.state !== 'playing' && ctx.pendingPausedRender) {
        const rendered = renderFrame(ctx, ctx.currentTimeUs);
        if (rendered) ctx.pendingPausedRender = false;
      }
    });
  }
}

/**
 * Remove a source and clean up resources
 */
export function removeSource(ctx: WorkerContext, sourceId: string): void {
  const sourceState = ctx.sources.get(sourceId);
  if (!sourceState) return;

  sourceState.videoDecoder.close();
  sourceState.audioDecoder?.close();
  sourceState.frameBuffer.clear();

  ctx.sources.delete(sourceId);
  ctx.postResponse({ type: 'SOURCE_REMOVED', sourceId });
}
