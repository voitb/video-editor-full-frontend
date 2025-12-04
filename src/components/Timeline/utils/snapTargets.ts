/**
 * Snap target calculation utilities for Timeline
 */

import type { SnapTarget, SnapResult } from '../types';
import type { Track } from '../../../core/Track';

/**
 * Calculate all snap targets from tracks and playhead
 */
export function calculateSnapTargets(tracks: Track[], currentTimeUs: number): SnapTarget[] {
  const targets: SnapTarget[] = [
    { timeUs: 0, type: 'timeline-start' },
    { timeUs: currentTimeUs, type: 'playhead' },
  ];

  for (const track of tracks) {
    for (const clip of track.clips) {
      targets.push({ timeUs: clip.startUs, type: 'clip-start', clipId: clip.id });
      targets.push({ timeUs: clip.endUs, type: 'clip-end', clipId: clip.id });
    }
  }

  return targets;
}

/**
 * Apply snapping to a proposed clip position
 */
export function applySnapToPosition(
  proposedStartUs: number,
  clipDurationUs: number,
  snapTargets: SnapTarget[],
  snapThresholdUs: number,
  excludeClipId?: string
): SnapResult {
  const clipEndUs = proposedStartUs + clipDurationUs;
  let bestSnap: SnapTarget | null = null;
  let bestDelta = Infinity;
  let snappedStartUs = proposedStartUs;

  const filteredTargets = snapTargets.filter(target => {
    if (!excludeClipId) return true;
    return target.clipId !== excludeClipId;
  });

  for (const target of filteredTargets) {
    // Check snap to clip start
    const deltaStart = Math.abs(proposedStartUs - target.timeUs);
    if (deltaStart < snapThresholdUs && deltaStart < bestDelta) {
      bestDelta = deltaStart;
      bestSnap = target;
      snappedStartUs = target.timeUs;
    }

    // Check snap to clip end
    const deltaEnd = Math.abs(clipEndUs - target.timeUs);
    if (deltaEnd < snapThresholdUs && deltaEnd < bestDelta) {
      bestDelta = deltaEnd;
      bestSnap = target;
      snappedStartUs = target.timeUs - clipDurationUs;
    }
  }

  return { snappedTimeUs: Math.max(0, snappedStartUs), snappedTo: bestSnap };
}
