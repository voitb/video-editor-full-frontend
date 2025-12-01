import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useVideoWorker } from './hooks/useVideoWorker';
import { useTimelineViewport } from './hooks/useTimelineViewport';
import { useExportWorker } from './hooks/useExportWorker';
import { useHlsLoader } from './hooks/useHlsLoader';
import { VideoPreview } from './components/VideoPreview';
import { Timeline } from './components/Timeline';
import { Controls } from './components/Controls';
import { ExportButton } from './components/ExportButton';
import { HlsUrlInput } from './components/HlsUrlInput';
import { secondsToUs } from './utils/time';
import { createId } from './utils/id';
import { getMediaDurationSeconds } from './utils/media';
import { VIDEO_PREVIEW, TIME, FILE_VALIDATION } from './constants';
import type { MediaTrack } from './types/editor';

type SourceType = 'file' | 'hls';

const { MICROSECONDS_PER_SECOND } = TIME;

function App() {
  const [fileError, setFileError] = useState<string | null>(null);
  const [loadedFile, setLoadedFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>('file');
  const [tracks, setTracks] = useState<MediaTrack[]>([]);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [isAddingOverlay, setIsAddingOverlay] = useState(false);
  const [currentRecording, setCurrentRecording] = useState<{
    id: string;
    label: string;
    sourceType: SourceType;
    hasAudio: boolean;
  } | null>(null);
  const recordingAddedRef = useRef<string | null>(null);
  const hlsBufferRef = useRef<ArrayBuffer | null>(null);
  const {
    state,
    firstFrameUrl,
    initCanvas,
    loadFile,
    startStream,
    appendStreamChunk,
    seek,
    play,
    pause,
    setTrim,
  } = useVideoWorker();

  // Initialize HLS loader
  const {
    loadHlsUrl,
    isLoading: isLoadingHls,
    progress: hlsProgress,
    error: hlsError,
  } = useHlsLoader();

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

  const addTracksForSource = useCallback((options: {
    label: string;
    durationUs: number;
    origin: 'recording' | 'overlay';
    sourceType: SourceType;
    startUs?: number;
    hasAudio?: boolean;
  }) => {
    const {
      label,
      durationUs,
      origin,
      sourceType,
      startUs = 0,
      hasAudio = true,
    } = options;

    if (!durationUs || durationUs <= 0) {
      return;
    }

    const sourceId = createId('src');
    const safeStartUs = Math.max(0, startUs);

    const videoTrack: MediaTrack = {
      id: createId('track-v'),
      label: `${label} · Video`,
      type: 'video',
      clips: [
        {
          id: createId('clip'),
          label,
          startUs: safeStartUs,
          durationUs,
          sourceId,
          origin,
          sourceType,
        },
      ],
    };

    const audioTrack: MediaTrack | null = hasAudio
      ? {
          id: createId('track-a'),
          label: `${label} · Audio`,
          type: 'audio',
          clips: [
            {
              id: createId('clip'),
              label,
              startUs: safeStartUs,
              durationUs,
              sourceId,
              origin,
              sourceType,
            },
          ],
        }
      : null;

    setTracks((prev) => {
      const videoTracks = prev.filter((track) => track.type === 'video');
      const audioTracks = prev.filter((track) => track.type === 'audio');

      const nextVideoTracks = [...videoTracks, videoTrack];
      const nextAudioTracks = audioTrack ? [...audioTracks, audioTrack] : audioTracks;

      return [...nextVideoTracks, ...nextAudioTracks];
    });
  }, []);

  const timelineDurationUs = useMemo(() => {
    const baseDurationUs = secondsToUs(state.duration);
    const tracksDurationUs = tracks.reduce((max, track) => {
      const trackMax = track.clips.reduce(
        (clipMax, clip) => Math.max(clipMax, clip.startUs + clip.durationUs),
        0
      );
      return Math.max(max, trackMax);
    }, 0);

    return Math.max(baseDurationUs, tracksDurationUs);
  }, [state.duration, tracks]);
  const timelineDurationSeconds = timelineDurationUs / MICROSECONDS_PER_SECOND;

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
    durationUs: timelineDurationUs,
    currentTimeUs: secondsToUs(state.currentTime),
  });

  // Reset viewport when a new video is loaded (duration changes)
  useEffect(() => {
    if (timelineDurationUs > 0) {
      zoomToFit();
    }
  }, [timelineDurationUs, zoomToFit]);

  // File validation and loading
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear previous error
    setFileError(null);
    hlsBufferRef.current = null;

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
    setSourceType('file');
    setCurrentRecording({
      id: createId('recording'),
      label: file.name,
      sourceType: 'file',
      hasAudio: true,
    });
    recordingAddedRef.current = null;
    setTrackError(null);
    loadFile(file);
    play();
  };

  // HLS URL loading
  const handleHlsLoad = async (url: string) => {
    try {
      setFileError(null);
      setLoadedFile(null);
      setTrackError(null);
      hlsBufferRef.current = null;
      const urlLabel = url.replace(/^https?:\/\//, '').slice(0, 80);

      setCurrentRecording({
        id: createId('hls'),
        label: urlLabel || 'HLS Stream',
        sourceType: 'hls',
        hasAudio: true,
      });
      recordingAddedRef.current = null;

      const { buffer } = await loadHlsUrl(url, {
        onStart: (duration) => {
          setSourceType('hls');
          startStream(duration);
          play();
        },
        onChunk: (chunk, isLast) => {
          appendStreamChunk(chunk, isLast);
        },
      });

      // Store buffer for export (we need to clone it since the streaming API transfers chunks)
      hlsBufferRef.current = buffer.slice(0);
    } catch {
      // Error is handled by useHlsLoader
    }
  };

  // Add a paired video/audio track whenever a new recording source becomes ready
  useEffect(() => {
    if (!state.isReady || !currentRecording) {
      return;
    }

    if (recordingAddedRef.current === currentRecording.id) {
      return;
    }

    const durationUs = secondsToUs(state.duration);
    if (durationUs <= 0) {
      return;
    }

    addTracksForSource({
      label: currentRecording.label,
      durationUs,
      origin: 'recording',
      sourceType: currentRecording.sourceType,
      startUs: 0,
      hasAudio: currentRecording.hasAudio,
    });
    recordingAddedRef.current = currentRecording.id;
  }, [state.isReady, state.duration, currentRecording, addTracksForSource]);

  // Handle export request
  const handleExport = () => {
    if (!state.clip) return;

    if (sourceType === 'hls' && hlsBufferRef.current) {
      // Clone buffer for export since it will be transferred
      const exportBuffer = hlsBufferRef.current.slice(0);
      startExport({
        sourceBuffer: exportBuffer,
        sourceName: 'hls_video',
        inPointUs: state.clip.inPoint,
        outPointUs: state.clip.outPoint,
      });
    } else if (loadedFile) {
      startExport({
        file: loadedFile,
        inPointUs: state.clip.inPoint,
        outPointUs: state.clip.outPoint,
      });
    }
  };

  const handleOverlayFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setTrackError(null);
    setIsAddingOverlay(true);

    try {
      const overlayStartUs = secondsToUs(state.isReady ? state.currentTime : 0);
      const results = await Promise.allSettled(
        Array.from(files).map(async (file) => {
          if (file.size > FILE_VALIDATION.MAX_FILE_SIZE) {
            throw new Error(`${file.name} exceeds the ${FILE_VALIDATION.MAX_FILE_SIZE / 1024 / 1024}MB limit.`);
          }
          const isAcceptedType = FILE_VALIDATION.ACCEPTED_TYPES.some((type) => file.type === type);
          if (!isAcceptedType) {
            throw new Error(`${file.name} is not a supported format.`);
          }

          const durationSeconds = await getMediaDurationSeconds(file);
          return { file, durationUs: secondsToUs(durationSeconds) };
        })
      );

      let added = 0;
      let hadFailure = false;

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          addTracksForSource({
            label: result.value.file.name,
            durationUs: result.value.durationUs,
            origin: 'overlay',
            sourceType: 'file',
            startUs: overlayStartUs,
            hasAudio: true,
          });
          added += 1;
        } else {
          hadFailure = true;
        }
      });

      if (hadFailure) {
        setTrackError('Some overlay clips could not be added. Check the file type and size.');
      } else if (added === 0) {
        setTrackError('No overlay clips were added.');
      }
    } catch (error) {
      // Logging helps diagnose issues while we surface a friendly message to the user
      console.error('Failed to add overlay clips:', error);
      setTrackError('Unable to add overlay clips. Please try again.');
    } finally {
      setIsAddingOverlay(false);
      e.target.value = '';
    }
  };

  const trackCounts = useMemo(
    () => tracks.reduce(
      (acc, track) => {
        if (track.type === 'video') acc.video += 1;
        if (track.type === 'audio') acc.audio += 1;
        return acc;
      },
      { video: 0, audio: 0 }
    ),
    [tracks]
  );

  // Check if we have a valid source for export
  const hasValidSource = (sourceType === 'file' && loadedFile) || (sourceType === 'hls' && hlsBufferRef.current);

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
          {/* Source Input Tabs */}
          <div className="space-y-3">
            {/* Tab Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setSourceType('file')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  sourceType === 'file'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                disabled={isLoadingHls}
              >
                File Upload
              </button>
              <button
                onClick={() => setSourceType('hls')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  sourceType === 'hls'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                disabled={isLoadingHls}
              >
                HLS URL
              </button>
            </div>

            {/* File Input */}
            {sourceType === 'file' && (
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
            )}

            {/* HLS URL Input */}
            {sourceType === 'hls' && (
              <HlsUrlInput
                onLoad={handleHlsLoad}
                isLoading={isLoadingHls}
                progress={hlsProgress}
                error={hlsError}
                disabled={state.isReady && isLoadingHls}
              />
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
                  disabled={!state.isReady || isExporting || !hasValidSource}
                  isExporting={isExporting}
                  progress={exportProgress}
                  error={exportError}
                  hasAudio={hasAudio}
                  onExport={handleExport}
                  onAbort={abortExport}
                  onClearError={clearExportError}
                />
              </div>

              {/* Track management */}
              <div className="mt-4 bg-gray-900/60 border border-gray-800 rounded-lg px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Tracks & Layers</p>
                    <p className="text-xs text-gray-400">
                      Each recording creates separate video and audio lanes. Add overlays to stack more footage.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-100">
                        Video: {trackCounts.video}
                      </span>
                      <span className="px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-100">
                        Audio: {trackCounts.audio}
                      </span>
                    </div>
                    <label
                      className={`px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-xs font-semibold cursor-pointer transition ${
                        isAddingOverlay ? 'opacity-70 cursor-wait' : ''
                      }`}
                    >
                      <input
                        type="file"
                        className="sr-only"
                        multiple
                        accept={FILE_VALIDATION.ACCEPTED_TYPES.join(',')}
                        onChange={handleOverlayFiles}
                        disabled={isAddingOverlay}
                      />
                      {isAddingOverlay ? 'Adding overlays...' : 'Add overlay video'}
                    </label>
                  </div>
                </div>
                {trackError && (
                  <div className="text-xs text-red-400" role="alert">
                    {trackError}
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="pt-6">
                <Timeline
                  duration={timelineDurationSeconds}
                  currentTime={state.currentTime}
                  inPoint={state.clip?.inPoint ?? 0}
                  outPoint={state.clip?.outPoint ?? secondsToUs(state.duration)}
                  timelineDurationUs={timelineDurationUs}
                  trimMaxUs={secondsToUs(state.duration)}
                  tracks={tracks}
                  onSeek={seek}
                  onTrimChange={setTrim}
                  posterUrl={firstFrameUrl ?? undefined}
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
          {!state.isReady && !isLoadingHls && (
            <div className="text-center text-gray-500 py-4">
              Load an MP4 video or HLS stream to get started
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
