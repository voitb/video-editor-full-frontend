/**
 * Video Editor V2 - Source Base Class
 * Abstract base for media sources (HLS, File, etc.)
 */

import type { SourceState, SourceType, SourceEvent, SourceEventCallback, SourceRefJSON } from './types';
import { createSourceId } from '../utils/id';

export abstract class Source {
  readonly id: string;
  abstract readonly type: SourceType;

  /** Current loading state */
  protected _state: SourceState = 'idle';

  /** Duration in microseconds */
  protected _durationUs: number = 0;

  /** Video width (0 for audio-only) */
  protected _width: number = 0;

  /** Video height (0 for audio-only) */
  protected _height: number = 0;

  /** Error message if state is 'error' */
  protected _error: string | null = null;

  /** Event listeners */
  private listeners: Map<string, Set<SourceEventCallback>> = new Map();

  constructor(id?: string) {
    this.id = id ?? createSourceId();
  }

  // ============================================================================
  // PUBLIC GETTERS
  // ============================================================================

  get state(): SourceState {
    return this._state;
  }

  get durationUs(): number {
    return this._durationUs;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  get error(): string | null {
    return this._error;
  }

  get isReady(): boolean {
    return this._state === 'ready';
  }

  get isPlayable(): boolean {
    return this._state === 'playable' || this._state === 'ready';
  }

  get isLoading(): boolean {
    return this._state === 'loading';
  }

  get hasError(): boolean {
    return this._state === 'error';
  }

  // ============================================================================
  // ABSTRACT METHODS
  // ============================================================================

  /**
   * Start loading the source
   */
  abstract load(): Promise<void>;

  /**
   * Dispose of resources
   */
  abstract dispose(): void;

  /**
   * Get the raw buffer (for transfer to worker)
   * May return null if source is streaming or not fully loaded
   */
  abstract getBuffer(): ArrayBuffer | null;

  // ============================================================================
  // EVENT SYSTEM
  // ============================================================================

  /**
   * Subscribe to source events
   */
  on(callback: SourceEventCallback): () => void {
    const key = 'all';
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(key)?.delete(callback);
    };
  }

  /**
   * Emit an event to all listeners
   */
  protected emit(event: SourceEvent): void {
    const callbacks = this.listeners.get('all');
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(event);
        } catch (e) {
          console.error('Error in source event callback:', e);
        }
      }
    }
  }

  /**
   * Set state and emit change event
   */
  protected setState(state: SourceState): void {
    if (this._state !== state) {
      this._state = state;
      this.emit({ type: 'stateChange', state });
    }
  }

  /**
   * Set error state
   */
  protected setError(message: string): void {
    this._error = message;
    this._state = 'error';
    this.emit({ type: 'error', message });
    this.emit({ type: 'stateChange', state: 'error' });
  }

  /**
   * Emit progress event
   */
  protected emitProgress(loaded: number, total: number): void {
    this.emit({ type: 'progress', loaded, total });
  }

  /**
   * Emit chunk event (for streaming sources)
   */
  protected emitChunk(chunk: ArrayBuffer, isLast: boolean): void {
    this.emit({ type: 'chunk', chunk, isLast });
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Get reference data for serialization
   */
  toRefJSON(): SourceRefJSON {
    return {
      id: this.id,
      type: this.type,
      durationUs: this._durationUs,
      width: this._width,
      height: this._height,
    };
  }
}
