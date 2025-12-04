/**
 * Source Loading Callbacks Hook
 * Handles HLS and file source loading operations.
 */

import { useCallback } from 'react';
import type { SourceCallbackDeps } from './types';

export interface SourceCallbacks {
  handleLoadHls: (url: string) => Promise<void>;
  handleLoadFile: (file: File) => Promise<void>;
}

export function useSourceCallbacks(deps: SourceCallbackDeps): SourceCallbacks {
  const { loadHlsSource, loadFileSource, resetViewport, setIsLoading } = deps;

  const handleLoadHls = useCallback(async (url: string) => {
    if (!url) return;
    setIsLoading(true);
    try {
      const source = await loadHlsSource(url);
      resetViewport(source.durationUs);
    } catch (err) {
      console.error('Failed to load HLS source:', err);
    } finally {
      setIsLoading(false);
    }
  }, [loadHlsSource, resetViewport, setIsLoading]);

  const handleLoadFile = useCallback(async (file: File) => {
    if (!file) return;
    setIsLoading(true);
    try {
      const source = await loadFileSource(file);
      resetViewport(source.durationUs);
    } catch (err) {
      console.error('Failed to load file source:', err);
    } finally {
      setIsLoading(false);
    }
  }, [loadFileSource, resetViewport, setIsLoading]);

  return { handleLoadHls, handleLoadFile };
}
