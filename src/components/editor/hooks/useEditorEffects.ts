/**
 * useEditorEffects Hook
 * Manages initialization effects, volume sync, and container sizing for the editor.
 */

import { useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { VideoPreviewHandle } from '../../VideoPreview';
import type { Composition } from '../../../core/Composition';

export interface UseEditorEffectsParams {
  previewRef: RefObject<VideoPreviewHandle | null>;
  previewContainerRef: RefObject<HTMLDivElement | null>;
  composition: Composition;
  volume: number;
  initialize: (canvas: HTMLCanvasElement) => void;
  setMasterVolume: (volume: number) => void;
  refresh: () => void;
  setActualContainerSize: Dispatch<SetStateAction<{ width: number; height: number }>>;
}

export function useEditorEffects({
  previewRef,
  previewContainerRef,
  composition,
  volume,
  initialize,
  setMasterVolume,
  refresh,
  setActualContainerSize,
}: UseEditorEffectsParams): void {
  // Initialize engine when canvas is ready
  useEffect(() => {
    const canvas = previewRef.current?.getCanvas();
    if (canvas) {
      initialize(canvas);
    }
  }, [initialize, previewRef]);

  // Create default tracks on mount
  useEffect(() => {
    if (composition.tracks.length === 0) {
      composition.createTrack({ type: 'video', label: 'Video 1' });
      composition.createTrack({ type: 'audio', label: 'Audio 1' });
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync volume state to engine
  useEffect(() => {
    setMasterVolume(volume);
  }, [volume, setMasterVolume]);

  // Measure actual preview container dimensions for accurate overlay positioning
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setActualContainerSize({ width: rect.width, height: rect.height });
      }
    };

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
    updateSize();

    return () => resizeObserver.disconnect();
  }, [previewContainerRef, setActualContainerSize]);
}
