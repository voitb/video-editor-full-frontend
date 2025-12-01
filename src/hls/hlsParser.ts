/**
 * Video Editor V2 - HLS Parser Utilities
 * Functions for parsing HLS manifests and selecting quality levels.
 */

import { Parser } from 'm3u8-parser';
import type { HlsManifest, HlsQualityLevel, HlsSegment } from './hlsTypes';
import { HLS } from '../constants';

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
 */
export function selectQuality(
  levels: HlsQualityLevel[],
  maxHeight: number = HLS.MAX_RESOLUTION
): HlsQualityLevel | null {
  if (levels.length === 0) return null;

  // Filter levels at or below maxHeight
  const validLevels = levels.filter((l) => l.height <= maxHeight || l.height === 0);

  if (validLevels.length > 0) {
    // Return highest bandwidth among valid levels
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
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  try {
    return new URL(url, baseUrl).href;
  } catch {
    const base = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    return base + url;
  }
}

/**
 * Check if the manifest indicates encryption (not supported)
 */
export function hasEncryption(content: string): boolean {
  return (
    content.includes('#EXT-X-KEY:METHOD=AES-128') ||
    content.includes('#EXT-X-KEY:METHOD=SAMPLE-AES')
  );
}

/**
 * Validate HLS URL
 */
export function isValidHlsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Get base URL for resolving relative paths
 */
export function getBaseUrl(url: string): string {
  const idx = url.lastIndexOf('/');
  return idx >= 0 ? url.substring(0, idx + 1) : url;
}
