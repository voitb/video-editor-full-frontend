import { describe, it, expect } from 'vitest';
import { formatTime, formatTimeCompact, usToSeconds, secondsToUs } from './time';

describe('time utilities', () => {
  describe('usToSeconds', () => {
    it('converts 0 microseconds to 0 seconds', () => {
      expect(usToSeconds(0)).toBe(0);
    });

    it('converts 1 million microseconds to 1 second', () => {
      expect(usToSeconds(1_000_000)).toBe(1);
    });

    it('converts fractional microseconds correctly', () => {
      expect(usToSeconds(500_000)).toBe(0.5);
      expect(usToSeconds(1_500_000)).toBe(1.5);
    });

    it('handles large values', () => {
      expect(usToSeconds(60_000_000)).toBe(60);
      expect(usToSeconds(3600_000_000)).toBe(3600);
    });
  });

  describe('secondsToUs', () => {
    it('converts 0 seconds to 0 microseconds', () => {
      expect(secondsToUs(0)).toBe(0);
    });

    it('converts 1 second to 1 million microseconds', () => {
      expect(secondsToUs(1)).toBe(1_000_000);
    });

    it('converts fractional seconds correctly', () => {
      expect(secondsToUs(0.5)).toBe(500_000);
      expect(secondsToUs(1.5)).toBe(1_500_000);
    });

    it('handles large values', () => {
      expect(secondsToUs(60)).toBe(60_000_000);
      expect(secondsToUs(3600)).toBe(3_600_000_000);
    });

    it('is inverse of usToSeconds', () => {
      const testValues = [0, 1, 0.5, 60, 3600, 0.001];
      for (const seconds of testValues) {
        expect(usToSeconds(secondsToUs(seconds))).toBeCloseTo(seconds);
      }
    });
  });

  describe('formatTime', () => {
    it('formats 0 seconds correctly', () => {
      expect(formatTime(0)).toBe('00:00.00');
    });

    it('formats seconds with decimals', () => {
      expect(formatTime(5.25)).toBe('00:05.25');
    });

    it('formats full minutes', () => {
      expect(formatTime(60)).toBe('01:00.00');
    });

    it('formats minutes and seconds', () => {
      expect(formatTime(90.5)).toBe('01:30.50');
    });

    it('pads single digit minutes', () => {
      expect(formatTime(65)).toBe('01:05.00');
    });

    it('handles large values', () => {
      expect(formatTime(3661.99)).toBe('61:01.99');
    });
  });

  describe('formatTimeCompact', () => {
    it('formats 0 microseconds correctly', () => {
      expect(formatTimeCompact(0)).toBe('0:00');
    });

    it('formats seconds only', () => {
      expect(formatTimeCompact(5_000_000)).toBe('0:05');
    });

    it('formats minutes and seconds', () => {
      expect(formatTimeCompact(65_000_000)).toBe('1:05');
    });

    it('pads seconds to 2 digits', () => {
      expect(formatTimeCompact(61_000_000)).toBe('1:01');
    });

    it('handles large values', () => {
      expect(formatTimeCompact(3600_000_000)).toBe('60:00');
    });

    it('truncates fractional seconds', () => {
      expect(formatTimeCompact(5_500_000)).toBe('0:05');
    });
  });
});
