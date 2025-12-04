/**
 * Video Editor V2 - WebGL Renderer
 * Renders VideoFrames to an OffscreenCanvas using WebGL2.
 */

import { createLogger } from '../utils/logger';

const logger = createLogger('WebGLRenderer');

// Vertex shader - pass-through for fullscreen quad
const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

// Fragment shader - sample texture
const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform sampler2D u_texture;
in vec2 v_texCoord;
out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_texCoord);
}`;

export class WebGLRenderer {
  private canvas: OffscreenCanvas;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private contextLost = false;

  constructor(canvas: OffscreenCanvas) {
    this.canvas = canvas;
    // OPTIMIZATION: Configure WebGL context for video rendering performance
    const gl = canvas.getContext('webgl2', {
      alpha: false,               // Video doesn't need alpha channel
      antialias: false,           // Not needed for video frames
      powerPreference: 'high-performance', // Prioritize speed over power
      desynchronized: true,       // Allow non-vsync updates for lower latency
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    // Handle context loss/restore
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      logger.warn('WebGL context lost');
    });

    canvas.addEventListener('webglcontextrestored', () => {
      logger.info('WebGL context restored');
      this.contextLost = false;
      this.initialize();
    });

    this.initialize();
  }

  private initialize(): void {
    const { gl } = this;

    this.program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    this.texture = gl.createTexture()!;

    // Configure texture
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Setup geometry (fullscreen quad with interleaved position + texcoord)
    const vertices = new Float32Array([
      // x, y, u, v
      -1, -1, 0, 1,  // bottom-left
       1, -1, 1, 1,  // bottom-right
      -1,  1, 0, 0,  // top-left
      -1,  1, 0, 0,  // top-left
       1, -1, 1, 1,  // bottom-right
       1,  1, 1, 0,  // top-right
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    const STRIDE = 16; // 4 floats * 4 bytes
    const posLoc = gl.getAttribLocation(this.program, 'a_position');
    const texLoc = gl.getAttribLocation(this.program, 'a_texCoord');

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, STRIDE, 8);

    gl.bindVertexArray(null);
  }

  /**
   * Draw a VideoFrame to the canvas.
   * Takes ownership of the frame and closes it.
   */
  draw(frame: VideoFrame): void {
    try {
      if (this.contextLost || !this.program || !this.vao || !this.texture) {
        return;
      }

      const { gl, program, vao, texture } = this;

      // Clear to black
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Calculate letterbox/pillarbox viewport
      const canvasAspect = this.canvas.width / this.canvas.height;
      const videoAspect = frame.displayWidth / frame.displayHeight;

      let viewportX = 0;
      let viewportY = 0;
      let viewportWidth = this.canvas.width;
      let viewportHeight = this.canvas.height;

      if (videoAspect > canvasAspect) {
        viewportHeight = this.canvas.width / videoAspect;
        viewportY = (this.canvas.height - viewportHeight) / 2;
      } else {
        viewportWidth = this.canvas.height * videoAspect;
        viewportX = (this.canvas.width - viewportWidth) / 2;
      }

      gl.viewport(viewportX, viewportY, viewportWidth, viewportHeight);
      gl.useProgram(program);
      gl.bindVertexArray(vao);

      // Upload frame to texture (zero-copy when possible)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } finally {
      frame.close();
    }
  }

  /**
   * Draw without closing the frame (for compositor use)
   */
  drawWithoutClose(frame: VideoFrame): void {
    if (this.contextLost || !this.program || !this.vao || !this.texture) {
      return;
    }

    const { gl, program, vao, texture } = this;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(program);
    gl.bindVertexArray(vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  isContextLost(): boolean {
    return this.contextLost;
  }

  clear(): void {
    const { gl } = this;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const { gl } = this;
    const program = gl.createProgram()!;

    const createShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type)!;
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

    if (!vs || !fs) throw new Error('Failed to create shaders');

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      logger.error('Program link error', { error: gl.getProgramInfoLog(program) });
      throw new Error('Failed to link program');
    }

    return program;
  }

  dispose(): void {
    const { gl } = this;
    if (this.program) gl.deleteProgram(this.program);
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.vao) gl.deleteVertexArray(this.vao);
  }
}
