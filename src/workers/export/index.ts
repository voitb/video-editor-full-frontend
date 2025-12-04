/**
 * Export Worker Modules
 * Barrel export for all export worker modules.
 */

// Types
export type {
  ExportSourceState,
  ActiveClipInfo,
  ActiveOverlayInfo,
  MP4ArrayBuffer,
} from './types';

// Source Loading
export { loadSources, loadSource, cleanupSources } from './SourceLoader';

// Frame Decoding
export {
  findSampleAtTime,
  findKeyframeBefore,
  getVideoCodecDescription,
  getAudioCodecDescription,
  decodeFrameForClip,
} from './FrameDecoder';

// Audio Mixing
export {
  mixAudioTracks,
  encodeAudioBuffer,
  type AudioMixerConfig,
  type MixedAudioResult,
} from './AudioMixer';
