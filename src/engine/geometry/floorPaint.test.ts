import { describe, expect, it } from 'vitest'
import { floorPaintRegions, hitFloorPaintRegion } from './floorPaint'
import { createId, type Floor } from '../types'
import { floorOpeningKey } from './openings'

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

  it('exposes a flush door threshold as its own floor region', () => {
    const floor = twoRoomFloor()
    floor.openings = [
      {
        id: 'door1',
        wallId: 'w25',
        kind: 'door',
        offset: 2,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
      },
    ]

    const regions = floorPaintRegions(floor)
    const door = regions.find((r) => r.key === floorOpeningKey('door1'))
    expect(door).toBeDefined()

    // Partition wall is at x=3; doorway center is on that wall
    const hit = hitFloorPaintRegion(floor, 3, 2, 0)
    expect(hit?.key).toBe(floorOpeningKey('door1'))

    // Adjacent room interiors still resolve to rooms, not the door strip
    expect(hitFloorPaintRegion(floor, 1.5, 2, 0)?.key).not.toBe(
      floorOpeningKey('door1'),
    )
    expect(hitFloorPaintRegion(floor, 4.5, 2, 0)?.key).not.toBe(
      floorOpeningKey('door1'),
    )
  })

  it('skips window openings with a sill', () => {
    const floor = twoRoomFloor()
    floor.openings = [
      {
        id: 'win1',
        wallId: 'w25',
        kind: 'window',
        offset: 2,
        width: 1.2,
        height: 1.4,
        sillHeight: 0.9,
      },
    ]
    const regions = floorPaintRegions(floor)
    expect(regions.some((r) => r.key === floorOpeningKey('win1'))).toBe(false)
  })
})
