import { describe, expect, it } from 'vitest'
import {
  createEmptyFloor,
  createId,
  defaultMaterialRef,
  keepMaterialLook,
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
  tileLocalRect,
  tileOverlapsOthers,
} from './tiles'
import { alignFillOrigin, layoutTile, fillTilesOnSurface } from './tileFill'
import { snapFillOriginToFaces, snapTileCenter } from './tileSnap'
import {
  boxTileContour,
  boxTileFrame,
  floorTileFrame,
  tileSurfaceContour,
  wallTileContour,
  wallTileFrame,
  worldToUv,
  uvToWorld,
} from './tileSurfaces'
import { buildTileGeometry, TILE_SURFACE_LIFT } from './tileMesh'

const spec: TileSpec = {
  name: '30×30',
  width: 0.3,
  length: 0.3,
  thickness: 0.008,
  material: defaultMaterialRef('Tiles141', 0.3),
}

function boxedRoom(width = 3, depth = 2): Floor {
  const v1 = { id: createId('v'), x: 0, y: 0 }
  const v2 = { id: createId('v'), x: width, y: 0 }
  const v3 = { id: createId('v'), x: width, y: depth }
  const v4 = { id: createId('v'), x: 0, y: depth }
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

  it('clips a leftover strip beside already laid tiles', () => {
    const floor = boxedRoom()
    const first = layoutTile(spec, { type: 'floor' }, 0.4, 1, 0.002, 0, floor, {
      snap: false,
    })
    expect(first).toBeTruthy()
    expect(first?.clip).toBeUndefined()
    floor.tiles = [first!]
    const leftover = layoutTile(spec, { type: 'floor' }, 0.1, 1, 0.002, 0, floor, {
      snap: false,
    })
    expect(leftover).toBeTruthy()
    expect(leftover?.clip).toBeTruthy()
    expect(leftover?.u).toBeCloseTo(0.1)
    expect(leftover?.v).toBeCloseTo(1)
    expect(tileOverlapsOthers(leftover!, [first!])).toBe(false)
    const area = polygonArea(tileLocalPolygon(leftover!))
    expect(area).toBeLessThan(0.3 * 0.3)
    expect(area).toBeGreaterThan(0.01)
    const xs = leftover!.clip!.map((p) => p.x)
    expect(Math.max(...xs)).toBeLessThan(first!.u - 0.15 + 1e-3)
  })

  it('clips a leftover strip even when snap flushes to a neighbor', () => {
    const floor = boxedRoom()
    const first = layoutTile(spec, { type: 'floor' }, 0.4, 1, 0.002, 0, floor, {
      snap: false,
    })
    floor.tiles = [first!]
    const leftover = layoutTile(spec, { type: 'floor' }, 0.12, 1, 0.002, 0, floor, {
      snap: true,
    })
    expect(leftover).toBeTruthy()
    expect(leftover?.clip).toBeTruthy()
    expect(tileOverlapsOthers(leftover!, [first!])).toBe(false)
    expect(polygonArea(tileLocalPolygon(leftover!))).toBeGreaterThan(0.01)
  })

  it('rejects a click that sits entirely on an existing tile', () => {
    const floor = boxedRoom()
    const first = layoutTile(spec, { type: 'floor' }, 1.5, 1, 0.002, 0, floor, {
      snap: false,
    })
    floor.tiles = [first!]
    const again = layoutTile(spec, { type: 'floor' }, 1.5, 1, 0.002, 0, floor, {
      snap: false,
    })
    expect(again).toBeNull()
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

  it('fills a large empty room without clipping every cell against siblings', () => {
    const floor = boxedRoom(6, 4)
    const started = performance.now()
    const tiles = fillTilesOnSurface(
      spec,
      { type: 'floor' },
      3,
      2,
      0.002,
      0,
      'straight',
      floor,
    )
    const elapsed = performance.now() - started
    expect(tiles.length).toBeGreaterThan(150)
    for (let i = 0; i < tiles.length; i++) {
      expect(tileOverlapsOthers(tiles[i]!, tiles, tiles[i]!.id)).toBe(false)
    }
    expect(elapsed).toBeLessThan(400)
  })

  it('fills only the clicked horizontal row', () => {
    const floor = boxedRoom()
    const tiles = fillTilesOnSurface(
      spec,
      { type: 'floor' },
      1.5,
      1,
      0.002,
      0,
      'horizontal',
      floor,
    )
    expect(tiles.length).toBeGreaterThan(4)
    expect(tiles.length).toBeLessThan(20)
    const vs = new Set(tiles.map((t) => t.v.toFixed(3)))
    expect(vs.size).toBe(1)
    expect(Number([...vs][0])).toBeCloseTo(1, 2)
    for (let i = 0; i < tiles.length; i++) {
      expect(tileOverlapsOthers(tiles[i]!, tiles, tiles[i]!.id)).toBe(false)
    }
  })

  it('fills only the clicked vertical column', () => {
    const floor = boxedRoom()
    const tiles = fillTilesOnSurface(
      spec,
      { type: 'floor' },
      1.5,
      1,
      0.002,
      0,
      'vertical',
      floor,
    )
    expect(tiles.length).toBeGreaterThan(3)
    expect(tiles.length).toBeLessThan(16)
    const us = new Set(tiles.map((t) => t.u.toFixed(3)))
    expect(us.size).toBe(1)
    expect(Number([...us][0])).toBeCloseTo(1.5, 2)
    for (let i = 0; i < tiles.length; i++) {
      expect(tileOverlapsOthers(tiles[i]!, tiles, tiles[i]!.id)).toBe(false)
    }
  })

  it('fills leftover next to already laid tiles', () => {
    const floor = boxedRoom()
    const first = layoutTile(spec, { type: 'floor' }, 0.4, 1, 0.002, 0, floor, {
      snap: false,
    })
    floor.tiles = [first!]
    const more = fillTilesOnSurface(
      spec,
      { type: 'floor' },
      0.4,
      1,
      0.002,
      0,
      'straight',
      floor,
    )
    expect(tileOverlapsOthers(first!, more)).toBe(false)
    const leftover = more.find((t) => t.u < 0.4 && Math.abs(t.v - 1) < 1e-6)
    expect(leftover).toBeTruthy()
    expect(leftover?.clip).toBeTruthy()
    expect(polygonArea(tileLocalPolygon(leftover!))).toBeGreaterThan(0.01)
  })

  it('snaps empty-room fill to wall faces', () => {
    const floor = boxedRoom()
    const grout = 0.002
    const tiles = fillTilesOnSurface(
      spec,
      { type: 'floor' },
      1.5,
      1,
      grout,
      0,
      'straight',
      floor,
      { snap: true },
    )
    expect(tiles.length).toBeGreaterThan(8)
    const contour = tileSurfaceContour(floor, { type: 'floor' }, { u: 1.5, v: 1 })
    expect(contour).toBeTruthy()
    const xs = contour!.outer.map((p) => p.x)
    const ys = contour!.outer.map((p) => p.y)
    const edgesU = [Math.min(...xs), Math.max(...xs)]
    const edgesV = [Math.min(...ys), Math.max(...ys)]
    let bestU = Infinity
    let bestV = Infinity
    for (const t of tiles) {
      const r = tileLocalRect(t)
      for (const e of edgesU) {
        bestU = Math.min(
          bestU,
          Math.abs(r.minU - (e + grout)),
          Math.abs(r.maxU - (e - grout)),
        )
      }
      for (const e of edgesV) {
        bestV = Math.min(
          bestV,
          Math.abs(r.minV - (e + grout)),
          Math.abs(r.maxV - (e - grout)),
        )
      }
    }
    expect(bestU).toBeLessThan(1e-4)
    expect(bestV).toBeLessThan(1e-4)
  })

  it('snaps empty-wall fill to the floor', () => {
    const floor = boxedRoom()
    const wall = floor.walls[0]!
    const grout = 0.002
    const tiles = fillTilesOnSurface(
      spec,
      { type: 'wall', wallId: wall.id, side: 'neg' },
      1.5,
      1.2,
      grout,
      0,
      'straight',
      floor,
      { snap: true },
    )
    expect(tiles.length).toBeGreaterThan(4)
    let bestFloor = Infinity
    for (const t of tiles) {
      const r = tileLocalRect(t)
      bestFloor = Math.min(bestFloor, Math.abs(r.minV - grout))
    }
    expect(bestFloor).toBeLessThan(1e-4)
  })

  it('keeps leftover fill on existing tiles when snap is on', () => {
    const floor = boxedRoom()
    const first = layoutTile(spec, { type: 'floor' }, 1.2, 0.8, 0.002, 0, floor, {
      snap: false,
    })
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
      { snap: true },
    )
    const aligned = more.find((t) => Math.abs(t.v - first!.v) < 1e-6)
    expect(aligned).toBeTruthy()
    const gap = Math.abs(aligned!.u - first!.u)
    const step = 0.3 + 0.002
    const n = Math.round(gap / step)
    expect(gap).toBeCloseTo(n * step, 5)
  })

  it('phase-aligns a fill origin to contour faces', () => {
    const contour = {
      outer: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 2 },
        { x: 0, y: 2 },
      ],
      holes: [],
    }
    const grout = 0.002
    const half = 0.15
    const step = 0.302
    const snapped = snapFillOriginToFaces(1.5, 1, step, step, half, half, grout, contour)
    const onPhase = (value: number, flush: number) => {
      const n = Math.round((value - flush) / step)
      return Math.abs(value - (flush + n * step)) < 1e-6
    }
    expect(
      onPhase(snapped.u, grout + half) || onPhase(snapped.u, 3 - grout - half),
    ).toBe(true)
    expect(
      onPhase(snapped.v, grout + half) || onPhase(snapped.v, 2 - grout - half),
    ).toBe(true)
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

  it('extrudes a wall tile outward from the face, not into the solid', () => {
    const floor = boxedRoom()
    const wall = floor.walls[0]
    const frame = wallTileFrame(floor, wall.id, 'pos')
    expect(frame).toBeTruthy()
    const tile: PlacedTile = {
      ...spec,
      id: 'wall-tile',
      surface: { type: 'wall', wallId: wall.id, side: 'pos' },
      u: 1.5,
      v: 1.2,
      rotation: 0,
      groutM: 0.002,
    }
    const geo = buildTileGeometry(tile, frame!)
    expect(geo).toBeTruthy()
    const pos = geo!.attributes.position
    let minN = Infinity
    let maxN = -Infinity
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - frame!.origin.x
      const dy = pos.getY(i) - frame!.origin.y
      const dz = pos.getZ(i) - frame!.origin.z
      const n =
        dx * frame!.nDir.x + dy * frame!.nDir.y + dz * frame!.nDir.z
      minN = Math.min(minN, n)
      maxN = Math.max(maxN, n)
    }
    expect(minN).toBeGreaterThanOrEqual(TILE_SURFACE_LIFT - 1e-6)
    expect(maxN).toBeCloseTo(TILE_SURFACE_LIFT + spec.thickness, 5)
    const nrm = geo!.attributes.normal
    const mid = TILE_SURFACE_LIFT + spec.thickness / 2
    let nx = 0
    let ny = 0
    let nz = 0
    let count = 0
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - frame!.origin.x
      const dy = pos.getY(i) - frame!.origin.y
      const dz = pos.getZ(i) - frame!.origin.z
      const n =
        dx * frame!.nDir.x + dy * frame!.nDir.y + dz * frame!.nDir.z
      if (n < mid) continue
      nx += nrm.getX(i)
      ny += nrm.getY(i)
      nz += nrm.getZ(i)
      count++
    }
    expect(count).toBeGreaterThan(0)
    const len = Math.hypot(nx, ny, nz) || 1
    expect(nx / len).toBeCloseTo(frame!.nDir.x, 2)
    expect(ny / len).toBeCloseTo(frame!.nDir.y, 2)
    expect(nz / len).toBeCloseTo(frame!.nDir.z, 2)
    geo!.dispose()
  })

  it('keeps a floor tile front facing up', () => {
    const floor = boxedRoom()
    const frame = floorTileFrame(floor)
    const tile = layoutTile(spec, { type: 'floor' }, 1.5, 1, 0.002, 0, floor, {
      snap: false,
    })
    expect(tile).toBeTruthy()
    const geo = buildTileGeometry(tile!, frame)
    expect(geo).toBeTruthy()
    const pos = geo!.attributes.position
    const nrm = geo!.attributes.normal
    const topY = frame.origin.y + TILE_SURFACE_LIFT + spec.thickness
    let topCount = 0
    for (let i = 0; i < pos.count; i++) {
      if (nrm.getY(i) < 0.7) continue
      expect(pos.getY(i)).toBeCloseTo(topY, 3)
      topCount++
    }
    expect(topCount).toBeGreaterThan(0)
    geo!.dispose()
  })

  it('writes 0–1 stamp UVs so a rectangular wall tile is not stretched', () => {
    const floor = boxedRoom()
    const wall = floor.walls[0]
    const wallFrame = wallTileFrame(floor, wall.id, 'pos')
    expect(wallFrame).toBeTruthy()
    const wide: PlacedTile = {
      ...spec,
      name: '120×60',
      width: 1.2,
      length: 0.6,
      id: 'wide-wall',
      surface: { type: 'wall', wallId: wall.id, side: 'pos' },
      u: 1.5,
      v: 1.2,
      rotation: 0,
      groutM: 0.002,
    }
    const wallGeo = buildTileGeometry(wide, wallFrame!)
    expect(wallGeo).toBeTruthy()
    const uv = wallGeo!.attributes.uv
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (let i = 0; i < uv.count; i++) {
      minU = Math.min(minU, uv.getX(i))
      maxU = Math.max(maxU, uv.getX(i))
      minV = Math.min(minV, uv.getY(i))
      maxV = Math.max(maxV, uv.getY(i))
    }
    expect(minU).toBeCloseTo(0, 2)
    expect(minV).toBeCloseTo(0, 2)
    expect(maxU).toBeCloseTo(1, 2)
    expect(maxV).toBeCloseTo(1, 2)
    wallGeo!.dispose()

    const floorFrame = floorTileFrame(floor)
    const onFloor = { ...wide, id: 'wide-floor', surface: { type: 'floor' } as const }
    const floorGeo = buildTileGeometry(onFloor, floorFrame)
    expect(floorGeo).toBeTruthy()
    const fuv = floorGeo!.attributes.uv
    minU = Infinity
    maxU = -Infinity
    minV = Infinity
    maxV = -Infinity
    for (let i = 0; i < fuv.count; i++) {
      minU = Math.min(minU, fuv.getX(i))
      maxU = Math.max(maxU, fuv.getX(i))
      minV = Math.min(minV, fuv.getY(i))
      maxV = Math.max(maxV, fuv.getY(i))
    }
    expect(minU).toBeCloseTo(0, 2)
    expect(minV).toBeCloseTo(0, 2)
    expect(maxU).toBeCloseTo(1, 2)
    expect(maxV).toBeCloseTo(1, 2)
    floorGeo!.dispose()

    const cropped = {
      ...wide,
      id: 'wide-crop',
      texRegion: { u0: 0.1, v0: 0.1, u1: 0.4, v1: 0.4 },
    }
    const cropGeo = buildTileGeometry(cropped, wallFrame!)
    expect(cropGeo).toBeTruthy()
    const cuv = cropGeo!.attributes.uv
    minU = Infinity
    maxU = -Infinity
    minV = Infinity
    maxV = -Infinity
    for (let i = 0; i < cuv.count; i++) {
      minU = Math.min(minU, cuv.getX(i))
      maxU = Math.max(maxU, cuv.getX(i))
      minV = Math.min(minV, cuv.getY(i))
      maxV = Math.max(maxV, cuv.getY(i))
    }
    expect(minU).toBeCloseTo(0, 2)
    expect(minV).toBeCloseTo(0, 2)
    expect(maxU).toBeCloseTo(1, 2)
    expect(maxV).toBeCloseTo(1, 2)
    cropGeo!.dispose()
  })

  it('keeps stamp UVs aligned to the tile axes after winding flip', () => {
    const floor = boxedRoom()
    const wall = floor.walls[0]
    const frame = wallTileFrame(floor, wall.id, 'pos')
    expect(frame).toBeTruthy()
    const tile: PlacedTile = {
      ...spec,
      id: 'uv-align',
      surface: { type: 'wall', wallId: wall.id, side: 'pos' },
      u: 1.5,
      v: 1.2,
      rotation: 0,
      groutM: 0.002,
    }
    const geo = buildTileGeometry(tile, frame!)
    expect(geo).toBeTruthy()
    const bounds = tileLocalRect(tile)
    const faceW = bounds.maxU - bounds.minU
    const faceH = bounds.maxV - bounds.minV
    const pos = geo!.attributes.position
    const uv = geo!.attributes.uv
    let checked = 0
    for (let i = 0; i < pos.count; i++) {
      const local = worldToUv(frame!, {
        x: pos.getX(i),
        y: pos.getY(i),
        z: pos.getZ(i),
      })
      const tu = (local.u - bounds.minU) / faceW
      const tv = (local.v - bounds.minV) / faceH
      if (tu < -0.05 || tu > 1.05 || tv < -0.05 || tv > 1.05) continue
      expect(uv.getX(i)).toBeCloseTo(Math.min(1, Math.max(0, tu)), 2)
      expect(uv.getY(i)).toBeCloseTo(Math.min(1, Math.max(0, tv)), 2)
      checked++
    }
    expect(checked).toBeGreaterThan(8)
    geo!.dispose()
  })
})

describe('keepMaterialLook', () => {
  it('copies PBR sliders onto a newly picked texture', () => {
    const tuned = defaultMaterialRef('Tiles141', 0.3)
    tuned.roughness = 0.4
    tuned.metalness = 0.2
    tuned.normalScale = 1.2
    tuned.tint = '#ffe8d0'
    const next = defaultMaterialRef('WoodFloor051', 0.4)
    const kept = keepMaterialLook(tuned, next)
    expect(kept.assetId).toBe('WoodFloor051')
    expect(kept.tileSizeM).toBe(0.4)
    expect(kept.roughness).toBe(0.4)
    expect(kept.metalness).toBe(0.2)
    expect(kept.normalScale).toBe(1.2)
    expect(kept.tint).toBe('#ffe8d0')
  })
})
