/**
 * WebGL Geometry
 * Creates fullscreen quad geometry for compositing.
 */

/**
 * Create fullscreen quad geometry with VAO
 */
export function createGeometry(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): WebGLVertexArrayObject | null {
  const vao = gl.createVertexArray();
  if (!vao) return null;

  gl.bindVertexArray(vao);

  // Positions (fullscreen quad)
  const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // Texture coordinates (Y-flip happens at upload time)
  const texCoords = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

  const texBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

  const texLoc = gl.getAttribLocation(program, 'a_texCoord');
  gl.enableVertexAttribArray(texLoc);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);

  return vao;
}
