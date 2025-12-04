/**
 * Texture Manager
 * Handles WebGL texture creation and uploading.
 */

/**
 * Create a new texture with standard parameters
 */
export function createTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return texture;
}

/**
 * Upload a texture source with Y-axis flip.
 * Used for VideoFrame, Canvas, and ImageBitmap sources which have
 * top-left origin and need flipping for WebGL's bottom-left coordinate system.
 */
export function uploadTextureWithFlip(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture | null,
  source: TexImageSource
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
}

/**
 * Upload a texture source without Y-axis flip.
 * Use when the texture coordinates handle the flip.
 */
export function uploadTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture | null,
  source: TexImageSource
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}
