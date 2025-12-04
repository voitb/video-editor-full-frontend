/**
 * Video Editor V2 - Compositor
 * WebGL-based compositor for blending multiple video layers.
 * Used for real-time playback rendering.
 */

import {
  type CompositorLayer,
  type BlendUniforms,
  type CopyUniforms,
  VERTEX_SHADER,
  BLEND_FRAGMENT_SHADER,
  COPY_FRAGMENT_SHADER,
  createProgram,
  createGeometryWithFlippedTexCoords,
  createTexture,
  uploadTexture,
  createFramebuffer,
  resizeFramebuffer,
  blitFramebuffer,
} from './compositor/index';

// Re-export for consumers
export type { CompositorLayer } from './compositor/index';

/**
 * WebGL2-based compositor for real-time playback.
 * Designed to work in Worker context with OffscreenCanvas.
 */
export class Compositor {
  private gl: WebGL2RenderingContext;
  private canvas: OffscreenCanvas;
  private width: number;
  private height: number;

  private blendProgram: WebGLProgram | null = null;
  private copyProgram: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;

  private baseTexture: WebGLTexture | null = null;
  private overlayTexture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private framebufferTexture: WebGLTexture | null = null;

  private blendUniforms: BlendUniforms = {
    baseTexture: null,
    overlayTexture: null,
    opacity: null,
    hasOverlay: null,
  };

  private copyUniforms: CopyUniforms = {
    texture: null,
  };

  constructor(canvas: OffscreenCanvas) {
    this.canvas = canvas;
    this.width = canvas.width;
    this.height = canvas.height;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });

    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.initialize();
  }

  private initialize(): void {
    const { gl } = this;

    this.blendProgram = createProgram(gl, VERTEX_SHADER, BLEND_FRAGMENT_SHADER);
    this.copyProgram = createProgram(gl, VERTEX_SHADER, COPY_FRAGMENT_SHADER);

    if (!this.blendProgram || !this.copyProgram) {
      throw new Error('Failed to create shader programs');
    }

    // Get uniform locations
    this.blendUniforms = {
      baseTexture: gl.getUniformLocation(this.blendProgram, 'u_baseTexture'),
      overlayTexture: gl.getUniformLocation(this.blendProgram, 'u_overlayTexture'),
      opacity: gl.getUniformLocation(this.blendProgram, 'u_opacity'),
      hasOverlay: gl.getUniformLocation(this.blendProgram, 'u_hasOverlay'),
    };

    this.copyUniforms = {
      texture: gl.getUniformLocation(this.copyProgram, 'u_texture'),
    };

    // Use flipped texture coordinates for textures uploaded without UNPACK_FLIP_Y_WEBGL
    this.vao = createGeometryWithFlippedTexCoords(gl, this.blendProgram);
    this.baseTexture = createTexture(gl);
    this.overlayTexture = createTexture(gl);

    const fbResult = createFramebuffer(gl, this.width, this.height);
    if (fbResult) {
      this.framebuffer = fbResult.framebuffer;
      this.framebufferTexture = fbResult.texture;
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;

    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    resizeFramebuffer(this.gl, this.framebufferTexture, width, height);
    this.gl.viewport(0, 0, width, height);
  }

  /**
   * Composite multiple layers into a single frame.
   * Layers should be sorted by trackIndex (lowest = bottom).
   * Does NOT close frames - caller is responsible.
   */
  composite(layers: CompositorLayer[]): void {
    if (layers.length === 0) return;

    const { gl } = this;
    gl.viewport(0, 0, this.width, this.height);
    gl.bindVertexArray(this.vao);

    if (layers.length === 1) {
      this.drawSingleLayer(layers[0]!);
    } else {
      this.drawMultipleLayers(layers);
    }

    gl.bindVertexArray(null);
  }

  private drawSingleLayer(layer: CompositorLayer): void {
    const { gl } = this;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.copyProgram);

    gl.activeTexture(gl.TEXTURE0);
    uploadTexture(gl, this.baseTexture, layer.frame);

    gl.uniform1i(this.copyUniforms.texture, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawMultipleLayers(layers: CompositorLayer[]): void {
    const { gl } = this;

    // First layer to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.copyProgram);
    gl.activeTexture(gl.TEXTURE0);
    uploadTexture(gl, this.baseTexture, layers[0]!.frame);
    gl.uniform1i(this.copyUniforms.texture, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Blend subsequent layers
    gl.useProgram(this.blendProgram);

    for (let i = 1; i < layers.length; i++) {
      const layer = layers[i]!;
      const opacity = layer.clip.opacity;

      if (i === layers.length - 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
      gl.uniform1i(this.blendUniforms.baseTexture, 0);

      gl.activeTexture(gl.TEXTURE1);
      uploadTexture(gl, this.overlayTexture, layer.frame);
      gl.uniform1i(this.blendUniforms.overlayTexture, 1);

      gl.uniform1f(this.blendUniforms.opacity, opacity);
      gl.uniform1i(this.blendUniforms.hasOverlay, 1);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (i < layers.length - 1) {
        blitFramebuffer(gl, this.width, this.height, null, this.framebuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      }
    }
  }

  clear(): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  dispose(): void {
    const { gl } = this;
    if (this.blendProgram) gl.deleteProgram(this.blendProgram);
    if (this.copyProgram) gl.deleteProgram(this.copyProgram);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.baseTexture) gl.deleteTexture(this.baseTexture);
    if (this.overlayTexture) gl.deleteTexture(this.overlayTexture);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    if (this.framebufferTexture) gl.deleteTexture(this.framebufferTexture);
  }
}
