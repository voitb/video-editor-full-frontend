/**
 * Video Editor V2 - Subtitle Parser Utilities
 * Simple parsers for SRT and WebVTT formats.
 */

import type { SubtitleCue } from '../core/types';
import { createCueId } from './id';
import { TIME } from '../constants';

/**
 * Parse SRT timecode to microseconds
 * Format: HH:MM:SS,mmm (comma for milliseconds)
 */
function parseSrtTimecode(timecode: string): number {
  const match = timecode.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return 0;

  const hours = match[1] ?? '0';
  const minutes = match[2] ?? '0';
  const seconds = match[3] ?? '0';
  const ms = match[4] ?? '0';
  return (
    parseInt(hours) * 3600 * TIME.US_PER_SECOND +
    parseInt(minutes) * 60 * TIME.US_PER_SECOND +
    parseInt(seconds) * TIME.US_PER_SECOND +
    parseInt(ms) * TIME.US_PER_MS
  );
}

/**
 * Parse WebVTT timecode to microseconds
 * Format: HH:MM:SS.mmm or MM:SS.mmm (dot for milliseconds)
 */
function parseVttTimecode(timecode: string): number {
  // Try HH:MM:SS.mmm format
  let match = timecode.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (match) {
    const hours = match[1] ?? '0';
    const minutes = match[2] ?? '0';
    const seconds = match[3] ?? '0';
    const ms = match[4] ?? '0';
    return (
      parseInt(hours) * 3600 * TIME.US_PER_SECOND +
      parseInt(minutes) * 60 * TIME.US_PER_SECOND +
      parseInt(seconds) * TIME.US_PER_SECOND +
      parseInt(ms) * TIME.US_PER_MS
    );
  }

  // Try MM:SS.mmm format
  match = timecode.match(/(\d{2}):(\d{2})\.(\d{3})/);
  if (match) {
    const minutes = match[1] ?? '0';
    const seconds = match[2] ?? '0';
    const ms = match[3] ?? '0';
    return (
      parseInt(minutes) * 60 * TIME.US_PER_SECOND +
      parseInt(seconds) * TIME.US_PER_SECOND +
      parseInt(ms) * TIME.US_PER_MS
    );
  }

  return 0;
}

/**
 * Convert microseconds to SRT timecode
 * Format: HH:MM:SS,mmm
 */
function toSrtTimecode(us: number): string {
  const totalMs = Math.floor(us / TIME.US_PER_MS);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Convert microseconds to WebVTT timecode
 * Format: HH:MM:SS.mmm
 */
function toVttTimecode(us: number): string {
  const totalMs = Math.floor(us / TIME.US_PER_MS);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Strip HTML-like formatting tags from text
 */
function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
}

/**
 * Parse SRT subtitle content
 * Returns cues with times relative to start (first cue starts at 0)
 */
export function parseSRT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = content.trim().split(/\n\s*\n/);
  let offsetUs = 0;
  let isFirst = true;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Find the timecode line (contains " --> ")
    let timecodeLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.includes(' --> ')) {
        timecodeLineIndex = i;
        break;
      }
    }

    if (timecodeLineIndex === -1) continue;

    const timecodeLine = lines[timecodeLineIndex];
    if (!timecodeLine) continue;

    const timecodeParts = timecodeLine.split(' --> ');
    const startStr = timecodeParts[0];
    const endStr = timecodeParts[1];

    if (!startStr || !endStr) continue;

    const startUs = parseSrtTimecode(startStr.trim());
    const endPart = endStr.trim().split(' ')[0] ?? '';
    const endUs = parseSrtTimecode(endPart); // Handle position data

    // Calculate offset from first cue
    if (isFirst) {
      offsetUs = startUs;
      isFirst = false;
    }

    // Get text (all lines after timecode)
    const textLines = lines.slice(timecodeLineIndex + 1);
    const text = stripTags(textLines.join('\n'));

    if (text) {
      cues.push({
        id: createCueId(),
        startUs: startUs - offsetUs,
        endUs: endUs - offsetUs,
        text,
      });
    }
  }

  return cues;
}

/**
 * Parse WebVTT subtitle content
 * Returns cues with times relative to start (first cue starts at 0)
 */
export function parseWebVTT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];

  // Remove WEBVTT header and any metadata
  const lines = content.split('\n');
  let startIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.startsWith('WEBVTT')) {
      startIndex = i + 1;
      break;
    }
  }

  const bodyContent = lines.slice(startIndex).join('\n');
  const blocks = bodyContent.trim().split(/\n\s*\n/);
  let offsetUs = 0;
  let isFirst = true;

  for (const block of blocks) {
    const blockLines = block.trim().split('\n');
    if (blockLines.length < 1) continue;

    // Find the timecode line (contains " --> ")
    let timecodeLineIndex = -1;
    for (let i = 0; i < blockLines.length; i++) {
      const line = blockLines[i];
      if (line && line.includes(' --> ')) {
        timecodeLineIndex = i;
        break;
      }
    }

    if (timecodeLineIndex === -1) continue;

    const timecodeLine = blockLines[timecodeLineIndex];
    if (!timecodeLine) continue;

    const timecodeParts = timecodeLine.split(' --> ');
    const startStr = timecodeParts[0];
    const endStr = timecodeParts[1];

    if (!startStr || !endStr) continue;

    const startUs = parseVttTimecode(startStr.trim());
    const endPart = endStr.trim().split(' ')[0] ?? '';
    const endUs = parseVttTimecode(endPart); // Handle cue settings

    // Calculate offset from first cue
    if (isFirst) {
      offsetUs = startUs;
      isFirst = false;
    }

    // Get text (all lines after timecode)
    const textLines = blockLines.slice(timecodeLineIndex + 1);
    const text = stripTags(textLines.join('\n'));

    if (text) {
      cues.push({
        id: createCueId(),
        startUs: startUs - offsetUs,
        endUs: endUs - offsetUs,
        text,
      });
    }
  }

  return cues;
}

/**
 * Export cues to SRT format
 */
export function exportToSRT(cues: SubtitleCue[]): string {
  const sortedCues = [...cues].sort((a, b) => a.startUs - b.startUs);

  return sortedCues
    .map((cue, index) => {
      const lines = [
        (index + 1).toString(),
        `${toSrtTimecode(cue.startUs)} --> ${toSrtTimecode(cue.endUs)}`,
        cue.text,
      ];
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * Export cues to WebVTT format
 */
export function exportToWebVTT(cues: SubtitleCue[]): string {
  const sortedCues = [...cues].sort((a, b) => a.startUs - b.startUs);

  const cueBlocks = sortedCues.map((cue, index) => {
    const lines = [
      (index + 1).toString(),
      `${toVttTimecode(cue.startUs)} --> ${toVttTimecode(cue.endUs)}`,
      cue.text,
    ];
    return lines.join('\n');
  });

  return 'WEBVTT\n\n' + cueBlocks.join('\n\n');
}

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

/**
 * Format microseconds as display time (MM:SS.ms)
 */
export function formatTime(us: number): string {
  const totalMs = Math.floor(us / TIME.US_PER_MS);
  const ms = Math.floor((totalMs % 1000) / 10); // Just show centiseconds
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
