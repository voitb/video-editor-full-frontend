import {
  getSpriteConfig,
  type SpriteWorkerCommand,
  type SpriteWorkerResponse,
  type TransferableSample,
  type SpriteMetadata,
} from './spriteTypes';
import { TIME, COLORS } from '../constants';
import { createWorkerLogger } from '../utils/logger';
import { findPreviousKeyframe as findPreviousKeyframeUtil } from '../utils/keyframeSearch';

const { MICROSECONDS_PER_SECOND } = TIME;
const logger = createWorkerLogger('SpriteWorker');

// ============================================================================
// STATE
// ============================================================================

interface GeneratedRange {
  start: number;
  end: number;
}

interface SpriteWorkerState {
  samples: TransferableSample[];
  keyframeIndices: number[];
  videoWidth: number;
  videoHeight: number;
  codec: string;
  codecDescription: Uint8Array | null;
  decoder: VideoDecoder | null;
  isInitialized: boolean;
  isGenerating: boolean;
  generationAborted: boolean;
  // Decoder needs reset after error
  decoderNeedsReset: boolean;
  // Progressive loading: track generated ranges and current interval
  generatedRanges: GeneratedRange[];
  currentIntervalUs: number;
  visibleRangeStartUs: number;
  visibleRangeEndUs: number;
}

const state: SpriteWorkerState = {
  samples: [],
  keyframeIndices: [],
  videoWidth: 0,
  videoHeight: 0,
  codec: '',
  codecDescription: null,
  decoder: null,
  isInitialized: false,
  isGenerating: false,
  generationAborted: false,
  decoderNeedsReset: false,
  generatedRanges: [],
  currentIntervalUs: MICROSECONDS_PER_SECOND, // Default 1 second
  visibleRangeStartUs: 0,
  visibleRangeEndUs: 0,
};

// ============================================================================
// MESSAGING
// ============================================================================

function postResponse(response: SpriteWorkerResponse): void {
  if (response.type === 'SPRITE_SHEET_READY') {
    // Transfer the ImageBitmap using WindowPostMessageOptions
    self.postMessage(response, { transfer: [response.payload.bitmap] });
  } else {
    self.postMessage(response);
  }
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

self.onmessage = async (e: MessageEvent<SpriteWorkerCommand>) => {
  const { type } = e.data;

  switch (type) {
    case 'INIT': {
      const { samples, keyframeIndices, videoWidth, videoHeight, codecDescription, codec } =
        e.data.payload;
      state.samples = samples;
      state.keyframeIndices = keyframeIndices;
      state.videoWidth = videoWidth;
      state.videoHeight = videoHeight;
      state.codec = codec;
      state.codecDescription = codecDescription;
      state.isInitialized = true;
      break;
    }

    case 'GENERATE_SPRITES': {
      const { startTimeUs, endTimeUs, intervalUs } = e.data.payload;
      await generateSprites(startTimeUs, endTimeUs, intervalUs);
      break;
    }

    case 'GENERATE_ALL_SPRITES': {
      const { intervalUs } = e.data.payload;
      const lastSample = state.samples[state.samples.length - 1];
      if (!lastSample) break;

      // Calculate total duration from samples
      const totalDurationUs = ((lastSample.cts + lastSample.duration) * MICROSECONDS_PER_SECOND) / lastSample.timescale;

      await generateSprites(0, totalDurationUs, intervalUs);
      break;
    }

    case 'SET_VISIBLE_RANGE': {
      const { startTimeUs, endTimeUs } = e.data.payload;
      state.visibleRangeStartUs = startTimeUs;
      state.visibleRangeEndUs = endTimeUs;

      // Check if this range needs generation (with 2s buffer on each side)
      const bufferUs = 2 * MICROSECONDS_PER_SECOND;
      const bufferedStart = Math.max(0, startTimeUs - bufferUs);
      const bufferedEnd = endTimeUs + bufferUs;

      if (!isRangeFullyGenerated(bufferedStart, bufferedEnd) && !state.isGenerating) {
        // Generate missing parts of the visible range with high priority
        await generateSprites(bufferedStart, bufferedEnd, state.currentIntervalUs);
      }
      break;
    }

    case 'CLEAR': {
      state.generationAborted = true;
      if (state.decoder && state.decoder.state !== 'closed') {
        state.decoder.close();
      }
      state.decoder = null;
      state.samples = [];
      state.keyframeIndices = [];
      state.isInitialized = false;
      state.generatedRanges = [];
      state.decoderNeedsReset = false;
      break;
    }
  }
};

// ============================================================================
// SPRITE GENERATION
// ============================================================================

async function generateSprites(
  startTimeUs: number,
  endTimeUs: number,
  intervalUs: number
): Promise<void> {
  if (!state.isInitialized || state.samples.length === 0) {
    postResponse({ type: 'ERROR', payload: { message: 'Worker not initialized' } });
    return;
  }

  // Check if this range is already fully generated
  if (isRangeFullyGenerated(startTimeUs, endTimeUs)) {
    postResponse({ type: 'GENERATION_COMPLETE' });
    return;
  }

  if (state.isGenerating) {
    // Abort current generation
    state.generationAborted = true;
    // Wait a tick for current generation to clean up
    await new Promise((r) => setTimeout(r, 0));
  }

  state.isGenerating = true;
  state.generationAborted = false;
  state.currentIntervalUs = intervalUs; // Store for SET_VISIBLE_RANGE

  try {
    // Calculate timestamps for thumbnails, skipping already-generated ones
    const timestamps: number[] = [];
    for (let t = startTimeUs; t <= endTimeUs; t += intervalUs) {
      // Skip timestamps that are already in a generated range
      if (!isRangeFullyGenerated(t, t + 1)) {
        timestamps.push(t);
      }
    }

    if (timestamps.length === 0) {
      // All timestamps already generated, just mark the range
      addGeneratedRange(startTimeUs, endTimeUs);
      postResponse({ type: 'GENERATION_COMPLETE' });
      return;
    }

    // Initialize decoder
    await initDecoder();
    if (!state.decoder || state.decoder.state !== 'configured') {
      postResponse({ type: 'ERROR', payload: { message: 'Failed to configure decoder' } });
      return;
    }

    // Get adaptive sprite config based on device capabilities
    const spriteConfig = getSpriteConfig();

    // Create sprite sheet canvas
    let sheetCanvas = new OffscreenCanvas(spriteConfig.sheetWidth, spriteConfig.sheetHeight);
    let ctx = sheetCanvas.getContext('2d')!;

    // Fill with dark background
    ctx.fillStyle = COLORS.SPRITE_BACKGROUND;
    ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);

    let currentSprites: SpriteMetadata[] = [];
    let spriteIndex = 0;
    let sheetStartTimeUs = timestamps[0] ?? 0;
    let sheetIndex = 0;

    // Decode exact frames at each timestamp
    for (let i = 0; i < timestamps.length; i++) {
      if (state.generationAborted) break;

      const targetTimeUs = timestamps[i];
      if (targetTimeUs === undefined) continue;

      // Decode the exact frame at target time (not just keyframe)
      const frame = await decodeFrameAtTime(targetTimeUs);
      if (!frame) continue;

      try {
        // Create thumbnail using createImageBitmap with hardware-accelerated resize
        const thumbnail = await createImageBitmap(frame, {
          resizeWidth: spriteConfig.thumbnailWidth,
          resizeHeight: spriteConfig.thumbnailHeight,
          resizeQuality: 'medium',
        });

        // Calculate position in sprite sheet
        const col = spriteIndex % spriteConfig.columnsPerSheet;
        const row = Math.floor(spriteIndex / spriteConfig.columnsPerSheet) % spriteConfig.rowsPerSheet;

        const x = col * spriteConfig.thumbnailWidth;
        const y = row * spriteConfig.thumbnailHeight;

        // Draw thumbnail to sprite sheet
        ctx.drawImage(thumbnail, x, y);
        thumbnail.close();

        // Add sprite metadata
        currentSprites.push({
          timeUs: targetTimeUs,
          x,
          y,
          width: spriteConfig.thumbnailWidth,
          height: spriteConfig.thumbnailHeight,
        });

        spriteIndex++;

        // Send progress update
        postResponse({
          type: 'PROGRESS',
          payload: {
            generated: i + 1,
            total: timestamps.length,
          },
        });

        // Check if sheet is full
        if (spriteIndex % spriteConfig.spritesPerSheet === 0) {
          // Send completed sheet
          const bitmap = sheetCanvas.transferToImageBitmap();
          postResponse({
            type: 'SPRITE_SHEET_READY',
            payload: {
              sheetId: `sheet-${sheetIndex}`,
              bitmap,
              startTimeUs: sheetStartTimeUs,
              endTimeUs: targetTimeUs,
              sprites: currentSprites,
            },
          });

          // Reset for next sheet
          sheetIndex++;
          sheetStartTimeUs = timestamps[i + 1] ?? targetTimeUs;
          currentSprites = [];

          // Create new canvas for next sheet
          sheetCanvas = new OffscreenCanvas(spriteConfig.sheetWidth, spriteConfig.sheetHeight);
          ctx = sheetCanvas.getContext('2d')!;
          ctx.fillStyle = COLORS.SPRITE_BACKGROUND;
          ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);
        }
      } finally {
        frame.close();
      }
    }

    // Send final partial sheet if any sprites remaining
    if (currentSprites.length > 0 && !state.generationAborted) {
      const finalTimeUs = timestamps[timestamps.length - 1] ?? sheetStartTimeUs;
      const bitmap = sheetCanvas.transferToImageBitmap();
      postResponse({
        type: 'SPRITE_SHEET_READY',
        payload: {
          sheetId: `sheet-${sheetIndex}`,
          bitmap,
          startTimeUs: sheetStartTimeUs,
          endTimeUs: finalTimeUs,
          sprites: currentSprites,
        },
      });
    }

    if (!state.generationAborted) {
      // Track this range as generated for progressive loading
      addGeneratedRange(startTimeUs, endTimeUs);
      postResponse({ type: 'GENERATION_COMPLETE' });
    }
  } catch (error) {
    postResponse({
      type: 'ERROR',
      payload: { message: error instanceof Error ? error.message : 'Unknown error' },
    });
  } finally {
    state.isGenerating = false;
    // Clean up decoder
    if (state.decoder && state.decoder.state !== 'closed') {
      await state.decoder.flush().catch(() => {});
    }
  }
}

// ============================================================================
// DECODER MANAGEMENT
// ============================================================================

async function initDecoder(): Promise<void> {
  // Close existing decoder
  if (state.decoder && state.decoder.state !== 'closed') {
    state.decoder.close();
  }

  // Clear pending frame state
  if (pendingFrame) {
    pendingFrame.close();
    pendingFrame = null;
  }

  // Clear any collected frames
  for (const frame of collectedFrames) {
    frame.close();
  }
  collectedFrames = [];

  // Reset decoder state tracking
  state.decoderNeedsReset = false;

  return new Promise((resolve) => {
    state.decoder = new VideoDecoder({
      output: (frame) => {
        // Push frames to collection for batch decoding
        collectedFrames.push(frame);
      },
      error: (e) => {
        logger.error('Decoder error:', e);
      },
    });

    state.decoder.configure({
      codec: state.codec,
      codedWidth: state.videoWidth,
      codedHeight: state.videoHeight,
      description: state.codecDescription ?? undefined,
      // Optimize for latency: minimize decode queue depth for faster frame output
      optimizeForLatency: true,
    });

    resolve();
  });
}

// Frame storage for async decode
let pendingFrame: VideoFrame | null = null;

// Collected frames during batch decode
let collectedFrames: VideoFrame[] = [];

/**
 * Decode the exact frame at a target time.
 *
 * OPTIMIZATION: Reuses decoder without reset() when possible.
 * After flush(), decoder requires a keyframe, so we always start from keyframe,
 * but we avoid the expensive reset()+configure() cycle when the decoder is healthy.
 */
async function decodeFrameAtTime(targetTimeUs: number): Promise<VideoFrame | null> {
  if (!state.decoder || state.decoder.state !== 'configured') {
    return null;
  }

  const targetSeconds = targetTimeUs / MICROSECONDS_PER_SECOND;

  // Find sample at or after target time
  let targetSampleIndex = state.samples.findIndex((sample) => {
    const sampleTime = sample.cts / sample.timescale;
    return sampleTime >= targetSeconds;
  });

  if (targetSampleIndex === -1) {
    targetSampleIndex = state.samples.length - 1;
  }

  // Find previous keyframe for this target
  const keyframeIndex = findPreviousKeyframe(targetSampleIndex);

  // Clear any pending frames from previous decode
  for (const frame of collectedFrames) {
    frame.close();
  }
  collectedFrames = [];

  // Only reset if decoder is in a bad state (error occurred previously)
  // After flush(), we must start from keyframe anyway, but don't need full reset
  if (state.decoderNeedsReset) {
    state.decoder.reset();
    state.decoder.configure({
      codec: state.codec,
      codedWidth: state.videoWidth,
      codedHeight: state.videoHeight,
      description: state.codecDescription ?? undefined,
      optimizeForLatency: true,
    });
    state.decoderNeedsReset = false;
  }

  // Always start from keyframe (required after flush)
  const startIndex = keyframeIndex;

  try {
    // Check if generation was aborted before starting
    if (state.generationAborted) {
      return null;
    }

    // Queue samples from keyframe to target
    for (let i = startIndex; i <= targetSampleIndex; i++) {
      // Check abort state during long loops
      if (state.generationAborted) {
        return null;
      }

      const sample = state.samples[i];
      if (!sample) continue;

      // Check decoder is still valid before decode
      if (!state.decoder || state.decoder.state !== 'configured') {
        return null;
      }

      const isKeyframe = state.keyframeIndices.includes(i);

      const chunk = new EncodedVideoChunk({
        type: isKeyframe ? 'key' : 'delta',
        timestamp: (sample.cts * MICROSECONDS_PER_SECOND) / sample.timescale,
        duration: (sample.duration * MICROSECONDS_PER_SECOND) / sample.timescale,
        data: sample.data,
      });

      state.decoder.decode(chunk);
    }

    // Check decoder is still valid before flush
    if (!state.decoder || state.decoder.state !== 'configured' || state.generationAborted) {
      return null;
    }

    // Flush to process all queued chunks
    await state.decoder.flush();

    // Return the last frame (closest to target time)
    if (collectedFrames.length > 0) {
      // Close all intermediate frames, keep only the last one
      const lastFrame = collectedFrames[collectedFrames.length - 1];
      if (!lastFrame) {
        collectedFrames = [];
        return null;
      }
      for (let i = 0; i < collectedFrames.length - 1; i++) {
        collectedFrames[i]?.close();
      }
      collectedFrames = [];
      return lastFrame;
    }

    return null;
  } catch (e) {
    // AbortError is expected during reset/close - not a real error
    const isAbortError = e instanceof Error && e.name === 'AbortError';
    if (!isAbortError) {
      logger.error('Decode error:', e);
    }
    // Mark decoder as needing reset on next call
    state.decoderNeedsReset = true;
    // Clean up any collected frames on error
    for (const frame of collectedFrames) {
      frame.close();
    }
    collectedFrames = [];
    return null;
  }
}

// ============================================================================
// RANGE TRACKING UTILITIES
// ============================================================================

/**
 * Check if a range is fully covered by generated ranges.
 */
function isRangeFullyGenerated(startUs: number, endUs: number): boolean {
  // Sort ranges by start time
  const sortedRanges = [...state.generatedRanges].sort((a, b) => a.start - b.start);

  let currentPos = startUs;

  for (const range of sortedRanges) {
    // If there's a gap before this range, the requested range is not fully covered
    if (range.start > currentPos) {
      return false;
    }

    // Extend current position if this range covers it
    if (range.end > currentPos) {
      currentPos = range.end;
    }

    // If we've covered the entire requested range, we're done
    if (currentPos >= endUs) {
      return true;
    }
  }

  return currentPos >= endUs;
}

/**
 * Add a generated range and merge overlapping ranges.
 */
function addGeneratedRange(startUs: number, endUs: number): void {
  state.generatedRanges.push({ start: startUs, end: endUs });
  mergeOverlappingRanges();
}

/**
 * Merge overlapping ranges to keep the list efficient.
 */
function mergeOverlappingRanges(): void {
  if (state.generatedRanges.length <= 1) return;

  // Sort by start time
  state.generatedRanges.sort((a, b) => a.start - b.start);

  const merged: GeneratedRange[] = [];
  let current = state.generatedRanges[0];

  if (!current) return;

  for (let i = 1; i < state.generatedRanges.length; i++) {
    const next = state.generatedRanges[i];
    if (!next) continue;

    // If ranges overlap or are adjacent, merge them
    if (current.end >= next.start) {
      current.end = Math.max(current.end, next.end);
    } else {
      merged.push(current);
      current = next;
    }
  }

  merged.push(current);
  state.generatedRanges = merged;
}

// ============================================================================
// KEYFRAME UTILITIES
// ============================================================================

// Wrapper for shared keyframe search utility
function findPreviousKeyframe(targetSampleIndex: number): number {
  return findPreviousKeyframeUtil(state.keyframeIndices, targetSampleIndex);
}
