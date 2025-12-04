/**
 * Video Editor - Subtitle Type Definitions
 * Types for subtitle cues, styling, and configuration.
 */

/** A single subtitle cue (text segment) */
export interface SubtitleCue {
  /** Unique identifier */
  id: string;
  /** Start time relative to clip start (microseconds) */
  startUs: number;
  /** End time relative to clip start (microseconds) */
  endUs: number;
  /** Text content (may contain newlines) */
  text: string;
}

/** Subtitle styling options */
export interface SubtitleStyle {
  /** Font family (web-safe) */
  fontFamily: string;
  /** Font size in pixels (at 1080p reference) */
  fontSize: number;
  /** Text color (hex) */
  color: string;
  /** Background color (hex with alpha) */
  backgroundColor: string;
  /** Whether to show background box */
  showBackground: boolean;
}

/** Configuration for creating a subtitle clip */
export interface SubtitleClipConfig {
  /** Position on timeline (microseconds) */
  startUs: number;
  /** Array of cues */
  cues: SubtitleCue[];
  /** Style settings */
  style: SubtitleStyle;
  /** Optional label */
  label?: string;
  /** Trim offset from original start (microseconds) - for left-edge trimming */
  trimStartUs?: number;
  /** Explicit duration override (microseconds) - for right-edge trimming */
  explicitDurationUs?: number;
}
