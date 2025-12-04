/**
 * Media Tab
 * Media library tab content with HLS loading and file upload.
 */

import { useState, useCallback, useRef } from 'react';
import type { Source } from '../../../core/Source';
import { formatTimecode } from '../../../utils/time';
import { DRAG_DATA_TYPE } from '../types';

interface MediaTabProps {
  sources: ReadonlyMap<string, Source>;
  onLoadHls: (url: string) => Promise<void>;
  onLoadFile?: (file: File) => Promise<void>;
  isLoading: boolean;
  loadingProgress: number;
}

export function MediaTab(props: MediaTabProps) {
  const { sources, onLoadHls, onLoadFile, isLoading, loadingProgress } = props;

  const [hlsUrl, setHlsUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadClick = useCallback(async () => {
    if (!hlsUrl || isLoading) return;
    await onLoadHls(hlsUrl);
    setHlsUrl('');
  }, [hlsUrl, isLoading, onLoadHls]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleLoadClick();
      }
    },
    [handleLoadClick]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0 || !onLoadFile) return;

      for (const file of Array.from(files)) {
        await onLoadFile(file);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onLoadFile]
  );

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const sourceList = Array.from(sources.values());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: 12, borderBottom: '1px solid #333' }}>
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

        {/* Load HLS Button */}
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

        {/* Divider */}
        <div
          style={{
            margin: '12px 0',
            textAlign: 'center',
            color: '#666',
            fontSize: 12,
            position: 'relative',
          }}
        >
          <span style={{ backgroundColor: '#333', padding: '0 8px', position: 'relative', zIndex: 1 }}>
            or
          </span>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: '#444',
            }}
          />
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov,.m4v,audio/mpeg,audio/wav,.mp3,.wav"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {/* Browse Files Button */}
        <button
          onClick={handleBrowseClick}
          disabled={isLoading || !onLoadFile}
          style={{
            width: '100%',
            padding: '8px 16px',
            fontSize: 13,
            backgroundColor: isLoading ? '#333' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: isLoading || !onLoadFile ? 'not-allowed' : 'pointer',
            opacity: onLoadFile ? 1 : 0.5,
          }}
        >
          Upload Files (MP4/MOV/MP3/WAV)
        </button>
      </div>

      {/* Source List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {sourceList.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: '#666', fontSize: 13 }}>
            No media loaded.
            <br />
            Upload local files or enter an HLS URL to get started.
          </div>
        ) : (
          sourceList.map((source) => <MediaLibraryItem key={source.id} source={source} />)
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

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_DATA_TYPE, source.id);
      e.dataTransfer.effectAllowed = 'copy';
      setIsDragging(true);
    },
    [source.id]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const displayName =
    'fileName' in source && typeof source.fileName === 'string'
      ? source.fileName
      : `${source.type.toUpperCase()} Video`;

  const isAudioOnly = source.isAudioOnly;

  const resolution = isAudioOnly
    ? 'Audio Only'
    : source.width && source.height
      ? `${source.width}x${source.height}`
      : 'Unknown';

  const getStatusIndicator = () => {
    if (source.hasError) return { color: '#ff4444', text: 'Error' };
    if (source.isLoading) return { color: '#f59e0b', text: 'Loading' };
    if (source.isReady) return { color: '#10b981', text: 'Ready' };
    if (source.isPlayable) return { color: '#3b82f6', text: 'Playable' };
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{displayName}</span>
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

      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#888' }}>
        <span>{formatTimecode(source.durationUs)}</span>
        <span style={isAudioOnly ? { color: '#3b9858' } : undefined}>{resolution}</span>
        {!isAudioOnly && source.hasAudio && <span style={{ color: '#3b9858' }}>+Audio</span>}
      </div>

      {source.hasError && source.errorMessage && (
        <div style={{ fontSize: 11, color: '#ff4444', marginTop: 4 }}>{source.errorMessage}</div>
      )}
    </div>
  );
}
