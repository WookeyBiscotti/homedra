import * as THREE from 'three'
import { HEX_SIZE_M } from './hexTiling'

export const LAYER_FALLBACK_HEX = ['#6f8a3d', '#6b3d24', '#d2b36a', '#8d8d8b'] as const

export const LAYER_FALLBACK = LAYER_FALLBACK_HEX.map((hex) => new THREE.Color(hex))

export const emptySplatMap = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
)
emptySplatMap.needsUpdate = true
emptySplatMap.wrapS = THREE.RepeatWrapping
emptySplatMap.wrapT = THREE.RepeatWrapping

/** 1×1 zero weights — layer 0 remainder, so the first frame is base dirt/grass. */
export const emptyWeightMap = new THREE.DataTexture(
  new Uint8Array([0, 0, 0, 255]),
  1,
  1,
)
emptyWeightMap.needsUpdate = true
emptyWeightMap.colorSpace = THREE.NoColorSpace

export function createSplatUniforms() {
  return {
    uSplat: { value: emptyWeightMap as THREE.Texture },
    uL0: { value: emptySplatMap as THREE.Texture },
    uL1: { value: emptySplatMap as THREE.Texture },
    uL2: { value: emptySplatMap as THREE.Texture },
    uL3: { value: emptySplatMap as THREE.Texture },
    uN0: { value: emptySplatMap as THREE.Texture },
    uN1: { value: emptySplatMap as THREE.Texture },
    uN2: { value: emptySplatMap as THREE.Texture },
    uN3: { value: emptySplatMap as THREE.Texture },
    uR0: { value: emptySplatMap as THREE.Texture },
    uR1: { value: emptySplatMap as THREE.Texture },
    uR2: { value: emptySplatMap as THREE.Texture },
    uR3: { value: emptySplatMap as THREE.Texture },
    uHas: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHasN: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHasR: { value: new THREE.Vector4(0, 0, 0, 0) },
    uOrigin: { value: new THREE.Vector2(0, 0) },
    uSize: { value: new THREE.Vector2(40, 40) },
    uTile: { value: new THREE.Vector4(0.25, 0.25, 0.25, 0.25) },
    uC0: { value: LAYER_FALLBACK[0].clone() },
    uC1: { value: LAYER_FALLBACK[1].clone() },
    uC2: { value: LAYER_FALLBACK[2].clone() },
    uC3: { value: LAYER_FALLBACK[3].clone() },
    uTint0: { value: new THREE.Color('#ffffff') },
    uTint1: { value: new THREE.Color('#ffffff') },
    uTint2: { value: new THREE.Color('#ffffff') },
    uTint3: { value: new THREE.Color('#ffffff') },
    uRough: { value: new THREE.Vector4(0.95, 0.95, 0.95, 0.95) },
    uMetal: { value: new THREE.Vector4(0, 0, 0, 0) },
    uNScale: { value: new THREE.Vector4(0.85, 0.85, 0.85, 0.85) },
    uHexSize: { value: HEX_SIZE_M },
  }
}

export type SplatUniforms = ReturnType<typeof createSplatUniforms>

const VERTEX = `#include <common>
varying vec3 vSplatWorld;`

const BEGIN = `#include <begin_vertex>
vSplatWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`

const FRAG_COMMON = `#include <common>
varying vec3 vSplatWorld;
uniform sampler2D uSplat;
uniform sampler2D uL0;
uniform sampler2D uL1;
uniform sampler2D uL2;
uniform sampler2D uL3;
uniform sampler2D uN0;
uniform sampler2D uN1;
uniform sampler2D uN2;
uniform sampler2D uN3;
uniform sampler2D uR0;
uniform sampler2D uR1;
uniform sampler2D uR2;
uniform sampler2D uR3;
uniform vec4 uHas;
uniform vec4 uHasN;
uniform vec4 uHasR;
uniform vec2 uOrigin;
uniform vec2 uSize;
uniform vec4 uTile;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uTint0;
uniform vec3 uTint1;
uniform vec3 uTint2;
uniform vec3 uTint3;
uniform vec4 uRough;
uniform vec4 uMetal;
uniform vec4 uNScale;
uniform float uHexSize;
float splatW0;
float splatW1;
float splatW2;
float splatW3;
vec2 splatPlan;
vec2 hexV0;
vec2 hexV1;
vec2 hexV2;
vec3 hexW;

vec2 hexHash(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

void hexVerts(vec2 st, out vec2 v0, out vec2 v1, out vec2 v2, out vec3 w) {
  vec2 skewed = mat2(1.0, 0.0, -0.57735027, 1.15470054) * st;
  vec2 baseId = floor(skewed);
  vec3 temp = vec3(fract(skewed), 0.0);
  temp.z = 1.0 - temp.x - temp.y;
  if (temp.z > 0.0) {
    w = vec3(temp.z, temp.y, temp.x);
    v0 = baseId;
    v1 = baseId + vec2(0.0, 1.0);
    v2 = baseId + vec2(1.0, 0.0);
  } else {
    w = vec3(-temp.z, 1.0 - temp.y, 1.0 - temp.x);
    v0 = baseId + vec2(1.0, 1.0);
    v1 = baseId + vec2(1.0, 0.0);
    v2 = baseId + vec2(0.0, 1.0);
  }
  w = pow(max(w, vec3(0.0)), vec3(4.0));
  w /= max(w.x + w.y + w.z, 1e-5);
}

mat2 hexRot(vec2 vert) {
  vec2 r = hexHash(vert);
  float a = r.x * 6.2831853;
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}

vec2 hexUv(vec2 texUv, vec2 vert) {
  vec2 r = hexHash(vert);
  return hexRot(vert) * texUv + r;
}

vec3 hexSample(sampler2D tex, vec2 texUv) {
  return texture2D(tex, hexUv(texUv, hexV0)).rgb * hexW.x
    + texture2D(tex, hexUv(texUv, hexV1)).rgb * hexW.y
    + texture2D(tex, hexUv(texUv, hexV2)).rgb * hexW.z;
}

vec3 hexSampleNormal(sampler2D tex, vec2 texUv) {
  vec3 n0 = texture2D(tex, hexUv(texUv, hexV0)).xyz * 2.0 - 1.0;
  vec3 n1 = texture2D(tex, hexUv(texUv, hexV1)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tex, hexUv(texUv, hexV2)).xyz * 2.0 - 1.0;
  n0.xy = hexRot(hexV0) * n0.xy;
  n1.xy = hexRot(hexV1) * n1.xy;
  n2.xy = hexRot(hexV2) * n2.xy;
  return normalize(n0 * hexW.x + n1 * hexW.y + n2 * hexW.z);
}

vec3 splatAlbedoOf(sampler2D tex, float has, vec3 fallback, vec3 tint, float tile) {
  vec3 c = has > 0.5 ? hexSample(tex, splatPlan * tile) : fallback;
  return c * tint;
}

float splatRoughOf(sampler2D tex, float has, float scalar, float tile) {
  if (has > 0.5) return hexSample(tex, splatPlan * tile).g * scalar;
  return scalar;
}

vec3 splatNormalOf(sampler2D tex, float has, float nScale, float tile) {
  vec3 n = has > 0.5 ? hexSampleNormal(tex, splatPlan * tile) : vec3(0.0, 0.0, 1.0);
  n.xy *= nScale;
  return n;
}

mat3 splatTangentFrame(vec3 eye_pos, vec3 surf_norm, vec2 uv) {
  vec3 q0 = dFdx(eye_pos);
  vec3 q1 = dFdy(eye_pos);
  vec2 st0 = dFdx(uv);
  vec2 st1 = dFdy(uv);
  vec3 N = surf_norm;
  vec3 q1perp = cross(q1, N);
  vec3 q0perp = cross(N, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float scale = det == 0.0 ? 0.0 : inversesqrt(det);
  return mat3(T * scale, B * scale, N);
}`

const ALBEDO = `{
  splatPlan = vec2(vSplatWorld.x, -vSplatWorld.z);
  vec2 suv = (splatPlan - uOrigin) / max(uSize, vec2(0.001)) + 0.5;
  vec4 sp = texture2D(uSplat, clamp(suv, 0.0, 1.0));
  splatW1 = sp.r;
  splatW2 = sp.g;
  splatW3 = sp.b;
  splatW0 = max(0.0, 1.0 - splatW1 - splatW2 - splatW3);
  hexVerts(splatPlan / max(uHexSize, 0.01), hexV0, hexV1, hexV2, hexW);
  vec3 splatAlbedo =
    splatAlbedoOf(uL0, uHas.x, uC0, uTint0, uTile.x) * splatW0
    + splatAlbedoOf(uL1, uHas.y, uC1, uTint1, uTile.y) * splatW1
    + splatAlbedoOf(uL2, uHas.z, uC2, uTint2, uTile.z) * splatW2
    + splatAlbedoOf(uL3, uHas.w, uC3, uTint3, uTile.w) * splatW3;
  diffuseColor.rgb = splatAlbedo;
}`

const ROUGH = `{
  roughnessFactor =
    splatRoughOf(uR0, uHasR.x, uRough.x, uTile.x) * splatW0
    + splatRoughOf(uR1, uHasR.y, uRough.y, uTile.y) * splatW1
    + splatRoughOf(uR2, uHasR.z, uRough.z, uTile.z) * splatW2
    + splatRoughOf(uR3, uHasR.w, uRough.w, uTile.w) * splatW3;
}`

const METAL = `{
  metalnessFactor =
    uMetal.x * splatW0
    + uMetal.y * splatW1
    + uMetal.z * splatW2
    + uMetal.w * splatW3;
}`

const NORMAL = `{
  vec3 splatMapN = normalize(
    splatNormalOf(uN0, uHasN.x, uNScale.x, uTile.x) * splatW0
    + splatNormalOf(uN1, uHasN.y, uNScale.y, uTile.y) * splatW1
    + splatNormalOf(uN2, uHasN.z, uNScale.z, uTile.z) * splatW2
    + splatNormalOf(uN3, uHasN.w, uNScale.w, uTile.w) * splatW3
  );
  mat3 splatTbn = splatTangentFrame(-vViewPosition, nonPerturbedNormal, splatPlan);
  splatTbn[0] *= faceDirection;
  splatTbn[1] *= faceDirection;
  normal = normalize(splatTbn * splatMapN);
}`

export function bindSplatShader(
  mat: THREE.MeshStandardMaterial,
  uniforms: SplatUniforms,
): void {
  mat.customProgramCacheKey = () => 'ground-splat-pbr-hex-v1'
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX)
      .replace('#include <begin_vertex>', BEGIN)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAG_COMMON)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${ALBEDO}`)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\n${ROUGH}`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>\n${METAL}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>\n${NORMAL}`,
      )
  }
  mat.needsUpdate = true
}

export function makeSplatTexture(res: number, data: Uint8Array): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(data), res, res, THREE.RGBAFormat)
  t.flipY = false
  t.colorSpace = THREE.NoColorSpace
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearFilter
  t.wrapS = THREE.ClampToEdgeWrapping
  t.wrapT = THREE.ClampToEdgeWrapping
  t.needsUpdate = true
  return t
}

export function writeSplatTexture(tex: THREE.DataTexture, data: Uint8Array): void {
  const img = tex.image as { data: Uint8Array; width: number; height: number }
  if (img.data.length === data.length) img.data.set(data)
  else tex.image = { data, width: img.width, height: img.height }
  tex.needsUpdate = true
}
