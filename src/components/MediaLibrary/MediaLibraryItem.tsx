/**
 * Media Library Item
 * Individual source item with drag-and-drop support.
 */

import { useState, useCallback } from 'react';
import type { Source } from '../../core/Source';
import { formatTimecode } from '../../utils/time';
import { DRAG_DATA_TYPE } from './constants';

export interface MediaLibraryItemProps {
  source: Source;
}

export function MediaLibraryItem({ source }: MediaLibraryItemProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_DATA_TYPE, source.id);
    e.dataTransfer.effectAllowed = 'copy';
    setIsDragging(true);
  }, [source.id]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Derive display name from source type or file name
  const displayName = 'fileName' in source && typeof source.fileName === 'string'
    ? source.fileName
    : `${source.type.toUpperCase()} Video`;

  // Check if this is an audio-only source
  const isAudioOnly = source.isAudioOnly;

  // Format resolution or show "Audio Only" for audio files
  const resolution = isAudioOnly
    ? 'Audio Only'
    : source.width && source.height
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
        <span style={isAudioOnly ? { color: '#3b9858' } : undefined}>{resolution}</span>
        {!isAudioOnly && source.hasAudio && (
          <span style={{ color: '#3b9858' }}>+Audio</span>
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
