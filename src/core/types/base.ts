/**
 * Video Editor - Base Type Definitions
 * Fundamental types used throughout the composition model.
 */

/** Track type identifier */
export type TrackType = 'video' | 'audio' | 'subtitle' | 'overlay';

/** Source loading states */
export type SourceState = 'idle' | 'loading' | 'playable' | 'ready' | 'error';

/** Source type identifier */
export type SourceType = 'hls' | 'file';
