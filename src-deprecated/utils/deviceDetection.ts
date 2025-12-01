// ============================================================================
// DEVICE CAPABILITY DETECTION
// ============================================================================
// Adaptive device detection for sprite generation optimization

export type DeviceTier = 'low' | 'medium' | 'high';

export interface DeviceCapabilities {
  tier: DeviceTier;
  memory: number; // GB
  cores: number;
  isMobile: boolean;
  cacheBudgetMB: number;
  spriteResolution: { width: number; height: number };
  blobFormat: 'webp' | 'png';
}

// Type extension for Navigator with deviceMemory (Device Memory API)
interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

// Cached capabilities (computed once per session)
let cachedCapabilities: DeviceCapabilities | null = null;

/**
 * Detect device tier using multiple heuristics.
 * Uses Device Memory API, hardware concurrency, and UA detection.
 */
export function getDeviceTier(): DeviceTier {
  const nav = navigator as NavigatorWithDeviceMemory;
  const memory = nav.deviceMemory ?? estimateMemoryFromUA();
  const cores = navigator.hardwareConcurrency ?? 4;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Low-end: <=2GB RAM OR mobile with <=3GB
  if (memory <= 2 || (isMobile && memory <= 3)) {
    return 'low';
  }

  // Medium: <=4GB RAM OR <=4 cores
  if (memory <= 4 || cores <= 4) {
    return 'medium';
  }

  // High-end: >4GB RAM AND >4 cores
  return 'high';
}

/**
 * Get device capabilities for sprite generation.
 * Results are cached for the session.
 */
export function getDeviceCapabilities(): DeviceCapabilities {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  const tier = getDeviceTier();
  const nav = navigator as NavigatorWithDeviceMemory;
  const memory = nav.deviceMemory ?? estimateMemoryFromUA();
  const cores = navigator.hardwareConcurrency ?? 4;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Configuration per tier
  // Using moderate resolution reduction (128x72 for low-end only)
  const configs: Record<DeviceTier, Pick<DeviceCapabilities, 'cacheBudgetMB' | 'spriteResolution' | 'blobFormat'>> = {
    low: {
      cacheBudgetMB: 10,
      spriteResolution: { width: 128, height: 72 },
      blobFormat: 'webp',
    },
    medium: {
      cacheBudgetMB: 25,
      spriteResolution: { width: 160, height: 90 },
      blobFormat: 'webp',
    },
    high: {
      cacheBudgetMB: 50,
      spriteResolution: { width: 160, height: 90 },
      blobFormat: 'png', // High-end can afford lossless
    },
  };

  cachedCapabilities = {
    tier,
    memory,
    cores,
    isMobile,
    ...configs[tier],
  };

  return cachedCapabilities;
}

/**
 * Get optimal cache budget in bytes based on device capabilities.
 */
export function getOptimalCacheBudget(): number {
  const { cacheBudgetMB } = getDeviceCapabilities();
  return cacheBudgetMB * 1024 * 1024;
}

/**
 * Get sprite resolution for current device.
 */
export function getSpriteResolution(): { width: number; height: number } {
  const { spriteResolution } = getDeviceCapabilities();
  return spriteResolution;
}

/**
 * Get preferred blob format for sprites.
 */
export function getSpriteBlobFormat(): 'webp' | 'png' {
  const { blobFormat } = getDeviceCapabilities();
  return blobFormat;
}

/**
 * Estimate memory when Device Memory API unavailable.
 * Conservative estimates based on device type.
 */
function estimateMemoryFromUA(): number {
  const ua = navigator.userAgent;

  // iPhone detection with generation estimation
  if (/iPhone/.test(ua)) {
    // iPhone 13+ typically has 4GB+
    return /iPhone1[3-9]|iPhone[2-9][0-9]/.test(ua) ? 4 : 2;
  }

  // iPad detection
  if (/iPad/.test(ua)) {
    return /iPad Pro/.test(ua) ? 6 : 4;
  }

  // Android - conservative default
  if (/Android/.test(ua)) {
    return 3;
  }

  // Desktop default
  return 4;
}

/**
 * Check if WebP is supported by the browser.
 */
export function isWebPSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

/**
 * Reset cached capabilities (useful for testing).
 */
export function resetDeviceCapabilitiesCache(): void {
  cachedCapabilities = null;
}
