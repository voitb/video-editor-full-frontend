/// <reference lib="webworker" />
/**
 * Render Worker
 * Main entry point for the render worker.
 * Handles message routing and coordinates demuxing, decoding, and rendering.
 */

import type {
  RenderWorkerCommand,
  RenderWorkerEvent,
  SourceReadyEvent,
  SourcePlayableEvent,
  TimeUpdateEvent,
  PlaybackStateEvent,
  ErrorEvent,
  AudioDataEvent,
  SeekCompleteEvent,
} from '../messages/renderMessages';
import type { ActiveClip } from '../../core/types';
import { WebGLRenderer } from '../../renderer/WebGLRenderer';
import { Compositor, type CompositorLayer } from '../../renderer/Compositor';
import { PLAYBACK } from '../../constants';
import { createLogger, setLogLevel } from '../../utils/logger';

import type { WorkerState } from './types';
import { Demuxer } from './Demuxer';
import { VideoDecoderWrapper } from './VideoDecoderWrapper';
import { AudioDecoderWrapper, combineAudioChunks } from './AudioDecoderWrapper';
import { FrameBuffer } from './FrameBuffer';
import { findSampleAtTime, findKeyframeBefore } from './FrameSelector';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
setLogLevel('debug');
const logger = createLogger('RenderWorker');

// ============================================================================
// SOURCE STATE
// ============================================================================

interface SourceState {
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

// ============================================================================
// GLOBAL STATE
// ============================================================================

let canvas: OffscreenCanvas | null = null;
let renderer: WebGLRenderer | null = null;
let compositor: Compositor | null = null;

const sources = new Map<string, SourceState>();
let activeClips: ActiveClip[] = [];
let hasClipsAtCurrentTime = false;
let compositionDurationUs = 0;
let pendingPausedRender = false;

let state: WorkerState = 'idle';
let currentTimeUs = 0;
let playbackStartTimeUs = 0;
let playbackStartWallTime = 0;
let animationFrameId: number | null = null;

// ============================================================================
// POST RESPONSE
// ============================================================================

function postResponse(event: RenderWorkerEvent, transfer?: Transferable[]): void {
  ctx.postMessage(event, { transfer: transfer ?? [] });
}

function postError(message: string, sourceId?: string): void {
  const event: ErrorEvent = { type: 'ERROR', message, sourceId };
  postResponse(event);
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

ctx.onmessage = async (e: MessageEvent<RenderWorkerCommand>) => {
  const cmd = e.data;

  try {
    switch (cmd.type) {
      case 'INIT_CANVAS':
        initCanvas(cmd.canvas);
        break;

      case 'LOAD_SOURCE':
        await loadSource(cmd.sourceId, cmd.buffer, cmd.durationHint);
        break;

      case 'START_SOURCE_STREAM':
        startSourceStream(cmd.sourceId, cmd.durationHint);
        break;

      case 'APPEND_SOURCE_CHUNK':
        appendSourceChunk(cmd.sourceId, cmd.chunk, cmd.isLast);
        break;

      case 'REMOVE_SOURCE':
        removeSource(cmd.sourceId);
        break;

      case 'SET_ACTIVE_CLIPS':
        handleSetActiveClips(cmd.clips, cmd.hasClipsAtTime, cmd.compositionDurationUs);
        break;

      case 'SEEK':
        await seek(cmd.timeUs);
        break;

      case 'PLAY':
        play();
        break;

      case 'PAUSE':
        pause();
        break;

      case 'SYNC_TO_TIME':
        syncToTime(cmd.timeUs);
        break;

      case 'REQUEST_FIRST_FRAME':
        await requestFirstFrame(cmd.sourceId);
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    postError(message);
  }
};

// ============================================================================
// CANVAS INITIALIZATION
// ============================================================================

function initCanvas(offscreen: OffscreenCanvas): void {
  canvas = offscreen;
  renderer = new WebGLRenderer(canvas);
  compositor = new Compositor(canvas);
  state = 'ready';
  postResponse({ type: 'WORKER_READY' });
}

// ============================================================================
// SOURCE LOADING
// ============================================================================

function createSourceState(sourceId: string, isStreaming: boolean, durationHint?: number): SourceState {
  const frameBuffer = new FrameBuffer();

  const videoDecoder = new VideoDecoderWrapper({
    onOutput: (frame) => {
      frameBuffer.push(frame, frame.timestamp);

      // If paused and waiting for frame, try to render
      if (state !== 'playing' && pendingPausedRender) {
        const rendered = renderFrame(currentTimeUs);
        if (rendered) pendingPausedRender = false;
      }
    },
    onError: (err) => postError(`Decoder error: ${err.message}`, sourceId),
  });

  let audioDecoder: AudioDecoderWrapper | null = null;

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
              sendAudioChunks(sourceState);
            }
          },
          onError: (err) => postError(`Audio decoder error: ${err.message}`, sourceId),
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
        flushAudioDecoder(sourceState);

        const event: SourceReadyEvent = {
          type: 'SOURCE_READY',
          sourceId,
          durationUs: sourceState.durationUs,
          width: sourceState.width,
          height: sourceState.height,
        };
        postResponse(event);
      }
    },
    onAudioSamples: (samples) => {
      if (audioDecoder && audioDecoder.state === 'configured') {
        for (const sample of samples) {
          audioDecoder.decode(sample);
        }
      }
    },
    onError: (err) => postError(err.message, sourceId),
  });

  const sourceState: SourceState = {
    sourceId,
    demuxer,
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

  return sourceState;
}

async function loadSource(sourceId: string, buffer: ArrayBuffer, durationHint?: number): Promise<void> {
  const sourceState = createSourceState(sourceId, false, durationHint);
  sources.set(sourceId, sourceState);

  sourceState.demuxer.appendBuffer(buffer, 0);
  sourceState.demuxer.flush();
}

function startSourceStream(sourceId: string, durationHint?: number): void {
  const sourceState = createSourceState(sourceId, true, durationHint);
  sources.set(sourceId, sourceState);
}

function appendSourceChunk(sourceId: string, chunk: ArrayBuffer, isLast: boolean): void {
  const sourceState = sources.get(sourceId);
  if (!sourceState) {
    postError(`Source not found: ${sourceId}`, sourceId);
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
    postResponse(event);
  }

  if (isLast) {
    sourceState.demuxer.flush();
    sourceState.isStreaming = false;
    flushAudioDecoder(sourceState);
  }

  // Retry render if paused and waiting
  if (pendingPausedRender && state !== 'playing') {
    feedDecoders(currentTimeUs, { reason: 'stream-pending' });
    void flushAllDecoders().then(() => {
      if (state !== 'playing' && pendingPausedRender) {
        const rendered = renderFrame(currentTimeUs);
        if (rendered) pendingPausedRender = false;
      }
    });
  }
}

function removeSource(sourceId: string): void {
  const sourceState = sources.get(sourceId);
  if (!sourceState) return;

  sourceState.videoDecoder.close();
  sourceState.audioDecoder?.close();
  sourceState.frameBuffer.clear();

  sources.delete(sourceId);
  postResponse({ type: 'SOURCE_REMOVED', sourceId });
}

// ============================================================================
// AUDIO HANDLING
// ============================================================================

function sendAudioChunks(sourceState: SourceState): void {
  if (!sourceState.audioDecoder) return;

  const chunks = sourceState.audioDecoder.takeChunks();
  if (chunks.length === 0) return;

  const combined = combineAudioChunks(chunks);
  if (!combined) return;

  const audioBuffer = combined.data.buffer as ArrayBuffer;
  const event: AudioDataEvent = {
    type: 'AUDIO_DATA',
    sourceId: sourceState.sourceId,
    audioData: audioBuffer,
    sampleRate: sourceState.audioDecoder.getSampleRate(),
    channels: sourceState.audioDecoder.getChannels(),
    timestampUs: combined.timestampUs,
    durationUs: combined.durationUs,
  };

  postResponse(event, [audioBuffer]);
}

function flushAudioDecoder(sourceState: SourceState): void {
  if (!sourceState.audioDecoder || sourceState.audioDecoder.state !== 'configured') {
    sourceState.audioDecodingComplete = true;
    return;
  }

  sourceState.audioDecoder.flush().then((chunks) => {
    if (chunks.length > 0) {
      const combined = combineAudioChunks(chunks);
      if (combined) {
        const audioBuffer = combined.data.buffer as ArrayBuffer;
        const event: AudioDataEvent = {
          type: 'AUDIO_DATA',
          sourceId: sourceState.sourceId,
          audioData: audioBuffer,
          sampleRate: sourceState.audioDecoder!.getSampleRate(),
          channels: sourceState.audioDecoder!.getChannels(),
          timestampUs: combined.timestampUs,
          durationUs: combined.durationUs,
        };
        postResponse(event, [audioBuffer]);
      }
    }

    sourceState.audioDecodingComplete = true;
    postResponse({
      type: 'AUDIO_DATA',
      sourceId: sourceState.sourceId,
      audioData: new ArrayBuffer(0),
      sampleRate: sourceState.audioDecoder!.getSampleRate(),
      channels: sourceState.audioDecoder!.getChannels(),
      timestampUs: 0,
      durationUs: 0,
      isComplete: true,
    } as AudioDataEvent & { isComplete: boolean });
  });
}

// ============================================================================
// PLAYBACK CONTROL
// ============================================================================

function handleSetActiveClips(clips: ActiveClip[], hasClipsAtTime: boolean, durationUs: number): void {
  activeClips = clips;
  hasClipsAtCurrentTime = hasClipsAtTime;
  compositionDurationUs = durationUs;

  logger.info('SET_ACTIVE_CLIPS', {
    count: activeClips.length,
    hasClipsAtTime: hasClipsAtCurrentTime,
    compositionDurationUs,
    clipIds: activeClips.map(c => c.clipId),
    state,
    timelineTimeUs: currentTimeUs,
  });

  if (state !== 'playing') {
    const rendered = renderFrame(currentTimeUs);
    pendingPausedRender = !rendered;
  }
}

function play(): void {
  if (state !== 'ready') return;

  state = 'playing';
  pendingPausedRender = false;
  playbackStartTimeUs = currentTimeUs;
  playbackStartWallTime = performance.now();

  postResponse({ type: 'PLAYBACK_STATE', isPlaying: true } as PlaybackStateEvent);
  playbackLoop();
}

function pause(): void {
  if (state !== 'playing') return;

  state = 'ready';
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  postResponse({ type: 'PLAYBACK_STATE', isPlaying: false } as PlaybackStateEvent);
}

async function seek(timeUs: number): Promise<void> {
  currentTimeUs = timeUs;
  pendingPausedRender = state !== 'playing';

  logger.info('Seek requested', { timeUs, state, activeClips: activeClips.length });

  if (state === 'playing') {
    playbackStartTimeUs = timeUs;
    playbackStartWallTime = performance.now();
  }

  // Reset all decoders
  for (const sourceState of sources.values()) {
    sourceState.frameBuffer.clear();
    sourceState.videoDecoder.reset();

    const videoTrack = sourceState.demuxer.getVideoTrack();
    if (videoTrack) {
      sourceState.videoDecoder.configure(sourceState.demuxer.getMp4File(), videoTrack);
    }
  }

  feedDecoders(timeUs, { reason: 'seek' });

  if (state !== 'playing') {
    await flushAllDecoders();

    // Reset lastQueuedSample after flush
    for (const sourceState of sources.values()) {
      sourceState.videoDecoder.setLastQueuedSample(-1);
    }

    const rendered = renderFrame(timeUs);
    pendingPausedRender = !rendered;
  }

  postResponse({ type: 'TIME_UPDATE', currentTimeUs: timeUs } as TimeUpdateEvent);
  postResponse({ type: 'SEEK_COMPLETE', timeUs } as SeekCompleteEvent);
}

function syncToTime(timeUs: number): void {
  if (state === 'playing') {
    playbackStartTimeUs = timeUs;
    playbackStartWallTime = performance.now();
  }
  currentTimeUs = timeUs;
}

// ============================================================================
// PLAYBACK LOOP
// ============================================================================

function playbackLoop(): void {
  if (state !== 'playing') return;

  const elapsed = performance.now() - playbackStartWallTime;
  const targetTimeUs = playbackStartTimeUs + Math.round(elapsed * 1000);

  if (compositionDurationUs > 0 && targetTimeUs >= compositionDurationUs) {
    currentTimeUs = compositionDurationUs;
    pause();
    return;
  }

  currentTimeUs = targetTimeUs;

  feedDecoders(currentTimeUs, { reason: 'playback' });
  renderFrame(currentTimeUs);

  postResponse({ type: 'TIME_UPDATE', currentTimeUs } as TimeUpdateEvent);

  animationFrameId = requestAnimationFrame(playbackLoop);
}

async function flushAllDecoders(): Promise<void> {
  const flushPromises: Promise<void>[] = [];

  for (const sourceState of sources.values()) {
    if (sourceState.videoDecoder.state === 'configured') {
      flushPromises.push(sourceState.videoDecoder.flush());
    }
  }

  await Promise.all(flushPromises).catch((err) => {
    logger.error('Decoder flush failed', { err });
  });
}

// ============================================================================
// DECODING
// ============================================================================

function feedDecoders(timelineTimeUs: number, opts?: { reason?: string }): void {
  const reason = opts?.reason ?? 'loop';

  for (const clip of activeClips) {
    if (clip.trackType !== 'video') continue;
    if (!isClipActiveAt(clip, timelineTimeUs)) continue;

    const sourceState = sources.get(clip.sourceId);
    if (!sourceState) continue;

    const samples = sourceState.demuxer.getVideoSamples();
    const keyframeIndices = sourceState.demuxer.getKeyframeIndices();

    const sourceTimeUs = timelineTimeUs - clip.timelineStartUs + clip.sourceStartUs;
    const targetSample = findSampleAtTime(samples, sourceTimeUs);
    if (targetSample < 0) continue;

    const keyframeIdx = findKeyframeBefore(keyframeIndices, targetSample);
    const lastQueued = sourceState.videoDecoder.getLastQueuedSample();
    const startIdx = Math.max(lastQueued + 1, keyframeIdx);
    const endIdx = Math.min(targetSample + PLAYBACK.MAX_QUEUE_SIZE, samples.length - 1);

    logger.info('Queue decode', {
      clipId: clip.clipId,
      sourceId: clip.sourceId,
      reason,
      targetTimeUs: timelineTimeUs,
      sourceTimeUs,
      targetSample,
      keyframeIdx,
      startIdx,
      endIdx,
      lastQueuedSample: lastQueued,
      decoderState: sourceState.videoDecoder.state,
    });

    sourceState.videoDecoder.decodeSamples(samples, startIdx, endIdx);
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderFrame(timelineTimeUs: number): boolean {
  if (!compositor) {
    logger.debug('Render skipped - no compositor', { timelineTimeUs });
    return false;
  }

  const layers: CompositorLayer[] = [];
  let hasVideoClipsAtTime = false;

  for (const clip of activeClips) {
    if (clip.trackType !== 'video') continue;
    if (!isClipActiveAt(clip, timelineTimeUs)) continue;

    hasVideoClipsAtTime = true;

    const sourceState = sources.get(clip.sourceId);
    if (!sourceState) continue;

    const sourceTimeUs = timelineTimeUs - clip.timelineStartUs + clip.sourceStartUs;
    const frame = sourceState.frameBuffer.getFrameAtTime(sourceTimeUs);

    if (frame) {
      layers.push({ frame, clip });
    }
  }

  if (layers.length > 0) {
    logger.info('Rendering composed frame', {
      timelineTimeUs,
      layers: layers.map(l => ({
        clipId: l.clip.clipId,
        trackIndex: l.clip.trackIndex,
        sourceId: l.clip.sourceId,
        frameTs: l.frame.timestamp,
      })),
    });

    compositor.composite(layers);

    for (const { frame } of layers) {
      frame.close();
    }
    return true;
  }

  if (!hasVideoClipsAtTime) {
    logger.info('Render clearing - no video at this time', {
      timelineTimeUs,
      hasClipsAtCurrentTime,
      hasVideoClipsAtTime,
    });
    compositor.clear();
    return true;
  }

  logger.info('Render skipped - buffering video', {
    timelineTimeUs,
    activeClips: activeClips.length,
    hasVideoClipsAtTime,
    queues: Array.from(sources.entries()).map(([id, s]) => ({
      sourceId: id,
      queue: s.frameBuffer.length,
      samples: s.demuxer.sampleCount,
    })),
  });

  return false;
}

function isClipActiveAt(clip: ActiveClip, timelineTimeUs: number): boolean {
  const clipDuration = clip.sourceEndUs - clip.sourceStartUs;
  const clipEnd = clip.timelineStartUs + clipDuration;
  return timelineTimeUs >= clip.timelineStartUs && timelineTimeUs < clipEnd;
}

// ============================================================================
// FIRST FRAME
// ============================================================================

async function requestFirstFrame(sourceId: string): Promise<void> {
  const sourceState = sources.get(sourceId);
  if (!sourceState || !sourceState.frameBuffer.hasFrames()) return;

  const frame = sourceState.frameBuffer.getFirstFrame();
  if (!frame) return;

  if (renderer) {
    const tempCanvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
    const tempRenderer = new WebGLRenderer(tempCanvas);
    tempRenderer.drawWithoutClose(frame);

    const blob = await tempCanvas.convertToBlob({ type: 'image/png' });
    postResponse(
      {
        type: 'FIRST_FRAME',
        sourceId,
        blob,
        width: frame.displayWidth,
        height: frame.displayHeight,
      },
      []
    );

    tempRenderer.dispose();
  }

  frame.close();
}
