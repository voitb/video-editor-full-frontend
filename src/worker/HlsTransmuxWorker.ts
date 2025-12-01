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
function postResponse(response: HlsTransmuxResponse, transfer?: Transferable[]): void {
  (self as any).postMessage(response, transfer ?? []);
}

let transmuxer: muxjs.mp4.Transmuxer | null = null;
let isAborted = false;
let initSegmentSent = false;
let markNextSegmentAsLast = false;

function disposeTransmuxer(): void {
  if (!transmuxer) return;
  const disposable = transmuxer as unknown as { dispose?: () => void };
  disposable.dispose?.();
  transmuxer = null;
}

// Handle incoming messages
self.onmessage = async (e: MessageEvent<HlsTransmuxCommand>) => {
  const { type } = e.data;

  switch (type) {
    case 'START_STREAM': {
      startTransmuxer();
      break;
    }

    case 'PUSH_SEGMENT': {
      const { segment, index, total, isLast } = e.data.payload;
      if (isAborted) return;
      if (!transmuxer) {
        postResponse({ type: 'ERROR', payload: { message: 'Transmuxer not initialized' } });
        return;
      }

      try {
        if (isLast) {
          markNextSegmentAsLast = true;
        }

        transmuxer.push(new Uint8Array(segment));
        transmuxer.flush();

        postResponse({ type: 'PROGRESS', payload: { processed: index, total } });

        if (isLast) {
          transmuxer.flush();
          disposeTransmuxer();
          postResponse({ type: 'COMPLETE' });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown transmux error';
        logger.error('Transmux push error:', error);
        postResponse({ type: 'ERROR', payload: { message } });
      }
      break;
    }

    case 'ABORT': {
      isAborted = true;
      disposeTransmuxer();
      markNextSegmentAsLast = false;
      break;
    }
  }
};

function startTransmuxer(): void {
  isAborted = false;
  initSegmentSent = false;
  markNextSegmentAsLast = false;
  transmuxer = new muxjs.mp4.Transmuxer({
    keepOriginalTimestamps: false,
    remux: true,
  });
  logger.log('Starting streaming transmuxer session');

  transmuxer.on('data', (segment: { initSegment?: Uint8Array; data: Uint8Array }) => {
    if (isAborted) return;

    if (!initSegmentSent && segment.initSegment) {
      initSegmentSent = true;
      const initCopy = new Uint8Array(segment.initSegment);
      postResponse(
        { type: 'INIT_SEGMENT', payload: { segment: initCopy.buffer } },
        [initCopy.buffer]
      );
    }

    if (segment.data && segment.data.byteLength > 0) {
      const dataCopy = new Uint8Array(segment.data);
      const isLast = markNextSegmentAsLast;
      if (isLast) {
        markNextSegmentAsLast = false;
      }
      postResponse(
        { type: 'MEDIA_SEGMENT', payload: { segment: dataCopy.buffer, isLast } },
        [dataCopy.buffer]
      );
    }
  });
}
