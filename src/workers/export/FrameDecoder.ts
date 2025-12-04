/**
 * Frame Decoder
 * Decodes video frames for export using temporary VideoDecoder instances.
 */

import type { MP4File } from 'mp4box';
import * as MP4Box from 'mp4box';
import { TIME } from '../../constants';
import type { ExportSourceState, ActiveClipInfo } from './types';

/**
 * Find sample index at or after target time using binary search.
 */
export function findSampleAtTime(source: ExportSourceState, targetTimeUs: number): number {
  const samples = source.videoSamples;
  if (samples.length === 0) return -1;

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

/**
 * Find keyframe index at or before sample index.
 */
export function findKeyframeBefore(source: ExportSourceState, sampleIndex: number): number {
  for (let i = source.keyframeIndices.length - 1; i >= 0; i--) {
    if (source.keyframeIndices[i]! <= sampleIndex) {
      return source.keyframeIndices[i]!;
    }
  }
  return source.keyframeIndices[0] ?? 0;
}

/**
 * Get video codec description from MP4 file.
 */
export function getVideoCodecDescription(mp4File: MP4File, trackId: number): Uint8Array | undefined {
  const track = mp4File.getTrackById(trackId);
  if (!track) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = (track as any).mdia?.minf?.stbl?.stsd?.entries?.[0];
  if (!entry) return undefined;

  // For video: look for avcC (H.264) or hvcC (H.265)
  const box = entry.avcC || entry.hvcC;
  if (!box) return undefined;

  const stream = new (MP4Box as any).DataStream(undefined, 0, (MP4Box as any).DataStream.BIG_ENDIAN);
  box.write(stream);
  return new Uint8Array(stream.buffer, 8); // Skip box header
}

/**
 * Get audio codec description from MP4 file.
 */
export function getAudioCodecDescription(mp4File: MP4File, trackId: number): Uint8Array | null {
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

/**
 * Decode a video frame for a specific clip at a specific time.
 * Creates a temporary decoder, decodes from keyframe to target, and returns the best frame.
 */
export async function decodeFrameForClip(
  clip: ActiveClipInfo,
  sources: Map<string, ExportSourceState>
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

    const codecDescription = getVideoCodecDescription(source.mp4File, source.videoTrack!.id);
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
