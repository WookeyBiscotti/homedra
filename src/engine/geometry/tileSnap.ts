import { sameTileSurface, type Floor, type PlacedTile } from '../types'
import { excludedTileIds, tileLocalRect, type TileRect } from './tiles'
import type { TileContour } from './tileSurfaces'

const DEFAULT_THRESHOLD = 0.08

export type TileSnapOpts = {
  excludeId?: string
  excludeIds?: string[]
  groutM: number
  threshold?: number
}

type AxisCand = { value: number; dist: number }

function consider(cands: AxisCand[], value: number, dist: number, thr: number) {
  if (dist > thr || !Number.isFinite(dist) || !Number.isFinite(value)) return
  cands.push({ value, dist })
}

function bestAxis(cands: AxisCand[]): AxisCand | null {
  if (cands.length === 0) return null
  let best = cands[0]!
  for (let i = 1; i < cands.length; i++) {
    const c = cands[i]!
    if (c.dist < best.dist) best = c
  }
  return best
}

function contourEdges(contour: TileContour | null): TileRect[] {
  if (!contour) return []
  const xs = contour.outer.map((p) => p.x)
  const ys = contour.outer.map((p) => p.y)
  if (xs.length === 0) return []
  return [
    {
      minU: Math.min(...xs),
      maxU: Math.max(...xs),
      minV: Math.min(...ys),
      maxV: Math.max(...ys),
    },
  ]
}

function snapRect(
  rect: TileRect,
  others: TileRect[],
  bounds: TileRect[],
  grout: number,
  thr: number,
): { u: number; v: number } {
  const w = rect.maxU - rect.minU
  const h = rect.maxV - rect.minV
  const cx = (rect.minU + rect.maxU) / 2
  const cy = (rect.minV + rect.maxV) / 2
  const xs: AxisCand[] = []
  const ys: AxisCand[] = []

  const flushU = (other: TileRect) => {
    consider(xs, other.maxU + grout + w / 2, Math.abs(rect.minU - (other.maxU + grout)), thr)
    consider(xs, other.minU - grout - w / 2, Math.abs(rect.maxU - (other.minU - grout)), thr)
    consider(xs, other.minU + w / 2, Math.abs(rect.minU - other.minU), thr)
    consider(xs, other.maxU - w / 2, Math.abs(rect.maxU - other.maxU), thr)
  }
  const flushV = (other: TileRect) => {
    consider(ys, other.maxV + grout + h / 2, Math.abs(rect.minV - (other.maxV + grout)), thr)
    consider(ys, other.minV - grout - h / 2, Math.abs(rect.maxV - (other.minV - grout)), thr)
    consider(ys, other.minV + h / 2, Math.abs(rect.minV - other.minV), thr)
    consider(ys, other.maxV - h / 2, Math.abs(rect.maxV - other.maxV), thr)
  }

  for (const other of others) {
    flushU(other)
    flushV(other)
  }
  for (const b of bounds) {
    consider(xs, b.minU + grout + w / 2, Math.abs(rect.minU - (b.minU + grout)), thr)
    consider(xs, b.maxU - grout - w / 2, Math.abs(rect.maxU - (b.maxU - grout)), thr)
    consider(ys, b.minV + grout + h / 2, Math.abs(rect.minV - (b.minV + grout)), thr)
    consider(ys, b.maxV - grout - h / 2, Math.abs(rect.maxV - (b.maxV - grout)), thr)
  }

  const bx = bestAxis(xs)
  const by = bestAxis(ys)
  return { u: bx ? bx.value : cx, v: by ? by.value : cy }
}

export function snapTileCenter(
  tile: PlacedTile,
  others: PlacedTile[],
  contour: TileContour | null,
  opts: TileSnapOpts,
): { u: number; v: number } {
  const thr = opts.threshold ?? DEFAULT_THRESHOLD
  const rect = tileLocalRect(tile)
  const skip = excludedTileIds(opts)
  const neighborRects = others
    .filter(
      (o) => !skip.has(o.id) && sameTileSurface(o.surface, tile.surface),
    )
    .map(tileLocalRect)
  const bounds = contourEdges(contour)
  return snapRect(rect, neighborRects, bounds, opts.groutM, thr)
}

export function snapTileOnFloor(
  floor: Floor,
  tile: PlacedTile,
  contour: TileContour | null,
  opts: TileSnapOpts,
): { u: number; v: number } {
  return snapTileCenter(tile, floor.tiles ?? [], contour, opts)
}
