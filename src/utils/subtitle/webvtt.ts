/**
 * WebVTT Subtitle Format
 * Parser and exporter for WebVTT (.vtt) subtitle files.
 */

import type { SubtitleCue } from '../../core/types';
import { createCueId } from '../id';
import { TIME } from '../../constants';
import { toVttTimecode, stripTags } from './timecode';

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
