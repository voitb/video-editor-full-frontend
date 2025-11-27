export class WebGLRenderer {
  private canvas: OffscreenCanvas;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;

  constructor(canvas: OffscreenCanvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    // Vertex shader - simple pass-through
    const vsSource = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0, 1);
        v_texCoord = a_texCoord;
      }`;

    // Fragment shader - sample texture
    const fsSource = `#version 300 es
      precision mediump float;
      uniform sampler2D u_image;
      in vec2 v_texCoord;
      out vec4 outColor;
      void main() {
        outColor = texture(u_image, v_texCoord);
      }`;

    this.program = this.createProgram(gl, vsSource, fsSource);
    this.texture = gl.createTexture()!;

    // Configure texture
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Setup geometry (fullscreen quad)
    // Each vertex: x, y, u, v
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1, 0, 1,  // bottom-left
         1, -1, 1, 1,  // bottom-right
        -1,  1, 0, 0,  // top-left
        -1,  1, 0, 0,  // top-left
         1, -1, 1, 1,  // bottom-right
         1,  1, 1, 0,  // top-right
      ]),
      gl.STATIC_DRAW
    );

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const positionLoc = gl.getAttribLocation(this.program, 'a_position');
    const texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');

    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);
  }

  draw(frame: VideoFrame): void {
    try {
      const { gl } = this;

      // Clear to black first (for letterboxing)
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Calculate aspect ratio preserving viewport
      const canvasAspect = this.canvas.width / this.canvas.height;
      const videoAspect = frame.displayWidth / frame.displayHeight;

      let viewportX = 0;
      let viewportY = 0;
      let viewportWidth = this.canvas.width;
      let viewportHeight = this.canvas.height;

      if (videoAspect > canvasAspect) {
        // Video is wider - letterbox (black bars top/bottom)
        viewportHeight = this.canvas.width / videoAspect;
        viewportY = (this.canvas.height - viewportHeight) / 2;
      } else {
        // Video is taller - pillarbox (black bars left/right)
        viewportWidth = this.canvas.height * videoAspect;
        viewportX = (this.canvas.width - viewportWidth) / 2;
      }

      gl.viewport(viewportX, viewportY, viewportWidth, viewportHeight);
      gl.useProgram(this.program);

      // Upload texture from VideoFrame (zero-copy on GPU if possible)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      const err = gl.getError();
      if (err !== gl.NO_ERROR) {
        console.error('[Renderer] WebGL error:', err);
      }
    } catch (e) {
      console.error('[Renderer] Draw error:', e);
    }
  }

  clear(): void {
    const { gl } = this;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private createProgram(
    gl: WebGL2RenderingContext,
    vsSource: string,
    fsSource: string
  ): WebGLProgram {
    const program = gl.createProgram()!;

    const createShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
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
      console.error('Program link error:', gl.getProgramInfoLog(program));
      throw new Error('Failed to link program');
    }

    return program;
  }
}
