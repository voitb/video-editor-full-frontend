/**
 * Video Editor - Active Clip Type Definition
 * Type for clips currently active at a specific timeline time.
 */

import type { TrackType } from './base';

/**
 * Active clip information for rendering at a specific timeline time.
 * This is computed from Clips and passed to the RenderWorker.
 */
export interface ActiveClip {
  /** Clip identifier */
  clipId: string;
  /** Source identifier */
  sourceId: string;
  /** Track type for determining audio/video behavior */
  trackType: TrackType;
  /** Track index for z-ordering (video) or mixing (audio) */
  trackIndex: number;
  /** Clip start time on timeline (microseconds) */
  timelineStartUs: number;
  /** Where to start in source (microseconds) */
  sourceStartUs: number;
  /** Where to end in source (microseconds) */
  sourceEndUs: number;
  /** Opacity for overlays (0-1) */
  opacity: number;
  /** Volume for audio (0-1) */
  volume: number;
}
