import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  applyFoliageWind,
  foliageWindUniforms,
  tickFoliageWind,
} from './foliageWind'

describe('foliage wind', () => {
  it('marks a leaf material and binds a compile hook', () => {
    const mat = applyFoliageWind(new THREE.MeshStandardMaterial())
    expect(mat.userData.foliageWind).toBe(true)
    expect(typeof mat.onBeforeCompile).toBe('function')
  })

  it('advances shared uniforms with gust', () => {
    tickFoliageWind(1.5, 1)
    expect(foliageWindUniforms.uTime.value).toBeCloseTo(1.5, 5)
    expect(foliageWindUniforms.uWindAmp.value).toBeGreaterThan(0.05)
    tickFoliageWind(1.5, 0)
    expect(foliageWindUniforms.uWindAmp.value).toBe(0)
  })
})
