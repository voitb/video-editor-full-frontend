/**
 * Worker Bridge
 * Abstraction for communicating with the RenderWorker.
 */

import type { RenderWorkerCommand, RenderWorkerEvent } from '../../workers/messages/renderMessages';
import { createLogger } from '../../utils/logger';

const logger = createLogger('WorkerBridge');

export type WorkerMessageHandler = (event: RenderWorkerEvent) => void;
export type WorkerErrorHandler = (error: string) => void;

/**
 * Bridge for RenderWorker communication.
 * Handles worker lifecycle and message passing.
 */
export class WorkerBridge {
  private worker: Worker | null = null;
  private messageHandler: WorkerMessageHandler | null = null;
  private errorHandler: WorkerErrorHandler | null = null;

  /**
   * Initialize the worker with an offscreen canvas.
   */
  initialize(canvas: OffscreenCanvas): void {
    this.worker = new Worker(
      new URL('../../workers/render/RenderWorker.ts', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = (e: MessageEvent<RenderWorkerEvent>) => {
      this.messageHandler?.(e.data);
    };

    this.worker.onerror = (err) => {
      const errorMessage = err.message || (err as unknown as { error?: Error })?.error?.message || 'Unknown worker error';
      logger.error('Worker error', { error: errorMessage, filename: err.filename, lineno: err.lineno });
      this.errorHandler?.(`Worker error: ${errorMessage}`);
    };

    const cmd: RenderWorkerCommand = {
      type: 'INIT_CANVAS',
      canvas,
    };
    this.worker.postMessage(cmd, [canvas]);
  }

  /**
   * Set the handler for worker messages.
   */
  setMessageHandler(handler: WorkerMessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Set the handler for worker errors.
   */
  setErrorHandler(handler: WorkerErrorHandler): void {
    this.errorHandler = handler;
  }

  /**
   * Send a command to the worker.
   */
  postCommand(cmd: RenderWorkerCommand, transfer?: Transferable[]): void {
    if (!this.worker) return;
    if (transfer) {
      this.worker.postMessage(cmd, transfer);
    } else {
      this.worker.postMessage(cmd);
    }
  }

  /**
   * Check if the worker is initialized.
   */
  get isInitialized(): boolean {
    return this.worker !== null;
  }

  /**
   * Terminate the worker.
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.messageHandler = null;
    this.errorHandler = null;
  }
}
