import { createFile, DataStream } from 'mp4box';
import type { MP4File, MP4Sample, MP4Info, MP4VideoTrack } from 'mp4box';
import { WebGLRenderer } from './renderer';
import type { WorkerCommand, WorkerResponse, TransferableSample } from '../types/editor';
import { PLAYBACK, TIME } from '../constants';
import { createWorkerLogger } from '../utils/logger';

const logger = createWorkerLogger('VideoWorker');

// ============================================================================
// STATE MACHINE
// ============================================================================
// Explicit states for the video worker to make state transitions clear
// and prevent invalid state combinations.

type WorkerState = 'idle' | 'loading' | 'ready' | 'seeking' | 'playing';

interface VideoWorkerState {
  // Current state machine state
  state: WorkerState;

  // Playback flags
  isPlaying: boolean;
  isSeeking: boolean;

  // Core resources (null when idle)
  renderer: WebGLRenderer | null;
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
}

// Single source of truth for all worker state
const workerState: VideoWorkerState = {
  state: 'idle',
  isPlaying: false,
  isSeeking: false,
  renderer: null,
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
};

// Convenience accessor for state
const state = workerState;
const { MAX_QUEUE_SIZE, MAX_FRAME_LAG_US } = PLAYBACK;
const { MICROSECONDS_PER_SECOND } = TIME;

// Send message to main thread
function postResponse(response: WorkerResponse): void {
  self.postMessage(response);
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

    case 'SEEK': {
      const { timeUs } = e.data.payload;
      await seekTo(timeUs);
      break;
    }

    case 'PLAY': {
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

    case 'GET_SAMPLES_FOR_SPRITES': {
      // Expose sample data for sprite generation
      if (state.samples.length === 0 || !state.videoTrackInfo) {
        postResponse({ type: 'ERROR', payload: { message: 'No video loaded' } });
        break;
      }

      // Convert samples to transferable format with ArrayBuffer data
      const transferableSamples: TransferableSample[] = state.samples.map((sample, index) => {
        // sample.data is ArrayBuffer - make a copy to transfer
        const dataCopy = sample.data.slice(0);
        return {
          index,
          cts: sample.cts,
          timescale: sample.timescale,
          is_sync: sample.is_sync,
          duration: sample.duration,
          data: dataCopy,
        };
      });

      postResponse({
        type: 'SAMPLES_FOR_SPRITES',
        payload: {
          samples: transferableSamples,
          keyframeIndices: [...state.keyframeIndices],
          videoWidth: state.videoTrackInfo.video.width,
          videoHeight: state.videoTrackInfo.video.height,
          codecDescription: state.codecDescription,
          codec: state.videoTrackInfo.codec,
        },
      });
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

async function loadFile(file: File): Promise<void> {
  // Reset state
  state.samples.length = 0;
  state.keyframeIndices.length = 0;
  state.isPlaying = false;
  state.isSeeking = false;
  state.pauseRequested = false;
  state.startPlaybackInProgress = false;
  state.needsWallClockSync = false;
  state.lastQueuedSampleIndex = -1;
  state.seekVersion = 0;
  state.currentSeekVersion = 0;
  state.seekInProgress = false;
  state.pendingSeekTime = null;

  // Clear frame queue
  for (const { frame } of state.frameQueue) {
    frame.close();
  }
  state.frameQueue.length = 0;

  state.mp4File = createFile();

  // Configure decoder
  state.decoder = new VideoDecoder({
    output: handleDecodedFrame,
    error: (e) => {
      logger.error('Decoder error:', e);
      postResponse({ type: 'ERROR', payload: { message: e.message } });
    },
  });

  state.mp4File.onReady = (info: MP4Info) => {
    state.videoTrackInfo = info.videoTracks[0] ?? null;
    if (!state.videoTrackInfo) {
      postResponse({ type: 'ERROR', payload: { message: 'No video track found' } });
      return;
    }

    const description = getCodecDescription(state.mp4File!, state.videoTrackInfo.id);
    state.codecDescription = description; // Store for sprite worker

    state.decoder?.configure({
      codec: state.videoTrackInfo.codec,
      codedWidth: state.videoTrackInfo.video.width,
      codedHeight: state.videoTrackInfo.video.height,
      description: description ?? undefined,
    });

    // Set extraction options to get all samples
    state.mp4File?.setExtractionOptions(state.videoTrackInfo.id, null, { nbSamples: Infinity });
    state.mp4File?.start();

    // Calculate duration - use track duration if movie duration is 0
    let durationSeconds: number;
    if (info.duration > 0 && info.timescale > 0) {
      durationSeconds = info.duration / info.timescale;
    } else if (state.videoTrackInfo.duration > 0 && state.videoTrackInfo.timescale > 0) {
      durationSeconds = state.videoTrackInfo.duration / state.videoTrackInfo.timescale;
    } else {
      // Fallback: estimate from nb_samples (assume 30fps)
      durationSeconds = state.videoTrackInfo.nb_samples / 30;
    }

    state.trimOutPoint = durationSeconds * MICROSECONDS_PER_SECOND; // microseconds

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
      // Build keyframe index for O(log n) lookup during seeks
      if (sample.is_sync) {
        state.keyframeIndices.push(sampleIndex);
      }
    }
    // Seek to first frame when samples first arrive
    if (wasEmpty && state.samples.length > 0 && state.needsInitialSeek) {
      state.needsInitialSeek = false;
      void seekTo(0);
    }
  };

  state.mp4File.onError = (e: Error) => {
    postResponse({ type: 'ERROR', payload: { message: e.message } });
  };

  // Read file as ArrayBuffer
  const buffer = await file.arrayBuffer();
  // MP4Box requires fileStart property on buffer
  const mp4Buffer = buffer as unknown as ArrayBuffer & { fileStart: number };
  mp4Buffer.fileStart = 0;

  // Set flag to seek to first frame once samples are loaded
  state.needsInitialSeek = true;

  state.mp4File.appendBuffer(mp4Buffer);
  state.mp4File.flush();
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
  if (state.startPlaybackInProgress || state.isPlaying || !state.decoder || state.samples.length === 0) return;
  if (state.decoder.state !== 'configured') return;

  state.startPlaybackInProgress = true;

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
    if (state.decoder.state === 'configured') {
      await state.decoder.flush();
    }

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
  if (!state.isPlaying || !state.decoder || state.decoder.state !== 'configured') {
    if (state.isPlaying) {
      void pausePlayback();  // Now async
    }
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
    // On any decode error, pause playback gracefully
    // The seek state checks in playbackLoop should prevent most errors
    logger.warn('decodeFrame: Decode error, pausing playback', {
      error: (e as Error).message,
      sampleIndex,
      is_sync: sample.is_sync,
    });
    void pausePlayback();
  }
}

// Binary search to find the keyframe at or before the target sample index
// Returns the index in samples[] (not in keyframeIndices[])
function findPreviousKeyframe(targetSampleIndex: number): number {
  const firstKeyframe = state.keyframeIndices[0];
  if (firstKeyframe === undefined) {
    logger.warn('findPreviousKeyframe: No keyframes available, defaulting to index 0');
    return 0;
  }

  // Validate target is within bounds
  if (targetSampleIndex < 0 || targetSampleIndex >= state.samples.length) {
    logger.warn('findPreviousKeyframe: Invalid targetSampleIndex:', targetSampleIndex);
    return firstKeyframe;
  }

  // Binary search for largest keyframe index <= targetSampleIndex
  let left = 0;
  let right = state.keyframeIndices.length - 1;

  while (left < right) {
    const mid = Math.ceil((left + right) / 2);
    const midValue = state.keyframeIndices[mid];
    if (midValue !== undefined && midValue <= targetSampleIndex) {
      left = mid;
    } else {
      right = mid - 1;
    }
  }

  const leftValue = state.keyframeIndices[left];
  const result = leftValue !== undefined && leftValue <= targetSampleIndex ? leftValue : 0;

  // Validate result is actually a keyframe
  if (!state.samples[result]?.is_sync) {
    logger.warn('findPreviousKeyframe: Result is not a sync frame, using first keyframe', {
      result,
      is_sync: state.samples[result]?.is_sync,
    });
    return firstKeyframe;
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
