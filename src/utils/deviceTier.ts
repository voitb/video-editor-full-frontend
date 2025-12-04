/**
 * Device Tier Detection
 * Detects device capabilities and provides optimized configuration for each tier.
 */

export type DeviceTier = 'low' | 'medium' | 'high';

interface NavigatorExtended extends Navigator {
  deviceMemory?: number;
}

/**
 * Detects the device tier based on hardware capabilities.
 * Uses navigator.hardwareConcurrency and navigator.deviceMemory when available.
 */
export function detectDeviceTier(): DeviceTier {
  const nav = navigator as NavigatorExtended;
  const cores = nav.hardwareConcurrency || 2;
  const memory = nav.deviceMemory || 2;

  // Low-end: 2 cores or less, or 2GB RAM or less
  if (cores <= 2 || memory <= 2) {
    return 'low';
  }

  // Medium: 4 cores or less, or 4GB RAM or less
  if (cores <= 4 || memory <= 4) {
    return 'medium';
  }

  // High-end: more than 4 cores and more than 4GB RAM
  return 'high';
}

/**
 * Configuration options per device tier.
 * These values are tuned for optimal performance on each tier.
 */
export interface TierConfig {
  /** Maximum frames to keep in queue per source */
  maxFrameQueue: number;
  /** Maximum pending video decodes before backpressure */
  maxPendingDecodes: number;
  /** Target playback FPS */
  targetFps: number;
  /** Frame interval in ms (1000 / targetFps) */
  frameIntervalMs: number;
  /** Enable layer culling optimization */
  enableLayerCulling: boolean;
  /** Frame drop threshold in ms - drop frames if falling behind by this amount */
  frameDropThresholdMs: number;
  /** Look-behind frames to keep for scrubbing */
  lookBehindFrames: number;
  /** Look-ahead frames to buffer */
  lookAheadFrames: number;
  /** Reduce playable sample count for faster start */
  playableSampleCount: number;
}

export const TIER_CONFIGS: Record<DeviceTier, TierConfig> = {
  low: {
    maxFrameQueue: 3,
    maxPendingDecodes: 4,
    targetFps: 24,
    frameIntervalMs: 1000 / 24, // ~41.67ms
    enableLayerCulling: true,
    frameDropThresholdMs: 50,
    lookBehindFrames: 1,
    lookAheadFrames: 2,
    playableSampleCount: 15,
  },
  medium: {
    maxFrameQueue: 6,
    maxPendingDecodes: 8,
    targetFps: 30,
    frameIntervalMs: 1000 / 30, // ~33.33ms
    enableLayerCulling: true,
    frameDropThresholdMs: 75,
    lookBehindFrames: 2,
    lookAheadFrames: 4,
    playableSampleCount: 25,
  },
  high: {
    maxFrameQueue: 8,
    maxPendingDecodes: 16,
    targetFps: 60,
    frameIntervalMs: 1000 / 60, // ~16.67ms
    enableLayerCulling: false,
    frameDropThresholdMs: 100,
    lookBehindFrames: 3,
    lookAheadFrames: 6,
    playableSampleCount: 45,
  },
};

// Cached tier detection result
let cachedTier: DeviceTier | null = null;
let cachedConfig: TierConfig | null = null;

/**
 * Get the current device tier (cached after first call).
 */
export function getDeviceTier(): DeviceTier {
  if (cachedTier === null) {
    cachedTier = detectDeviceTier();
  }
  return cachedTier;
}

/**
 * Get the configuration for the current device tier (cached).
 */
export function getTierConfig(): TierConfig {
  if (cachedConfig === null) {
    cachedConfig = TIER_CONFIGS[getDeviceTier()];
  }
  return cachedConfig;
}

/**
 * Get configuration for a specific tier.
 */
export function getConfigForTier(tier: DeviceTier): TierConfig {
  return TIER_CONFIGS[tier];
}

/**
 * Force a specific tier (useful for testing or user override).
 */
export function setDeviceTier(tier: DeviceTier): void {
  cachedTier = tier;
  cachedConfig = TIER_CONFIGS[tier];
}

/**
 * Reset cached tier detection (for testing).
 */
export function resetDeviceTierCache(): void {
  cachedTier = null;
  cachedConfig = null;
}

/**
 * Check if running on a low-end device.
 */
export function isLowEndDevice(): boolean {
  return getDeviceTier() === 'low';
}

/**
 * Get device info for debugging/profiling.
 */
export function getDeviceInfo(): {
  tier: DeviceTier;
  cores: number;
  memory: number | undefined;
  config: TierConfig;
} {
  const nav = navigator as NavigatorExtended;
  return {
    tier: getDeviceTier(),
    cores: nav.hardwareConcurrency || 2,
    memory: nav.deviceMemory,
    config: getTierConfig(),
  };
}
