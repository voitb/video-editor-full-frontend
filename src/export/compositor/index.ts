/**
 * Export Compositor Module
 * Barrel export for compositor helper modules.
 */

// Types
export type {
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
export { createGeometry } from './WebGLGeometry';

// Textures
export { createTexture, uploadTextureWithFlip } from './TextureManager';

// Framebuffer
export { createFramebuffer, blitFramebuffer } from './FramebufferManager';
export type { FramebufferResult } from './FramebufferManager';

// Overlay
export { renderOverlayToCanvas, createBlackCanvas } from './OverlayProcessor';
