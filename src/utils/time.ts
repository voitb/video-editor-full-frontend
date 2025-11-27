// Convert seconds to formatted time string (MM:SS.ms)
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
}

// Convert microseconds to seconds
export function usToSeconds(us: number): number {
  return us / 1_000_000;
}

// Convert seconds to microseconds
export function secondsToUs(seconds: number): number {
  return seconds * 1_000_000;
}

// Debounce function for seek operations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
