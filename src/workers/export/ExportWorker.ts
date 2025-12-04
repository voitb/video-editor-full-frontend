/// <reference lib="webworker" />
/**
 * Export Worker
 * Handles video/audio encoding and MP4 muxing for export.
 * Orchestrates source loading, frame decoding, audio mixing, and muxing.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { ExportWorkerCommand, StartExportCommand } from '../messages/exportMessages';
import type { TrackJSON } from '../../core/types';
import { ExportCompositor, type ExportLayer, type SubtitleLayer } from '../../export/ExportCompositor';
import { SubtitleRenderer, getActiveSubtitleCuesAt } from '../../renderer/SubtitleRenderer';
import { EXPORT, TIME, SUBTITLE } from '../../constants';

// Import modules
import type { ExportSourceState, ActiveOverlayInfo } from './types';
import { loadSources, cleanupSources } from './SourceLoader';
import { decodeFrameForClip } from './FrameDecoder';
import { mixAudioTracks, encodeAudioBuffer, type AudioMixerConfig } from './AudioMixer';
import { postProgress, postError, postCancelled, postComplete, postReady } from './ProgressReporter';
import { getActiveClipsAt, getSubtitleTracks, getActiveOverlaysAt } from './ActiveClipResolver';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// ============================================================================
// STATE
// ============================================================================

let cancelled = false;
let compositor: ExportCompositor | null = null;
let subtitleRenderer: SubtitleRenderer | null = null;
const sources = new Map<string, ExportSourceState>();
let tracks: TrackJSON[] = [];
let exportStartTime = 0;
let overlayData: ActiveOverlayInfo[] = [];

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

ctx.onmessage = async (e: MessageEvent<ExportWorkerCommand>) => {
  const cmd = e.data;

  try {
    switch (cmd.type) {
      case 'START_EXPORT':
        await startExport(cmd);
        break;

      case 'CANCEL_EXPORT':
        cancelled = true;
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    postError(message, 'initializing', err instanceof Error ? err.stack : undefined);
  }
};

// Post ready event
postReady();

// ============================================================================
// EXPORT ORCHESTRATION
// ============================================================================

async function startExport(cmd: StartExportCommand): Promise<void> {
  cancelled = false;
  exportStartTime = performance.now();
  sources.clear();
  tracks = cmd.tracks;

  const { compositionConfig, exportConfig } = cmd;
  const { inPointUs, outPointUs, outputWidth, outputHeight, videoBitrate, audioBitrate } =
    exportConfig;

  const frameRate = compositionConfig.frameRate;
  const frameIntervalUs = Math.round(TIME.US_PER_SECOND / frameRate);
  const totalFrames = Math.ceil((outPointUs - inPointUs) / frameIntervalUs);

  postProgress(0, totalFrames, 'initializing');

  // Initialize compositor and subtitle renderer
  compositor = new ExportCompositor(outputWidth, outputHeight);
  subtitleRenderer = new SubtitleRenderer(outputWidth, outputHeight, SUBTITLE.RENDER_SCALE);

  // Load all sources
  await loadSources(cmd.sources, sources);

  // Load pre-rendered overlays
  overlayData = cmd.overlays?.map((overlay) => ({
    clipId: overlay.clipId,
    trackIndex: overlay.trackIndex,
    startUs: overlay.startUs,
    endUs: overlay.startUs + overlay.durationUs,
    bitmap: overlay.bitmap,
    position: overlay.position,
    opacity: overlay.opacity,
  })) ?? [];

  if (cancelled) {
    cleanup();
    postCancelled();
    return;
  }

  // Create muxer and encoders
  const { muxer, muxerTarget, videoEncoder, audioEncoder } = createEncoders(
    outputWidth,
    outputHeight,
    videoBitrate,
    audioBitrate,
    frameRate
  );

  // Process audio
  postProgress(0, totalFrames, 'encoding_audio');
  await processAudio(audioEncoder, inPointUs, outPointUs);

  if (cancelled) {
    cleanup();
    videoEncoder.close();
    audioEncoder.close();
    postCancelled();
    return;
  }

  // Process video frames
  postProgress(0, totalFrames, 'encoding_video');
  const subtitleTracksData = getSubtitleTracks(tracks);

  for (let frameNum = 0; frameNum < totalFrames; frameNum++) {
    if (cancelled) {
      cleanup();
      videoEncoder.close();
      audioEncoder.close();
      postCancelled();
      return;
    }

    await processFrame(
      frameNum,
      totalFrames,
      inPointUs,
      frameIntervalUs,
      frameRate,
      videoEncoder,
      subtitleTracksData
    );
  }

  // Finalize export
  await finalizeExport(totalFrames, muxer, muxerTarget, videoEncoder, audioEncoder);
}

// ============================================================================
// ENCODER SETUP
// ============================================================================

function createEncoders(
  outputWidth: number,
  outputHeight: number,
  videoBitrate: number,
  audioBitrate: number,
  frameRate: number
) {
  const muxerTarget = new ArrayBufferTarget();
  const muxer = new Muxer({
    target: muxerTarget,
    video: {
      codec: 'avc',
      width: outputWidth,
      height: outputHeight,
    },
    audio: {
      codec: 'aac',
      numberOfChannels: EXPORT.AUDIO_CHANNELS,
      sampleRate: EXPORT.DEFAULT_AUDIO_SAMPLE_RATE,
    },
    fastStart: 'in-memory',
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => postError(`Video encoder error: ${err.message}`, 'encoding_video'),
  });

  videoEncoder.configure({
    codec: 'avc1.640028',
    width: outputWidth,
    height: outputHeight,
    bitrate: videoBitrate,
    framerate: frameRate,
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (err) => postError(`Audio encoder error: ${err.message}`, 'encoding_audio'),
  });

  audioEncoder.configure({
    codec: 'mp4a.40.2',
    numberOfChannels: EXPORT.AUDIO_CHANNELS,
    sampleRate: EXPORT.DEFAULT_AUDIO_SAMPLE_RATE,
    bitrate: audioBitrate,
  });

  return { muxer, muxerTarget, videoEncoder, audioEncoder };
}

// ============================================================================
// FRAME PROCESSING
// ============================================================================

async function processFrame(
  frameNum: number,
  totalFrames: number,
  inPointUs: number,
  frameIntervalUs: number,
  frameRate: number,
  videoEncoder: VideoEncoder,
  subtitleTracksData: ReturnType<typeof getSubtitleTracks>
): Promise<void> {
  const frameTimeUs = inPointUs + frameNum * frameIntervalUs;

  // Get active clips at this time
  const activeClips = getActiveClipsAt(tracks, frameTimeUs);

  // Get video clips only (sorted by track index)
  const videoClips = activeClips
    .filter((c) => c.trackType === 'video')
    .sort((a, b) => a.trackIndex - b.trackIndex);

  // Decode frames for each video clip
  const layers: ExportLayer[] = [];
  for (const clip of videoClips) {
    const frame = await decodeFrameForClip(clip, sources);
    if (frame) {
      layers.push({ frame, opacity: clip.opacity });
    }
  }

  // Render subtitle layer if needed
  let subtitleLayer: SubtitleLayer | undefined;
  if (subtitleTracksData.length > 0 && subtitleRenderer) {
    const activeCues = getActiveSubtitleCuesAt(subtitleTracksData, frameTimeUs);
    if (activeCues.length > 0) {
      subtitleLayer = { canvas: subtitleRenderer.render(activeCues) };
    }
  }

  // Get active overlays
  const activeOverlays = getActiveOverlaysAt(overlayData, frameTimeUs);

  // Composite and encode
  const compositedFrame = compositor!.composite(
    layers,
    frameTimeUs,
    subtitleLayer,
    activeOverlays.length > 0 ? activeOverlays : undefined
  );

  // Close input frames
  for (const layer of layers) {
    layer.frame.close();
  }

  // Encode composited frame
  const keyFrame = frameNum % (frameRate * 2) === 0;
  videoEncoder.encode(compositedFrame, { keyFrame });
  compositedFrame.close();

  // Report progress
  if (frameNum % EXPORT.PROGRESS_UPDATE_FRAMES === 0 || frameNum === totalFrames - 1) {
    const elapsed = performance.now() - exportStartTime;
    const framesPerMs = (frameNum + 1) / elapsed;
    const remainingFrames = totalFrames - frameNum - 1;
    const estimatedTimeRemainingMs = Math.round(remainingFrames / framesPerMs);

    postProgress(frameNum + 1, totalFrames, 'encoding_video', estimatedTimeRemainingMs);
  }
}

// ============================================================================
// AUDIO PROCESSING
// ============================================================================

async function processAudio(
  audioEncoder: AudioEncoder,
  inPointUs: number,
  outPointUs: number
): Promise<void> {
  const config: AudioMixerConfig = {
    sampleRate: EXPORT.DEFAULT_AUDIO_SAMPLE_RATE,
    channels: EXPORT.AUDIO_CHANNELS,
    inPointUs,
    outPointUs,
  };

  const mixedAudio = mixAudioTracks(tracks, sources, config);
  await encodeAudioBuffer(audioEncoder, mixedAudio, config, () => cancelled);
}

// ============================================================================
// FINALIZE
// ============================================================================

async function finalizeExport(
  totalFrames: number,
  muxer: Muxer<ArrayBufferTarget>,
  muxerTarget: ArrayBufferTarget,
  videoEncoder: VideoEncoder,
  audioEncoder: AudioEncoder
): Promise<void> {
  postProgress(totalFrames, totalFrames, 'finalizing');

  await videoEncoder.flush();
  await audioEncoder.flush();
  videoEncoder.close();
  audioEncoder.close();

  muxer.finalize();

  const mp4Data = muxerTarget.buffer;
  const durationMs = Math.round(performance.now() - exportStartTime);

  cleanup();
  postComplete(mp4Data, durationMs);
}

// ============================================================================
// CLEANUP
// ============================================================================

function cleanup(): void {
  cleanupSources(sources);

  if (compositor) {
    compositor.dispose();
    compositor = null;
  }

  subtitleRenderer = null;

  for (const overlay of overlayData) {
    overlay.bitmap.close();
  }
  overlayData = [];
}
