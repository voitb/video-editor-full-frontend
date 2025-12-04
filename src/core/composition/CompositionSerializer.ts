/**
 * Composition Serializer
 * Handles JSON serialization and deserialization.
 */

import type { CompositionJSON, CompositionConfig } from '../types';
import { Track } from '../Track';
import { Source } from '../Source';

/**
 * Serialize composition to JSON
 */
export function toJSON(
  id: string,
  config: CompositionConfig,
  tracks: Track[],
  sources: Map<string, Source>,
  fixedDurationUs: number | null
): CompositionJSON {
  return {
    id,
    config: {
      ...config,
      fixedDurationUs: fixedDurationUs ?? undefined,
    },
    tracks: tracks.map(t => t.toJSON()),
    sources: Array.from(sources.values()).map(s => s.toRefJSON()),
  };
}

/**
 * Restore tracks from JSON
 * Note: Sources must be re-loaded separately
 */
export function tracksFromJSON(json: CompositionJSON): Track[] {
  return json.tracks.map(trackJson => Track.fromJSON(trackJson));
}
