/// <reference lib="webworker" />
/**
 * Video Editor V2 - Render Worker
 * Handles demuxing, decoding, and rendering of video sources.
 */

import * as MP4Box from 'mp4box';
import type { MP4File, MP4VideoTrack, MP4Sample, MP4Info } from 'mp4box';
import type {
  RenderWorkerCommand,
  RenderWorkerEvent,
  SourceReadyEvent,
  SourcePlayableEvent,
  TimeUpdateEvent,
  PlaybackStateEvent,
  ErrorEvent,
} from './messages/renderMessages';
import type { ActiveClip } from '../core/types';
import { WebGLRenderer } from '../renderer/WebGLRenderer';
import { Compositor, type CompositorLayer } from '../renderer/Compositor';
import { PLAYBACK, TIME } from '../constants';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// ============================================================================
// TYPES
// ============================================================================

interface SourceDecodeState {
  sourceId: string;
  mp4File: MP4File;
  decoder: VideoDecoder | null;
  videoTrack: MP4VideoTrack | null;
  samples: MP4Sample[];
  keyframeIndices: number[];
  frameQueue: { frame: VideoFrame; timestampUs: number }[];
  durationUs: number;
  width: number;
  height: number;
  isReady: boolean;
  isStreaming: boolean;
  streamOffset: number;
  lastQueuedSample: number;
}

type WorkerState = 'idle' | 'ready' | 'playing';

// ============================================================================
// STATE
// ============================================================================

let canvas: OffscreenCanvas | null = null;
let renderer: WebGLRenderer | null = null;
let compositor: Compositor | null = null;

const sources = new Map<string, SourceDecodeState>();
let activeClips: ActiveClip[] = [];

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
        activeClips = cmd.clips;
        if (state !== 'playing') {
          renderFrame(currentTimeUs);
        }
        break;

      case 'SEEK':
        seek(cmd.timeUs);
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
        requestFirstFrame(cmd.sourceId);
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

async function loadSource(sourceId: string, buffer: ArrayBuffer, durationHint?: number): Promise<void> {
  const sourceState = createSourceState(sourceId, false);
  sourceState.durationUs = durationHint ?? 0;
  sources.set(sourceId, sourceState);

  // Append entire buffer
  const ab = buffer.slice(0) as MP4ArrayBuffer;
  ab.fileStart = 0;
  sourceState.mp4File.appendBuffer(ab);
  sourceState.mp4File.flush();
}

function startSourceStream(sourceId: string, durationHint?: number): void {
  const sourceState = createSourceState(sourceId, true);
  sourceState.durationUs = durationHint ?? 0;
  sources.set(sourceId, sourceState);
}

function appendSourceChunk(sourceId: string, chunk: ArrayBuffer, isLast: boolean): void {
  const sourceState = sources.get(sourceId);
  if (!sourceState) {
    postError(`Source not found: ${sourceId}`, sourceId);
    return;
  }

  const ab = chunk.slice(0) as MP4ArrayBuffer;
  ab.fileStart = sourceState.streamOffset;
  sourceState.streamOffset += chunk.byteLength;
  sourceState.mp4File.appendBuffer(ab);

  // Check if playable
  if (!sourceState.isReady && sourceState.samples.length >= PLAYBACK.PLAYABLE_SAMPLE_COUNT) {
    const event: SourcePlayableEvent = {
      type: 'SOURCE_PLAYABLE',
      sourceId,
      durationUs: sourceState.durationUs,
      width: sourceState.width,
      height: sourceState.height,
      loadedSamples: sourceState.samples.length,
    };
    postResponse(event);
  }

  if (isLast) {
    sourceState.mp4File.flush();
    sourceState.isStreaming = false;
  }
}

function createSourceState(sourceId: string, isStreaming: boolean): SourceDecodeState {
  const mp4File = MP4Box.createFile();
  const sourceState: SourceDecodeState = {
    sourceId,
    mp4File,
    decoder: null,
    videoTrack: null,
    samples: [],
    keyframeIndices: [],
    frameQueue: [],
    durationUs: 0,
    width: 0,
    height: 0,
    isReady: false,
    isStreaming,
    streamOffset: 0,
    lastQueuedSample: -1,
  };

  // Handle MP4Box events
  mp4File.onReady = (info: MP4Info) => {
    const videoTrack = info.videoTracks[0];
    if (!videoTrack) {
      postError('No video track found', sourceId);
      return;
    }

    sourceState.videoTrack = videoTrack;
    sourceState.width = videoTrack.video.width;
    sourceState.height = videoTrack.video.height;
    sourceState.durationUs = Math.round((videoTrack.duration / videoTrack.timescale) * TIME.US_PER_SECOND);

    // Initialize decoder
    initDecoder(sourceState, videoTrack);

    // Request samples
    mp4File.setExtractionOptions(videoTrack.id, null, { nbSamples: 1000 });
    mp4File.start();
  };

  mp4File.onSamples = (_trackId: number, _ref: unknown, samples: MP4Sample[]) => {
    for (const sample of samples) {
      sourceState.samples.push(sample);
      if (sample.is_sync) {
        sourceState.keyframeIndices.push(sourceState.samples.length - 1);
      }
    }

    // Mark ready when we have all samples for non-streaming
    if (!sourceState.isStreaming && !sourceState.isReady) {
      sourceState.isReady = true;
      const event: SourceReadyEvent = {
        type: 'SOURCE_READY',
        sourceId,
        durationUs: sourceState.durationUs,
        width: sourceState.width,
        height: sourceState.height,
      };
      postResponse(event);
    }
  };

  return sourceState;
}

function initDecoder(sourceState: SourceDecodeState, videoTrack: MP4VideoTrack): void {
  const codecDescription = getCodecDescription(sourceState.mp4File, videoTrack.id);

  sourceState.decoder = new VideoDecoder({
    output: (frame) => {
      sourceState.frameQueue.push({
        frame,
        timestampUs: frame.timestamp,
      });

      // Limit queue size
      while (sourceState.frameQueue.length > PLAYBACK.MAX_QUEUE_SIZE) {
        const oldest = sourceState.frameQueue.shift();
        oldest?.frame.close();
      }
    },
    error: (err) => {
      postError(`Decoder error: ${err.message}`, sourceState.sourceId);
    },
  });

  sourceState.decoder.configure({
    codec: videoTrack.codec,
    codedWidth: videoTrack.video.width,
    codedHeight: videoTrack.video.height,
    description: codecDescription ?? undefined,
  });
}

function getCodecDescription(mp4File: MP4File, trackId: number): Uint8Array | null {
  const track = mp4File.getTrackById(trackId);
  if (!track) return null;

  for (const entry of (track as any).mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC;
    if (box) {
      const stream = new (MP4Box as any).DataStream(undefined, 0, (MP4Box as any).DataStream.BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array(stream.buffer.slice(8));
    }
  }
  return null;
}

function removeSource(sourceId: string): void {
  const sourceState = sources.get(sourceId);
  if (!sourceState) return;

  // Close decoder
  if (sourceState.decoder?.state !== 'closed') {
    sourceState.decoder?.close();
  }

  // Close queued frames
  for (const { frame } of sourceState.frameQueue) {
    frame.close();
  }

  sources.delete(sourceId);
  postResponse({ type: 'SOURCE_REMOVED', sourceId });
}

// ============================================================================
// PLAYBACK CONTROL
// ============================================================================

function play(): void {
  if (state !== 'ready') return;

  state = 'playing';
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

function seek(timeUs: number): void {
  currentTimeUs = timeUs;

  // Clear frame queues and reset decoders
  for (const sourceState of sources.values()) {
    for (const { frame } of sourceState.frameQueue) {
      frame.close();
    }
    sourceState.frameQueue = [];
    sourceState.lastQueuedSample = -1;

    // Reset decoder
    if (sourceState.decoder?.state === 'configured') {
      sourceState.decoder.reset();
      initDecoder(sourceState, sourceState.videoTrack!);
    }
  }

  // Pre-decode frames for current time
  feedDecoders(timeUs);

  // Render
  if (state !== 'playing') {
    renderFrame(timeUs);
  }

  postResponse({ type: 'TIME_UPDATE', currentTimeUs: timeUs } as TimeUpdateEvent);
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

  // Calculate current time from wall clock
  const elapsed = performance.now() - playbackStartWallTime;
  const targetTimeUs = playbackStartTimeUs + Math.round(elapsed * 1000);

  // Check if past duration
  const maxDuration = getMaxDuration();
  if (targetTimeUs >= maxDuration) {
    currentTimeUs = maxDuration;
    pause();
    return;
  }

  currentTimeUs = targetTimeUs;

  // Feed decoders
  feedDecoders(currentTimeUs);

  // Render frame
  renderFrame(currentTimeUs);

  // Post time update
  postResponse({ type: 'TIME_UPDATE', currentTimeUs } as TimeUpdateEvent);

  // Continue loop
  animationFrameId = requestAnimationFrame(playbackLoop);
}

function getMaxDuration(): number {
  let max = 0;
  for (const clip of activeClips) {
    const clipEnd = clip.timelineStartUs + (clip.sourceEndUs - clip.sourceStartUs);
    max = Math.max(max, clipEnd);
  }
  return max;
}

// ============================================================================
// DECODING
// ============================================================================

function feedDecoders(timelineTimeUs: number): void {
  for (const clip of activeClips) {
    if (!isClipActiveAt(clip, timelineTimeUs)) continue;

    const sourceState = sources.get(clip.sourceId);
    if (!sourceState || !sourceState.decoder) continue;

    // Convert timeline time to source time
    const sourceTimeUs = timelineTimeUs - clip.timelineStartUs + clip.sourceStartUs;

    // Find keyframe before target time
    const targetSample = findSampleAtTime(sourceState, sourceTimeUs);
    if (targetSample < 0) continue;

    const keyframeIdx = findKeyframeBefore(sourceState, targetSample);

    // Queue samples from keyframe to target + buffer ahead
    const startIdx = Math.max(sourceState.lastQueuedSample + 1, keyframeIdx);
    const endIdx = Math.min(targetSample + PLAYBACK.MAX_QUEUE_SIZE, sourceState.samples.length - 1);

    for (let i = startIdx; i <= endIdx; i++) {
      const sample = sourceState.samples[i];
      if (!sample) continue;

      const chunk = new EncodedVideoChunk({
        type: sample.is_sync ? 'key' : 'delta',
        timestamp: Math.round((sample.cts / sample.timescale) * TIME.US_PER_SECOND),
        duration: Math.round((sample.duration / sample.timescale) * TIME.US_PER_SECOND),
        data: sample.data,
      });

      sourceState.decoder.decode(chunk);
      sourceState.lastQueuedSample = i;
    }
  }
}

function findSampleAtTime(sourceState: SourceDecodeState, timeUs: number): number {
  const samples = sourceState.samples;
  if (samples.length === 0) return -1;

  // Binary search
  let low = 0;
  let high = samples.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const sampleTime = (samples[mid]!.cts / samples[mid]!.timescale) * TIME.US_PER_SECOND;
    if (sampleTime < timeUs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function findKeyframeBefore(sourceState: SourceDecodeState, sampleIdx: number): number {
  const keyframes = sourceState.keyframeIndices;
  if (keyframes.length === 0) return 0;

  // Binary search for largest keyframe <= sampleIdx
  let low = 0;
  let high = keyframes.length - 1;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (keyframes[mid]! > sampleIdx) {
      high = mid - 1;
    } else {
      low = mid;
    }
  }

  return keyframes[low] ?? 0;
}

// ============================================================================
// RENDERING
// ============================================================================

function renderFrame(timelineTimeUs: number): void {
  if (!compositor) return;

  const layers: CompositorLayer[] = [];

  for (const clip of activeClips) {
    if (!isClipActiveAt(clip, timelineTimeUs)) continue;

    const sourceState = sources.get(clip.sourceId);
    if (!sourceState) continue;

    const sourceTimeUs = timelineTimeUs - clip.timelineStartUs + clip.sourceStartUs;
    const frame = getFrameAtTime(sourceState, sourceTimeUs);

    if (frame) {
      layers.push({ frame, clip });
    }
  }

  if (layers.length > 0) {
    compositor.composite(layers);

    // Close frames after compositing
    for (const { frame } of layers) {
      frame.close();
    }
  }
  // When no frames available, retain the last rendered frame on screen
  // (removing compositor.clear() fixes flickering during playback)
}

function getFrameAtTime(sourceState: SourceDecodeState, targetTimeUs: number): VideoFrame | null {
  const queue = sourceState.frameQueue;
  if (queue.length === 0) return null;

  // Find best frame (closest to target time, not exceeding it)
  let bestIdx = -1;
  let bestDiff = Infinity;

  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i]!;
    const diff = targetTimeUs - entry.timestampUs;

    // Frame is before target time and closer than previous best
    if (diff >= 0 && diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  if (bestIdx < 0) return null;

  // Clone frame for rendering (don't remove from queue yet)
  const entry = queue[bestIdx]!;

  // Drop old frames
  while (queue.length > 0 && queue[0]!.timestampUs < entry.timestampUs - PLAYBACK.MAX_FRAME_LAG_US) {
    const old = queue.shift();
    old?.frame.close();
  }

  // Clone the frame (original stays in queue for potential re-use)
  return entry.frame.clone();
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
  if (!sourceState || sourceState.frameQueue.length === 0) return;

  const frame = sourceState.frameQueue[0]?.frame;
  if (!frame) return;

  // Render to canvas and capture as blob
  if (renderer) {
    const tempCanvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
    const tempRenderer = new WebGLRenderer(tempCanvas);
    tempRenderer.drawWithoutClose(frame);

    const blob = await tempCanvas.convertToBlob({ type: 'image/png' });
    postResponse({
      type: 'FIRST_FRAME',
      sourceId,
      blob,
      width: frame.displayWidth,
      height: frame.displayHeight,
    }, []);

    tempRenderer.dispose();
  }
}

// MP4ArrayBuffer type for mp4box
interface MP4ArrayBuffer extends ArrayBuffer {
  fileStart: number;
}
