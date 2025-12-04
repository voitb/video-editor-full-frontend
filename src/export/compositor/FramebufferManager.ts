/**
 * Framebuffer Manager
 * Handles WebGL framebuffer creation and management.
 */

export interface FramebufferResult {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
}

/**
 * Create a framebuffer with attached texture for render-to-texture
 */
export function createFramebuffer(
  gl: WebGL2RenderingContext,
  width: number,
  height: number
): FramebufferResult | null {
  const texture = gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) {
    gl.deleteTexture(texture);
    return null;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { framebuffer, texture };
}

/**
 * Blit framebuffer contents between read and draw targets
 */
export function blitFramebuffer(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  readTarget: WebGLFramebuffer | null,
  drawTarget: WebGLFramebuffer | null
): void {
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readTarget);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawTarget);
  gl.blitFramebuffer(
    0,
    0,
    width,
    height,
    0,
    0,
    width,
    height,
    gl.COLOR_BUFFER_BIT,
    gl.NEAREST
  );
}
