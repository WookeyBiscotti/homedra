import { describe, expect, it } from 'vitest'
import {
  materialRefsEqual,
  replacePaintMaterial,
  replacePaintMaterialOnFloor,
} from './replacePaintMaterial'
import {
  createEmptyBuilding,
  createEmptyFloor,
  createId,
  defaultMaterialRef,
  type Floor,
  type MaterialRef,
} from '../types'

function wood(over: Partial<MaterialRef> = {}): MaterialRef {
  return { ...defaultMaterialRef('Wood048', 1.5), ...over }
}

function floorWithWall(mat: MaterialRef): Floor {
  const a = createId('v')
  const b = createId('v')
  const floor = createEmptyFloor('1')
  return {
    ...floor,
    vertices: [
      { id: a, x: 0, y: 0 },
      { id: b, x: 4, y: 0 },
    ],
    walls: [
      {
        id: createId('w'),
        a,
        b,
        thickness: 0.2,
        materials: { pos: { ...mat }, neg: wood({ tint: '#ff0000' }) },
      },
    ],
    roomFloorMaterials: { room_1: { ...mat } },
    roomCeilingMaterials: { room_1: { ...mat } },
    plates: [
      {
        id: createId('p'),
        x: 1,
        y: 1,
        width: 2,
        depth: 2,
        material: { ...mat },
      },
    ],
  }
}

describe('materialRefsEqual', () => {
  it('compares image, look, and crop', () => {
    expect(materialRefsEqual(wood(), wood())).toBe(true)
    expect(materialRefsEqual(wood(), wood({ roughness: 0.4 }))).toBe(false)
    expect(
      materialRefsEqual(
        wood({ texRegion: { u0: 0.1, v0: 0.1, u1: 0.5, v1: 0.5 } }),
        wood({ texRegion: { u0: 0.1, v0: 0.1, u1: 0.5, v1: 0.5 } }),
      ),
    ).toBe(true)
  })
})

describe('replacePaintMaterialOnFloor', () => {
  it('updates matching wall/floor finishes and leaves others', () => {
    const from = wood({ roughness: 0.5 })
    const to = wood({ roughness: 0.2, tint: '#abcdef' })
    const next = replacePaintMaterialOnFloor(floorWithWall(from), from, to)
    expect(next.walls[0]?.materials?.pos).toEqual(to)
    expect(next.walls[0]?.materials?.neg).toEqual(wood({ tint: '#ff0000' }))
    expect(next.roomFloorMaterials?.room_1).toEqual(to)
    expect(next.roomCeilingMaterials?.room_1).toEqual(to)
    expect(next.plates?.[0]?.material).toEqual(to)
  })

  it('no-ops when nothing matches', () => {
    const floor = floorWithWall(wood())
    expect(replacePaintMaterialOnFloor(floor, wood({ roughness: 0.9 }), wood())).toBe(
      floor,
    )
  })
})

describe('replacePaintMaterial', () => {
  it('walks all floors', () => {
    const from = wood()
    const to = wood({ tileSizeM: 2 })
    const building = createEmptyBuilding()
    building.floors = [floorWithWall(from), createEmptyFloor('2')]
    const next = replacePaintMaterial(building, from, to)
    expect(next.floors[0]?.walls[0]?.materials?.pos?.tileSizeM).toBe(2)
    expect(next.floors[1]).toEqual(building.floors[1])
  })
})
