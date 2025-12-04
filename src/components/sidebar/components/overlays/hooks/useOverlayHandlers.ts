/**
 * useOverlayHandlers Hook
 * Handlers for adding, updating content, position, and style of overlays.
 */

import { useCallback } from 'react';
import type { Track } from '../../../../../core/Track';
import type { OverlayClip } from '../../../../../core/OverlayClip';
import type { OverlayPosition, OverlayStyle, OverlayContentType } from '../../../../../core/types';

export interface SelectedOverlayClip {
  clip: OverlayClip;
  track: Track;
}

export interface UseOverlayHandlersOptions {
  selectedOverlay: SelectedOverlayClip | null;
  firstOverlayTrack: Track | undefined;
  currentTimeUs: number;
  onOverlayClipUpdate?: (clipId: string, clip: OverlayClip) => void;
  onAddOverlayClip?: (trackId: string, clip: OverlayClip) => void;
  onRefresh?: () => void;
}

export function useOverlayHandlers(options: UseOverlayHandlersOptions) {
  const {
    selectedOverlay,
    firstOverlayTrack,
    currentTimeUs,
    onOverlayClipUpdate,
    onAddOverlayClip,
    onRefresh,
  } = options;

  const handleAddOverlay = useCallback(async () => {
    if (!firstOverlayTrack || !onAddOverlayClip) return;

    const { OverlayClip } = await import('../../../../../core/OverlayClip');
    const newClip = OverlayClip.createText(currentTimeUs, 'New Overlay');
    onAddOverlayClip(firstOverlayTrack.id, newClip);
    onRefresh?.();
  }, [firstOverlayTrack, currentTimeUs, onAddOverlayClip, onRefresh]);

  const handleContentUpdate = useCallback(
    (content: string) => {
      if (!selectedOverlay) return;
      const { clip } = selectedOverlay;
      clip.setContent(content);
      onOverlayClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedOverlay, onOverlayClipUpdate, onRefresh]
  );

  const handleContentTypeChange = useCallback(
    (contentType: OverlayContentType) => {
      if (!selectedOverlay) return;
      const { clip } = selectedOverlay;
      clip.contentType = contentType;
      onOverlayClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedOverlay, onOverlayClipUpdate, onRefresh]
  );

  const handlePositionUpdate = useCallback(
    (position: Partial<OverlayPosition>) => {
      if (!selectedOverlay) return;
      const { clip } = selectedOverlay;
      clip.setPosition(position);
      onOverlayClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedOverlay, onOverlayClipUpdate, onRefresh]
  );

  const handleStyleUpdate = useCallback(
    (updates: Partial<OverlayStyle>) => {
      if (!selectedOverlay) return;
      const { clip } = selectedOverlay;
      clip.style = { ...clip.style, ...updates };
      onOverlayClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedOverlay, onOverlayClipUpdate, onRefresh]
  );

  return {
    handleAddOverlay,
    handleContentUpdate,
    handleContentTypeChange,
    handlePositionUpdate,
    handleStyleUpdate,
  };
}
