/**
 * Subtitle Parser
 * Format detection and unified parsing interface.
 */

import type { SubtitleCue } from '../../core/types';
import { parseSRT } from './srt';
import { parseWebVTT } from './webvtt';

/**
 * Detect subtitle format from content
 */
export function detectFormat(content: string): 'srt' | 'vtt' | null {
  const trimmed = content.trim();

  if (trimmed.startsWith('WEBVTT')) {
    return 'vtt';
  }

  // Check for SRT format: starts with number, then timecode with comma
  if (/^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}/.test(trimmed)) {
    return 'srt';
  }

  // Check for timecode patterns
  if (trimmed.includes(' --> ')) {
    if (trimmed.includes(',')) {
      return 'srt';
    }
    if (trimmed.includes('.')) {
      return 'vtt';
    }
  }

  return null;
}

/**
 * Parse subtitle content (auto-detect format)
 */
export function parseSubtitles(content: string): SubtitleCue[] {
  const format = detectFormat(content);

  if (format === 'vtt') {
    return parseWebVTT(content);
  }

  if (format === 'srt') {
    return parseSRT(content);
  }

  // Default to SRT parsing
  return parseSRT(content);
}
