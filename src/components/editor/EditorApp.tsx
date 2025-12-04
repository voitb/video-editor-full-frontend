/**
 * Video Editor V2 - Example Editor Application
 * Demonstrates how to use the video editor components together.
 */

import { useRef, useState } from 'react';
import { useComposition } from '../../hooks/useComposition';
import { useEngine } from '../../hooks/useEngine';
import { useTimeline } from '../../hooks/useTimeline';
import { useExportRange } from '../../hooks/useExportRange';
import type { VideoPreviewHandle } from '../VideoPreview';
import { Timeline } from '../Timeline';
import { PlaybackControls } from '../PlaybackControls';
import { TabbedSidebar, type SidebarTab } from '../sidebar';
import { ExportModal } from '../ExportModal';
import {
  useEditorCallbacks,
  useEditorEffects,
  useEditorKeyboard,
  useEditorHelpers,
} from './hooks';
import { EditorHeader, EditorPreview } from './components';

export interface EditorAppProps {
  /** Width of the preview canvas */
  previewWidth?: number;
  /** Height of the preview canvas */
  previewHeight?: number;
}

/**
 * Complete video editor application component.
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
    config: { width: 1920, height: 1080, frameRate: 60 },
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
  const callbacks = useEditorCallbacks({
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

  // Editor effects (initialization, volume sync, container sizing)
  useEditorEffects({
    previewRef,
    previewContainerRef,
    composition,
    volume,
    initialize,
    setMasterVolume,
    refresh,
    setActualContainerSize,
  });

  // Keyboard shortcuts
  useEditorKeyboard({
    currentTimeUs,
    selectedClipId,
    setInPoint,
    setOutPoint,
    clearInPoint,
    clearOutPoint,
    handleClipDelete: callbacks.handleClipDelete,
  });

  // Export helpers
  const { getTracksJSON, getSourceData } = useEditorHelpers({
    composition,
    getSourceBuffer,
  });

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
      <EditorHeader
        state={state}
        error={error ?? undefined}
        linkedSelection={linkedSelection}
        durationUs={durationUs}
        onLinkedSelectionToggle={() => setLinkedSelection(!linkedSelection)}
        onExportClick={() => setShowExportModal(true)}
      />

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
          <EditorPreview
            previewRef={previewRef}
            previewContainerRef={previewContainerRef}
            previewWidth={previewWidth}
            previewHeight={previewHeight}
            compositionWidth={composition.config.width}
            compositionHeight={composition.config.height}
            actualContainerSize={actualContainerSize}
            currentTimeUs={currentTimeUs}
            tracks={tracks}
            selectedClipId={selectedClipId}
            isPlaying={isPlaying}
            onOverlayPositionChange={callbacks.handleOverlayPositionChange}
          />

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
          onLoadHls={callbacks.handleLoadHls}
          onLoadFile={callbacks.handleLoadFile}
          isLoading={isLoading}
          loadingProgress={loadingProgressPercent}
          tracks={tracks}
          selectedClipId={selectedClipId}
          currentTimeUs={currentTimeUs}
          onSeek={seek}
          onSubtitleClipUpdate={callbacks.handleSubtitleClipUpdate}
          onAddSubtitleClip={callbacks.handleAddSubtitleClip}
          onSubtitleClipSelect={callbacks.handleClipSelect}
          onOverlayClipUpdate={callbacks.handleOverlayClipUpdate}
          onAddOverlayClip={callbacks.handleAddOverlayClip}
          onOverlayClipSelect={callbacks.handleOverlayClipSelect}
          onRefresh={refresh}
          onTrackAdd={callbacks.handleTrackAdd}
        />
      </main>

      {/* Timeline */}
      <footer style={{ height: 280, borderTop: '1px solid #333' }}>
        <Timeline
          tracks={tracks}
          currentTimeUs={currentTimeUs}
          durationUs={durationUs}
          viewport={viewport}
          onSeek={callbacks.handleSeek}
          onClipSelect={callbacks.handleClipSelect}
          onClipMove={callbacks.handleClipMove}
          onClipMoveToTrack={callbacks.handleClipMoveToTrack}
          onClipTrimStart={callbacks.handleClipTrimStart}
          onClipTrimEnd={callbacks.handleClipTrimEnd}
          onTrackAdd={callbacks.handleTrackAdd}
          onTrackRemove={callbacks.handleTrackRemove}
          onClipUnlink={callbacks.handleClipUnlink}
          onZoomAtPosition={zoomAtPosition}
          onZoomChange={setZoom}
          onViewportScroll={setViewportFromScroll}
          getScrollLeft={getScrollLeft}
          trackStates={trackStates}
          onTrackMute={setTrackMuted}
          onTrackSolo={setTrackSolo}
          onTrackLock={setTrackLocked}
          onTrackResize={setTrackHeight}
          onTrackRename={callbacks.handleTrackRename}
          onTrackColorChange={callbacks.handleTrackColorChange}
          onTrackInsert={callbacks.handleTrackInsert}
          onTrackReorder={callbacks.handleTrackReorder}
          onFitToView={() => resetViewport(durationUs)}
          onExternalDropToTrack={callbacks.handleExternalDropToTrack}
          onClipDelete={callbacks.handleClipDelete}
          selectedClipId={selectedClipId}
          linkedSelection={linkedSelection}
          inPointUs={inPointUs}
          outPointUs={outPointUs}
          hasInPoint={hasInPoint}
          hasOutPoint={hasOutPoint}
          onAddSubtitleClip={callbacks.handleAddSubtitleClipAtPosition}
          onSubtitleEdit={callbacks.handleSubtitleEdit}
          onSubtitleTrimStart={callbacks.handleSubtitleTrimStart}
          onSubtitleTrimEnd={callbacks.handleSubtitleTrimEnd}
          onSubtitleMoveToTrack={callbacks.handleSubtitleMoveToTrack}
          onSubtitleMove={callbacks.handleSubtitleMove}
          onSubtitleDuplicate={callbacks.handleSubtitleDuplicate}
          onSubtitleSplit={callbacks.handleSubtitleSplit}
          onSubtitleAddCue={callbacks.handleSubtitleAddCue}
          onAddOverlayClip={callbacks.handleAddOverlayClipAtPosition}
          onOverlayEdit={callbacks.handleOverlayEdit}
          onOverlayTrimStart={callbacks.handleOverlayTrimStart}
          onOverlayTrimEnd={callbacks.handleOverlayTrimEnd}
          onOverlayMoveToTrack={callbacks.handleOverlayMoveToTrack}
          onOverlayMove={callbacks.handleOverlayMove}
          onOverlayDuplicate={callbacks.handleOverlayDuplicate}
          onOverlaySplit={callbacks.handleOverlaySplit}
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
          frameRate: 60,
        }}
        getTracksJSON={getTracksJSON}
        getSourceData={getSourceData}
      />
    </div>
  );
}
