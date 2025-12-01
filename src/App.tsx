import { useEffect, useState } from 'react';
import { useVideoWorker } from './hooks/useVideoWorker';
import { useSpriteWorker } from './hooks/useSpriteWorker';
import { useTimelineViewport } from './hooks/useTimelineViewport';
import { useExportWorker } from './hooks/useExportWorker';
import { VideoPreview } from './components/VideoPreview';
import { Timeline } from './components/Timeline';
import { Controls } from './components/Controls';
import { ExportButton } from './components/ExportButton';
import { secondsToUs } from './utils/time';
import { VIDEO_PREVIEW, TIME, FILE_VALIDATION } from './constants';

const { MICROSECONDS_PER_SECOND } = TIME;

function App() {
  const [fileError, setFileError] = useState<string | null>(null);
  const [loadedFile, setLoadedFile] = useState<File | null>(null);
  const { state, sampleData, initCanvas, loadFile, seek, play, pause, setTrim, requestSampleData } =
    useVideoWorker();

  // Initialize export worker
  const {
    isExporting,
    progress: exportProgress,
    error: exportError,
    hasAudio,
    startExport,
    abortExport,
    clearError: clearExportError,
  } = useExportWorker();

  // Initialize sprite worker with sample data
  const { sprites, isGenerating, progress } = useSpriteWorker(sampleData, state.duration);

  // Initialize timeline viewport for zoom/pan
  const {
    viewport,
    zoomIn,
    zoomOut,
    zoomToFit,
    setViewport,
    canZoomIn,
    canZoomOut,
  } = useTimelineViewport({
    durationUs: secondsToUs(state.duration),
    currentTimeUs: secondsToUs(state.currentTime),
  });

  // Request sample data when video is ready (for sprite generation)
  useEffect(() => {
    if (state.isReady && !sampleData) {
      requestSampleData();
    }
  }, [state.isReady, sampleData, requestSampleData]);

  // Reset viewport when a new video is loaded (duration changes)
  useEffect(() => {
    if (state.duration > 0) {
      zoomToFit();
    }
  }, [state.duration, zoomToFit]);

  // File validation and loading
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear previous error
    setFileError(null);

    // Validate file size
    if (file.size > FILE_VALIDATION.MAX_FILE_SIZE) {
      setFileError(`File is too large. Maximum size is ${FILE_VALIDATION.MAX_FILE_SIZE / 1024 / 1024}MB.`);
      e.target.value = ''; // Reset input
      return;
    }

    // Validate file type
    if (!file.type.startsWith('video/')) {
      setFileError('Please select a valid video file.');
      e.target.value = ''; // Reset input
      return;
    }

    setLoadedFile(file);
    loadFile(file);
  };

  // Handle export request
  const handleExport = () => {
    if (!loadedFile || !state.clip) return;
    startExport(loadedFile, state.clip.inPoint, state.clip.outPoint);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Video Editor MVP</h1>

        {/* Video Preview */}
        <div className="flex justify-center mb-6">
          <VideoPreview
            onCanvasReady={initCanvas}
            width={VIDEO_PREVIEW.WIDTH}
            height={VIDEO_PREVIEW.HEIGHT}
          />
        </div>

        {/* Controls Panel */}
        <div className="bg-gray-800 rounded-lg p-4 space-y-4">
          {/* File Input */}
          <div>
            <input
              type="file"
              accept="video/mp4,video/webm"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-400
                file:mr-4 file:py-2 file:px-4
                file:rounded file:border-0
                file:text-sm file:font-medium
                file:bg-blue-600 file:text-white
                hover:file:bg-blue-700
                file:cursor-pointer"
            />
            {fileError && (
              <div className="mt-2 text-sm text-red-400" role="alert">
                {fileError}
              </div>
            )}
          </div>

          {/* Playback Controls */}
          {state.isReady && (
            <>
              <div className="flex items-center justify-between gap-4">
                <Controls
                  isPlaying={state.isPlaying}
                  currentTime={state.currentTime}
                  duration={state.duration}
                  onPlay={play}
                  onPause={pause}
                />
                <ExportButton
                  disabled={!state.isReady || isExporting || !loadedFile}
                  isExporting={isExporting}
                  progress={exportProgress}
                  error={exportError}
                  hasAudio={hasAudio}
                  onExport={handleExport}
                  onAbort={abortExport}
                  onClearError={clearExportError}
                />
              </div>

              {/* Timeline */}
              <div className="pt-6">
                <Timeline
                  duration={state.duration}
                  currentTime={state.currentTime}
                  inPoint={state.clip?.inPoint ?? 0}
                  outPoint={state.clip?.outPoint ?? secondsToUs(state.duration)}
                  onSeek={seek}
                  onTrimChange={setTrim}
                  sprites={sprites}
                  isGeneratingSprites={isGenerating}
                  spriteProgress={progress}
                  viewport={viewport}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onZoomToFit={zoomToFit}
                  onViewportChange={setViewport}
                  canZoomIn={canZoomIn}
                  canZoomOut={canZoomOut}
                />
              </div>

              {/* Trim Info */}
              {state.clip && (
                <div className="text-xs text-gray-400 flex gap-4">
                  <span>
                    In: {(state.clip.inPoint / MICROSECONDS_PER_SECOND).toFixed(2)}s
                  </span>
                  <span>
                    Out: {(state.clip.outPoint / MICROSECONDS_PER_SECOND).toFixed(2)}s
                  </span>
                  <span>
                    Duration: {((state.clip.outPoint - state.clip.inPoint) / MICROSECONDS_PER_SECOND).toFixed(2)}s
                  </span>
                </div>
              )}
            </>
          )}

          {/* Loading State */}
          {!state.isReady && (
            <div className="text-center text-gray-500 py-4">
              Load an MP4 video to get started
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
