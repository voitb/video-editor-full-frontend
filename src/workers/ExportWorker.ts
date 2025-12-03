/// <reference lib="webworker" />
/**
 * Video Editor - Export Worker
 * Handles video/audio encoding and MP4 muxing for export.
 */

import * as MP4Box from 'mp4box';
import type { MP4File, MP4VideoTrack, MP4AudioTrack, MP4Sample, MP4Info } from 'mp4box';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type {
  ExportWorkerCommand,
  ExportWorkerEvent,
  StartExportCommand,
  ExportSourceData,
} from './messages/exportMessages';
import type { ClipJSON, TrackJSON, ExportPhase, SubtitleClipJSON } from '../core/types';
import { ExportCompositor, type ExportLayer, type SubtitleLayer } from '../export/ExportCompositor';
import { SubtitleRenderer, getActiveSubtitleCuesAt } from '../renderer/SubtitleRenderer';
import { EXPORT, TIME } from '../constants';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// ============================================================================
// TYPES
// ============================================================================

interface SourceDecodeState {
  sourceId: string;
  mp4File: MP4File;
  videoDecoder: VideoDecoder | null;
  audioDecoder: AudioDecoder | null;
  videoTrack: MP4VideoTrack | null;
  audioTrack: MP4AudioTrack | null;
  videoSamples: MP4Sample[];
  audioSamples: MP4Sample[];
  keyframeIndices: number[];
  durationUs: number;
  width: number;
  height: number;
  isReady: boolean;
  // Decoded audio data
  decodedAudio: Float32Array[];
  audioSampleRate: number;
  audioChannels: number;
}

interface ActiveClipInfo {
  clipId: string;
  sourceId: string;
  trackType: 'video' | 'audio';
  trackIndex: number;
  timelineStartUs: number;
  sourceStartUs: number;
  sourceEndUs: number;
  opacity: number;
  volume: number;
}

// ============================================================================
// STATE
// ============================================================================

let cancelled = false;
let compositor: ExportCompositor | null = null;
let subtitleRenderer: SubtitleRenderer | null = null;
const sources = new Map<string, SourceDecodeState>();
let tracks: TrackJSON[] = [];
let exportStartTime = 0;

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

  // Load all sources
  await loadSources(cmd.sources);

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

  // Process audio first
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

    // Decode frames for each video clip
    const layers: ExportLayer[] = [];

    for (const clip of videoClips) {
      const frame = await decodeFrameForClip(clip, frameTimeUs);
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

    // Composite layers with optional subtitle overlay
    const compositedFrame = compositor!.composite(layers, frameTimeUs, subtitleLayer);

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
// SOURCE LOADING
// ============================================================================

async function loadSources(sourcesData: ExportSourceData[]): Promise<void> {
  const loadPromises = sourcesData.map((source) => loadSource(source));
  await Promise.all(loadPromises);
}

function loadSource(sourceData: ExportSourceData): Promise<void> {
  return new Promise((resolve, reject) => {
    const mp4File = MP4Box.createFile();
    const sourceState: SourceDecodeState = {
      sourceId: sourceData.sourceId,
      mp4File,
      videoDecoder: null,
      audioDecoder: null,
      videoTrack: null,
      audioTrack: null,
      videoSamples: [],
      audioSamples: [],
      keyframeIndices: [],
      durationUs: sourceData.durationUs,
      width: sourceData.width,
      height: sourceData.height,
      isReady: false,
      decodedAudio: [],
      audioSampleRate: EXPORT.DEFAULT_AUDIO_SAMPLE_RATE,
      audioChannels: EXPORT.AUDIO_CHANNELS,
    };

    sources.set(sourceData.sourceId, sourceState);

    // Track if audio config was validated
    let audioConfigPromise: Promise<void> | null = null;

    mp4File.onReady = (info: MP4Info) => {
      // Video track
      const videoTrack = info.videoTracks[0];
      if (videoTrack) {
        sourceState.videoTrack = videoTrack;
        sourceState.width = videoTrack.video.width;
        sourceState.height = videoTrack.video.height;

        // Initialize video decoder
        const codecDescription = getCodecDescription(mp4File, videoTrack.id);
        sourceState.videoDecoder = new VideoDecoder({
          output: () => {}, // We'll decode on-demand
          error: (err) => console.error('Video decoder error:', err),
        });

        sourceState.videoDecoder.configure({
          codec: videoTrack.codec,
          codedWidth: videoTrack.video.width,
          codedHeight: videoTrack.video.height,
          description: codecDescription,
        });

        mp4File.setExtractionOptions(videoTrack.id, 'video', { nbSamples: 10000 });
      }

      // Audio track - with async config validation
      const audioTrack = info.audioTracks[0];
      if (audioTrack) {
        sourceState.audioTrack = audioTrack;
        sourceState.audioSampleRate = audioTrack.audio.sample_rate;
        sourceState.audioChannels = audioTrack.audio.channel_count;

        // Use dedicated audio codec description extraction
        const audioCodecDescription = getAudioCodecDescription(mp4File, audioTrack.id);

        const audioConfig: AudioDecoderConfig = {
          codec: audioTrack.codec,
          sampleRate: audioTrack.audio.sample_rate,
          numberOfChannels: audioTrack.audio.channel_count,
          description: audioCodecDescription ?? undefined,
        };

        // Validate config before configuring
        audioConfigPromise = AudioDecoder.isConfigSupported(audioConfig).then((supported) => {
          if (!supported.supported) {
            throw new Error(
              `Unsupported audio codec: ${audioTrack.codec}. Please re-encode your source file with a supported audio format (AAC recommended).`
            );
          }

          sourceState.audioDecoder = new AudioDecoder({
            output: (audioData) => {
              const numFrames = audioData.numberOfFrames;
              const numChannels = audioData.numberOfChannels;

              // Create interleaved buffer for all channels
              const pcm = new Float32Array(numFrames * numChannels);

              // Copy each channel and interleave
              for (let ch = 0; ch < numChannels; ch++) {
                const channelData = new Float32Array(numFrames);
                audioData.copyTo(channelData, { planeIndex: ch, format: 'f32-planar' });

                // Interleave: place channel samples at correct positions
                for (let i = 0; i < numFrames; i++) {
                  pcm[i * numChannels + ch] = channelData[i]!;
                }
              }

              sourceState.decodedAudio.push(pcm);
              audioData.close();
            },
            error: (err) => console.error('Audio decoder error:', err),
          });

          sourceState.audioDecoder.configure(audioConfig);
          mp4File.setExtractionOptions(audioTrack.id, 'audio', { nbSamples: 10000 });
        });
      }

      mp4File.start();
    };

    mp4File.onSamples = (trackId: number, _ref: unknown, samples: MP4Sample[]) => {
      const isAudioTrack = sourceState.audioTrack && trackId === sourceState.audioTrack.id;

      for (const sample of samples) {
        if (isAudioTrack) {
          sourceState.audioSamples.push(sample);
          // Decode audio immediately
          if (sourceState.audioDecoder && sourceState.audioDecoder.state === 'configured') {
            const chunk = new EncodedAudioChunk({
              type: sample.is_sync ? 'key' : 'delta',
              timestamp: Math.round((sample.cts / sample.timescale) * TIME.US_PER_SECOND),
              duration: Math.round((sample.duration / sample.timescale) * TIME.US_PER_SECOND),
              data: sample.data,
            });
            sourceState.audioDecoder.decode(chunk);
          }
        } else {
          sourceState.videoSamples.push(sample);
          if (sample.is_sync) {
            sourceState.keyframeIndices.push(sourceState.videoSamples.length - 1);
          }
        }
      }
    };

    mp4File.onError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      reject(new Error(`MP4Box error: ${message}`));
    };

    // Append buffer
    const ab = sourceData.buffer.slice(0) as MP4ArrayBuffer;
    ab.fileStart = 0;
    mp4File.appendBuffer(ab);
    mp4File.flush();

    // Wait for samples to be extracted and audio config to be validated
    setTimeout(async () => {
      try {
        // Wait for audio config validation if needed
        if (audioConfigPromise) {
          await audioConfigPromise;
        }
        // Flush audio decoder
        if (sourceState.audioDecoder && sourceState.audioDecoder.state === 'configured') {
          await sourceState.audioDecoder.flush();
        }
        sourceState.isReady = true;
        resolve();
      } catch (err) {
        reject(err);
      }
    }, 100);
  });
}

function getCodecDescription(mp4File: MP4File, trackId: number): Uint8Array | undefined {
  const track = mp4File.getTrackById(trackId);
  if (!track) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = (track as any).mdia?.minf?.stbl?.stsd?.entries?.[0];
  if (!entry) return undefined;

  // For video: look for avcC (H.264) or hvcC (H.265)
  const box = entry.avcC || entry.hvcC;
  if (!box) return undefined;

  const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
  box.write(stream);
  return new Uint8Array(stream.buffer, 8); // Skip box header
}

/**
 * Extract audio-specific codec description (AudioSpecificConfig for AAC).
 * This extracts the tag 5 descriptor data from the esds box.
 */
function getAudioCodecDescription(mp4File: MP4File, trackId: number): Uint8Array | null {
  const track = mp4File.getTrackById(trackId);
  if (!track) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trackAny = track as any;
  for (const entry of trackAny.mdia.minf.stbl.stsd.entries) {
    // AAC codec specific data (esds box)
    const esds = entry.esds;
    if (esds && esds.esd && esds.esd.descs) {
      for (const desc of esds.esd.descs) {
        if (desc.tag === 5 && desc.data) {
          return new Uint8Array(desc.data);
        }
      }
    }
    // Try mp4a box
    if (entry.type === 'mp4a' && entry.esds) {
      const esdsData = entry.esds;
      if (esdsData.esd && esdsData.esd.descs) {
        for (const desc of esdsData.esd.descs) {
          if (desc.tag === 5 && desc.data) {
            return new Uint8Array(desc.data);
          }
        }
      }
    }
  }
  return null;
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

// ============================================================================
// FRAME DECODING
// ============================================================================

async function decodeFrameForClip(
  clip: ActiveClipInfo,
  _timelineTimeUs: number
): Promise<VideoFrame | null> {
  const source = sources.get(clip.sourceId);
  if (!source || !source.videoDecoder || !source.videoTrack) {
    return null;
  }

  const targetTimeUs = clip.sourceStartUs;

  // Find the sample closest to target time
  const sampleIndex = findSampleAtTime(source, targetTimeUs);
  if (sampleIndex < 0) {
    return null;
  }

  // Find nearest keyframe before this sample
  const keyframeIndex = findKeyframeBefore(source, sampleIndex);
  if (keyframeIndex < 0) {
    return null;
  }

  // Decode from keyframe to target sample
  return new Promise((resolve) => {
    let targetFrame: VideoFrame | null = null;

    const tempDecoder = new VideoDecoder({
      output: (frame) => {
        // Keep the frame closest to target time
        if (targetFrame) {
          if (
            Math.abs(frame.timestamp - targetTimeUs) <
            Math.abs(targetFrame.timestamp - targetTimeUs)
          ) {
            targetFrame.close();
            targetFrame = frame;
          } else {
            frame.close();
          }
        } else {
          targetFrame = frame;
        }
      },
      error: (err) => {
        console.error('Frame decode error:', err);
        resolve(null);
      },
    });

    const codecDescription = getCodecDescription(source.mp4File, source.videoTrack!.id);
    tempDecoder.configure({
      codec: source.videoTrack!.codec,
      codedWidth: source.width,
      codedHeight: source.height,
      description: codecDescription,
    });

    // Decode samples from keyframe to target
    for (let i = keyframeIndex; i <= sampleIndex; i++) {
      const sample = source.videoSamples[i];
      if (!sample) continue;

      const chunk = new EncodedVideoChunk({
        type: sample.is_sync ? 'key' : 'delta',
        timestamp: Math.round((sample.cts / sample.timescale) * TIME.US_PER_SECOND),
        duration: Math.round((sample.duration / sample.timescale) * TIME.US_PER_SECOND),
        data: sample.data,
      });

      tempDecoder.decode(chunk);
    }

    tempDecoder.flush().then(() => {
      tempDecoder.close();
      resolve(targetFrame);
    });
  });
}

function findSampleAtTime(source: SourceDecodeState, targetTimeUs: number): number {
  const samples = source.videoSamples;
  if (samples.length === 0) return -1;

  // Binary search for closest sample
  let left = 0;
  let right = samples.length - 1;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const sample = samples[mid]!;
    const sampleTimeUs = Math.round((sample.cts / sample.timescale) * TIME.US_PER_SECOND);

    if (sampleTimeUs < targetTimeUs) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
}

function findKeyframeBefore(source: SourceDecodeState, sampleIndex: number): number {
  for (let i = source.keyframeIndices.length - 1; i >= 0; i--) {
    if (source.keyframeIndices[i]! <= sampleIndex) {
      return source.keyframeIndices[i]!;
    }
  }
  return source.keyframeIndices[0] ?? 0;
}

// ============================================================================
// AUDIO PROCESSING
// ============================================================================

async function processAudio(
  audioEncoder: AudioEncoder,
  inPointUs: number,
  outPointUs: number
): Promise<void> {
  const sampleRate = EXPORT.DEFAULT_AUDIO_SAMPLE_RATE;
  const channels = EXPORT.AUDIO_CHANNELS;
  const durationUs = outPointUs - inPointUs;
  const totalSamples = Math.ceil((durationUs / TIME.US_PER_SECOND) * sampleRate);

  // Create output buffer
  const outputBuffer = new Float32Array(totalSamples * channels);

  // Get all audio clips in range
  const audioClips: { clip: ClipJSON; trackIndex: number }[] = [];
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex]!;
    if (track.type !== 'audio') continue;

    for (const clip of track.clips) {
      const clipDurationUs = clip.trimOut - clip.trimIn;
      const clipEndUs = clip.startUs + clipDurationUs;

      // Check if clip overlaps with export range
      if (clipEndUs > inPointUs && clip.startUs < outPointUs) {
        audioClips.push({ clip, trackIndex });
      }
    }
  }

  // Mix each clip into output buffer
  for (const { clip } of audioClips) {
    const source = sources.get(clip.sourceId);
    if (!source || source.decodedAudio.length === 0) continue;

    // Combine all decoded audio chunks
    const totalLength = source.decodedAudio.reduce((sum, arr) => sum + arr.length, 0);
    const sourceAudio = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of source.decodedAudio) {
      sourceAudio.set(chunk, offset);
      offset += chunk.length;
    }

    // Calculate positions
    const clipDurationUs = clip.trimOut - clip.trimIn;
    const clipEndUs = clip.startUs + clipDurationUs;

    const playStartUs = Math.max(clip.startUs, inPointUs);
    const playEndUs = Math.min(clipEndUs, outPointUs);

    const sourceOffsetUs = clip.trimIn + (playStartUs - clip.startUs);
    const outputOffsetUs = playStartUs - inPointUs;

    // Convert to sample indices
    const sourceStartSample = Math.floor(
      (sourceOffsetUs / TIME.US_PER_SECOND) * source.audioSampleRate
    );
    const outputStartSample = Math.floor((outputOffsetUs / TIME.US_PER_SECOND) * sampleRate);
    const numSamples = Math.floor(((playEndUs - playStartUs) / TIME.US_PER_SECOND) * sampleRate);

    // Mix audio with volume
    const volume = clip.volume;
    for (let i = 0; i < numSamples; i++) {
      const srcIdx = (sourceStartSample + i) * source.audioChannels;
      const outIdx = (outputStartSample + i) * channels;

      if (srcIdx < sourceAudio.length && outIdx < outputBuffer.length) {
        // Mix stereo (or duplicate mono to stereo)
        const left = sourceAudio[srcIdx] ?? 0;
        const right = source.audioChannels > 1 ? (sourceAudio[srcIdx + 1] ?? left) : left;

        outputBuffer[outIdx] = (outputBuffer[outIdx] ?? 0) + left * volume;
        outputBuffer[outIdx + 1] = (outputBuffer[outIdx + 1] ?? 0) + right * volume;
      }
    }
  }

  // Clamp output
  for (let i = 0; i < outputBuffer.length; i++) {
    outputBuffer[i] = Math.max(-1, Math.min(1, outputBuffer[i]!));
  }

  // Encode audio in chunks
  const samplesPerChunk = 1024;
  for (let i = 0; i < totalSamples; i += samplesPerChunk) {
    if (cancelled) return;

    const chunkSamples = Math.min(samplesPerChunk, totalSamples - i);

    // Create PLANAR format data (all left samples, then all right samples)
    const planarData = new Float32Array(chunkSamples * channels);

    for (let j = 0; j < chunkSamples; j++) {
      const interleavedIdx = (i + j) * channels;
      // Left channel: first half of planar buffer
      planarData[j] = outputBuffer[interleavedIdx] ?? 0;
      // Right channel: second half of planar buffer
      planarData[chunkSamples + j] = outputBuffer[interleavedIdx + 1] ?? 0;
    }

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: chunkSamples,
      numberOfChannels: channels,
      timestamp: Math.round(((i / sampleRate) * TIME.US_PER_SECOND) + inPointUs),
      data: planarData,
    });

    audioEncoder.encode(audioData);
    audioData.close();
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

function cleanup(): void {
  // Close all decoders
  for (const source of sources.values()) {
    if (source.videoDecoder && source.videoDecoder.state !== 'closed') {
      source.videoDecoder.close();
    }
    if (source.audioDecoder && source.audioDecoder.state !== 'closed') {
      source.audioDecoder.close();
    }
  }

  sources.clear();

  if (compositor) {
    compositor.dispose();
    compositor = null;
  }

  // Clear subtitle renderer
  subtitleRenderer = null;
}

// Type augmentation for MP4Box
interface MP4ArrayBuffer extends ArrayBuffer {
  fileStart: number;
}
