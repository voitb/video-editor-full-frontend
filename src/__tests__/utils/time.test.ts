import { describe, it, expect } from 'vitest';
import {
  secondsToUs,
  usToSeconds,
  msToUs,
  usToMs,
  formatTimecode,
  formatTimecodeShort,
  clamp,
  rangesOverlap,
  getOverlap,
  frameToUs,
  usToFrame,
  snapToFrame,
} from '../../utils/time';

describe('time utilities', () => {
  describe('secondsToUs / usToSeconds', () => {
    it('should convert seconds to microseconds', () => {
      expect(secondsToUs(1)).toBe(1_000_000);
      expect(secondsToUs(0.5)).toBe(500_000);
      expect(secondsToUs(2.5)).toBe(2_500_000);
    });

    it('should convert microseconds to seconds', () => {
      expect(usToSeconds(1_000_000)).toBe(1);
      expect(usToSeconds(500_000)).toBe(0.5);
      expect(usToSeconds(2_500_000)).toBe(2.5);
    });

    it('should round trip correctly', () => {
      expect(usToSeconds(secondsToUs(1.234))).toBeCloseTo(1.234);
    });
  });

  describe('msToUs / usToMs', () => {
    it('should convert milliseconds to microseconds', () => {
      expect(msToUs(1)).toBe(1_000);
      expect(msToUs(100)).toBe(100_000);
      expect(msToUs(1000)).toBe(1_000_000);
    });

    it('should convert microseconds to milliseconds', () => {
      expect(usToMs(1_000)).toBe(1);
      expect(usToMs(100_000)).toBe(100);
      expect(usToMs(1_000_000)).toBe(1000);
    });
  });

  describe('formatTimecode', () => {
    it('should format short durations', () => {
      expect(formatTimecode(0)).toBe('0:00.000');
      expect(formatTimecode(1_500_000)).toBe('0:01.500');
      expect(formatTimecode(61_000_000)).toBe('1:01.000');
    });

    it('should format long durations with hours', () => {
      expect(formatTimecode(3661_000_000)).toBe('1:01:01.000');
    });
  });

  describe('formatTimecodeShort', () => {
    it('should format without milliseconds', () => {
      expect(formatTimecodeShort(0)).toBe('0:00');
      expect(formatTimecodeShort(61_000_000)).toBe('1:01');
      expect(formatTimecodeShort(125_500_000)).toBe('2:05');
    });
  });

  describe('clamp', () => {
    it('should clamp values to range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe('rangesOverlap', () => {
    it('should detect overlapping ranges', () => {
      expect(rangesOverlap(0, 100, 50, 150)).toBe(true);
      expect(rangesOverlap(50, 150, 0, 100)).toBe(true);
      expect(rangesOverlap(0, 100, 0, 100)).toBe(true);
    });

    it('should detect non-overlapping ranges', () => {
      expect(rangesOverlap(0, 100, 100, 200)).toBe(false);
      expect(rangesOverlap(0, 100, 200, 300)).toBe(false);
    });
  });

  describe('getOverlap', () => {
    it('should calculate overlap duration', () => {
      expect(getOverlap(0, 100, 50, 150)).toBe(50);
      expect(getOverlap(0, 100, 25, 75)).toBe(50);
      expect(getOverlap(0, 100, 0, 100)).toBe(100);
    });

    it('should return 0 for non-overlapping ranges', () => {
      expect(getOverlap(0, 100, 100, 200)).toBe(0);
      expect(getOverlap(0, 100, 200, 300)).toBe(0);
    });
  });

  describe('frameToUs / usToFrame', () => {
    it('should convert frame number to microseconds', () => {
      expect(frameToUs(30, 30)).toBe(1_000_000); // 30 frames at 30fps = 1s
      expect(frameToUs(60, 30)).toBe(2_000_000);
      expect(frameToUs(24, 24)).toBe(1_000_000);
    });

    it('should convert microseconds to frame number', () => {
      expect(usToFrame(1_000_000, 30)).toBe(30);
      expect(usToFrame(2_000_000, 30)).toBe(60);
      expect(usToFrame(500_000, 30)).toBe(15);
    });
  });

  describe('snapToFrame', () => {
    it('should snap to nearest frame boundary', () => {
      // At 30fps, each frame is ~33333us
      expect(snapToFrame(33333, 30)).toBe(33333);
      expect(snapToFrame(40000, 30)).toBe(33333); // Snaps to frame 1
      expect(snapToFrame(50000, 30)).toBe(66667); // Snaps to frame 2
    });
  });
});
