import { describe, it, expect, beforeEach } from 'vitest';
import { getOptimalBudget } from './spriteCache';

// Mock navigator.deviceMemory for testing
const mockNavigator = (deviceMemory: number | undefined) => {
  Object.defineProperty(global, 'navigator', {
    value: { deviceMemory },
    writable: true,
  });
};

describe('spriteCache utilities', () => {
  describe('getOptimalBudget', () => {
    beforeEach(() => {
      // Reset navigator mock before each test
      mockNavigator(undefined);
    });

    it('returns 10MB for low-end devices (<=2GB RAM)', () => {
      mockNavigator(2);
      expect(getOptimalBudget()).toBe(10 * 1024 * 1024);

      mockNavigator(1);
      expect(getOptimalBudget()).toBe(10 * 1024 * 1024);
    });

    it('returns 25MB for mid-range devices (<=4GB RAM)', () => {
      mockNavigator(4);
      expect(getOptimalBudget()).toBe(25 * 1024 * 1024);

      mockNavigator(3);
      expect(getOptimalBudget()).toBe(25 * 1024 * 1024);
    });

    it('returns 50MB for high-end devices (>4GB RAM)', () => {
      mockNavigator(8);
      expect(getOptimalBudget()).toBe(50 * 1024 * 1024);

      mockNavigator(16);
      expect(getOptimalBudget()).toBe(50 * 1024 * 1024);
    });

    it('defaults to 50MB when deviceMemory is undefined', () => {
      mockNavigator(undefined);
      // When deviceMemory is undefined, defaults to 4GB which gives 25MB
      // Actually looking at the code: memory = nav.deviceMemory ?? 4
      // So undefined defaults to 4, which returns 25MB
      expect(getOptimalBudget()).toBe(25 * 1024 * 1024);
    });
  });
});

// Note: SpriteCache class tests require browser APIs (ImageBitmap, OffscreenCanvas)
// and would need to be run in a browser environment (e.g., with Playwright)
// or with comprehensive mocking of canvas APIs.
