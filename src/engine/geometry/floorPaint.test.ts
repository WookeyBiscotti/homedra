import { describe, expect, it } from 'vitest'
import { floorPaintRegions, hitFloorPaintRegion } from './floorPaint'
import { createId, type Floor } from '../types'

function twoRoomFloor(): Floor {
  return {
    id: createId('floor'),
    name: 'Two',
    kind: 'story',
    elevation: -2.5,
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

describe('floorPaintRegions', () => {
  it('covers both rooms of a partitioned basement', () => {
    const floor = twoRoomFloor()
    const regions = floorPaintRegions(floor)
    expect(regions.length).toBeGreaterThanOrEqual(2)

    const left = hitFloorPaintRegion(floor, 1.5, 2)
    const right = hitFloorPaintRegion(floor, 4.5, 2)
    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    expect(left!.key).not.toBe(right!.key)
  })
})
