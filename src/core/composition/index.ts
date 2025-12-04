/**
 * Composition Module
 * Barrel export for composition helper modules.
 */

// Track management
export {
  sortTracks,
  normalizeTrackOrders,
  addTrack,
  createTrack,
  removeTrack,
  getTrack,
  getTrackIndex,
  reorderTrack,
  insertTrackAt,
  getVideoTracks,
  getAudioTracks,
  getSubtitleTracks,
} from './TrackManager';

// Source management
export {
  registerSource,
  unregisterSource,
  getSource,
  isSourceInUse,
  getClipsForSource,
} from './SourceManager';

// Clip query
export { getAnyClip, getClip, getSubtitleClip } from './ClipQuery';

// Clip mutation
export {
  addClipToTrack,
  addSubtitleClipToTrack,
  removeClip,
  removeClipWithLinked,
} from './ClipMutator';

// Clip linking
export {
  getLinkedClip,
  linkClips,
  unlinkClip,
  moveClipWithLinked,
  trimStartWithLinked,
  trimEndWithLinked,
} from './ClipLinker';

// Duration calculation
export {
  computeDuration,
  getDuration,
  getActiveClipsAt,
  getActiveClipsInRange,
} from './DurationCalculator';

// Serialization
export { toJSON, tracksFromJSON } from './CompositionSerializer';
