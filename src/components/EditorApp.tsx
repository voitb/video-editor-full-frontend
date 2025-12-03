/**
 * Video Editor V2 - Example Editor Application
 * Demonstrates how to use the video editor components together.
 */

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useComposition } from '../hooks/useComposition';
import { useEngine } from '../hooks/useEngine';
import { useTimeline } from '../hooks/useTimeline';
import { useExportRange } from '../hooks/useExportRange';
import { VideoPreview, type VideoPreviewHandle } from './VideoPreview';
import { Timeline } from './Timeline';
import { PlaybackControls } from './PlaybackControls';
import { MediaLibrary } from './MediaLibrary';
import { ExportModal } from './ExportModal';
import { SubtitleOverlay } from './SubtitleOverlay';
import { SubtitlePanel } from './SubtitlePanel';
import { MEDIA_LIBRARY } from '../constants';
import type { ExportSourceData } from '../workers/messages/exportMessages';

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
  const [showExportModal, setShowExportModal] = useState(false);
  const [linkedSelection, setLinkedSelection] = useState(true);

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
    loadFileSource,
    togglePlayPause,
    seek,
    setMasterVolume,
    notifyCompositionChanged,
    getSourceBuffer,
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

  const {
    inPointUs,
    outPointUs,
    hasInPoint,
    hasOutPoint,
    setInPoint,
    setOutPoint,
    clearInPoint,
    clearOutPoint,
  } = useExportRange({ durationUs });

  // Sort tracks: video tracks first, then audio tracks, then subtitle tracks (professional NLE layout)
  // Use tracks.length as dependency to ensure re-computation when tracks are added/removed
  const sortedTracks = useMemo(() => {
    const videoTracks = tracks.filter(t => t.type === 'video');
    const audioTracks = tracks.filter(t => t.type === 'audio');
    const subtitleTracks = tracks.filter(t => t.type === 'subtitle');
    return [...videoTracks, ...audioTracks, ...subtitleTracks];
  }, [tracks, tracks.length]);

  // Check if the selected clip is a subtitle clip (for conditional panel rendering)
  const selectedSubtitleClip = useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of tracks) {
      if (track.type !== 'subtitle') continue;
      for (const clip of track.clips) {
        if (clip.id === selectedClipId) {
          return clip;
        }
      }
    }
    return null;
  }, [selectedClipId, tracks]);

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

  // Load local file source (does NOT auto-add to timeline - user drags from library)
  const handleLoadFile = useCallback(async (file: File) => {
    if (!file) return;

    setIsLoading(true);
    try {
      const source = await loadFileSource(file);
      // Reset viewport to fit the new source duration
      resetViewport(source.durationUs);
    } catch (err) {
      console.error('Failed to load file source:', err);
    } finally {
      setIsLoading(false);
    }
  }, [loadFileSource, resetViewport]);

  // Handle external drop from media library to timeline
  const handleExternalDropToTrack = useCallback((
    sourceId: string,
    targetTrackId: string,
    startTimeUs: number
  ) => {
    const source = composition.getSource(sourceId);
    const track = tracks.find(t => t.id === targetTrackId);
    if (!source || !track) return;

    const isAudioOnlySource = source.isAudioOnly;
    const fileName = 'fileName' in source && typeof source.fileName === 'string'
      ? source.fileName
      : undefined;

    if (isAudioOnlySource) {
      // Audio-only source
      if (track.type === 'audio') {
        // Drop on audio track: create audio clip
        composition.addClipToTrack(targetTrackId, {
          sourceId,
          startUs: startTimeUs,
          trimIn: 0,
          trimOut: source.durationUs,
          label: fileName || 'Audio',
          volume: 1,
        });
        refresh();
      } else {
        // Cannot drop audio-only source on video track
        console.warn('Cannot drop audio-only source on video track');
        return;
      }
    } else if (track.type === 'video') {
      // Video source on video track: create linked video + audio clips
      addVideoClipWithAudio(targetTrackId, {
        sourceId,
        startUs: startTimeUs,
        trimIn: 0,
        trimOut: source.durationUs,
        label: fileName || 'Video',
      });
    } else {
      // Video source on audio track: create audio-only clip
      composition.addClipToTrack(targetTrackId, {
        sourceId,
        startUs: startTimeUs,
        trimIn: 0,
        trimOut: source.durationUs,
        label: fileName ? `Audio from ${fileName}` : 'Audio',
        volume: 1,
      });
      refresh();
    }

    notifyCompositionChanged();
  }, [composition, tracks, addVideoClipWithAudio, refresh, notifyCompositionChanged]);

  // Handle clip selection
  const handleClipSelect = useCallback((clipId: string) => {
    setSelectedClipId(clipId);
  }, []);

  // Handle seek
  const handleSeek = useCallback((timeUs: number) => {
    seek(timeUs);
  }, [seek]);

  // Helper to get source duration for trimming
  const getSourceDuration = useCallback((sourceId: string): number => {
    const source = composition.getSource(sourceId);
    return source?.durationUs ?? Infinity;
  }, [composition]);

  // Handle trim from start (left edge drag) - trims linked clips together
  const handleClipTrimStart = useCallback((clipId: string, newStartUs: number) => {
    composition.trimStartWithLinked(clipId, newStartUs, getSourceDuration);
    refresh();
    notifyCompositionChanged();
  }, [composition, getSourceDuration, refresh, notifyCompositionChanged]);

  // Handle trim from end (right edge drag) - trims linked clips together
  const handleClipTrimEnd = useCallback((clipId: string, newEndUs: number) => {
    composition.trimEndWithLinked(clipId, newEndUs, getSourceDuration);
    refresh();
    notifyCompositionChanged();
  }, [composition, getSourceDuration, refresh, notifyCompositionChanged]);

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
  const handleTrackAdd = useCallback((type: 'video' | 'audio' | 'subtitle') => {
    const trackCount = tracks.filter(t => t.type === type).length + 1;
    const label = type === 'video'
      ? `Video ${trackCount}`
      : type === 'audio'
      ? `Audio ${trackCount}`
      : `Subtitles ${trackCount}`;
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

  // Handle deleting a clip (respects linkedSelection)
  const handleClipDelete = useCallback((clipId: string) => {
    if (linkedSelection) {
      composition.removeClipWithLinked(clipId);
    } else {
      composition.removeClip(clipId);
    }
    // Clear selection if deleted clip was selected
    if (selectedClipId === clipId) {
      setSelectedClipId(undefined);
    }
    refresh();
    notifyCompositionChanged();
  }, [composition, linkedSelection, selectedClipId, refresh, notifyCompositionChanged]);

  // Handle creating a subtitle track
  const handleCreateSubtitleTrack = useCallback(() => {
    const subtitleCount = tracks.filter((t) => t.type === 'subtitle').length + 1;
    createTrack({ type: 'subtitle', label: `Subtitles ${subtitleCount}` });
  }, [createTrack, tracks]);

  // Handle adding a subtitle clip
  const handleAddSubtitleClip = useCallback(
    (trackId: string, clip: import('../core/SubtitleClip').SubtitleClip) => {
      const track = composition.getTrack(trackId);
      if (!track || track.type !== 'subtitle') return;
      track.addClip(clip);
      refresh();
      notifyCompositionChanged();
      // Select the new clip
      setSelectedClipId(clip.id);
    },
    [composition, refresh, notifyCompositionChanged]
  );

  // Handle updating a subtitle clip (trigger refresh)
  const handleSubtitleClipUpdate = useCallback(
    (_clipId: string, _clip: import('../core/SubtitleClip').SubtitleClip) => {
      refresh();
      notifyCompositionChanged();
    },
    [refresh, notifyCompositionChanged]
  );

  // Handle adding a new empty subtitle clip at a specific position (from timeline right-click)
  const handleAddSubtitleClipAtPosition = useCallback(
    async (trackId: string, startUs: number) => {
      const track = composition.getTrack(trackId);
      if (!track || track.type !== 'subtitle') return;

      // Dynamically import SubtitleClip to create an empty one
      const { SubtitleClip } = await import('../core/SubtitleClip');
      const newClip = SubtitleClip.createEmpty(startUs);
      track.addClip(newClip);
      refresh();
      notifyCompositionChanged();
      // Select the new clip for immediate editing
      setSelectedClipId(newClip.id);
    },
    [composition, refresh, notifyCompositionChanged]
  );

  // Handle subtitle edit request (from timeline double-click or context menu)
  const handleSubtitleEdit = useCallback((clipId: string) => {
    // Just select the clip - SubtitlePanel will show automatically when a subtitle clip is selected
    setSelectedClipId(clipId);
  }, []);

  // Keyboard shortcuts for In/Out points and Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'i':
          if (e.altKey || e.metaKey) {
            clearInPoint();
          } else {
            setInPoint(currentTimeUs);
          }
          e.preventDefault();
          break;
        case 'o':
          if (e.altKey || e.metaKey) {
            clearOutPoint();
          } else {
            setOutPoint(currentTimeUs);
          }
          e.preventDefault();
          break;
        case 'delete':
        case 'backspace':
          if (selectedClipId) {
            handleClipDelete(selectedClipId);
            e.preventDefault();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTimeUs, selectedClipId, setInPoint, setOutPoint, clearInPoint, clearOutPoint, handleClipDelete]);

  // Get tracks JSON for export
  const getTracksJSON = useCallback(() => {
    return composition.tracks.map(track => track.toJSON());
  }, [composition]);

  // Get source data for export
  const getSourceData = useCallback(async (): Promise<ExportSourceData[]> => {
    const sourcesData: ExportSourceData[] = [];

    for (const source of composition.sources.values()) {
      // Get the source buffer from engine
      const buffer = getSourceBuffer(source.id);
      if (!buffer) continue;

      sourcesData.push({
        sourceId: source.id,
        buffer: buffer.slice(0), // Clone buffer
        durationUs: source.durationUs,
        width: source.width,
        height: source.height,
        hasVideo: true,
        hasAudio: source.hasAudio,
      });
    }

    return sourcesData;
  }, [composition, getSourceBuffer]);

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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Linked Selection Toggle */}
          <button
            onClick={() => setLinkedSelection(!linkedSelection)}
            title={linkedSelection ? 'Linked Selection ON - Click to disable' : 'Linked Selection OFF - Click to enable'}
            style={{
              padding: '4px 8px',
              backgroundColor: linkedSelection ? '#4a90d9' : '#333',
              border: linkedSelection ? '1px solid #5aa0e9' : '1px solid #555',
              borderRadius: 4,
              color: '#fff',
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Link
          </button>
          <span style={{ fontSize: 11, color: '#666', alignSelf: 'center' }}>
            I/O: Set In/Out
          </span>
          <button
            onClick={() => setShowExportModal(true)}
            disabled={durationUs === 0}
            style={{
              padding: '6px 16px',
              backgroundColor: durationUs === 0 ? '#333' : '#4a90d9',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              cursor: durationUs === 0 ? 'not-allowed' : 'pointer',
              opacity: durationUs === 0 ? 0.5 : 1,
            }}
          >
            Export
          </button>
        </div>
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
              {/* Subtitle overlay for preview */}
              <SubtitleOverlay
                currentTimeUs={currentTimeUs}
                tracks={tracks}
                compositionWidth={composition.config.width}
                compositionHeight={composition.config.height}
                containerWidth={previewWidth}
                containerHeight={previewHeight}
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
            onLoadFile={handleLoadFile}
            isLoading={isLoading}
            loadingProgress={loadingProgressPercent}
          />
        </aside>

        {/* Subtitle Panel - only show when subtitle clip is selected */}
        {selectedSubtitleClip && (
          <SubtitlePanel
            tracks={tracks}
            selectedClipId={selectedClipId}
            currentTimeUs={currentTimeUs}
            onSeek={seek}
            onClipUpdate={handleSubtitleClipUpdate}
            onCreateTrack={handleCreateSubtitleTrack}
            onAddClip={handleAddSubtitleClip}
            onClipSelect={handleClipSelect}
            onRefresh={refresh}
          />
        )}
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
          onClipDelete={handleClipDelete}
          selectedClipId={selectedClipId}
          linkedSelection={linkedSelection}
          inPointUs={inPointUs}
          outPointUs={outPointUs}
          hasInPoint={hasInPoint}
          hasOutPoint={hasOutPoint}
          onAddSubtitleClip={handleAddSubtitleClipAtPosition}
          onSubtitleEdit={handleSubtitleEdit}
          style={{ height: '100%' }}
        />
      </footer>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        inPointUs={inPointUs}
        outPointUs={outPointUs}
        compositionConfig={{
          width: 1920,
          height: 1080,
          frameRate: 30,
        }}
        getTracksJSON={getTracksJSON}
        getSourceData={getSourceData}
      />
    </div>
  );
}
