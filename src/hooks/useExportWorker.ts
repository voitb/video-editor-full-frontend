import { useEffect, useRef, useState, useCallback } from 'react';
import type { ExportWorkerCommand, ExportWorkerResponse, ExportProgress } from '../worker/exportTypes';
import { logger } from '../utils/logger';

// Import worker using Vite's worker syntax
import ExportWorkerModule from '../worker/ExportWorker?worker';

interface UseExportWorkerReturn {
  /** Whether an export is currently in progress */
  isExporting: boolean;
  /** Current export progress (null when not exporting) */
  progress: ExportProgress | null;
  /** Error message if export failed (null otherwise) */
  error: string | null;
  /** Whether the source file has audio */
  hasAudio: boolean;
  /** Start exporting the video with the given trim points */
  startExport: (file: File, inPointUs: number, outPointUs: number) => void;
  /** Abort the current export */
  abortExport: () => void;
  /** Clear any error state */
  clearError: () => void;
}

/**
 * Hook for managing video export using a dedicated Web Worker.
 * Handles export lifecycle, progress tracking, and download initiation.
 */
export function useExportWorker(): UseExportWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasAudio, setHasAudio] = useState(false);

  // Initialize worker
  useEffect(() => {
    const worker = new ExportWorkerModule();
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<ExportWorkerResponse>) => {
      switch (e.data.type) {
        case 'EXPORT_STARTED':
          setIsExporting(true);
          setError(null);
          setHasAudio(e.data.payload.hasAudio);
          logger.log('Export started', {
            estimatedFrames: e.data.payload.estimatedFrames,
            hasAudio: e.data.payload.hasAudio,
          });
          break;

        case 'EXPORT_PROGRESS':
          setProgress(e.data.payload);
          break;

        case 'EXPORT_COMPLETE':
          setIsExporting(false);
          setProgress(null);
          downloadBlob(e.data.payload.blob, e.data.payload.filename);
          logger.log('Export complete', {
            filename: e.data.payload.filename,
            durationMs: e.data.payload.durationMs,
          });
          break;

        case 'EXPORT_ERROR':
          setIsExporting(false);
          setProgress(null);
          setError(e.data.payload.message);
          logger.error('Export error:', e.data.payload.message);
          break;

        case 'EXPORT_ABORTED':
          setIsExporting(false);
          setProgress(null);
          logger.log('Export aborted by user');
          break;
      }
    };

    worker.onerror = (e) => {
      logger.error('Export worker error:', e);
      setIsExporting(false);
      setProgress(null);
      setError('Export worker encountered an error');
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const startExport = useCallback((file: File, inPointUs: number, outPointUs: number) => {
    if (!workerRef.current) {
      setError('Export worker not initialized');
      return;
    }

    // Clear previous state
    setError(null);
    setProgress(null);

    const command: ExportWorkerCommand = {
      type: 'START_EXPORT',
      payload: { file, inPointUs, outPointUs },
    };

    workerRef.current.postMessage(command);
  }, []);

  const abortExport = useCallback(() => {
    if (!workerRef.current) return;

    const command: ExportWorkerCommand = { type: 'ABORT_EXPORT' };
    workerRef.current.postMessage(command);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isExporting,
    progress,
    error,
    hasAudio,
    startExport,
    abortExport,
    clearError,
  };
}

/**
 * Create a download link and trigger download
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
