import {
  SPRITE_CONFIG,
  type SpriteWorkerCommand,
  type SpriteWorkerResponse,
  type TransferableSample,
  type SpriteMetadata,
} from './spriteTypes';

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
      if (state.samples.length === 0) break;

      // Calculate total duration from samples
      const lastSample = state.samples[state.samples.length - 1];
      const totalDurationUs = (lastSample.cts * 1_000_000) / lastSample.timescale;

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

    // Find keyframes for each timestamp
    const keyframesToDecode = findKeyframesForTimestamps(timestamps);

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
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);

    let currentSprites: SpriteMetadata[] = [];
    let spriteIndex = 0;
    let sheetStartTimeUs = timestamps[0];
    let sheetIndex = 0;

    // Decode keyframes and generate thumbnails
    for (let i = 0; i < keyframesToDecode.length; i++) {
      if (state.generationAborted) break;

      const keyframeIndex = keyframesToDecode[i];
      const targetTimeUs = timestamps[i];

      // Decode the keyframe
      const frame = await decodeKeyframe(keyframeIndex);
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
            total: keyframesToDecode.length,
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
          ctx.fillStyle = '#1f2937';
          ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);
        }
      } finally {
        frame.close();
      }
    }

    // Send final partial sheet if any sprites remaining
    if (currentSprites.length > 0 && !state.generationAborted) {
      const bitmap = sheetCanvas.transferToImageBitmap();
      postResponse({
        type: 'SPRITE_SHEET_READY',
        payload: {
          sheetId: `sheet-${sheetIndex}`,
          bitmap,
          startTimeUs: sheetStartTimeUs,
          endTimeUs: timestamps[timestamps.length - 1],
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
  frameResolve = null;

  return new Promise((resolve) => {
    state.decoder = new VideoDecoder({
      output: handleDecodedFrame,
      error: (e) => {
        console.error('[SpriteWorker] Decoder error:', e);
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
let frameResolve: ((frame: VideoFrame | null) => void) | null = null;

function handleDecodedFrame(frame: VideoFrame): void {
  if (frameResolve) {
    frameResolve(frame);
    frameResolve = null;
  } else {
    pendingFrame = frame;
  }
}

async function decodeKeyframe(sampleIndex: number): Promise<VideoFrame | null> {
  if (!state.decoder || state.decoder.state !== 'configured') {
    return null;
  }

  const sample = state.samples[sampleIndex];
  if (!sample) return null;

  // Clear any pending frame
  if (pendingFrame) {
    pendingFrame.close();
    pendingFrame = null;
  }

  return new Promise((resolve) => {
    frameResolve = resolve;

    const chunk = new EncodedVideoChunk({
      type: 'key', // Keyframes only
      timestamp: (sample.cts * 1_000_000) / sample.timescale,
      duration: (sample.duration * 1_000_000) / sample.timescale,
      data: sample.data,
    });

    try {
      state.decoder!.decode(chunk);
      state.decoder!.flush().then(() => {
        // If we have a pending frame, return it
        if (pendingFrame) {
          const frame = pendingFrame;
          pendingFrame = null;
          if (frameResolve) {
            frameResolve(frame);
            frameResolve = null;
          }
        } else if (frameResolve) {
          // No frame received
          frameResolve(null);
          frameResolve = null;
        }
      });
    } catch (e) {
      console.error('[SpriteWorker] Decode error:', e);
      if (frameResolve) {
        frameResolve(null);
        frameResolve = null;
      }
    }
  });
}

// ============================================================================
// KEYFRAME UTILITIES
// ============================================================================

function findKeyframesForTimestamps(timestamps: number[]): number[] {
  const keyframes: number[] = [];

  for (const targetUs of timestamps) {
    const targetSeconds = targetUs / 1_000_000;

    // Find sample at or after target time
    let sampleIndex = state.samples.findIndex((sample) => {
      const sampleTime = sample.cts / sample.timescale;
      return sampleTime >= targetSeconds;
    });

    if (sampleIndex === -1) {
      sampleIndex = state.samples.length - 1;
    }

    // Find previous keyframe using binary search
    const keyframeIndex = findPreviousKeyframe(sampleIndex);
    keyframes.push(keyframeIndex);
  }

  return keyframes;
}

function findPreviousKeyframe(targetSampleIndex: number): number {
  if (state.keyframeIndices.length === 0) return 0;

  // Binary search for largest keyframe index <= targetSampleIndex
  let left = 0;
  let right = state.keyframeIndices.length - 1;

  while (left < right) {
    const mid = Math.ceil((left + right) / 2);
    if (state.keyframeIndices[mid] <= targetSampleIndex) {
      left = mid;
    } else {
      right = mid - 1;
    }
  }

  return state.keyframeIndices[left] <= targetSampleIndex ? state.keyframeIndices[left] : 0;
}
