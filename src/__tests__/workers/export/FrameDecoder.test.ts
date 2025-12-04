import { describe, it, expect } from 'vitest';
import { findSampleAtTime, findKeyframeBefore } from '../../../workers/export/FrameDecoder';
import type { ExportSourceState } from '../../../workers/export/types';
import { TIME } from '../../../constants';

// Helper to create a mock source with video samples
function createMockSource(sampleTimesUs: number[], keyframeIndices: number[]): ExportSourceState {
  const videoSamples = sampleTimesUs.map((timeUs, index) => ({
    cts: (timeUs / TIME.US_PER_SECOND) * 30000, // Assuming timescale of 30000
    timescale: 30000,
    duration: 1000, // ~33ms per frame at 30fps
    is_sync: keyframeIndices.includes(index),
    data: new Uint8Array(100),
  }));

  return {
    sourceId: 'test-source',
    mp4File: {} as ExportSourceState['mp4File'],
    videoDecoder: null,
    audioDecoder: null,
    videoTrack: null,
    audioTrack: null,
    videoSamples: videoSamples as unknown as ExportSourceState['videoSamples'],
    audioSamples: [],
    keyframeIndices,
    durationUs: 10_000_000,
    width: 1920,
    height: 1080,
    isReady: true,
    decodedAudio: [],
    audioSampleRate: 48000,
    audioChannels: 2,
  };
}

describe('FrameDecoder', () => {
  describe('findSampleAtTime', () => {
    it('returns -1 for empty samples', () => {
      const source = createMockSource([], []);
      expect(findSampleAtTime(source, 500_000)).toBe(-1);
    });

    it('finds sample at exact time', () => {
      // Samples at 0, 33333, 66666, 100000 microseconds (30fps)
      const source = createMockSource([0, 33_333, 66_666, 100_000], [0]);

      expect(findSampleAtTime(source, 0)).toBe(0);
      expect(findSampleAtTime(source, 33_333)).toBe(1);
      expect(findSampleAtTime(source, 66_666)).toBe(2);
      expect(findSampleAtTime(source, 100_000)).toBe(3);
    });

    it('finds sample at or after target time (binary search)', () => {
      const source = createMockSource([0, 33_333, 66_666, 100_000], [0]);

      // Between sample 0 and 1, should return 1 (first sample >= target)
      expect(findSampleAtTime(source, 20_000)).toBe(1);

      // Between sample 2 and 3
      expect(findSampleAtTime(source, 80_000)).toBe(3);
    });

    it('returns first sample for time before any sample', () => {
      const source = createMockSource([100_000, 133_333, 166_666], [0]);

      // Time before first sample
      expect(findSampleAtTime(source, 0)).toBe(0);
      expect(findSampleAtTime(source, 50_000)).toBe(0);
    });

    it('returns last sample for time after all samples', () => {
      const source = createMockSource([0, 33_333, 66_666], [0]);

      // Time after last sample - binary search returns last valid index
      expect(findSampleAtTime(source, 100_000)).toBe(2);
      expect(findSampleAtTime(source, 1_000_000)).toBe(2);
    });

    it('handles single sample', () => {
      const source = createMockSource([50_000], [0]);

      expect(findSampleAtTime(source, 0)).toBe(0);
      expect(findSampleAtTime(source, 50_000)).toBe(0);
      expect(findSampleAtTime(source, 100_000)).toBe(0);
    });

    it('handles many samples with binary search efficiency', () => {
      // Create 1000 samples at 33333us intervals
      const sampleTimes = Array.from({ length: 1000 }, (_, i) => i * 33_333);
      const source = createMockSource(sampleTimes, [0, 250, 500, 750]);

      // Test various target times
      expect(findSampleAtTime(source, 0)).toBe(0);
      expect(findSampleAtTime(source, 500 * 33_333)).toBe(500);
      expect(findSampleAtTime(source, 999 * 33_333)).toBe(999);
    });
  });

  describe('findKeyframeBefore', () => {
    it('returns 0 for first keyframe when no keyframe before', () => {
      const source = createMockSource([0, 33_333, 66_666, 100_000], [0]);

      // Keyframe at 0, asking for keyframe before sample 0
      expect(findKeyframeBefore(source, 0)).toBe(0);
    });

    it('finds keyframe at sample index', () => {
      // Keyframes at indices 0, 60, 120
      const sampleTimes = Array.from({ length: 150 }, (_, i) => i * 33_333);
      const source = createMockSource(sampleTimes, [0, 60, 120]);

      // Keyframe exactly at sample 60
      expect(findKeyframeBefore(source, 60)).toBe(60);
      // Keyframe exactly at sample 120
      expect(findKeyframeBefore(source, 120)).toBe(120);
    });

    it('finds nearest keyframe before sample index', () => {
      // Keyframes at indices 0, 60, 120
      const sampleTimes = Array.from({ length: 150 }, (_, i) => i * 33_333);
      const source = createMockSource(sampleTimes, [0, 60, 120]);

      // Sample 30 -> keyframe at 0
      expect(findKeyframeBefore(source, 30)).toBe(0);

      // Sample 90 -> keyframe at 60
      expect(findKeyframeBefore(source, 90)).toBe(60);

      // Sample 140 -> keyframe at 120
      expect(findKeyframeBefore(source, 140)).toBe(120);
    });

    it('returns first keyframe for index 0', () => {
      const source = createMockSource([0, 33_333, 66_666], [0]);
      expect(findKeyframeBefore(source, 0)).toBe(0);
    });

    it('handles multiple keyframes correctly', () => {
      // Keyframes at every 30 frames
      const sampleTimes = Array.from({ length: 120 }, (_, i) => i * 33_333);
      const keyframes = [0, 30, 60, 90];
      const source = createMockSource(sampleTimes, keyframes);

      expect(findKeyframeBefore(source, 15)).toBe(0);
      expect(findKeyframeBefore(source, 45)).toBe(30);
      expect(findKeyframeBefore(source, 75)).toBe(60);
      expect(findKeyframeBefore(source, 100)).toBe(90);
    });

    it('returns 0 when no keyframe indices exist', () => {
      const source = createMockSource([0, 33_333, 66_666], []);
      expect(findKeyframeBefore(source, 2)).toBe(0);
    });

    it('handles keyframe at last sample', () => {
      // Keyframe at the last sample
      const source = createMockSource([0, 33_333, 66_666], [0, 2]);

      expect(findKeyframeBefore(source, 2)).toBe(2);
      expect(findKeyframeBefore(source, 1)).toBe(0);
    });
  });
});
