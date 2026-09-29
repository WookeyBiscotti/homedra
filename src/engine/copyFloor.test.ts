import { describe, expect, it } from 'vitest'
import { applyFloorCopy, DEFAULT_COPY_FLOOR_OPTIONS } from './copyFloor'
import {
  createEmptyFloor,
  createId,
  defaultMaterialRef,
  type Floor,
} from './types'

function sampleFloor(): Floor {
  const v1 = { id: createId('v'), x: 0, y: 0 }
  const v2 = { id: createId('v'), x: 4, y: 0 }
  const v3 = { id: createId('v'), x: 4, y: 3 }
  const w1 = { id: createId('wall'), a: v1.id, b: v2.id, thickness: 0.2 }
  const w2 = { id: createId('wall'), a: v2.id, b: v3.id, thickness: 0.2 }
  return {
    ...createEmptyFloor('Источник', 0, 2.8),
    vertices: [v1, v2, v3],
    walls: [w1, w2],
    constraints: [
      { id: createId('c'), type: 'fixedLength', wallId: w1.id, length: 4 },
      { id: createId('c'), type: 'fixedPosition', vertexId: v1.id },
    ],
    openings: [
      {
        id: createId('op'),
        wallId: w1.id,
        kind: 'door',
        offset: 1,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
      },
      {
        id: createId('op'),
        wallId: w1.id,
        kind: 'window',
        offset: 2.5,
        width: 1.2,
        height: 1.4,
        sillHeight: 0.9,
      },
      {
        id: createId('op'),
        wallId: w2.id,
        kind: 'passage',
        offset: 1,
        width: 1,
        height: 2.1,
        sillHeight: 0,
      },
    ],
  }
}

describe('applyFloorCopy', () => {
  it('copies walls, constraints and selected openings with new ids', () => {
    const source = sampleFloor()
    const target = createEmptyFloor('Этаж 2', 2.8, 2.8)
    const result = applyFloorCopy(target, source, {
      ...DEFAULT_COPY_FLOOR_OPTIONS,
      stairs: false,
      plates: false,
      boxes: false,
      pipes: false,
      cables: false,
    })

    expect(result.id).toBe(target.id)
    expect(result.name).toBe('Этаж 2')
    expect(result.elevation).toBe(2.8)
    expect(result.vertices).toHaveLength(3)
    expect(result.walls).toHaveLength(2)
    expect(result.constraints).toHaveLength(2)
    expect(result.openings).toHaveLength(3)

    const sourceIds = new Set([
      ...source.vertices.map((v) => v.id),
      ...source.walls.map((w) => w.id),
      ...source.constraints.map((c) => c.id),
      ...source.openings.map((o) => o.id),
    ])
    for (const v of result.vertices) expect(sourceIds.has(v.id)).toBe(false)
    for (const w of result.walls) {
      expect(sourceIds.has(w.id)).toBe(false)
      expect(result.vertices.some((v) => v.id === w.a)).toBe(true)
      expect(result.vertices.some((v) => v.id === w.b)).toBe(true)
    }
    for (const o of result.openings) {
      expect(sourceIds.has(o.id)).toBe(false)
      expect(result.walls.some((w) => w.id === o.wallId)).toBe(true)
    }
  })

  it('filters opening kinds', () => {
    const source = sampleFloor()
    const target = createEmptyFloor('Этаж 2', 2.8, 2.8)
    const result = applyFloorCopy(target, source, {
      walls: true,
      constraints: false,
      doors: true,
      windows: false,
      passages: false,
      stairs: false,
      plates: false,
      boxes: false,
      pipes: false,
      cables: false,
      tiles: false,
    })

    expect(result.constraints).toHaveLength(0)
    expect(result.openings).toHaveLength(1)
    expect(result.openings[0].kind).toBe('door')
  })

  it('copies only walls when openings unchecked', () => {
    const source = sampleFloor()
    const target = createEmptyFloor('Этаж 2', 2.8, 2.8)
    const result = applyFloorCopy(target, source, {
      walls: true,
      constraints: false,
      doors: false,
      windows: false,
      passages: false,
      stairs: false,
      plates: false,
      boxes: false,
      pipes: false,
      cables: false,
      tiles: false,
    })

    expect(result.walls).toHaveLength(2)
    expect(result.openings).toHaveLength(0)
    expect(result.constraints).toHaveLength(0)
  })

  it('copies boxes and remaps cutout box ids', () => {
    const source = sampleFloor()
    source.boxes = [
      { id: 'box1', x: 1, y: 1, width: 1.2, depth: 0.6, elevation: 0, height: 0.4 },
    ]
    source.boxCutouts = [
      {
        id: 'cut1',
        boxId: 'box1',
        x: 1,
        y: 1,
        width: 0.3,
        depth: 0.3,
        elevation: 0,
        height: 0.4,
      },
    ]
    const target = createEmptyFloor('Этаж 2', 2.8, 2.8)
    const result = applyFloorCopy(target, source, {
      walls: false,
      constraints: false,
      doors: false,
      windows: false,
      passages: false,
      stairs: false,
      plates: false,
      boxes: true,
      pipes: false,
      cables: false,
      tiles: false,
    })
    expect(result.boxes).toHaveLength(1)
    expect(result.boxCutouts).toHaveLength(1)
    expect(result.boxes?.[0]?.id).not.toBe('box1')
    expect(result.boxCutouts?.[0]?.boxId).toBe(result.boxes?.[0]?.id)
    expect(result.boxCutouts?.[0]?.id).not.toBe('cut1')
  })

  it('copies tiles and remaps wall and box surface ids', () => {
    const source = sampleFloor()
    const wallId = source.walls[0]!.id
    source.boxes = [
      { id: 'box1', x: 1, y: 1, width: 1.2, depth: 0.6, elevation: 0, height: 0.4 },
    ]
    source.tiles = [
      {
        id: 'tile-floor',
        name: '30×30',
        width: 0.3,
        length: 0.3,
        thickness: 0.008,
        material: defaultMaterialRef('Tiles141', 0.3),
        surface: { type: 'floor' },
        u: 1,
        v: 1,
        rotation: 0,
        groutM: 0.002,
      },
      {
        id: 'tile-wall',
        name: '30×30',
        width: 0.3,
        length: 0.3,
        thickness: 0.008,
        material: defaultMaterialRef('Tiles141', 0.3),
        surface: { type: 'wall', wallId, side: 'pos' },
        u: 0.5,
        v: 0.8,
        rotation: 0,
        groutM: 0.002,
      },
      {
        id: 'tile-box',
        name: '30×30',
        width: 0.3,
        length: 0.3,
        thickness: 0.008,
        material: defaultMaterialRef('Tiles141', 0.3),
        surface: { type: 'box', boxId: 'box1', face: 'top' },
        u: 1,
        v: 1,
        rotation: 0,
        groutM: 0.002,
      },
    ]
    const target = createEmptyFloor('Этаж 2', 2.8, 2.8)
    const result = applyFloorCopy(target, source, {
      ...DEFAULT_COPY_FLOOR_OPTIONS,
      stairs: false,
      plates: false,
      pipes: false,
      cables: false,
    })

    expect(result.tiles).toHaveLength(3)
    const floorTile = result.tiles!.find((t) => t.surface.type === 'floor')
    const wallTile = result.tiles!.find((t) => t.surface.type === 'wall')
    const boxTile = result.tiles!.find((t) => t.surface.type === 'box')
    expect(floorTile?.id).not.toBe('tile-floor')
    expect(wallTile?.id).not.toBe('tile-wall')
    expect(boxTile?.id).not.toBe('tile-box')
    expect(wallTile?.surface.type).toBe('wall')
    if (wallTile?.surface.type === 'wall') {
      const remappedWallId = wallTile.surface.wallId
      expect(remappedWallId).not.toBe(wallId)
      expect(result.walls.some((w) => w.id === remappedWallId)).toBe(true)
    }
    expect(boxTile?.surface.type).toBe('box')
    if (boxTile?.surface.type === 'box') {
      expect(boxTile.surface.boxId).not.toBe('box1')
      expect(boxTile.surface.boxId).toBe(result.boxes?.[0]?.id)
    }
  })
})
