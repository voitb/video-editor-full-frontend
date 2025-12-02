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
 * Uses frame-based format (HH:MM:SS:FF) like DaVinci Resolve / Premiere Pro
 * @param us - Time in microseconds
 * @param visibleDurationUs - Currently visible duration (determines precision)
 * @param frameRate - Frame rate for frame number calculation (default 30)
 */
export function formatTimecodeAdaptive(
  us: number,
  visibleDurationUs: number,
  frameRate: number = 30
): string {
  const totalSeconds = usToSeconds(us);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * frameRate);

  const pad2 = (n: number) => n.toString().padStart(2, '0');

  // > 5 min visible: HH:MM:SS or MM:SS
  if (visibleDurationUs > 300_000_000) {
    if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
    return `${minutes}:${pad2(seconds)}`;
  }

  // 1-5 min visible: MM:SS
  if (visibleDurationUs > 60_000_000) {
    return `${minutes}:${pad2(seconds)}`;
  }

  // 10s-1min visible: MM:SS:FF (with frames)
  if (visibleDurationUs > 10_000_000) {
    return `${minutes}:${pad2(seconds)}:${pad2(frames)}`;
  }

  // 2-10s visible: SS:FF (seconds and frames)
  if (visibleDurationUs > 2_000_000) {
    return `${seconds}:${pad2(frames)}`;
  }

  // < 2s visible: :FF (frame number only with leading colon)
  return `:${pad2(frames)}`;
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
