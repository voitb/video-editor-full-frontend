/**
 * Video Editor - Configuration Type Definitions
 * Types for configuring compositions, clips, and tracks.
 */

import type { TrackType } from './base';

/** Composition configuration */
export interface CompositionConfig {
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Target frame rate */
  frameRate: number;
  /** Fixed composition duration in microseconds (optional, overrides computed duration) */
  fixedDurationUs?: number;
}

/** Clip configuration for creation/updates */
export interface ClipConfig {
  /** Reference to source */
  sourceId: string;
  /** Position on timeline (microseconds) */
  startUs: number;
  /** Trim in-point in source (microseconds) */
  trimIn: number;
  /** Trim out-point in source (microseconds) */
  trimOut: number;
  /** Opacity for video overlays (0-1) */
  opacity?: number;
  /** Volume for audio (0-1) */
  volume?: number;
  /** Optional label */
  label?: string;
  /** ID of linked clip (for video-audio linking) */
  linkedClipId?: string;
}

/** Track configuration for creation */
export interface TrackConfig {
  /** Track type */
  type: TrackType;
  /** Display label */
  label: string;
  /** Track color for organization (hex) */
  color?: string;
  /** Order within type group (for manual reordering) */
  order?: number;
}
