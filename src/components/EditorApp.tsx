/**
 * Video Editor V2 - Example Editor Application
 * Demonstrates how to use the video editor components together.
 */

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useComposition } from '../hooks/useComposition';
import { useEngine } from '../hooks/useEngine';
import { useTimeline } from '../hooks/useTimeline';
import { VideoPreview, type VideoPreviewHandle } from './VideoPreview';
import { Timeline } from './Timeline';
import { PlaybackControls } from './PlaybackControls';
import { MediaLibrary } from './MediaLibrary';
import { MEDIA_LIBRARY } from '../constants';

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
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolume] = useState(1);

  // Refs
  const previewRef = useRef<VideoPreviewHandle>(null);

  // Hooks
  const {
    composition,
    tracks,
    durationUs,
    createTrack,
    removeTrack,
    addVideoClipWithAudio,
    getClip,
    moveClipWithLinked,
    moveClipToTrack,
    unlinkClip,
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
    setMasterVolume,
    notifyCompositionChanged,
  } = useEngine({ composition });

  const {
    viewport,
    resetViewport,
    zoomAtPosition,
    setZoom,
    setViewportFromScroll,
    getScrollLeft,
    trackStates,
    setTrackMuted,
    setTrackSolo,
    setTrackLocked,
    setTrackHeight,
  } = useTimeline({ durationUs });

  // Sort tracks: video tracks first, then audio tracks (professional NLE layout)
  // Use tracks.length as dependency to ensure re-computation when tracks are added/removed
  const sortedTracks = useMemo(() => {
    const videoTracks = tracks.filter(t => t.type === 'video');
    const audioTracks = tracks.filter(t => t.type === 'audio');
    return [...videoTracks, ...audioTracks];
  }, [tracks, tracks.length]);

  // Initialize engine when canvas is ready
  useEffect(() => {
    const canvas = previewRef.current?.getCanvas();
    if (canvas) {
      initialize(canvas);
    }
  }, [initialize]);

  // Create default tracks on mount
  useEffect(() => {
    if (composition.tracks.length === 0) {
      composition.createTrack({ type: 'video', label: 'Video 1' });
      composition.createTrack({ type: 'audio', label: 'Audio 1' });
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync volume state to engine
  useEffect(() => {
    setMasterVolume(volume);
  }, [volume, setMasterVolume]);

  // Load HLS source (does NOT auto-add to timeline - user drags from library)
  const handleLoadHls = useCallback(async (url: string) => {
    if (!url) return;

    setIsLoading(true);
    try {
      const source = await loadHlsSource(url);
      // Reset viewport to fit the new source duration
      resetViewport(source.durationUs);
    } catch (err) {
      console.error('Failed to load HLS source:', err);
    } finally {
      setIsLoading(false);
    }
  }, [loadHlsSource, resetViewport]);

  // Handle external drop from media library to timeline
  const handleExternalDropToTrack = useCallback((
    sourceId: string,
    targetTrackId: string,
    startTimeUs: number
  ) => {
    const source = composition.getSource(sourceId);
    const track = tracks.find(t => t.id === targetTrackId);
    if (!source || !track) return;

    if (track.type === 'video') {
      // Video track: create linked video + audio clips
      addVideoClipWithAudio(targetTrackId, {
        sourceId,
        startUs: startTimeUs,
        trimIn: 0,
        trimOut: source.durationUs,
        label: 'HLS Video',
      });
    }
    // Note: For audio-only drops, you could add audio clip creation here

    notifyCompositionChanged();
  }, [composition, tracks, addVideoClipWithAudio, notifyCompositionChanged]);

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

  // Handle clip move (horizontal) - moves linked clips together
  const handleClipMove = useCallback((clipId: string, newStartUs: number): boolean => {
    const success = moveClipWithLinked(clipId, newStartUs);
    if (success) {
      notifyCompositionChanged();
    }
    return success;
  }, [moveClipWithLinked, notifyCompositionChanged]);

  // Handle clip move to different track
  const handleClipMoveToTrack = useCallback((clipId: string, targetTrackId: string, newStartUs: number): boolean => {
    const success = moveClipToTrack(clipId, targetTrackId, newStartUs);
    if (success) {
      notifyCompositionChanged();
    }
    return success;
  }, [moveClipToTrack, notifyCompositionChanged]);

  // Handle adding a new track
  const handleTrackAdd = useCallback((type: 'video' | 'audio') => {
    const trackCount = tracks.filter(t => t.type === type).length + 1;
    const label = type === 'video' ? `Video ${trackCount}` : `Audio ${trackCount}`;
    createTrack({ type, label });
  }, [createTrack, tracks]);

  // Handle removing a track
  const handleTrackRemove = useCallback((trackId: string) => {
    removeTrack(trackId);
    notifyCompositionChanged();
  }, [removeTrack, notifyCompositionChanged]);

  // Handle unlinking a clip
  const handleClipUnlink = useCallback((clipId: string) => {
    unlinkClip(clipId);
  }, [unlinkClip]);

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
        {/* Preview panel - fixed layout to prevent shifting */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 16,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          {/* Preview wrapper - fills available space with max constraints */}
          <div
            style={{
              flex: 1,
              width: '100%',
              maxWidth: previewWidth,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minHeight: 0,
            }}
          >
            {/* Canvas container - maintains aspect ratio */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxHeight: `calc(100% - 60px)`,
                aspectRatio: `${previewWidth} / ${previewHeight}`,
                backgroundColor: '#000',
                borderRadius: 4,
                overflow: 'hidden',
                flexShrink: 1,
              }}
            >
              <VideoPreview
                ref={previewRef}
                width={previewWidth}
                height={previewHeight}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          </div>

          {/* Playback controls - fixed at bottom */}
          <div style={{ flexShrink: 0, width: '100%', maxWidth: previewWidth }}>
            <PlaybackControls
              isPlaying={isPlaying}
              currentTimeUs={currentTimeUs}
              durationUs={durationUs}
              volume={volume}
              onPlayPause={togglePlayPause}
              onSkipBack={(delta) => seek(Math.max(0, currentTimeUs - delta))}
              onSkipForward={(delta) => seek(Math.min(durationUs, currentTimeUs + delta))}
              onVolumeChange={setVolume}
            />
          </div>
        </div>

        {/* Media Library Sidebar */}
        <aside
          style={{
            width: MEDIA_LIBRARY.WIDTH,
            borderLeft: '1px solid #333',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <MediaLibrary
            sources={composition.sources}
            onLoadHls={handleLoadHls}
            isLoading={isLoading}
            loadingProgress={loadingProgressPercent}
          />
        </aside>
      </main>

      {/* Timeline */}
      <footer
        style={{
          height: 280,
          borderTop: '1px solid #333',
        }}
      >
        <Timeline
          tracks={sortedTracks}
          currentTimeUs={currentTimeUs}
          durationUs={durationUs}
          viewport={viewport}
          onSeek={handleSeek}
          onClipSelect={handleClipSelect}
          onClipMove={handleClipMove}
          onClipMoveToTrack={handleClipMoveToTrack}
          onClipTrimStart={handleClipTrimStart}
          onClipTrimEnd={handleClipTrimEnd}
          onTrackAdd={handleTrackAdd}
          onTrackRemove={handleTrackRemove}
          onClipUnlink={handleClipUnlink}
          onZoomAtPosition={zoomAtPosition}
          onZoomChange={setZoom}
          onViewportScroll={setViewportFromScroll}
          getScrollLeft={getScrollLeft}
          trackStates={trackStates}
          onTrackMute={setTrackMuted}
          onTrackSolo={setTrackSolo}
          onTrackLock={setTrackLocked}
          onTrackResize={setTrackHeight}
          onFitToView={() => resetViewport(durationUs)}
          onExternalDropToTrack={handleExternalDropToTrack}
          selectedClipId={selectedClipId}
          style={{ height: '100%' }}
        />
      </footer>
    </div>
  );
}
