/**
 * Engine Types
 * Type definitions for the video engine.
 */

import type { Composition } from '../core/Composition';

/**
 * Engine playback state
 */
export type EngineState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

/**
 * Engine initialization options
 */
export interface EngineOptions {
  /** Canvas element for video preview */
  canvas: HTMLCanvasElement;
  /** Composition to render */
  composition: Composition;
}

/**
 * Engine events
 */
export type EngineEvent =
  | { type: 'stateChange'; state: EngineState }
  | { type: 'timeUpdate'; currentTimeUs: number }
  | { type: 'durationChange'; durationUs: number }
  | { type: 'sourceLoading'; sourceId: string; progress: number }
  | { type: 'sourceReady'; sourceId: string }
  | { type: 'sourcePlayable'; sourceId: string }
  | { type: 'sourceError'; sourceId: string; message: string }
  | { type: 'error'; message: string };

/**
 * Callback type for engine events
 */
export type EngineEventCallback = (event: EngineEvent) => void;

/**
 * Audio buffer with timestamp
 */
export interface TimestampedAudioBuffer {
  buffer: AudioBuffer;
  timestampUs: number;
}
