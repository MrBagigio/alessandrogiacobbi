/**
 * tail-shaders.js — GLSL for the tail's skinned "two-ink" look.
 *
 * ONE vertex/fragment pair, two materials:
 *   fill  : FrontSide, 2-tone paper shading + bind-space hatching + weight bloom
 *   hull  : BackSide + #define OUTLINE, inverted-hull ink outline
 *
 * Skinning uses Three's own chunks; the renderer binds boneTexture etc. because
 * the mesh is a SkinnedMesh (verified in the r160 spike). Volume-preserve under
 * stretch is done here (yz *= 1/√s) in BIND space, so no bone scaling → no shear.
 */

export const TAIL_VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
uniform float uStretch;      // 1..1.12
uniform float uHullPx;       // outline thickness in css px (view units); 0 for fill
uniform float uScale;        // root scale: bind units → view/css px
uniform float uBone;         // hovered joint index, -1 = none
uniform vec3  uLightDir;     // view space, normalised
varying vec3  vRest;         // bind-space position → hatching "engraved" in the skin
varying float vNdl;
varying float vW;            // skin weight of uBone on this vertex

void main() {
  vRest = position;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  transformed.yz *= inversesqrt(uStretch);
  #include <skinning_vertex>
  #ifdef OUTLINE
    // Inverted hull, done in VIEW space after skinning: expand along the
    // view-projected normal (xy only, z untouched). Expanding in 3D pushed the
    // back faces of the tube TOWARD the camera on the inside of the coil, so
    // the hull won the depth test over the neighbouring turn's fill and the
    // whole distal half rendered as solid ink (measured). In screen-plane the
    // hull is a pure silhouette thickener and can never occlude the fill.
    // uHullPx and uScale are both in VIEW units (css px): view = bind * uScale.
    vec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);
    vec3 nView = normalize(normalMatrix * objectNormal);
    float localRpx = length(position.yz) * uScale;
    float off = min(uHullPx, localRpx * 0.35);
    mvPos.xy += normalize(nView.xy + vec2(1e-5)) * off;
    gl_Position = projectionMatrix * mvPos;
  #else
    #include <project_vertex>
  #endif
  vNdl = dot(normalize(normalMatrix * objectNormal), uLightDir);
  vec4 hit = vec4(lessThan(abs(skinIndex - vec4(uBone)), vec4(0.5)));
  vW = dot(skinWeight, hit);
}
`;

export const TAIL_FRAG = /* glsl */`
uniform vec3  uPaper2, uPaper3, uInk, uOx;
uniform float uBloom;        // 0..1 eased
uniform float uHatch;        // 1 on / 0 off
uniform float uHatchPeriod;  // bind units
varying vec3  vRest; varying float vNdl; varying float vW;

void main() {
  #ifdef OUTLINE
    gl_FragColor = vec4(uInk, 0.92);
    return;
  #endif
  // Interior of the tube (back faces, DoubleSide): flat deep shade, no hatch.
  if (!gl_FrontFacing) { gl_FragColor = vec4(mix(uPaper3, uInk, 0.35), 1.0); return; }
  // lit side = paper2, shadow side = paper3; soft terminator = ink wash.
  float lit = smoothstep(0.18, 0.42, vNdl);
  vec3 col = mix(uPaper3, uPaper2, lit);
  // oblique hatching engraved in the skin (bind space) — only in the shadow
  // half, and fading out toward the terminator so it feels drawn, not printed
  float t = (vRest.x + 0.7071 * (vRest.y + vRest.z)) / uHatchPeriod;
  float f = abs(fract(t) - 0.5);
  float w = fwidth(t) * 0.75;
  float line = 1.0 - smoothstep(0.10, 0.10 + w, f);
  float shadow = 1.0 - smoothstep(-0.10, 0.30, vNdl);
  col = mix(col, uInk, line * shadow * 0.38 * uHatch);
  // weight bloom on hover (Paint Skin Weights)
  col = mix(col, uOx, vW * uBloom * 0.55);
  gl_FragColor = vec4(col, 1.0);
}
`;
