/**
 * Export State Hook
 * Manages export state machine and UI state.
 */

import { useState, useEffect, useRef } from 'react';
import type { ExportProgress } from '../../../core/types';

export type ExportState = 'idle' | 'exporting' | 'complete' | 'error' | 'cancelled';

interface UseExportStateResult {
  exportState: ExportState;
  setExportState: React.Dispatch<React.SetStateAction<ExportState>>;
  progress: ExportProgress | null;
  setProgress: React.Dispatch<React.SetStateAction<ExportProgress | null>>;
  downloadUrl: string | null;
  setDownloadUrl: React.Dispatch<React.SetStateAction<string | null>>;
  errorMessage: string | null;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  fileSizeBytes: number | null;
  setFileSizeBytes: React.Dispatch<React.SetStateAction<number | null>>;
  resetState: () => void;
}

export function useExportState(isOpen: boolean): UseExportStateResult {
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);

  const prevIsOpenRef = useRef(false);

  const resetState = () => {
    setExportState('idle');
    setProgress(null);
    setErrorMessage(null);
    setFileSizeBytes(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
  };

  // Reset state when modal first opens (false -> true transition only)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      resetState();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Clean up URL on unmount
  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  return {
    exportState,
    setExportState,
    progress,
    setProgress,
    downloadUrl,
    setDownloadUrl,
    errorMessage,
    setErrorMessage,
    fileSizeBytes,
    setFileSizeBytes,
    resetState,
  };
}
