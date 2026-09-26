import { describe, expect, it } from 'vitest'
import {
  buildingFootprintHoles,
  buildingMeshDeps,
  extrudeFloorSlabs,
} from './extrude'
import {
  createEmptyFloor,
  createId,
  createEmptyBuilding,
  recalcFloorElevations,
  type Floor,
} from './types'

function rectFloor(): Floor {
  return {
    id: createId('floor'),
    name: 'Test',
    kind: 'story',
    elevation: 0,
    height: 2.8,
    slabThickness: 0.25,
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

describe('recalcFloorElevations', () => {
  it('stacks floors with slab thickness between them', () => {
    const f1 = createEmptyFloor('1', 0, 3)
    f1.slabThickness = 0.2
    const f2 = createEmptyFloor('2', 0, 2.8)
    f2.slabThickness = 0.3
    const floors = recalcFloorElevations([f1, f2])
    const stories = floors.filter((f) => f.kind === 'story')
    expect(floors[0].kind).toBe('ground')
    expect(stories[0].elevation).toBe(0)
    expect(stories[1].elevation).toBeCloseTo(3 + 0.3, 5)
  })

  it('keeps first story elevation independent of ground', () => {
    const ground = createEmptyFloor('Земля', -0.5, 0, 'ground')
    const f1 = createEmptyFloor('1', 1.2, 3)
    f1.slabThickness = 0.2
    const floors = recalcFloorElevations([ground, f1])
    expect(floors[0].elevation).toBe(-0.5)
    expect(floors[1].elevation).toBe(1.2)
  })
})

describe('extrudeFloorSlabs', () => {
  it('builds a closed footprint from wall outer outline', () => {
    const floor = rectFloor()
    const slab = extrudeFloorSlabs(floor)
    expect(slab.thickness).toBe(0.25)
    expect(slab.y).toBe(0)
    expect(slab.regions.length).toBe(1)
    const outer = slab.regions[0].outer
    expect(outer.length).toBeGreaterThanOrEqual(4)

    const xs = outer.map((p) => p.x)
    const zs = outer.map((p) => p.z)
    // Outer faces of 0.2 walls around 0..6 x 0..4
    expect(Math.min(...xs)).toBeCloseTo(-0.1, 2)
    expect(Math.max(...xs)).toBeCloseTo(6.1, 2)
    expect(Math.min(...zs)).toBeCloseTo(-0.1, 2)
    expect(Math.max(...zs)).toBeCloseTo(4.1, 2)
  })

  it('cuts stair wells as holes', () => {
    const floor = rectFloor()
    floor.slabOpenings = [
      {
        id: createId('sop'),
        kind: 'stair',
        x: 3,
        y: 2,
        width: 1,
        depth: 1,
      },
    ]
    const slab = extrudeFloorSlabs(floor)
    expect(slab.regions.length).toBeGreaterThanOrEqual(1)
    const holes = slab.regions.flatMap((r) => r.holes)
    expect(holes.length).toBe(1)
    const xs = holes[0].map((p) => p.x)
    const zs = holes[0].map((p) => p.z)
    expect(Math.min(...xs)).toBeCloseTo(2.5, 5)
    expect(Math.max(...xs)).toBeCloseTo(3.5, 5)
    expect(Math.min(...zs)).toBeCloseTo(1.5, 5)
    expect(Math.max(...zs)).toBeCloseTo(2.5, 5)
  })

  it('builds a slab from a free floor plate without walls', () => {
    const floor = createEmptyFloor('Plate', 0, 2.8)
    floor.plates = [
      {
        id: createId('plt'),
        x: 2,
        y: 1.5,
        width: 4,
        depth: 3,
      },
    ]
    const slab = extrudeFloorSlabs(floor)
    expect(slab.regions.length).toBe(1)
    const xs = slab.regions[0].outer.map((p) => p.x)
    const zs = slab.regions[0].outer.map((p) => p.z)
    expect(Math.min(...xs)).toBeCloseTo(0, 5)
    expect(Math.max(...xs)).toBeCloseTo(4, 5)
    expect(Math.min(...zs)).toBeCloseTo(0, 5)
    expect(Math.max(...zs)).toBeCloseTo(3, 5)
  })

  it('cuts stair wells in free floor plates', () => {
    const floor = createEmptyFloor('Plate', 0, 2.8)
    floor.plates = [
      {
        id: createId('plt'),
        x: 3,
        y: 2,
        width: 6,
        depth: 4,
      },
    ]
    floor.slabOpenings = [
      {
        id: createId('sop'),
        kind: 'stair',
        x: 3,
        y: 2,
        width: 1,
        depth: 1,
      },
    ]
    const slab = extrudeFloorSlabs(floor)
    expect(slab.regions.length).toBe(1)
    expect(slab.regions[0].holes.length).toBe(1)
  })

  it('covers L-shaped rooms without atan2 self-intersection', () => {
    const floor: Floor = {
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
        { id: 'v4', x: 2, y: 2 },
        { id: 'v5', x: 2, y: 5 },
        { id: 'v6', x: 0, y: 5 },
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
    const slab = extrudeFloorSlabs(floor)
    expect(slab.regions.length).toBe(1)
    expect(slab.regions[0].outer.length).toBeGreaterThanOrEqual(6)
  })
})

describe('buildingFootprintHoles', () => {
  it('cuts using the floor that ground elevation intersects', () => {
    const building = createEmptyBuilding()
    building.floors = [
      createEmptyFloor('Земля', 0, 0, 'ground'),
      rectFloor(),
    ]
    const holes = buildingFootprintHoles(building)
    expect(holes.length).toBe(1)
    const xs = holes[0].map((p) => p.x)
    const zs = holes[0].map((p) => p.z)
    expect(Math.min(...xs)).toBeCloseTo(-0.1, 2)
    expect(Math.max(...xs)).toBeCloseTo(6.1, 2)
    expect(Math.min(...zs)).toBeCloseTo(-0.1, 2)
    expect(Math.max(...zs)).toBeCloseTo(4.1, 2)
  })

  it('uses only the intersecting floor footprint, not floors above', () => {
    const ground = createEmptyFloor('Земля', 0, 0, 'ground')
    const f1 = rectFloor()
    f1.elevation = 0
    f1.height = 2.8
    f1.slabThickness = 0.2
    const f2 = rectFloor()
    f2.id = createId('floor')
    f2.name = '2'
    // Smaller rectangle on floor 2
    f2.vertices = [
      { id: 'a', x: 1, y: 1 },
      { id: 'b', x: 3, y: 1 },
      { id: 'c', x: 3, y: 3 },
      { id: 'd', x: 1, y: 3 },
    ]
    f2.walls = [
      { id: 'wa', a: 'a', b: 'b', thickness: 0.2 },
      { id: 'wb', a: 'b', b: 'c', thickness: 0.2 },
      { id: 'wc', a: 'c', b: 'd', thickness: 0.2 },
      { id: 'wd', a: 'd', b: 'a', thickness: 0.2 },
    ]
    const floors = recalcFloorElevations([ground, f1, f2])
    // Ground at floor-1 walking surface
    floors[0].elevation = floors[1].elevation
    const holes = buildingFootprintHoles({
      id: 'b',
      name: 't',
      units: 'm',
      floors,
    })
    expect(holes.length).toBe(1)
    const xs = holes[0].map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(-0.1, 2)
    expect(Math.max(...xs)).toBeCloseTo(6.1, 2)
  })

  it('returns no hole when ground is below all floors', () => {
    const ground = createEmptyFloor('Земля', -2, 0, 'ground')
    const f1 = rectFloor()
    f1.elevation = 1
    const holes = buildingFootprintHoles({
      id: 'b',
      name: 't',
      units: 'm',
      floors: [ground, f1],
    })
    expect(holes).toEqual([])
  })
})

describe('buildingMeshDeps', () => {
  it('stays stable when only placed objects change', () => {
    const story = rectFloor()
    const ground = createEmptyFloor('Земля', 0, 0, 'ground')
    const before = {
      id: 'b',
      name: 't',
      units: 'm' as const,
      floors: [ground, story],
    }
    const after = {
      ...before,
      floors: [
        ground,
        {
          ...story,
          objects: [
            {
              id: 'obj',
              model: { source: 'catalog' as const, assetId: 'x' },
              x: 1,
              y: 1,
              elevation: 0,
              rotationX: 0,
              rotationY: 0,
              rotationZ: 0,
              scaleX: 2,
              scaleY: 2,
              scaleZ: 2,
              sizeX: 1,
              sizeY: 1,
              sizeZ: 1,
              planHalfX: 1,
              planHalfY: 1,
            },
          ],
        },
      ],
    }
    expect(buildingMeshDeps(before)).toEqual(buildingMeshDeps(after))
  })
})
