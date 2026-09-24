import { describe, expect, it } from 'vitest'
import {
  joinedWallFootprint,
  wallAxes,
  wallFaceEndpoints,
} from './wallSolid'
import { createId, type Floor } from '../types'

function rectFloor(): Floor {
  return {
    id: createId('floor'),
    name: 'Test',
    kind: 'story',
    elevation: 0,
    height: 2.8,
    slabThickness: 0.2,
    visible: 'solid',
    vertices: [
      { id: 'v1', x: 0, y: 0 },
      { id: 'v2', x: 6, y: 0 },
      { id: 'v3', x: 6, y: 4 },
      { id: 'v4', x: 0, y: 4 },
    ],
    walls: [
      { id: 'w1', a: 'v1', b: 'v2', thickness: 0.2 },
      { id: 'w2', a: 'v2', b: 'v3', thickness: 0.2 },
      { id: 'w3', a: 'v3', b: 'v4', thickness: 0.2 },
      { id: 'w4', a: 'v4', b: 'v1', thickness: 0.2 },
    ],
    openings: [],
    slabOpenings: [],
    constraints: [],
  }
}

describe('wallFaceEndpoints', () => {
  it('lies on the solid footprint, not a diagonal through the wall', () => {
    const floor = rectFloor()
    for (const wall of floor.walls) {
      const axes = wallAxes(floor, wall)!
      const fp = joinedWallFootprint(floor, wall)!
      const half = wall.thickness / 2

      for (const side of ['pos', 'neg'] as const) {
        const ends = wallFaceEndpoints(floor, wall, side)!
        // Inner trapezoid edge is shorter than centerline at miters; diagonal
        // through thickness would still be ~len — check offset + footprint instead.
        expect(ends.length).toBeGreaterThan(axes.len - wall.thickness - 0.05)
        expect(ends.length).toBeLessThan(axes.len + wall.thickness)

        const mid = {
          x: (ends.a.x + ends.b.x) / 2,
          y: (ends.a.y + ends.b.y) / 2,
        }
        const center = {
          x: (axes.a.x + axes.b.x) / 2,
          y: (axes.a.y + axes.b.y) / 2,
        }
        const d =
          (mid.x - center.x) * axes.nx + (mid.y - center.y) * axes.ny
        if (side === 'pos') {
          expect(d).toBeGreaterThan(half * 0.7)
        } else {
          expect(d).toBeLessThan(-half * 0.7)
        }

        // Both endpoints near the footprint ring
        for (const p of [ends.a, ends.b]) {
          const minDist = Math.min(
            ...fp.map((q) => Math.hypot(p.x - q.x, p.y - q.y)),
          )
          expect(minDist).toBeLessThan(1e-6)
        }
      }
    }
  })
})
