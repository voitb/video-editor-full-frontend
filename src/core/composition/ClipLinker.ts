/**
 * Clip Linker
 * Manages bidirectional clip linking and linked operations.
 */

import { Track } from '../Track';
import { Clip } from '../Clip';
import { getClip } from './ClipQuery';

/**
 * Get the linked clip for a given clip
 */
export function getLinkedClip(
  tracks: Track[],
  clipId: string
): { clip: Clip; track: Track } | undefined {
  const result = getClip(tracks, clipId);
  if (!result || !result.clip.linkedClipId) return undefined;
  return getClip(tracks, result.clip.linkedClipId);
}

/**
 * Link two clips bidirectionally
 */
export function linkClips(tracks: Track[], clipId1: string, clipId2: string): boolean {
  const result1 = getClip(tracks, clipId1);
  const result2 = getClip(tracks, clipId2);
  if (!result1 || !result2) return false;

  result1.clip.linkedClipId = clipId2;
  result2.clip.linkedClipId = clipId1;
  return true;
}

/**
 * Unlink a clip (removes link in both directions)
 */
export function unlinkClip(tracks: Track[], clipId: string): boolean {
  const result = getClip(tracks, clipId);
  if (!result || !result.clip.linkedClipId) return false;

  const linkedResult = getClip(tracks, result.clip.linkedClipId);
  if (linkedResult) {
    linkedResult.clip.linkedClipId = undefined;
  }
  result.clip.linkedClipId = undefined;
  return true;
}

/**
 * Move a clip along with its linked clip
 */
export function moveClipWithLinked(
  tracks: Track[],
  clipId: string,
  newStartUs: number
): boolean {
  const result = getClip(tracks, clipId);
  if (!result) return false;

  const oldStartUs = result.clip.startUs;
  const delta = newStartUs - oldStartUs;

  // Move the primary clip
  result.clip.moveTo(newStartUs);

  // Move the linked clip by the same delta
  if (result.clip.linkedClipId) {
    const linkedResult = getClip(tracks, result.clip.linkedClipId);
    if (linkedResult) {
      linkedResult.clip.moveTo(linkedResult.clip.startUs + delta);
    }
  }

  return true;
}

/**
 * Trim clip start (left edge) along with its linked clip
 */
export function trimStartWithLinked(
  tracks: Track[],
  clipId: string,
  newStartUs: number,
  getSourceDuration: (sourceId: string) => number
): boolean {
  const result = getClip(tracks, clipId);
  if (!result) return false;

  const sourceDuration = getSourceDuration(result.clip.sourceId);

  // Calculate the delta before trimming
  const oldStartUs = result.clip.startUs;
  const delta = newStartUs - oldStartUs;

  // Trim the primary clip
  result.clip.trimStart(newStartUs, sourceDuration);

  // Trim the linked clip by the same amount
  if (result.clip.linkedClipId) {
    const linkedResult = getClip(tracks, result.clip.linkedClipId);
    if (linkedResult) {
      const linkedSourceDuration = getSourceDuration(linkedResult.clip.sourceId);
      const linkedNewStart = linkedResult.clip.startUs + delta;
      linkedResult.clip.trimStart(linkedNewStart, linkedSourceDuration);
    }
  }

  return true;
}

/**
 * Trim clip end (right edge) along with its linked clip
 */
export function trimEndWithLinked(
  tracks: Track[],
  clipId: string,
  newEndUs: number,
  getSourceDuration: (sourceId: string) => number
): boolean {
  const result = getClip(tracks, clipId);
  if (!result) return false;

  const sourceDuration = getSourceDuration(result.clip.sourceId);

  // Calculate the delta before trimming
  const oldEndUs = result.clip.endUs;
  const delta = newEndUs - oldEndUs;

  // Trim the primary clip
  result.clip.trimEnd(newEndUs, sourceDuration);

  // Trim the linked clip by the same amount
  if (result.clip.linkedClipId) {
    const linkedResult = getClip(tracks, result.clip.linkedClipId);
    if (linkedResult) {
      const linkedSourceDuration = getSourceDuration(linkedResult.clip.sourceId);
      const linkedNewEnd = linkedResult.clip.endUs + delta;
      linkedResult.clip.trimEnd(linkedNewEnd, linkedSourceDuration);
    }
  }

  return true;
}
