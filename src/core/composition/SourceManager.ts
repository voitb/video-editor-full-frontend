/**
 * Source Manager
 * Handles source registration and lookup.
 */

import { Source } from '../Source';
import { Track, isMediaClip } from '../Track';
import { Clip } from '../Clip';

/**
 * Register a source in the sources map
 */
export function registerSource(sources: Map<string, Source>, source: Source): void {
  sources.set(source.id, source);
}

/**
 * Unregister a source from the sources map
 */
export function unregisterSource(sources: Map<string, Source>, sourceId: string): boolean {
  return sources.delete(sourceId);
}

/**
 * Get a source by ID
 */
export function getSource(sources: Map<string, Source>, sourceId: string): Source | undefined {
  return sources.get(sourceId);
}

/**
 * Check if a source is used by any clip in the tracks
 */
export function isSourceInUse(tracks: Track[], sourceId: string): boolean {
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (isMediaClip(clip) && clip.sourceId === sourceId) return true;
    }
  }
  return false;
}

/**
 * Get all clips that use a source
 */
export function getClipsForSource(tracks: Track[], sourceId: string): Clip[] {
  const clips: Clip[] = [];
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (isMediaClip(clip) && clip.sourceId === sourceId) {
        clips.push(clip);
      }
    }
  }
  return clips;
}
