// ============================================================================
// HLS LOADER HOOK
// ============================================================================
// React hook that orchestrates HLS loading: manifest parsing, segment fetching,
// and transmuxing to MP4.

import { useState, useCallback, useRef } from 'react';
import { HLS } from '../constants';
import {
  parseManifest,
  selectQuality,
  fetchSegmentsInBatches,
  hasEncryption,
} from '../utils/hlsParser';
import type { HlsLoadingProgress, HlsTransmuxResponse } from '../worker/hlsTypes';
import { logger } from '../utils/logger';

// Import worker using Vite's worker syntax
import HlsTransmuxWorker from '../worker/HlsTransmuxWorker?worker';

interface HlsLoadResult {
  buffer: ArrayBuffer;
  duration: number;
}

interface UseHlsLoaderReturn {
  loadHlsUrl: (url: string) => Promise<HlsLoadResult>;
  isLoading: boolean;
  progress: HlsLoadingProgress;
  error: string | null;
  abort: () => void;
}

export function useHlsLoader(): UseHlsLoaderReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<HlsLoadingProgress>({
    stage: 'fetching_manifest',
    percent: 0,
    message: '',
  });
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const transmuxWorkerRef = useRef<Worker | null>(null);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    transmuxWorkerRef.current?.postMessage({ type: 'ABORT' });
  }, []);

  const loadHlsUrl = useCallback(async (url: string): Promise<HlsLoadResult> => {
    // Reset state
    setIsLoading(true);
    setError(null);
    setProgress({ stage: 'fetching_manifest', percent: 0, message: 'Fetching manifest...' });

    // Create abort controller for fetch operations
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      // Validate URL - accept any HTTP(S) URL
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('Please enter a valid HTTP(S) URL');
        }
      } catch {
        throw new Error('Please enter a valid URL');
      }

      // Step 1: Fetch master manifest
      logger.log('Fetching HLS manifest:', url);
      const masterResponse = await fetch(url, {
        signal,
        mode: 'cors',
        credentials: 'omit',
      });
      if (!masterResponse.ok) {
        throw new Error(`Failed to fetch manifest: HTTP ${masterResponse.status}`);
      }
      const masterText = await masterResponse.text();

      // Check for encryption
      if (hasEncryption(masterText)) {
        throw new Error('Encrypted HLS streams are not supported');
      }

      // Parse master manifest
      setProgress({ stage: 'parsing_manifest', percent: 5, message: 'Parsing manifest...' });
      const master = parseManifest(masterText, url);
      logger.log('Parsed manifest:', { isMaster: master.isMaster, levels: master.levels.length });

      let mediaManifest = master;

      // If master playlist, select quality and fetch media playlist
      if (master.isMaster && master.levels.length > 0) {
        const selectedLevel = selectQuality(master.levels, HLS.MAX_RESOLUTION);
        if (!selectedLevel) {
          throw new Error('No suitable quality level found');
        }

        logger.log('Selected quality:', selectedLevel);
        setProgress({ stage: 'fetching_manifest', percent: 10, message: `Loading ${selectedLevel.height}p quality...` });

        const mediaResponse = await fetch(selectedLevel.uri, {
          signal,
          mode: 'cors',
          credentials: 'omit',
        });
        if (!mediaResponse.ok) {
          throw new Error(`Failed to fetch media playlist: HTTP ${mediaResponse.status}`);
        }
        const mediaText = await mediaResponse.text();

        // Check for encryption in media playlist
        if (hasEncryption(mediaText)) {
          throw new Error('Encrypted HLS streams are not supported');
        }

        mediaManifest = parseManifest(mediaText, selectedLevel.uri);
      }

      // No duration limit - allow any length

      if (mediaManifest.segments.length === 0) {
        throw new Error('No segments found in playlist');
      }

      logger.log('Media manifest:', {
        segments: mediaManifest.segments.length,
        duration: mediaManifest.totalDuration,
      });

      // Step 2: Fetch all segments
      setProgress({
        stage: 'fetching_segments',
        percent: 15,
        message: `Downloading ${mediaManifest.segments.length} segments...`,
      });

      const segmentBuffers = await fetchSegmentsInBatches(
        mediaManifest.segments,
        HLS.SEGMENT_BATCH_SIZE,
        HLS.FETCH_TIMEOUT_MS,
        (fetched, total) => {
          const percent = 15 + (fetched / total) * 55;
          setProgress({
            stage: 'fetching_segments',
            percent,
            message: `Downloaded ${fetched}/${total} segments`,
          });
        }
      );

      // Check for abort
      if (signal.aborted) {
        throw new Error('Loading aborted');
      }

      // Step 3: Transmux to MP4
      setProgress({
        stage: 'transmuxing',
        percent: 70,
        message: 'Converting to MP4...',
      });

      const mp4Buffer = await transmuxToMp4(segmentBuffers);

      setProgress({ stage: 'complete', percent: 100, message: 'Complete' });
      setIsLoading(false);

      // Return both buffer and the correct duration from HLS manifest
      return { buffer: mp4Buffer, duration: mediaManifest.totalDuration };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      // Don't set error for aborted requests
      if (message !== 'Loading aborted') {
        setError(message);
        logger.error('HLS loading error:', err);
      }

      setIsLoading(false);
      throw err;
    }
  }, []);

  return { loadHlsUrl, isLoading, progress, error, abort };
}

/**
 * Transmux TS segments to MP4 using the HlsTransmuxWorker
 */
function transmuxToMp4(segments: ArrayBuffer[]): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const worker = new HlsTransmuxWorker();

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('Transmux timeout'));
    }, HLS.TRANSMUX_TIMEOUT_MS);

    worker.onmessage = (e: MessageEvent<HlsTransmuxResponse>) => {
      const { type } = e.data;

      switch (type) {
        case 'PROGRESS': {
          const { processed, total } = e.data.payload;
          logger.log(`Transmux progress: ${processed}/${total}`);
          break;
        }

        case 'COMPLETE': {
          clearTimeout(timeout);
          worker.terminate();
          const { mp4Buffer } = e.data.payload;
          logger.log('Transmux complete:', mp4Buffer.byteLength, 'bytes');
          resolve(mp4Buffer);
          break;
        }

        case 'ERROR': {
          clearTimeout(timeout);
          worker.terminate();
          reject(new Error(e.data.payload.message));
          break;
        }
      }
    };

    worker.onerror = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(`Worker error: ${e.message}`));
    };

    // Transfer buffers to worker
    worker.postMessage(
      { type: 'TRANSMUX', payload: { segments } },
      segments
    );
  });
}
