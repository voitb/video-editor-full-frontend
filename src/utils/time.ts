/**
 * Video Editor V2 - Time Utilities
 * Conversion functions for time units with microsecond precision.
 */

import { TIME } from '../constants';

/**
 * Convert seconds to microseconds
 */
export function secondsToUs(seconds: number): number {
  return Math.round(seconds * TIME.US_PER_SECOND);
}

/**
 * Convert microseconds to seconds
 */
export function usToSeconds(us: number): number {
  return us / TIME.US_PER_SECOND;
}

/**
 * Convert milliseconds to microseconds
 */
export function msToUs(ms: number): number {
  return Math.round(ms * TIME.US_PER_MS);
}

/**
 * Convert microseconds to milliseconds
 */
export function usToMs(us: number): number {
  return us / TIME.US_PER_MS;
}

/**
 * Format microseconds as timecode string (HH:MM:SS.mmm)
 */
export function formatTimecode(us: number): string {
  const totalSeconds = usToSeconds(us);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds % 1) * 1000);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Format microseconds as short timecode (MM:SS)
 */
export function formatTimecodeShort(us: number): string {
  const totalSeconds = usToSeconds(us);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format time adaptively based on visible duration (professional NLE style)
 * Uses milliseconds format for fine precision when zoomed in
 * @param us - Time in microseconds
 * @param visibleDurationUs - Currently visible duration (determines precision)
 */
export function formatTimecodeAdaptive(us: number, visibleDurationUs: number): string {
  const totalSeconds = usToSeconds(us);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds % 1) * 1000);

  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const pad3 = (n: number) => n.toString().padStart(3, '0');

  // > 5 min visible: HH:MM:SS or MM:SS
  if (visibleDurationUs > 300_000_000) {
    if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
    return `${minutes}:${pad2(seconds)}`;
  }

  // 1-5 min visible: MM:SS
  if (visibleDurationUs > 60_000_000) {
    return `${minutes}:${pad2(seconds)}`;
  }

  // 10s-1min visible: MM:SS.m (1 decimal for tenths)
  if (visibleDurationUs > 10_000_000) {
    const tenths = Math.floor((totalSeconds % 1) * 10);
    return `${minutes}:${pad2(seconds)}.${tenths}`;
  }

  // 2-10s visible: SS.mm (2 decimals for hundredths)
  if (visibleDurationUs > 2_000_000) {
    const hundredths = Math.floor((totalSeconds % 1) * 100);
    return `${seconds}.${hundredths.toString().padStart(2, '0')}`;
  }

  // < 2s visible: SS.mmm (full milliseconds)
  return `${seconds}.${pad3(milliseconds)}`;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Clamp a time value to valid range
 */
export function clampTime(timeUs: number, minUs: number, maxUs: number): number {
  return clamp(timeUs, minUs, maxUs);
}

/**
 * Check if two time ranges overlap
 */
export function rangesOverlap(
  start1Us: number,
  end1Us: number,
  start2Us: number,
  end2Us: number
): boolean {
  return start1Us < end2Us && end1Us > start2Us;
}

/**
 * Get the overlap between two time ranges (returns 0 if no overlap)
 */
export function getOverlap(
  start1Us: number,
  end1Us: number,
  start2Us: number,
  end2Us: number
): number {
  const overlapStart = Math.max(start1Us, start2Us);
  const overlapEnd = Math.min(end1Us, end2Us);
  return Math.max(0, overlapEnd - overlapStart);
}

/**
 * Convert frame number to microseconds at given frame rate
 */
export function frameToUs(frame: number, frameRate: number): number {
  return Math.round((frame / frameRate) * TIME.US_PER_SECOND);
}

/**
 * Convert microseconds to frame number at given frame rate
 */
export function usToFrame(us: number, frameRate: number): number {
  return Math.floor((us / TIME.US_PER_SECOND) * frameRate);
}

/**
 * Snap microseconds to nearest frame boundary
 */
export function snapToFrame(us: number, frameRate: number): number {
  const frame = Math.round((us / TIME.US_PER_SECOND) * frameRate);
  return frameToUs(frame, frameRate);
}
