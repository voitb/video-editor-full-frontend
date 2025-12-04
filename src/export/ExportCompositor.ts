/**
 * Video Editor - Export Compositor
 * WebGL2-based compositor for export worker context.
 * Composites video frames and returns VideoFrame for encoding.
 */

// Vertex shader
const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

// Blend fragment shader
const BLEND_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_baseTexture;
uniform sampler2D u_overlayTexture;
uniform float u_opacity;
uniform bool u_hasOverlay;
in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec4 baseColor = texture(u_baseTexture, v_texCoord);

  if (u_hasOverlay) {
    vec4 overlayColor = texture(u_overlayTexture, v_texCoord);
    float alpha = overlayColor.a * u_opacity;
    fragColor = vec4(
      overlayColor.rgb * alpha + baseColor.rgb * (1.0 - alpha),
      max(baseColor.a, alpha)
    );
  } else {
    fragColor = baseColor;
  }
}`;

// Copy fragment shader
const COPY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  fragColor = texture(u_texture, v_texCoord);
}`;

/** Layer for compositing */
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
interface OverlayPosition {
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

  private blendUniforms = {
    baseTexture: null as WebGLUniformLocation | null,
    overlayTexture: null as WebGLUniformLocation | null,
    opacity: null as WebGLUniformLocation | null,
    hasOverlay: null as WebGLUniformLocation | null,
  };

  private copyUniforms = {
    texture: null as WebGLUniformLocation | null,
  };

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas = new OffscreenCanvas(width, height);

    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true, // Need this for reading pixels
    });

    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.initialize();
  }

  private initialize(): void {
    const { gl } = this;

    this.blendProgram = this.createProgram(VERTEX_SHADER, BLEND_FRAGMENT_SHADER);
    this.copyProgram = this.createProgram(VERTEX_SHADER, COPY_FRAGMENT_SHADER);

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

    this.createGeometry();
    this.baseTexture = this.createTexture();
    this.overlayTexture = this.createTexture();
    this.subtitleTexture = this.createTexture();
    this.overlayBitmapTexture = this.createTexture();
    this.createFramebuffer();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private createGeometry(): void {
    const { gl } = this;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Positions (fullscreen quad)
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(this.blendProgram!, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Texture coordinates (normal - Y-flip happens at upload time via UNPACK_FLIP_Y_WEBGL)
    const texCoords = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

    const texBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    const texLoc = gl.getAttribLocation(this.blendProgram!, 'a_texCoord');
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  private createTexture(): WebGLTexture | null {
    const { gl } = this;
    const texture = gl.createTexture();
    if (!texture) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return texture;
  }

  private createFramebuffer(): void {
    const { gl } = this;

    this.framebufferTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.width,
      this.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.framebufferTexture,
      0
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram | null {
    const { gl } = this;

    const createShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return program;
  }

  /**
   * Upload a texture source with Y-axis flip.
   * Used for VideoFrame, Canvas, and ImageBitmap sources which have
   * top-left origin and need flipping for WebGL's bottom-left coordinate system.
   */
  private uploadTextureWithFlip(
    texture: WebGLTexture | null,
    source: TexImageSource
  ): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  /**
   * Composite multiple layers and return a VideoFrame.
   * Layers should be sorted by track index (lowest = bottom).
   * Does NOT close input frames - caller is responsible.
   *
   * @param layers - Array of layers to composite (sorted by z-index)
   * @param timestampUs - Timestamp for the output VideoFrame
   * @param subtitleLayer - Optional subtitle overlay to burn in
   * @param overlays - Optional array of overlay infos to composite on top
   * @returns Composited VideoFrame
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
      // Return black frame
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // Still need to composite overlays on black background
      if (hasOverlays) {
        this.drawOverlaysOnly(overlays!);
      }
    } else if (layers.length === 1 && !subtitleLayer && !hasOverlays) {
      this.drawSingleLayer(layers[0]!);
    } else {
      this.drawMultipleLayers(layers, subtitleLayer, overlays);
    }

    gl.bindVertexArray(null);

    // Create VideoFrame from canvas
    return new VideoFrame(this.canvas, {
      timestamp: timestampUs,
    });
  }

  private drawSingleLayer(layer: ExportLayer): void {
    const { gl } = this;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.copyProgram);

    gl.activeTexture(gl.TEXTURE0);
    this.uploadTextureWithFlip(this.baseTexture, layer.frame);

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
    this.uploadTextureWithFlip(this.baseTexture, layers[0]!.frame);
    gl.uniform1i(this.copyUniforms.texture, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Blend subsequent layers
    gl.useProgram(this.blendProgram);

    for (let i = 1; i < layers.length; i++) {
      const layer = layers[i]!;
      const opacity = layer.opacity;
      const isLastVideoLayer = i === layers.length - 1;

      // Only output to screen if this is the last layer AND there are no subtitles or overlays
      if (isLastVideoLayer && !hasSubtitles && !hasOverlays) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
      gl.uniform1i(this.blendUniforms.baseTexture, 0);

      gl.activeTexture(gl.TEXTURE1);
      this.uploadTextureWithFlip(this.overlayTexture, layer.frame);
      gl.uniform1i(this.blendUniforms.overlayTexture, 1);

      gl.uniform1f(this.blendUniforms.opacity, opacity);
      gl.uniform1i(this.blendUniforms.hasOverlay, 1);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (!isLastVideoLayer || hasSubtitles || hasOverlays) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.framebuffer);
        gl.blitFramebuffer(
          0,
          0,
          this.width,
          this.height,
          0,
          0,
          this.width,
          this.height,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      }
    }

    // Draw subtitle overlay
    if (hasSubtitles) {
      // Determine if this is the final layer
      const isLastLayer = !hasOverlays;

      if (isLastLayer) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
      gl.uniform1i(this.blendUniforms.baseTexture, 0);

      gl.activeTexture(gl.TEXTURE1);
      this.uploadTextureWithFlip(this.subtitleTexture, subtitleLayer.canvas);
      gl.uniform1i(this.blendUniforms.overlayTexture, 1);

      gl.uniform1f(this.blendUniforms.opacity, 1.0);
      gl.uniform1i(this.blendUniforms.hasOverlay, 1);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (!isLastLayer) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.framebuffer);
        gl.blitFramebuffer(
          0,
          0,
          this.width,
          this.height,
          0,
          0,
          this.width,
          this.height,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      }
    }

    // Draw HTML overlays on top of everything
    if (hasOverlays) {
      for (let i = 0; i < overlays!.length; i++) {
        const overlay = overlays![i]!;
        const isLastOverlay = i === overlays!.length - 1;

        if (isLastOverlay) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }

        // Render overlay bitmap to positioned canvas
        const overlayCanvas = this.renderOverlayToCanvas(overlay.bitmap, overlay.position);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
        gl.uniform1i(this.blendUniforms.baseTexture, 0);

        gl.activeTexture(gl.TEXTURE1);
        this.uploadTextureWithFlip(this.overlayBitmapTexture, overlayCanvas);
        gl.uniform1i(this.blendUniforms.overlayTexture, 1);

        gl.uniform1f(this.blendUniforms.opacity, overlay.opacity);
        gl.uniform1i(this.blendUniforms.hasOverlay, 1);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        if (!isLastOverlay) {
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.framebuffer);
          gl.blitFramebuffer(
            0,
            0,
            this.width,
            this.height,
            0,
            0,
            this.width,
            this.height,
            gl.COLOR_BUFFER_BIT,
            gl.NEAREST
          );
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        }
      }
    }
  }

  /**
   * Draw overlays only (for export with no video layers).
   * Assumes the canvas has already been cleared to black.
   */
  private drawOverlaysOnly(overlays: OverlayInfo[]): void {
    const { gl } = this;

    gl.useProgram(this.blendProgram);

    for (let i = 0; i < overlays.length; i++) {
      const overlay = overlays[i]!;

      // Render overlay bitmap to positioned canvas
      const overlayCanvas = this.renderOverlayToCanvas(overlay.bitmap, overlay.position);

      // For first overlay, we blend onto the black canvas
      // For subsequent overlays, we blend onto the previous result
      if (i === 0) {
        // First overlay - blend directly onto screen
        gl.activeTexture(gl.TEXTURE0);
        // Create a black base texture
        const blackCanvas = new OffscreenCanvas(this.width, this.height);
        const blackCtx = blackCanvas.getContext('2d')!;
        blackCtx.fillStyle = 'black';
        blackCtx.fillRect(0, 0, this.width, this.height);
        this.uploadTextureWithFlip(this.baseTexture, blackCanvas);
        gl.uniform1i(this.blendUniforms.baseTexture, 0);
      } else {
        // Subsequent overlays - read back from screen
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.framebuffer);
        gl.blitFramebuffer(
          0,
          0,
          this.width,
          this.height,
          0,
          0,
          this.width,
          this.height,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
        gl.uniform1i(this.blendUniforms.baseTexture, 0);
      }

      gl.activeTexture(gl.TEXTURE1);
      this.uploadTextureWithFlip(this.overlayBitmapTexture, overlayCanvas);
      gl.uniform1i(this.blendUniforms.overlayTexture, 1);

      gl.uniform1f(this.blendUniforms.opacity, overlay.opacity);
      gl.uniform1i(this.blendUniforms.hasOverlay, 1);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  /**
   * Render an overlay bitmap to a positioned canvas.
   * The bitmap is drawn at the correct position based on percentage coordinates.
   */
  private renderOverlayToCanvas(
    bitmap: ImageBitmap,
    position: OverlayPosition
  ): OffscreenCanvas {
    const canvas = new OffscreenCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d')!;

    // Clear canvas (transparent)
    ctx.clearRect(0, 0, this.width, this.height);

    // Calculate center position (percentages to pixels)
    const centerX = (position.xPercent / 100) * this.width;
    const centerY = (position.yPercent / 100) * this.height;

    // Draw centered (matching HtmlOverlay.tsx transform: translate(-50%, -50%))
    const drawX = centerX - bitmap.width / 2;
    const drawY = centerY - bitmap.height / 2;

    ctx.drawImage(bitmap, drawX, drawY);

    return canvas;
  }

  /**
   * Clear the canvas to black.
   */
  clear(): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * Dispose of WebGL resources.
   */
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
