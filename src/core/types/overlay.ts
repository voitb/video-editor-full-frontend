/**
 * Video Editor - Overlay Type Definitions
 * Types for overlay content, positioning, and styling.
 */

/** Overlay content type discriminator */
export type OverlayContentType = 'text' | 'html' | 'widget';

/** Overlay position as percentages of composition dimensions */
export interface OverlayPosition {
  /** X position as percentage (0-100) of composition width */
  xPercent: number;
  /** Y position as percentage (0-100) of composition height */
  yPercent: number;
  /** Width as percentage (0-100) of composition width, null for auto */
  widthPercent: number | null;
  /** Height as percentage (0-100) of composition height, null for auto */
  heightPercent: number | null;
}

/** Overlay styling options */
export interface OverlayStyle {
  /** Font family (web-safe) */
  fontFamily: string;
  /** Font size in pixels (at 1080p reference) */
  fontSize: number;
  /** Text color (hex) */
  color: string;
  /** Background color (hex with alpha) */
  backgroundColor: string;
  /** Padding in pixels */
  padding: number;
  /** Border radius in pixels */
  borderRadius: number;
  /** Opacity (0-1) */
  opacity: number;
  /** Text alignment */
  textAlign: 'left' | 'center' | 'right';
  /** Font weight */
  fontWeight: 'normal' | 'bold';
}

/** Configuration for creating an overlay clip */
export interface OverlayClipConfig {
  /** Position on timeline (microseconds) */
  startUs: number;
  /** Content type discriminator */
  contentType: OverlayContentType;
  /** Content string (plain text, HTML, or widget identifier) */
  content: string;
  /** Position on preview */
  position: OverlayPosition;
  /** Style settings */
  style: OverlayStyle;
  /** Optional label */
  label?: string;
  /** Explicit duration (microseconds) */
  explicitDurationUs?: number;
}
