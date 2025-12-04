/**
 * useTrackManagement Hook
 * Track CRUD operations for composition.
 */

import { useCallback } from 'react';
import type { Composition } from '../../core/Composition';
import type { Track } from '../../core/Track';
import type { TrackConfig } from '../../core/types';

export interface UseTrackManagementOptions {
  composition: Composition;
  refresh: () => void;
}

export function useTrackManagement(options: UseTrackManagementOptions) {
  const { composition, refresh } = options;

  const createTrack = useCallback(
    (config: TrackConfig): Track => {
      const track = composition.createTrack(config);
      refresh();
      return track;
    },
    [composition, refresh]
  );

  const removeTrack = useCallback(
    (trackId: string): boolean => {
      const result = composition.removeTrack(trackId);
      if (result) refresh();
      return result;
    },
    [composition, refresh]
  );

  const getTrack = useCallback(
    (trackId: string): Track | undefined => {
      return composition.getTrack(trackId);
    },
    [composition]
  );

  return {
    createTrack,
    removeTrack,
    getTrack,
  };
}
