// ============================================================================
// HLS PARSER UTILITIES
// ============================================================================
// Utilities for parsing HLS manifests and selecting quality levels.

import { Parser } from 'm3u8-parser';
import type { HlsManifest, HlsQualityLevel, HlsSegment } from '../worker/hlsTypes';

/**
 * Parse an HLS manifest (master or media playlist)
 */
export function parseManifest(content: string, baseUrl: string): HlsManifest {
  const parser = new Parser();
  parser.push(content);
  parser.end();

  const manifest = parser.manifest;
  const isMaster = !!(manifest.playlists && manifest.playlists.length > 0);

  // Extract quality levels from master playlist
  const levels: HlsQualityLevel[] = [];
  if (isMaster && manifest.playlists) {
    for (const playlist of manifest.playlists) {
      const attributes = playlist.attributes || {};
      levels.push({
        bandwidth: attributes.BANDWIDTH || 0,
        width: attributes.RESOLUTION?.width || 0,
        height: attributes.RESOLUTION?.height || 0,
        uri: resolveUrl(playlist.uri, baseUrl),
      });
    }
    // Sort by bandwidth descending (highest quality first)
    levels.sort((a, b) => b.bandwidth - a.bandwidth);
  }

  // Extract segments from media playlist
  const segments: HlsSegment[] = [];
  let totalDuration = 0;
  if (manifest.segments) {
    for (const seg of manifest.segments) {
      segments.push({
        uri: resolveUrl(seg.uri, baseUrl),
        duration: seg.duration || 0,
        byteRange: seg.byterange
          ? { offset: seg.byterange.offset || 0, length: seg.byterange.length || 0 }
          : undefined,
      });
      totalDuration += seg.duration || 0;
    }
  }

  return {
    isMaster,
    levels,
    segments,
    totalDuration,
  };
}

/**
 * Select the best quality level that doesn't exceed maxHeight
 * Returns the highest bandwidth level at or below maxHeight, or the lowest available if all exceed
 */
export function selectQuality(levels: HlsQualityLevel[], maxHeight: number): HlsQualityLevel | null {
  if (levels.length === 0) return null;

  // Filter levels at or below maxHeight
  const validLevels = levels.filter((l) => l.height <= maxHeight || l.height === 0);

  if (validLevels.length > 0) {
    // Return highest bandwidth among valid levels (already sorted by bandwidth desc)
    return validLevels[0]!;
  }

  // All levels exceed maxHeight - return lowest height available
  const sortedByHeight = [...levels].sort((a, b) => a.height - b.height);
  return sortedByHeight[0]!;
}

/**
 * Resolve a potentially relative URL against a base URL
 */
export function resolveUrl(url: string, baseUrl: string): string {
  // If URL is already absolute, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Resolve relative URL against base
  try {
    return new URL(url, baseUrl).href;
  } catch {
    // Fallback: simple path join
    const base = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    return base + url;
  }
}

/**
 * Check if the manifest indicates encryption (not supported)
 */
export function hasEncryption(content: string): boolean {
  return content.includes('#EXT-X-KEY:METHOD=AES-128') ||
         content.includes('#EXT-X-KEY:METHOD=SAMPLE-AES');
}

/**
 * Fetch segments in parallel batches
 * Returns ArrayBuffers for each segment in order
 */
export async function fetchSegmentsInBatches(
  segments: HlsSegment[],
  batchSize: number,
  timeout: number,
  onProgress?: (fetched: number, total: number) => void
): Promise<ArrayBuffer[]> {
  const results: ArrayBuffer[] = new Array(segments.length);
  let fetchedCount = 0;

  for (let i = 0; i < segments.length; i += batchSize) {
    const batch = segments.slice(i, Math.min(i + batchSize, segments.length));
    const batchPromises = batch.map(async (segment, batchIndex) => {
      const globalIndex = i + batchIndex;
      const buffer = await fetchWithTimeout(segment.uri, timeout);
      results[globalIndex] = buffer;
      fetchedCount++;
      onProgress?.(fetchedCount, segments.length);
    });

    await Promise.all(batchPromises);
  }

  return results;
}

/**
 * Fetch a URL with timeout, CORS support, and retry logic
 */
export async function fetchWithTimeout(
  url: string,
  timeout: number,
  maxRetries = 3
): Promise<ArrayBuffer> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

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
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
          // Exponential backoff: 1s, 2s, 4s
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      clearTimeout(timeoutId);
      return await response.arrayBuffer();
    } catch (err) {
      clearTimeout(timeoutId);

      // Don't retry on abort
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }

      // Retry on network errors
      if (attempt < maxRetries - 1) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error('Max retries exceeded');
}
