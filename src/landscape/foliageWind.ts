import * as THREE from 'three'

/** Shared across every foliage program so one tick drives the grove. */
export const foliageWindUniforms = {
  uTime: { value: 0 },
  uWindAmp: { value: 0.11 },
  uWindDir: { value: new THREE.Vector2(1, 0.28) },
}

const VERTEX_COMMON = `#include <common>
uniform float uTime;
uniform float uWindAmp;
uniform vec2 uWindDir;`

const FOLIAGE_BEND = `#include <begin_vertex>
{
  vec3 worldP = (modelMatrix * vec4(transformed, 1.0)).xyz;
#ifdef USE_UV
  float tip = uv.y * uv.y;
#else
  float tip = clamp(position.y * 3.0 + 0.5, 0.0, 1.0);
#endif
  float phase = worldP.x * 0.21 + worldP.z * 0.17 + worldP.y * 0.35;
  float gust = sin(uTime * 0.82 + phase);
  float flutter = sin(uTime * 7.6 + phase * 3.4) * cos(uTime * 5.2 + phase * 1.7);
  float wave = (0.72 * gust + 0.28 * flutter) * tip * uWindAmp;
  transformed.x += (uWindDir.x * 0.55 + 0.45) * wave;
  transformed.z += (uWindDir.y * 0.55 + flutter * 0.2) * wave;
  transformed.y += flutter * tip * uWindAmp * 0.28;
}`

export function applyFoliageWind(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  mat.userData.foliageWind = true
  mat.customProgramCacheKey = () => 'foliage-wind-v1'
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = foliageWindUniforms.uTime
    shader.uniforms.uWindAmp = foliageWindUniforms.uWindAmp
    shader.uniforms.uWindDir = foliageWindUniforms.uWindDir
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_COMMON)
      .replace('#include <begin_vertex>', FOLIAGE_BEND)
  }
  return mat
}

/** Advance the shared wind clock. `strength` 0 freezes, 1 is the outdoor default. */
export function tickFoliageWind(time: number, strength = 1): void {
  const live = Math.max(0, strength)
  const gust = 0.78 + 0.22 * Math.sin(time * 0.21) + 0.1 * Math.sin(time * 0.53)
  foliageWindUniforms.uTime.value = time
  foliageWindUniforms.uWindAmp.value = 0.2 * live * gust
  const heading = 0.18 * Math.sin(time * 0.06)
  foliageWindUniforms.uWindDir.value.set(Math.cos(heading), Math.sin(heading) * 0.65 + 0.28)
}
