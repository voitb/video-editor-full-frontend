/**
 * Video Editor V2 - Example Editor Application
 * Demonstrates how to use the video editor components together.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useComposition } from '../hooks/useComposition';
import { useEngine } from '../hooks/useEngine';
import { useTimeline } from '../hooks/useTimeline';
import { VideoPreview, type VideoPreviewHandle } from './VideoPreview';
import { Timeline } from './Timeline';
import { formatTimecode } from '../utils/time';

export interface EditorAppProps {
  /** Width of the preview canvas */
  previewWidth?: number;
  /** Height of the preview canvas */
  previewHeight?: number;
}

/**
 * Complete video editor application component.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <EditorApp
 *       previewWidth={1280}
 *       previewHeight={720}
 *     />
 *   );
 * }
 * ```
 */
export function EditorApp(props: EditorAppProps) {
  const { previewWidth = 1280, previewHeight = 720 } = props;

  // State
  const [selectedClipId, setSelectedClipId] = useState<string>();
  const [hlsUrl, setHlsUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Refs
  const previewRef = useRef<VideoPreviewHandle>(null);

  // Hooks
  const {
    composition,
    tracks,
    durationUs,
    createTrack,
    addClip,
    getClip,
    refresh,
  } = useComposition({
    config: { width: 1920, height: 1080, frameRate: 30 },
  });

  const {
    state,
    currentTimeUs,
    isPlaying,
    loadingProgress,
    error,
    initialize,
    loadHlsSource,
    togglePlayPause,
    seek,
    notifyCompositionChanged,
  } = useEngine({ composition });

  const {
    viewport,
    zoomIn,
    zoomOut,
    resetViewport,
  } = useTimeline({ durationUs });

  // Initialize engine when canvas is ready
  useEffect(() => {
    const canvas = previewRef.current?.getCanvas();
    if (canvas) {
      initialize(canvas);
    }
  }, [initialize]);

  // Create default tracks on mount
  useEffect(() => {
    if (tracks.length === 0) {
      createTrack({ type: 'video', label: 'Video 1' });
      createTrack({ type: 'audio', label: 'Audio 1' });
    }
  }, [tracks.length, createTrack]);

  // Load HLS source
  const handleLoadHls = useCallback(async () => {
    if (!hlsUrl) return;

    setIsLoading(true);
    try {
      const source = await loadHlsSource(hlsUrl);

      // Find video track and add clip
      const videoTrack = tracks.find(t => t.type === 'video');
      if (videoTrack) {
        addClip(videoTrack.id, {
          sourceId: source.id,
          startUs: 0,
          trimIn: 0,
          trimOut: source.durationUs,
          label: 'HLS Video',
        });
      }

      resetViewport();
    } catch (err) {
      console.error('Failed to load HLS source:', err);
    } finally {
      setIsLoading(false);
    }
  }, [hlsUrl, loadHlsSource, tracks, addClip, resetViewport]);

  // Handle clip selection
  const handleClipSelect = useCallback((clipId: string) => {
    setSelectedClipId(clipId);
  }, []);

  // Handle seek
  const handleSeek = useCallback((timeUs: number) => {
    seek(timeUs);
  }, [seek]);

  // Handle trim from start (left edge drag)
  const handleClipTrimStart = useCallback((clipId: string, newStartUs: number) => {
    const found = getClip(clipId);
    if (!found) return;

    const { clip } = found;
    const source = composition.getSource(clip.sourceId);
    const sourceDuration = source?.durationUs ?? Infinity;

    clip.trimStart(newStartUs, sourceDuration);
    refresh();
    notifyCompositionChanged();
  }, [getClip, composition, refresh, notifyCompositionChanged]);

  // Handle trim from end (right edge drag)
  const handleClipTrimEnd = useCallback((clipId: string, newEndUs: number) => {
    const found = getClip(clipId);
    if (!found) return;

    const { clip } = found;
    const source = composition.getSource(clip.sourceId);
    const sourceDuration = source?.durationUs ?? Infinity;

    clip.trimEnd(newEndUs, sourceDuration);
    refresh();
    notifyCompositionChanged();
  }, [getClip, composition, refresh, notifyCompositionChanged]);

  // Get loading progress for display
  const loadingProgressPercent = Array.from(loadingProgress.values()).reduce(
    (acc, val) => acc + val,
    0
  ) / Math.max(loadingProgress.size, 1) * 100;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#0a0a0a',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Header */}
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
      </header>

      {/* Main content */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Preview panel */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <VideoPreview
            ref={previewRef}
            width={previewWidth}
            height={previewHeight}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
          />

          {/* Playback controls */}
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <button
              onClick={togglePlayPause}
              style={{
                padding: '8px 24px',
                fontSize: 14,
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>

            <span style={{ fontFamily: 'monospace', fontSize: 14 }}>
              {formatTimecode(currentTimeUs)} / {formatTimecode(durationUs)}
            </span>
          </div>
        </div>

        {/* Sidebar */}
        <aside
          style={{
            width: 300,
            borderLeft: '1px solid #333',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14 }}>Load HLS Source</h3>

          <input
            type="text"
            placeholder="Enter HLS URL (.m3u8)"
            value={hlsUrl}
            onChange={(e) => setHlsUrl(e.target.value)}
            style={{
              padding: '8px 12px',
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#fff',
              fontSize: 13,
            }}
          />

          <button
            onClick={handleLoadHls}
            disabled={isLoading || !hlsUrl}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              backgroundColor: isLoading ? '#333' : '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? `Loading... ${loadingProgressPercent.toFixed(0)}%` : 'Load HLS'}
          </button>

          <hr style={{ border: 'none', borderTop: '1px solid #333' }} />

          <h3 style={{ margin: 0, fontSize: 14 }}>Timeline Controls</h3>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={zoomIn}
              style={{
                flex: 1,
                padding: 8,
                backgroundColor: '#333',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Zoom +
            </button>
            <button
              onClick={zoomOut}
              style={{
                flex: 1,
                padding: 8,
                backgroundColor: '#333',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Zoom -
            </button>
            <button
              onClick={resetViewport}
              style={{
                flex: 1,
                padding: 8,
                backgroundColor: '#333',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Fit
            </button>
          </div>
        </aside>
      </main>

      {/* Timeline */}
      <footer
        style={{
          height: 200,
          borderTop: '1px solid #333',
        }}
      >
        <Timeline
          tracks={tracks}
          currentTimeUs={currentTimeUs}
          durationUs={durationUs}
          viewport={viewport}
          onSeek={handleSeek}
          onClipSelect={handleClipSelect}
          onClipTrimStart={handleClipTrimStart}
          onClipTrimEnd={handleClipTrimEnd}
          selectedClipId={selectedClipId}
          style={{ height: '100%' }}
        />
      </footer>
    </div>
  );
}
