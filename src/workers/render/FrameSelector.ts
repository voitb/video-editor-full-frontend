/**
 * Frame Selector
 * Binary search algorithms for finding samples and keyframes in video tracks.
 */

import type { MP4Sample } from 'mp4box';
import { TIME } from '../../constants';

/**
 * Find the sample index at or after a given timestamp using binary search.
 *
 * @param samples - Array of MP4 samples
 * @param timeUs - Target time in microseconds
 * @returns Sample index, or -1 if no samples available
 */
export function findSampleAtTime(samples: MP4Sample[], timeUs: number): number {
  if (samples.length === 0) return -1;

  let low = 0;
  let high = samples.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const sample = samples[mid]!;
    const sampleTime = (sample.cts / sample.timescale) * TIME.US_PER_SECOND;

    if (sampleTime < timeUs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

/**
 * Find the keyframe index at or before a given sample index using binary search.
 *
 * @param keyframeIndices - Array of keyframe sample indices (sorted ascending)
 * @param sampleIdx - Target sample index
 * @returns Keyframe sample index
 */
export function findKeyframeBefore(keyframeIndices: number[], sampleIdx: number): number {
  if (keyframeIndices.length === 0) return 0;

  let low = 0;
  let high = keyframeIndices.length - 1;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (keyframeIndices[mid]! > sampleIdx) {
      high = mid - 1;
    } else {
      low = mid;
    }
  }

  return keyframeIndices[low] ?? 0;
}

/**
 * Convert sample timestamp to microseconds.
 *
 * @param sample - MP4 sample
 * @returns Timestamp in microseconds
 */
export function sampleToUs(sample: MP4Sample): number {
  return Math.round((sample.cts / sample.timescale) * TIME.US_PER_SECOND);
}

/**
 * Convert sample duration to microseconds.
 *
 * @param sample - MP4 sample
 * @returns Duration in microseconds
 */
export function sampleDurationToUs(sample: MP4Sample): number {
  return Math.round((sample.duration / sample.timescale) * TIME.US_PER_SECOND);
}
