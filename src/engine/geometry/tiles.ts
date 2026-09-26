import polygonClipping from 'polygon-clipping'
import {
  createId,
  MIN_TILE_AREA,
  normalizePlacedTile,
  normalizeTileRotation,
  normalizeTileTexRegion,
  sameTileSurface,
  tileAxesSwapped,
  type Floor,
  type Id,
  type PlacedTile,
  type TileSpec,
  type TileSurface,
  type TileTexRegion,
} from '../types'
import {
  tileSurfaceContour,
  type TileContour,
  type TilePoint,
} from './tileSurfaces'

export type TileRect = {
  minU: number
  maxU: number
  minV: number
  maxV: number
}

export function tileFootprintSize(tile: Pick<PlacedTile, 'width' | 'length' | 'rotation'>): {
  width: number
  length: number
} {
  if (tileAxesSwapped(tile.rotation)) {
    return { width: tile.length, length: tile.width }
  }
  return { width: tile.width, length: tile.length }
}

export function tileLocalRect(
  tile: Pick<PlacedTile, 'u' | 'v' | 'width' | 'length' | 'rotation'>,
): TileRect {
  const { width, length } = tileFootprintSize(tile)
  return {
    minU: tile.u - width / 2,
    maxU: tile.u + width / 2,
    minV: tile.v - length / 2,
    maxV: tile.v + length / 2,
  }
}

export function tileFullPolygon(
  tile: Pick<PlacedTile, 'u' | 'v' | 'width' | 'length' | 'rotation'>,
): TilePoint[] {
  const r = tileLocalRect(tile)
  return [
    { x: r.minU, y: r.minV },
    { x: r.maxU, y: r.minV },
    { x: r.maxU, y: r.maxV },
    { x: r.minU, y: r.maxV },
  ]
}

export function tileLocalPolygon(tile: PlacedTile): TilePoint[] {
  if (tile.clip && tile.clip.length >= 3) return tile.clip.map((p) => ({ ...p }))
  return tileFullPolygon(tile)
}

/** Map a point on the unclipped tile face (0–1) into the chosen texture region.
 * `tv` is 0 at the local-V min; image-space v=0 is the top of the texture. */
export function tileFaceUv(
  tu: number,
  tv: number,
  region?: TileTexRegion | null,
): { u: number; v: number } {
  const r = normalizeTileTexRegion(region)
  return {
    u: r.u0 + tu * (r.u1 - r.u0),
    v: 1 - r.v1 + tv * (r.v1 - r.v0),
  }
}

export function polygonArea(poly: TilePoint[]): number {
  if (poly.length < 3) return 0
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

function toRing(poly: TilePoint[]): [number, number][] {
  const ring: [number, number][] = poly.map((p) => [p.x, p.y])
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (
    first &&
    last &&
    (first[0] !== last[0] || first[1] !== last[1])
  ) {
    ring.push([first[0], first[1]])
  }
  return ring
}

function fromMulti(
  multi: [number, number][][][],
): TilePoint[][] {
  const out: TilePoint[][] = []
  for (const poly of multi) {
    const outer = poly[0]
    if (!outer || outer.length < 4) continue
    const pts = outer.slice(0, -1).map(([x, y]) => ({ x, y }))
    if (pts.length >= 3) out.push(pts)
  }
  return out
}

function contourGeom(contour: TileContour): [number, number][][] {
  return [toRing(contour.outer), ...contour.holes.map(toRing)]
}

export function clipPolygonToContour(
  poly: TilePoint[],
  contour: TileContour,
): TilePoint[] | null {
  if (poly.length < 3 || contour.outer.length < 3) return null
  try {
    const result = polygonClipping.intersection(
      [toRing(poly)],
      contourGeom(contour),
    ) as [number, number][][][]
    const pieces = fromMulti(result)
    if (pieces.length === 0) return null
    let best = pieces[0]
    let bestA = polygonArea(best)
    for (let i = 1; i < pieces.length; i++) {
      const a = polygonArea(pieces[i])
      if (a > bestA) {
        best = pieces[i]
        bestA = a
      }
    }
    if (bestA < MIN_TILE_AREA) return null
    return best
  } catch {
    return null
  }
}

export function polygonsOverlap(
  a: TilePoint[],
  b: TilePoint[],
  eps = 1e-5,
): boolean {
  if (a.length < 3 || b.length < 3) return false
  try {
    const result = polygonClipping.intersection([toRing(a)], [toRing(b)]) as
      [number, number][][][]
    const pieces = fromMulti(result)
    return pieces.some((p) => polygonArea(p) > eps)
  } catch {
    return false
  }
}

export function excludedTileIds(opts?: {
  excludeId?: string
  excludeIds?: string[]
}): Set<string> {
  const ids = new Set(opts?.excludeIds ?? [])
  if (opts?.excludeId) ids.add(opts.excludeId)
  return ids
}

export function tileOverlapsOthers(
  tile: PlacedTile,
  others: PlacedTile[],
  excludeId?: string | string[],
): boolean {
  const skip = new Set(Array.isArray(excludeId) ? excludeId : excludeId ? [excludeId] : [])
  const poly = tileLocalPolygon(tile)
  for (const other of others) {
    if (skip.has(other.id)) continue
    if (!sameTileSurface(tile.surface, other.surface)) continue
    if (polygonsOverlap(poly, tileLocalPolygon(other))) return true
  }
  return false
}

export function applyTileClip(
  tile: PlacedTile,
  contour: TileContour | null,
): PlacedTile | null {
  const full = tileFullPolygon(tile)
  if (!contour) {
    return { ...tile, clip: undefined }
  }
  const clipped = clipPolygonToContour(full, contour)
  if (!clipped) return null
  const fullArea = polygonArea(full)
  const clippedArea = polygonArea(clipped)
  if (clippedArea < MIN_TILE_AREA) return null
  if (clippedArea > fullArea - 1e-6) {
    return { ...tile, clip: undefined }
  }
  return { ...tile, clip: clipped }
}

export function createPlacedTile(
  spec: TileSpec,
  surface: TileSurface,
  u: number,
  v: number,
  groutM: number,
  rotation: number,
): PlacedTile {
  return normalizePlacedTile({
    ...spec,
    material: { ...spec.material },
    surface,
    u,
    v,
    groutM,
    rotation: normalizeTileRotation(rotation),
    id: createId('tile'),
  })
}

export function hitTile(
  floor: Floor,
  surface: TileSurface,
  u: number,
  v: number,
): PlacedTile | undefined {
  const tiles = floor.tiles ?? []
  for (let i = tiles.length - 1; i >= 0; i--) {
    const tile = tiles[i]
    if (!sameTileSurface(tile.surface, surface)) continue
    if (pointInPolygon(u, v, tileLocalPolygon(tile))) return tile
  }
  return undefined
}

export function hitFloorTile(floor: Floor, x: number, y: number): PlacedTile | undefined {
  return hitTile(floor, { type: 'floor' }, x, y)
}

export function hitFloorTilesInRect(
  floor: Floor,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): PlacedTile[] {
  const x0 = Math.min(minX, maxX)
  const x1 = Math.max(minX, maxX)
  const y0 = Math.min(minY, maxY)
  const y1 = Math.max(minY, maxY)
  return (floor.tiles ?? []).filter((tile) => {
    if (tile.surface.type !== 'floor') return false
    const poly = tileLocalPolygon(tile)
    if (poly.length === 0) return false
    let minTx = Infinity
    let maxTx = -Infinity
    let minTy = Infinity
    let maxTy = -Infinity
    for (const p of poly) {
      if (p.x < minTx) minTx = p.x
      if (p.x > maxTx) maxTx = p.x
      if (p.y < minTy) minTy = p.y
      if (p.y > maxTy) maxTy = p.y
    }
    return !(maxTx < x0 || minTx > x1 || maxTy < y0 || minTy > y1)
  })
}

export function pointInPolygon(
  x: number,
  y: number,
  poly: TilePoint[],
): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    if (Math.abs(yj - yi) < 1e-15) continue
    const t = ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (yi > y !== yj > y && x < t) inside = !inside
  }
  return inside
}

export function updateTileFields(
  floor: Floor,
  id: Id,
  patch: Partial<
    Pick<
      PlacedTile,
      | 'name'
      | 'width'
      | 'length'
      | 'thickness'
      | 'material'
      | 'u'
      | 'v'
      | 'rotation'
      | 'groutM'
      | 'clip'
      | 'texRegion'
    >
  >,
): Floor {
  const tiles = (floor.tiles ?? []).map((t) => {
    if (t.id !== id) return t
    return normalizePlacedTile({ ...t, ...patch, id: t.id })
  })
  return { ...floor, tiles }
}

export function moveTile(floor: Floor, id: Id, u: number, v: number): Floor {
  return updateTileFields(floor, id, { u, v })
}

export function removeTile(floor: Floor, id: Id): Floor {
  return {
    ...floor,
    tiles: (floor.tiles ?? []).filter((t) => t.id !== id),
  }
}

export function removeTiles(floor: Floor, ids: Id[]): Floor {
  const skip = new Set(ids)
  return {
    ...floor,
    tiles: (floor.tiles ?? []).filter((t) => !skip.has(t.id)),
  }
}

export function removeTilesForWall(floor: Floor, wallId: Id): Floor {
  return {
    ...floor,
    tiles: (floor.tiles ?? []).filter(
      (t) => !(t.surface.type === 'wall' && t.surface.wallId === wallId),
    ),
  }
}

export function removeTilesForBox(floor: Floor, boxId: Id): Floor {
  return {
    ...floor,
    tiles: (floor.tiles ?? []).filter(
      (t) => !(t.surface.type === 'box' && t.surface.boxId === boxId),
    ),
  }
}

export function clearTileClip(floor: Floor, id: Id): Floor {
  const tiles = (floor.tiles ?? []).map((t) =>
    t.id === id ? { ...t, clip: undefined } : t,
  )
  return { ...floor, tiles }
}

export function addTiles(floor: Floor, tiles: PlacedTile[]): Floor {
  return { ...floor, tiles: [...(floor.tiles ?? []), ...tiles] }
}

export function tileCentroid(poly: TilePoint[]): TilePoint {
  let x = 0
  let y = 0
  for (const p of poly) {
    x += p.x
    y += p.y
  }
  const n = poly.length || 1
  return { x: x / n, y: y / n }
}

/** Split a tile by a line in UV. `keep` is a point on the side to keep. */
export function cutTileByLine(
  tile: PlacedTile,
  a: TilePoint,
  b: TilePoint,
  keep: TilePoint,
  keepBoth: boolean,
): PlacedTile[] {
  const poly = tileLocalPolygon(tile)
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.hypot(dx, dy) < 1e-6) return [tile]
  const nx = -dy
  const ny = dx
  const keepSide = Math.sign((keep.x - a.x) * nx + (keep.y - a.y) * ny) || 1

  const half = (sign: number): TilePoint[] | null => {
    const far = 1e4
    const hx = a.x + (nx / Math.hypot(nx, ny)) * far * sign
    const hy = a.y + (ny / Math.hypot(nx, ny)) * far * sign
    const clip: TilePoint[] = [
      { x: a.x + dx * far, y: a.y + dy * far },
      { x: a.x - dx * far, y: a.y - dy * far },
      { x: hx - dx * far, y: hy - dy * far },
      { x: hx + dx * far, y: hy + dy * far },
    ]
    try {
      const result = polygonClipping.intersection(
        [toRing(poly)],
        [toRing(clip)],
      ) as [number, number][][][]
      const pieces = fromMulti(result)
      if (pieces.length === 0) return null
      let best = pieces[0]
      let bestA = polygonArea(best)
      for (let i = 1; i < pieces.length; i++) {
        const area = polygonArea(pieces[i])
        if (area > bestA) {
          best = pieces[i]
          bestA = area
        }
      }
      return bestA >= MIN_TILE_AREA ? best : null
    } catch {
      return null
    }
  }

  const kept = half(keepSide)
  const other = half(-keepSide)
  const out: PlacedTile[] = []
  if (kept) {
    const c = tileCentroid(kept)
    out.push({ ...tile, u: c.x, v: c.y, clip: kept })
  }
  if (keepBoth && other) {
    const c = tileCentroid(other)
    out.push({
      ...tile,
      id: createId('tile'),
      u: c.x,
      v: c.y,
      clip: other,
    })
  }
  return out.length > 0 ? out : [tile]
}

export function contourForTile(
  floor: Floor,
  tile: Pick<PlacedTile, 'surface' | 'u' | 'v'>,
): TileContour | null {
  return tileSurfaceContour(floor, tile.surface, { u: tile.u, v: tile.v })
}
