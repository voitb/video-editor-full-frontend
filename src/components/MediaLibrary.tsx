/**
 * Video Editor V2 - Media Library Component
 * List view of loaded sources with drag-and-drop to timeline.
 */

import { useState, useCallback } from 'react';
import type { Source } from '../core/Source';
import { formatTimecode } from '../utils/time';

export interface MediaLibraryProps {
  /** Map of loaded sources */
  sources: ReadonlyMap<string, Source>;
  /** Callback to load an HLS source */
  onLoadHls: (url: string) => Promise<void>;
  /** Whether a source is currently loading */
  isLoading: boolean;
  /** Loading progress percentage (0-100) */
  loadingProgress: number;
}

/** Data type for drag-and-drop */
export const DRAG_DATA_TYPE = 'application/x-video-editor-source';

/**
 * Media library panel showing loaded sources.
 * Sources can be dragged to the timeline to create clips.
 */
export function MediaLibrary(props: MediaLibraryProps) {
  const { sources, onLoadHls, isLoading, loadingProgress } = props;

  const [hlsUrl, setHlsUrl] = useState('');

  const handleLoadClick = useCallback(async () => {
    if (!hlsUrl || isLoading) return;
    await onLoadHls(hlsUrl);
    setHlsUrl('');
  }, [hlsUrl, isLoading, onLoadHls]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLoadClick();
    }
  }, [handleLoadClick]);

  // Convert sources map to array for rendering
  const sourceList = Array.from(sources.values());

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: 12, borderBottom: '1px solid #333' }}>
        <h3 style={{ margin: 0, marginBottom: 12, fontSize: 14, color: '#fff' }}>
          Media Library
        </h3>

        {/* HLS URL Input */}
        <input
          type="text"
          placeholder="Enter HLS URL (.m3u8)"
          value={hlsUrl}
          onChange={(e) => setHlsUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '8px 12px',
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#fff',
            fontSize: 13,
            boxSizing: 'border-box',
          }}
        />

        {/* Load Button */}
        <button
          onClick={handleLoadClick}
          disabled={isLoading || !hlsUrl}
          style={{
            width: '100%',
            marginTop: 8,
            padding: '8px 16px',
            fontSize: 13,
            backgroundColor: isLoading ? '#333' : '#10b981',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? `Loading... ${loadingProgress.toFixed(0)}%` : 'Load HLS'}
        </button>
      </div>

      {/* Source List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 8,
        }}
      >
        {sourceList.length === 0 ? (
          <div
            style={{
              padding: 16,
              textAlign: 'center',
              color: '#666',
              fontSize: 13,
            }}
          >
            No media loaded.
            <br />
            Enter an HLS URL above to get started.
          </div>
        ) : (
          sourceList.map((source) => (
            <MediaLibraryItem key={source.id} source={source} />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MEDIA LIBRARY ITEM
// ============================================================================

interface MediaLibraryItemProps {
  source: Source;
}

function MediaLibraryItem({ source }: MediaLibraryItemProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_DATA_TYPE, source.id);
    e.dataTransfer.effectAllowed = 'copy';
    setIsDragging(true);
  }, [source.id]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Derive display name from source type
  const displayName = `${source.type.toUpperCase()} Video`;

  // Format resolution
  const resolution = source.width && source.height
    ? `${source.width}x${source.height}`
    : 'Unknown';

  // Determine status indicator
  const getStatusIndicator = () => {
    if (source.hasError) {
      return { color: '#ff4444', text: 'Error' };
    }
    if (source.isLoading) {
      return { color: '#f59e0b', text: 'Loading' };
    }
    if (source.isReady) {
      return { color: '#10b981', text: 'Ready' };
    }
    if (source.isPlayable) {
      return { color: '#3b82f6', text: 'Playable' };
    }
    return { color: '#666', text: 'Idle' };
  };

  const status = getStatusIndicator();
  const canDrag = source.isPlayable || source.isReady;

  return (
    <div
      draggable={canDrag}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 10,
        marginBottom: 8,
        backgroundColor: isDragging ? '#2a4a7a' : '#1e1e1e',
        borderRadius: 6,
        border: `1px solid ${isDragging ? '#3b82f6' : '#333'}`,
        cursor: canDrag ? 'grab' : 'default',
        opacity: canDrag ? 1 : 0.6,
        transition: 'background-color 0.15s, border-color 0.15s',
      }}
      title={canDrag ? 'Drag to timeline to add' : 'Loading...'}
    >
      {/* Row 1: Name and Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>
          {displayName}
        </span>
        <span
          style={{
            fontSize: 10,
            padding: '2px 6px',
            backgroundColor: status.color + '22',
            color: status.color,
            borderRadius: 4,
          }}
        >
          {status.text}
        </span>
      </div>

      {/* Row 2: Duration and Resolution */}
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#888' }}>
        <span>{formatTimecode(source.durationUs)}</span>
        <span>{resolution}</span>
        {source.hasAudio && (
          <span style={{ color: '#3b9858' }}>Audio</span>
        )}
      </div>

      {/* Error Message */}
      {source.hasError && source.errorMessage && (
        <div style={{ fontSize: 11, color: '#ff4444', marginTop: 4 }}>
          {source.errorMessage}
        </div>
      )}
    </div>
  );
}
