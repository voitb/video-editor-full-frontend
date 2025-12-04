/**
 * Export Worker Hook
 * Manages worker lifecycle for video export.
 */

import { useRef, useEffect, useCallback } from 'react';
import type { ExportProgress } from '../../../core/types';
import type { ExportWorkerEvent, StartExportCommand } from '../../../workers/messages/exportMessages';
import type { ExportState } from './useExportState';

interface UseExportWorkerOptions {
  setExportState: (state: ExportState) => void;
  setProgress: (progress: ExportProgress | null) => void;
  setDownloadUrl: (url: string | null) => void;
  setFileSizeBytes: (size: number | null) => void;
  setErrorMessage: (message: string | null) => void;
}

interface UseExportWorkerResult {
  createWorker: (onReady: (worker: Worker) => void) => void;
  terminateWorker: () => void;
  postMessage: (message: StartExportCommand, transfers: Transferable[]) => void;
  cancelExport: () => void;
}

export function useExportWorker({
  setExportState,
  setProgress,
  setDownloadUrl,
  setFileSizeBytes,
  setErrorMessage,
}: UseExportWorkerOptions): UseExportWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const onReadyCallbackRef = useRef<((worker: Worker) => void) | null>(null);

  // Clean up worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const handleWorkerMessage = useCallback(
    (e: MessageEvent<ExportWorkerEvent>) => {
      const event = e.data;

      switch (event.type) {
        case 'EXPORT_WORKER_READY':
          if (onReadyCallbackRef.current && workerRef.current) {
            onReadyCallbackRef.current(workerRef.current);
            onReadyCallbackRef.current = null;
          }
          break;

        case 'EXPORT_PROGRESS':
          setProgress({
            currentFrame: event.currentFrame,
            totalFrames: event.totalFrames,
            percent: event.percent,
            phase: event.phase,
          });
          break;

        case 'EXPORT_COMPLETE': {
          const blob = new Blob([event.mp4Data], { type: 'video/mp4' });
          const url = URL.createObjectURL(blob);
          setDownloadUrl(url);
          setFileSizeBytes(event.fileSizeBytes);
          setExportState('complete');
          workerRef.current?.terminate();
          workerRef.current = null;
          break;
        }

        case 'EXPORT_CANCELLED':
          setExportState('cancelled');
          workerRef.current?.terminate();
          workerRef.current = null;
          break;

        case 'EXPORT_ERROR':
          setErrorMessage(event.message);
          setExportState('error');
          workerRef.current?.terminate();
          workerRef.current = null;
          break;
      }
    },
    [setExportState, setProgress, setDownloadUrl, setFileSizeBytes, setErrorMessage]
  );

  const createWorker = useCallback(
    (onReady: (worker: Worker) => void) => {
      // Terminate existing worker
      if (workerRef.current) {
        workerRef.current.terminate();
      }

      const worker = new Worker(
        new URL('../../../workers/export/ExportWorker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;
      onReadyCallbackRef.current = onReady;

      worker.onmessage = handleWorkerMessage;

      worker.onerror = (err) => {
        setErrorMessage(err.message || 'Worker error');
        setExportState('error');
        worker.terminate();
        workerRef.current = null;
      };
    },
    [handleWorkerMessage, setErrorMessage, setExportState]
  );

  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  const postMessage = useCallback((message: StartExportCommand, transfers: Transferable[]) => {
    workerRef.current?.postMessage(message, transfers);
  }, []);

  const cancelExport = useCallback(() => {
    workerRef.current?.postMessage({ type: 'CANCEL_EXPORT' });
  }, []);

  return {
    createWorker,
    terminateWorker,
    postMessage,
    cancelExport,
  };
}
