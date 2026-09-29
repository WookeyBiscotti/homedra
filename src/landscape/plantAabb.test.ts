import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { aabbPlanSide } from './aabbPlan'

describe('plant plan AABB', () => {
  it('uses the larger horizontal AABB side times instance scale', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 10, 2.5))
    expect(aabbPlanSide(mesh)).toBeCloseTo(4, 5)
    expect(aabbPlanSide(mesh, 2)).toBeCloseTo(8, 5)
  })
})
