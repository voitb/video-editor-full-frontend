/**
 * Frame Buffer
 * Manages the queue of decoded video frames for playback.
 */

import type { DecodedFrame } from './types';
import { PLAYBACK } from '../../constants';

/**
 * Frame buffer for managing decoded video frames.
 * Maintains a queue of frames with automatic cleanup of old frames.
 */
export class FrameBuffer {
  private queue: DecodedFrame[] = [];
  private readonly maxSize: number;
  private readonly maxLagUs: number;

  constructor(maxSize = PLAYBACK.MAX_QUEUE_SIZE, maxLagUs = PLAYBACK.MAX_FRAME_LAG_US) {
    this.maxSize = maxSize;
    this.maxLagUs = maxLagUs;
  }

  /**
   * Add a frame to the queue.
   * Automatically removes oldest frames if queue exceeds max size.
   */
  push(frame: VideoFrame, timestampUs: number): void {
    this.queue.push({ frame, timestampUs });

    // Limit queue size
    while (this.queue.length > this.maxSize) {
      const oldest = this.queue.shift();
      oldest?.frame.close();
    }
  }

  /**
   * Get the best frame for a target time.
   * Finds the closest frame at or before the target time.
   * Falls back to nearest frame if no suitable frame exists.
   *
   * @param targetTimeUs - Target timestamp in microseconds
   * @returns Cloned VideoFrame or null if queue is empty
   */
  getFrameAtTime(targetTimeUs: number): VideoFrame | null {
    if (this.queue.length === 0) return null;

    let bestIdx = -1;
    let bestDiff = Infinity;
    let fallbackIdx = -1;
    let fallbackDiff = Infinity;

    for (let i = 0; i < this.queue.length; i++) {
      const entry = this.queue[i]!;
      const diff = targetTimeUs - entry.timestampUs;

      // Frame is before target time and closer than previous best
      if (diff >= 0 && diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }

      // Track closest frame in either direction as a fallback
      const absDiff = Math.abs(diff);
      if (absDiff < fallbackDiff) {
        fallbackDiff = absDiff;
        fallbackIdx = i;
      }
    }

    // Use fallback if no frame at/before target
    if (bestIdx < 0) {
      bestIdx = fallbackIdx;
    }

    if (bestIdx < 0) return null;

    const entry = this.queue[bestIdx]!;

    // Drop old frames that are too far behind
    this.pruneOldFrames(entry.timestampUs);

    // Clone the frame (original stays in queue for potential re-use)
    return entry.frame.clone();
  }

  /**
   * Get frame info for a target time without cloning.
   * Useful for checking if a frame is available.
   */
  peekFrameAtTime(targetTimeUs: number): DecodedFrame | null {
    if (this.queue.length === 0) return null;

    let bestIdx = -1;
    let bestDiff = Infinity;

    for (let i = 0; i < this.queue.length; i++) {
      const entry = this.queue[i]!;
      const diff = targetTimeUs - entry.timestampUs;

      if (diff >= 0 && diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }

    return bestIdx >= 0 ? this.queue[bestIdx]! : null;
  }

  /**
   * Get the first frame in the queue.
   */
  getFirstFrame(): VideoFrame | null {
    return this.queue[0]?.frame.clone() ?? null;
  }

  /**
   * Clear all frames from the queue.
   */
  clear(): void {
    for (const { frame } of this.queue) {
      frame.close();
    }
    this.queue = [];
  }

  /**
   * Get the number of frames in the queue.
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Get all timestamps in the queue (for debugging).
   */
  getTimestamps(): number[] {
    return this.queue.map(entry => entry.timestampUs);
  }

  /**
   * Check if the queue has any frames.
   */
  hasFrames(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Remove frames that are too far behind a reference timestamp.
   */
  private pruneOldFrames(referenceTimeUs: number): void {
    const cutoffTime = referenceTimeUs - this.maxLagUs;

    while (this.queue.length > 0 && this.queue[0]!.timestampUs < cutoffTime) {
      const old = this.queue.shift();
      old?.frame.close();
    }
  }
}
