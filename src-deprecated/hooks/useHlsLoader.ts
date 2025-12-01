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
  fetchWithTimeout,
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

interface HlsStreamCallbacks {
  onStart?: (duration: number) => void;
  onChunk?: (chunk: ArrayBuffer, isLast: boolean) => void;
  onPlayable?: () => void;  // Called when enough data for playback (~5 segments)
}

interface UseHlsLoaderReturn {
  loadHlsUrl: (url: string, callbacks?: HlsStreamCallbacks) => Promise<HlsLoadResult>;
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
    transmuxWorkerRef.current?.terminate();
    transmuxWorkerRef.current = null;
  }, []);

  const loadHlsUrl = useCallback(async (url: string, callbacks?: HlsStreamCallbacks): Promise<HlsLoadResult> => {
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

      // Notify caller so the video worker can prepare for streaming playback
      callbacks?.onStart?.(mediaManifest.totalDuration);

      // Prepare transmux worker for streaming output
      const worker = new HlsTransmuxWorker();
      transmuxWorkerRef.current = worker;

      const collectedChunks: Uint8Array[] = [];
      let segmentsProcessed = 0;
      let playableCallbackFired = false;
      const PLAYABLE_THRESHOLD = 5; // Segments before calling onPlayable

      const handleChunk = (segment: ArrayBuffer, isLast: boolean) => {
        collectedChunks.push(new Uint8Array(segment));
        segmentsProcessed++;

        if (callbacks?.onChunk) {
          const playbackBuffer = segment.slice(0);
          callbacks.onChunk(playbackBuffer, isLast);
        }

        // Fire onPlayable after threshold is reached
        if (!playableCallbackFired && segmentsProcessed >= PLAYABLE_THRESHOLD && callbacks?.onPlayable) {
          playableCallbackFired = true;
          callbacks.onPlayable();
        }
      };

      const transmuxPromise = new Promise<void>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<HlsTransmuxResponse>) => {
          const { type } = e.data;

          switch (type) {
            case 'INIT_SEGMENT': {
              handleChunk(e.data.payload.segment, false);
              break;
            }

            case 'MEDIA_SEGMENT': {
              const { segment, isLast } = e.data.payload;
              handleChunk(segment, !!isLast);
              break;
            }

            case 'PROGRESS': {
              const { processed, total } = e.data.payload;
              const percent = 15 + (processed / total) * 80;
              setProgress({
                stage: 'transmuxing',
                percent,
                message: `Streaming ${processed}/${total} segments (playback live)...`,
              });
              break;
            }

            case 'COMPLETE': {
              resolve();
              break;
            }

            case 'ERROR': {
              reject(new Error(e.data.payload.message));
              break;
            }
          }
        };

        worker.onerror = (event) => {
          reject(new Error(`Worker error: ${event.message}`));
        };
      });

      worker.postMessage({ type: 'START_STREAM' });

      const totalSegments = mediaManifest.segments.length;
      setProgress({
        stage: 'fetching_segments',
        percent: 15,
        message: `Streaming ${totalSegments} segments...`,
      });

      for (let i = 0; i < totalSegments; i++) {
        const segment = mediaManifest.segments[i];
        if (!segment) continue;
        const buffer = await fetchWithTimeout(segment.uri, HLS.FETCH_TIMEOUT_MS);

        if (signal.aborted) {
          throw new Error('Loading aborted');
        }

        const isLast = i === totalSegments - 1;
        worker.postMessage(
          {
            type: 'PUSH_SEGMENT',
            payload: { segment: buffer, index: i + 1, total: totalSegments, isLast },
          },
          [buffer]
        );
      }

      await transmuxPromise;

      const totalSize = collectedChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
      const merged = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of collectedChunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }

      setProgress({ stage: 'complete', percent: 100, message: 'Complete' });
      setIsLoading(false);
      transmuxWorkerRef.current?.terminate();
      transmuxWorkerRef.current = null;

      // Return both buffer and the correct duration from HLS manifest
      return { buffer: merged.buffer, duration: mediaManifest.totalDuration };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      // Don't set error for aborted requests
      if (!signal.aborted && message !== 'Loading aborted') {
        setError(message);
        logger.error('HLS loading error:', err);
      }

      setIsLoading(false);
      transmuxWorkerRef.current?.postMessage({ type: 'ABORT' });
      transmuxWorkerRef.current?.terminate();
      transmuxWorkerRef.current = null;
      throw err;
    }
  }, []);

  return { loadHlsUrl, isLoading, progress, error, abort };
}
