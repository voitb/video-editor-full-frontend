import type { SpriteMetadata } from '../worker/spriteTypes';

// ============================================================================
// SPRITE CACHE
// ============================================================================
// LRU cache for sprite sheets with memory budget management

interface CacheEntry {
  bitmap: ImageBitmap;
  blobUrl: string;
  startTimeUs: number;
  endTimeUs: number;
  sprites: SpriteMetadata[];
  sizeBytes: number;
  lastAccess: number;
}

export class SpriteCache {
  private cache = new Map<string, CacheEntry>();
  private currentBytes = 0;
  private budgetBytes: number;

  constructor(budgetBytes: number = 50 * 1024 * 1024) {
    // Default 50MB budget
    this.budgetBytes = budgetBytes;
  }

  /**
   * Get a sprite sheet from the cache
   */
  get(sheetId: string): CacheEntry | null {
    const entry = this.cache.get(sheetId);
    if (!entry) return null;
    entry.lastAccess = performance.now();
    return entry;
  }

  /**
   * Add a sprite sheet to the cache
   */
  async set(
    sheetId: string,
    bitmap: ImageBitmap,
    startTimeUs: number,
    endTimeUs: number,
    sprites: SpriteMetadata[]
  ): Promise<void> {
    // Estimate memory size (RGBA = 4 bytes per pixel)
    const sizeBytes = bitmap.width * bitmap.height * 4;

    // Evict until we have space (for short videos, this should rarely happen)
    while (this.currentBytes + sizeBytes > this.budgetBytes && this.cache.size > 0) {
      this.evictLRU();
    }

    // Convert bitmap to blob URL for CSS background usage
    const blobUrl = await this.bitmapToBlobUrl(bitmap);

    this.cache.set(sheetId, {
      bitmap,
      blobUrl,
      startTimeUs,
      endTimeUs,
      sprites,
      sizeBytes,
      lastAccess: performance.now(),
    });

    this.currentBytes += sizeBytes;
  }

  /**
   * Check if a sheet exists in cache
   */
  has(sheetId: string): boolean {
    return this.cache.has(sheetId);
  }

  /**
   * Get all cached sprite sheets
   */
  getAll(): Map<string, CacheEntry> {
    return this.cache;
  }

  /**
   * Get all sprites sorted by time
   */
  getAllSprites(): Array<SpriteMetadata & { blobUrl: string }> {
    const allSprites: Array<SpriteMetadata & { blobUrl: string }> = [];

    for (const entry of this.cache.values()) {
      for (const sprite of entry.sprites) {
        allSprites.push({
          ...sprite,
          blobUrl: entry.blobUrl,
        });
      }
    }

    // Sort by time
    allSprites.sort((a, b) => a.timeUs - b.timeUs);

    return allSprites;
  }

  /**
   * Find sprite at a given time
   */
  findSpriteAtTime(timeUs: number): (SpriteMetadata & { blobUrl: string }) | null {
    for (const entry of this.cache.values()) {
      if (timeUs >= entry.startTimeUs && timeUs <= entry.endTimeUs) {
        // Find closest sprite in this sheet
        let closest: SpriteMetadata | null = null;
        let closestDiff = Infinity;

        for (const sprite of entry.sprites) {
          const diff = Math.abs(sprite.timeUs - timeUs);
          if (diff < closestDiff) {
            closestDiff = diff;
            closest = sprite;
          }
        }

        if (closest) {
          return { ...closest, blobUrl: entry.blobUrl };
        }
      }
    }
    return null;
  }

  /**
   * Clear all cached sprites and release memory
   */
  clear(): void {
    for (const entry of this.cache.values()) {
      entry.bitmap.close();
      URL.revokeObjectURL(entry.blobUrl);
    }
    this.cache.clear();
    this.currentBytes = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): { count: number; bytes: number; budget: number } {
    return {
      count: this.cache.size,
      bytes: this.currentBytes,
      budget: this.budgetBytes,
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey)!;
      entry.bitmap.close();
      URL.revokeObjectURL(entry.blobUrl);
      this.currentBytes -= entry.sizeBytes;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Convert ImageBitmap to blob URL for CSS usage
   */
  private async bitmapToBlobUrl(bitmap: ImageBitmap): Promise<string> {
    // Create an OffscreenCanvas to draw the bitmap
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get 2D rendering context from OffscreenCanvas');
    }

    ctx.drawImage(bitmap, 0, 0);

    // Convert to blob with error handling
    try {
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return URL.createObjectURL(blob);
    } catch (error) {
      throw new Error(`Failed to convert bitmap to blob: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// ============================================================================
// DEVICE-ADAPTIVE BUDGET
// ============================================================================

// Type extension for Navigator with deviceMemory (Device Memory API)
interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

/**
 * Calculate optimal memory budget based on device capabilities
 */
export function getOptimalBudget(): number {
  // Use deviceMemory API if available (Chrome/Edge only)
  const nav = navigator as NavigatorWithDeviceMemory;
  const memory = nav.deviceMemory ?? 4; // Default to 4GB if not available

  if (memory <= 2) {
    return 10 * 1024 * 1024; // 10MB for low-end devices
  }
  if (memory <= 4) {
    return 25 * 1024 * 1024; // 25MB for mid-range
  }
  return 50 * 1024 * 1024; // 50MB for high-end
}
