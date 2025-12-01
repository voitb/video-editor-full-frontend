import type { ExportProgress } from '../worker/exportTypes';

interface ExportButtonProps {
  /** Whether the export button should be disabled */
  disabled: boolean;
  /** Whether an export is currently in progress */
  isExporting: boolean;
  /** Current export progress (null when not exporting) */
  progress: ExportProgress | null;
  /** Error message if export failed */
  error: string | null;
  /** Whether the video has an audio track */
  hasAudio: boolean;
  /** Callback when export is requested */
  onExport: () => void;
  /** Callback when export abort is requested */
  onAbort: () => void;
  /** Callback to clear error state */
  onClearError: () => void;
}

/**
 * Export button component with progress display.
 * Shows export button when idle, progress during export, and error messages.
 */
export function ExportButton({
  disabled,
  isExporting,
  progress,
  error,
  hasAudio,
  onExport,
  onAbort,
  onClearError,
}: ExportButtonProps) {
  // During export, show progress UI
  if (isExporting) {
    return (
      <div className="flex flex-col gap-2">
        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <button
            onClick={onAbort}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm text-white font-medium
                       transition-colors"
          >
            Cancel
          </button>
          <div className="flex-1">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{getStageLabel(progress?.stage)}</span>
              <span>{Math.round(progress?.overallProgress ?? 0)}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-150"
                style={{ width: `${progress?.overallProgress ?? 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Detailed progress */}
        {progress && (
          <div className="flex gap-4 text-xs text-gray-500">
            <span>Video: {Math.round(progress.videoProgress)}%</span>
            {hasAudio && <span>Audio: {Math.round(progress.audioProgress)}%</span>}
            {progress.estimatedRemainingMs !== null && (
              <span>~{formatTimeRemaining(progress.estimatedRemainingMs)} remaining</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Normal state - show export button
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={onExport}
        disabled={disabled}
        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600
                   disabled:cursor-not-allowed rounded text-white font-medium
                   transition-colors"
      >
        Export Video
      </button>
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <span>{error}</span>
          <button
            onClick={onClearError}
            className="underline hover:text-red-300"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Get human-readable label for export stage
 */
function getStageLabel(stage: ExportProgress['stage'] | undefined): string {
  switch (stage) {
    case 'demuxing':
      return 'Reading video...';
    case 'decoding':
      return 'Decoding frames...';
    case 'encoding':
      return 'Encoding video...';
    case 'muxing':
      return 'Creating file...';
    case 'finalizing':
      return 'Finalizing...';
    default:
      return 'Preparing...';
  }
}

/**
 * Format milliseconds as human-readable time
 */
function formatTimeRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
