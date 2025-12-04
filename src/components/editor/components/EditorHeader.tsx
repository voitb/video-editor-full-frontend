/**
 * EditorHeader Component
 * Top header bar with title, state display, linked selection toggle, and export button.
 */

import type { EngineState } from '../../../engine/types';

export interface EditorHeaderProps {
  state: EngineState;
  error?: string;
  linkedSelection: boolean;
  durationUs: number;
  onLinkedSelectionToggle: () => void;
  onExportClick: () => void;
}

export function EditorHeader({
  state,
  error,
  linkedSelection,
  durationUs,
  onLinkedSelectionToggle,
  onExportClick,
}: EditorHeaderProps) {
  return (
    <header
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 18 }}>Video Editor V2</h1>
      <span style={{ color: '#666' }}>|</span>
      <span style={{ fontSize: 12, color: '#888' }}>
        State: {state}
      </span>
      {error && (
        <span style={{ fontSize: 12, color: '#ff4444' }}>
          Error: {error}
        </span>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Linked Selection Toggle */}
        <button
          onClick={onLinkedSelectionToggle}
          title={linkedSelection ? 'Linked Selection ON - Click to disable' : 'Linked Selection OFF - Click to enable'}
          style={{
            padding: '4px 8px',
            backgroundColor: linkedSelection ? '#4a90d9' : '#333',
            border: linkedSelection ? '1px solid #5aa0e9' : '1px solid #555',
            borderRadius: 4,
            color: '#fff',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          Link
        </button>
        <span style={{ fontSize: 11, color: '#666', alignSelf: 'center' }}>
          I/O: Set In/Out
        </span>
        <button
          onClick={onExportClick}
          disabled={durationUs === 0}
          style={{
            padding: '6px 16px',
            backgroundColor: durationUs === 0 ? '#333' : '#4a90d9',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor: durationUs === 0 ? 'not-allowed' : 'pointer',
            opacity: durationUs === 0 ? 0.5 : 1,
          }}
        >
          Export
        </button>
      </div>
    </header>
  );
}
