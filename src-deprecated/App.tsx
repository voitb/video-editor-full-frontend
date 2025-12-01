import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useVideoWorker } from './hooks/useVideoWorker';
import { useAudioManager } from './hooks/useAudioManager';
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
import { VIDEO_PREVIEW, TIME, FILE_VALIDATION, TIMELINE } from './constants';
import type { ClipChange, MediaTrack, ActiveClip, SourceAudioData } from './types/editor';

type SourceType = 'file' | 'hls';

const { MICROSECONDS_PER_SECOND } = TIME;
const { MIN_TRIM_DURATION_US } = TIMELINE;

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
    sourceId?: string;
  } | null>(null);
  const recordingAddedRef = useRef<string | null>(null);
  const hlsBufferRef = useRef<ArrayBuffer | null>(null);
  const [playableHlsBuffer, setPlayableHlsBuffer] = useState<ArrayBuffer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const {
    state,
    firstFrameUrl,
    sources,
    initCanvas,
    loadFile,
    startStream,
    appendStreamChunk,
    seek,
    play,
    pause,
    // Multi-source API
    loadSource,
    removeSource,
    setActiveClips,
    syncToTime,
    // Streaming source API (progressive HLS)
    startSourceStream,
    appendSourceChunk,
  } = useVideoWorker();

  // Initialize audio manager for multi-clip audio
  const audioManager = useAudioManager();

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

  const releaseAudioUrl = useCallback(() => {
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current);
      audioObjectUrlRef.current = null;
    }
  }, []);

  const prepareAudioSource = useCallback(
    (options: { type: SourceType; file?: File | null; buffer?: ArrayBuffer | null }) => {
      const audioEl = audioRef.current;
      if (!audioEl) return;

      releaseAudioUrl();
      setIsAudioReady(false);

      let nextUrl: string | null = null;
      if (options.type === 'file' && options.file) {
        nextUrl = URL.createObjectURL(options.file);
      } else if (options.type === 'hls' && options.buffer) {
        nextUrl = URL.createObjectURL(new Blob([options.buffer], { type: 'video/mp4' }));
      }

      if (nextUrl) {
        audioEl.src = nextUrl;
        audioEl.load();
        audioObjectUrlRef.current = nextUrl;
      } else {
        audioEl.removeAttribute('src');
        audioEl.load();
      }
    },
    [releaseAudioUrl]
  );

  const syncAudioClock = useCallback(
    (timeUs: number, force = false) => {
      const audioEl = audioRef.current;
      if (!audioEl || !audioObjectUrlRef.current || !isAudioReady) return;
      const targetSeconds = timeUs / MICROSECONDS_PER_SECOND;
      const drift = Math.abs(audioEl.currentTime - targetSeconds);
      if (force || drift > 0.06) {
        audioEl.currentTime = targetSeconds;
      }
    },
    [isAudioReady]
  );

  const addTracksForSource = useCallback((options: {
    label: string;
    durationUs: number;
    origin: 'recording' | 'overlay';
    sourceType: SourceType;
    startUs?: number;
    hasAudio?: boolean;
    sourceId?: string;
  }) => {
    const {
      label,
      durationUs,
      origin,
      sourceType,
      startUs = 0,
      hasAudio = true,
      sourceId: providedSourceId,
    } = options;

    if (!durationUs || durationUs <= 0) {
      return;
    }

    const sourceId = providedSourceId ?? createId('src');
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
          // Initialize trim to full source
          trimInUs: 0,
          trimOutUs: durationUs,
          sourceDurationUs: durationUs,
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
              // Initialize trim to full source
              trimInUs: 0,
              trimOutUs: durationUs,
              sourceDurationUs: durationUs,
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

  // Editor is ready when either legacy single-source is ready OR we have tracks (multi-source)
  const isEditorReady = state.isReady || tracks.length > 0;

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

  // ============================================================================
  // MULTI-SOURCE AUDIO INTEGRATION
  // ============================================================================

  // Handle audio data from video worker (for multi-source mode)
  const handleAudioData = useCallback(
    async (data: SourceAudioData) => {
      await audioManager.initAudio();
      await audioManager.loadAudioSource(data);
    },
    [audioManager]
  );

  // Compute active clips from tracks for multi-source compositing
  const activeClips = useMemo<ActiveClip[]>(() => {
    const clips: ActiveClip[] = [];
    let trackIndex = 0;

    for (const track of tracks) {
      if (track.type !== 'video') continue;

      for (const clip of track.clips) {
        clips.push({
          sourceId: clip.sourceId,
          clipId: clip.id,
          trackIndex,
          startTimeUs: clip.startUs,
          sourceStartUs: clip.trimInUs,   // Use per-clip trim
          sourceEndUs: clip.trimOutUs,    // Use per-clip trim
          opacity: 1,
        });
      }
      trackIndex++;
    }

    return clips;
  }, [tracks]);

  // Sync active clips to video worker when tracks change
  useEffect(() => {
    if (activeClips.length > 0) {
      setActiveClips(activeClips);
      audioManager.setActiveClips(activeClips);
    }
  }, [activeClips, setActiveClips, audioManager]);

  // Video-audio sync during playback (using AudioContext as master clock)
  useEffect(() => {
    if (!state.isPlaying || activeClips.length === 0) return;

    const syncInterval = setInterval(() => {
      const audioTimeUs = audioManager.getCurrentTimeUs();
      const videoTimeUs = secondsToUs(state.currentTime);
      const drift = Math.abs(audioTimeUs - videoTimeUs);

      // If drift exceeds 16ms (one frame at 60fps), sync video to audio
      if (drift > 16_000) {
        syncToTime(audioTimeUs);
      }
    }, 100);

    return () => clearInterval(syncInterval);
  }, [state.isPlaying, state.currentTime, activeClips.length, audioManager, syncToTime]);

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

    audioRef.current?.pause();
    setIsAudioReady(false);
    releaseAudioUrl();
    setPlayableHlsBuffer(null);

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

  // HLS URL loading - uses progressive streaming for fast preview
  const handleHlsLoad = async (url: string) => {
    try {
      setFileError(null);
      setLoadedFile(null);
      setTrackError(null);
      hlsBufferRef.current = null;
      setPlayableHlsBuffer(null);
      audioRef.current?.pause();
      setIsAudioReady(false);
      releaseAudioUrl();
      const urlLabel = url.replace(/^https?:\/\//, '').slice(0, 80);

      // Generate sourceId upfront so we can pass it to track creation
      const sourceId = createId('hls-src');

      setCurrentRecording({
        id: sourceId,
        label: urlLabel || 'HLS Stream',
        sourceType: 'hls',
        hasAudio: true,
        sourceId,
      });
      recordingAddedRef.current = null;

      // Collect chunks for audio/export (we still need the full buffer for those)
      const collectedChunks: ArrayBuffer[] = [];

      // Load HLS with progressive streaming
      const { buffer } = await loadHlsUrl(url, {
        onStart: (manifestDuration) => {
          setSourceType('hls');
          // Initialize streaming source with duration from manifest
          startSourceStream(sourceId, manifestDuration);
        },
        onChunk: (chunk, isLast) => {
          // Store chunk for later audio/export use
          collectedChunks.push(chunk.slice(0));
          // Stream chunk to video worker for progressive playback
          appendSourceChunk(sourceId, chunk, isLast);
        },
        onPlayable: () => {
          // Source has enough data to start playback
          // The VIDEO_WORKER will emit SOURCE_PLAYABLE which triggers track creation
          // and first frame rendering via the existing useEffect hooks
        },
      });

      // Store full buffer for audio/export after streaming complete
      hlsBufferRef.current = buffer.slice(0);
      setPlayableHlsBuffer(hlsBufferRef.current);

    } catch {
      // Error is handled by useHlsLoader
    }
  };

  // Add a paired video/audio track whenever a new recording source becomes ready
  // For file sources, state.isReady triggers; for HLS, SOURCE_READY via sources Map
  useEffect(() => {
    if (!currentRecording) return;
    if (recordingAddedRef.current === currentRecording.id) return;

    // For HLS multi-source: check if source is ready in sources Map
    if (currentRecording.sourceId) {
      const source = sources.get(currentRecording.sourceId);
      if (!source?.isReady) return;

      const durationUs = source.durationUs;
      if (durationUs <= 0) return;

      addTracksForSource({
        label: currentRecording.label,
        durationUs,
        origin: 'recording',
        sourceType: currentRecording.sourceType,
        startUs: 0,
        hasAudio: currentRecording.hasAudio,
        sourceId: currentRecording.sourceId,
      });
      recordingAddedRef.current = currentRecording.id;
      return;
    }

    // For file sources: use legacy state.isReady
    if (!state.isReady) return;

    const durationUs = secondsToUs(state.duration);
    if (durationUs <= 0) return;

    addTracksForSource({
      label: currentRecording.label,
      durationUs,
      origin: 'recording',
      sourceType: currentRecording.sourceType,
      startUs: 0,
      hasAudio: currentRecording.hasAudio,
    });
    recordingAddedRef.current = currentRecording.id;
  }, [state.isReady, state.duration, currentRecording, addTracksForSource, sources]);

  // Auto-play when HLS source becomes ready
  useEffect(() => {
    if (sourceType !== 'hls' || !currentRecording?.sourceId) return;

    const source = sources.get(currentRecording.sourceId);
    if (source?.isReady && !state.isPlaying) {
      play();
    }
  }, [sources, sourceType, currentRecording, state.isPlaying, play]);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const handleCanPlay = () => setIsAudioReady(true);
    const handleError = () => setIsAudioReady(false);

    audioEl.addEventListener('canplay', handleCanPlay);
    audioEl.addEventListener('error', handleError);

    return () => {
      audioEl.removeEventListener('canplay', handleCanPlay);
      audioEl.removeEventListener('error', handleError);
    };
  }, []);

  useEffect(() => {
    if (sourceType === 'file') {
      prepareAudioSource({ type: 'file', file: loadedFile });
    } else if (sourceType === 'hls') {
      prepareAudioSource({ type: 'hls', buffer: playableHlsBuffer });
    }
  }, [sourceType, loadedFile, playableHlsBuffer, prepareAudioSource]);

  useEffect(() => {
    return () => {
      releaseAudioUrl();
    };
  }, [releaseAudioUrl]);

  // Handle export request
  const handleExport = () => {
    // Find the first video clip for export
    const videoTrack = tracks.find(t => t.type === 'video');
    const firstClip = videoTrack?.clips[0];
    if (!firstClip) return;

    if (sourceType === 'hls' && hlsBufferRef.current) {
      // Clone buffer for export since it will be transferred
      const exportBuffer = hlsBufferRef.current.slice(0);
      startExport({
        sourceBuffer: exportBuffer,
        sourceName: 'hls_video',
        inPointUs: firstClip.trimInUs,
        outPointUs: firstClip.trimOutUs,
      });
    } else if (loadedFile) {
      startExport({
        file: loadedFile,
        inPointUs: firstClip.trimInUs,
        outPointUs: firstClip.trimOutUs,
      });
    }
  };

  const handleOverlayFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setTrackError(null);
    setIsAddingOverlay(true);

    try {
      const overlayStartUs = secondsToUs(isEditorReady ? state.currentTime : 0);
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

  const handleClipChange = useCallback((change: ClipChange) => {
    setTracks((prev) =>
      prev.map((track) => {
        let updated = false;
        const clips = track.clips.map((clip) => {
          // Match on clipId, not sourceId - sourceId is shared between video/audio clips
          if (clip.id !== change.clipId) return clip;

          if (change.type === 'move') {
            const newStartUs = Math.max(0, change.newStartUs);
            if (newStartUs === clip.startUs) return clip;
            updated = true;
            return { ...clip, startUs: newStartUs };
          }

          if (change.type === 'trim') {
            const nextDurationUs = Math.max(MIN_TRIM_DURATION_US, change.newDurationUs);
            const nextStartUs = change.edge === 'start' ? Math.max(0, change.newStartUs) : clip.startUs;
            const nextTrimInUs = Math.max(0, change.newTrimInUs);
            const nextTrimOutUs = Math.min(clip.sourceDurationUs, change.newTrimOutUs);

            // Check if anything actually changed
            if (
              nextStartUs === clip.startUs &&
              nextDurationUs === clip.durationUs &&
              nextTrimInUs === clip.trimInUs &&
              nextTrimOutUs === clip.trimOutUs
            ) {
              return clip;
            }
            updated = true;
            return {
              ...clip,
              startUs: nextStartUs,
              durationUs: nextDurationUs,
              trimInUs: nextTrimInUs,
              trimOutUs: nextTrimOutUs,
            };
          }

          return clip;
        });

        return updated ? { ...track, clips } : track;
      })
    );
  }, []);

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

  const handleSeekWithAudio = useCallback((timeUs: number) => {
    syncAudioClock(timeUs, true);
    seek(timeUs);
  }, [seek, syncAudioClock]);

  // Check if we have a valid source for export
  const hasValidSource = (sourceType === 'file' && loadedFile) || (sourceType === 'hls' && hlsBufferRef.current);

  useEffect(() => {
    if (!isAudioReady) return;
    const targetUs = secondsToUs(state.currentTime);
    if (state.isPlaying) {
      syncAudioClock(targetUs);
    } else {
      syncAudioClock(targetUs, true);
    }
  }, [state.currentTime, state.isPlaying, syncAudioClock, isAudioReady]);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || !audioObjectUrlRef.current) return;
    if (!isEditorReady || !isAudioReady) {
      audioEl.pause();
      return;
    }

    if (state.isPlaying) {
      syncAudioClock(secondsToUs(state.currentTime), true);
      void audioEl.play().catch(() => {});
    } else {
      audioEl.pause();
    }
  }, [state.isPlaying, isEditorReady, isAudioReady, state.currentTime, syncAudioClock]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <audio ref={audioRef} className="hidden" />
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
                disabled={isEditorReady && isLoadingHls}
              />
            )}
          </div>

          {/* Playback Controls */}
          {isEditorReady && (
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
                  disabled={!isEditorReady || isExporting || !hasValidSource}
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
                  timelineDurationUs={timelineDurationUs}
                  tracks={tracks}
                  onSeek={handleSeekWithAudio}
                  posterUrl={firstFrameUrl ?? undefined}
                  viewport={viewport}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onZoomToFit={zoomToFit}
                  onViewportChange={setViewport}
                  canZoomIn={canZoomIn}
                  canZoomOut={canZoomOut}
                  onClipChange={handleClipChange}
                />
              </div>

            </>
          )}

          {/* Loading State */}
          {!isEditorReady && !isLoadingHls && (
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
