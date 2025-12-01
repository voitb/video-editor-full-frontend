// ============================================================================
// HLS TRANSMUX WORKER
// ============================================================================
// Web Worker that transmuxes MPEG-TS segments to fMP4 using mux.js.
// The output is a single MP4 buffer compatible with mp4box.js for demuxing.

import muxjs from 'mux.js';
import type { HlsTransmuxCommand, HlsTransmuxResponse } from './hlsTypes';
import { createWorkerLogger } from '../utils/logger';

const logger = createWorkerLogger('HlsTransmuxWorker');

// Send response to main thread
function postResponse(response: HlsTransmuxResponse): void {
  self.postMessage(response);
}

// Track abort state
let isAborted = false;

// Handle incoming messages
self.onmessage = async (e: MessageEvent<HlsTransmuxCommand>) => {
  const { type } = e.data;

  switch (type) {
    case 'TRANSMUX': {
      const { segments } = e.data.payload;
      isAborted = false;
      await transmuxSegments(segments);
      break;
    }

    case 'ABORT': {
      isAborted = true;
      break;
    }
  }
};

/**
 * Transmux MPEG-TS segments to a single fMP4 buffer
 */
async function transmuxSegments(segments: ArrayBuffer[]): Promise<void> {
  if (segments.length === 0) {
    postResponse({ type: 'ERROR', payload: { message: 'No segments provided' } });
    return;
  }

  logger.log(`Starting transmux of ${segments.length} segments`);

  try {
    // Create transmuxer with remux option to combine audio+video
    const transmuxer = new muxjs.mp4.Transmuxer({
      keepOriginalTimestamps: false,
      remux: true,
    });

    // Collect output chunks
    let initSegment: Uint8Array | null = null;
    const dataChunks: Uint8Array[] = [];
    let totalDuration = 0;

    // Handle transmuxed data
    transmuxer.on('data', (segment: { initSegment?: Uint8Array; data: Uint8Array; type?: string }) => {
      // Capture init segment (ftyp + moov boxes) on first data event
      if (!initSegment && segment.initSegment) {
        initSegment = new Uint8Array(segment.initSegment);
        logger.log('Captured init segment:', initSegment.byteLength, 'bytes');
      }
      // Collect data segment (moof + mdat boxes)
      if (segment.data) {
        dataChunks.push(new Uint8Array(segment.data));
      }
    });

    // Process each TS segment
    for (let i = 0; i < segments.length; i++) {
      if (isAborted) {
        postResponse({ type: 'ERROR', payload: { message: 'Transmux aborted' } });
        return;
      }

      const segmentBuffer = segments[i];
      if (!segmentBuffer) continue;

      // Push segment data to transmuxer
      transmuxer.push(new Uint8Array(segmentBuffer));

      // Report progress
      postResponse({
        type: 'PROGRESS',
        payload: { processed: i + 1, total: segments.length },
      });

      // Yield to event loop periodically to avoid blocking
      if (i % 5 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Flush remaining data
    transmuxer.flush();

    // Check if we got valid output
    if (!initSegment) {
      postResponse({
        type: 'ERROR',
        payload: { message: 'Transmux failed: No init segment generated. The source may not contain valid H.264/AAC data.' },
      });
      return;
    }

    if (dataChunks.length === 0) {
      postResponse({
        type: 'ERROR',
        payload: { message: 'Transmux failed: No data segments generated' },
      });
      return;
    }

    // TypeScript: at this point initSegment is guaranteed to be Uint8Array
    const initSegmentData: Uint8Array = initSegment;

    // Calculate total output size
    const totalDataSize = dataChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    const totalSize = initSegmentData.byteLength + totalDataSize;

    logger.log(`Transmux complete: ${initSegmentData.byteLength} init + ${totalDataSize} data = ${totalSize} bytes`);

    // Concatenate into single MP4 buffer
    const mp4Buffer = new ArrayBuffer(totalSize);
    const mp4View = new Uint8Array(mp4Buffer);

    // Copy init segment first
    mp4View.set(initSegmentData, 0);

    // Copy data chunks sequentially
    let offset = initSegmentData.byteLength;
    for (const chunk of dataChunks) {
      mp4View.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // Transfer buffer to main thread (zero-copy)
    postResponse({
      type: 'COMPLETE',
      payload: { mp4Buffer, duration: totalDuration },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown transmux error';
    logger.error('Transmux error:', error);
    postResponse({ type: 'ERROR', payload: { message } });
  }
}
