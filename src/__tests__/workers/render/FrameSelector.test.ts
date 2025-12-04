import { describe, it, expect } from 'vitest';
import { findSampleAtTime, findKeyframeBefore, sampleToUs, sampleDurationToUs } from '../../../workers/render/FrameSelector';
import type { MP4Sample } from 'mp4box';

// Helper to create a mock sample
function createMockSample(cts: number, timescale: number, isSync = false, duration = 1000): MP4Sample {
  return {
    cts,
    timescale,
    is_sync: isSync,
    duration,
    data: new Uint8Array(0),
  } as unknown as MP4Sample;
}

describe('FrameSelector', () => {
  describe('findSampleAtTime', () => {
    it('returns -1 for empty samples array', () => {
      expect(findSampleAtTime([], 1000000)).toBe(-1);
    });

    it('finds exact match', () => {
      const samples = [
        createMockSample(0, 1000000),      // 0μs
        createMockSample(33333, 1000000),  // 33333μs
        createMockSample(66666, 1000000),  // 66666μs
        createMockSample(100000, 1000000), // 100000μs
      ];

      expect(findSampleAtTime(samples, 33333)).toBe(1);
      expect(findSampleAtTime(samples, 66666)).toBe(2);
    });

    it('finds sample at or after target time', () => {
      const samples = [
        createMockSample(0, 1000000),
        createMockSample(33333, 1000000),
        createMockSample(66666, 1000000),
        createMockSample(100000, 1000000),
      ];

      // Target between samples should return the next sample
      expect(findSampleAtTime(samples, 50000)).toBe(2); // 66666 is closest after
    });

    it('returns last index if target is past all samples', () => {
      const samples = [
        createMockSample(0, 1000000),
        createMockSample(33333, 1000000),
      ];

      expect(findSampleAtTime(samples, 100000)).toBe(1);
    });

    it('returns 0 if target is before all samples', () => {
      const samples = [
        createMockSample(100000, 1000000),
        createMockSample(200000, 1000000),
      ];

      expect(findSampleAtTime(samples, 0)).toBe(0);
    });

    it('handles different timescales', () => {
      // 30fps video: timescale 30, cts increments by 1
      const samples = [
        createMockSample(0, 30),
        createMockSample(1, 30),   // 33333μs
        createMockSample(2, 30),   // 66666μs
        createMockSample(3, 30),   // 100000μs
      ];

      // Looking for 50000μs (between sample 1 and 2)
      const result = findSampleAtTime(samples, 50000);
      expect(result).toBe(2);
    });
  });

  describe('findKeyframeBefore', () => {
    it('returns 0 for empty keyframe indices', () => {
      expect(findKeyframeBefore([], 10)).toBe(0);
    });

    it('returns the keyframe before target sample', () => {
      const keyframeIndices = [0, 30, 60, 90];

      expect(findKeyframeBefore(keyframeIndices, 45)).toBe(30);
      expect(findKeyframeBefore(keyframeIndices, 70)).toBe(60);
    });

    it('returns exact match if target is a keyframe', () => {
      const keyframeIndices = [0, 30, 60, 90];

      expect(findKeyframeBefore(keyframeIndices, 30)).toBe(30);
      expect(findKeyframeBefore(keyframeIndices, 60)).toBe(60);
    });

    it('returns first keyframe if target is before all', () => {
      const keyframeIndices = [30, 60, 90];

      expect(findKeyframeBefore(keyframeIndices, 10)).toBe(30);
    });

    it('returns last keyframe if target is past all', () => {
      const keyframeIndices = [0, 30, 60];

      expect(findKeyframeBefore(keyframeIndices, 100)).toBe(60);
    });

    it('handles single keyframe', () => {
      expect(findKeyframeBefore([0], 50)).toBe(0);
      expect(findKeyframeBefore([30], 50)).toBe(30);
      expect(findKeyframeBefore([60], 50)).toBe(60);
    });
  });

  describe('sampleToUs', () => {
    it('converts sample timestamp to microseconds', () => {
      const sample = createMockSample(1000000, 1000000);
      expect(sampleToUs(sample)).toBe(1000000);
    });

    it('handles different timescales', () => {
      // 30fps: 1 second = 30 cts units
      const sample = createMockSample(30, 30);
      expect(sampleToUs(sample)).toBe(1000000);
    });

    it('rounds to nearest microsecond', () => {
      const sample = createMockSample(1, 3); // 333333.33...μs
      expect(sampleToUs(sample)).toBe(333333);
    });
  });

  describe('sampleDurationToUs', () => {
    it('converts sample duration to microseconds', () => {
      const sample = createMockSample(0, 1000000, false, 33333);
      expect(sampleDurationToUs(sample)).toBe(33333);
    });

    it('handles different timescales', () => {
      // 30fps: each frame duration is 1/30 second
      const sample = createMockSample(0, 30, false, 1);
      expect(sampleDurationToUs(sample)).toBe(33333);
    });
  });
});
