/// <reference lib="webworker" />
/**
 * Export Worker
 * Handles video/audio encoding and MP4 muxing for export.
 * Orchestrates source loading, frame decoding, audio mixing, and muxing.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type {
  ExportWorkerCommand,
  ExportWorkerEvent,
  StartExportCommand,
} from '../messages/exportMessages';
import type { TrackJSON, ExportPhase, SubtitleClipJSON } from '../../core/types';
import { ExportCompositor, type ExportLayer, type SubtitleLayer } from '../../export/ExportCompositor';
import { SubtitleRenderer, getActiveSubtitleCuesAt } from '../../renderer/SubtitleRenderer';
import { EXPORT, TIME } from '../../constants';

// Import refactored modules
import type { ExportSourceState, ActiveClipInfo, ActiveOverlayInfo } from './types';
import { loadSources, cleanupSources } from './SourceLoader';
import { decodeFrameForClip } from './FrameDecoder';
import { mixAudioTracks, encodeAudioBuffer, type AudioMixerConfig } from './AudioMixer';

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
/** Pre-rendered overlay data for compositing */
let overlayData: ActiveOverlayInfo[] = [];

// ============================================================================
// POST RESPONSE
// ============================================================================

function postResponse(event: ExportWorkerEvent, transfer?: Transferable[]): void {
  ctx.postMessage(event, { transfer: transfer ?? [] });
}

function postProgress(
  currentFrame: number,
  totalFrames: number,
  phase: ExportPhase,
  estimatedTimeRemainingMs?: number
): void {
  const percent = Math.round((currentFrame / totalFrames) * 100);
  postResponse({
    type: 'EXPORT_PROGRESS',
    currentFrame,
    totalFrames,
    percent,
    phase,
    estimatedTimeRemainingMs,
  });
}

function postError(message: string, phase: ExportPhase, details?: string): void {
  postResponse({
    type: 'EXPORT_ERROR',
    message,
    phase,
    details,
  });
}

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
postResponse({ type: 'EXPORT_WORKER_READY' });

// ============================================================================
// EXPORT LOGIC
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
  subtitleRenderer = new SubtitleRenderer(outputWidth, outputHeight);

  // Load all sources using the SourceLoader module
  await loadSources(cmd.sources, sources);

  // Load pre-rendered overlays
  if (cmd.overlays && cmd.overlays.length > 0) {
    overlayData = cmd.overlays.map((overlay) => ({
      clipId: overlay.clipId,
      trackIndex: overlay.trackIndex,
      startUs: overlay.startUs,
      endUs: overlay.startUs + overlay.durationUs,
      bitmap: overlay.bitmap,
      position: overlay.position,
      opacity: overlay.opacity,
    }));
  } else {
    overlayData = [];
  }

  if (cancelled) {
    cleanup();
    postResponse({ type: 'EXPORT_CANCELLED' });
    return;
  }

  // Create muxer
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

  // Create encoders
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      postError(`Video encoder error: ${err.message}`, 'encoding_video');
    },
  });

  videoEncoder.configure({
    codec: 'avc1.640028', // H.264 High Profile Level 4.0
    width: outputWidth,
    height: outputHeight,
    bitrate: videoBitrate,
    framerate: frameRate,
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      muxer.addAudioChunk(chunk, meta);
    },
    error: (err) => {
      postError(`Audio encoder error: ${err.message}`, 'encoding_audio');
    },
  });

  audioEncoder.configure({
    codec: 'mp4a.40.2', // AAC-LC
    numberOfChannels: EXPORT.AUDIO_CHANNELS,
    sampleRate: EXPORT.DEFAULT_AUDIO_SAMPLE_RATE,
    bitrate: audioBitrate,
  });

  // Process audio first using AudioMixer module
  postProgress(0, totalFrames, 'encoding_audio');
  await processAudio(audioEncoder, inPointUs, outPointUs);

  if (cancelled) {
    cleanup();
    videoEncoder.close();
    audioEncoder.close();
    postResponse({ type: 'EXPORT_CANCELLED' });
    return;
  }

  // Process video frames
  postProgress(0, totalFrames, 'encoding_video');

  // Extract subtitle tracks for burn-in
  const subtitleTracks = getSubtitleTracks();

  for (let frameNum = 0; frameNum < totalFrames; frameNum++) {
    if (cancelled) {
      cleanup();
      videoEncoder.close();
      audioEncoder.close();
      postResponse({ type: 'EXPORT_CANCELLED' });
      return;
    }

    const frameTimeUs = inPointUs + frameNum * frameIntervalUs;

    // Get active clips at this time
    const activeClips = getActiveClipsAt(frameTimeUs);

    // Get video clips only (sorted by track index)
    const videoClips = activeClips
      .filter((c) => c.trackType === 'video')
      .sort((a, b) => a.trackIndex - b.trackIndex);

    // Decode frames for each video clip using FrameDecoder module
    const layers: ExportLayer[] = [];

    for (const clip of videoClips) {
      const frame = await decodeFrameForClip(clip, sources);
      if (frame) {
        layers.push({
          frame,
          opacity: clip.opacity,
        });
      }
    }

    // Get active subtitle cues and render if any
    let subtitleLayer: SubtitleLayer | undefined;
    if (subtitleTracks.length > 0 && subtitleRenderer) {
      const activeCues = getActiveSubtitleCuesAt(subtitleTracks, frameTimeUs);
      if (activeCues.length > 0) {
        const subtitleCanvas = subtitleRenderer.render(activeCues);
        subtitleLayer = { canvas: subtitleCanvas };
      }
    }

    // Get active overlays at this time
    const activeOverlays = getActiveOverlaysAt(frameTimeUs);

    // Composite layers with optional subtitle and overlay layers
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
    const keyFrame = frameNum % (frameRate * 2) === 0; // Keyframe every 2 seconds
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

  // Finalize
  postProgress(totalFrames, totalFrames, 'finalizing');

  await videoEncoder.flush();
  await audioEncoder.flush();
  videoEncoder.close();
  audioEncoder.close();

  muxer.finalize();

  const mp4Data = muxerTarget.buffer;
  const durationMs = Math.round(performance.now() - exportStartTime);

  cleanup();

  postResponse(
    {
      type: 'EXPORT_COMPLETE',
      mp4Data,
      durationMs,
      fileSizeBytes: mp4Data.byteLength,
    },
    [mp4Data]
  );
}

// ============================================================================
// ACTIVE CLIPS
// ============================================================================

function getActiveClipsAt(timelineTimeUs: number): ActiveClipInfo[] {
  const activeClips: ActiveClipInfo[] = [];

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex]!;

    // Skip subtitle and overlay tracks - they are handled separately
    if (track.type === 'subtitle' || track.type === 'overlay') continue;

    for (const clip of track.clips) {
      const clipDurationUs = clip.trimOut - clip.trimIn;
      const clipEndUs = clip.startUs + clipDurationUs;

      if (timelineTimeUs >= clip.startUs && timelineTimeUs < clipEndUs) {
        const offsetWithinClip = timelineTimeUs - clip.startUs;
        const sourceTimeUs = clip.trimIn + offsetWithinClip;

        activeClips.push({
          clipId: clip.id,
          sourceId: clip.sourceId,
          trackType: track.type,
          trackIndex,
          timelineStartUs: clip.startUs,
          sourceStartUs: sourceTimeUs,
          sourceEndUs: clip.trimOut,
          opacity: clip.opacity,
          volume: clip.volume,
        });
      }
    }
  }

  return activeClips;
}

/**
 * Get subtitle tracks formatted for subtitle rendering.
 * Extracts subtitle clips from tracks for use with getActiveSubtitleCuesAt.
 */
function getSubtitleTracks(): Array<{
  clips: Array<{
    startUs: number;
    cues: SubtitleClipJSON['cues'];
    style: SubtitleClipJSON['style'];
  }>;
}> {
  const subtitleTracks: Array<{
    clips: Array<{
      startUs: number;
      cues: SubtitleClipJSON['cues'];
      style: SubtitleClipJSON['style'];
    }>;
  }> = [];

  for (const track of tracks) {
    if (track.type !== 'subtitle') continue;
    if (!track.subtitleClips || track.subtitleClips.length === 0) continue;

    const clips = track.subtitleClips.map((clip) => ({
      startUs: clip.startUs,
      cues: clip.cues,
      style: clip.style,
    }));

    subtitleTracks.push({ clips });
  }

  return subtitleTracks;
}

/**
 * Get active overlays at a specific timeline time.
 * Returns overlays sorted by trackIndex so that top tracks (lower index) render last (on top).
 */
function getActiveOverlaysAt(timelineTimeUs: number): ActiveOverlayInfo[] {
  return overlayData
    .filter((overlay) => timelineTimeUs >= overlay.startUs && timelineTimeUs < overlay.endUs)
    .sort((a, b) => b.trackIndex - a.trackIndex); // Higher trackIndex first, so lower (top) tracks render last = on top
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

  // Mix audio tracks using AudioMixer module
  const mixedAudio = mixAudioTracks(tracks, sources, config);

  // Encode the mixed audio buffer
  await encodeAudioBuffer(audioEncoder, mixedAudio, config, () => cancelled);
}

// ============================================================================
// CLEANUP
// ============================================================================

function cleanup(): void {
  // Close all decoders using SourceLoader module
  cleanupSources(sources);

  if (compositor) {
    compositor.dispose();
    compositor = null;
  }

  // Clear subtitle renderer
  subtitleRenderer = null;

  // Close overlay ImageBitmaps
  for (const overlay of overlayData) {
    overlay.bitmap.close();
  }
  overlayData = [];
}
