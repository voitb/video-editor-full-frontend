/**
 * useEditorHelpers Hook
 * Provides helper functions for exporting data from the editor.
 */

import { useCallback } from 'react';
import type { Composition } from '../../../core/Composition';
import type { ExportSourceData } from '../../../workers/messages/exportMessages';

export interface UseEditorHelpersParams {
  composition: Composition;
  getSourceBuffer: (sourceId: string) => ArrayBuffer | null;
}

export interface EditorHelpers {
  getTracksJSON: () => ReturnType<typeof import('../../../core/Track').Track.prototype.toJSON>[];
  getSourceData: () => Promise<ExportSourceData[]>;
}

export function useEditorHelpers({
  composition,
  getSourceBuffer,
}: UseEditorHelpersParams): EditorHelpers {
  // Get tracks JSON for export
  const getTracksJSON = useCallback(() => {
    return composition.tracks.map(track => track.toJSON());
  }, [composition]);

  // Get source data for export
  const getSourceData = useCallback(async (): Promise<ExportSourceData[]> => {
    const sourcesData: ExportSourceData[] = [];

    for (const source of composition.sources.values()) {
      const buffer = getSourceBuffer(source.id);
      if (!buffer) continue;

      sourcesData.push({
        sourceId: source.id,
        buffer: buffer.slice(0),
        durationUs: source.durationUs,
        width: source.width,
        height: source.height,
        hasVideo: true,
        hasAudio: source.hasAudio,
      });
    }

    return sourcesData;
  }, [composition, getSourceBuffer]);

  return { getTracksJSON, getSourceData };
}
