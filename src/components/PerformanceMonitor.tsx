/**
 * Performance Monitor Component
 * Dev-only overlay for displaying real-time performance metrics.
 * Toggle with Ctrl+Shift+P (Cmd+Shift+P on Mac)
 */

import { useState, useEffect, useCallback } from 'react';
import type { WorkerPerfMetrics } from '../workers/messages/renderMessages';
import { getDeviceInfo } from '../utils/deviceTier';

interface PerformanceMonitorProps {
  /** Performance metrics from worker */
  metrics: WorkerPerfMetrics | null;
  /** Audio-video sync offset in microseconds */
  avSyncOffsetUs?: number;
  /** Whether the monitor is enabled (can be controlled externally) */
  enabled?: boolean;
}

// LocalStorage key for preference
const STORAGE_KEY = 'videoEditor.perfMonitor.visible';

export function PerformanceMonitor({
  metrics,
  avSyncOffsetUs = 0,
  enabled = true,
}: PerformanceMonitorProps) {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [expanded, setExpanded] = useState(false);

  // Keyboard shortcut handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ctrl+Shift+P or Cmd+Shift+P
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      setVisible(prev => {
        const newValue = !prev;
        try {
          localStorage.setItem(STORAGE_KEY, String(newValue));
        } catch {
          // Ignore storage errors
        }
        return newValue;
      });
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!enabled || !visible) {
    return null;
  }

  const deviceInfo = getDeviceInfo();

  // Calculate status color based on FPS
  const getFpsColor = (fps: number): string => {
    if (fps >= 28) return '#22c55e'; // green
    if (fps >= 20) return '#eab308'; // yellow
    return '#ef4444'; // red
  };

  const getFpsStatus = (fps: number): string => {
    if (fps >= 28) return 'OK';
    if (fps >= 20) return 'WARN';
    return 'LOW';
  };

  // Format A/V sync offset
  const avSyncMs = Math.round(avSyncOffsetUs / 1000);
  const avSyncColor = Math.abs(avSyncMs) <= 30 ? '#22c55e' : Math.abs(avSyncMs) <= 50 ? '#eab308' : '#ef4444';

  // Get total decoder/frame queue
  const totalDecoderQueue = metrics
    ? Object.values(metrics.decoderQueueDepth).reduce((a, b) => a + b, 0)
    : 0;
  const totalFrameQueue = metrics
    ? Object.values(metrics.frameQueueDepth).reduce((a, b) => a + b, 0)
    : 0;

  const fps = metrics?.fps ?? 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        background: 'rgba(0, 0, 0, 0.9)',
        padding: '8px 12px',
        borderRadius: 6,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
        color: '#e5e5e5',
        zIndex: 9999,
        minWidth: 140,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        userSelect: 'none',
      }}
    >
      {/* Header - always visible */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          marginBottom: expanded ? 6 : 0,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontWeight: 600 }}>
          FPS: <span style={{ color: getFpsColor(fps) }}>{fps}</span>
        </span>
        <span
          style={{
            fontSize: 9,
            padding: '2px 6px',
            borderRadius: 3,
            background: getFpsColor(fps),
            color: '#000',
            fontWeight: 600,
          }}
        >
          {getFpsStatus(fps)}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && metrics && (
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: 6 }}>
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: '#888' }}>Frame:</span> {metrics.avgFrameTimeMs}ms
          </div>

          <div style={{ marginBottom: 4 }}>
            <span style={{ color: '#888' }}>Decoder Q:</span> {totalDecoderQueue}
          </div>

          <div style={{ marginBottom: 4 }}>
            <span style={{ color: '#888' }}>Frame Q:</span> {totalFrameQueue}
          </div>

          <div style={{ marginBottom: 4, color: metrics.framesDropped > 0 ? '#ef4444' : '#22c55e' }}>
            <span style={{ color: '#888' }}>Dropped:</span> {metrics.framesDropped}
          </div>

          <div style={{ marginBottom: 4 }}>
            <span style={{ color: '#888' }}>A/V Sync:</span>{' '}
            <span style={{ color: avSyncColor }}>
              {avSyncMs >= 0 ? '+' : ''}{avSyncMs}ms
            </span>
          </div>

          <div style={{ marginBottom: 4 }}>
            <span style={{ color: '#888' }}>Rendered:</span> {metrics.framesRendered}
          </div>

          <div style={{ marginBottom: 4 }}>
            <span style={{ color: '#888' }}>Decoded:</span> {metrics.framesDecoded}
          </div>

          <div
            style={{
              marginTop: 8,
              paddingTop: 6,
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              fontSize: 10,
              color: '#666',
            }}
          >
            <div>
              Device: <span style={{ color: '#888' }}>{deviceInfo.tier}</span>
            </div>
            <div>
              Cores: <span style={{ color: '#888' }}>{deviceInfo.cores}</span>
              {deviceInfo.memory && (
                <>, RAM: <span style={{ color: '#888' }}>{deviceInfo.memory}GB</span></>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hint */}
      {!expanded && (
        <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>
          Click to expand
        </div>
      )}
    </div>
  );
}
