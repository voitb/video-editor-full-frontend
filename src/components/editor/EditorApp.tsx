/**
 * Video Editor V2 - Example Editor Application
 * Demonstrates how to use the video editor components together.
 */

import { useRef, useEffect, useState } from 'react';
import { useComposition } from '../../hooks/useComposition';
import { useEngine } from '../../hooks/useEngine';
import { useTimeline } from '../../hooks/useTimeline';
import { useExportRange } from '../../hooks/useExportRange';
import { VideoPreview, type VideoPreviewHandle } from '../VideoPreview';
import { Timeline } from '../Timeline';
import { PlaybackControls } from '../PlaybackControls';
import { TabbedSidebar, type SidebarTab } from '../sidebar';
import { ExportModal } from '../ExportModal';
import { SubtitleOverlay } from '../SubtitleOverlay';
import { HtmlOverlay } from '../HtmlOverlay';
import { useEditorCallbacks } from './hooks';
import type { ExportSourceData } from '../../workers/messages/exportMessages';

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
  const [activeTab, setActiveTab] = useState<SidebarTab>('media');
  const [actualContainerSize, setActualContainerSize] = useState({
    width: previewWidth,
    height: previewHeight,
  });

  // Refs
  const previewRef = useRef<VideoPreviewHandle>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

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

  // Callbacks (extracted to useEditorCallbacks hook)
  const {
    handleLoadHls,
    handleLoadFile,
    handleExternalDropToTrack,
    handleClipSelect,
    handleSeek,
    handleClipTrimStart,
    handleClipTrimEnd,
    handleClipMove,
    handleClipMoveToTrack,
    handleClipUnlink,
    handleClipDelete,
    handleTrackAdd,
    handleTrackRemove,
    handleTrackRename,
    handleTrackColorChange,
    handleTrackInsert,
    handleTrackReorder,
    handleAddSubtitleClip,
    handleSubtitleClipUpdate,
    handleAddSubtitleClipAtPosition,
    handleSubtitleEdit,
    handleSubtitleTrimStart,
    handleSubtitleTrimEnd,
    handleSubtitleMove,
    handleSubtitleMoveToTrack,
    handleSubtitleDuplicate,
    handleSubtitleSplit,
    handleSubtitleAddCue,
    handleAddOverlayClip,
    handleAddOverlayClipAtPosition,
    handleOverlayClipUpdate,
    handleOverlayPositionChange,
    handleOverlayTrimStart,
    handleOverlayTrimEnd,
    handleOverlayMove,
    handleOverlayMoveToTrack,
    handleOverlayDuplicate,
    handleOverlaySplit,
    handleOverlayClipSelect,
    handleOverlayEdit,
  } = useEditorCallbacks({
    composition,
    tracks,
    currentTimeUs,
    selectedClipId,
    linkedSelection,
    addVideoClipWithAudio,
    moveClipWithLinked,
    moveClipToTrack,
    unlinkClip,
    createTrack,
    removeTrack,
    refresh,
    loadHlsSource,
    loadFileSource,
    seek,
    notifyCompositionChanged,
    resetViewport,
    setIsLoading,
    setSelectedClipId,
    setActiveTab,
    setInPoint,
    setOutPoint,
    clearInPoint,
    clearOutPoint,
  });

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

  // Measure actual preview container dimensions for accurate overlay positioning
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setActualContainerSize({ width: rect.width, height: rect.height });
      }
    };

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
    updateSize();

    return () => resizeObserver.disconnect();
  }, []);

  // Keyboard shortcuts for In/Out points and Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  const getTracksJSON = () => {
    return composition.tracks.map(track => track.toJSON());
  };

  // Get source data for export
  const getSourceData = async (): Promise<ExportSourceData[]> => {
    const sourcesData: ExportSourceData[] = [];

    for (const source of composition.sources.values()) {
      const buffer = getSourceBuffer(source.id);
      if (!buffer) continue;

      sourcesData.push({
        sourceId: source.id,
        buffer: buffer.slice(0),
        durationUs: source.durationUs,
        width: source.width,
        height: source.height,
        hasVideo: true,
        hasAudio: source.hasAudio,
      });
    }

    return sourcesData;
  };

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
        {/* Preview panel */}
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
          {/* Preview wrapper */}
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
            {/* Canvas container */}
            <div
              ref={previewContainerRef}
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
              <SubtitleOverlay
                currentTimeUs={currentTimeUs}
                tracks={tracks}
                compositionWidth={composition.config.width}
                compositionHeight={composition.config.height}
                containerWidth={actualContainerSize.width}
                containerHeight={actualContainerSize.height}
              />
              <HtmlOverlay
                currentTimeUs={currentTimeUs}
                tracks={tracks}
                compositionWidth={composition.config.width}
                compositionHeight={composition.config.height}
                containerWidth={actualContainerSize.width}
                containerHeight={actualContainerSize.height}
                selectedClipId={selectedClipId}
                onPositionChange={handleOverlayPositionChange}
                isInteractive={!isPlaying}
              />
            </div>
          </div>

          {/* Playback controls */}
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

        {/* Tabbed Sidebar */}
        <TabbedSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          sources={composition.sources}
          onLoadHls={handleLoadHls}
          onLoadFile={handleLoadFile}
          isLoading={isLoading}
          loadingProgress={loadingProgressPercent}
          tracks={tracks}
          selectedClipId={selectedClipId}
          currentTimeUs={currentTimeUs}
          onSeek={seek}
          onSubtitleClipUpdate={handleSubtitleClipUpdate}
          onAddSubtitleClip={handleAddSubtitleClip}
          onSubtitleClipSelect={handleClipSelect}
          onOverlayClipUpdate={handleOverlayClipUpdate}
          onAddOverlayClip={handleAddOverlayClip}
          onOverlayClipSelect={handleOverlayClipSelect}
          onRefresh={refresh}
          onTrackAdd={handleTrackAdd}
        />
      </main>

      {/* Timeline */}
      <footer
        style={{
          height: 280,
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
          onTrackRename={handleTrackRename}
          onTrackColorChange={handleTrackColorChange}
          onTrackInsert={handleTrackInsert}
          onTrackReorder={handleTrackReorder}
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
          onSubtitleTrimStart={handleSubtitleTrimStart}
          onSubtitleTrimEnd={handleSubtitleTrimEnd}
          onSubtitleMoveToTrack={handleSubtitleMoveToTrack}
          onSubtitleMove={handleSubtitleMove}
          onSubtitleDuplicate={handleSubtitleDuplicate}
          onSubtitleSplit={handleSubtitleSplit}
          onSubtitleAddCue={handleSubtitleAddCue}
          onAddOverlayClip={handleAddOverlayClipAtPosition}
          onOverlayEdit={handleOverlayEdit}
          onOverlayTrimStart={handleOverlayTrimStart}
          onOverlayTrimEnd={handleOverlayTrimEnd}
          onOverlayMoveToTrack={handleOverlayMoveToTrack}
          onOverlayMove={handleOverlayMove}
          onOverlayDuplicate={handleOverlayDuplicate}
          onOverlaySplit={handleOverlaySplit}
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
