// ============================================================================
// VIDEO COMPOSITOR
// ============================================================================
// WebGL-based compositor for blending multiple video frames together.
// Supports alpha blending for overlay clips on the timeline.

import type { ActiveClip } from '../types/editor';

// Vertex shader - simple pass-through for a full-screen quad
const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// Fragment shader - blends base and overlay with opacity
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
    // Alpha blending: result = overlay * opacity + base * (1 - opacity * overlayAlpha)
    float alpha = overlayColor.a * u_opacity;
    fragColor = vec4(
      overlayColor.rgb * alpha + baseColor.rgb * (1.0 - alpha),
      max(baseColor.a, alpha)
    );
  } else {
    fragColor = baseColor;
  }
}
`;

// Simple copy shader for single frame rendering
const COPY_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  fragColor = texture(u_texture, v_texCoord);
}
`;

interface CompositorLayer {
  frame: VideoFrame;
  clip: ActiveClip;
}

export class Compositor {
  private gl: WebGL2RenderingContext;
  private canvas: OffscreenCanvas;
  private width: number;
  private height: number;

  // Shaders and programs
  private blendProgram: WebGLProgram | null = null;
  private copyProgram: WebGLProgram | null = null;

  // Geometry buffers
  private vao: WebGLVertexArrayObject | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;

  // Textures
  private baseTexture: WebGLTexture | null = null;
  private overlayTexture: WebGLTexture | null = null;

  // Framebuffer for multi-pass rendering
  private framebuffer: WebGLFramebuffer | null = null;
  private framebufferTexture: WebGLTexture | null = null;

  // Uniform locations (blend program)
  private blendUniforms: {
    baseTexture: WebGLUniformLocation | null;
    overlayTexture: WebGLUniformLocation | null;
    opacity: WebGLUniformLocation | null;
    hasOverlay: WebGLUniformLocation | null;
  } = { baseTexture: null, overlayTexture: null, opacity: null, hasOverlay: null };

  // Uniform locations (copy program)
  private copyUniforms: {
    texture: WebGLUniformLocation | null;
  } = { texture: null };

  constructor(canvas: OffscreenCanvas) {
    this.canvas = canvas;
    this.width = canvas.width;
    this.height = canvas.height;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      throw new Error('WebGL2 not supported');
    }

    this.gl = gl;
    this.initialize();
  }

  private initialize(): void {
    const gl = this.gl;

    // Create shader programs
    this.blendProgram = this.createProgram(VERTEX_SHADER, BLEND_FRAGMENT_SHADER);
    this.copyProgram = this.createProgram(VERTEX_SHADER, COPY_FRAGMENT_SHADER);

    if (!this.blendProgram || !this.copyProgram) {
      throw new Error('Failed to create shader programs');
    }

    // Get uniform locations for blend program
    this.blendUniforms = {
      baseTexture: gl.getUniformLocation(this.blendProgram, 'u_baseTexture'),
      overlayTexture: gl.getUniformLocation(this.blendProgram, 'u_overlayTexture'),
      opacity: gl.getUniformLocation(this.blendProgram, 'u_opacity'),
      hasOverlay: gl.getUniformLocation(this.blendProgram, 'u_hasOverlay'),
    };

    // Get uniform locations for copy program
    this.copyUniforms = {
      texture: gl.getUniformLocation(this.copyProgram, 'u_texture'),
    };

    // Create geometry (full-screen quad)
    this.createGeometry();

    // Create textures
    this.baseTexture = this.createTexture();
    this.overlayTexture = this.createTexture();

    // Create framebuffer for intermediate results
    this.createFramebuffer();

    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private createShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
    const gl = this.gl;

    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    // Clean up shaders (they're linked to program now)
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return program;
  }

  private createGeometry(): void {
    const gl = this.gl;

    // Create VAO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Position buffer (full-screen quad in clip space)
    const positions = new Float32Array([
      -1, -1,  // bottom-left
       1, -1,  // bottom-right
      -1,  1,  // top-left
       1,  1,  // top-right
    ]);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(this.blendProgram!, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Texture coordinate buffer (flip Y for video frames)
    const texCoords = new Float32Array([
      0, 1,  // bottom-left
      1, 1,  // bottom-right
      0, 0,  // top-left
      1, 0,  // top-right
    ]);

    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    const texCoordLoc = gl.getAttribLocation(this.blendProgram!, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  private createTexture(): WebGLTexture | null {
    const gl = this.gl;
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
    const gl = this.gl;

    // Create framebuffer texture
    this.framebufferTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      this.width, this.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create framebuffer
    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D, this.framebufferTexture, 0
    );

    // Check framebuffer completeness
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('Framebuffer is not complete');
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Resize the compositor canvas and framebuffer
   */
  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;

    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    // Recreate framebuffer texture at new size
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      width, height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null
    );

    gl.viewport(0, 0, width, height);
  }

  /**
   * Composite multiple layers into a single frame.
   * Layers should be sorted by trackIndex (lowest first = bottom layer).
   */
  composite(layers: CompositorLayer[]): void {
    if (layers.length === 0) return;

    const gl = this.gl;
    gl.viewport(0, 0, this.width, this.height);
    gl.bindVertexArray(this.vao);

    if (layers.length === 1) {
      // Single layer - just copy to canvas
      this.drawSingleLayer(layers[0]);
    } else {
      // Multiple layers - composite from bottom to top
      this.drawMultipleLayers(layers);
    }

    gl.bindVertexArray(null);
  }

  private drawSingleLayer(layer: CompositorLayer): void {
    const gl = this.gl;

    // Render directly to canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.copyProgram);

    // Upload frame to texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.frame);

    gl.uniform1i(this.copyUniforms.texture, 0);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawMultipleLayers(layers: CompositorLayer[]): void {
    const gl = this.gl;

    // Start with first layer in framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Draw first layer (base)
    gl.useProgram(this.copyProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layers[0].frame);
    gl.uniform1i(this.copyUniforms.texture, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Blend subsequent layers
    gl.useProgram(this.blendProgram);

    for (let i = 1; i < layers.length; i++) {
      const layer = layers[i];
      const opacity = layer.clip.opacity ?? 1;

      // Swap: framebuffer texture becomes base, layer frame becomes overlay
      // For simplicity, we'll ping-pong between framebuffer and canvas

      if (i === layers.length - 1) {
        // Last layer - render to canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      // Set base texture (previous composite result)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
      gl.uniform1i(this.blendUniforms.baseTexture, 0);

      // Set overlay texture (current layer frame)
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.overlayTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.frame);
      gl.uniform1i(this.blendUniforms.overlayTexture, 1);

      // Set uniforms
      gl.uniform1f(this.blendUniforms.opacity, opacity);
      gl.uniform1i(this.blendUniforms.hasOverlay, 1);

      // Draw blend
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // If not last layer, copy result back to framebuffer texture
      if (i < layers.length - 1) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.framebuffer);
        gl.blitFramebuffer(
          0, 0, this.width, this.height,
          0, 0, this.width, this.height,
          gl.COLOR_BUFFER_BIT, gl.NEAREST
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      }
    }
  }

  /**
   * Draw a single frame without compositing (for backward compatibility)
   */
  draw(frame: VideoFrame): void {
    this.composite([{ frame, clip: { sourceId: '', clipId: '', trackIndex: 0, startTimeUs: 0, sourceStartUs: 0, sourceEndUs: 0 } }]);
  }

  /**
   * Clean up WebGL resources
   */
  dispose(): void {
    const gl = this.gl;

    if (this.blendProgram) gl.deleteProgram(this.blendProgram);
    if (this.copyProgram) gl.deleteProgram(this.copyProgram);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
    if (this.baseTexture) gl.deleteTexture(this.baseTexture);
    if (this.overlayTexture) gl.deleteTexture(this.overlayTexture);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    if (this.framebufferTexture) gl.deleteTexture(this.framebufferTexture);
  }
}
