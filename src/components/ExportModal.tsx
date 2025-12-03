/**
 * Video Editor - Export Modal Component
 * Modal dialog for configuring and running video exports.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ExportPresetKey, ExportProgress } from '../core/types';
import type {
  ExportWorkerEvent,
  StartExportCommand,
  ExportSourceData,
  ExportOverlayData,
} from '../workers/messages/exportMessages';
import { EXPORT_PRESETS, TIME } from '../constants';
import { formatTimecode } from '../utils/time';
import { preRenderOverlays } from '../renderer/OverlayRenderer';

export interface ExportModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** In-point in microseconds */
  inPointUs: number;
  /** Out-point in microseconds */
  outPointUs: number;
  /** Composition config */
  compositionConfig: {
    width: number;
    height: number;
    frameRate: number;
  };
  /** Function to get tracks JSON */
  getTracksJSON: () => import('../core/types').TrackJSON[];
  /** Function to get source data for export */
  getSourceData: () => Promise<ExportSourceData[]>;
}

type ExportState = 'idle' | 'exporting' | 'complete' | 'error' | 'cancelled';

export function ExportModal(props: ExportModalProps) {
  const {
    isOpen,
    onClose,
    inPointUs,
    outPointUs,
    compositionConfig,
    getTracksJSON,
    getSourceData,
  } = props;

  const [preset, setPreset] = useState<ExportPresetKey>('high');
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const prevIsOpenRef = useRef(false);

  // Clean up worker and URL on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  // Reset state when modal first opens (false -> true transition only)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setExportState('idle');
      setProgress(null);
      setErrorMessage(null);
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(null);
      }
      setFileSizeBytes(null);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, downloadUrl]);

  const startExport = useCallback(async () => {
    setExportState('exporting');
    setProgress(null);
    setErrorMessage(null);

    try {
      // Get source data
      const sources = await getSourceData();

      // Get preset config
      const presetConfig = EXPORT_PRESETS[preset];
      const outputWidth = Math.round(compositionConfig.width * presetConfig.scale);
      const outputHeight = Math.round(compositionConfig.height * presetConfig.scale);

      // Get tracks JSON before pre-rendering
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
        // Continue with export even if overlay rendering fails
      }

      // Create worker
      const worker = new Worker(
        new URL('../workers/ExportWorker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent<ExportWorkerEvent>) => {
        const event = e.data;

        switch (event.type) {
          case 'EXPORT_WORKER_READY':
            // Worker is ready, send start command
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

            // Transfer source buffers and overlay bitmaps
            const transfers: Transferable[] = [
              ...sources.map((s) => s.buffer),
              ...overlays.map((o) => o.bitmap),
            ];
            worker.postMessage(command, transfers);
            break;

          case 'EXPORT_PROGRESS':
            setProgress({
              currentFrame: event.currentFrame,
              totalFrames: event.totalFrames,
              percent: event.percent,
              phase: event.phase,
            });
            break;

          case 'EXPORT_COMPLETE':
            const blob = new Blob([event.mp4Data], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            setDownloadUrl(url);
            setFileSizeBytes(event.fileSizeBytes);
            setExportState('complete');
            worker.terminate();
            workerRef.current = null;
            break;

          case 'EXPORT_CANCELLED':
            setExportState('cancelled');
            worker.terminate();
            workerRef.current = null;
            break;

          case 'EXPORT_ERROR':
            setErrorMessage(event.message);
            setExportState('error');
            worker.terminate();
            workerRef.current = null;
            break;
        }
      };

      worker.onerror = (err) => {
        setErrorMessage(err.message || 'Worker error');
        setExportState('error');
        worker.terminate();
        workerRef.current = null;
      };
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start export');
      setExportState('error');
    }
  }, [preset, compositionConfig, inPointUs, outPointUs, getTracksJSON, getSourceData]);

  const cancelExport = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'CANCEL_EXPORT' });
    }
  }, []);

  const handleClose = useCallback(() => {
    if (exportState === 'exporting') {
      cancelExport();
    }
    onClose();
  }, [exportState, cancelExport, onClose]);

  // Calculate duration and estimated file size
  const durationUs = outPointUs - inPointUs;
  const durationSec = durationUs / TIME.US_PER_SECOND;
  const presetConfig = EXPORT_PRESETS[preset];
  const estimatedSizeMB =
    ((presetConfig.videoBitrate + presetConfig.audioBitrate) * durationSec) / 8 / 1024 / 1024;

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#1a1a1a',
          borderRadius: 8,
          padding: 24,
          width: 420,
          maxWidth: '90vw',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, color: '#fff', fontSize: 20 }}>Export Video</h2>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              fontSize: 24,
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Export Range */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Export Range</div>
          <div style={{ color: '#fff', fontSize: 14 }}>
            {formatTimecode(inPointUs)} &ndash; {formatTimecode(outPointUs)}
          </div>
          <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>
            Duration: {formatTimecode(durationUs)}
          </div>
        </div>

        {/* Quality Preset */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>
            Quality
          </label>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as ExportPresetKey)}
            disabled={exportState === 'exporting'}
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: '#2a2a2a',
              border: '1px solid #444',
              borderRadius: 4,
              color: '#fff',
              fontSize: 14,
              cursor: exportState === 'exporting' ? 'not-allowed' : 'pointer',
            }}
          >
            {Object.entries(EXPORT_PRESETS).map(([key, config]) => (
              <option key={key} value={key}>
                {config.name}
              </option>
            ))}
          </select>
        </div>

        {/* File Size Estimate */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: '#888', fontSize: 12 }}>
            Estimated size: ~{estimatedSizeMB.toFixed(1)} MB
          </div>
          <div style={{ color: '#666', fontSize: 11 }}>
            {Math.round(compositionConfig.width * presetConfig.scale)} &times;{' '}
            {Math.round(compositionConfig.height * presetConfig.scale)} @{' '}
            {compositionConfig.frameRate}fps
          </div>
        </div>

        {/* Progress */}
        {exportState === 'exporting' && progress && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 6,
                fontSize: 12,
              }}
            >
              <span style={{ color: '#888' }}>
                {progress.phase === 'encoding_video'
                  ? `Encoding video (${progress.currentFrame}/${progress.totalFrames})`
                  : progress.phase === 'encoding_audio'
                    ? 'Encoding audio...'
                    : progress.phase === 'initializing'
                      ? 'Initializing...'
                      : progress.phase === 'finalizing'
                        ? 'Finalizing...'
                        : 'Muxing...'}
              </span>
              <span style={{ color: '#fff' }}>{progress.percent}%</span>
            </div>
            <div
              style={{
                height: 6,
                backgroundColor: '#333',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress.percent}%`,
                  backgroundColor: '#4a90d9',
                  borderRadius: 3,
                  transition: 'width 0.2s ease-out',
                }}
              />
            </div>
          </div>
        )}

        {/* Error Message */}
        {exportState === 'error' && errorMessage && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              backgroundColor: 'rgba(220, 53, 69, 0.2)',
              borderRadius: 4,
              color: '#ff6b6b',
              fontSize: 13,
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Success Message */}
        {exportState === 'complete' && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              backgroundColor: 'rgba(40, 167, 69, 0.2)',
              borderRadius: 4,
              color: '#51cf66',
              fontSize: 13,
            }}
          >
            Export complete!{' '}
            {fileSizeBytes && `(${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB)`}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          {exportState === 'idle' && (
            <>
              <button
                onClick={handleClose}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: '#333',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={startExport}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: '#4a90d9',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Start Export
              </button>
            </>
          )}

          {exportState === 'exporting' && (
            <button
              onClick={cancelExport}
              style={{
                flex: 1,
                padding: '10px 16px',
                backgroundColor: '#dc3545',
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Cancel Export
            </button>
          )}

          {exportState === 'complete' && downloadUrl && (
            <>
              <button
                onClick={handleClose}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: '#333',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
              <a
                href={downloadUrl}
                download="export.mp4"
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: '#28a745',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'center',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Download Video
              </a>
            </>
          )}

          {(exportState === 'error' || exportState === 'cancelled') && (
            <>
              <button
                onClick={handleClose}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: '#333',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
              <button
                onClick={() => setExportState('idle')}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: '#4a90d9',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
