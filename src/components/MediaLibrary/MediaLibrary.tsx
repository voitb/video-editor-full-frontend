/**
 * Video Editor V2 - Media Library Component
 * List view of loaded sources with drag-and-drop to timeline.
 */

import { useState, useCallback, useRef } from 'react';
import type { Source } from '../../core/Source';
import { MediaLibraryItem } from './MediaLibraryItem';

export interface MediaLibraryProps {
  /** Map of loaded sources */
  sources: ReadonlyMap<string, Source>;
  /** Callback to load an HLS source */
  onLoadHls: (url: string) => Promise<void>;
  /** Callback to load a local file source */
  onLoadFile?: (file: File) => Promise<void>;
  /** Whether a source is currently loading */
  isLoading: boolean;
  /** Loading progress percentage (0-100) */
  loadingProgress: number;
}

/**
 * Media library panel showing loaded sources.
 * Sources can be dragged to the timeline to create clips.
 */
export function MediaLibrary(props: MediaLibraryProps) {
  const { sources, onLoadHls, onLoadFile, isLoading, loadingProgress } = props;

  const [hlsUrl, setHlsUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !onLoadFile) return;

    // Load files sequentially
    for (const file of Array.from(files)) {
      await onLoadFile(file);
    }

    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onLoadFile]);

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

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
        <div style={{
          margin: '12px 0',
          textAlign: 'center',
          color: '#666',
          fontSize: 12,
          position: 'relative',
        }}>
          <span style={{
            backgroundColor: '#333',
            padding: '0 8px',
            position: 'relative',
            zIndex: 1,
          }}>
            or
          </span>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: '#444',
          }} />
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
            Upload local files or enter an HLS URL to get started.
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
