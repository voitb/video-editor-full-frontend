/**
 * Subtitle Utilities - Re-export
 * @deprecated Import from './subtitle/' instead.
 * This file re-exports from the subtitle module for backward compatibility.
 */

export {
  parseSRT,
  exportToSRT,
  parseWebVTT,
  exportToWebVTT,
  toSrtTimecode,
  toVttTimecode,
  stripTags,
  formatTime,
  detectFormat,
  parseSubtitles,
} from './subtitle/index';
