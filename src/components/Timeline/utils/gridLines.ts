/**
 * Timeline Grid Line Utilities
 * Functions for calculating grid lines and time steps.
 */

import type { GridLine } from '../types';

/**
 * Calculate appropriate time step for markers based on visible duration.
 */
export function getTimeStep(visibleDurationUs: number): number {
  const targetMarkers = 10;
  const roughStep = visibleDurationUs / targetMarkers;

  // Standard intervals in microseconds
  const intervals = [
    100_000,      // 0.1s
    250_000,      // 0.25s
    500_000,      // 0.5s
    1_000_000,    // 1s
    2_000_000,    // 2s
    5_000_000,    // 5s
    10_000_000,   // 10s
    30_000_000,   // 30s
    60_000_000,   // 1min
    300_000_000,  // 5min
  ];

  // Find the smallest interval that's larger than the rough step
  for (const interval of intervals) {
    if (interval >= roughStep) {
      return interval;
    }
  }

  return intervals[intervals.length - 1] ?? 60_000_000;
}

/**
 * Generate hierarchical grid lines for professional NLE appearance.
 */
export function getGridLines(
  visibleDurationUs: number,
  startTimeUs: number,
  endTimeUs: number
): GridLine[] {
  // Determine intervals based on visible duration
  let majorInterval: number;
  let minorInterval: number;
  let subMinorInterval: number | null = null;

  if (visibleDurationUs > 300_000_000) {
    // > 5 min: major at 1min, minor at 10s
    majorInterval = 60_000_000;
    minorInterval = 10_000_000;
  } else if (visibleDurationUs > 60_000_000) {
    // 1-5 min: major at 10s, minor at 1s
    majorInterval = 10_000_000;
    minorInterval = 1_000_000;
  } else if (visibleDurationUs > 10_000_000) {
    // 10s-1min: major at 5s, minor at 1s, sub-minor at 0.5s
    majorInterval = 5_000_000;
    minorInterval = 1_000_000;
    subMinorInterval = 500_000;
  } else if (visibleDurationUs > 2_000_000) {
    // 2-10s: major at 1s, minor at 0.5s, sub-minor at 0.1s
    majorInterval = 1_000_000;
    minorInterval = 500_000;
    subMinorInterval = 100_000;
  } else {
    // < 2s: major at 0.5s, minor at 0.1s, sub-minor at ~1 frame (33ms)
    majorInterval = 500_000;
    minorInterval = 100_000;
    subMinorInterval = 33_333;
  }

  // Use Map to deduplicate and prioritize (major > minor > sub-minor)
  const lineMap = new Map<number, 'major' | 'minor' | 'sub-minor'>();

  // Add sub-minor first (lowest priority)
  if (subMinorInterval) {
    const subStart = Math.floor(startTimeUs / subMinorInterval) * subMinorInterval;
    for (let t = subStart; t <= endTimeUs; t += subMinorInterval) {
      if (t >= 0) lineMap.set(t, 'sub-minor');
    }
  }

  // Minor overrides sub-minor
  const minorStart = Math.floor(startTimeUs / minorInterval) * minorInterval;
  for (let t = minorStart; t <= endTimeUs; t += minorInterval) {
    if (t >= 0) lineMap.set(t, 'minor');
  }

  // Major overrides all
  const majorStart = Math.floor(startTimeUs / majorInterval) * majorInterval;
  for (let t = majorStart; t <= endTimeUs; t += majorInterval) {
    if (t >= 0) lineMap.set(t, 'major');
  }

  return Array.from(lineMap.entries())
    .map(([timeUs, type]) => ({ timeUs, type }))
    .sort((a, b) => a.timeUs - b.timeUs);
}
