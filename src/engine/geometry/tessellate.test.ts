import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { tessellateByMaxEdge } from './tessellate'

describe('tessellateByMaxEdge', () => {
  it('leaves a small triangle unchanged', () => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0], 3),
    )
    geo.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3),
    )
    geo.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2),
    )
    geo.setIndex([0, 1, 2])
    expect(tessellateByMaxEdge(geo, 0.2)).toBe(geo)
    geo.dispose()
  })

  it('splits a large quad so edges stay under the limit', () => {
    const geo = new THREE.PlaneGeometry(4, 2, 1, 1)
    const out = tessellateByMaxEdge(geo, 0.5, 8)
    expect(out.attributes.position.count).toBeGreaterThan(4)
    const pos = out.attributes.position
    const idx = out.index!
    let max = 0
    for (let i = 0; i < idx.count; i += 3) {
      for (const [a, b] of [
        [idx.getX(i), idx.getX(i + 1)],
        [idx.getX(i + 1), idx.getX(i + 2)],
        [idx.getX(i + 2), idx.getX(i)],
      ] as const) {
        max = Math.max(
          max,
          new THREE.Vector3().fromBufferAttribute(pos, a).distanceTo(
            new THREE.Vector3().fromBufferAttribute(pos, b),
          ),
        )
      }
    }
    expect(max).toBeLessThanOrEqual(0.5 + 1e-4)
    if (out !== geo) out.dispose()
    geo.dispose()
  })

  it('interpolates UVs at midpoints', () => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3),
    )
    geo.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3),
    )
    geo.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2),
    )
    geo.setIndex([0, 1, 2])
    const out = tessellateByMaxEdge(geo, 1.5, 1)
    const uv = out.attributes.uv
    const uvs: Array<[number, number]> = []
    for (let i = 0; i < uv.count; i++) {
      uvs.push([uv.getX(i), uv.getY(i)])
    }
    expect(uvs.some(([u, v]) => Math.abs(u - 1) < 1e-5 && Math.abs(v) < 1e-5)).toBe(
      true,
    )
    if (out !== geo) out.dispose()
    geo.dispose()
  })
})
