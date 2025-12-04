/**
 * Timecode Utilities
 * Formatting functions for timecodes and display times.
 */

import { TIME } from '../../constants';

/**
 * Convert microseconds to SRT timecode
 * Format: HH:MM:SS,mmm
 */
export function toSrtTimecode(us: number): string {
  const totalMs = Math.floor(us / TIME.US_PER_MS);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Convert microseconds to WebVTT timecode
 * Format: HH:MM:SS.mmm
 */
export function toVttTimecode(us: number): string {
  const totalMs = Math.floor(us / TIME.US_PER_MS);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Strip HTML-like formatting tags from text
 */
export function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
}

/**
 * Format microseconds as display time (MM:SS.ms)
 */
export function formatTime(us: number): string {
  const totalMs = Math.floor(us / TIME.US_PER_MS);
  const ms = Math.floor((totalMs % 1000) / 10); // Just show centiseconds
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
