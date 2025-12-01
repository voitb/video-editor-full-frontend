import { TIME } from '../constants';

const { MICROSECONDS_PER_SECOND } = TIME;

// Convert seconds to formatted time string (MM:SS.ms)
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
}

// Convert microseconds to compact time string (M:SS)
export function formatTimeCompact(timeUs: number): string {
  const secs = usToSeconds(timeUs);
  const mins = Math.floor(secs / 60);
  const remainingSecs = Math.floor(secs % 60);
  return `${mins}:${String(remainingSecs).padStart(2, '0')}`;
}

// Convert microseconds to seconds
export function usToSeconds(us: number): number {
  return us / MICROSECONDS_PER_SECOND;
}

// Convert seconds to microseconds
export function secondsToUs(seconds: number): number {
  return seconds * MICROSECONDS_PER_SECOND;
}
