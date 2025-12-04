/**
 * Progress Display Component
 * Shows export progress with phase indicator and progress bar.
 */

import type { ExportProgress } from '../../../core/types';

interface ProgressDisplayProps {
  progress: ExportProgress;
}

export function ProgressDisplay({ progress }: ProgressDisplayProps) {
  const phaseText = getPhaseText(progress);

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 6,
          fontSize: 12,
        }}
      >
        <span style={{ color: '#888' }}>{phaseText}</span>
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
  );
}

function getPhaseText(progress: ExportProgress): string {
  switch (progress.phase) {
    case 'encoding_video':
      return `Encoding video (${progress.currentFrame}/${progress.totalFrames})`;
    case 'encoding_audio':
      return 'Encoding audio...';
    case 'initializing':
      return 'Initializing...';
    case 'finalizing':
      return 'Finalizing...';
    default:
      return 'Muxing...';
  }
}
