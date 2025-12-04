import { describe, it, expect } from 'vitest';
import { findPreviousKeyframe, type SampleInfo } from './keyframeSearch';

describe('findPreviousKeyframe', () => {
  describe('edge cases', () => {
    it('returns 0 when keyframeIndices is empty', () => {
      expect(findPreviousKeyframe([], 100)).toBe(0);
    });

    it('returns 0 when targetSampleIndex is negative', () => {
      const keyframes = [0, 30, 60];
      expect(findPreviousKeyframe(keyframes, -10)).toBe(0);
    });

    it('returns first keyframe when only one keyframe exists', () => {
      expect(findPreviousKeyframe([0], 100)).toBe(0);
      expect(findPreviousKeyframe([50], 100)).toBe(50);
    });
  });

  describe('binary search behavior', () => {
    const keyframes = [0, 30, 60, 90, 120];

    it('returns exact keyframe when target matches', () => {
      expect(findPreviousKeyframe(keyframes, 0)).toBe(0);
      expect(findPreviousKeyframe(keyframes, 30)).toBe(30);
      expect(findPreviousKeyframe(keyframes, 60)).toBe(60);
      expect(findPreviousKeyframe(keyframes, 90)).toBe(90);
      expect(findPreviousKeyframe(keyframes, 120)).toBe(120);
    });

    it('returns previous keyframe when target is between keyframes', () => {
      expect(findPreviousKeyframe(keyframes, 15)).toBe(0);
      expect(findPreviousKeyframe(keyframes, 45)).toBe(30);
      expect(findPreviousKeyframe(keyframes, 75)).toBe(60);
      expect(findPreviousKeyframe(keyframes, 105)).toBe(90);
    });

    it('returns last keyframe when target is beyond all keyframes', () => {
      expect(findPreviousKeyframe(keyframes, 150)).toBe(120);
      expect(findPreviousKeyframe(keyframes, 1000)).toBe(120);
    });

    it('returns first keyframe when target is before first keyframe', () => {
      const keyframes = [10, 40, 70];
      expect(findPreviousKeyframe(keyframes, 5)).toBe(0);
    });
  });

  describe('with sample validation', () => {
    const keyframes = [0, 30, 60];
    const samples: SampleInfo[] = [
      { is_sync: true },  // 0 - keyframe
      { is_sync: false }, // 1
      { is_sync: false }, // 2
      // ... samples 3-29 ...
      ...Array(27).fill({ is_sync: false }),
      { is_sync: true },  // 30 - keyframe
      // ... samples 31-59 ...
      ...Array(29).fill({ is_sync: false }),
      { is_sync: true },  // 60 - keyframe
    ];

    it('validates keyframe result against samples', () => {
      expect(findPreviousKeyframe(keyframes, 45, samples)).toBe(30);
    });

    it('returns first keyframe when result is not a sync frame', () => {
      const badKeyframes = [0, 25, 60]; // 25 is NOT actually a keyframe
      expect(findPreviousKeyframe(badKeyframes, 30, samples)).toBe(0);
    });

    it('works without samples parameter', () => {
      expect(findPreviousKeyframe(keyframes, 45)).toBe(30);
    });
  });

  describe('real-world scenarios', () => {
    it('handles typical video keyframe pattern (GOP of 30)', () => {
      // Typical 1-second GOP at 30fps
      const keyframes = [0, 30, 60, 90, 120, 150, 180, 210, 240];

      // Seeking to frame 75 should return keyframe at 60
      expect(findPreviousKeyframe(keyframes, 75)).toBe(60);

      // Seeking to frame 1 should return keyframe at 0
      expect(findPreviousKeyframe(keyframes, 1)).toBe(0);

      // Seeking to exact keyframe
      expect(findPreviousKeyframe(keyframes, 90)).toBe(90);
    });

    it('handles variable GOP sizes', () => {
      // Scene changes cause irregular keyframe placement
      const keyframes = [0, 15, 45, 46, 100, 200];

      expect(findPreviousKeyframe(keyframes, 20)).toBe(15);
      expect(findPreviousKeyframe(keyframes, 46)).toBe(46);
      expect(findPreviousKeyframe(keyframes, 47)).toBe(46);
      expect(findPreviousKeyframe(keyframes, 150)).toBe(100);
    });
  });
});
