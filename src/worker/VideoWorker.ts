import { createFile, DataStream } from 'mp4box';
import type { MP4File, MP4Sample, MP4Info, MP4VideoTrack } from 'mp4box';
import { WebGLRenderer } from './renderer';
import type { WorkerCommand, WorkerResponse } from '../types/editor';

// State
let renderer: WebGLRenderer | null = null;
let mp4File: MP4File | null = null;
let decoder: VideoDecoder | null = null;
let videoTrackInfo: MP4VideoTrack | null = null;

// Sample storage for seeking
const samples: MP4Sample[] = [];

// Keyframe index for O(log n) keyframe lookup during seeks
const keyframeIndices: number[] = [];

// Playback state
let isPlaying = false;
let trimInPoint = 0;
let trimOutPoint = Infinity;
let lastRenderedTime = 0;
let playbackStartTime = 0;
let playbackStartWallTime = 0;
let playbackMinTimestamp = 0; // Skip frames before this timestamp during playback

// Seeking state
let isSeeking = false;
let seekTargetFrameCount = 0;
let seekCurrentFrameCount = 0;
let seekVersion = 0;        // Increments with each new seek to invalidate old frames
let currentSeekVersion = 0; // Version of the current active seek operation
let seekInProgress = false; // Mutex to prevent concurrent seeks
let pendingSeekTime: number | null = null; // Queue for next seek request

// Pause state - guards against in-flight decoder frames after pause
let pauseRequested = false;

// Playback start guards
let startPlaybackInProgress = false;  // Prevent concurrent startPlayback calls
let needsWallClockSync = false;       // Delay wall clock sync until first frame is ready

// Frame queue for playback - buffer decoded frames for smooth rendering
const frameQueue: { frame: VideoFrame; timestamp: number }[] = [];
const MAX_QUEUE_SIZE = 8; // Buffer up to 8 frames ahead

// Legacy pending frame for seek operations
let pendingFrame: VideoFrame | null = null;

// Flag to track if we need to seek to first frame
let needsInitialSeek = false;

// Track which sample we've queued for decoding
let lastQueuedSampleIndex = -1;

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
      renderer = new WebGLRenderer(canvas);
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
      trimInPoint = inPoint;
      trimOutPoint = outPoint;
      // Don't auto-seek during trim drag - let user control playhead separately
      // Playback will start from in-point if current position is before it
      break;
    }
  }
};

function handleDecodedFrame(frame: VideoFrame): void {
  // CRITICAL: Check version FIRST before any processing
  // This prevents stale frames from being logged or processed at all
  if (currentSeekVersion !== seekVersion) {
    frame.close();
    return;
  }

  // CRITICAL: Discard frames if pause is in progress
  // This prevents in-flight decoder frames from corrupting lastRenderedTime
  if (pauseRequested) {
    frame.close();
    return;
  }

  const timestamp = frame.timestamp ?? 0;

  // If seeking, only render the last frame
  if (isSeeking) {
    seekCurrentFrameCount++;
    if (seekCurrentFrameCount < seekTargetFrameCount) {
      // Intermediate frame during seek - close immediately
      frame.close();
      return;
    }
    // This is the target frame - clear seeking state and render immediately
    isSeeking = false;
    pendingFrame?.close();
    pendingFrame = frame;

    if (renderer) {
      renderer.draw(frame);
      lastRenderedTime = timestamp;
      postResponse({
        type: 'TIME_UPDATE',
        payload: { currentTimeUs: lastRenderedTime },
      });
    }
    return;
  }

  // During playback, add frame to queue for synchronized rendering
  if (isPlaying) {
    // Skip frames before the playback start position (these are just for decoder priming)
    if (timestamp < playbackMinTimestamp) {
      frame.close();
      return;
    }
    // Add to queue (sorted by timestamp)
    frameQueue.push({ frame, timestamp });
    return;
  }

  // Not playing and not seeking - render immediately (e.g., initial frame)
  pendingFrame?.close();
  pendingFrame = frame;

  if (renderer) {
    renderer.draw(frame);
    lastRenderedTime = timestamp;
    postResponse({
      type: 'TIME_UPDATE',
      payload: { currentTimeUs: lastRenderedTime },
    });
  }
}

async function loadFile(file: File): Promise<void> {
  // Reset state
  samples.length = 0;
  keyframeIndices.length = 0;
  pendingFrame?.close();
  pendingFrame = null;
  isPlaying = false;
  isSeeking = false;
  pauseRequested = false;
  startPlaybackInProgress = false;
  needsWallClockSync = false;
  lastQueuedSampleIndex = -1;
  seekVersion = 0;
  currentSeekVersion = 0;
  seekInProgress = false;
  pendingSeekTime = null;

  // Clear frame queue
  for (const { frame } of frameQueue) {
    frame.close();
  }
  frameQueue.length = 0;

  mp4File = createFile();

  // Configure decoder
  decoder = new VideoDecoder({
    output: handleDecodedFrame,
    error: (e) => {
      console.error('Decoder error:', e);
      postResponse({ type: 'ERROR', payload: { message: e.message } });
    },
  });

  mp4File.onReady = (info: MP4Info) => {
    videoTrackInfo = info.videoTracks[0];
    if (!videoTrackInfo) {
      postResponse({ type: 'ERROR', payload: { message: 'No video track found' } });
      return;
    }

    const description = getCodecDescription(mp4File!, videoTrackInfo.id);

    decoder?.configure({
      codec: videoTrackInfo.codec,
      codedWidth: videoTrackInfo.video.width,
      codedHeight: videoTrackInfo.video.height,
      description: description ?? undefined,
    });

    // Set extraction options to get all samples
    mp4File?.setExtractionOptions(videoTrackInfo.id, null, { nbSamples: Infinity });
    mp4File?.start();

    // Calculate duration - use track duration if movie duration is 0
    let durationSeconds: number;
    if (info.duration > 0 && info.timescale > 0) {
      durationSeconds = info.duration / info.timescale;
    } else if (videoTrackInfo.duration > 0 && videoTrackInfo.timescale > 0) {
      durationSeconds = videoTrackInfo.duration / videoTrackInfo.timescale;
    } else {
      // Fallback: estimate from nb_samples (assume 30fps)
      durationSeconds = videoTrackInfo.nb_samples / 30;
    }

    trimOutPoint = durationSeconds * 1_000_000; // microseconds

    postResponse({
      type: 'READY',
      payload: {
        duration: durationSeconds,
        width: videoTrackInfo.video.width,
        height: videoTrackInfo.video.height,
      },
    });
  };

  mp4File.onSamples = (_id: number, _user: unknown, newSamples: MP4Sample[]) => {
    const wasEmpty = samples.length === 0;
    for (const sample of newSamples) {
      const sampleIndex = samples.length;
      samples.push(sample);
      // Build keyframe index for O(log n) lookup during seeks
      if (sample.is_sync) {
        keyframeIndices.push(sampleIndex);
      }
    }
    // Seek to first frame when samples first arrive
    if (wasEmpty && samples.length > 0 && needsInitialSeek) {
      needsInitialSeek = false;
      void seekTo(0);
    }
  };

  mp4File.onError = (e: Error) => {
    postResponse({ type: 'ERROR', payload: { message: e.message } });
  };

  // Read file as ArrayBuffer
  const buffer = await file.arrayBuffer();
  // MP4Box requires fileStart property on buffer
  const mp4Buffer = buffer as unknown as ArrayBuffer & { fileStart: number };
  mp4Buffer.fileStart = 0;

  // Set flag to seek to first frame once samples are loaded
  needsInitialSeek = true;

  mp4File.appendBuffer(mp4Buffer);
  mp4File.flush();
}

async function seekTo(timeUs: number): Promise<void> {
  if (!decoder || samples.length === 0) return;
  if (decoder.state !== 'configured') return;

  if (seekInProgress) {
    pendingSeekTime = timeUs;
    return;
  }

  seekInProgress = true;

  try {
    await performSeek(timeUs);
  } finally {
    seekInProgress = false;

    if (pendingSeekTime !== null) {
      const nextSeek = pendingSeekTime;
      pendingSeekTime = null;
      void seekTo(nextSeek);
    }
  }
}

async function performSeek(timeUs: number): Promise<void> {
  if (!decoder || decoder.state !== 'configured') return;

  seekVersion++;
  const thisSeekVersion = seekVersion;

  // Clamp to trim bounds
  const targetUs = Math.max(trimInPoint, Math.min(timeUs, trimOutPoint));
  const targetSeconds = targetUs / 1_000_000;

  // Find sample index at or after target time
  let sampleIndex = samples.findIndex((s) => {
    const sampleTime = s.cts / s.timescale;
    return sampleTime >= targetSeconds;
  });

  if (sampleIndex === -1) {
    sampleIndex = samples.length - 1;
  }

  // Find previous keyframe using O(log n) binary search
  const keyframeIndex = findPreviousKeyframe(sampleIndex);

  // Flush decoder to clear any pending frames
  await decoder.flush();

  // Close pending frame
  pendingFrame?.close();
  pendingFrame = null;

  // Clear frame queue
  for (const { frame } of frameQueue) {
    frame.close();
  }
  frameQueue.length = 0;

  isSeeking = true;
  currentSeekVersion = thisSeekVersion;
  seekTargetFrameCount = sampleIndex - keyframeIndex + 1;
  seekCurrentFrameCount = 0;

  // Reset the queued sample index for playback
  lastQueuedSampleIndex = sampleIndex;

  // Decode frames from keyframe to target
  try {
    for (let i = keyframeIndex; i <= sampleIndex; i++) {
      if (decoder.state !== 'configured') break;
      const sample = samples[i];
      const chunk = new EncodedVideoChunk({
        type: sample.is_sync ? 'key' : 'delta',
        timestamp: (sample.cts * 1_000_000) / sample.timescale,
        duration: (sample.duration * 1_000_000) / sample.timescale,
        data: sample.data,
      });
      decoder.decode(chunk);
    }

    if (decoder.state === 'configured') {
      await decoder.flush();
    }
  } catch (e) {
    console.error('[Worker] Seek decode error:', e);
    isSeeking = false;
  }
}

async function startPlayback(): Promise<void> {
  // Guard against concurrent startPlayback calls (critical for async function)
  if (startPlaybackInProgress || isPlaying || !decoder || samples.length === 0) return;
  if (decoder.state !== 'configured') return;

  startPlaybackInProgress = true;

  try {
    // If current position is outside trim range, seek to in-point first
    let startTimeUs = lastRenderedTime;
    const nearOutPoint = startTimeUs >= trimOutPoint - 100000; // 100ms tolerance
    const beforeInPoint = startTimeUs < trimInPoint;

    if (beforeInPoint || nearOutPoint) {
      await seekTo(trimInPoint);
      startTimeUs = lastRenderedTime;
    }

    // Clear any existing queued frames AFTER potential seek
    for (const { frame } of frameQueue) {
      frame.close();
    }
    frameQueue.length = 0;

    isPlaying = true;
    playbackStartTime = startTimeUs;
    // DON'T set playbackStartWallTime here - wait for first frame to sync
    needsWallClockSync = true;  // Will sync when first renderable frame is ready
    // FIX: +1 to skip frames at or before the already-rendered seek position
    // This prevents duplicate render of the same frame after seekTo()
    playbackMinTimestamp = startTimeUs + 1;

    // Find the sample index for start time
    let currentSampleIndex = samples.findIndex((s) => {
      const sampleTime = (s.cts * 1_000_000) / s.timescale;
      return sampleTime >= startTimeUs;
    });
    if (currentSampleIndex === -1) currentSampleIndex = 0;

    const keyframeIndex = findPreviousKeyframe(currentSampleIndex);
    const endIndex = Math.min(currentSampleIndex + MAX_QUEUE_SIZE, samples.length - 1);
    for (let i = keyframeIndex; i <= endIndex; i++) {
      decodeFrame(i);
    }
    lastQueuedSampleIndex = endIndex;

    postResponse({ type: 'PLAYBACK_STATE', payload: { isPlaying: true } });

    // Start playback loop - wall clock will sync on first renderable frame
    requestAnimationFrame(playbackLoop);
  } finally {
    startPlaybackInProgress = false;
  }
}

async function pausePlayback(): Promise<void> {
  pauseRequested = true;
  isPlaying = false;
  needsWallClockSync = false;

  if (decoder && decoder.state === 'configured') {
    await decoder.flush();
  }

  for (const { frame } of frameQueue) {
    frame.close();
  }
  frameQueue.length = 0;

  pauseRequested = false;

  postResponse({ type: 'PLAYBACK_STATE', payload: { isPlaying: false } });
}

function playbackLoop(): void {
  if (!isPlaying || !decoder || decoder.state !== 'configured') {
    if (isPlaying) {
      void pausePlayback();  // Now async
    }
    return;
  }

  if (needsWallClockSync) {
    const firstRenderableFrame = frameQueue.find(f => f.timestamp >= playbackMinTimestamp);
    if (firstRenderableFrame) {
      playbackStartWallTime = performance.now();
      playbackStartTime = firstRenderableFrame.timestamp;
      needsWallClockSync = false;
    } else {
      requestAnimationFrame(playbackLoop);
      return;
    }
  }

  // Calculate target time based on wall clock
  const elapsed = performance.now() - playbackStartWallTime;
  const targetUs = playbackStartTime + elapsed * 1000; // elapsed is ms, convert to us

  // Check if we've reached the trim out point
  if (targetUs >= trimOutPoint) {
    void pausePlayback();  // Now async
    return;
  }

  // Keep the decoder fed - but limit by decoder queue size, not frameQueue
  // frameQueue fills asynchronously, so we use decoder.decodeQueueSize to avoid over-queueing
  const inFlightCount = decoder.decodeQueueSize + frameQueue.length;
  if (
    inFlightCount < MAX_QUEUE_SIZE &&
    lastQueuedSampleIndex + 1 < samples.length
  ) {
    // Queue one more frame per animation frame to maintain steady decode
    lastQueuedSampleIndex++;
    decodeFrame(lastQueuedSampleIndex);
  }

  // Find the best frame to display from the queue
  // Look for the frame closest to (but not after) targetUs
  let bestFrameIndex = -1;
  for (let i = 0; i < frameQueue.length; i++) {
    if (frameQueue[i].timestamp <= targetUs) {
      bestFrameIndex = i;
    } else {
      break; // Queue is sorted by decode order (which matches timestamp order)
    }
  }

  // Render the best frame and clean up old frames
  if (bestFrameIndex >= 0) {
    // Close all frames before the best one
    for (let i = 0; i < bestFrameIndex; i++) {
      frameQueue[i].frame.close();
    }

    // Get the frame to render
    const { frame, timestamp } = frameQueue[bestFrameIndex];

    // Remove rendered and older frames from queue
    frameQueue.splice(0, bestFrameIndex + 1);

    // Render the frame
    if (renderer) {
      renderer.draw(frame);
      lastRenderedTime = timestamp;
      postResponse({
        type: 'TIME_UPDATE',
        payload: { currentTimeUs: timestamp },
      });
    }

    // Close the frame after rendering
    frame.close();
  }

  // Check if we've reached end of video (all samples queued, decoded, and rendered)
  const allSamplesQueued = lastQueuedSampleIndex >= samples.length - 1;
  const nothingInFlight = decoder.decodeQueueSize === 0;
  const queueEmpty = frameQueue.length === 0;
  if (allSamplesQueued && nothingInFlight && queueEmpty) {
    void pausePlayback();  // Now async
    return;
  }

  // Continue playback loop
  requestAnimationFrame(playbackLoop);
}

function decodeFrame(sampleIndex: number): void {
  if (!decoder || decoder.state !== 'configured') return;

  const sample = samples[sampleIndex];
  const chunk = new EncodedVideoChunk({
    type: sample.is_sync ? 'key' : 'delta',
    timestamp: (sample.cts * 1_000_000) / sample.timescale,
    duration: (sample.duration * 1_000_000) / sample.timescale,
    data: sample.data,
  });

  try {
    decoder.decode(chunk);
  } catch (e) {
    console.error('[Worker] Decode error:', e);
    void pausePlayback();  // Now async
  }
}

// Binary search to find the keyframe at or before the target sample index
// Returns the index in samples[] (not in keyframeIndices[])
function findPreviousKeyframe(targetSampleIndex: number): number {
  if (keyframeIndices.length === 0) return 0;

  // Binary search for largest keyframe index <= targetSampleIndex
  let left = 0;
  let right = keyframeIndices.length - 1;

  while (left < right) {
    const mid = Math.ceil((left + right) / 2);
    if (keyframeIndices[mid] <= targetSampleIndex) {
      left = mid;
    } else {
      right = mid - 1;
    }
  }

  // Return the sample index at this keyframe position
  return keyframeIndices[left] <= targetSampleIndex ? keyframeIndices[left] : 0;
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
    console.warn('Failed to get codec description:', e);
  }
  return null;
}
