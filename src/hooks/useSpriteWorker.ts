import { useEffect, useRef, useState, useCallback } from 'react';
import type { SpriteInitData } from '../types/editor';
import type { SpriteWorkerCommand, SpriteWorkerResponse } from '../worker/spriteTypes';
import { getDeviceTier } from '../worker/spriteTypes';
import { SpriteCache, getOptimalBudget } from '../utils/spriteCache';
import { TIME } from '../constants';
import { logger } from '../utils/logger';

// Import worker using Vite's worker syntax
import SpriteWorkerModule from '../worker/SpriteWorker?worker';

const { MICROSECONDS_PER_SECOND } = TIME;

/**
 * Calculate adaptive sprite interval based on video duration AND device tier.
 * Low-end devices get 2x interval (fewer sprites) for better reliability.
 */
function calculateInterval(durationSeconds: number): number {
  // Base intervals
  let baseInterval: number;
  if (durationSeconds < 120) {
    baseInterval = MICROSECONDS_PER_SECOND; // 1 second
  } else if (durationSeconds < 600) {
    baseInterval = 2 * MICROSECONDS_PER_SECOND; // 2 seconds
  } else {
    baseInterval = 5 * MICROSECONDS_PER_SECOND; // 5 seconds
  }

  // Low-end devices get 2x interval (fewer sprites for reliability)
  const tier = getDeviceTier();
  if (tier === 'low') {
    return baseInterval * 2;
  }

  return baseInterval;
}

export interface SpriteData {
  timeUs: number;
  x: number;
  y: number;
  width: number;
  height: number;
  blobUrl: string;
}

interface UseSpriteWorkerReturn {
  sprites: SpriteData[];
  isGenerating: boolean;
  progress: { generated: number; total: number } | null;
  /** Last error message (null if no error) */
  error: string | null;
  /** True if generation appears stuck (no progress for 15s) */
  isStuck: boolean;
  generateSprites: (intervalUs?: number) => void;
  clear: () => void;
  /** Notify worker of viewport change for progressive loading */
  setVisibleRange: (startTimeUs: number, endTimeUs: number) => void;
}

/**
 * Hook for managing sprite generation and caching
 */
export function useSpriteWorker(
  sampleData: SpriteInitData | null,
  duration: number
): UseSpriteWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const cacheRef = useRef<SpriteCache | null>(null);
  const lastProgressTimeRef = useRef<number>(Date.now());
  const [sprites, setSprites] = useState<SpriteData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ generated: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStuck, setIsStuck] = useState(false);

  // Initialize cache on mount
  useEffect(() => {
    cacheRef.current = new SpriteCache(getOptimalBudget());
    return () => {
      cacheRef.current?.clear();
      cacheRef.current = null;
    };
  }, []);

  // Watchdog timer to detect stuck generation (no progress for 15 seconds)
  useEffect(() => {
    if (!isGenerating) {
      setIsStuck(false);
      return;
    }

    const watchdogInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceProgress = now - lastProgressTimeRef.current;
      // 15 seconds with no progress = stuck
      if (timeSinceProgress > 15000) {
        logger.warn('Sprite generation appears stuck (no progress for 15s)');
        setIsStuck(true);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(watchdogInterval);
  }, [isGenerating]);

  // Initialize worker
  useEffect(() => {
    const worker = new SpriteWorkerModule();
    workerRef.current = worker;

    worker.onmessage = async (e: MessageEvent<SpriteWorkerResponse>) => {
      const { type } = e.data;

      switch (type) {
        case 'SPRITE_SHEET_READY': {
          const { sheetId, bitmap, startTimeUs, endTimeUs, sprites: sheetSprites } = e.data.payload;

          // Add to cache
          if (cacheRef.current) {
            await cacheRef.current.set(sheetId, bitmap, startTimeUs, endTimeUs, sheetSprites);

            // Update sprites state with all cached sprites
            const allSprites = cacheRef.current.getAllSprites();
            setSprites(allSprites);
          }
          break;
        }

        case 'PROGRESS': {
          const { generated, total } = e.data.payload;
          setProgress({ generated, total });
          // Update watchdog timestamp on progress
          lastProgressTimeRef.current = Date.now();
          setIsStuck(false);
          break;
        }

        case 'GENERATION_COMPLETE': {
          setIsGenerating(false);
          setProgress(null);
          setError(null);
          setIsStuck(false);
          break;
        }

        case 'ERROR': {
          const { message, recoverable } = e.data.payload;
          logger.error('useSpriteWorker Error:', message, { recoverable });

          if (recoverable) {
            // For recoverable errors, show briefly but let generation continue
            logger.warn('Recoverable sprite error, generation continuing:', message);
            setError(message);
            // Clear error message after 3 seconds
            setTimeout(() => setError(null), 3000);
          } else {
            // Fatal error - stop generation
            setIsGenerating(false);
            setProgress(null);
            setError(message);
          }
          break;
        }
      }
    };

    return () => {
      worker.postMessage({ type: 'CLEAR' } as SpriteWorkerCommand);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Initialize worker with sample data when available
  useEffect(() => {
    if (!sampleData || !workerRef.current) return;

    workerRef.current.postMessage({
      type: 'INIT',
      payload: sampleData,
    } as SpriteWorkerCommand);
  }, [sampleData]);

  // Generate sprites (eager loading)
  const generateSprites = useCallback(
    (intervalUs?: number) => {
      if (!workerRef.current || !sampleData) return;

      // Clear existing sprites and reset state
      cacheRef.current?.clear();
      setSprites([]);
      setError(null);
      setIsStuck(false);
      lastProgressTimeRef.current = Date.now();

      const interval = intervalUs ?? calculateInterval(duration);

      setIsGenerating(true);
      setProgress({ generated: 0, total: Math.ceil((duration * MICROSECONDS_PER_SECOND) / interval) });

      workerRef.current.postMessage({
        type: 'GENERATE_ALL_SPRITES',
        payload: { intervalUs: interval },
      } as SpriteWorkerCommand);
    },
    [sampleData, duration]
  );

  // Clear all sprites
  const clear = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'CLEAR' } as SpriteWorkerCommand);
    }
    cacheRef.current?.clear();
    setSprites([]);
    setIsGenerating(false);
    setProgress(null);
  }, []);

  // Notify worker of viewport change for progressive loading
  const setVisibleRange = useCallback(
    (startTimeUs: number, endTimeUs: number) => {
      if (!workerRef.current) return;

      workerRef.current.postMessage({
        type: 'SET_VISIBLE_RANGE',
        payload: { startTimeUs, endTimeUs },
      } as SpriteWorkerCommand);
    },
    []
  );

  // Auto-generate sprites when sample data becomes available
  // Uses GENERATE_ALL_SPRITES which streams results as sprite sheets complete
  useEffect(() => {
    if (sampleData && duration > 0 && sprites.length === 0 && !isGenerating) {
      // Small delay to ensure worker is initialized
      const timer = setTimeout(() => {
        if (!workerRef.current) return;

        const interval = calculateInterval(duration);
        const durationUs = duration * MICROSECONDS_PER_SECOND;
        const totalSprites = Math.ceil(durationUs / interval);

        // Reset watchdog state
        lastProgressTimeRef.current = Date.now();
        setError(null);
        setIsStuck(false);

        setIsGenerating(true);
        setProgress({ generated: 0, total: totalSprites });

        // Generate all sprites - worker streams results as sheets complete
        // This provides fast perceived load since first sheet (covering ~1.7s at 1fps)
        // is sent as soon as it's ready
        workerRef.current.postMessage({
          type: 'GENERATE_ALL_SPRITES',
          payload: { intervalUs: interval },
        } as SpriteWorkerCommand);
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [sampleData, duration, sprites.length, isGenerating]);

  return {
    sprites,
    isGenerating,
    progress,
    error,
    isStuck,
    generateSprites,
    clear,
    setVisibleRange,
  };
}
