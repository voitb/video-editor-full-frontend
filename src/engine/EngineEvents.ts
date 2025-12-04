/**
 * Engine Events
 * Event emitter for engine state changes and notifications.
 */

import type { EngineEvent, EngineEventCallback } from './types';
import { createLogger } from '../utils/logger';

const logger = createLogger('EngineEvents');

/**
 * Simple event emitter for engine events.
 */
export class EngineEventEmitter {
  private listeners: Set<EngineEventCallback> = new Set();

  /**
   * Subscribe to engine events.
   * @returns Unsubscribe function
   */
  on(callback: EngineEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Emit an event to all listeners.
   */
  emit(event: EngineEvent): void {
    for (const callback of this.listeners) {
      try {
        callback(event);
      } catch (err) {
        logger.error('Event listener error', { error: err });
      }
    }
  }

  /**
   * Remove all listeners.
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Get the number of listeners.
   */
  get listenerCount(): number {
    return this.listeners.size;
  }
}
