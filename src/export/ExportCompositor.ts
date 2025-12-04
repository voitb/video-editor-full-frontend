/**
 * Video Editor - Export Compositor
 * WebGL2-based compositor for export worker context.
 * Composites video frames and returns VideoFrame for encoding.
 */

import {
  type ExportLayer,
  type SubtitleLayer,
  type OverlayInfo,
  type BlendUniforms,
  type CopyUniforms,
  VERTEX_SHADER,
  BLEND_FRAGMENT_SHADER,
  COPY_FRAGMENT_SHADER,
  createProgram,
  createGeometry,
  createTexture,
  uploadTextureWithFlip,
  createFramebuffer,
  blitFramebuffer,
  renderOverlayToCanvas,
  createBlackCanvas,
} from './compositor';

// Re-export types for consumers
export type { ExportLayer, SubtitleLayer, OverlayInfo } from './compositor';

/**
 * WebGL2-based compositor for export.
 * Designed to work in Worker context with OffscreenCanvas.
 */
export class ExportCompositor {
  private gl: WebGL2RenderingContext;
  private canvas: OffscreenCanvas;
  private width: number;
  private height: number;

  private blendProgram: WebGLProgram | null = null;
  private copyProgram: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;

  private baseTexture: WebGLTexture | null = null;
  private overlayTexture: WebGLTexture | null = null;
  private subtitleTexture: WebGLTexture | null = null;
  private overlayBitmapTexture: WebGLTexture | null = null;
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

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas = new OffscreenCanvas(width, height);

    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
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

    this.vao = createGeometry(gl, this.blendProgram);
    this.baseTexture = createTexture(gl);
    this.overlayTexture = createTexture(gl);
    this.subtitleTexture = createTexture(gl);
    this.overlayBitmapTexture = createTexture(gl);

    const fbResult = createFramebuffer(gl, this.width, this.height);
    if (fbResult) {
      this.framebuffer = fbResult.framebuffer;
      this.framebufferTexture = fbResult.texture;
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /**
   * Composite multiple layers and return a VideoFrame.
   */
  composite(
    layers: ExportLayer[],
    timestampUs: number,
    subtitleLayer?: SubtitleLayer,
    overlays?: OverlayInfo[]
  ): VideoFrame {
    const { gl } = this;
    gl.viewport(0, 0, this.width, this.height);
    gl.bindVertexArray(this.vao);

    const hasOverlays = overlays && overlays.length > 0;

    if (layers.length === 0) {
      this.drawBlackFrame();
      if (hasOverlays) {
        this.drawOverlaysOnly(overlays!);
      }
    } else if (layers.length === 1 && !subtitleLayer && !hasOverlays) {
      this.drawSingleLayer(layers[0]!);
    } else {
      this.drawMultipleLayers(layers, subtitleLayer, overlays);
    }

    gl.bindVertexArray(null);

    return new VideoFrame(this.canvas, { timestamp: timestampUs });
  }

  private drawBlackFrame(): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private drawSingleLayer(layer: ExportLayer): void {
    const { gl } = this;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.copyProgram);
    gl.activeTexture(gl.TEXTURE0);
    uploadTextureWithFlip(gl, this.baseTexture, layer.frame);
    gl.uniform1i(this.copyUniforms.texture, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawMultipleLayers(
    layers: ExportLayer[],
    subtitleLayer?: SubtitleLayer,
    overlays?: OverlayInfo[]
  ): void {
    const { gl } = this;
    const hasSubtitles = subtitleLayer !== undefined;
    const hasOverlays = overlays && overlays.length > 0;

    // First layer to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.copyProgram);
    gl.activeTexture(gl.TEXTURE0);
    uploadTextureWithFlip(gl, this.baseTexture, layers[0]!.frame);
    gl.uniform1i(this.copyUniforms.texture, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Blend subsequent layers
    // Use proper ping-pong: always draw to screen, then copy to framebuffer if more layers follow
    gl.useProgram(this.blendProgram);

    for (let i = 1; i < layers.length; i++) {
      const layer = layers[i]!;
      const isLastLayer = i === layers.length - 1 && !hasSubtitles && !hasOverlays;

      // Always draw to screen to avoid read-write hazard
      // (can't read from framebufferTexture while writing to its attached framebuffer)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.blendLayer(layer.frame, layer.opacity);

      // If more layers follow, copy result to framebuffer for next iteration
      if (!isLastLayer) {
        this.copyToFramebuffer();
      }
    }

    // Draw subtitle overlay
    // Use proper ping-pong: always draw to screen to avoid read-write hazard
    if (hasSubtitles) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.blendCanvas(subtitleLayer.canvas, 1.0);

      // If overlays follow, copy result to framebuffer for them to read
      if (hasOverlays) {
        this.copyToFramebuffer();
      }
    }

    // Draw HTML overlays
    if (hasOverlays) {
      this.drawOverlays(overlays!);
    }
  }

  private drawOverlaysOnly(overlays: OverlayInfo[]): void {
    const { gl } = this;
    gl.useProgram(this.blendProgram);

    for (let i = 0; i < overlays.length; i++) {
      const overlay = overlays[i]!;
      const overlayCanvas = renderOverlayToCanvas(
        overlay.bitmap,
        overlay.position,
        this.width,
        this.height
      );

      if (i === 0) {
        gl.activeTexture(gl.TEXTURE0);
        const blackCanvas = createBlackCanvas(this.width, this.height);
        uploadTextureWithFlip(gl, this.baseTexture, blackCanvas);
        gl.uniform1i(this.blendUniforms.baseTexture, 0);
      } else {
        blitFramebuffer(gl, this.width, this.height, null, this.framebuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
        gl.uniform1i(this.blendUniforms.baseTexture, 0);
      }

      gl.activeTexture(gl.TEXTURE1);
      uploadTextureWithFlip(gl, this.overlayBitmapTexture, overlayCanvas);
      gl.uniform1i(this.blendUniforms.overlayTexture, 1);
      gl.uniform1f(this.blendUniforms.opacity, overlay.opacity);
      gl.uniform1i(this.blendUniforms.hasOverlay, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  private drawOverlays(overlays: OverlayInfo[]): void {
    const { gl } = this;

    for (let i = 0; i < overlays.length; i++) {
      const overlay = overlays[i]!;
      const isLastOverlay = i === overlays.length - 1;

      if (isLastOverlay) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      const overlayCanvas = renderOverlayToCanvas(
        overlay.bitmap,
        overlay.position,
        this.width,
        this.height
      );

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
      gl.uniform1i(this.blendUniforms.baseTexture, 0);

      gl.activeTexture(gl.TEXTURE1);
      uploadTextureWithFlip(gl, this.overlayBitmapTexture, overlayCanvas);
      gl.uniform1i(this.blendUniforms.overlayTexture, 1);
      gl.uniform1f(this.blendUniforms.opacity, overlay.opacity);
      gl.uniform1i(this.blendUniforms.hasOverlay, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (!isLastOverlay) {
        this.copyToFramebuffer();
      }
    }
  }

  private blendLayer(frame: VideoFrame, opacity: number): void {
    const { gl } = this;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
    gl.uniform1i(this.blendUniforms.baseTexture, 0);

    gl.activeTexture(gl.TEXTURE1);
    uploadTextureWithFlip(gl, this.overlayTexture, frame);
    gl.uniform1i(this.blendUniforms.overlayTexture, 1);

    gl.uniform1f(this.blendUniforms.opacity, opacity);
    gl.uniform1i(this.blendUniforms.hasOverlay, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private blendCanvas(canvas: OffscreenCanvas, opacity: number): void {
    const { gl } = this;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
    gl.uniform1i(this.blendUniforms.baseTexture, 0);

    gl.activeTexture(gl.TEXTURE1);
    uploadTextureWithFlip(gl, this.subtitleTexture, canvas);
    gl.uniform1i(this.blendUniforms.overlayTexture, 1);

    gl.uniform1f(this.blendUniforms.opacity, opacity);
    gl.uniform1i(this.blendUniforms.hasOverlay, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private copyToFramebuffer(): void {
    blitFramebuffer(this.gl, this.width, this.height, null, this.framebuffer);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
  }

  clear(): void {
    this.drawBlackFrame();
  }

  dispose(): void {
    const { gl } = this;
    if (this.blendProgram) gl.deleteProgram(this.blendProgram);
    if (this.copyProgram) gl.deleteProgram(this.copyProgram);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.baseTexture) gl.deleteTexture(this.baseTexture);
    if (this.overlayTexture) gl.deleteTexture(this.overlayTexture);
    if (this.subtitleTexture) gl.deleteTexture(this.subtitleTexture);
    if (this.overlayBitmapTexture) gl.deleteTexture(this.overlayBitmapTexture);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    if (this.framebufferTexture) gl.deleteTexture(this.framebufferTexture);
  }
}
