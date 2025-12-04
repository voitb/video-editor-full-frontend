/**
 * Export Controller Hook
 * Handles export start/cancel logic and overlay pre-rendering.
 */

import { useCallback } from 'react';
import type { ExportPresetKey } from '../../../core/types';
import type { TrackJSON } from '../../../core/types';
import type {
  StartExportCommand,
  ExportSourceData,
  ExportOverlayData,
} from '../../../workers/messages/exportMessages';
import { EXPORT_PRESETS } from '../../../constants';
import { preRenderOverlays } from '../../../renderer/OverlayRenderer';

interface CompositionConfig {
  width: number;
  height: number;
  frameRate: number;
}

interface UseExportControllerOptions {
  preset: ExportPresetKey;
  compositionConfig: CompositionConfig;
  inPointUs: number;
  outPointUs: number;
  getTracksJSON: () => TrackJSON[];
  getSourceData: () => Promise<ExportSourceData[]>;
  createWorker: (onReady: (worker: Worker) => void) => void;
  postMessage: (message: StartExportCommand, transfers: Transferable[]) => void;
  cancelExport: () => void;
  setExportState: (state: 'idle' | 'exporting' | 'complete' | 'error' | 'cancelled') => void;
  setProgress: (progress: null) => void;
  setErrorMessage: (message: string | null) => void;
}

interface UseExportControllerResult {
  startExport: () => Promise<void>;
  handleCancel: () => void;
}

export function useExportController({
  preset,
  compositionConfig,
  inPointUs,
  outPointUs,
  getTracksJSON,
  getSourceData,
  createWorker,
  postMessage,
  cancelExport,
  setExportState,
  setProgress,
  setErrorMessage,
}: UseExportControllerOptions): UseExportControllerResult {
  const startExport = useCallback(async () => {
    setExportState('exporting');
    setProgress(null);
    setErrorMessage(null);

    try {
      const sources = await getSourceData();
      const presetConfig = EXPORT_PRESETS[preset];
      const outputWidth = Math.round(compositionConfig.width * presetConfig.scale);
      const outputHeight = Math.round(compositionConfig.height * presetConfig.scale);
      const tracks = getTracksJSON();

      // Pre-render overlay clips (must be done in main thread for DOM access)
      let overlays: ExportOverlayData[] = [];
      try {
        const rendered = await preRenderOverlays(tracks, outputWidth, outputHeight);
        overlays = rendered.map((r) => ({
          clipId: r.clipId,
          startUs: r.startUs,
          durationUs: r.durationUs,
          bitmap: r.bitmap,
          position: r.position,
          opacity: r.opacity,
          trackIndex: r.trackIndex,
        }));
      } catch (overlayError) {
        console.warn('Failed to pre-render some overlays:', overlayError);
      }

      createWorker((worker) => {
        const command: StartExportCommand = {
          type: 'START_EXPORT',
          compositionConfig,
          tracks,
          sources,
          overlays: overlays.length > 0 ? overlays : undefined,
          exportConfig: {
            preset,
            inPointUs,
            outPointUs,
            outputWidth,
            outputHeight,
            videoBitrate: presetConfig.videoBitrate,
            audioBitrate: presetConfig.audioBitrate,
          },
        };

        const transfers: Transferable[] = [
          ...sources.map((s) => s.buffer),
          ...overlays.map((o) => o.bitmap),
        ];

        postMessage(command, transfers);
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start export');
      setExportState('error');
    }
  }, [
    preset,
    compositionConfig,
    inPointUs,
    outPointUs,
    getTracksJSON,
    getSourceData,
    createWorker,
    postMessage,
    setExportState,
    setProgress,
    setErrorMessage,
  ]);

  const handleCancel = useCallback(() => {
    cancelExport();
  }, [cancelExport]);

  return {
    startExport,
    handleCancel,
  };
}
