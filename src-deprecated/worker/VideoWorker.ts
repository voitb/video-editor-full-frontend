/// <reference lib="webworker" />
import { createFile, DataStream } from 'mp4box';
import type { MP4File, MP4Sample, MP4Info, MP4VideoTrack } from 'mp4box';
import { WebGLRenderer } from './renderer';
import { Compositor } from './compositor';
import type { WorkerCommand, WorkerResponse, ActiveClip } from '../types/editor';
import { PLAYBACK, TIME } from '../constants';
import { createWorkerLogger } from '../utils/logger';
import { findPreviousKeyframe as findPreviousKeyframeUtil } from '../utils/keyframeSearch';

const logger = createWorkerLogger('VideoWorker');

// ============================================================================
// STATE MACHINE
// ============================================================================
// Explicit states for the video worker to make state transitions clear
// and prevent invalid state combinations.

type WorkerState = 'idle' | 'loading' | 'ready' | 'seeking' | 'playing';

// ============================================================================
// MULTI-SOURCE STATE
// ============================================================================
// Per-source state for multi-source video compositing.
// Each loaded source maintains its own demuxer, decoder, and frame queue.

interface PerSourceState {
  sourceId: string;
  mp4File: MP4File | null;
  decoder: VideoDecoder | null;
  videoTrackInfo: MP4VideoTrack | null;
  codecDescription: Uint8Array | null;
  samples: MP4Sample[];
  keyframeIndices: number[];
  frameQueue: { frame: VideoFrame; timestamp: number }[];
  durationUs: number;
  width: number;
  height: number;
  isReady: boolean;
  lastQueuedSampleIndex: number;
  currentSampleIndex: number;
  // Streaming state per source
  streamOffset: number;
}

function createPerSourceState(sourceId: string): PerSourceState {
  return {
    sourceId,
    mp4File: null,
    decoder: null,
    videoTrackInfo: null,
    codecDescription: null,
    samples: [],
    keyframeIndices: [],
    frameQueue: [],
    durationUs: 0,
    width: 0,
    height: 0,
    isReady: false,
    lastQueuedSampleIndex: -1,
    currentSampleIndex: 0,
    streamOffset: 0,
  };
}

function disposePerSourceState(source: PerSourceState): void {
  // Close decoder
  if (source.decoder && source.decoder.state !== 'closed') {
    source.decoder.close();
  }
  source.decoder = null;

  // Close all frames in queue
  for (const { frame } of source.frameQueue) {
    frame.close();
  }
  source.frameQueue.length = 0;

  // Flush mp4File
  if (source.mp4File) {
    source.mp4File.flush();
  }
  source.mp4File = null;

  // Clear samples
  source.samples.length = 0;
  source.keyframeIndices.length = 0;
}

// ============================================================================
// GLOBAL WORKER STATE
// ============================================================================

interface VideoWorkerState {
  // Current state machine state
  state: WorkerState;

  // Playback flags
  isPlaying: boolean;
  isSeeking: boolean;

  // Core resources (null when idle)
  renderer: WebGLRenderer | null;
  compositor: Compositor | null;
  mp4File: MP4File | null;
  decoder: VideoDecoder | null;
  videoTrackInfo: MP4VideoTrack | null;

  // Codec description for sprite worker
  codecDescription: Uint8Array | null;

  // Video data
  samples: MP4Sample[];
  keyframeIndices: number[];  // O(log n) keyframe lookup
  frameQueue: { frame: VideoFrame; timestamp: number }[];

  // Trim bounds (microseconds)
  trimInPoint: number;
  trimOutPoint: number;

  // Playback timing
  lastRenderedTime: number;
  playbackStartTime: number;
  playbackStartWallTime: number;
  playbackMinTimestamp: number;
  needsWallClockSync: boolean;
  lastQueuedSampleIndex: number;

  // Seeking
  seekVersion: number;
  currentSeekVersion: number;
  seekTargetFrameCount: number;
  seekCurrentFrameCount: number;
  seekInProgress: boolean;
  pendingSeekTime: number | null;

  // Guards
  pauseRequested: boolean;
  startPlaybackInProgress: boolean;
  needsInitialSeek: boolean;
  pendingAutoPlay: boolean;
  hasCapturedFirstFrame: boolean;
  streamOffset: number;

  // Multi-source state
  sources: Map<string, PerSourceState>;
  activeClips: ActiveClip[];
  primarySourceId: string | null;
}

// Single source of truth for all worker state
const workerState: VideoWorkerState = {
  state: 'idle',
  isPlaying: false,
  isSeeking: false,
  renderer: null,
  compositor: null,
  mp4File: null,
  decoder: null,
  videoTrackInfo: null,
  codecDescription: null,
  samples: [],
  keyframeIndices: [],
  frameQueue: [],
  trimInPoint: 0,
  trimOutPoint: Infinity,
  lastRenderedTime: 0,
  playbackStartTime: 0,
  playbackStartWallTime: 0,
  playbackMinTimestamp: 0,
  needsWallClockSync: false,
  lastQueuedSampleIndex: -1,
  seekVersion: 0,
  currentSeekVersion: 0,
  seekTargetFrameCount: 0,
  seekCurrentFrameCount: 0,
  seekInProgress: false,
  pendingSeekTime: null,
  pauseRequested: false,
  startPlaybackInProgress: false,
  needsInitialSeek: false,
  pendingAutoPlay: false,
  hasCapturedFirstFrame: false,
  streamOffset: 0,

  // Multi-source state
  sources: new Map(),
  activeClips: [],
  primarySourceId: null,
};

// Convenience accessor for state
const state = workerState;
const { MAX_QUEUE_SIZE, MAX_FRAME_LAG_US } = PLAYBACK;
const { MICROSECONDS_PER_SECOND } = TIME;

// Send message to main thread
function postResponse(response: WorkerResponse): void {
  self.postMessage(response);
}

function ensureDecoderConfigured(): boolean {
  if (!state.videoTrackInfo) return false;

  if (!state.decoder || state.decoder.state === 'closed') {
    state.decoder = new VideoDecoder({
      output: handleDecodedFrame,
      error: (e) => {
        logger.warn('Decoder error (recoverable):', e);
        state.pendingAutoPlay = true;
        state.isPlaying = false;
        postResponse({ type: 'PLAYBACK_STATE', payload: { isPlaying: false } });
      },
    });
  }

  if (state.decoder.state !== 'configured') {
    const description = state.codecDescription ?? undefined;
    try {
      state.decoder.configure({
        codec: state.videoTrackInfo.codec,
        codedWidth: state.videoTrackInfo.video.width,
        codedHeight: state.videoTrackInfo.video.height,
        description,
      });
    } catch (e) {
      logger.warn('Failed to configure decoder:', e);
      return false;
    }
  }

  return state.decoder.state === 'configured';
}

function resetWorkerState(): void {
  // Close decoder before dropping reference
  try {
    state.decoder?.close();
  } catch (e) {
    logger.warn('Failed to close decoder cleanly:', e);
  }

  state.decoder = null;
  state.mp4File = null;
  state.videoTrackInfo = null;
  state.codecDescription = null;

  state.samples.length = 0;
  state.keyframeIndices.length = 0;
  state.frameQueue.forEach(({ frame }) => frame.close());
  state.frameQueue.length = 0;

  state.state = 'idle';
  state.isPlaying = false;
  state.isSeeking = false;
  state.pauseRequested = false;
  state.startPlaybackInProgress = false;
  state.needsWallClockSync = false;
  state.lastQueuedSampleIndex = -1;
  state.seekVersion = 0;
  state.currentSeekVersion = 0;
  state.seekTargetFrameCount = 0;
  state.seekCurrentFrameCount = 0;
  state.seekInProgress = false;
  state.pendingSeekTime = null;
  state.pendingAutoPlay = false;
  state.needsInitialSeek = false;
  state.hasCapturedFirstFrame = false;
  state.streamOffset = 0;

  state.trimInPoint = 0;
  state.trimOutPoint = Infinity;
  state.lastRenderedTime = 0;
  state.playbackStartTime = 0;
  state.playbackStartWallTime = 0;
  state.playbackMinTimestamp = 0;
}

// Handle incoming messages
self.onmessage = async (e: MessageEvent<WorkerCommand>) => {
  const { type } = e.data;

  switch (type) {
    case 'INIT_CANVAS': {
      const { canvas } = e.data.payload;
      state.renderer = new WebGLRenderer(canvas);
      break;
    }

    case 'LOAD_FILE': {
      const { file } = e.data.payload;
      await loadFile(file);
      break;
    }

    case 'LOAD_BUFFER': {
      const { buffer, durationHint } = e.data.payload;
      await loadBuffer(buffer, durationHint);
      break;
    }

    case 'START_STREAM': {
      const { durationHint } = e.data.payload;
      startStream(durationHint);
      break;
    }

    case 'APPEND_STREAM_CHUNK': {
      const { chunk, isLast } = e.data.payload;
      appendStreamChunk(chunk, isLast);
      break;
    }

    case 'SEEK': {
      const { timeUs } = e.data.payload;
      await seekTo(timeUs);
      break;
    }

    case 'PLAY': {
      if (state.samples.length === 0 || !state.decoder || state.decoder.state !== 'configured') {
        state.pendingAutoPlay = true;
      }
      void startPlayback();
      break;
    }

    case 'PAUSE': {
      void pausePlayback();  // Now async - fire and forget
      break;
    }

    case 'SET_TRIM': {
      const { inPoint, outPoint } = e.data.payload;
      state.trimInPoint = inPoint;
      state.trimOutPoint = outPoint;
      // Don't auto-seek during trim drag - let user control playhead separately
      // Playback will start from in-point if current position is before it
      break;
    }

    // ========================================================================
    // MULTI-SOURCE COMMANDS
    // ========================================================================

    case 'LOAD_SOURCE': {
      const { sourceId, file, buffer } = e.data.payload;
      await loadSource(sourceId, file, buffer);
      break;
    }

    case 'REMOVE_SOURCE': {
      const { sourceId } = e.data.payload;
      removeSource(sourceId);
      break;
    }

    case 'SET_ACTIVE_CLIPS': {
      const { clips } = e.data.payload;
      const wasEmpty = state.activeClips.length === 0;
      state.activeClips = clips;
      logger.log('Active clips updated:', clips.length);

      // Render first frame when clips are first set
      if (wasEmpty && clips.length > 0) {
        void renderMultiSourceFirstFrame();
      }

      // Check for pending auto-play
      if (state.pendingAutoPlay && !state.isPlaying && clips.length > 0) {
        void startPlayback();
      }
      break;
    }

    // ========================================================================
    // STREAMING SOURCE COMMANDS (Progressive HLS)
    // ========================================================================

    case 'START_SOURCE_STREAM': {
      const { sourceId, durationHint } = e.data.payload;
      startSourceStream(sourceId, durationHint);
      break;
    }

    case 'APPEND_SOURCE_CHUNK': {
      const { sourceId, chunk, isLast } = e.data.payload;
      appendSourceChunk(sourceId, chunk, isLast);
      break;
    }

    case 'SYNC_TO_TIME': {
      const { timeUs } = e.data.payload;
      // Sync video to audio clock - adjust playback position without full seek
      if (state.isPlaying) {
        state.playbackStartTime = timeUs;
        state.playbackStartWallTime = performance.now();
      }
      break;
    }
  }
};

function handleDecodedFrame(frame: VideoFrame): void {
  // CRITICAL: Check version FIRST before any processing
  // This prevents stale frames from being logged or processed at all
  if (state.currentSeekVersion !== state.seekVersion) {
    frame.close();
    return;
  }

  // CRITICAL: Discard frames if pause is in progress
  // This prevents in-flight decoder frames from corrupting lastRenderedTime
  if (state.pauseRequested) {
    frame.close();
    return;
  }

  const timestamp = frame.timestamp ?? 0;

  // If seeking, only render the last frame
  if (state.isSeeking) {
    state.seekCurrentFrameCount++;
    if (state.seekCurrentFrameCount < state.seekTargetFrameCount) {
      // Intermediate frame during seek - close immediately
      frame.close();
      return;
    }
    // This is the target frame - clear seeking state and render immediately
    state.isSeeking = false;

    if (state.renderer) {
      queueFirstFrameCapture(frame);
      // state.renderer.draw() takes ownership of frame and will close it
      state.renderer.draw(frame);
      state.lastRenderedTime = timestamp;
      postResponse({
        type: 'TIME_UPDATE',
        payload: { currentTimeUs: state.lastRenderedTime },
      });
    } else {
      // No renderer - must close frame ourselves
      frame.close();
    }
    return;
  }

  // During playback, add frame to queue for synchronized rendering
  if (state.isPlaying) {
    // Skip frames before the playback start position (these are just for decoder priming)
    if (timestamp < state.playbackMinTimestamp) {
      frame.close();
      return;
    }
    // Add to queue (sorted by timestamp)
    state.frameQueue.push({ frame, timestamp });
    return;
  }

  // Not playing and not seeking - render immediately (e.g., initial frame)
  if (state.renderer) {
    queueFirstFrameCapture(frame);
    // state.renderer.draw() takes ownership of frame and will close it
    state.renderer.draw(frame);
    state.lastRenderedTime = timestamp;
    postResponse({
      type: 'TIME_UPDATE',
      payload: { currentTimeUs: state.lastRenderedTime },
    });
  } else {
    // No renderer - must close frame ourselves
    frame.close();
  }
}

function queueFirstFrameCapture(frame: VideoFrame): void {
  if (state.hasCapturedFirstFrame) return;

  try {
    const clone = frame.clone();
    state.hasCapturedFirstFrame = true;
    void captureFirstFrame(clone);
  } catch (e) {
    state.hasCapturedFirstFrame = true;
    logger.warn('Failed to clone frame for thumbnail capture:', e);
  }
}

async function captureFirstFrame(frame: VideoFrame): Promise<void> {
  try {
    const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      frame.close();
      return;
    }
    ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    frame.close();
    if (blob) {
      postResponse({ type: 'FIRST_FRAME', payload: { blob, width: canvas.width, height: canvas.height } });
    }
  } catch (e) {
    logger.warn('Failed to capture first frame thumbnail:', e);
    frame.close();
  }
}

function hasPlayableKeyframe(): boolean {
  const firstKeyIndex = state.keyframeIndices[0];
  return typeof firstKeyIndex === 'number' && !!state.samples[firstKeyIndex]?.is_sync;
}

function initializeDemuxer(durationHint?: number): void {
  resetWorkerState();
  state.state = 'loading';

  state.mp4File = createFile();
  state.decoder = new VideoDecoder({
    output: handleDecodedFrame,
    error: (e) => {
      logger.warn('Decoder error (recoverable):', e);

      // CRITICAL: Clear broken decoder reference - don't try to reset a closed codec
      // Calling reset() on a closed decoder throws "Cannot call 'reset' on a closed codec"
      state.decoder = null;

      // Recreate fresh decoder via ensureDecoderConfigured
      if (!ensureDecoderConfigured()) {
        logger.error('Failed to recreate decoder after error');
        state.isPlaying = false;
        state.pendingAutoPlay = false;
        postResponse({ type: 'PLAYBACK_STATE', payload: { isPlaying: false } });
        return;
      }

      // Only restart playback if we have valid keyframes to decode from
      if ((state.isPlaying || state.pendingAutoPlay) && hasPlayableKeyframe()) {
        void startPlayback();
      }
    },
  });

  state.mp4File.onReady = (info: MP4Info) => {
    state.videoTrackInfo = info.videoTracks[0] ?? null;
    if (!state.videoTrackInfo) {
      postResponse({ type: 'ERROR', payload: { message: 'No video track found' } });
      return;
    }

    const description = getCodecDescription(state.mp4File!, state.videoTrackInfo.id);
    state.codecDescription = description;

    state.decoder?.configure({
      codec: state.videoTrackInfo.codec,
      codedWidth: state.videoTrackInfo.video.width,
      codedHeight: state.videoTrackInfo.video.height,
      description: description ?? undefined,
    });

    state.mp4File?.setExtractionOptions(state.videoTrackInfo.id, null, { nbSamples: Infinity });
    state.mp4File?.start();

    let durationSeconds: number;
    if (durationHint !== undefined && durationHint > 0) {
      durationSeconds = durationHint;
      logger.log('Using duration hint:', durationSeconds, 'seconds');
    } else if (info.duration > 0 && info.timescale > 0) {
      durationSeconds = info.duration / info.timescale;
    } else if (state.videoTrackInfo.duration > 0 && state.videoTrackInfo.timescale > 0) {
      durationSeconds = state.videoTrackInfo.duration / state.videoTrackInfo.timescale;
    } else {
      durationSeconds = state.videoTrackInfo.nb_samples / 30;
    }

    state.trimOutPoint = durationSeconds * MICROSECONDS_PER_SECOND;
    state.state = 'ready';
    ensureDecoderConfigured();

    postResponse({
      type: 'READY',
      payload: {
        duration: durationSeconds,
        width: state.videoTrackInfo.video.width,
        height: state.videoTrackInfo.video.height,
      },
    });
  };

  state.mp4File.onSamples = (_id: number, _user: unknown, newSamples: MP4Sample[]) => {
    const wasEmpty = state.samples.length === 0;
    for (const sample of newSamples) {
      const sampleIndex = state.samples.length;
      state.samples.push(sample);
      if (sample.is_sync) {
        state.keyframeIndices.push(sampleIndex);
      }
    }
    if (wasEmpty && state.samples.length > 0 && state.needsInitialSeek) {
      state.needsInitialSeek = false;
      void seekTo(0);
    }
    if (state.pendingAutoPlay && !state.isPlaying && state.decoder?.state === 'configured' && hasPlayableKeyframe()) {
      void startPlayback();
    }
  };

  state.mp4File.onError = (e: Error) => {
    postResponse({ type: 'ERROR', payload: { message: e.message } });
  };

  state.needsInitialSeek = true;
}

function appendStreamChunk(chunk: ArrayBuffer, isLast = false): void {
  if (!state.mp4File) {
    logger.warn('appendStreamChunk called before stream initialized');
    return;
  }
  const mp4Chunk = chunk as ArrayBuffer & { fileStart: number };
  mp4Chunk.fileStart = state.streamOffset;
  state.streamOffset += mp4Chunk.byteLength;

  state.mp4File.appendBuffer(mp4Chunk);
  // Flush to make appended data immediately parsable for progressive playback
  state.mp4File.flush();

  if (isLast) {
    // Final flush is already covered above but keep explicit for clarity
    state.mp4File.flush();
  }
}

async function loadFile(file: File): Promise<void> {
  initializeDemuxer();
  try {
    const reader = file.stream().getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      appendStreamChunk(buffer, false);
    }
    if (state.mp4File) {
      state.mp4File.flush();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown file load error';
    logger.error('File streaming error:', e);
    postResponse({ type: 'ERROR', payload: { message } });
  }
}

/**
 * Load video from an ArrayBuffer (used for HLS transmuxed content)
 * @param buffer The video data as ArrayBuffer
 * @param durationHint Optional duration override (used for HLS where mp4box duration may be incorrect)
 */
async function loadBuffer(buffer: ArrayBuffer, durationHint?: number): Promise<void> {
  initializeDemuxer(durationHint);
  appendStreamChunk(buffer, true);
}

function startStream(durationHint?: number): void {
  initializeDemuxer(durationHint);
}

// ============================================================================
// MULTI-SOURCE LOADING
// ============================================================================

/**
 * Load a new video source into the multi-source Map.
 * Each source maintains independent demuxer, decoder, and frame queue.
 */
async function loadSource(sourceId: string, file?: File, buffer?: ArrayBuffer): Promise<void> {
  // Remove existing source if present
  if (state.sources.has(sourceId)) {
    removeSource(sourceId);
  }

  const source = createPerSourceState(sourceId);
  state.sources.set(sourceId, source);

  logger.log(`Loading source: ${sourceId}`);

  try {
    // Initialize MP4 demuxer for this source
    source.mp4File = createFile();

    // Track audio info for later extraction
    let audioTrackInfo: { sampleRate: number; channels: number } | null = null;

    source.mp4File.onReady = (info: MP4Info) => {
      const videoTrack = info.tracks.find(
        (t): t is MP4VideoTrack => t.type === 'video'
      );

      if (!videoTrack) {
        logger.error(`No video track found in source: ${sourceId}`);
        postResponse({ type: 'ERROR', payload: { message: `No video track in source: ${sourceId}` } });
        return;
      }

      source.videoTrackInfo = videoTrack;
      source.durationUs = (info.duration / info.timescale) * MICROSECONDS_PER_SECOND;
      source.width = videoTrack.video.width;
      source.height = videoTrack.video.height;

      // Check for audio track
      const audioTrack = info.tracks.find(t => t.type === 'audio');
      if (audioTrack && 'audio' in audioTrack) {
        const audio = audioTrack.audio as { sample_rate: number; channel_count: number };
        audioTrackInfo = {
          sampleRate: audio.sample_rate,
          channels: audio.channel_count,
        };
        logger.log(`Source ${sourceId} has audio track:`, audioTrackInfo);
      }

      // Extract codec description using proper AVCC/HVCC serialization
      if (source.mp4File) {
        source.codecDescription = getCodecDescription(source.mp4File, videoTrack.id);
      }

      // Configure decoder for this source
      initializeSourceDecoder(source);

      // Extract samples
      source.mp4File?.setExtractionOptions(videoTrack.id, null, {
        nbSamples: Infinity,
      });

      source.mp4File?.start();
    };

    source.mp4File.onSamples = (
      _trackId: number,
      _user: unknown,
      samples: MP4Sample[]
    ) => {
      for (const sample of samples) {
        source.samples.push(sample);
        if (sample.is_sync) {
          source.keyframeIndices.push(source.samples.length - 1);
        }
      }
    };

    source.mp4File.onError = (e: string) => {
      logger.error(`MP4 error for source ${sourceId}:`, e);
      postResponse({ type: 'ERROR', payload: { message: `Source ${sourceId}: ${e}` } });
    };

    // Load from file or buffer
    if (file) {
      const reader = file.stream().getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        const chunkBuffer = value.buffer.slice(
          value.byteOffset,
          value.byteOffset + value.byteLength
        ) as ArrayBuffer & { fileStart?: number };
        chunkBuffer.fileStart = source.streamOffset;
        source.streamOffset += chunkBuffer.byteLength;
        source.mp4File?.appendBuffer(chunkBuffer);
      }
      source.mp4File?.flush();
    } else if (buffer) {
      const bufferWithStart = buffer as ArrayBuffer & { fileStart?: number };
      bufferWithStart.fileStart = 0;
      source.mp4File?.appendBuffer(bufferWithStart);
      source.mp4File?.flush();
    }

    source.isReady = true;

    // Post SOURCE_READY response
    postResponse({
      type: 'SOURCE_READY',
      payload: {
        sourceId,
        duration: source.durationUs / MICROSECONDS_PER_SECOND,
        width: source.width,
        height: source.height,
      },
    });

    // Render first frame for immediate visual feedback
    // Small delay to ensure samples are extracted
    setTimeout(() => {
      if (source.samples.length > 0) {
        void renderSourceFirstFrame(source);
      }
    }, 100);

    // Send audio data if source has audio track
    // AudioContext can decode audio directly from MP4 containers
    if (audioTrackInfo && buffer) {
      // Send a copy of the buffer for audio decoding
      const audioBuffer = buffer.slice(0);
      postResponse({
        type: 'AUDIO_DATA',
        payload: {
          sourceId,
          audioData: audioBuffer,
          sampleRate: audioTrackInfo.sampleRate,
          channels: audioTrackInfo.channels,
          durationUs: source.durationUs,
        },
      });
      logger.log(`Audio data sent for source: ${sourceId}`);
    }

    logger.log(`Source loaded: ${sourceId}`, {
      duration: source.durationUs,
      samples: source.samples.length,
      keyframes: source.keyframeIndices.length,
      hasAudio: !!audioTrackInfo,
    });

  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown source load error';
    logger.error(`Failed to load source ${sourceId}:`, e);
    postResponse({ type: 'ERROR', payload: { message: `Source ${sourceId}: ${message}` } });
  }
}

// ============================================================================
// STREAMING SOURCE LOADING (Progressive HLS)
// ============================================================================

// Threshold for emitting SOURCE_PLAYABLE - after this many samples, playback can begin
const PLAYABLE_SAMPLE_THRESHOLD = 45; // ~1.5 seconds at 30fps for faster preview start

/**
 * Initialize a source for streaming data.
 * Called before chunks start arriving.
 */
function startSourceStream(sourceId: string, durationHint?: number): void {
  // Remove existing source if present
  if (state.sources.has(sourceId)) {
    removeSource(sourceId);
  }

  const source = createPerSourceState(sourceId);
  state.sources.set(sourceId, source);

  // Store duration hint if provided
  if (durationHint !== undefined && durationHint > 0) {
    source.durationUs = durationHint * MICROSECONDS_PER_SECOND;
  }

  logger.log(`startSourceStream: Initialized source ${sourceId} for streaming`);

  // Initialize MP4 demuxer
  source.mp4File = createFile();

  source.mp4File.onReady = (info: MP4Info) => {
    const videoTrack = info.tracks.find(
      (t): t is MP4VideoTrack => t.type === 'video'
    );

    if (!videoTrack) {
      logger.error(`No video track found in streaming source: ${sourceId}`);
      return;
    }

    source.videoTrackInfo = videoTrack;
    source.width = videoTrack.video.width;
    source.height = videoTrack.video.height;

    // Use duration hint if available, otherwise calculate from track info
    if (source.durationUs === 0 && info.duration > 0 && info.timescale > 0) {
      source.durationUs = (info.duration / info.timescale) * MICROSECONDS_PER_SECOND;
    }

    // Extract codec description using proper AVCC/HVCC serialization
    if (source.mp4File) {
      source.codecDescription = getCodecDescription(source.mp4File, videoTrack.id);
    }

    // Configure decoder
    initializeSourceDecoder(source);

    // Extract samples
    source.mp4File?.setExtractionOptions(videoTrack.id, null, {
      nbSamples: Infinity,
    });

    source.mp4File?.start();

    logger.log(`startSourceStream: Source ${sourceId} mp4 ready`, {
      width: source.width,
      height: source.height,
      durationUs: source.durationUs,
    });
  };

  source.mp4File.onSamples = (
    _trackId: number,
    _user: unknown,
    samples: MP4Sample[]
  ) => {
    const wasUnderThreshold = source.samples.length < PLAYABLE_SAMPLE_THRESHOLD;

    for (const sample of samples) {
      source.samples.push(sample);
      if (sample.is_sync) {
        source.keyframeIndices.push(source.samples.length - 1);
      }
    }

    // Check if we just crossed the playable threshold
    const isNowPlayable = source.samples.length >= PLAYABLE_SAMPLE_THRESHOLD;
    if (wasUnderThreshold && isNowPlayable && !source.isReady) {
      logger.log(`startSourceStream: Source ${sourceId} now playable with ${source.samples.length} samples`);

      // Post SOURCE_PLAYABLE - source can start playback but may still be loading
      postResponse({
        type: 'SOURCE_PLAYABLE',
        payload: {
          sourceId,
          duration: source.durationUs / MICROSECONDS_PER_SECOND,
          width: source.width,
          height: source.height,
          loadedSamples: source.samples.length,
        },
      });

      // Render first frame
      setTimeout(() => {
        if (source.samples.length > 0 && source.decoder?.state === 'configured') {
          void renderSourceFirstFrame(source);
        }
      }, 100);
    }
  };

  source.mp4File.onError = (e: string) => {
    logger.error(`MP4 streaming error for source ${sourceId}:`, e);
  };
}

/**
 * Append a chunk of streaming data to a source.
 */
function appendSourceChunk(sourceId: string, chunk: ArrayBuffer, isLast = false): void {
  const source = state.sources.get(sourceId);
  if (!source || !source.mp4File) {
    logger.warn(`appendSourceChunk: Source ${sourceId} not found or not initialized`);
    return;
  }

  // Append chunk to mp4box
  const mp4Chunk = chunk as ArrayBuffer & { fileStart: number };
  mp4Chunk.fileStart = source.streamOffset;
  source.streamOffset += chunk.byteLength;

  source.mp4File.appendBuffer(mp4Chunk);
  source.mp4File.flush();

  // Check if we should resume playback after buffering
  if (state.pendingAutoPlay && !state.isPlaying && state.activeClips.length > 0) {
    // Check if all sources now have enough data
    let canResume = true;
    const bufferThresholdUs = 1_000_000; // 1 second buffer needed to resume

    for (const clip of state.activeClips) {
      const clipSource = state.sources.get(clip.sourceId);
      if (!clipSource) continue;

      const sourceTimeUs = state.lastRenderedTime - clip.startTimeUs + clip.sourceStartUs;
      const maxPlayableUs = getSourceMaxPlayableTimeUs(clipSource);

      if (sourceTimeUs + bufferThresholdUs >= maxPlayableUs && !clipSource.isReady) {
        canResume = false;
        break;
      }
    }

    if (canResume) {
      logger.log('appendSourceChunk: Resuming playback after buffering');
      void startPlayback();
    }
  }

  if (isLast) {
    source.isReady = true;
    source.mp4File.flush();

    logger.log(`appendSourceChunk: Source ${sourceId} streaming complete`, {
      samples: source.samples.length,
      keyframes: source.keyframeIndices.length,
    });

    // Post SOURCE_READY when fully loaded
    postResponse({
      type: 'SOURCE_READY',
      payload: {
        sourceId,
        duration: source.durationUs / MICROSECONDS_PER_SECOND,
        width: source.width,
        height: source.height,
      },
    });

    // Try to resume if we were waiting for data
    if (state.pendingAutoPlay && !state.isPlaying) {
      logger.log('appendSourceChunk: Source fully loaded, resuming playback');
      void startPlayback();
    }
  }
}

/**
 * Initialize video decoder for a specific source
 */
function initializeSourceDecoder(source: PerSourceState): void {
  if (!source.videoTrackInfo) return;

  const track = source.videoTrackInfo;

  // Validate codec description for H.264/H.265 content
  const isAvcOrHevc = track.codec.startsWith('avc') || track.codec.startsWith('hvc');
  if (isAvcOrHevc && !source.codecDescription) {
    logger.warn(`Missing codec description for ${track.codec} in source ${source.sourceId}`);
  }

  const config: VideoDecoderConfig = {
    codec: track.codec,
    codedWidth: track.video.width,
    codedHeight: track.video.height,
    ...(source.codecDescription && { description: source.codecDescription }),
  };

  source.decoder = new VideoDecoder({
    output: (frame: VideoFrame) => {
      handleSourceFrame(source, frame);
    },
    error: (e) => {
      logger.warn(`Decoder error for source ${source.sourceId}:`, e);
      source.decoder = null;
      // Attempt to recreate decoder
      initializeSourceDecoder(source);
    },
  });

  source.decoder.configure(config);
  logger.log(`Decoder configured for source: ${source.sourceId}`);
}

/**
 * Handle decoded frame from a specific source
 */
function handleSourceFrame(source: PerSourceState, frame: VideoFrame): void {
  const timestamp = frame.timestamp ?? 0;

  // Add to source's frame queue for compositing
  source.frameQueue.push({ frame, timestamp });

  // Limit queue size to prevent memory issues
  while (source.frameQueue.length > MAX_QUEUE_SIZE * 2) {
    const oldest = source.frameQueue.shift();
    oldest?.frame.close();
  }
}

/**
 * Remove a source from the multi-source Map
 */
function removeSource(sourceId: string): void {
  const source = state.sources.get(sourceId);
  if (!source) return;

  logger.log(`Removing source: ${sourceId}`);
  disposePerSourceState(source);
  state.sources.delete(sourceId);

  // Clear from active clips
  state.activeClips = state.activeClips.filter(c => c.sourceId !== sourceId);

  // Clear primary if it was this source
  if (state.primarySourceId === sourceId) {
    state.primarySourceId = null;
  }

  postResponse({ type: 'SOURCE_REMOVED', payload: { sourceId } });
}

/**
 * Get frame from a specific source at a given timestamp
 */
function getSourceFrameAtTime(source: PerSourceState, timeUs: number): VideoFrame | null {
  if (source.frameQueue.length === 0) return null;

  // Find best frame at or before the requested time
  let bestIndex = -1;
  for (let i = 0; i < source.frameQueue.length; i++) {
    const frame = source.frameQueue[i];
    if (frame.timestamp <= timeUs) {
      bestIndex = i;
    } else {
      break;
    }
  }

  if (bestIndex === -1) return null;

  // Don't remove from queue - compositor may need it multiple times
  return source.frameQueue[bestIndex].frame;
}

// ============================================================================
// MULTI-SOURCE COMPOSITING
// ============================================================================

/**
 * Get all clips that are active at the given timeline time
 */
function getActiveClipsAtTime(timelineTimeUs: number): ActiveClip[] {
  return state.activeClips.filter(clip => {
    const clipEnd = clip.startTimeUs + (clip.sourceEndUs - clip.sourceStartUs);
    return timelineTimeUs >= clip.startTimeUs && timelineTimeUs < clipEnd;
  });
}

/**
 * Get frame from a source for a given clip at timeline time
 */
function getClipFrameAtTime(clip: ActiveClip, timelineTimeUs: number): VideoFrame | null {
  const source = state.sources.get(clip.sourceId);
  if (!source || !source.isReady) return null;

  // Convert timeline time to source time
  const sourceTimeUs = timelineTimeUs - clip.startTimeUs + clip.sourceStartUs;
  return getSourceFrameAtTime(source, sourceTimeUs);
}

/**
 * Composite all active clips at the given timeline time.
 * Returns true if a frame was rendered, false otherwise.
 */
function compositeActiveClips(timelineTimeUs: number): boolean {
  const activeClips = getActiveClipsAtTime(timelineTimeUs);

  if (activeClips.length === 0) {
    return false;
  }

  // Sort by trackIndex (lowest = bottom layer)
  activeClips.sort((a, b) => a.trackIndex - b.trackIndex);

  // Collect frames from all active clips
  const layers: { frame: VideoFrame; clip: ActiveClip }[] = [];

  for (const clip of activeClips) {
    const frame = getClipFrameAtTime(clip, timelineTimeUs);
    if (frame) {
      layers.push({ frame, clip });
    }
  }

  if (layers.length === 0) {
    return false;
  }

  // Use compositor if available and we have multiple layers
  if (state.compositor && layers.length > 1) {
    state.compositor.composite(layers);
    return true;
  }

  // Single layer or no compositor - use renderer directly
  if (state.renderer && layers.length > 0) {
    // For single layer, just draw the first frame
    // Note: We don't close the frame here as it's still in the source's queue
    state.renderer.draw(layers[0].frame);
    return true;
  }

  return false;
}

/**
 * Feed decoders for all active sources to ensure frames are available
 */
function feedActiveSourceDecoders(timelineTimeUs: number): void {
  const activeClips = getActiveClipsAtTime(timelineTimeUs);

  for (const clip of activeClips) {
    const source = state.sources.get(clip.sourceId);
    if (!source || !source.isReady || !source.decoder) continue;
    if (source.decoder.state !== 'configured') continue;

    // Calculate source time
    const sourceTimeUs = timelineTimeUs - clip.startTimeUs + clip.sourceStartUs;

    // Check if we need to decode more frames for this source
    const inFlightCount = source.decoder.decodeQueueSize + source.frameQueue.length;
    if (inFlightCount < MAX_QUEUE_SIZE && source.lastQueuedSampleIndex + 1 < source.samples.length) {
      // Find the sample index for the current time
      const sourceTimeSec = sourceTimeUs / MICROSECONDS_PER_SECOND;
      let targetSampleIndex = source.samples.findIndex(sample => {
        const sampleTime = sample.cts / sample.timescale;
        return sampleTime >= sourceTimeSec;
      });

      if (targetSampleIndex === -1) {
        targetSampleIndex = source.samples.length - 1;
      }

      // Decode frames ahead of the current position
      if (source.lastQueuedSampleIndex < targetSampleIndex + MAX_QUEUE_SIZE) {
        source.lastQueuedSampleIndex++;
        decodeSourceFrame(source, source.lastQueuedSampleIndex);
      }
    }
  }
}

/**
 * Decode a specific frame from a source
 */
function decodeSourceFrame(source: PerSourceState, sampleIndex: number): void {
  if (!source.decoder || source.decoder.state !== 'configured') return;
  if (sampleIndex < 0 || sampleIndex >= source.samples.length) return;

  const sample = source.samples[sampleIndex];
  const chunk = new EncodedVideoChunk({
    type: sample.is_sync ? 'key' : 'delta',
    timestamp: (sample.cts / sample.timescale) * MICROSECONDS_PER_SECOND,
    duration: (sample.duration / sample.timescale) * MICROSECONDS_PER_SECOND,
    data: sample.data,
  });

  source.decoder.decode(chunk);
}

/**
 * Multi-source playback loop.
 * Composites frames from multiple sources based on activeClips.
 * Handles streaming sources - pauses when approaching unloaded data.
 */
function multiSourcePlaybackLoop(): void {
  if (!state.isPlaying) {
    return;
  }

  // Initialize wall clock sync if needed
  if (state.needsWallClockSync) {
    state.playbackStartWallTime = performance.now();
    state.playbackStartTime = state.trimInPoint;
    state.needsWallClockSync = false;
  }

  // Calculate target timeline time based on wall clock
  const elapsed = performance.now() - state.playbackStartWallTime;
  const targetUs = state.playbackStartTime + elapsed * 1000; // elapsed is ms, convert to us

  // Check if we've reached the trim out point
  if (targetUs >= state.trimOutPoint) {
    void pausePlayback();
    return;
  }

  // Check if we're approaching unloaded data in any active clip
  const bufferThresholdUs = 500_000; // 500ms buffer before end of loaded data
  let needsBuffering = false;

  for (const clip of state.activeClips) {
    const source = state.sources.get(clip.sourceId);
    if (!source || source.isReady) continue; // Skip fully loaded sources

    // Convert timeline time to source time
    const sourceTimeUs = targetUs - clip.startTimeUs + clip.sourceStartUs;
    const maxPlayableUs = getSourceMaxPlayableTimeUs(source);

    if (sourceTimeUs + bufferThresholdUs >= maxPlayableUs) {
      needsBuffering = true;
      logger.log(`multiSourcePlaybackLoop: Buffering needed for ${clip.sourceId}, sourceTime=${sourceTimeUs}, maxPlayable=${maxPlayableUs}`);
      break;
    }
  }

  if (needsBuffering) {
    // Pause playback and wait for more data
    state.isPlaying = false;
    state.pendingAutoPlay = true; // Will resume when more data arrives
    postResponse({ type: 'PLAYBACK_STATE', payload: { isPlaying: false } });
    logger.log('multiSourcePlaybackLoop: Paused for buffering');
    return;
  }

  // Feed decoders for all active sources
  feedActiveSourceDecoders(targetUs);

  // Composite and render active clips at current time
  const rendered = compositeActiveClips(targetUs);

  if (rendered) {
    state.lastRenderedTime = targetUs;
    postResponse({
      type: 'TIME_UPDATE',
      payload: { currentTimeUs: targetUs },
    });
  }

  // Continue playback loop
  if (state.isPlaying) {
    requestAnimationFrame(playbackLoop);
  }
}

/**
 * Start playback in multi-source mode.
 * Primes all active source decoders and initiates the playback loop.
 */
async function startMultiSourcePlayback(): Promise<void> {
  if (state.startPlaybackInProgress || state.isPlaying) return;

  // Check if we have any ready sources
  const readySources = state.activeClips.filter(clip => {
    const source = state.sources.get(clip.sourceId);
    return source?.isReady && source.decoder?.state === 'configured';
  });

  if (readySources.length === 0) {
    logger.log('startMultiSourcePlayback: No ready sources, deferring');
    state.pendingAutoPlay = true;
    return;
  }

  state.startPlaybackInProgress = true;
  state.pendingAutoPlay = false;

  try {
    // Determine start time - use last rendered time or beginning
    let startTimeUs = state.lastRenderedTime;
    const nearEnd = startTimeUs >= state.trimOutPoint - 100000; // 100ms tolerance
    const beforeStart = startTimeUs < state.trimInPoint;

    if (beforeStart || nearEnd) {
      startTimeUs = state.trimInPoint;
    }

    logger.log('startMultiSourcePlayback: Starting from', startTimeUs);

    // Prime each active source's decoder
    for (const clip of state.activeClips) {
      const source = state.sources.get(clip.sourceId);
      if (!source?.isReady || !source.decoder) {
        logger.log(`Skipping source ${clip.sourceId}: not ready`);
        continue;
      }

      if (source.decoder.state !== 'configured') {
        logger.log(`Skipping source ${clip.sourceId}: decoder not configured`);
        continue;
      }

      // Calculate source time from timeline time
      const sourceTimeUs = startTimeUs - clip.startTimeUs + clip.sourceStartUs;

      // Seek source to its start position and pre-decode frames
      await seekSourceTo(source, sourceTimeUs);
      primeSourceDecoder(source, sourceTimeUs);
    }

    state.isPlaying = true;
    state.needsWallClockSync = true;
    state.playbackStartTime = startTimeUs;

    postResponse({ type: 'PLAYBACK_STATE', payload: { isPlaying: true } });
    requestAnimationFrame(playbackLoop);

    logger.log('startMultiSourcePlayback: Playback started');
  } catch (e) {
    logger.error('startMultiSourcePlayback error:', e);
    state.isPlaying = false;
    postResponse({ type: 'PLAYBACK_STATE', payload: { isPlaying: false } });
  } finally {
    state.startPlaybackInProgress = false;
  }
}

/**
 * Seek a specific source to a target time.
 * Similar to global seekTo but operates on PerSourceState.
 * Supports seeking in partially loaded sources - will clamp to available data.
 */
async function seekSourceTo(source: PerSourceState, targetUs: number): Promise<void> {
  if (!source.decoder || source.decoder.state !== 'configured') return;
  if (source.samples.length === 0 || source.keyframeIndices.length === 0) return;

  // Flush decoder to clear pending frames
  await source.decoder.flush();

  // Clear source frame queue
  for (const { frame } of source.frameQueue) {
    frame.close();
  }
  source.frameQueue.length = 0;

  // Find sample index at target time
  const targetSeconds = targetUs / MICROSECONDS_PER_SECOND;
  let sampleIndex = source.samples.findIndex(sample => {
    const sampleTime = sample.cts / sample.timescale;
    return sampleTime >= targetSeconds;
  });

  // Handle seeking beyond loaded data
  if (sampleIndex === -1) {
    // Target is beyond loaded samples - clamp to last available
    sampleIndex = source.samples.length - 1;
    logger.log(`seekSourceTo: Target ${targetUs}us beyond loaded data, clamping to sample ${sampleIndex}`);
  }

  // Find previous keyframe using binary search
  const keyframeIndex = findPreviousKeyframeForSource(source, sampleIndex);

  if (!source.samples[keyframeIndex]?.is_sync) {
    logger.warn(`seekSourceTo: No valid keyframe for source ${source.sourceId}`);
    return;
  }

  // Decode frames from keyframe to target
  for (let i = keyframeIndex; i <= sampleIndex; i++) {
    const sample = source.samples[i];
    if (!sample) continue;

    const chunk = new EncodedVideoChunk({
      type: sample.is_sync ? 'key' : 'delta',
      timestamp: (sample.cts / sample.timescale) * MICROSECONDS_PER_SECOND,
      duration: (sample.duration / sample.timescale) * MICROSECONDS_PER_SECOND,
      data: sample.data,
    });

    source.decoder.decode(chunk);
  }

  // Update last queued sample index
  source.lastQueuedSampleIndex = sampleIndex;

  logger.log(`seekSourceTo: Source ${source.sourceId} seeked to ${targetUs}us (sample ${sampleIndex}/${source.samples.length})`);
}

/**
 * Get the maximum time in microseconds that a source can currently play to.
 * For streaming sources, this is based on loaded samples.
 */
function getSourceMaxPlayableTimeUs(source: PerSourceState): number {
  if (source.samples.length === 0) return 0;

  // If fully loaded, return duration
  if (source.isReady) {
    return source.durationUs;
  }

  // For streaming, use the timestamp of the last loaded sample
  if (source.samples.length === 0) return 0;
  const lastSample = source.samples[source.samples.length - 1];
  if (!lastSample) return 0;

  return (lastSample.cts / lastSample.timescale) * MICROSECONDS_PER_SECOND;
}

/**
 * Pre-decode frames ahead of the current position for a source.
 */
function primeSourceDecoder(source: PerSourceState, _startTimeUs: number): void {
  if (!source.decoder || source.decoder.state !== 'configured') return;

  const startIndex = source.lastQueuedSampleIndex + 1;
  const endIndex = Math.min(startIndex + MAX_QUEUE_SIZE - 1, source.samples.length - 1);

  for (let i = startIndex; i <= endIndex; i++) {
    decodeSourceFrame(source, i);
  }

  source.lastQueuedSampleIndex = endIndex;
  logger.log(`primeSourceDecoder: Source ${source.sourceId} primed ${endIndex - startIndex + 1} frames`);
}

/**
 * Find previous keyframe for a specific source using binary search.
 */
function findPreviousKeyframeForSource(source: PerSourceState, targetSampleIndex: number): number {
  if (source.keyframeIndices.length === 0) {
    return 0;
  }

  // Binary search for the largest keyframe index <= targetSampleIndex
  let low = 0;
  let high = source.keyframeIndices.length - 1;
  let result = source.keyframeIndices[0] ?? 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const keyframeIdx = source.keyframeIndices[mid];

    if (keyframeIdx === undefined) break;

    if (keyframeIdx <= targetSampleIndex) {
      result = keyframeIdx;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

/**
 * Render the first frame of a source and capture it as thumbnail.
 * Called when a source becomes ready to provide immediate visual feedback.
 */
async function renderSourceFirstFrame(source: PerSourceState): Promise<void> {
  if (!source.decoder || source.decoder.state !== 'configured') return;
  if (source.samples.length === 0 || source.keyframeIndices.length === 0) return;
  if (!state.renderer) return;

  logger.log(`renderSourceFirstFrame: Rendering first frame for ${source.sourceId}`);

  try {
    // Seek to frame 0 (first keyframe)
    await seekSourceTo(source, 0);

    // Wait a bit for the decoder to produce the frame
    await new Promise(resolve => setTimeout(resolve, 50));

    // Get the first available frame from the queue
    if (source.frameQueue.length > 0) {
      const firstFrame = source.frameQueue[0];
      if (!firstFrame) return;
      const { frame, timestamp } = firstFrame;

      // Render the frame
      state.renderer.draw(frame);
      state.lastRenderedTime = timestamp;

      // Capture as thumbnail (clone first since draw consumed the frame)
      // Note: frame is already consumed by draw, so we skip thumbnail capture here
      // The frame will be captured during playback via queueFirstFrameCapture

      postResponse({
        type: 'TIME_UPDATE',
        payload: { currentTimeUs: timestamp },
      });

      logger.log(`renderSourceFirstFrame: First frame rendered for ${source.sourceId}`);
    }
  } catch (e) {
    logger.warn(`renderSourceFirstFrame error for ${source.sourceId}:`, e);
  }
}

/**
 * Render first frame for multi-source with first frame capture.
 * Uses the compositor if available, otherwise renders directly.
 */
async function renderMultiSourceFirstFrame(): Promise<void> {
  if (state.activeClips.length === 0) return;
  if (!state.renderer) return;

  // Get the first clip's source
  const firstClip = state.activeClips[0];
  if (!firstClip) return;

  const source = state.sources.get(firstClip.sourceId);
  if (!source?.isReady || !source.decoder) return;

  logger.log('renderMultiSourceFirstFrame: Rendering first frame');

  try {
    // Seek to start of first clip
    const sourceTimeUs = firstClip.sourceStartUs;
    await seekSourceTo(source, sourceTimeUs);

    // Wait for decoder to produce frames
    await new Promise(resolve => setTimeout(resolve, 100));

    // Try to composite
    const rendered = compositeActiveClips(firstClip.startTimeUs);

    if (rendered) {
      state.lastRenderedTime = firstClip.startTimeUs;

      // Capture first frame for thumbnail
      const firstQueuedFrame = source.frameQueue[0];
      if (firstQueuedFrame && !state.hasCapturedFirstFrame) {
        try {
          const clone = firstQueuedFrame.frame.clone();
          state.hasCapturedFirstFrame = true;
          void captureFirstFrame(clone);
        } catch (e) {
          logger.warn('Failed to clone frame for thumbnail:', e);
        }
      }

      postResponse({
        type: 'TIME_UPDATE',
        payload: { currentTimeUs: firstClip.startTimeUs },
      });

      logger.log('renderMultiSourceFirstFrame: First frame rendered successfully');
    }
  } catch (e) {
    logger.warn('renderMultiSourceFirstFrame error:', e);
  }
}

async function seekTo(timeUs: number): Promise<void> {
  if (!state.decoder || state.samples.length === 0) return;
  if (state.decoder.state !== 'configured') return;

  if (state.seekInProgress) {
    state.pendingSeekTime = timeUs;
    return;
  }

  state.seekInProgress = true;

  try {
    await performSeek(timeUs);
  } finally {
    state.seekInProgress = false;

    if (state.pendingSeekTime !== null) {
      const nextSeek = state.pendingSeekTime;
      state.pendingSeekTime = null;
      void seekTo(nextSeek);
    }
  }
}

async function performSeek(timeUs: number): Promise<void> {
  if (!state.decoder || state.decoder.state !== 'configured') return;
  if (!hasPlayableKeyframe()) {
    // Wait for keyframes to arrive
    state.pendingAutoPlay = true;
    return;
  }

  state.seekVersion++;
  const thisSeekVersion = state.seekVersion;

  // Clamp to trim bounds
  const targetUs = Math.max(state.trimInPoint, Math.min(timeUs, state.trimOutPoint));
  const targetSeconds = targetUs / MICROSECONDS_PER_SECOND;

  // Find sample index at or after target time
  let sampleIndex = state.samples.findIndex((sample) => {
    const sampleTime = sample.cts / sample.timescale;
    return sampleTime >= targetSeconds;
  });

  if (sampleIndex === -1) {
    sampleIndex = state.samples.length - 1;
  }

  // Find previous keyframe using O(log n) binary search
  const keyframeIndex = findPreviousKeyframe(sampleIndex);

  // CRITICAL: Validate keyframe before flushing decoder
  // WebCodecs requires first frame after flush() to be a key frame
  if (!state.samples[keyframeIndex]?.is_sync) {
    logger.warn('performSeek: Keyframe validation failed', {
      keyframeIndex,
      sampleIndex,
      is_sync: state.samples[keyframeIndex]?.is_sync,
    });
    state.isSeeking = false;
    return;
  }

  // Flush decoder to clear any pending frames
  // Guard against decoder becoming invalid during async operations
  if (!state.decoder || state.decoder.state !== 'configured') {
    state.isSeeking = false;
    return;
  }
  await state.decoder.flush();

  // Clear frame queue
  for (const { frame } of state.frameQueue) {
    frame.close();
  }
  state.frameQueue.length = 0;

  state.isSeeking = true;
  state.currentSeekVersion = thisSeekVersion;
  state.seekTargetFrameCount = sampleIndex - keyframeIndex + 1;
  state.seekCurrentFrameCount = 0;

  // Reset the queued sample index for playback
  state.lastQueuedSampleIndex = sampleIndex;

  // Decode frames from keyframe to target
  try {
    for (let i = keyframeIndex; i <= sampleIndex; i++) {
      if (state.decoder.state !== 'configured') break;
      const sample = state.samples[i];
      if (!sample) continue;

      // Determine chunk type - first frame MUST be key after flush
      const isFirstChunk = i === keyframeIndex;
      const chunkType = sample.is_sync ? 'key' : 'delta';

      // Double-check first chunk is a key frame (defensive)
      if (isFirstChunk && chunkType !== 'key') {
        logger.warn('performSeek: First chunk after flush is not a key frame', {
          index: i,
          is_sync: sample.is_sync,
        });
        break;
      }

      const chunk = new EncodedVideoChunk({
        type: chunkType,
        timestamp: (sample.cts * MICROSECONDS_PER_SECOND) / sample.timescale,
        duration: (sample.duration * MICROSECONDS_PER_SECOND) / sample.timescale,
        data: sample.data,
      });
      state.decoder.decode(chunk);
    }

    // Only flush if NOT playing - if playing, keep decoder context for continued playback
    // The decoder has the context from decoding keyframe→target, so we can continue from sampleIndex+1
    if (state.decoder.state === 'configured' && !state.isPlaying) {
      await state.decoder.flush();
    }

    // If playing, continue decoding from the next sample after seek target
    if (state.isPlaying && state.decoder.state === 'configured') {
      // Continue from where we left off - decoder has context from seek decoding
      const startIndex = sampleIndex + 1;
      if (startIndex < state.samples.length) {
        const endIndex = Math.min(startIndex + MAX_QUEUE_SIZE - 1, state.samples.length - 1);
        for (let i = startIndex; i <= endIndex; i++) {
          decodeFrame(i);
        }
        state.lastQueuedSampleIndex = endIndex;
      }
      // Reset wall clock sync for smooth playback resumption from seek position
      state.needsWallClockSync = true;
    }
  } catch (e) {
    logger.warn('performSeek: Decode error during seek', {
      error: (e as Error).message,
      keyframeIndex,
      sampleIndex,
    });
    state.isSeeking = false;
  }
}

async function startPlayback(): Promise<void> {
  // Guard against concurrent startPlayback calls (critical for async function)
  if (state.startPlaybackInProgress || state.isPlaying) return;

  // MULTI-SOURCE MODE: Check if we have active clips configured
  // Multi-source stores data in state.sources Map, not global state.samples
  if (state.activeClips.length > 0) {
    await startMultiSourcePlayback();
    return;
  }

  // SINGLE-SOURCE MODE (legacy path)
  if (!state.decoder || state.samples.length === 0 || !hasPlayableKeyframe() || !ensureDecoderConfigured()) {
    state.pendingAutoPlay = true;
    return;
  }

  state.startPlaybackInProgress = true;
  state.pendingAutoPlay = false;

  try {
    // If current position is outside trim range, seek to in-point first
    let startTimeUs = state.lastRenderedTime;
    const nearOutPoint = startTimeUs >= state.trimOutPoint - 100000; // 100ms tolerance
    const beforeInPoint = startTimeUs < state.trimInPoint;

    if (beforeInPoint || nearOutPoint) {
      await seekTo(state.trimInPoint);
      startTimeUs = state.lastRenderedTime;
    }

    // CRITICAL: Flush decoder to ensure clean state before playback
    // This guarantees the decoder is ready for a key frame
    // Guard against decoder becoming invalid during seekTo() above
    if (!state.decoder || state.decoder.state !== 'configured') {
      state.isPlaying = false;
      postResponse({ type: 'PLAYBACK_STATE', payload: { isPlaying: false } });
      return;
    }
    await state.decoder.flush();

    // Clear any existing queued frames AFTER flush
    for (const { frame } of state.frameQueue) {
      frame.close();
    }
    state.frameQueue.length = 0;

    state.isPlaying = true;
    state.playbackStartTime = startTimeUs;
    // DON'T set playbackStartWallTime here - wait for first frame to sync
    state.needsWallClockSync = true;  // Will sync when first renderable frame is ready
    // FIX: +1 to skip frames at or before the already-rendered seek position
    // This prevents duplicate render of the same frame after seekTo()
    state.playbackMinTimestamp = startTimeUs + 1;

    // Find the sample index for start time
    let currentSampleIndex = state.samples.findIndex((sample) => {
      const sampleTime = (sample.cts * MICROSECONDS_PER_SECOND) / sample.timescale;
      return sampleTime >= startTimeUs;
    });
    if (currentSampleIndex === -1) currentSampleIndex = 0;

    const keyframeIndex = findPreviousKeyframe(currentSampleIndex);

    // CRITICAL: Validate keyframe before decoding
    if (!state.samples[keyframeIndex]?.is_sync) {
      logger.warn('startPlayback: Keyframe validation failed', {
        keyframeIndex,
        currentSampleIndex,
        is_sync: state.samples[keyframeIndex]?.is_sync,
      });
      state.isPlaying = false;
      postResponse({ type: 'PLAYBACK_STATE', payload: { isPlaying: false } });
      return;
    }

    const endIndex = Math.min(currentSampleIndex + MAX_QUEUE_SIZE, state.samples.length - 1);
    for (let i = keyframeIndex; i <= endIndex; i++) {
      decodeFrame(i);
    }
    state.lastQueuedSampleIndex = endIndex;

    postResponse({ type: 'PLAYBACK_STATE', payload: { isPlaying: true } });

    // Start playback loop - wall clock will sync on first renderable frame
    requestAnimationFrame(playbackLoop);
  } finally {
    state.startPlaybackInProgress = false;
  }
}

async function pausePlayback(): Promise<void> {
  // Guard against concurrent pause operations
  if (state.pauseRequested) return;

  state.pauseRequested = true;

  try {
    // CRITICAL: Await flush BEFORE clearing state
    // This ensures no in-flight frames corrupt state after we clear it
    if (state.decoder && state.decoder.state === 'configured') {
      await state.decoder.flush();
    }

    // Now safe to clear playback state
    state.isPlaying = false;
    state.needsWallClockSync = false;

    // Clear frame queue after flush
    for (const { frame } of state.frameQueue) {
      frame.close();
    }
    state.frameQueue.length = 0;

    postResponse({ type: 'PLAYBACK_STATE', payload: { isPlaying: false } });
  } finally {
    state.pauseRequested = false;
  }
}

function playbackLoop(): void {
  if (!state.isPlaying) {
    return;
  }

  // ========================================================================
  // MULTI-SOURCE MODE
  // ========================================================================
  // When activeClips are set, use multi-source compositing instead of
  // single-source playback.
  if (state.activeClips.length > 0) {
    multiSourcePlaybackLoop();
    return;
  }

  // ========================================================================
  // SINGLE-SOURCE MODE (backward compatible)
  // ========================================================================
  if (!state.decoder || state.decoder.state !== 'configured') {
    void pausePlayback();
    return;
  }

  if (state.needsWallClockSync) {
    const firstRenderableFrame = state.frameQueue.find(f => f.timestamp >= state.playbackMinTimestamp);
    if (firstRenderableFrame) {
      state.playbackStartWallTime = performance.now();
      state.playbackStartTime = firstRenderableFrame.timestamp;
      state.needsWallClockSync = false;
    } else {
      requestAnimationFrame(playbackLoop);
      return;
    }
  }

  // Calculate target time based on wall clock
  const elapsed = performance.now() - state.playbackStartWallTime;
  const targetUs = state.playbackStartTime + elapsed * 1000; // elapsed is ms, convert to us

  // Check if we've reached the trim out point
  if (targetUs >= state.trimOutPoint) {
    void pausePlayback();  // Now async
    return;
  }

  // CRITICAL: Skip frame queueing if a seek is in progress
  // performSeek() handles its own decoding and will re-initialize the queue when done
  if (state.isSeeking || state.seekInProgress) {
    requestAnimationFrame(playbackLoop);
    return;
  }

  // Keep the decoder fed - but limit by decoder queue size, not frameQueue
  // frameQueue fills asynchronously, so we use decoder.decodeQueueSize to avoid over-queueing

  // Re-validate decoder state before queueing (may have changed during async operations)
  if (state.decoder.state !== 'configured') {
    logger.warn('playbackLoop: Decoder not configured during playback');
    void pausePlayback();
    return;
  }

  const inFlightCount = state.decoder.decodeQueueSize + state.frameQueue.length;
  if (
    inFlightCount < MAX_QUEUE_SIZE &&
    state.lastQueuedSampleIndex + 1 < state.samples.length
  ) {
    // Queue one more frame per animation frame to maintain steady decode
    state.lastQueuedSampleIndex++;
    decodeFrame(state.lastQueuedSampleIndex);
  }

  // Find the best frame to display from the queue
  // Look for the frame closest to (but not after) targetUs
  let bestFrameIndex = -1;
  for (let i = 0; i < state.frameQueue.length; i++) {
    const queuedFrame = state.frameQueue[i];
    if (!queuedFrame) continue;
    if (queuedFrame.timestamp <= targetUs) {
      bestFrameIndex = i;
    } else {
      break; // Queue is sorted by decode order (which matches timestamp order)
    }
  }

  // Render the best frame and clean up old frames
  if (bestFrameIndex >= 0) {
    // Close all frames before the best one
    for (let i = 0; i < bestFrameIndex; i++) {
      state.frameQueue[i]?.frame.close();
    }

    // Get the frame to render
    const bestFrame = state.frameQueue[bestFrameIndex];
    if (!bestFrame) return;
    const { frame, timestamp } = bestFrame;

    // Remove rendered and older frames from queue
    state.frameQueue.splice(0, bestFrameIndex + 1);

    // Frame dropping: skip frames that are too far behind target time
    // This prevents stuttering on slower devices by maintaining real-time sync
    const frameLag = targetUs - timestamp;

    if (frameLag > MAX_FRAME_LAG_US) {
      // Frame is too late - drop it to catch up
      frame.close();
    } else if (state.renderer) {
      queueFirstFrameCapture(frame);
      // Render the frame - state.renderer.draw() takes ownership and will close it
      state.renderer.draw(frame);
      state.lastRenderedTime = timestamp;
      postResponse({
        type: 'TIME_UPDATE',
        payload: { currentTimeUs: timestamp },
      });
    } else {
      // No renderer - must close frame ourselves
      frame.close();
    }
  }

  // Check if we've reached end of video (all samples queued, decoded, and rendered)
  const allSamplesQueued = state.lastQueuedSampleIndex >= state.samples.length - 1;
  const nothingInFlight = state.decoder.decodeQueueSize === 0;
  const queueEmpty = state.frameQueue.length === 0;
  if (allSamplesQueued && nothingInFlight && queueEmpty) {
    void pausePlayback();  // Now async
    return;
  }

  // Continue playback loop
  requestAnimationFrame(playbackLoop);
}

function decodeFrame(sampleIndex: number): void {
  if (!state.decoder || state.decoder.state !== 'configured') return;

  // Validate sample exists
  const sample = state.samples[sampleIndex];
  if (!sample) {
    logger.warn('decodeFrame: Invalid sample index:', sampleIndex);
    return;
  }

  const chunk = new EncodedVideoChunk({
    type: sample.is_sync ? 'key' : 'delta',
    timestamp: (sample.cts * MICROSECONDS_PER_SECOND) / sample.timescale,
    duration: (sample.duration * MICROSECONDS_PER_SECOND) / sample.timescale,
    data: sample.data,
  });

  try {
    state.decoder.decode(chunk);
  } catch (e) {
    // On decode error, skip the sample but keep playback running
    logger.warn('decodeFrame: Decode error, skipping sample', {
      error: (e as Error).message,
      sampleIndex,
      is_sync: sample.is_sync,
    });
  }
}

// Wrapper for shared keyframe search utility
// Returns the index in samples[] (not in keyframeIndices[])
function findPreviousKeyframe(targetSampleIndex: number): number {
  // Validate target is within bounds
  if (targetSampleIndex < 0 || targetSampleIndex >= state.samples.length) {
    const firstKeyframe = state.keyframeIndices[0];
    logger.warn('findPreviousKeyframe: Invalid targetSampleIndex:', targetSampleIndex);
    return firstKeyframe ?? 0;
  }

  const result = findPreviousKeyframeUtil(state.keyframeIndices, targetSampleIndex, state.samples);

  // Log warning if no keyframes available
  if (state.keyframeIndices.length === 0) {
    logger.warn('findPreviousKeyframe: No keyframes available, defaulting to index 0');
  }

  return result;
}

// Helper to extract codec description (AVCC/HVCC) from MP4Box
function getCodecDescription(file: MP4File, trackId: number): Uint8Array | null {
  try {
    const track = file.getTrackById(trackId);
    for (const entry of track.mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC;
      if (box) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        box.write(stream);
        return new Uint8Array(stream.buffer.slice(8)); // Remove box header
      }
    }
  } catch (e) {
    logger.warn('Failed to get codec description:', e);
  }
  return null;
}
