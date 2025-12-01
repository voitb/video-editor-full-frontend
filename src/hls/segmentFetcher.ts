/**
 * Video Editor V2 - HLS Segment Fetcher
 * Utilities for fetching HLS segments with retry logic.
 */

import type { HlsSegment, FetchProgressCallback } from './hlsTypes';
import { HLS } from '../constants';

/**
 * Fetch a URL with timeout, CORS support, and retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: {
    timeout?: number;
    maxRetries?: number;
    signal?: AbortSignal;
  } = {}
): Promise<ArrayBuffer> {
  const { timeout = HLS.FETCH_TIMEOUT_MS, maxRetries = HLS.MAX_RETRIES, signal } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Check if already aborted
    if (signal?.aborted) {
      throw new Error('Fetch aborted');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Link external abort signal
    const abortHandler = () => controller.abort();
    signal?.addEventListener('abort', abortHandler);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
      });

      if (!response.ok) {
        // Retry on 5xx server errors
        if (response.status >= 500 && attempt < maxRetries - 1) {
          clearTimeout(timeoutId);
          signal?.removeEventListener('abort', abortHandler);
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
          await delay(HLS.RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);
      return await response.arrayBuffer();
    } catch (err) {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);

      if (err instanceof Error && err.name === 'AbortError') {
        if (signal?.aborted) {
          throw new Error('Fetch aborted');
        }
        throw new Error(`Request timeout after ${timeout}ms`);
      }

      // Retry on network errors
      if (attempt < maxRetries - 1) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await delay(HLS.RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt));
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Fetch manifest text content
 */
export async function fetchManifest(
  url: string,
  options: { timeout?: number; signal?: AbortSignal } = {}
): Promise<string> {
  const buffer = await fetchWithRetry(url, options);
  return new TextDecoder().decode(buffer);
}

/**
 * Fetch segments sequentially for streaming (one at a time)
 * Calls onSegment for each segment as it's fetched
 */
export async function fetchSegmentsSequential(
  segments: HlsSegment[],
  options: {
    timeout?: number;
    maxRetries?: number;
    signal?: AbortSignal;
    onSegment?: (buffer: ArrayBuffer, index: number, isLast: boolean) => void;
    onProgress?: FetchProgressCallback;
  } = {}
): Promise<ArrayBuffer[]> {
  const { timeout, maxRetries, signal, onSegment, onProgress } = options;
  const results: ArrayBuffer[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (signal?.aborted) {
      throw new Error('Fetch aborted');
    }

    const segment = segments[i]!;
    const buffer = await fetchWithRetry(segment.uri, { timeout, maxRetries, signal });
    results.push(buffer);

    const isLast = i === segments.length - 1;
    onSegment?.(buffer, i, isLast);
    onProgress?.(i + 1, segments.length);
  }

  return results;
}

/**
 * Fetch segments in parallel batches
 */
export async function fetchSegmentsBatched(
  segments: HlsSegment[],
  options: {
    batchSize?: number;
    timeout?: number;
    maxRetries?: number;
    signal?: AbortSignal;
    onProgress?: FetchProgressCallback;
  } = {}
): Promise<ArrayBuffer[]> {
  const { batchSize = HLS.SEGMENT_BATCH_SIZE, timeout, maxRetries, signal, onProgress } = options;

  const results: ArrayBuffer[] = new Array(segments.length);
  let fetchedCount = 0;

  for (let i = 0; i < segments.length; i += batchSize) {
    if (signal?.aborted) {
      throw new Error('Fetch aborted');
    }

    const batch = segments.slice(i, Math.min(i + batchSize, segments.length));
    const batchPromises = batch.map(async (segment, batchIndex) => {
      const globalIndex = i + batchIndex;
      const buffer = await fetchWithRetry(segment.uri, { timeout, maxRetries, signal });
      results[globalIndex] = buffer;
      fetchedCount++;
      onProgress?.(fetchedCount, segments.length);
    });

    await Promise.all(batchPromises);
  }

  return results;
}

/**
 * Simple delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
