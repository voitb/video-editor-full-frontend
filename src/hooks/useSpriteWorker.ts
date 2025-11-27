import { useEffect, useRef, useState, useCallback } from 'react';
import type { SpriteInitData } from '../types/editor';
import type { SpriteWorkerCommand, SpriteWorkerResponse } from '../worker/spriteTypes';
import { SpriteCache, getOptimalBudget } from '../utils/spriteCache';

// Import worker using Vite's worker syntax
import SpriteWorkerModule from '../worker/SpriteWorker?worker';

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
          console.error('[useSpriteWorker] Error:', e.data.payload.message);
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

  // Calculate adaptive interval based on duration
  const calculateInterval = useCallback((durationSeconds: number): number => {
    // For short videos (<2 min): 1 sprite per second
    // For medium videos (2-10 min): 1 sprite per 2 seconds
    // For longer videos: 1 sprite per 5 seconds
    if (durationSeconds < 120) {
      return 1_000_000; // 1 second in microseconds
    } else if (durationSeconds < 600) {
      return 2_000_000; // 2 seconds
    } else {
      return 5_000_000; // 5 seconds
    }
  }, []);

  // Generate sprites (eager loading)
  const generateSprites = useCallback(
    (intervalUs?: number) => {
      if (!workerRef.current || !sampleData) return;

      // Clear existing sprites
      cacheRef.current?.clear();
      setSprites([]);

      const interval = intervalUs ?? calculateInterval(duration);

      setIsGenerating(true);
      setProgress({ generated: 0, total: Math.ceil((duration * 1_000_000) / interval) });

      workerRef.current.postMessage({
        type: 'GENERATE_ALL_SPRITES',
        payload: { intervalUs: interval },
      } as SpriteWorkerCommand);
    },
    [sampleData, duration, calculateInterval]
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

  // Auto-generate sprites when sample data becomes available (eager loading)
  useEffect(() => {
    if (sampleData && duration > 0 && sprites.length === 0 && !isGenerating) {
      // Small delay to ensure worker is initialized
      const timer = setTimeout(() => {
        generateSprites();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [sampleData, duration, sprites.length, isGenerating, generateSprites]);

  return {
    sprites,
    isGenerating,
    progress,
    generateSprites,
    clear,
  };
}
