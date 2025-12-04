/**
 * Shader Program
 * Handles WebGL shader compilation and program linking.
 */

import { createLogger } from '../../utils/logger';

const logger = createLogger('ShaderProgram');

/**
 * Compile a shader from source
 */
function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader | null {
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
}

/**
 * Create a shader program from vertex and fragment shader sources
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string
): WebGLProgram | null {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
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

  // Clean up individual shaders after linking
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  return program;
}
