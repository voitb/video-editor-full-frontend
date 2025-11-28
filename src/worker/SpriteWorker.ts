import {
  SPRITE_CONFIG,
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
      // Future: prioritize visible range for progressive loading
      // For now, with eager loading and short videos, this is a no-op
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

  if (state.isGenerating) {
    // Abort current generation
    state.generationAborted = true;
    // Wait a tick for current generation to clean up
    await new Promise((r) => setTimeout(r, 0));
  }

  state.isGenerating = true;
  state.generationAborted = false;

  try {
    // Calculate timestamps for thumbnails
    const timestamps: number[] = [];
    for (let t = startTimeUs; t <= endTimeUs; t += intervalUs) {
      timestamps.push(t);
    }

    if (timestamps.length === 0) {
      postResponse({ type: 'GENERATION_COMPLETE' });
      return;
    }

    // Initialize decoder
    await initDecoder();
    if (!state.decoder || state.decoder.state !== 'configured') {
      postResponse({ type: 'ERROR', payload: { message: 'Failed to configure decoder' } });
      return;
    }

    // Create sprite sheet canvas
    let sheetCanvas = new OffscreenCanvas(SPRITE_CONFIG.sheetWidth, SPRITE_CONFIG.sheetHeight);
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
          resizeWidth: SPRITE_CONFIG.thumbnailWidth,
          resizeHeight: SPRITE_CONFIG.thumbnailHeight,
          resizeQuality: 'medium',
        });

        // Calculate position in sprite sheet
        const col = spriteIndex % SPRITE_CONFIG.columnsPerSheet;
        const row = Math.floor(spriteIndex / SPRITE_CONFIG.columnsPerSheet) % SPRITE_CONFIG.rowsPerSheet;

        const x = col * SPRITE_CONFIG.thumbnailWidth;
        const y = row * SPRITE_CONFIG.thumbnailHeight;

        // Draw thumbnail to sprite sheet
        ctx.drawImage(thumbnail, x, y);
        thumbnail.close();

        // Add sprite metadata
        currentSprites.push({
          timeUs: targetTimeUs,
          x,
          y,
          width: SPRITE_CONFIG.thumbnailWidth,
          height: SPRITE_CONFIG.thumbnailHeight,
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
        if (spriteIndex % SPRITE_CONFIG.spritesPerSheet === 0) {
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
          sheetCanvas = new OffscreenCanvas(SPRITE_CONFIG.sheetWidth, SPRITE_CONFIG.sheetHeight);
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
    });

    resolve();
  });
}

// Frame storage for async decode
let pendingFrame: VideoFrame | null = null;

// Collected frames during batch decode
let collectedFrames: VideoFrame[] = [];

/**
 * Decode the exact frame at a target time by decoding from the previous keyframe
 * through all delta frames up to the target.
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

  // Find previous keyframe
  const keyframeIndex = findPreviousKeyframe(targetSampleIndex);

  // Clear any pending frames
  for (const frame of collectedFrames) {
    frame.close();
  }
  collectedFrames = [];

  // Reset decoder to clear any previous state, then reconfigure
  // Note: At this point decoder.state is 'configured' (checked above)
  state.decoder.reset();
  state.decoder.configure({
    codec: state.codec,
    codedWidth: state.videoWidth,
    codedHeight: state.videoHeight,
    description: state.codecDescription ?? undefined,
  });

  try {
    // Queue all samples from keyframe to target (without flushing between)
    for (let i = keyframeIndex; i <= targetSampleIndex; i++) {
      const sample = state.samples[i];
      if (!sample) continue;

      const isKeyframe = state.keyframeIndices.includes(i);

      const chunk = new EncodedVideoChunk({
        type: isKeyframe ? 'key' : 'delta',
        timestamp: (sample.cts * MICROSECONDS_PER_SECOND) / sample.timescale,
        duration: (sample.duration * MICROSECONDS_PER_SECOND) / sample.timescale,
        data: sample.data,
      });

      state.decoder.decode(chunk);
    }

    // Now flush to process all queued chunks
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
    logger.error('Decode error:', e);
    // Clean up any collected frames on error
    for (const frame of collectedFrames) {
      frame.close();
    }
    collectedFrames = [];
    return null;
  }
}

// ============================================================================
// KEYFRAME UTILITIES
// ============================================================================

// Wrapper for shared keyframe search utility
function findPreviousKeyframe(targetSampleIndex: number): number {
  return findPreviousKeyframeUtil(state.keyframeIndices, targetSampleIndex);
}
