// ============================================================================
// HLS URL INPUT COMPONENT
// ============================================================================
// URL input field for loading HLS streams with loading state and progress.

import { useState, type KeyboardEvent } from 'react';
import type { HlsLoadingProgress } from '../worker/hlsTypes';

interface HlsUrlInputProps {
  onLoad: (url: string) => Promise<void>;
  isLoading: boolean;
  progress: HlsLoadingProgress;
  error: string | null;
  disabled?: boolean;
}

export function HlsUrlInput({
  onLoad,
  isLoading,
  progress,
  error,
  disabled = false,
}: HlsUrlInputProps) {
  const [url, setUrl] = useState('');

  const handleLoad = async () => {
    if (!url.trim() || isLoading || disabled) return;
    await onLoad(url.trim());
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void handleLoad();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter HLS URL (.m3u8)"
          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading || disabled}
        />
        <button
          onClick={() => void handleLoad()}
          disabled={isLoading || disabled || !url.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Loading...' : 'Load'}
        </button>
      </div>

      {/* Loading progress */}
      {isLoading && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm text-gray-400">
            <span>{progress.message || progress.stage}</span>
            <span>{progress.percent.toFixed(0)}%</span>
          </div>
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {error && !isLoading && (
        <div className="text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
