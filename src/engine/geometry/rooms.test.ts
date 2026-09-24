import { describe, expect, it } from 'vitest'
import {
  detectRooms,
  hitRoom,
  roomsForWallSides,
  wallSideForInwardNormal,
  wallAxes,
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

/** Two rooms sharing a partition at x=3. */
function twoRoomFloor(): Floor {
  return {
    id: createId('floor'),
    name: 'Two',
    kind: 'story',
    elevation: 0,
    height: 2.8,
    slabThickness: 0.2,
    visible: 'solid',
    vertices: [
      { id: 'v1', x: 0, y: 0 },
      { id: 'v2', x: 3, y: 0 },
      { id: 'v3', x: 6, y: 0 },
      { id: 'v4', x: 6, y: 4 },
      { id: 'v5', x: 3, y: 4 },
      { id: 'v6', x: 0, y: 4 },
    ],
    walls: [
      { id: 'w12', a: 'v1', b: 'v2', thickness: 0.2 },
      { id: 'w23', a: 'v2', b: 'v3', thickness: 0.2 },
      { id: 'w34', a: 'v3', b: 'v4', thickness: 0.2 },
      { id: 'w45', a: 'v4', b: 'v5', thickness: 0.2 },
      { id: 'w56', a: 'v5', b: 'v6', thickness: 0.2 },
      { id: 'w61', a: 'v6', b: 'v1', thickness: 0.2 },
      { id: 'w25', a: 'v2', b: 'v5', thickness: 0.2 },
    ],
    openings: [],
    slabOpenings: [],
    constraints: [],
  }
}

function lShapedFloor(): Floor {
  // L: 0..6 x 0..4 minus 3..6 x 2..4 open? Simpler L polyline rooms:
  // Outer L polygon walls forming one room.
  return {
    id: createId('floor'),
    name: 'L',
    kind: 'story',
    elevation: 0,
    height: 2.8,
    slabThickness: 0.2,
    visible: 'solid',
    vertices: [
      { id: 'v1', x: 0, y: 0 },
      { id: 'v2', x: 6, y: 0 },
      { id: 'v3', x: 6, y: 2 },
      { id: 'v4', x: 3, y: 2 },
      { id: 'v5', x: 3, y: 4 },
      { id: 'v6', x: 0, y: 4 },
    ],
    walls: [
      { id: 'w1', a: 'v1', b: 'v2', thickness: 0.2 },
      { id: 'w2', a: 'v2', b: 'v3', thickness: 0.2 },
      { id: 'w3', a: 'v3', b: 'v4', thickness: 0.2 },
      { id: 'w4', a: 'v4', b: 'v5', thickness: 0.2 },
      { id: 'w5', a: 'v5', b: 'v6', thickness: 0.2 },
      { id: 'w6', a: 'v6', b: 'v1', thickness: 0.2 },
    ],
    openings: [],
    slabOpenings: [],
    constraints: [],
  }
}

describe('detectRooms', () => {
  it('finds one room in a rectangle', () => {
    const rooms = detectRooms(rectFloor())
    expect(rooms).toHaveLength(1)
    expect(rooms[0].wallIds).toHaveLength(4)
    expect(rooms[0].edges).toHaveLength(4)
    expect(rooms[0].polygon.length).toBeGreaterThanOrEqual(4)
    // Interior point
    expect(hitRoom(rectFloor(), 3, 2)?.key).toBe(rooms[0].key)
    // Outside
    expect(hitRoom(rectFloor(), -1, -1)).toBeNull()
  })

  it('finds two rooms with a shared wall and opposite sides', () => {
    const floor = twoRoomFloor()
    const rooms = detectRooms(floor)
    expect(rooms).toHaveLength(2)
    const left = hitRoom(floor, 1.5, 2)
    const right = hitRoom(floor, 4.5, 2)
    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    expect(left!.key).not.toBe(right!.key)

    const leftPartition = left!.edges.find((e) => e.wallId === 'w25')
    const rightPartition = right!.edges.find((e) => e.wallId === 'w25')
    expect(leftPartition).toBeDefined()
    expect(rightPartition).toBeDefined()
    expect(leftPartition!.side).not.toBe(rightPartition!.side)

    const sides = roomsForWallSides(floor, 'w25')
    expect(sides.pos).not.toBeNull()
    expect(sides.neg).not.toBeNull()
    expect(sides.pos!.key).not.toBe(sides.neg!.key)
  })

  it('detects an L-shaped room', () => {
    const floor = lShapedFloor()
    const rooms = detectRooms(floor)
    expect(rooms).toHaveLength(1)
    expect(hitRoom(floor, 1, 1)?.key).toBe(rooms[0].key)
    expect(hitRoom(floor, 1, 3)?.key).toBe(rooms[0].key)
    expect(hitRoom(floor, 5, 1)?.key).toBe(rooms[0].key)
    // Outside the L notch
    expect(hitRoom(floor, 5, 3)).toBeNull()
  })

  it('maps wall side from inward normal', () => {
    const floor = rectFloor()
    const wall = floor.walls.find((w) => w.id === 'w1')!
    const axes = wallAxes(floor, wall)!
    expect(wallSideForInwardNormal(floor, wall, { x: axes.nx, y: axes.ny })).toBe(
      'pos',
    )
    expect(
      wallSideForInwardNormal(floor, wall, { x: -axes.nx, y: -axes.ny }),
    ).toBe('neg')
  })
})
