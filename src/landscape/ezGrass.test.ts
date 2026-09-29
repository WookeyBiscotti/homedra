import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  applyEzGrassWind,
  makeEzGrassMaterial,
  tickEzGrassWind,
  unitHeightGrassGeometry,
} from './ezGrass'

describe('EZ-Tree grass', () => {
  it('normalizes the tuft mesh to 1 m height, grounded at y = 0', () => {
    const geo = new THREE.BoxGeometry(2, 2, 1.6)
    geo.translate(0.4, 1, -0.2)
    const unit = unitHeightGrassGeometry(geo)
    unit.computeBoundingBox()
    const box = unit.boundingBox!
    expect(box.max.y - box.min.y).toBeCloseTo(1, 5)
    expect(box.min.y).toBeCloseTo(0, 5)
    expect((box.max.x + box.min.x) * 0.5).toBeCloseTo(0, 5)
    expect((box.max.z + box.min.z) * 0.5).toBeCloseTo(0, 5)
  })

  it('injects the EZ-Tree simplex wind into begin_vertex', () => {
    const mat = applyEzGrassWind(new THREE.MeshStandardMaterial())
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <begin_vertex>\nvoid main() {\n}',
      fragmentShader: '',
    }
    mat.onBeforeCompile(shader as never, null as never)
    expect(shader.vertexShader).toContain('ezSimplex2d')
    expect(shader.vertexShader).toContain('uWindStrength')
    expect(shader.vertexShader).toContain('USE_INSTANCING')
    expect(shader.uniforms.uTime?.value).toBe(0)
    tickEzGrassWind(3.25)
    expect(shader.uniforms.uTime?.value).toBeCloseTo(3.25, 5)
  })

  it('matches EZ-Tree material knobs', () => {
    const mat = makeEzGrassMaterial(null, '#ffffff')
    expect(mat.alphaTest).toBeCloseTo(0.5, 5)
    expect(mat.emissive.getHex()).toBe(0x308040)
    expect(mat.color.r).toBeCloseTo(0.6, 5)
  })
})
