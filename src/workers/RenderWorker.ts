/// <reference lib="webworker" />
/**
 * Video Editor V2 - Render Worker
 * Handles demuxing, decoding, and rendering of video sources.
 */

import * as MP4Box from 'mp4box';
import type { MP4File, MP4VideoTrack, MP4AudioTrack, MP4Sample, MP4Info } from 'mp4box';
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
  PerfMetricsEvent,
  WorkerPerfMetrics,
} from './messages/renderMessages';
import type { ActiveClip } from '../core/types';
import { WebGLRenderer } from '../renderer/WebGLRenderer';
import { Compositor, type CompositorLayer } from '../renderer/Compositor';
import { PLAYBACK, TIME, DECODER, PERFORMANCE } from '../constants';
import { createLogger, setLogLevel } from '../utils/logger';
import { detectDeviceTier, TIER_CONFIGS, type DeviceTier, type TierConfig } from '../utils/deviceTier';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
// Force verbose logging while debugging seek/preview issues.
setLogLevel('debug');
const logger = createLogger('RenderWorker');

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

  // Audio decoding
  audioTrack: MP4AudioTrack | null;
  audioDecoder: AudioDecoder | null;
  decodedAudioChunks: { data: Float32Array; timestampUs: number; durationUs: number }[];
  audioSampleRate: number;
  audioChannels: number;
  audioDecodingComplete: boolean;
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

// Track whether any clips exist at the current time (vs an empty gap)
let hasClipsAtCurrentTime = false;
// Composition duration for playback end detection
let compositionDurationUs = 0;

// When paused after a seek we may need to re-render once fresh frames arrive
// (e.g., when waiting on streamed data). Track that requirement here.
let pendingPausedRender = false;

let state: WorkerState = 'idle';
let currentTimeUs = 0;
let playbackStartTimeUs = 0;
let playbackStartWallTime = 0;
let animationFrameId: number | null = null;

// Performance optimization state
const deviceTier: DeviceTier = detectDeviceTier();
const tierConfig: TierConfig = TIER_CONFIGS[deviceTier];

// FPS matching state
let targetFrameIntervalMs = tierConfig.frameIntervalMs;
let lastRenderTime = 0;

// Performance metrics
let framesDecoded = 0;
let framesRendered = 0;
let framesDropped = 0;
let lastMetricsTime = 0;
let frameTimestamps: number[] = [];

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
        hasClipsAtCurrentTime = cmd.hasClipsAtTime;
        compositionDurationUs = cmd.compositionDurationUs;
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

    // Flush audio decoder to get remaining samples for streaming sources
    flushAudioDecoder(sourceState);
  }

  // If we're paused and waiting for a frame (e.g., user seeked ahead of
  // currently buffered data), try to decode and render again now that more
  // samples are available.
  if (pendingPausedRender && state !== 'playing') {
    logger.info('New chunk while paused - retry render', {
      sourceId,
      samples: sourceState.samples.length,
      framesQueued: sourceState.frameQueue.length,
    });
    feedDecoders(currentTimeUs, { reason: 'stream-pending' });
    void flushAllDecoders().then(() => {
      if (state !== 'playing' && pendingPausedRender) {
        const rendered = renderFrame(currentTimeUs);
        if (rendered) {
          pendingPausedRender = false;
        }
      }
    });
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

    // Audio fields
    audioTrack: null,
    audioDecoder: null,
    decodedAudioChunks: [],
    audioSampleRate: 0,
    audioChannels: 0,
    audioDecodingComplete: false,
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

    // Initialize video decoder
    initDecoder(sourceState, videoTrack);

    // Request video samples
    mp4File.setExtractionOptions(videoTrack.id, 'video', { nbSamples: 1000 });

    // Extract audio track if present
    const audioTrack = info.audioTracks[0];
    if (audioTrack) {
      sourceState.audioTrack = audioTrack;
      sourceState.audioSampleRate = audioTrack.audio.sample_rate;
      sourceState.audioChannels = audioTrack.audio.channel_count;

      // Initialize audio decoder
      initAudioDecoder(sourceState, audioTrack);

      // Request audio samples
      mp4File.setExtractionOptions(audioTrack.id, 'audio', { nbSamples: 1000 });
    } else {
      // No audio track - mark audio as complete
      sourceState.audioDecodingComplete = true;
    }

    mp4File.start();
  };

  mp4File.onSamples = (trackId: number, _ref: unknown, samples: MP4Sample[]) => {
    const isAudioTrack = sourceState.audioTrack && trackId === sourceState.audioTrack.id;

    for (const sample of samples) {
      if (isAudioTrack) {
        // Audio sample - decode it
        if (sourceState.audioDecoder && sourceState.audioDecoder.state === 'configured') {
          const chunk = new EncodedAudioChunk({
            type: sample.is_sync ? 'key' : 'delta',
            timestamp: Math.round((sample.cts / sample.timescale) * TIME.US_PER_SECOND),
            duration: Math.round((sample.duration / sample.timescale) * TIME.US_PER_SECOND),
            data: sample.data,
          });
          sourceState.audioDecoder.decode(chunk);
        }
      } else {
        // Video sample - existing logic
        sourceState.samples.push(sample);
        if (sample.is_sync) {
          sourceState.keyframeIndices.push(sourceState.samples.length - 1);
        }
      }
    }

    // Mark ready when we have all samples for non-streaming
    if (!sourceState.isStreaming && !sourceState.isReady) {
      sourceState.isReady = true;

      // Flush audio decoder to get remaining samples
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

      // If we're paused and waiting for a frame after a seek, render as soon
      // as one becomes available (e.g., once streamed data arrives).
      if (state !== 'playing' && pendingPausedRender) {
        const rendered = renderFrame(currentTimeUs);
        logger.debug('Decoder output while paused', {
          sourceId: sourceState.sourceId,
          frameTs: frame.timestamp,
          pendingPausedRender,
          rendered,
          queueLength: sourceState.frameQueue.length,
        });
        if (rendered) {
          pendingPausedRender = false;
        }
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

// ============================================================================
// AUDIO DECODING
// ============================================================================

function initAudioDecoder(sourceState: SourceDecodeState, audioTrack: MP4AudioTrack): void {
  sourceState.audioDecoder = new AudioDecoder({
    output: (audioData: AudioData) => {
      // Get the number of channels and frames
      const numberOfChannels = audioData.numberOfChannels;
      const numberOfFrames = audioData.numberOfFrames;

      // Create interleaved Float32Array for all channels
      const pcmData = new Float32Array(numberOfFrames * numberOfChannels);

      // Copy each channel's data
      for (let ch = 0; ch < numberOfChannels; ch++) {
        const channelData = new Float32Array(numberOfFrames);
        audioData.copyTo(channelData, { planeIndex: ch, format: 'f32-planar' });

        // Interleave the channel data
        for (let i = 0; i < numberOfFrames; i++) {
          pcmData[i * numberOfChannels + ch] = channelData[i]!;
        }
      }

      sourceState.decodedAudioChunks.push({
        data: pcmData,
        timestampUs: audioData.timestamp,
        durationUs: audioData.duration,
      });

      audioData.close();

      // Check if we have enough audio data to send
      if (sourceState.decodedAudioChunks.length >= 50) {
        sendAudioChunks(sourceState);
      }
    },
    error: (err) => {
      postError(`Audio decoder error: ${err.message}`, sourceState.sourceId);
    },
  });

  // Get audio codec description (for AAC)
  const codecDescription = getAudioCodecDescription(sourceState.mp4File, audioTrack.id);

  sourceState.audioDecoder.configure({
    codec: audioTrack.codec,
    sampleRate: audioTrack.audio.sample_rate,
    numberOfChannels: audioTrack.audio.channel_count,
    description: codecDescription ?? undefined,
  });
}

function getAudioCodecDescription(mp4File: MP4File, trackId: number): Uint8Array | null {
  const track = mp4File.getTrackById(trackId);
  if (!track) return null;

  for (const entry of (track as any).mdia.minf.stbl.stsd.entries) {
    // AAC codec specific data (esds box)
    const esds = entry.esds;
    if (esds && esds.esd && esds.esd.descs) {
      for (const desc of esds.esd.descs) {
        if (desc.tag === 5 && desc.data) {
          return new Uint8Array(desc.data);
        }
      }
    }
    // Try mp4a box
    if (entry.type === 'mp4a' && entry.esds) {
      const esdsData = entry.esds;
      if (esdsData.esd && esdsData.esd.descs) {
        for (const desc of esdsData.esd.descs) {
          if (desc.tag === 5 && desc.data) {
            return new Uint8Array(desc.data);
          }
        }
      }
    }
  }
  return null;
}

function sendAudioChunks(sourceState: SourceDecodeState): void {
  if (sourceState.decodedAudioChunks.length === 0) return;

  // Batch all chunks into a single buffer
  const chunks = sourceState.decodedAudioChunks.splice(0, sourceState.decodedAudioChunks.length);
  const totalSamples = chunks.reduce((sum, c) => sum + c.data.length, 0);
  const combined = new Float32Array(totalSamples);

  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk.data, offset);
    offset += chunk.data.length;
  }

  const firstChunk = chunks[0]!;
  const lastChunk = chunks[chunks.length - 1]!;
  const totalDurationUs = (lastChunk.timestampUs + lastChunk.durationUs) - firstChunk.timestampUs;

  const event: AudioDataEvent = {
    type: 'AUDIO_DATA',
    sourceId: sourceState.sourceId,
    audioData: combined.buffer,
    sampleRate: sourceState.audioSampleRate,
    channels: sourceState.audioChannels,
    timestampUs: firstChunk.timestampUs,
    durationUs: totalDurationUs,
  };

  postResponse(event, [combined.buffer]);
}

function flushAudioDecoder(sourceState: SourceDecodeState): void {
  if (sourceState.audioDecoder && sourceState.audioDecoder.state === 'configured') {
    sourceState.audioDecoder.flush().then(() => {
      // Send any remaining audio chunks
      sendAudioChunks(sourceState);
      sourceState.audioDecodingComplete = true;

      // Notify main thread that audio is complete
      postResponse({
        type: 'AUDIO_DATA',
        sourceId: sourceState.sourceId,
        audioData: new ArrayBuffer(0),
        sampleRate: sourceState.audioSampleRate,
        channels: sourceState.audioChannels,
        timestampUs: 0,
        durationUs: 0,
        isComplete: true,
      } as AudioDataEvent & { isComplete: boolean });
    });
  }
}

function removeSource(sourceId: string): void {
  const sourceState = sources.get(sourceId);
  if (!sourceState) return;

  // Close video decoder
  if (sourceState.decoder?.state !== 'closed') {
    sourceState.decoder?.close();
  }

  // Close audio decoder
  if (sourceState.audioDecoder?.state !== 'closed') {
    sourceState.audioDecoder?.close();
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

  // If paused, remember that we owe the UI a render for this position
  pendingPausedRender = state !== 'playing';

  logger.info('Seek requested', {
    timeUs,
    state,
    activeClips: activeClips.length,
  });

  // If playing, reset playback timing to prevent loop from reverting position
  if (state === 'playing') {
    playbackStartTimeUs = timeUs;
    playbackStartWallTime = performance.now();
  }

  // OPTIMIZATION: Show nearest cached frame immediately for instant visual feedback
  // This prevents the UI from appearing frozen during seek
  const instantFrame = findNearestCachedFrame(timeUs);
  if (instantFrame && compositor) {
    logger.debug('Seek: instant feedback with cached frame', {
      targetTimeUs: timeUs,
      cachedFrameTimeUs: instantFrame.timestampUs,
    });
    // Render the cached frame immediately (don't close it yet)
    const layers: CompositorLayer[] = [];
    for (const clip of activeClips) {
      if (clip.trackType !== 'video') continue;
      if (!isClipActiveAt(clip, timeUs)) continue;
      const sourceState = sources.get(clip.sourceId);
      if (!sourceState) continue;
      if (instantFrame.sourceId === clip.sourceId) {
        layers.push({ frame: instantFrame.frame, clip });
        break;
      }
    }
    if (layers.length > 0) {
      compositor.composite(layers);
      // Don't close - frame is still in queue
    }
  }

  // Clear frame queues and reset decoders
  for (const sourceState of sources.values()) {
    for (const { frame } of sourceState.frameQueue) {
      frame.close();
    }
    sourceState.frameQueue = [];
    sourceState.lastQueuedSample = -1;

    // Reset decoder - non-blocking
    if (sourceState.decoder?.state === 'configured') {
      sourceState.decoder.reset();
      initDecoder(sourceState, sourceState.videoTrack!);
    }
  }

  // Pre-decode frames for current time
  feedDecoders(timeUs, { reason: 'seek' });

  // Wait for decoders to finish processing, then render
  if (state !== 'playing') {
    await flushAllDecoders();

    // CRITICAL: Reset lastQueuedSample after flush!
    // After flush(), decoder requires a keyframe as next input.
    // Reset lastQueuedSample so next feedDecoders() starts from keyframe.
    for (const sourceState of sources.values()) {
      sourceState.lastQueuedSample = -1;
    }

    const rendered = renderFrame(timeUs);
    pendingPausedRender = !rendered;
    logger.debug('Seek render result', {
      rendered,
      pendingPausedRender,
    });
  }

  postResponse({ type: 'TIME_UPDATE', currentTimeUs: timeUs } as TimeUpdateEvent);

  // Notify main thread that seek is complete and audio can be scheduled
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

  const now = performance.now();

  // OPTIMIZATION: FPS matching - skip render if not enough time has passed
  // This reduces CPU usage when source video is 24/30fps but display is 60fps
  const timeSinceLastRender = now - lastRenderTime;
  if (timeSinceLastRender < targetFrameIntervalMs) {
    // Still need to check for end of composition and schedule next frame
    animationFrameId = requestAnimationFrame(playbackLoop);
    return;
  }

  // Track frame timing for FPS calculation
  frameTimestamps.push(now);
  if (frameTimestamps.length > PERFORMANCE.FPS_WINDOW_SIZE) {
    frameTimestamps.shift();
  }

  // Calculate current time from wall clock
  const elapsed = now - playbackStartWallTime;
  const targetTimeUs = playbackStartTimeUs + Math.round(elapsed * 1000);

  // Check if past composition duration (use compositionDurationUs from Engine,
  // not computed from activeClips, to allow playback through gaps)
  if (compositionDurationUs > 0 && targetTimeUs >= compositionDurationUs) {
    currentTimeUs = compositionDurationUs;
    pause();
    return;
  }

  // OPTIMIZATION: Graceful frame dropping on low-end devices
  // If we're falling behind, skip to catch up
  const lag = targetTimeUs - currentTimeUs;
  const lagMs = lag / 1000;
  if (lagMs > tierConfig.frameDropThresholdMs && currentTimeUs > 0) {
    framesDropped++;
    logger.debug('Frame drop due to lag', {
      lagMs,
      threshold: tierConfig.frameDropThresholdMs,
      droppedTotal: framesDropped,
    });
    // Skip ahead but still render
  }

  currentTimeUs = targetTimeUs;
  lastRenderTime = now;

  // Feed decoders
  feedDecoders(currentTimeUs, { reason: 'playback' });

  // Render frame
  const rendered = renderFrame(currentTimeUs);
  if (rendered) {
    framesRendered++;
  }

  // Post time update
  postResponse({ type: 'TIME_UPDATE', currentTimeUs } as TimeUpdateEvent);

  // Send performance metrics periodically
  if (now - lastMetricsTime >= PERFORMANCE.METRICS_INTERVAL_MS) {
    sendPerformanceMetrics();
    lastMetricsTime = now;
  }

  // Continue loop
  animationFrameId = requestAnimationFrame(playbackLoop);
}

/**
 * Send performance metrics to main thread for profiling UI.
 */
function sendPerformanceMetrics(): void {
  // Calculate FPS from frame timestamps
  let fps = 0;
  let avgFrameTimeMs = 0;

  if (frameTimestamps.length >= 2) {
    const first = frameTimestamps[0]!;
    const last = frameTimestamps[frameTimestamps.length - 1]!;
    const duration = last - first;
    if (duration > 0) {
      fps = Math.round((frameTimestamps.length - 1) / (duration / 1000));
      avgFrameTimeMs = Math.round((duration / (frameTimestamps.length - 1)) * 100) / 100;
    }
  }

  // Collect decoder and frame queue depths
  const decoderQueueDepth: Record<string, number> = {};
  const frameQueueDepth: Record<string, number> = {};

  for (const [sourceId, sourceState] of sources.entries()) {
    decoderQueueDepth[sourceId] = sourceState.decoder?.decodeQueueSize ?? 0;
    frameQueueDepth[sourceId] = sourceState.frameQueue.length;
  }

  const metrics: WorkerPerfMetrics = {
    decoderQueueDepth,
    frameQueueDepth,
    fps,
    avgFrameTimeMs,
    framesDecoded,
    framesRendered,
    framesDropped,
    deviceTier,
    isPlaying: state === 'playing',
  };

  const event: PerfMetricsEvent = { type: 'PERF_METRICS', metrics };
  postResponse(event);
}

async function flushAllDecoders(): Promise<void> {
  const flushPromises: Promise<void>[] = [];

  for (const sourceState of sources.values()) {
    if (sourceState.decoder?.state === 'configured') {
      flushPromises.push(sourceState.decoder.flush());
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

  // Get adaptive limits based on device tier
  const maxPendingDecodes = tierConfig.maxPendingDecodes;
  const maxSamplesPerFeed = DECODER.MAX_SAMPLES_PER_FEED;

  for (const clip of activeClips) {
    // CRITICAL: Only decode video for clips on video tracks
    // Audio track clips should not decode video - saves decoder resources
    if (clip.trackType !== 'video') continue;

    if (!isClipActiveAt(clip, timelineTimeUs)) continue;

    const sourceState = sources.get(clip.sourceId);
    if (!sourceState || !sourceState.decoder) continue;

    // OPTIMIZATION: Check decoder queue depth and apply backpressure
    // This prevents overwhelming low-end devices
    const decoderQueueSize = sourceState.decoder.decodeQueueSize;
    if (decoderQueueSize >= maxPendingDecodes) {
      logger.debug('Decoder backpressure applied', {
        sourceId: clip.sourceId,
        queueSize: decoderQueueSize,
        maxPending: maxPendingDecodes,
      });
      continue; // Wait for decoder to catch up
    }

    // Convert timeline time to source time
    const sourceTimeUs = timelineTimeUs - clip.timelineStartUs + clip.sourceStartUs;

    // Find keyframe before target time
    const targetSample = findSampleAtTime(sourceState, sourceTimeUs);
    if (targetSample < 0) continue;

    const keyframeIdx = findKeyframeBefore(sourceState, targetSample);

    // Queue samples from keyframe to target + buffer ahead
    const startIdx = Math.max(sourceState.lastQueuedSample + 1, keyframeIdx);

    // OPTIMIZATION: Limit how far ahead we buffer based on device tier
    const bufferAhead = tierConfig.lookAheadFrames;
    const endIdx = Math.min(
      targetSample + bufferAhead,
      sourceState.samples.length - 1
    );

    // OPTIMIZATION: Limit samples fed per iteration to prevent blocking
    const samplesToFeed = Math.min(endIdx - startIdx + 1, maxSamplesPerFeed);
    const actualEndIdx = startIdx + samplesToFeed - 1;

    if (startIdx > actualEndIdx) continue;

    logger.debug('Queue decode', {
      clipId: clip.clipId,
      sourceId: clip.sourceId,
      reason,
      targetTimeUs: timelineTimeUs,
      sourceTimeUs,
      targetSample,
      keyframeIdx,
      startIdx,
      endIdx: actualEndIdx,
      lastQueuedSample: sourceState.lastQueuedSample,
      decoderState: sourceState.decoder.state,
      decoderQueueSize,
      deviceTier,
    });

    for (let i = startIdx; i <= actualEndIdx; i++) {
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
      framesDecoded++;
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

function renderFrame(timelineTimeUs: number): boolean {
  if (!compositor) {
    logger.debug('Render skipped - no compositor', { timelineTimeUs });
    return false;
  }

  const layers: CompositorLayer[] = [];

  // Track if we have any VIDEO clips that SHOULD render (regardless of buffer state)
  // This is different from hasClipsAtCurrentTime which includes audio clips
  let hasVideoClipsAtTime = false;

  for (const clip of activeClips) {
    // CRITICAL: Only render video for clips on video tracks
    // Audio track clips should not produce video - video comes from video tracks only
    if (clip.trackType !== 'video') continue;

    if (!isClipActiveAt(clip, timelineTimeUs)) continue;

    // Mark that we have video clips even if we can't get a frame yet
    hasVideoClipsAtTime = true;

    const sourceState = sources.get(clip.sourceId);
    if (!sourceState) continue;

    const sourceTimeUs = timelineTimeUs - clip.timelineStartUs + clip.sourceStartUs;
    const frame = getFrameAtTime(sourceState, sourceTimeUs);

    if (frame) {
      layers.push({ frame, clip });
    }
  }

  if (layers.length > 0) {
    logger.info('Rendering composed frame', {
      timelineTimeUs,
      layers: layers.map(l => ({ clipId: l.clip.clipId, trackIndex: l.clip.trackIndex, sourceId: l.clip.sourceId, frameTs: l.frame.timestamp })),
    });

    compositor.composite(layers);

    // Close frames after compositing
    for (const { frame } of layers) {
      frame.close();
    }
    return true;
  }

  // No frames rendered - distinguish between GAP and BUFFERING
  // GAP: No VIDEO clips at this time (even if audio clips exist) → clear to black
  // BUFFERING: Video clips exist but frames not decoded yet → retain last frame
  if (!hasVideoClipsAtTime) {
    // Clear to black - either no clips at all, or only audio clips (no video to show)
    logger.info('Render clearing - no video at this time', {
      timelineTimeUs,
      hasClipsAtCurrentTime,
      hasVideoClipsAtTime,
    });
    compositor.clear();
    return true; // We did render (black frame)
  }

  // BUFFERING: Video clips exist but frames not decoded yet - retain last frame
  // This prevents flickering during playback when waiting for frames
  logger.info('Render skipped - buffering video', {
    timelineTimeUs,
    activeClips: activeClips.length,
    hasVideoClipsAtTime,
    queues: Array.from(sources.entries()).map(([id, s]) => ({ sourceId: id, queue: s.frameQueue.length, samples: s.samples.length })),
  });
  return false;
}

function getFrameAtTime(sourceState: SourceDecodeState, targetTimeUs: number): VideoFrame | null {
  const queue = sourceState.frameQueue;
  if (queue.length === 0) return null;

  // Find best frame (closest to target time, not exceeding it)
  let bestIdx = -1;
  let bestDiff = Infinity;

  // Fallback: nearest frame even if it's after the target (prevents black when
  // only future frames are buffered after a seek)
  let fallbackIdx = -1;
  let fallbackDiff = Infinity;

  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i]!;
    const diff = targetTimeUs - entry.timestampUs;

    // Frame is before target time and closer than previous best
    if (diff >= 0 && diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }

    // Track closest frame in either direction as a fallback
    const absDiff = Math.abs(diff);
    if (absDiff < fallbackDiff) {
      fallbackDiff = absDiff;
      fallbackIdx = i;
    }
  }

  if (bestIdx < 0) {
    // Nothing at/before target; use nearest frame (likely slightly in the future)
    bestIdx = fallbackIdx;
    logger.info('No suitable frame found in queue', {
      sourceId: sourceState.sourceId,
      targetTimeUs,
      queueLength: queue.length,
      timestamps: queue.map(q => q.timestampUs),
      chosenFallbackIdx: fallbackIdx,
      fallbackDiff,
    });
  }

  // Clone frame for rendering (don't remove from queue yet)
  const entry = queue[bestIdx]!;

  logger.info('Selected frame for render', {
    sourceId: sourceState.sourceId,
    targetTimeUs,
    frameTs: entry.timestampUs,
    queueLength: queue.length,
  });

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

/**
 * Find the nearest cached frame across all sources for instant seek feedback.
 * Returns the frame with its source ID, or null if no cached frames exist.
 */
function findNearestCachedFrame(targetTimeUs: number): { frame: VideoFrame; timestampUs: number; sourceId: string } | null {
  let bestMatch: { frame: VideoFrame; timestampUs: number; sourceId: string } | null = null;
  let bestDiff = Infinity;

  for (const clip of activeClips) {
    if (clip.trackType !== 'video') continue;
    if (!isClipActiveAt(clip, targetTimeUs)) continue;

    const sourceState = sources.get(clip.sourceId);
    if (!sourceState || sourceState.frameQueue.length === 0) continue;

    // Convert timeline time to source time
    const sourceTimeUs = targetTimeUs - clip.timelineStartUs + clip.sourceStartUs;

    // Find closest frame in this source's queue
    for (const entry of sourceState.frameQueue) {
      const diff = Math.abs(entry.timestampUs - sourceTimeUs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = {
          frame: entry.frame,
          timestampUs: entry.timestampUs,
          sourceId: clip.sourceId,
        };
      }
    }
  }

  return bestMatch;
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
