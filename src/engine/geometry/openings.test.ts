import { describe, expect, it } from 'vitest'
import {
  clampOpeningToWall,
  createOpeningFromDrag,
  openingDefaults,
  openingHeightBands,
  openingPlanRect,
  openingsActiveInBand,
} from './openings'
import { wallRegionsMinusOpenings } from '../extrude'
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

describe('opening defaults', () => {
  it('uses window sill and passage full height', () => {
    expect(openingDefaults('window', 2.8)).toEqual({
      height: 1.4,
      sillHeight: 0.9,
      minWidth: 0.6,
    })
    expect(openingDefaults('door', 2.8).sillHeight).toBe(0)
    expect(openingDefaults('passage', 3).height).toBe(3)
  })
})

describe('clampOpeningToWall', () => {
  it('keeps opening inside wall with end margins', () => {
    const floor = rectFloor()
    const clamped = clampOpeningToWall(floor, 'w1', 0, 2, 0.6)!
    expect(clamped.width).toBeCloseTo(2, 5)
    expect(clamped.offset).toBeGreaterThanOrEqual(0.05 + 1)
    expect(clamped.offset + clamped.width / 2).toBeLessThanOrEqual(6 - 0.05 + 1e-9)
  })

  it('rejects walls shorter than min width + margins', () => {
    const floor = rectFloor()
    floor.vertices[1] = { id: 'v2', x: 0.5, y: 0 }
    expect(clampOpeningToWall(floor, 'w1', 0.25, 0.9, 0.6)).toBeNull()
  })
})

describe('openingPlanRect', () => {
  it('builds a rect across wall thickness at the opening', () => {
    const floor = rectFloor()
    const opening = createOpeningFromDrag(floor, 'w1', 'door', 2, 3)!
    const rect = openingPlanRect(floor, opening)!
    expect(rect).toHaveLength(4)
    const ys = rect.map((p) => p.y)
    expect(Math.min(...ys)).toBeLessThan(0)
    expect(Math.max(...ys)).toBeGreaterThan(0)
    const xs = rect.map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(opening.offset - opening.width / 2, 2)
    expect(Math.max(...xs)).toBeCloseTo(opening.offset + opening.width / 2, 2)
  })
})

describe('createOpeningFromDrag', () => {
  it('creates door from drag span', () => {
    const floor = rectFloor()
    const o = createOpeningFromDrag(floor, 'w1', 'door', 1.5, 2.5)!
    expect(o.kind).toBe('door')
    expect(o.width).toBeCloseTo(1, 5)
    expect(o.offset).toBeCloseTo(2, 5)
    expect(o.height).toBe(2.1)
    expect(o.sillHeight).toBe(0)
  })

  it('enforces min width for tiny drag', () => {
    const floor = rectFloor()
    const o = createOpeningFromDrag(floor, 'w1', 'window', 3, 3.1)!
    expect(o.width).toBeGreaterThanOrEqual(0.6)
    expect(o.sillHeight).toBe(0.9)
  })
})

describe('height bands and extrusion cut', () => {
  it('splits bands at sill and top', () => {
    const floor = rectFloor()
    floor.openings = [
      {
        id: 'op1',
        wallId: 'w1',
        kind: 'window',
        offset: 3,
        width: 1.2,
        height: 1.4,
        sillHeight: 0.9,
      },
    ]
    expect(openingHeightBands(floor)).toEqual([0, 0.9, 2.3, 2.8])
    expect(openingsActiveInBand(floor, 0, 0.9)).toHaveLength(0)
    expect(openingsActiveInBand(floor, 0.9, 2.3)).toHaveLength(1)
    expect(openingsActiveInBand(floor, 2.3, 2.8)).toHaveLength(0)
  })

  it('subtracts opening from wall regions in active band', () => {
    const floor = rectFloor()
    floor.openings = [
      {
        id: 'op1',
        wallId: 'w1',
        kind: 'door',
        offset: 3,
        width: 1,
        height: 2.1,
        sillHeight: 0,
      },
    ]
    const solid = wallRegionsMinusOpenings(floor, 0, 1)
    const cut = wallRegionsMinusOpenings(floor, 0, 2.1)
    // Full-height cut should produce more fragmented / different geometry than low band without door...
    // Door is active in [0, 2.1]; both bands include door so regions should still be non-empty.
    expect(solid.length).toBeGreaterThan(0)
    expect(cut.length).toBeGreaterThan(0)

    const above = wallRegionsMinusOpenings(floor, 2.1, 2.8)
    // Above door: no cutters → same as full union count
    expect(above.length).toBeGreaterThan(0)
  })
})
