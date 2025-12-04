/**
 * Video Editor - Serialization Type Definitions
 * Types for persisting compositions to JSON.
 */

import type { TrackType, SourceType } from './base';
import type { CompositionConfig } from './config';
import type { SubtitleCue, SubtitleStyle } from './subtitle';
import type { OverlayContentType, OverlayPosition, OverlayStyle } from './overlay';

/** Serialized clip for persistence */
export interface ClipJSON {
  id: string;
  sourceId: string;
  startUs: number;
  trimIn: number;
  trimOut: number;
  opacity: number;
  volume: number;
  label: string;
  /** ID of linked clip (for video-audio linking) */
  linkedClipId?: string;
}

/** Serialized subtitle clip for persistence */
export interface SubtitleClipJSON {
  id: string;
  startUs: number;
  cues: SubtitleCue[];
  style: SubtitleStyle;
  label: string;
  /** Trim offset from original start (microseconds) */
  trimStartUs?: number;
  /** Explicit duration override (microseconds) */
  explicitDurationUs?: number;
}

/** Serialized overlay clip for persistence */
export interface OverlayClipJSON {
  id: string;
  startUs: number;
  contentType: OverlayContentType;
  content: string;
  position: OverlayPosition;
  style: OverlayStyle;
  label: string;
  /** Explicit duration (microseconds) */
  explicitDurationUs?: number;
}

/** Serialized track for persistence */
export interface TrackJSON {
  id: string;
  type: TrackType;
  label: string;
  /** Track color for organization (hex) */
  color?: string;
  clips: ClipJSON[];
  subtitleClips?: SubtitleClipJSON[];
  overlayClips?: OverlayClipJSON[];
}

/** Serialized source reference for persistence */
export interface SourceRefJSON {
  id: string;
  type: SourceType;
  url?: string;
  durationUs: number;
  width: number;
  height: number;
}

/** Serialized composition for persistence */
export interface CompositionJSON {
  id: string;
  config: CompositionConfig;
  tracks: TrackJSON[];
  sources: SourceRefJSON[];
}
