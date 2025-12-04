/**
 * Export Actions Component
 * Action buttons for different export states.
 */

import type { ExportState } from '../hooks';

interface ExportActionsProps {
  exportState: ExportState;
  downloadUrl: string | null;
  onClose: () => void;
  onStartExport: () => void;
  onCancelExport: () => void;
  onRetry: () => void;
}

const buttonStyle = {
  flex: 1,
  padding: '10px 16px',
  border: 'none',
  borderRadius: 4,
  fontSize: 14,
  cursor: 'pointer',
} as const;

export function ExportActions({
  exportState,
  downloadUrl,
  onClose,
  onStartExport,
  onCancelExport,
  onRetry,
}: ExportActionsProps) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {exportState === 'idle' && (
        <>
          <button
            onClick={onClose}
            style={{ ...buttonStyle, backgroundColor: '#333', color: '#fff' }}
          >
            Cancel
          </button>
          <button
            onClick={onStartExport}
            style={{ ...buttonStyle, backgroundColor: '#4a90d9', color: '#fff', fontWeight: 500 }}
          >
            Start Export
          </button>
        </>
      )}

      {exportState === 'exporting' && (
        <button
          onClick={onCancelExport}
          style={{ ...buttonStyle, backgroundColor: '#dc3545', color: '#fff' }}
        >
          Cancel Export
        </button>
      )}

      {exportState === 'complete' && downloadUrl && (
        <>
          <button
            onClick={onClose}
            style={{ ...buttonStyle, backgroundColor: '#333', color: '#fff' }}
          >
            Close
          </button>
          <a
            href={downloadUrl}
            download="export.mp4"
            style={{
              ...buttonStyle,
              backgroundColor: '#28a745',
              color: '#fff',
              fontWeight: 500,
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
            onClick={onClose}
            style={{ ...buttonStyle, backgroundColor: '#333', color: '#fff' }}
          >
            Close
          </button>
          <button
            onClick={onRetry}
            style={{ ...buttonStyle, backgroundColor: '#4a90d9', color: '#fff' }}
          >
            Try Again
          </button>
        </>
      )}
    </div>
  );
}
