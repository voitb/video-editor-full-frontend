/**
 * Video Editor V2 - Compositor
 * WebGL-based compositor for blending multiple video layers.
 */

import type { ActiveClip } from '../core/types';
import { createLogger } from '../utils/logger';

const logger = createLogger('Compositor');

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

export interface CompositorLayer {
  frame: VideoFrame;
  clip: ActiveClip;
}

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

  private blendUniforms = {
    baseTexture: null as WebGLUniformLocation | null,
    overlayTexture: null as WebGLUniformLocation | null,
    opacity: null as WebGLUniformLocation | null,
    hasOverlay: null as WebGLUniformLocation | null,
  };

  private copyUniforms = {
    texture: null as WebGLUniformLocation | null,
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
    this.createFramebuffer();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private createGeometry(): void {
    const { gl } = this;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Positions (fullscreen quad)
    const positions = new Float32Array([
      -1, -1, 1, -1, -1, 1, 1, 1,
    ]);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(this.blendProgram!, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Texture coordinates (flip Y)
    const texCoords = new Float32Array([
      0, 1, 1, 1, 0, 0, 1, 0,
    ]);

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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.framebufferTexture, 0);

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
        logger.error('Shader compile error', { error: gl.getShaderInfoLog(shader) });
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
      logger.error('Program link error', { error: gl.getProgramInfoLog(program) });
      gl.deleteProgram(program);
      return null;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return program;
  }

  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;

    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.viewport(0, 0, width, height);
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
    gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.frame);

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
    gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layers[0]!.frame);
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
      gl.bindTexture(gl.TEXTURE_2D, this.overlayTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.frame);
      gl.uniform1i(this.blendUniforms.overlayTexture, 1);

      gl.uniform1f(this.blendUniforms.opacity, opacity);
      gl.uniform1i(this.blendUniforms.hasOverlay, 1);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (i < layers.length - 1) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.framebuffer);
        gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
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
