import { describe, expect, it } from 'vitest'
import { cropPbrMaps } from './ambientcg'
import { cropRectPx } from './cropImage'
import * as THREE from 'three'

describe('cropRectPx', () => {
  it('maps the picker box onto image pixels from the top-left', () => {
    const r = cropRectPx(1000, 500, { u0: 0.2, v0: 0.1, u1: 0.6, v1: 0.5 })
    expect(r.sx).toBeCloseTo(200, 5)
    expect(r.sy).toBeCloseTo(50, 5)
    expect(r.sw).toBeCloseTo(400, 5)
    expect(r.sh).toBeCloseTo(200, 5)
  })
})

describe('cropPbrMaps', () => {
  it('leaves a full-region material unchanged', () => {
    const map = new THREE.Texture()
    map.image = { width: 64, height: 64 }
    const maps = { map }
    expect(cropPbrMaps(maps, { u0: 0, v0: 0, u1: 1, v1: 1 })).toBe(maps)
  })
})
