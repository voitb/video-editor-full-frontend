import { describe, it, expect, beforeEach } from 'vitest';
import { getOptimalBudget } from './spriteCache';
import { resetDeviceCapabilitiesCache } from './deviceDetection';

// Mock navigator.deviceMemory for testing
const mockNavigator = (deviceMemory: number | undefined, hardwareConcurrency = 8) => {
  Object.defineProperty(global, 'navigator', {
    value: {
      deviceMemory,
      hardwareConcurrency,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    },
    writable: true,
    configurable: true,
  });
};

describe('spriteCache utilities', () => {
  describe('getOptimalBudget', () => {
    beforeEach(() => {
      // Reset cache AND navigator mock before each test
      resetDeviceCapabilitiesCache();
      mockNavigator(undefined);
    });

    it('returns 10MB for low-end devices (<=2GB RAM)', () => {
      resetDeviceCapabilitiesCache();
      mockNavigator(2);
      expect(getOptimalBudget()).toBe(10 * 1024 * 1024);

      resetDeviceCapabilitiesCache();
      mockNavigator(1);
      expect(getOptimalBudget()).toBe(10 * 1024 * 1024);
    });

    it('returns 25MB for mid-range devices (<=4GB RAM)', () => {
      resetDeviceCapabilitiesCache();
      mockNavigator(4);
      expect(getOptimalBudget()).toBe(25 * 1024 * 1024);

      resetDeviceCapabilitiesCache();
      mockNavigator(3);
      expect(getOptimalBudget()).toBe(25 * 1024 * 1024);
    });

    it('returns 50MB for high-end devices (>4GB RAM)', () => {
      resetDeviceCapabilitiesCache();
      mockNavigator(8);
      expect(getOptimalBudget()).toBe(50 * 1024 * 1024);

      resetDeviceCapabilitiesCache();
      mockNavigator(16);
      expect(getOptimalBudget()).toBe(50 * 1024 * 1024);
    });

    it('defaults to 25MB when deviceMemory is undefined', () => {
      resetDeviceCapabilitiesCache();
      mockNavigator(undefined);
      // When deviceMemory is undefined, the estimateMemoryFromUA falls back
      // which typically returns 4GB, resulting in 25MB budget
      expect(getOptimalBudget()).toBe(25 * 1024 * 1024);
    });
  });
});

// Note: SpriteCache class tests require browser APIs (ImageBitmap, OffscreenCanvas)
// and would need to be run in a browser environment (e.g., with Playwright)
// or with comprehensive mocking of canvas APIs.
