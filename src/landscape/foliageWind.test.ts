import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  applyFoliageWind,
  applyGrassWind,
  foliageWindUniforms,
  tickFoliageWind,
} from './foliageWind'

describe('foliage wind', () => {
  it('marks a leaf material and binds a compile hook', () => {
    const mat = applyFoliageWind(new THREE.MeshStandardMaterial())
    expect(mat.userData.foliageWind).toBe(true)
    expect(typeof mat.onBeforeCompile).toBe('function')
  })

  it('wraps grass card normals so the back face stays lit', () => {
    const mat = applyGrassWind(new THREE.MeshStandardMaterial())
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <normal_fragment_begin>',
    }
    mat.onBeforeCompile(shader as never, null as never)
    expect(shader.fragmentShader).toContain('abs(normal.y)')
  })

  it('advances shared uniforms with gust', () => {
    tickFoliageWind(1.5, 1)
    expect(foliageWindUniforms.uTime.value).toBeCloseTo(1.5, 5)
    expect(foliageWindUniforms.uWindAmp.value).toBeGreaterThan(0.05)
    tickFoliageWind(1.5, 0)
    expect(foliageWindUniforms.uWindAmp.value).toBe(0)
  })
})
