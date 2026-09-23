import { describe, expect, it } from 'vitest'
import { applyDragWithConstraints, solveFloor } from './solver'
import { createId, type Floor } from '../types'

function rectangleFloor(): Floor {
  const v1 = { id: 'v1', x: 0, y: 0 }
  const v2 = { id: 'v2', x: 6, y: 0 }
  const v3 = { id: 'v3', x: 6, y: 4 }
  const v4 = { id: 'v4', x: 0, y: 4 }
  const w1 = { id: 'w1', a: 'v1', b: 'v2', thickness: 0.2 }
  const w2 = { id: 'w2', a: 'v2', b: 'v3', thickness: 0.2 }
  const w3 = { id: 'w3', a: 'v3', b: 'v4', thickness: 0.2 }
  const w4 = { id: 'w4', a: 'v4', b: 'v1', thickness: 0.2 }
  return {
    id: createId('floor'),
    name: 'Test',
    kind: 'story',
    elevation: 0,
    height: 2.8,
    slabThickness: 0.2,
    visible: true,
    vertices: [v1, v2, v3, v4],
    walls: [w1, w2, w3, w4],
    openings: [],
    slabOpenings: [],
    constraints: [
      { id: 'c1', type: 'fixedLength', wallId: 'w1', length: 6 },
      { id: 'c2', type: 'fixedLength', wallId: 'w2', length: 4 },
      { id: 'c3', type: 'fixedLength', wallId: 'w3', length: 6 },
      { id: 'c4', type: 'fixedLength', wallId: 'w4', length: 4 },
      { id: 'c5', type: 'fixedPosition', vertexId: 'v1' },
    ],
  }
}

function len(floor: Floor, a: string, b: string): number {
  const va = floor.vertices.find((v) => v.id === a)!
  const vb = floor.vertices.find((v) => v.id === b)!
  return Math.hypot(vb.x - va.x, vb.y - va.y)
}

describe('constraint solver', () => {
  it('keeps fixed wall lengths when dragging a free vertex', () => {
    const floor = rectangleFloor()
    const result = applyDragWithConstraints(floor, 'v3', 7.5, 5.5)

    expect(result.ok).toBe(true)
    expect(len(result.floor, 'v1', 'v2')).toBeCloseTo(6, 2)
    expect(len(result.floor, 'v2', 'v3')).toBeCloseTo(4, 2)
    expect(len(result.floor, 'v3', 'v4')).toBeCloseTo(6, 2)
    expect(len(result.floor, 'v4', 'v1')).toBeCloseTo(4, 2)

    const v1 = result.floor.vertices.find((v) => v.id === 'v1')!
    expect(v1.x).toBeCloseTo(0, 1)
    expect(v1.y).toBeCloseTo(0, 1)

    const v3 = result.floor.vertices.find((v) => v.id === 'v3')!
    expect(v3.x).toBeGreaterThan(6)
    expect(v3.y).toBeGreaterThan(4)
  })

  it('does not stretch a single fixed-length wall under strong drag', () => {
    const floor = rectangleFloor()
    floor.constraints = [
      { id: 'c1', type: 'fixedLength', wallId: 'w1', length: 6 },
      { id: 'c5', type: 'fixedPosition', vertexId: 'v1' },
    ]
    const result = applyDragWithConstraints(floor, 'v2', 12, 3)
    expect(len(result.floor, 'v1', 'v2')).toBeCloseTo(6, 2)
  })

  it('allows unconstrained walls to change length', () => {
    const floor = rectangleFloor()
    // Only bottom wall fixed; others free
    floor.constraints = [
      { id: 'c1', type: 'fixedLength', wallId: 'w1', length: 6 },
      { id: 'c5', type: 'fixedPosition', vertexId: 'v1' },
    ]
    const result = applyDragWithConstraints(floor, 'v3', 8, 6)
    expect(len(result.floor, 'v1', 'v2')).toBeCloseTo(6, 1)
    // Free side and top should stretch toward the drag
    expect(len(result.floor, 'v2', 'v3')).toBeGreaterThan(4.2)
  })

  it('keeps a free vertex on a wall centerline (pointOnWall)', () => {
    const floor = rectangleFloor()
    floor.vertices.push({ id: 'v5', x: 3, y: 1 })
    floor.walls.push({ id: 'w5', a: 'v3', b: 'v5', thickness: 0.2 })
    floor.constraints = [
      { id: 'c5', type: 'fixedPosition', vertexId: 'v1' },
      { id: 'c6', type: 'fixedPosition', vertexId: 'v2' },
      { id: 'c7', type: 'horizontal', wallId: 'w1' },
      { id: 'c8', type: 'pointOnWall', vertexId: 'v5', wallId: 'w1' },
    ]
    const result = solveFloor(floor)
    expect(result.ok).toBe(true)
    const v5 = result.floor.vertices.find((v) => v.id === 'v5')!
    // Bottom wall w1 is y=0
    expect(v5.y).toBeCloseTo(0, 1)
  })

  it('enforces horizontal constraint', () => {
    const floor = rectangleFloor()
    floor.constraints.push({ id: 'ch', type: 'horizontal', wallId: 'w1' })
    // Nudge v2 off horizontal
    floor.vertices = floor.vertices.map((v) =>
      v.id === 'v2' ? { ...v, y: 0.8 } : v,
    )
    const result = solveFloor(floor)
    const v1 = result.floor.vertices.find((v) => v.id === 'v1')!
    const v2 = result.floor.vertices.find((v) => v.id === 'v2')!
    expect(Math.abs(v1.y - v2.y)).toBeLessThan(0.05)
  })

  it('aligns selected points on one horizontal line', () => {
    const floor = rectangleFloor()
    floor.constraints = [
      { id: 'c5', type: 'fixedPosition', vertexId: 'v1' },
      {
        id: 'ph',
        type: 'pointsHorizontal',
        vertexIds: ['v1', 'v3'],
      },
    ]
    floor.vertices = floor.vertices.map((v) =>
      v.id === 'v3' ? { ...v, y: 4.5 } : v,
    )
    const result = solveFloor(floor)
    const v1 = result.floor.vertices.find((v) => v.id === 'v1')!
    const v3 = result.floor.vertices.find((v) => v.id === 'v3')!
    expect(Math.abs(v1.y - v3.y)).toBeLessThan(0.05)
  })

  it('enforces vertex distance with inner faces', () => {
    const floor = rectangleFloor()
    // Clear opening between v1 and v2 should be 6 - 0.1 - 0.1 = 5.8 for thickness 0.2
    floor.constraints = [
      { id: 'c5', type: 'fixedPosition', vertexId: 'v1' },
      {
        id: 'vd',
        type: 'vertexDistance',
        vertexA: 'v1',
        vertexB: 'v2',
        distance: 5.8,
        face: 'inner',
      },
    ]
    floor.vertices = floor.vertices.map((v) =>
      v.id === 'v2' ? { ...v, x: 5 } : v,
    )
    const result = solveFloor(floor)
    const v1 = result.floor.vertices.find((v) => v.id === 'v1')!
    const v2 = result.floor.vertices.find((v) => v.id === 'v2')!
    // centerline target = 5.8 + 0.1 + 0.1 = 6.0
    expect(Math.hypot(v2.x - v1.x, v2.y - v1.y)).toBeCloseTo(6, 1)
  })
})

describe('face offsets', () => {
  it('inner faces offset toward each other', async () => {
    const { faceOffsetFromCenter } = await import('../geometry/wallSolid')
    // Wall below other (towardOther = +1): inner face is above center
    expect(faceOffsetFromCenter('inner', 0.2, 1)).toBeCloseTo(0.1)
    expect(faceOffsetFromCenter('outer', 0.2, 1)).toBeCloseTo(-0.1)
  })
})

describe('wall edge join', () => {
  it('splits a wall when attaching at mid-edge', async () => {
    const { splitWallAt } = await import('../geometry/walls')
    const floor = rectangleFloor()
    const before = floor.walls.length
    const result = splitWallAt(floor, 'w1', 3, 0)
    expect(result).not.toBeNull()
    expect(result!.floor.walls.length).toBe(before + 1) // one removed, two added
    expect(result!.floor.walls.some((w) => w.id === 'w1')).toBe(false)
    const mid = result!.vertex
    const incident = result!.floor.walls.filter(
      (w) => w.a === mid.id || w.b === mid.id,
    )
    expect(incident.length).toBe(2)
  })

  it('keeps shared vertex when walls connect (coincident by identity)', async () => {
    const { resolveWallEndpoint, addWallBetween } = await import('../geometry/walls')
    let floor = rectangleFloor()
    const mid = resolveWallEndpoint(floor, 3, 0)
    floor = mid.floor
    const top = resolveWallEndpoint(floor, 3, 2)
    floor = top.floor
    const next = addWallBetween(floor, mid.vertex.id, top.vertex.id)
    expect(next).not.toBeNull()
    const deg = next!.walls.filter(
      (w) => w.a === mid.vertex.id || w.b === mid.vertex.id,
    ).length
    expect(deg).toBeGreaterThanOrEqual(3)
  })

  it('merges two vertices into one at midpoint', async () => {
    const { mergeVertices } = await import('../geometry/walls')
    const floor = rectangleFloor()
    const beforeWalls = floor.walls.length
    const merged = mergeVertices(floor, 'v1', 'v2', { position: 'mid' })
    expect(merged.vertices.some((v) => v.id === 'v2')).toBe(false)
    const keep = merged.vertices.find((v) => v.id === 'v1')!
    expect(keep.x).toBeCloseTo(3, 5)
    expect(keep.y).toBeCloseTo(0, 5)
    expect(merged.walls.length).toBeLessThan(beforeWalls)
    expect(merged.walls.every((w) => w.a !== w.b)).toBe(true)
  })

  it('attaches to mid-edge when click lands on thick wall face', async () => {
    const { resolveWallEndpoint } = await import('../geometry/walls')
    const floor = rectangleFloor()
    floor.walls = floor.walls.map((w) =>
      w.id === 'w1' ? { ...w, thickness: 0.4 } : w,
    )
    const result = resolveWallEndpoint(floor, 3, 0.18, true)
    expect(result.kind).toBe('edge')
    expect(result.floor.walls.length).toBeGreaterThan(floor.walls.length)
  })
})

describe('mitered wall footprints', () => {
  it('square room walls are trapezoids (wide outside, narrow inside)', async () => {
    const { joinedWallFootprint } = await import('../geometry/wallSolid')
    const t = 0.4
    const half = t / 2
    const floor: import('../types').Floor = {
      id: 'f',
      name: 't',
      kind: 'story',
      elevation: 0,
      height: 2.8,
      slabThickness: 0.2,
    visible: true,
      vertices: [
        { id: 'v0', x: 0, y: 0 },
        { id: 'v1', x: 5, y: 0 },
        { id: 'v2', x: 5, y: 5 },
        { id: 'v3', x: 0, y: 5 },
      ],
      walls: [
        { id: 'w0', a: 'v0', b: 'v1', thickness: t },
        { id: 'w1', a: 'v1', b: 'v2', thickness: t },
        { id: 'w2', a: 'v2', b: 'v3', thickness: t },
        { id: 'w3', a: 'v3', b: 'v0', thickness: t },
      ],
      openings: [],
      slabOpenings: [],
      constraints: [],
    }
    const dist = (
      a: { x: number; y: number },
      b: { x: number; y: number },
    ) => Math.hypot(a.x - b.x, a.y - b.y)

    for (const wall of floor.walls) {
      const fp = joinedWallFootprint(floor, wall)!
      expect(fp).toHaveLength(4)
      // Order: outer-a, outer-b, inner-b, inner-a
      const outerLen = dist(fp[0], fp[1])
      const innerLen = dist(fp[2], fp[3])
      expect(outerLen).toBeGreaterThan(innerLen)
      expect(outerLen).toBeCloseTo(5 + t, 5)
      expect(innerLen).toBeCloseTo(5 - t, 5)
    }

    const bottom = joinedWallFootprint(floor, floor.walls[0])!
    expect(bottom[0].x).toBeCloseTo(-half, 5)
    expect(bottom[0].y).toBeCloseTo(-half, 5)
    expect(bottom[2].x).toBeCloseTo(5 - half, 5)
    expect(bottom[2].y).toBeCloseTo(half, 5)
  })

  it('joint corners stay on faces for a 60° join', async () => {
    const { joinedWallFootprint, wallAxes } = await import('../geometry/wallSolid')
    const floor: import('../types').Floor = {
      id: 'f',
      name: 't',
      kind: 'story',
      elevation: 0,
      height: 2.8,
      slabThickness: 0.2,
    visible: true,
      vertices: [
        { id: 'v0', x: 0, y: 0 },
        { id: 'v1', x: 4, y: 0 },
        { id: 'v2', x: 2, y: 2 * Math.sqrt(3) },
      ],
      walls: [
        { id: 'w0', a: 'v0', b: 'v1', thickness: 0.2 },
        { id: 'w1', a: 'v0', b: 'v2', thickness: 0.2 },
      ],
      openings: [],
      slabOpenings: [],
      constraints: [],
    }
    const fp0 = joinedWallFootprint(floor, floor.walls[0])!
    const fp1 = joinedWallFootprint(floor, floor.walls[1])!
    const ax0 = wallAxes(floor, floor.walls[0])!
    const ax1 = wallAxes(floor, floor.walls[1])!
    const h = 0.1
    const nearJoint = (p: { x: number; y: number }) =>
      Math.hypot(p.x, p.y) < 0.5
    for (const p of [...fp0, ...fp1].filter(nearJoint)) {
      const d0 = (p.x - ax0.a.x) * ax0.nx + (p.y - ax0.a.y) * ax0.ny
      const d1 = (p.x - ax1.a.x) * ax1.nx + (p.y - ax1.a.y) * ax1.ny
      expect(Math.abs(d0)).toBeLessThanOrEqual(h + 0.001)
      expect(Math.abs(d1)).toBeLessThanOrEqual(h + 0.001)
    }
    // Open L/V: miters make outer tip longer than free end span on one side
    const dist = (
      a: { x: number; y: number },
      b: { x: number; y: number },
    ) => Math.hypot(a.x - b.x, a.y - b.y)
    const side0a = dist(fp0[0], fp0[3])
    const side0b = dist(fp0[1], fp0[2])
    expect(Math.max(side0a, side0b)).toBeGreaterThan(0.2)
  })
})

