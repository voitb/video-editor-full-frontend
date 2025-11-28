/**
 * Binary search utility for finding keyframes in video samples.
 *
 * This is used by both VideoWorker and SpriteWorker to find the nearest
 * keyframe at or before a target sample index for seeking operations.
 */

export interface SampleInfo {
  is_sync?: boolean;
}

/**
 * Binary search to find the keyframe at or before the target sample index.
 * Returns the index in samples[] (not in keyframeIndices[]).
 *
 * @param keyframeIndices - Array of sample indices that are keyframes
 * @param targetSampleIndex - The sample index to search for
 * @param samples - Optional array of samples to validate sync frames
 * @returns The sample index of the keyframe at or before targetSampleIndex
 */
export function findPreviousKeyframe(
  keyframeIndices: number[],
  targetSampleIndex: number,
  samples?: SampleInfo[]
): number {
  const firstKeyframe = keyframeIndices[0];

  // No keyframes available
  if (firstKeyframe === undefined || keyframeIndices.length === 0) {
    return 0;
  }

  // Validate target is within reasonable bounds
  if (targetSampleIndex < 0) {
    return firstKeyframe;
  }

  // Binary search for largest keyframe index <= targetSampleIndex
  let left = 0;
  let right = keyframeIndices.length - 1;

  while (left < right) {
    const mid = Math.ceil((left + right) / 2);
    const midValue = keyframeIndices[mid];
    if (midValue !== undefined && midValue <= targetSampleIndex) {
      left = mid;
    } else {
      right = mid - 1;
    }
  }

  const leftValue = keyframeIndices[left];
  const result = leftValue !== undefined && leftValue <= targetSampleIndex ? leftValue : 0;

  // Validate result is actually a keyframe (if samples provided)
  if (samples && !samples[result]?.is_sync) {
    return firstKeyframe;
  }

  return result;
}
