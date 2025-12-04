/**
 * Compositor Module
 * Shared WebGL compositing utilities for playback and export.
 */

// Types
export type {
  CompositorLayer,
  ExportLayer,
  SubtitleLayer,
  OverlayPosition,
  OverlayInfo,
  BlendUniforms,
  CopyUniforms,
} from './types';

// Shaders
export { VERTEX_SHADER, BLEND_FRAGMENT_SHADER, COPY_FRAGMENT_SHADER } from './shaders';

// Shader program
export { createProgram } from './ShaderProgram';

// Geometry
export { createGeometry, createGeometryWithFlippedTexCoords } from './WebGLGeometry';

// Textures
export { createTexture, uploadTextureWithFlip, uploadTexture } from './TextureManager';

// Framebuffer
export { createFramebuffer, resizeFramebuffer, blitFramebuffer } from './FramebufferManager';
export type { FramebufferResult } from './FramebufferManager';

// Overlay
export { renderOverlayToCanvas, createBlackCanvas } from './OverlayProcessor';
