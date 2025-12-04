/**
 * SRT Subtitle Format
 * Parser and exporter for SubRip (.srt) subtitle files.
 */

import type { SubtitleCue } from '../../core/types';
import { createCueId } from '../id';
import { TIME } from '../../constants';
import { toSrtTimecode, stripTags } from './timecode';

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
