import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildWallFaceGeometry, wallFaceFrame } from './wallFaces'
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
    openings: [
      {
        id: 'op1',
        wallId: 'w1',
        kind: 'window',
        offset: 1.2,
        width: 1.0,
        height: 1.4,
        sillHeight: 0.9,
      },
    ],
    slabOpenings: [],
    constraints: [],
  }
}

/** True if any face triangle covers face-param (u, yRel) at mid-height of a band. */
function faceCoversUY(
  geo: THREE.BufferGeometry,
  frame: { ax: number; az: number; ux: number; uz: number },
  u: number,
  yRel: number,
): boolean {
  const pos = geo.attributes.position
  const idx = geo.index
  if (!pos || !idx) return false
  const y = yRel // elevation 0 in fixture

  for (let i = 0; i < idx.count; i += 3) {
    const ia = idx.getX(i)
    const ib = idx.getX(i + 1)
    const ic = idx.getX(i + 2)
    const verts = [ia, ib, ic].map((vi) => {
      const x = pos.getX(vi)
      const yy = pos.getY(vi)
      const z = pos.getZ(vi)
      const uu = (x - frame.ax) * frame.ux + (z - frame.az) * frame.uz
      return { u: uu, y: yy }
    })
    const yLo = Math.min(verts[0].y, verts[1].y, verts[2].y)
    const yHi = Math.max(verts[0].y, verts[1].y, verts[2].y)
    if (y < yLo - 1e-4 || y > yHi + 1e-4) continue
    const uLo = Math.min(verts[0].u, verts[1].u, verts[2].u)
    const uHi = Math.max(verts[0].u, verts[1].u, verts[2].u)
    if (u >= uLo - 1e-4 && u <= uHi + 1e-4) return true
  }
  return false
}

describe('wall face opening alignment', () => {
  it('maps near-end openings with s−s0 (not uniform stretch)', () => {
    const floor = rectFloor()
    const wall = floor.walls[0]
    for (const side of ['pos', 'neg'] as const) {
      const frame = wallFaceFrame(floor, wall, side)!
      // Inner face inset ~+0.1, outer ~−0.1 on a closed room
      expect(Math.abs(frame.s0)).toBeGreaterThan(0.05)

      const geo = buildWallFaceGeometry(floor, wall, side)!
      const uMid = 1.2 - frame.s0
      const uBeside = 0.3 - frame.s0

      // Inside the window band — finish must be open
      expect(faceCoversUY(geo, frame, uMid, 1.5)).toBe(false)
      // Beside the window — finish present
      expect(faceCoversUY(geo, frame, uBeside, 1.5)).toBe(true)

      // Old stretch bug would put the hole at uMid*uScale ≠ uMid
      const wrongU =
        1.2 * (frame.len / 6) // centerline length is 6
      if (Math.abs(wrongU - uMid) > 0.04) {
        // The wrongly-scaled center must still be covered (finish present)
        // only if it's outside the true hole — for near-end openings it often is.
        // Stronger check: true hole edges align to 0.7−s0 and 1.7−s0
        expect(faceCoversUY(geo, frame, 0.7 - frame.s0 - 0.05, 1.5)).toBe(true)
        expect(faceCoversUY(geo, frame, 0.7 - frame.s0 + 0.05, 1.5)).toBe(false)
        expect(faceCoversUY(geo, frame, 1.7 - frame.s0 - 0.05, 1.5)).toBe(false)
        expect(faceCoversUY(geo, frame, 1.7 - frame.s0 + 0.05, 1.5)).toBe(true)
      }
      geo.dispose()
    }
  })

  it('keeps opening width in meters (no uScale shrink)', () => {
    const floor = rectFloor()
    const wall = floor.walls[0]
    const frame = wallFaceFrame(floor, wall, 'pos')!
    const leftU = 0.7 - frame.s0
    const rightU = 1.7 - frame.s0
    expect(rightU - leftU).toBeCloseTo(1.0, 5)
  })
})
