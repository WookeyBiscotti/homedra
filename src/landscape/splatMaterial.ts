import * as THREE from 'three'

export const LAYER_FALLBACK_HEX = ['#6f8a3d', '#6b3d24', '#d2b36a', '#8d8d8b'] as const

export const LAYER_FALLBACK = LAYER_FALLBACK_HEX.map((hex) => new THREE.Color(hex))

export const emptySplatMap = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
)
emptySplatMap.needsUpdate = true

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
    uHas: { value: new THREE.Vector4(0, 0, 0, 0) },
    uOrigin: { value: new THREE.Vector2(0, 0) },
    uSize: { value: 40 },
    uTile: { value: new THREE.Vector4(0.25, 0.25, 0.25, 0.25) },
    uC0: { value: LAYER_FALLBACK[0].clone() },
    uC1: { value: LAYER_FALLBACK[1].clone() },
    uC2: { value: LAYER_FALLBACK[2].clone() },
    uC3: { value: LAYER_FALLBACK[3].clone() },
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
uniform vec4 uHas;
uniform vec2 uOrigin;
uniform float uSize;
uniform vec4 uTile;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;`

const MAP = `{
  vec2 plan = vec2(vSplatWorld.x, -vSplatWorld.z);
  vec2 suv = (plan - uOrigin) / max(uSize, 0.001) + 0.5;
  vec4 sp = texture2D(uSplat, clamp(suv, 0.0, 1.0));
  float w1 = sp.r;
  float w2 = sp.g;
  float w3 = sp.b;
  float w0 = max(0.0, 1.0 - w1 - w2 - w3);
  vec3 c0 = uHas.x > 0.5 ? texture2D(uL0, plan * uTile.x).rgb : uC0;
  vec3 c1 = uHas.y > 0.5 ? texture2D(uL1, plan * uTile.y).rgb : uC1;
  vec3 c2 = uHas.z > 0.5 ? texture2D(uL2, plan * uTile.z).rgb : uC2;
  vec3 c3 = uHas.w > 0.5 ? texture2D(uL3, plan * uTile.w).rgb : uC3;
  diffuseColor.rgb = c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3;
}`

export function bindSplatShader(
  mat: THREE.MeshStandardMaterial,
  uniforms: SplatUniforms,
): void {
  mat.customProgramCacheKey = () => 'ground-splat-v3'
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSplat = uniforms.uSplat
    shader.uniforms.uL0 = uniforms.uL0
    shader.uniforms.uL1 = uniforms.uL1
    shader.uniforms.uL2 = uniforms.uL2
    shader.uniforms.uL3 = uniforms.uL3
    shader.uniforms.uHas = uniforms.uHas
    shader.uniforms.uOrigin = uniforms.uOrigin
    shader.uniforms.uSize = uniforms.uSize
    shader.uniforms.uTile = uniforms.uTile
    shader.uniforms.uC0 = uniforms.uC0
    shader.uniforms.uC1 = uniforms.uC1
    shader.uniforms.uC2 = uniforms.uC2
    shader.uniforms.uC3 = uniforms.uC3
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX)
      .replace('#include <begin_vertex>', BEGIN)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAG_COMMON)
      .replace('#include <map_fragment>', MAP)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${MAP}`)
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
