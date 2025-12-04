/// <reference lib="webworker" />
/**
 * Video Editor V2 - Transmux Worker
 * Converts MPEG-TS segments to fMP4 using mux.js
 */

import muxjs from 'mux.js';
import type {
  TransmuxWorkerCommand,
  TransmuxWorkerEvent,
  InitSegmentEvent,
  MediaSegmentEvent,
  TransmuxProgressEvent,
  TransmuxCompleteEvent,
  TransmuxErrorEvent,
} from './messages/transmuxMessages';

// Worker context
const ctx = self as unknown as DedicatedWorkerGlobalScope;

// State
let transmuxer: muxjs.mp4.Transmuxer | null = null;
let isAborted = false;
let initSegmentSent = false;
let totalSegments = 0;
let processedSegments = 0;

/**
 * Post a response to the main thread
 */
function postResponse(event: TransmuxWorkerEvent, transfer?: Transferable[]): void {
  ctx.postMessage(event, { transfer: transfer ?? [] });
}

/**
 * Dispose of transmuxer resources
 */
function disposeTransmuxer(): void {
  if (!transmuxer) return;
  const disposable = transmuxer as unknown as { dispose?: () => void };
  disposable.dispose?.();
  transmuxer = null;
}

/**
 * Reset worker state
 */
function reset(): void {
  disposeTransmuxer();
  isAborted = false;
  initSegmentSent = false;
  totalSegments = 0;
  processedSegments = 0;
}

/**
 * Initialize the transmuxer
 */
function initTransmuxer(): void {
  reset();

  transmuxer = new muxjs.mp4.Transmuxer({
    keepOriginalTimestamps: false,
    remux: true,
  });

  transmuxer.on('data', (segment: { initSegment?: Uint8Array; data: Uint8Array }) => {
    if (isAborted) return;

    // Send init segment once
    if (!initSegmentSent && segment.initSegment) {
      initSegmentSent = true;
      const initCopy = new Uint8Array(segment.initSegment);
      const event: InitSegmentEvent = {
        type: 'INIT_SEGMENT',
        data: initCopy.buffer,
      };
      postResponse(event, [initCopy.buffer]);
    }

    // Send media segment
    if (segment.data && segment.data.byteLength > 0) {
      const dataCopy = new Uint8Array(segment.data);
      const event: MediaSegmentEvent = {
        type: 'MEDIA_SEGMENT',
        data: dataCopy.buffer,
        index: processedSegments,
      };
      postResponse(event, [dataCopy.buffer]);
    }
  });
}

/**
 * Handle incoming commands
 */
ctx.onmessage = (e: MessageEvent<TransmuxWorkerCommand>) => {
  const command = e.data;

  switch (command.type) {
    case 'START_TRANSMUX': {
      initTransmuxer();
      break;
    }

    case 'PUSH_SEGMENT': {
      if (isAborted || !transmuxer) {
        if (!transmuxer) {
          const error: TransmuxErrorEvent = {
            type: 'TRANSMUX_ERROR',
            message: 'Transmuxer not initialized',
          };
          postResponse(error);
        }
        return;
      }

      try {
        const { segment, index, isLast } = command;
        totalSegments = Math.max(totalSegments, index + 1);

        // Push segment data
        transmuxer.push(new Uint8Array(segment));
        transmuxer.flush();

        processedSegments = index + 1;

        // Send progress
        const progress: TransmuxProgressEvent = {
          type: 'TRANSMUX_PROGRESS',
          processed: processedSegments,
          total: totalSegments,
        };
        postResponse(progress);

        // Complete on last segment
        if (isLast) {
          transmuxer.flush();
          disposeTransmuxer();

          const complete: TransmuxCompleteEvent = {
            type: 'TRANSMUX_COMPLETE',
            totalSegments: processedSegments,
          };
          postResponse(complete);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown transmux error';
        const error: TransmuxErrorEvent = {
          type: 'TRANSMUX_ERROR',
          message,
        };
        postResponse(error);
      }
      break;
    }

    case 'ABORT': {
      isAborted = true;
      reset();
      break;
    }
  }
};
