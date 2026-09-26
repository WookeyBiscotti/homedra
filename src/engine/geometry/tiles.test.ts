import { describe, expect, it } from 'vitest'
import {
  createEmptyFloor,
  createId,
  defaultMaterialRef,
  type Floor,
  type PlacedTile,
  type TileSpec,
  type VolumeBox,
} from '../types'
import {
  cutTileByLine,
  hitFloorTilesInRect,
  polygonArea,
  tileFaceUv,
  tileLocalPolygon,
  tileOverlapsOthers,
} from './tiles'
import { alignFillOrigin, layoutTile, fillTilesOnSurface } from './tileFill'
import { snapTileCenter } from './tileSnap'
import { boxTileContour, wallTileContour, worldToUv, uvToWorld, boxTileFrame } from './tileSurfaces'

const spec: TileSpec = {
  name: '30×30',
  width: 0.3,
  length: 0.3,
  thickness: 0.008,
  material: defaultMaterialRef('Tiles141', 0.3),
}

function boxedRoom(): Floor {
  const v1 = { id: createId('v'), x: 0, y: 0 }
  const v2 = { id: createId('v'), x: 3, y: 0 }
  const v3 = { id: createId('v'), x: 3, y: 2 }
  const v4 = { id: createId('v'), x: 0, y: 2 }
  const w1 = { id: createId('wall'), a: v1.id, b: v2.id, thickness: 0.2 }
  const w2 = { id: createId('wall'), a: v2.id, b: v3.id, thickness: 0.2 }
  const w3 = { id: createId('wall'), a: v3.id, b: v4.id, thickness: 0.2 }
  const w4 = { id: createId('wall'), a: v4.id, b: v1.id, thickness: 0.2 }
  return {
    ...createEmptyFloor('Комната'),
    vertices: [v1, v2, v3, v4],
    walls: [w1, w2, w3, w4],
  }
}

describe('tile layout', () => {
  it('places a full tile inside a room', () => {
    const floor = boxedRoom()
    const tile = layoutTile(spec, { type: 'floor' }, 1.5, 1, 0.002, 0, floor, {
      snap: false,
    })
    expect(tile).toBeTruthy()
    expect(tile?.clip).toBeUndefined()
    expect(tile?.width).toBeCloseTo(0.3)
  })

  it('clips a tile that crosses the room edge', () => {
    const floor = boxedRoom()
    const tile = layoutTile(spec, { type: 'floor' }, 0.05, 1, 0.002, 0, floor, {
      snap: false,
    })
    expect(tile).toBeTruthy()
    expect(tile?.clip).toBeTruthy()
    expect(polygonArea(tileLocalPolygon(tile!))).toBeLessThan(0.3 * 0.3)
  })

  it('rejects a tile entirely outside the room', () => {
    const floor = boxedRoom()
    const tile = layoutTile(spec, { type: 'floor' }, 10, 10, 0.002, 0, floor, {
      snap: false,
    })
    expect(tile).toBeNull()
  })

  it('snaps a tile to a neighbor with grout', () => {
    const floor = boxedRoom()
    const first = layoutTile(spec, { type: 'floor' }, 1.2, 1, 0.002, 0, floor, {
      snap: false,
    })
    expect(first).toBeTruthy()
    floor.tiles = [first!]
    const second = layoutTile(
      spec,
      { type: 'floor' },
      first!.u + 0.31,
      first!.v,
      0.002,
      0,
      floor,
      { snap: true },
    )
    expect(second).toBeTruthy()
    const gap = Math.abs(second!.u - first!.u) - 0.3
    expect(gap).toBeCloseTo(0.002, 3)
  })

  it('does not snap across different surfaces', () => {
    const floor = boxedRoom()
    const wall = floor.walls[0]
    const onFloor: PlacedTile = {
      ...spec,
      id: 'a',
      surface: { type: 'floor' },
      u: 1,
      v: 1,
      rotation: 0,
      groutM: 0.002,
    }
    const onWall: PlacedTile = {
      ...spec,
      id: 'b',
      surface: { type: 'wall', wallId: wall.id, side: 'pos' },
      u: 1.31,
      v: 1,
      rotation: 0,
      groutM: 0.002,
    }
    const snapped = snapTileCenter(onWall, [onFloor], null, { groutM: 0.002 })
    expect(snapped.u).toBeCloseTo(1.31)
  })

  it('detects overlap of two tiles', () => {
    const a: PlacedTile = {
      ...spec,
      id: 'a',
      surface: { type: 'floor' },
      u: 1,
      v: 1,
      rotation: 0,
      groutM: 0.002,
    }
    const b: PlacedTile = {
      ...spec,
      id: 'b',
      surface: { type: 'floor' },
      u: 1.05,
      v: 1,
      rotation: 0,
      groutM: 0.002,
    }
    expect(tileOverlapsOthers(b, [a])).toBe(true)
    const c: PlacedTile = {
      ...spec,
      id: 'c',
      surface: { type: 'floor' },
      u: 1.4,
      v: 1,
      rotation: 0,
      groutM: 0.002,
    }
    expect(tileOverlapsOthers(c, [a])).toBe(false)
  })

  it('line-cut keeps one side and can keep both', () => {
    const tile: PlacedTile = {
      ...spec,
      id: 't',
      surface: { type: 'floor' },
      u: 1,
      v: 1,
      rotation: 0,
      groutM: 0.002,
    }
    const one = cutTileByLine(
      tile,
      { x: 1, y: 0 },
      { x: 1, y: 2 },
      { x: 0.8, y: 1 },
      false,
    )
    expect(one).toHaveLength(1)
    expect(polygonArea(tileLocalPolygon(one[0]))).toBeLessThan(0.3 * 0.3)
    const both = cutTileByLine(
      tile,
      { x: 1, y: 0 },
      { x: 1, y: 2 },
      { x: 0.8, y: 1 },
      true,
    )
    expect(both).toHaveLength(2)
  })

  it('maps a face point through a texture region', () => {
    const full = tileFaceUv(0.5, 0.25)
    expect(full.u).toBeCloseTo(0.5)
    expect(full.v).toBeCloseTo(0.25)
    const cropped = tileFaceUv(0, 0, { u0: 0.2, v0: 0.1, u1: 0.6, v1: 0.5 })
    expect(cropped.u).toBeCloseTo(0.2)
    expect(cropped.v).toBeCloseTo(0.5)
    const croppedMax = tileFaceUv(1, 1, { u0: 0.2, v0: 0.1, u1: 0.6, v1: 0.5 })
    expect(croppedMax.u).toBeCloseTo(0.6)
    expect(croppedMax.v).toBeCloseTo(0.9)
  })
})

describe('tile fill', () => {
  it('fills a room in a straight grid with grout', () => {
    const floor = boxedRoom()
    const tiles = fillTilesOnSurface(
      spec,
      { type: 'floor' },
      1.5,
      1,
      0.002,
      0,
      'straight',
      floor,
    )
    expect(tiles.length).toBeGreaterThan(8)
    const areas = tiles.map((t) => polygonArea(tileLocalPolygon(t)))
    expect(areas.some((a) => a < 0.3 * 0.3 - 1e-4)).toBe(true)
    for (let i = 0; i < tiles.length; i++) {
      expect(tileOverlapsOthers(tiles[i], tiles, tiles[i].id)).toBe(false)
    }
  })

  it('offset pattern shifts every other row', () => {
    const floor = boxedRoom()
    const tiles = fillTilesOnSurface(
      spec,
      { type: 'floor' },
      1.5,
      1,
      0.002,
      0,
      'offset',
      floor,
    )
    const us = [...new Set(tiles.map((t) => t.u.toFixed(3)))].sort()
    expect(us.length).toBeGreaterThan(2)
  })

  it('skips already laid tiles', () => {
    const floor = boxedRoom()
    const first = layoutTile(spec, { type: 'floor' }, 1.5, 1, 0.002, 0, floor, {
      snap: false,
    })
    floor.tiles = [first!]
    const more = fillTilesOnSurface(
      spec,
      { type: 'floor' },
      1.5,
      1,
      0.002,
      0,
      'straight',
      floor,
    )
    expect(more.every((t) => t.id !== first!.id)).toBe(true)
    expect(tileOverlapsOthers(first!, more)).toBe(false)
  })

  it('aligns leftover fill to already laid tiles', () => {
    const floor = boxedRoom()
    const first = layoutTile(spec, { type: 'floor' }, 1.2, 0.8, 0.002, 0, floor, {
      snap: false,
    })
    expect(first).toBeTruthy()
    const origin = alignFillOrigin(
      spec,
      { type: 'floor' },
      2.4,
      1.5,
      0.002,
      0,
      [first!],
    )
    expect(origin.u).toBeCloseTo(first!.u)
    expect(origin.v).toBeCloseTo(first!.v)
    floor.tiles = [first!]
    const more = fillTilesOnSurface(
      spec,
      { type: 'floor' },
      2.4,
      1.5,
      0.002,
      0,
      'straight',
      floor,
    )
    const aligned = more.find((t) => Math.abs(t.v - first!.v) < 1e-6)
    expect(aligned).toBeTruthy()
    const gap = Math.abs(aligned!.u - first!.u)
    const step = 0.3 + 0.002
    const n = Math.round(gap / step)
    expect(gap).toBeCloseTo(n * step, 5)
  })
})

describe('tile surfaces', () => {
  it('clips wall tiles around a window', () => {
    const floor = boxedRoom()
    const wall = floor.walls[0]
    floor.openings = [
      {
        id: createId('op'),
        wallId: wall.id,
        kind: 'window',
        offset: 1.5,
        width: 1,
        height: 1.2,
        sillHeight: 0.8,
      },
    ]
    const contour = wallTileContour(floor, wall.id, 'neg')
    expect(contour).toBeTruthy()
    expect(contour!.holes.length).toBeGreaterThan(0)
    const tile = layoutTile(
      spec,
      { type: 'wall', wallId: wall.id, side: 'neg' },
      1.0,
      0.7,
      0.002,
      0,
      floor,
      { snap: false, contour },
    )
    expect(tile).toBeTruthy()
    expect(tile?.clip).toBeTruthy()
  })

  it('clips box-face tiles around a cutout', () => {
    const floor = boxedRoom()
    const box: VolumeBox = {
      id: 'box1',
      x: 1.5,
      y: 1,
      width: 1.2,
      depth: 0.6,
      elevation: 0,
      height: 0.4,
    }
    floor.boxes = [box]
    floor.boxCutouts = [
      {
        id: 'cut1',
        boxId: 'box1',
        x: 1.5,
        y: 1,
        width: 0.3,
        depth: 0.3,
        elevation: 0,
        height: 0.4,
      },
    ]
    const contour = boxTileContour(floor, box, 'top')
    expect(contour.holes.length).toBeGreaterThan(0)
    const tile = layoutTile(
      spec,
      { type: 'box', boxId: box.id, face: 'top' },
      0.3,
      0.15,
      0.002,
      0,
      floor,
      { snap: false, contour },
    )
    expect(tile).toBeTruthy()
  })

  it('round-trips box face UV', () => {
    const floor = boxedRoom()
    const box: VolumeBox = {
      id: 'box1',
      x: 2,
      y: 1,
      width: 1,
      depth: 0.8,
      elevation: 0.2,
      height: 0.5,
    }
    const frame = boxTileFrame(floor, box, 'posX')
    const world = uvToWorld(frame, 0.4, 0.25, 0)
    const uv = worldToUv(frame, world)
    expect(uv.u).toBeCloseTo(0.4, 5)
    expect(uv.v).toBeCloseTo(0.25, 5)
  })

  it('hits several floor tiles inside a marquee', () => {
    const floor = boxedRoom()
    const a = layoutTile(spec, { type: 'floor' }, 0.8, 0.8, 0.002, 0, floor, {
      snap: false,
    })
    const withA = { ...floor, tiles: a ? [a] : [] }
    const b = layoutTile(spec, { type: 'floor' }, 1.6, 0.8, 0.002, 0, withA, {
      snap: false,
    })
    const filled = { ...withA, tiles: [a, b].filter((t): t is PlacedTile => !!t) }
    const hits = hitFloorTilesInRect(filled, 0.4, 0.4, 2, 1.2)
    expect(hits).toHaveLength(2)
    expect(hitFloorTilesInRect(filled, 2.4, 0, 2.9, 0.4)).toHaveLength(0)
  })
})
