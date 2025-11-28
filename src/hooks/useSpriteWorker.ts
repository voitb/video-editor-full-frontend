import { useEffect, useRef, useState, useCallback } from 'react';
import type { SpriteInitData } from '../types/editor';
import type { SpriteWorkerCommand, SpriteWorkerResponse } from '../worker/spriteTypes';
import { SpriteCache, getOptimalBudget } from '../utils/spriteCache';
import { TIME } from '../constants';
import { logger } from '../utils/logger';

// Import worker using Vite's worker syntax
import SpriteWorkerModule from '../worker/SpriteWorker?worker';

const { MICROSECONDS_PER_SECOND } = TIME;

/**
 * Calculate adaptive sprite interval based on video duration.
 * Pure function - no need to be inside the hook.
 */
function calculateInterval(durationSeconds: number): number {
  // For short videos (<2 min): 1 sprite per second
  // For medium videos (2-10 min): 1 sprite per 2 seconds
  // For longer videos: 1 sprite per 5 seconds
  if (durationSeconds < 120) {
    return MICROSECONDS_PER_SECOND; // 1 second in microseconds
  }
  if (durationSeconds < 600) {
    return 2 * MICROSECONDS_PER_SECOND; // 2 seconds
  }
  return 5 * MICROSECONDS_PER_SECOND; // 5 seconds
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
  const [sprites, setSprites] = useState<SpriteData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ generated: number; total: number } | null>(null);

  // Initialize cache on mount
  useEffect(() => {
    cacheRef.current = new SpriteCache(getOptimalBudget());
    return () => {
      cacheRef.current?.clear();
      cacheRef.current = null;
    };
  }, []);

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
          break;
        }

        case 'GENERATION_COMPLETE': {
          setIsGenerating(false);
          setProgress(null);
          break;
        }

        case 'ERROR': {
          logger.error('useSpriteWorker Error:', e.data.payload.message);
          setIsGenerating(false);
          setProgress(null);
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

      // Clear existing sprites
      cacheRef.current?.clear();
      setSprites([]);

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
    generateSprites,
    clear,
    setVisibleRange,
  };
}
