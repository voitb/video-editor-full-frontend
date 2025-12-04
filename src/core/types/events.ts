/**
 * Video Editor - Event Type Definitions
 * Types for source events and callbacks.
 */

import type { SourceState } from './base';

/** Source events */
export type SourceEvent =
  | { type: 'stateChange'; state: SourceState }
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'chunk'; chunk: ArrayBuffer; isLast: boolean }
  | { type: 'error'; message: string };

/** Source event callback */
export type SourceEventCallback = (event: SourceEvent) => void;
