/**
 * Video Editor - Core Type Definitions
 * Re-exports all types from domain-specific modules.
 */

// Base types
export type { TrackType, SourceState, SourceType } from './base';

// Configuration types
export type { CompositionConfig, ClipConfig, TrackConfig } from './config';

// Active clip for rendering
export type { ActiveClip } from './active-clip';

// Serialization types
export type {
  ClipJSON,
  TrackJSON,
  SourceRefJSON,
  CompositionJSON,
  SubtitleClipJSON,
  OverlayClipJSON,
} from './serialization';

// Event types
export type { SourceEvent, SourceEventCallback } from './events';

// Audio types
export type { SourceAudioData } from './audio';

// Timeline types
export type { TimelineViewport, TrackUIState } from './timeline';

// Export types
export type {
  ExportRange,
  ExportPresetKey,
  ExportPreset,
  ExportConfig,
  ExportPhase,
  ExportProgress,
  ExportResult,
} from './export';

// Subtitle types
export type { SubtitleCue, SubtitleStyle, SubtitleClipConfig } from './subtitle';

// Overlay types
export type {
  OverlayContentType,
  OverlayPosition,
  OverlayStyle,
  OverlayClipConfig,
} from './overlay';
