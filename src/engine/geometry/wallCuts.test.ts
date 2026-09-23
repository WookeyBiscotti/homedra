import { describe, expect, it } from 'vitest'
import {
  buildSlabOpeningCutGeometry,
  buildWallCutGeometry,
  wallFreeEndPlanEdge,
  wallVertexIsFree,
} from './wallCuts'
import { createId, type Floor } from '../types'

function rectFloor(): Floor {
  return {
    id: createId('floor'),
    name: 'Test',
    kind: 'story',
    elevation: 0,
    height: 2.8,
    slabThickness: 0.2,
    visible: true,
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

function stubWallFloor(): Floor {
  return {
    id: createId('floor'),
    name: 'Stub',
    kind: 'story',
    elevation: 0,
    height: 2.8,
    slabThickness: 0.25,
    visible: true,
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
    slabOpenings: [
      {
        id: 'sop1',
        kind: 'stair',
        x: 1,
        y: 1,
        width: 1,
        depth: 2,
      },
    ],
    constraints: [],
  }
}

describe('wallCuts', () => {
  it('detects free ends only on unjoined vertices', () => {
    const closed = rectFloor()
    expect(wallVertexIsFree(closed, 'v1')).toBe(false)
    expect(wallFreeEndPlanEdge(closed, closed.walls[0], 'a')).toBeNull()

    const stub = stubWallFloor()
    expect(wallVertexIsFree(stub, 'v1')).toBe(true)
    expect(wallVertexIsFree(stub, 'v2')).toBe(true)
    const edgeA = wallFreeEndPlanEdge(stub, stub.walls[0], 'a')
    const edgeB = wallFreeEndPlanEdge(stub, stub.walls[0], 'b')
    expect(edgeA).not.toBeNull()
    expect(edgeB).not.toBeNull()
    expect(edgeA!.length).toBeCloseTo(0.3, 5)
    expect(edgeB!.length).toBeCloseTo(0.3, 5)
  })

  it('builds free-end + opening reveal geometry for a stub wall', () => {
    const floor = stubWallFloor()
    const geo = buildWallCutGeometry(floor, floor.walls[0])
    expect(geo).not.toBeNull()
    // 2 free ends + 2 jambs + sill + head = 6 quads × 4 verts
    expect(geo!.attributes.position.count).toBe(24)
    geo!.dispose()
  })

  it('skips free ends on a closed room but still builds opening reveals', () => {
    const floor = rectFloor()
    floor.openings = [
      {
        id: 'op1',
        wallId: 'w1',
        kind: 'door',
        offset: 3,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
      },
    ]
    const geo = buildWallCutGeometry(floor, floor.walls[0])
    expect(geo).not.toBeNull()
    // door: 2 jambs + head (no sill) = 3 quads
    expect(geo!.attributes.position.count).toBe(12)
    geo!.dispose()
  })

  it('builds stair well cut faces through the slab', () => {
    const floor = stubWallFloor()
    const geo = buildSlabOpeningCutGeometry(floor, floor.slabOpenings[0])
    expect(geo).not.toBeNull()
    expect(geo!.attributes.position.count).toBe(16) // 4 sides
    geo!.dispose()
  })
})
