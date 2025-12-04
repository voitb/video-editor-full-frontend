/**
 * Video Editor V2 - TransmuxWorker Message Types
 * Strongly-typed messages for HlsLoaderWorker <-> TransmuxWorker communication.
 */

// ============================================================================
// COMMANDS (HlsLoaderWorker -> TransmuxWorker)
// ============================================================================

/** Initialize transmuxer */
export interface StartTransmuxCommand {
  type: 'START_TRANSMUX';
}

/** Push a TS segment for transmuxing */
export interface PushSegmentCommand {
  type: 'PUSH_SEGMENT';
  segment: ArrayBuffer;
  index: number;
  isLast: boolean;
}

/** Abort transmuxing */
export interface AbortTransmuxCommand {
  type: 'ABORT';
}

/** All possible commands */
export type TransmuxWorkerCommand =
  | StartTransmuxCommand
  | PushSegmentCommand
  | AbortTransmuxCommand;

// ============================================================================
// EVENTS (TransmuxWorker -> HlsLoaderWorker)
// ============================================================================

/** fMP4 init segment ready */
export interface InitSegmentEvent {
  type: 'INIT_SEGMENT';
  data: ArrayBuffer;
  /** Video width from track info (0 if unknown) */
  width?: number;
  /** Video height from track info (0 if unknown) */
  height?: number;
}

/** fMP4 media segment ready */
export interface MediaSegmentEvent {
  type: 'MEDIA_SEGMENT';
  data: ArrayBuffer;
  index: number;
}

/** Progress update */
export interface TransmuxProgressEvent {
  type: 'TRANSMUX_PROGRESS';
  processed: number;
  total: number;
}

/** Transmuxing complete */
export interface TransmuxCompleteEvent {
  type: 'TRANSMUX_COMPLETE';
  totalSegments: number;
}

/** Error occurred */
export interface TransmuxErrorEvent {
  type: 'TRANSMUX_ERROR';
  message: string;
}

/** All possible events */
export type TransmuxWorkerEvent =
  | InitSegmentEvent
  | MediaSegmentEvent
  | TransmuxProgressEvent
  | TransmuxCompleteEvent
  | TransmuxErrorEvent;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isTransmuxWorkerEvent(msg: unknown): msg is TransmuxWorkerEvent {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    typeof (msg as { type: unknown }).type === 'string'
  );
}
