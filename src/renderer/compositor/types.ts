/**
 * Compositor Types
 * Shared type definitions for WebGL compositing.
 */

import type { ActiveClip } from '../../core/types';

/** Layer for playback compositing */
export interface CompositorLayer {
  /** Video frame to composite */
  frame: VideoFrame;
  /** Associated clip info */
  clip: ActiveClip;
}

/** Layer for export compositing */
export interface ExportLayer {
  /** Video frame to composite */
  frame: VideoFrame;
  /** Opacity (0-1) */
  opacity: number;
}

/** Subtitle overlay layer using OffscreenCanvas */
export interface SubtitleLayer {
  /** Canvas with rendered subtitle text */
  canvas: OffscreenCanvas;
}

/** Position as percentages of composition dimensions */
export interface OverlayPosition {
  xPercent: number;
  yPercent: number;
  widthPercent: number | null;
  heightPercent: number | null;
}

/** Overlay info for compositing */
export interface OverlayInfo {
  /** Pre-rendered overlay bitmap */
  bitmap: ImageBitmap;
  /** Position on composition (percentages) */
  position: OverlayPosition;
  /** Opacity (0-1) */
  opacity: number;
}

/** Blend shader uniform locations */
export interface BlendUniforms {
  baseTexture: WebGLUniformLocation | null;
  overlayTexture: WebGLUniformLocation | null;
  opacity: WebGLUniformLocation | null;
  hasOverlay: WebGLUniformLocation | null;
}

/** Copy shader uniform locations */
export interface CopyUniforms {
  texture: WebGLUniformLocation | null;
}
