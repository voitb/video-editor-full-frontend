/**
 * Video Editor - Export Modal Component
 * Modal dialog for configuring and running video exports.
 */

import { useState, useCallback } from 'react';
import type { ExportPresetKey } from '../../core/types';
import type { ExportSourceData } from '../../workers/messages/exportMessages';

import { useExportState, useExportWorker, useExportController } from './hooks';
import { ProgressDisplay, ExportActions, ExportInfo, StatusMessages } from './components';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  inPointUs: number;
  outPointUs: number;
  compositionConfig: {
    width: number;
    height: number;
    frameRate: number;
  };
  getTracksJSON: () => import('../../core/types').TrackJSON[];
  getSourceData: () => Promise<ExportSourceData[]>;
}

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

  const {
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
  } = useExportState(isOpen);

  const { createWorker, postMessage, cancelExport } = useExportWorker({
    setExportState,
    setProgress,
    setDownloadUrl,
    setFileSizeBytes,
    setErrorMessage,
  });

  const { startExport, handleCancel } = useExportController({
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
  });

  const handleClose = useCallback(() => {
    if (exportState === 'exporting') {
      handleCancel();
    }
    onClose();
  }, [exportState, handleCancel, onClose]);

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

        <ExportInfo
          inPointUs={inPointUs}
          outPointUs={outPointUs}
          compositionConfig={compositionConfig}
          preset={preset}
          onPresetChange={setPreset}
          exportState={exportState}
        />

        {exportState === 'exporting' && progress && (
          <ProgressDisplay progress={progress} />
        )}

        <StatusMessages
          showError={exportState === 'error'}
          errorMessage={errorMessage}
          showSuccess={exportState === 'complete'}
          fileSizeBytes={fileSizeBytes}
        />

        <ExportActions
          exportState={exportState}
          downloadUrl={downloadUrl}
          onClose={handleClose}
          onStartExport={startExport}
          onCancelExport={handleCancel}
          onRetry={() => setExportState('idle')}
        />
      </div>
    </div>
  );
}
