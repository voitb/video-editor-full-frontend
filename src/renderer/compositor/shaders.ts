/**
 * WebGL Shaders for Compositing
 * Shared shader source code for both playback and export compositing.
 */

/** Vertex shader - fullscreen quad with texture coordinates */
export const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

/** Blend fragment shader - blends overlay onto base with opacity */
export const BLEND_FRAGMENT_SHADER = `#version 300 es
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

/** Copy fragment shader - simple texture copy */
export const COPY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  fragColor = texture(u_texture, v_texCoord);
}`;
