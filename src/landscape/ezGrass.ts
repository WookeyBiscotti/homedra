/**
 * EZ-Tree demo grass (src/app/grass.js) — GLB tuft + instanced wind.
 * The npm package only ships Tree; this ports the demo meadow renderer.
 */
import * as THREE from 'three'
import { publicUrl } from '../publicUrl'

export const EZ_GRASS_GLB_URL = publicUrl('models/landscape/grass.glb')

/** GrassOptions from EZ-Tree src/app/grass.js. */
export const EZ_GRASS_WIND = {
  strength: { x: 0.3, y: 0, z: 0.3 },
  frequency: 1,
  /** Demo uses 400 on a ~500-unit field; plots are tens of metres. */
  scale: 24,
  alphaTest: 0.5,
  roughness: 1,
} as const

const windMaterials = new Set<THREE.MeshStandardMaterial>()

/** Simplex from EZ-Tree grass.js — unique names, GLSL ES has no overloads. */
const SIMPLEX_GLSL = `
vec3 ezMod289_3(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec2 ezMod289_2(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec3 ezPermute(vec3 x) {
  return ezMod289_3(((x * 34.0) + 1.0) * x);
}
float ezSimplex2d(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = ezMod289_2(i);
  vec3 p = ezPermute(ezPermute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`

const WIND_BEGIN = `#include <begin_vertex>
{
#ifdef USE_INSTANCING
  vec3 ezWorld = (instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vec3 ezWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
  float windOffset = 2.0 * 3.14 * ezSimplex2d(ezWorld.xz / uWindScale);
  transformed += position.y * uWindStrength *
    sin(uTime * uWindFrequency + windOffset) *
    cos(uTime * 1.4 * uWindFrequency + windOffset);
}
`

export function unitHeightGrassGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone()
  g.computeBoundingBox()
  const box = g.boundingBox
  if (!box) return g
  const h = box.max.y - box.min.y
  const cx = (box.max.x + box.min.x) * 0.5
  const cz = (box.max.z + box.min.z) * 0.5
  g.translate(-cx, -box.min.y, -cz)
  if (h > 1e-6) g.scale(1 / h, 1 / h, 1 / h)
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

export function findGrassMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null
  root.traverse((obj) => {
    if (found) return
    if ((obj as THREE.Mesh).isMesh) found = obj as THREE.Mesh
  })
  return found
}

export type EzGrassTuft = {
  geometry: THREE.BufferGeometry
  map: THREE.Texture | null
}

export function prepareEzGrassTuft(root: THREE.Object3D): EzGrassTuft | null {
  const mesh = findGrassMesh(root)
  if (!mesh) return null
  const mat = mesh.material
  const src = Array.isArray(mat) ? mat[0] : mat
  const map =
    src && 'map' in src ? ((src as THREE.MeshStandardMaterial).map ?? null) : null
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 4
    map.needsUpdate = true
  }
  return { geometry: unitHeightGrassGeometry(mesh.geometry), map }
}

export function applyEzGrassWind(
  mat: THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial {
  mat.userData.ezGrassWind = true
  mat.customProgramCacheKey = () => 'ez-grass-wind-v2'
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.uniforms.uWindStrength = {
      value: new THREE.Vector3(
        EZ_GRASS_WIND.strength.x,
        EZ_GRASS_WIND.strength.y,
        EZ_GRASS_WIND.strength.z,
      ),
    }
    shader.uniforms.uWindFrequency = { value: EZ_GRASS_WIND.frequency }
    shader.uniforms.uWindScale = { value: EZ_GRASS_WIND.scale }

    shader.vertexShader = `
uniform float uTime;
uniform vec3 uWindStrength;
uniform float uWindFrequency;
uniform float uWindScale;
${SIMPLEX_GLSL}
${shader.vertexShader}`.replace('#include <begin_vertex>', WIND_BEGIN)

    mat.userData.shader = shader
  }
  windMaterials.add(mat)
  return mat
}

export function makeEzGrassMaterial(
  map: THREE.Texture | null,
  color: string,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color,
    map,
    emissive: new THREE.Color(0x308040),
    emissiveIntensity: 0.05,
    transparent: false,
    alphaTest: EZ_GRASS_WIND.alphaTest,
    depthTest: true,
    depthWrite: true,
    metalness: 0,
    roughness: EZ_GRASS_WIND.roughness,
    side: THREE.DoubleSide,
  })
  mat.color.multiplyScalar(0.6)
  applyEzGrassWind(mat)
  return mat
}

export function disposeEzGrassMaterial(mat: THREE.MeshStandardMaterial): void {
  windMaterials.delete(mat)
  mat.dispose()
}

export function tickEzGrassWind(elapsedTime: number): void {
  for (const mat of windMaterials) {
    const shader = mat.userData.shader as
      | { uniforms?: { uTime?: { value: number } } }
      | undefined
    if (shader?.uniforms?.uTime) shader.uniforms.uTime.value = elapsedTime
  }
}
