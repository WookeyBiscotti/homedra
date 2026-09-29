import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { extrudeFloorWalls } from '../extrude'
import { createId, type Floor } from '../types'
import { wallAxes, wallFaceEndpoints } from './wallSolid'
import {
  buildWallSolidFaceCatalog,
  buildWallSolidPaintParts,
  classifyWallSolidTriangle,
  splitPlanRingAtSeams,
} from './wallSolidPaint'

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

function colinearFloor(): Floor {
  return {
    id: createId('floor'),
    name: 'Colinear',
    kind: 'story',
    elevation: 0,
    height: 2.8,
    slabThickness: 0.2,
    visible: 'solid',
    vertices: [
      { id: 'v1', x: 0, y: 0 },
      { id: 'v2', x: 3, y: 0 },
      { id: 'v3', x: 6, y: 0 },
    ],
    walls: [
      { id: 'w1', a: 'v1', b: 'v2', thickness: 0.2 },
      { id: 'w2', a: 'v2', b: 'v3', thickness: 0.2 },
    ],
    openings: [],
    slabOpenings: [],
    constraints: [],
  }
}

function stubWithWindow(): Floor {
  return {
    id: createId('floor'),
    name: 'Stub',
    kind: 'story',
    elevation: 0,
    height: 2.8,
    slabThickness: 0.2,
    visible: 'solid',
    vertices: [
      { id: 'v1', x: 0, y: 0 },
      { id: 'v2', x: 4, y: 0 },
    ],
    walls: [{ id: 'w1', a: 'v1', b: 'v2', thickness: 0.3 }],
    openings: [
      {
        id: 'op1',
        wallId: 'w1',
        kind: 'window',
        offset: 2,
        width: 1.2,
        height: 1.4,
        sillHeight: 0.9,
      },
    ],
    slabOpenings: [],
    constraints: [],
  }
}

function pointSegDist(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-18) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

function partArea(geo: THREE.BufferGeometry): number {
  const pos = geo.attributes.position
  const idx = geo.index
  if (!pos || !idx) return 0
  let area = 0
  for (let i = 0; i < idx.count; i += 3) {
    const ia = idx.getX(i)
    const ib = idx.getX(i + 1)
    const ic = idx.getX(i + 2)
    const abx = pos.getX(ib) - pos.getX(ia)
    const aby = pos.getY(ib) - pos.getY(ia)
    const abz = pos.getZ(ib) - pos.getZ(ia)
    const acx = pos.getX(ic) - pos.getX(ia)
    const acy = pos.getY(ic) - pos.getY(ia)
    const acz = pos.getZ(ic) - pos.getZ(ia)
    const cx = aby * acz - abz * acy
    const cy = abz * acx - abx * acz
    const cz = abx * acy - aby * acx
    area += Math.hypot(cx, cy, cz) * 0.5
  }
  return area
}

describe('splitPlanRingAtSeams', () => {
  it('inserts a joint on a colinear edge', () => {
    const ring = [
      { x: 0, z: 0 },
      { x: 6, z: 0 },
      { x: 6, z: 0.2 },
      { x: 0, z: 0.2 },
    ]
    const split = splitPlanRingAtSeams(ring, [{ x: 3, y: 0 }])
    expect(split.some((p) => Math.abs(p.x - 3) < 1e-6 && Math.abs(p.z) < 1e-6)).toBe(
      true,
    )
  })
})

describe('classifyWallSolidTriangle', () => {
  it('maps a pos-face sample on the solid (no 2.5cm outset)', () => {
    const floor = rectFloor()
    const wall = floor.walls[0]
    const ends = wallFaceEndpoints(floor, wall, 'pos')!
    const axes = wallAxes(floor, wall)!
    const mid = {
      x: (ends.a.x + ends.b.x) / 2,
      y: (ends.a.y + ends.b.y) / 2,
    }
    // World: plan Y → −Z. A tiny outward quad sitting on the solid face.
    const ox = axes.nx * 0.001
    const oy = axes.ny * 0.001
    const ax = mid.x + ox
    const az = -(mid.y + oy)
    const catalog = buildWallSolidFaceCatalog(floor)
    const hit = classifyWallSolidTriangle(
      floor,
      catalog,
      ax + axes.ux * 0.1,
      1,
      az - axes.uy * 0.1,
      ax,
      1,
      az,
      ax,
      1.1,
      az,
    )
    expect(hit).toMatchObject({ wallId: 'w1', slot: 'pos' })
  })
})

describe('buildWallSolidPaintParts', () => {
  it('classifies each room side to the owning wall', () => {
    const floor = rectFloor()
    const parts = buildWallSolidPaintParts(floor, extrudeFloorWalls(floor).layers)
    const sides = parts.filter((p) => p.slot === 'pos' || p.slot === 'neg')
    const keys = new Set(sides.map((p) => p.key))
    expect(keys.has('w1:pos')).toBe(true)
    expect(keys.has('w1:neg')).toBe(true)
    expect(keys.has('w2:pos')).toBe(true)
    expect(keys.has('w3:neg')).toBe(true)
    for (const part of sides) {
      expect(partArea(part.geometry)).toBeGreaterThan(1)
      const wall = floor.walls.find((w) => w.id === part.wallId)!
      const ends = wallFaceEndpoints(floor, wall, part.slot as 'pos' | 'neg')!
      const pos = part.geometry.attributes.position
      let minDist = Infinity
      for (let i = 0; i < pos.count; i++) {
        const plan = { x: pos.getX(i), y: -pos.getZ(i) }
        const d = Math.min(
          Math.hypot(plan.x - ends.a.x, plan.y - ends.a.y),
          Math.hypot(plan.x - ends.b.x, plan.y - ends.b.y),
          pointSegDist(plan, ends.a, ends.b),
        )
        minDist = Math.min(minDist, d)
      }
      // On the solid face, not the old 2.5cm finish offset
      expect(minDist).toBeLessThan(0.03)
    }
    for (const p of parts) p.geometry.dispose()
  })

  it('keeps colinear walls as separate paint groups', () => {
    const floor = colinearFloor()
    const parts = buildWallSolidPaintParts(floor, extrudeFloorWalls(floor).layers)
    const pos = parts.filter((p) => p.slot === 'pos')
    expect(pos.some((p) => p.wallId === 'w1')).toBe(true)
    expect(pos.some((p) => p.wallId === 'w2')).toBe(true)
    for (const p of parts) p.geometry.dispose()
  })

  it('tags opening jambs as cut', () => {
    const floor = stubWithWindow()
    const parts = buildWallSolidPaintParts(floor, extrudeFloorWalls(floor).layers)
    const cut = parts.find((p) => p.wallId === 'w1' && p.slot === 'cut')
    expect(cut).toBeTruthy()
    expect(partArea(cut!.geometry)).toBeGreaterThan(0.2)
    for (const p of parts) p.geometry.dispose()
  })

  it('puts closed-room door jambs on cut, not body', () => {
    // No free ends — cut area must come from the opening reveals.
    const floor = rectFloor()
    floor.openings = [
      {
        id: 'door1',
        wallId: 'w1',
        kind: 'door',
        offset: 3,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
      },
    ]
    const parts = buildWallSolidPaintParts(floor, extrudeFloorWalls(floor).layers)
    const cut = parts.find((p) => p.wallId === 'w1' && p.slot === 'cut')
    expect(cut).toBeTruthy()
    // 2 jambs × 0.2 × 2.1 ≈ 0.84 m² (+ head 0.9×0.2)
    expect(partArea(cut!.geometry)).toBeGreaterThan(0.9)

    // Downward-facing head tris should be present on cut
    const nrm = cut!.geometry.attributes.normal
    const pos = cut!.geometry.attributes.position
    let headArea = 0
    const idx = cut!.geometry.index
    const triCount = idx ? idx.count / 3 : pos.count / 3
    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2
      const ny = (nrm.getY(i0) + nrm.getY(i1) + nrm.getY(i2)) / 3
      if (ny > -0.7) continue
      const ax = pos.getX(i0)
      const ay = pos.getY(i0)
      const az = pos.getZ(i0)
      const bx = pos.getX(i1)
      const by = pos.getY(i1)
      const bz = pos.getZ(i1)
      const cx = pos.getX(i2)
      const cy = pos.getY(i2)
      const cz = pos.getZ(i2)
      const e1x = bx - ax
      const e1y = by - ay
      const e1z = bz - az
      const e2x = cx - ax
      const e2y = cy - ay
      const e2z = cz - az
      const nx = e1y * e2z - e1z * e2y
      const ny2 = e1z * e2x - e1x * e2z
      const nz = e1x * e2y - e1y * e2x
      headArea += 0.5 * Math.hypot(nx, ny2, nz)
    }
    // Door head ≈ 0.9 × 0.2 = 0.18
    expect(headArea).toBeGreaterThan(0.15)
    for (const p of parts) p.geometry.dispose()
  })

  it('writes meter UVs along a wall face', () => {
    const floor = rectFloor()
    const parts = buildWallSolidPaintParts(floor, extrudeFloorWalls(floor).layers)
    const face = parts.find((p) => p.key === 'w1:neg') ?? parts.find((p) => p.key === 'w1:pos')
    expect(face).toBeTruthy()
    const uv = face!.geometry.attributes.uv
    let maxU = 0
    for (let i = 0; i < uv.count; i++) {
      maxU = Math.max(maxU, Math.abs(uv.getX(i)))
    }
    expect(maxU).toBeGreaterThan(4)
    expect(maxU).toBeLessThan(8)
    for (const p of parts) p.geometry.dispose()
  })
})
