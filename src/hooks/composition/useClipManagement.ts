/**
 * useClipManagement Hook
 * Clip CRUD operations for composition.
 */

import { useCallback } from 'react';
import type { Composition } from '../../core/Composition';
import type { Track } from '../../core/Track';
import { Clip } from '../../core/Clip';
import type { ClipConfig } from '../../core/types';

export interface UseClipManagementOptions {
  composition: Composition;
  refresh: () => void;
}

export function useClipManagement(options: UseClipManagementOptions) {
  const { composition, refresh } = options;

  const addClip = useCallback(
    (trackId: string, config: ClipConfig): Clip | undefined => {
      const clip = composition.addClipToTrack(trackId, config);
      if (clip) refresh();
      return clip;
    },
    [composition, refresh]
  );

  const addVideoClipWithAudio = useCallback(
    (
      videoTrackId: string,
      config: ClipConfig,
      audioTrackId?: string
    ): { videoClip: Clip | undefined; audioClip: Clip | undefined } => {
      // Add video clip
      const videoClip = composition.addClipToTrack(videoTrackId, config);
      if (!videoClip) {
        return { videoClip: undefined, audioClip: undefined };
      }

      // Check if source has audio
      const source = composition.getSource(config.sourceId);
      if (!source?.hasAudio) {
        refresh();
        return { videoClip, audioClip: undefined };
      }

      // Find or create audio track
      let audioTrack: Track | undefined;
      if (audioTrackId) {
        audioTrack = composition.getTrack(audioTrackId);
      } else {
        // Use first audio track or create one
        audioTrack = composition.audioTracks[0];
        if (!audioTrack) {
          audioTrack = composition.createTrack({ type: 'audio', label: 'Audio 1' });
        }
      }

      if (!audioTrack) {
        refresh();
        return { videoClip, audioClip: undefined };
      }

      // Create linked audio clip with same timing
      const audioClip = audioTrack.createClip({
        ...config,
        label: config.label ? `${config.label} (Audio)` : 'Audio',
        linkedClipId: videoClip.id,
      });

      // Link video clip back to audio clip
      videoClip.linkedClipId = audioClip.id;

      refresh();
      return { videoClip, audioClip };
    },
    [composition, refresh]
  );

  const removeClip = useCallback(
    (clipId: string): boolean => {
      const result = composition.removeClip(clipId);
      if (result) refresh();
      return result;
    },
    [composition, refresh]
  );

  const getClip = useCallback(
    (clipId: string): { clip: Clip; track: Track } | undefined => {
      return composition.getClip(clipId);
    },
    [composition]
  );

  const updateClip = useCallback(
    (clipId: string, updates: Partial<ClipConfig>): boolean => {
      const found = composition.getClip(clipId);
      if (!found) return false;

      const { clip } = found;

      if (updates.startUs !== undefined) clip.startUs = updates.startUs;
      if (updates.trimIn !== undefined) clip.trimIn = updates.trimIn;
      if (updates.trimOut !== undefined) clip.trimOut = updates.trimOut;
      if (updates.opacity !== undefined) clip.opacity = updates.opacity;
      if (updates.volume !== undefined) clip.volume = updates.volume;
      if (updates.label !== undefined) clip.label = updates.label;

      refresh();
      return true;
    },
    [composition, refresh]
  );

  const unlinkClip = useCallback(
    (clipId: string): boolean => {
      const result = composition.unlinkClip(clipId);
      if (result) refresh();
      return result;
    },
    [composition, refresh]
  );

  return {
    addClip,
    addVideoClipWithAudio,
    removeClip,
    getClip,
    updateClip,
    unlinkClip,
  };
}
