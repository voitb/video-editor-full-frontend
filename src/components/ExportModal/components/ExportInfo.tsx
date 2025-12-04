/**
 * Export Info Component
 * Displays export range, quality preset, and file size estimate.
 */

import { useState } from 'react';
import type { ExportPresetKey } from '../../../core/types';
import { EXPORT_PRESETS, TIME } from '../../../constants';
import { formatTimecode } from '../../../utils/time';
import type { ExportState } from '../hooks';

interface CompositionConfig {
  width: number;
  height: number;
  frameRate: number;
}

interface ExportInfoProps {
  inPointUs: number;
  outPointUs: number;
  compositionConfig: CompositionConfig;
  preset: ExportPresetKey;
  onPresetChange: (preset: ExportPresetKey) => void;
  exportState: ExportState;
}

export function ExportInfo({
  inPointUs,
  outPointUs,
  compositionConfig,
  preset,
  onPresetChange,
  exportState,
}: ExportInfoProps) {
  const durationUs = outPointUs - inPointUs;
  const durationSec = durationUs / TIME.US_PER_SECOND;
  const presetConfig = EXPORT_PRESETS[preset];
  const estimatedSizeMB =
    ((presetConfig.videoBitrate + presetConfig.audioBitrate) * durationSec) / 8 / 1024 / 1024;

  return (
    <>
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
          onChange={(e) => onPresetChange(e.target.value as ExportPresetKey)}
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
    </>
  );
}
