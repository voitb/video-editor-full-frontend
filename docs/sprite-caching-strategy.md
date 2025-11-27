# Sprite Caching Strategy for Long Videos

> This document outlines the LRU caching strategy with viewport-based loading for videos longer than 5 minutes.

## Overview

For videos longer than 5 minutes, keeping all sprites in memory is not feasible. This strategy ensures smooth timeline scrubbing while maintaining a reasonable memory footprint.

## Memory Budget by Video Duration

| Duration | Strategy | Memory Budget | Max Sheets |
|----------|----------|---------------|------------|
| <5 min | All in memory | Unlimited | ~6 |
| 5-30 min | LRU cache | 25MB | ~8 |
| 30-60 min | LRU + lazy | 25MB | ~8 |
| >60 min | Aggressive LRU | 15MB | ~5 |

## LRU Cache Implementation

The `SpriteCache` class in `src/utils/spriteCache.ts` implements an LRU (Least Recently Used) eviction policy:

```typescript
class SpriteCache {
  private cache = new Map<string, CacheEntry>();
  private currentBytes = 0;
  private budgetBytes: number;

  constructor(budgetBytes: number) {
    this.budgetBytes = budgetBytes;
  }

  get(sheetId: string): CacheEntry | null {
    const entry = this.cache.get(sheetId);
    if (!entry) return null;
    entry.lastAccess = performance.now();
    return entry;
  }

  set(sheetId: string, bitmap: ImageBitmap, sizeBytes: number): void {
    // Evict until we have space
    while (this.currentBytes + sizeBytes > this.budgetBytes) {
      this.evictLRU();
    }
    // ... store entry
  }

  private evictLRU(): void {
    // Find and remove least recently accessed entry
    // Call bitmap.close() to release GPU memory
  }
}
```

## Viewport-Based Priority Loading

For long videos, sprites should be loaded based on viewport priority:

```typescript
interface LoadPriority {
  critical: TimeRange[];  // Current viewport - load immediately
  prefetch: TimeRange[];  // +/- 2 viewports - load after critical
  background: TimeRange[]; // Rest of video - load when idle
}

function calculatePriority(
  viewportStart: number,
  viewportEnd: number,
  totalDuration: number
): LoadPriority {
  const viewportWidth = viewportEnd - viewportStart;

  return {
    critical: [{ start: viewportStart, end: viewportEnd }],
    prefetch: [
      { start: Math.max(0, viewportStart - viewportWidth * 2), end: viewportStart },
      { start: viewportEnd, end: Math.min(totalDuration, viewportEnd + viewportWidth * 2) },
    ],
    background: [
      { start: 0, end: Math.max(0, viewportStart - viewportWidth * 2) },
      { start: Math.min(totalDuration, viewportEnd + viewportWidth * 2), end: totalDuration },
    ],
  };
}
```

## Progressive Loading Flow

1. **Video loads** - Generate critical sprites (current viewport only)
2. **Critical complete** - Generate prefetch sprites (+/-2 screens)
3. **User scrolls** - Recalculate priorities, cancel lower-priority work
4. **Cache full** - Evict LRU (oldest accessed)
5. **User seeks far** - Cancel pending, regenerate for new viewport

## Worker Message Queue

For long videos, implement a priority queue in the SpriteWorker:

```typescript
interface SpriteRequest {
  id: string;
  timeRange: TimeRange;
  priority: 'critical' | 'prefetch' | 'background';
  status: 'pending' | 'in_progress' | 'complete';
}

class SpriteRequestQueue {
  private queue: SpriteRequest[] = [];

  add(request: SpriteRequest): void {
    // Insert by priority (critical first, then prefetch, then background)
  }

  cancelLowerPriority(priority: string): void {
    // Cancel pending background work when user starts interacting
  }

  next(): SpriteRequest | null {
    return this.queue.find(r => r.status === 'pending') ?? null;
  }
}
```

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Initial sprite load | <500ms | First visible sprites only |
| Seek to new region | <200ms | Critical sprites for new viewport |
| Memory ceiling | 25MB | Hard limit on cache size |
| Cache hit rate | >90% | During normal scrubbing |

## Device Adaptation

Automatically adjust memory budget based on device capabilities:

```typescript
function getOptimalBudget(): number {
  const memory = (navigator as any).deviceMemory ?? 4;
  const connection = (navigator as any).connection?.effectiveType ?? '4g';

  // Reduce budget on low-end devices
  if (memory <= 2 || connection === '2g') {
    return 10 * 1024 * 1024; // 10MB
  }
  if (memory <= 4 || connection === '3g') {
    return 25 * 1024 * 1024; // 25MB
  }
  return 50 * 1024 * 1024; // 50MB
}
```

## Cleanup on Unmount

All sprites are in-memory only - cleanup when component unmounts:

```typescript
// In useSpriteWorker.ts
useEffect(() => {
  return () => {
    // Cleanup on unmount - release all ImageBitmaps
    spriteCache.clear();
    spriteWorker.terminate();
  };
}, []);

// In SpriteCache
clear(): void {
  for (const entry of this.cache.values()) {
    entry.bitmap.close(); // Release GPU memory
  }
  this.cache.clear();
  this.currentBytes = 0;
}
```

## Future: Backend-Driven Persistence

When backend support is available:

1. Backend generates sprite sheets during video upload/processing
2. Frontend requests pre-generated sprite sheets via API
3. Client-side generation becomes fallback only
4. Significant performance improvement for repeat views

## Migration Path

1. **Phase 1 (Current)**: Short videos only, all sprites in memory, cleanup on unmount
2. **Phase 2**: Add LRU cache for medium videos (5-30 min)
3. **Phase 3**: Add viewport priority loading for long videos (30+ min)
4. **Future**: Backend-driven sprite generation (not in scope for frontend-only implementation)
