/**
 * Progress Reporter
 * Handles sending progress and error events from the export worker.
 */

import type { ExportWorkerEvent } from '../messages/exportMessages';
import type { ExportPhase } from '../../core/types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/**
 * Post an event to the main thread.
 */
export function postResponse(event: ExportWorkerEvent, transfer?: Transferable[]): void {
  ctx.postMessage(event, { transfer: transfer ?? [] });
}

/**
 * Post a progress update.
 */
export function postProgress(
  currentFrame: number,
  totalFrames: number,
  phase: ExportPhase,
  estimatedTimeRemainingMs?: number
): void {
  const percent = Math.round((currentFrame / totalFrames) * 100);
  postResponse({
    type: 'EXPORT_PROGRESS',
    currentFrame,
    totalFrames,
    percent,
    phase,
    estimatedTimeRemainingMs,
  });
}

/**
 * Post an error event.
 */
export function postError(message: string, phase: ExportPhase, details?: string): void {
  postResponse({
    type: 'EXPORT_ERROR',
    message,
    phase,
    details,
  });
}

/**
 * Post a cancellation event.
 */
export function postCancelled(): void {
  postResponse({ type: 'EXPORT_CANCELLED' });
}

/**
 * Post a completion event.
 */
export function postComplete(mp4Data: ArrayBuffer, durationMs: number): void {
  postResponse(
    {
      type: 'EXPORT_COMPLETE',
      mp4Data,
      durationMs,
      fileSizeBytes: mp4Data.byteLength,
    },
    [mp4Data]
  );
}

/**
 * Post the worker ready event.
 */
export function postReady(): void {
  postResponse({ type: 'EXPORT_WORKER_READY' });
}
