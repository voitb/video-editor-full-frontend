// ============================================================================
// EXPORT WORKER
// ============================================================================
// Web Worker for exporting trimmed video with audio using WebCodecs API
// and mp4-muxer for container creation.

import { createFile, DataStream } from 'mp4box';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { MP4File, MP4Sample, MP4Info, MP4VideoTrack, MP4AudioTrack } from 'mp4box';
import type { ExportWorkerCommand, ExportWorkerResponse, ExportConfig, ExportProgress } from './exportTypes';
import { createWorkerLogger } from '../utils/logger';
import { TIME } from '../constants';
import { findPreviousKeyframe } from '../utils/keyframeSearch';

const logger = createWorkerLogger('ExportWorker');
const { MICROSECONDS_PER_SECOND } = TIME;

// ============================================================================
// CONSTANTS
// ============================================================================

const EXPORT_CONFIG = {
  /** Default video bitrate (8 Mbps) */
  DEFAULT_VIDEO_BITRATE: 8_000_000,
  /** Default audio bitrate (128 kbps) */
  DEFAULT_AUDIO_BITRATE: 128_000,
  /** Progress update frequency (every N frames) */
  PROGRESS_UPDATE_FRAMES: 10,
  /** Decoder flush timeout (ms) */
  DECODER_FLUSH_TIMEOUT: 10_000,
} as const;

// ============================================================================
// STATE
// ============================================================================

interface ExportWorkerState {
  // Source data
  mp4File: MP4File | null;
  videoSamples: MP4Sample[];
  audioSamples: MP4Sample[];
  videoTrackInfo: MP4VideoTrack | null;
  audioTrackInfo: MP4AudioTrack | null;

  // Codec descriptions
  videoCodecDescription: Uint8Array | null;
  audioCodecDescription: Uint8Array | null;

  // Export state
  isExporting: boolean;
  exportAborted: boolean;

  // Progress tracking
  totalVideoFrames: number;
  processedVideoFrames: number;
  totalAudioSamples: number;
  processedAudioSamples: number;
  exportStartTime: number;

  // Keyframe index for O(log n) lookup
  keyframeIndices: number[];
}

const state: ExportWorkerState = {
  mp4File: null,
  videoSamples: [],
  audioSamples: [],
  videoTrackInfo: null,
  audioTrackInfo: null,
  videoCodecDescription: null,
  audioCodecDescription: null,
  isExporting: false,
  exportAborted: false,
  totalVideoFrames: 0,
  processedVideoFrames: 0,
  totalAudioSamples: 0,
  processedAudioSamples: 0,
  exportStartTime: 0,
  keyframeIndices: [],
};

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

function postResponse(response: ExportWorkerResponse): void {
  self.postMessage(response);
}

self.onmessage = async (e: MessageEvent<ExportWorkerCommand>) => {
  switch (e.data.type) {
    case 'START_EXPORT':
      await startExport(e.data.payload);
      break;
    case 'ABORT_EXPORT':
      state.exportAborted = true;
      logger.log('Export abort requested');
      break;
  }
};

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

async function startExport(config: ExportConfig): Promise<void> {
  if (state.isExporting) {
    postResponse({
      type: 'EXPORT_ERROR',
      payload: { message: 'Export already in progress', recoverable: true },
    });
    return;
  }

  try {
    resetState();
    state.isExporting = true;
    state.exportStartTime = performance.now();

    logger.log('Starting export', {
      inPointUs: config.inPointUs,
      outPointUs: config.outPointUs,
    });

    // Phase 1: Demux source file
    reportProgress('demuxing', 0, 0);
    await loadSourceFile(config);

    if (state.exportAborted) {
      handleAbort();
      return;
    }

    // Filter samples to trim range
    const trimmedVideoSamples = filterVideoSamplesToRange(config.inPointUs, config.outPointUs);
    const trimmedAudioSamples = filterAudioSamplesToRange(config.inPointUs, config.outPointUs);

    state.totalVideoFrames = trimmedVideoSamples.length;
    state.totalAudioSamples = trimmedAudioSamples.length;

    postResponse({
      type: 'EXPORT_STARTED',
      payload: {
        estimatedFrames: state.totalVideoFrames,
        hasAudio: state.audioTrackInfo !== null && trimmedAudioSamples.length > 0,
      },
    });

    if (trimmedVideoSamples.length === 0) {
      throw new Error('No video frames in selected range');
    }

    // Phase 2: Setup muxer and encode
    reportProgress('encoding', 0, 0);

    const sourceName = config.sourceName ?? config.file?.name ?? 'hls_video';
    const { blob, filename } = await encodeAndMux(
      trimmedVideoSamples,
      trimmedAudioSamples,
      config.inPointUs,
      sourceName
    );

    if (state.exportAborted) {
      handleAbort();
      return;
    }

    // Phase 3: Complete
    const durationMs = performance.now() - state.exportStartTime;
    logger.log('Export complete', { durationMs, blobSize: blob.size });

    postResponse({
      type: 'EXPORT_COMPLETE',
      payload: { blob, filename, durationMs },
    });
  } catch (error) {
    handleExportError(error);
  } finally {
    state.isExporting = false;
    cleanup();
  }
}

// ============================================================================
// FILE LOADING & DEMUXING
// ============================================================================

async function loadSourceFile(config: ExportConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    state.mp4File = createFile();

    state.mp4File.onReady = (info: MP4Info) => {
      // Get video track
      state.videoTrackInfo = info.videoTracks[0] ?? null;
      if (!state.videoTrackInfo) {
        reject(new Error('No video track found in file'));
        return;
      }

      // Get audio track (optional)
      state.audioTrackInfo = info.audioTracks[0] ?? null;

      // Get codec descriptions
      state.videoCodecDescription = getVideoCodecDescription(state.mp4File!, state.videoTrackInfo.id);
      if (state.audioTrackInfo) {
        state.audioCodecDescription = getAudioCodecDescription(state.mp4File!, state.audioTrackInfo.id);
      }

      // Set extraction options for all tracks
      state.mp4File!.setExtractionOptions(state.videoTrackInfo.id, 'video', { nbSamples: Infinity });
      if (state.audioTrackInfo) {
        state.mp4File!.setExtractionOptions(state.audioTrackInfo.id, 'audio', { nbSamples: Infinity });
      }
      state.mp4File!.start();
    };

    state.mp4File.onSamples = (_id: number, user: unknown, samples: MP4Sample[]) => {
      if (user === 'video') {
        for (const sample of samples) {
          const sampleIndex = state.videoSamples.length;
          state.videoSamples.push(sample);
          if (sample.is_sync) {
            state.keyframeIndices.push(sampleIndex);
          }
        }
      } else if (user === 'audio') {
        state.audioSamples.push(...samples);
      }
    };

    state.mp4File.onError = (e: Error) => {
      reject(e);
    };

    // Get buffer from file or use pre-loaded buffer
    const bufferPromise: Promise<ArrayBuffer> = config.sourceBuffer
      ? Promise.resolve(config.sourceBuffer)
      : config.file
        ? config.file.arrayBuffer()
        : Promise.reject(new Error('No source provided'));

    bufferPromise.then((buffer) => {
      const mp4Buffer = buffer as ArrayBuffer & { fileStart: number };
      mp4Buffer.fileStart = 0;

      state.mp4File!.appendBuffer(mp4Buffer);
      state.mp4File!.flush();

      // Give time for samples to be extracted
      setTimeout(() => {
        if (state.videoSamples.length > 0) {
          resolve();
        } else {
          reject(new Error('No video samples extracted'));
        }
      }, 100);
    }).catch(reject);
  });
}

// ============================================================================
// SAMPLE FILTERING
// ============================================================================

function filterVideoSamplesToRange(inPointUs: number, outPointUs: number): MP4Sample[] {
  if (state.videoSamples.length === 0) return [];

  // Find samples that fall within the trim range
  const inRangeSamples: MP4Sample[] = [];

  for (const sample of state.videoSamples) {
    const sampleTimeUs = (sample.cts * MICROSECONDS_PER_SECOND) / sample.timescale;
    if (sampleTimeUs >= inPointUs && sampleTimeUs < outPointUs) {
      inRangeSamples.push(sample);
    }
  }

  if (inRangeSamples.length === 0) return [];

  // Find the first in-range sample index
  const firstSample = inRangeSamples[0];
  if (!firstSample) return [];
  const firstInRangeIndex = state.videoSamples.indexOf(firstSample);

  // Find the keyframe before the first in-range sample
  const keyframeIndex = findPreviousKeyframe(state.keyframeIndices, firstInRangeIndex, state.videoSamples);

  // Include samples from keyframe to ensure decodability
  const result: MP4Sample[] = [];
  for (let i = keyframeIndex; i < state.videoSamples.length; i++) {
    const sample = state.videoSamples[i];
    if (!sample) continue;
    const sampleTimeUs = (sample.cts * MICROSECONDS_PER_SECOND) / sample.timescale;

    // Include pre-roll samples (before inPoint but after keyframe)
    if (i >= keyframeIndex && sampleTimeUs < outPointUs) {
      result.push(sample);
    }
    if (sampleTimeUs >= outPointUs) break;
  }

  return result;
}

function filterAudioSamplesToRange(inPointUs: number, outPointUs: number): MP4Sample[] {
  if (state.audioSamples.length === 0) return [];

  return state.audioSamples.filter((sample) => {
    const sampleTimeUs = (sample.cts * MICROSECONDS_PER_SECOND) / sample.timescale;
    return sampleTimeUs >= inPointUs && sampleTimeUs < outPointUs;
  });
}

// ============================================================================
// ENCODING & MUXING
// ============================================================================

async function encodeAndMux(
  videoSamples: MP4Sample[],
  audioSamples: MP4Sample[],
  inPointUs: number,
  originalFilename: string
): Promise<{ blob: Blob; filename: string }> {
  if (!state.videoTrackInfo) {
    throw new Error('No video track info available');
  }

  const { width, height } = state.videoTrackInfo.video;

  // Create muxer
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width,
      height,
    },
    audio: state.audioTrackInfo
      ? {
          codec: 'aac',
          sampleRate: state.audioTrackInfo.audio.sample_rate,
          numberOfChannels: state.audioTrackInfo.audio.channel_count,
        }
      : undefined,
    fastStart: 'in-memory',
    // Automatically offset timestamps to start from 0
    firstTimestampBehavior: 'offset',
  });

  // Process video
  await processVideoTrack(videoSamples, muxer, inPointUs);

  if (state.exportAborted) {
    muxer.finalize();
    throw new Error('Export aborted');
  }

  // Process audio
  if (state.audioTrackInfo && audioSamples.length > 0) {
    await processAudioTrack(audioSamples, muxer, inPointUs);
  }

  if (state.exportAborted) {
    muxer.finalize();
    throw new Error('Export aborted');
  }

  // Finalize
  reportProgress('finalizing', 100, 100);
  muxer.finalize();

  const { buffer } = muxer.target as ArrayBufferTarget;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  const filename = generateFilename(originalFilename);

  return { blob, filename };
}

async function processVideoTrack(
  samples: MP4Sample[],
  muxer: Muxer<ArrayBufferTarget>,
  inPointUs: number
): Promise<void> {
  if (!state.videoTrackInfo) return;

  const decodedFrames: VideoFrame[] = [];

  // Setup decoder
  const decoder = new VideoDecoder({
    output: (frame) => {
      decodedFrames.push(frame);
    },
    error: (e) => {
      logger.error('Video decoder error:', e);
      throw e;
    },
  });

  decoder.configure({
    codec: state.videoTrackInfo.codec,
    codedWidth: state.videoTrackInfo.video.width,
    codedHeight: state.videoTrackInfo.video.height,
    description: state.videoCodecDescription ?? undefined,
  });

  // Setup encoder
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      logger.error('Video encoder error:', e);
      throw e;
    },
  });

  encoder.configure({
    codec: 'avc1.640028', // H.264 High Profile, Level 4.0
    width: state.videoTrackInfo.video.width,
    height: state.videoTrackInfo.video.height,
    bitrate: EXPORT_CONFIG.DEFAULT_VIDEO_BITRATE,
    framerate: 30,
  });

  // Decode all samples
  for (const sample of samples) {
    if (state.exportAborted) break;

    const chunk = new EncodedVideoChunk({
      type: sample.is_sync ? 'key' : 'delta',
      timestamp: (sample.cts * MICROSECONDS_PER_SECOND) / sample.timescale,
      duration: (sample.duration * MICROSECONDS_PER_SECOND) / sample.timescale,
      data: sample.data,
    });

    decoder.decode(chunk);
  }

  // Wait for decoder to finish
  await decoder.flush();

  // Encode frames (adjusting timestamps to start at 0)
  let frameIndex = 0;
  for (const frame of decodedFrames) {
    if (state.exportAborted) {
      frame.close();
      continue;
    }

    const originalTimestamp = frame.timestamp ?? 0;

    // Skip pre-roll frames (those before inPoint, used for decoder priming)
    if (originalTimestamp < inPointUs) {
      frame.close();
      continue;
    }

    // Force first frame to be a keyframe
    // Note: Timestamp adjustment happens in the muxer based on encode order
    const isKeyFrame = frameIndex === 0;

    encoder.encode(frame, { keyFrame: isKeyFrame });
    frame.close();

    state.processedVideoFrames++;
    frameIndex++;

    // Update progress
    if (state.processedVideoFrames % EXPORT_CONFIG.PROGRESS_UPDATE_FRAMES === 0) {
      reportProgress('encoding', calculateVideoProgress(), calculateAudioProgress());
    }
  }

  // Flush encoder
  await encoder.flush();
  encoder.close();
  decoder.close();
}

async function processAudioTrack(
  samples: MP4Sample[],
  muxer: Muxer<ArrayBufferTarget>,
  inPointUs: number
): Promise<void> {
  if (!state.audioTrackInfo) return;

  const decodedAudio: AudioData[] = [];

  // Setup decoder
  const decoder = new AudioDecoder({
    output: (audioData) => {
      decodedAudio.push(audioData);
    },
    error: (e) => {
      logger.error('Audio decoder error:', e);
      throw e;
    },
  });

  // Determine codec string for decoder
  const audioCodec = state.audioTrackInfo.codec;

  decoder.configure({
    codec: audioCodec,
    sampleRate: state.audioTrackInfo.audio.sample_rate,
    numberOfChannels: state.audioTrackInfo.audio.channel_count,
    description: state.audioCodecDescription ?? undefined,
  });

  // Setup encoder
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      muxer.addAudioChunk(chunk, meta);
    },
    error: (e) => {
      logger.error('Audio encoder error:', e);
      throw e;
    },
  });

  encoder.configure({
    codec: 'mp4a.40.2', // AAC-LC
    sampleRate: state.audioTrackInfo.audio.sample_rate,
    numberOfChannels: state.audioTrackInfo.audio.channel_count,
    bitrate: EXPORT_CONFIG.DEFAULT_AUDIO_BITRATE,
  });

  // Decode all samples
  for (const sample of samples) {
    if (state.exportAborted) break;

    const chunk = new EncodedAudioChunk({
      type: 'key', // Audio chunks are always key frames
      timestamp: (sample.cts * MICROSECONDS_PER_SECOND) / sample.timescale,
      duration: (sample.duration * MICROSECONDS_PER_SECOND) / sample.timescale,
      data: sample.data,
    });

    decoder.decode(chunk);
  }

  // Wait for decoder to finish
  await decoder.flush();

  // Encode audio (adjusting timestamps to start at 0)
  for (const audioData of decodedAudio) {
    if (state.exportAborted) {
      audioData.close();
      continue;
    }

    const originalTimestamp = audioData.timestamp;

    // Skip pre-roll audio
    if (originalTimestamp < inPointUs) {
      audioData.close();
      continue;
    }

    // Adjust timestamp to start from 0
    const adjustedTimestamp = originalTimestamp - inPointUs;

    // Create new AudioData with adjusted timestamp
    const format = audioData.format;
    const sampleRate = audioData.sampleRate;
    const numberOfFrames = audioData.numberOfFrames;
    const numberOfChannels = audioData.numberOfChannels;

    const buffer = new ArrayBuffer(audioData.allocationSize({ planeIndex: 0 }));
    audioData.copyTo(buffer, { planeIndex: 0 });

    const adjustedAudioData = new AudioData({
      format: format!,
      sampleRate,
      numberOfFrames,
      numberOfChannels,
      timestamp: adjustedTimestamp,
      data: buffer,
    });

    encoder.encode(adjustedAudioData);

    audioData.close();
    adjustedAudioData.close();

    state.processedAudioSamples++;
  }

  // Flush encoder
  await encoder.flush();
  encoder.close();
  decoder.close();
}

// ============================================================================
// CODEC DESCRIPTION HELPERS
// ============================================================================

function getVideoCodecDescription(file: MP4File, trackId: number): Uint8Array | null {
  try {
    const track = file.getTrackById(trackId);
    for (const entry of track.mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC;
      if (box) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        box.write(stream);
        return new Uint8Array(stream.buffer.slice(8)); // Remove box header
      }
    }
  } catch (e) {
    logger.warn('Failed to get video codec description:', e);
  }
  return null;
}

function getAudioCodecDescription(file: MP4File, trackId: number): Uint8Array | null {
  try {
    const track = file.getTrackById(trackId);
    for (const entry of track.mdia.minf.stbl.stsd.entries) {
      // For AAC, look for esds box
      const esds = (entry as Record<string, unknown>).esds;
      if (esds && typeof esds === 'object' && 'write' in esds) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        (esds as { write: (s: DataStream) => void }).write(stream);
        return new Uint8Array(stream.buffer.slice(8));
      }
    }
  } catch (e) {
    logger.warn('Failed to get audio codec description:', e);
  }
  return null;
}

// ============================================================================
// PROGRESS & HELPERS
// ============================================================================

function calculateVideoProgress(): number {
  if (state.totalVideoFrames === 0) return 100;
  return (state.processedVideoFrames / state.totalVideoFrames) * 100;
}

function calculateAudioProgress(): number {
  if (state.totalAudioSamples === 0) return 100;
  return (state.processedAudioSamples / state.totalAudioSamples) * 100;
}

function reportProgress(stage: ExportProgress['stage'], videoProgress: number, audioProgress: number): void {
  // Weight: video 70%, audio 30%
  const overallProgress = state.audioTrackInfo
    ? videoProgress * 0.7 + audioProgress * 0.3
    : videoProgress;

  // Estimate remaining time
  const elapsed = performance.now() - state.exportStartTime;
  const estimatedRemainingMs =
    overallProgress > 5 ? (elapsed / overallProgress) * (100 - overallProgress) : null;

  postResponse({
    type: 'EXPORT_PROGRESS',
    payload: {
      stage,
      videoProgress,
      audioProgress,
      overallProgress,
      currentTimeUs: 0,
      estimatedRemainingMs,
    },
  });
}

function generateFilename(originalName: string): string {
  const baseName = originalName.replace(/\.[^/.]+$/, ''); // Remove extension
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${baseName}_trimmed_${timestamp}.mp4`;
}

function handleExportError(error: unknown): void {
  logger.error('Export error:', error);

  let message = 'Export failed';
  let recoverable = true;

  if (error instanceof DOMException) {
    if (error.name === 'NotSupportedError') {
      message = 'This video codec is not supported for export in your browser.';
      recoverable = false;
    } else {
      message = error.message;
    }
  } else if (error instanceof Error) {
    if (error.message.includes('memory')) {
      message = 'Video is too large to export. Try a shorter clip.';
      recoverable = false;
    } else if (error.message.includes('aborted')) {
      // Don't send error for aborted exports
      return;
    } else {
      message = error.message;
    }
  }

  postResponse({
    type: 'EXPORT_ERROR',
    payload: { message, recoverable },
  });
}

function handleAbort(): void {
  logger.log('Export aborted');
  postResponse({ type: 'EXPORT_ABORTED' });
}

function resetState(): void {
  state.mp4File = null;
  state.videoSamples = [];
  state.audioSamples = [];
  state.videoTrackInfo = null;
  state.audioTrackInfo = null;
  state.videoCodecDescription = null;
  state.audioCodecDescription = null;
  state.exportAborted = false;
  state.totalVideoFrames = 0;
  state.processedVideoFrames = 0;
  state.totalAudioSamples = 0;
  state.processedAudioSamples = 0;
  state.keyframeIndices = [];
}

function cleanup(): void {
  state.videoSamples = [];
  state.audioSamples = [];
  state.mp4File = null;
}
