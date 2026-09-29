import { sameTileSurface, type Floor, type PlacedTile } from '../types'
import { excludedTileIds, tileLocalRect, type TileRect } from './tiles'
import type { TileContour, TilePoint } from './tileSurfaces'

const DEFAULT_THRESHOLD = 0.08
const AA_EPS = 1e-6

export type TileSnapOpts = {
  excludeId?: string
  excludeIds?: string[]
  groutM: number
  threshold?: number
}

export type AxisGuides = { u: number[]; v: number[] }

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

function uniqueSorted(values: number[], eps = AA_EPS): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const v of sorted) {
    if (out.length === 0 || Math.abs(out[out.length - 1]! - v) > eps) out.push(v)
  }
  return out
}

function ringsAxisGuides(rings: TilePoint[][]): AxisGuides {
  const u: number[] = []
  const v: number[] = []
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      if (Math.abs(a.x - b.x) <= AA_EPS) u.push(a.x)
      if (Math.abs(a.y - b.y) <= AA_EPS) v.push(a.y)
    }
  }
  return { u: uniqueSorted(u), v: uniqueSorted(v) }
}

/** Axis-aligned contour edges: walls (U) and floor/ceiling (V), plus openings. */
export function contourAxisGuides(
  contour: TileContour | null,
  opts?: { includeHoles?: boolean },
): AxisGuides {
  if (!contour) return { u: [], v: [] }
  const rings =
    opts?.includeHoles === false ? [contour.outer] : [contour.outer, ...contour.holes]
  return ringsAxisGuides(rings)
}

type FaceFlush = { edge: number; flush: number }

function ringSignedArea(ring: TilePoint[]): number {
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

/** Inward tile-center flushes for outer walls / floor / ceiling. */
function contourInwardFaces(
  contour: TileContour | null,
  grout: number,
  halfU: number,
  halfV: number,
): { u: FaceFlush[]; v: FaceFlush[] } {
  if (!contour || contour.outer.length < 3) return { u: [], v: [] }
  const ring = contour.outer
  const area = ringSignedArea(ring)
  if (Math.abs(area) < 1e-12) return { u: [], v: [] }
  const ccw = area > 0
  const u: FaceFlush[] = []
  const v: FaceFlush[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    if (Math.abs(dx) <= AA_EPS && Math.abs(dy) > AA_EPS) {
      let inward = dy > 0 ? -1 : 1
      if (!ccw) inward = -inward
      u.push({ edge: a.x, flush: a.x + inward * (grout + halfU) })
    } else if (Math.abs(dy) <= AA_EPS && Math.abs(dx) > AA_EPS) {
      let inward = dx > 0 ? 1 : -1
      if (!ccw) inward = -inward
      v.push({ edge: a.y, flush: a.y + inward * (grout + halfV) })
    }
  }
  return { u, v }
}

function snapFillAxis(origin: number, step: number, faces: FaceFlush[]): number {
  if (faces.length === 0 || step < 1e-6) return origin
  let best = origin
  let bestEdgeDist = Infinity
  let bestPhaseDist = Infinity
  for (const face of faces) {
    const n = Math.round((origin - face.flush) / step)
    const value = face.flush + n * step
    const edgeDist = Math.abs(origin - face.edge)
    const phaseDist = Math.abs(value - origin)
    if (
      edgeDist < bestEdgeDist - 1e-9 ||
      (Math.abs(edgeDist - bestEdgeDist) <= 1e-9 && phaseDist < bestPhaseDist)
    ) {
      bestEdgeDist = edgeDist
      bestPhaseDist = phaseDist
      best = value
    }
  }
  return best
}

/**
 * Phase-align a fill grid so tile edges flush to the nearest wall / floor face.
 * Shift is at most half a step — the click stays on the same cell.
 */
export function snapFillOriginToFaces(
  originU: number,
  originV: number,
  stepU: number,
  stepV: number,
  halfU: number,
  halfV: number,
  grout: number,
  contour: TileContour | null,
): { u: number; v: number } {
  const faces = contourInwardFaces(contour, grout, halfU, halfV)
  return {
    u: snapFillAxis(originU, stepU, faces.u),
    v: snapFillAxis(originV, stepV, faces.v),
  }
}

function snapRect(
  rect: TileRect,
  others: TileRect[],
  guides: AxisGuides,
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
  for (const e of guides.u) {
    consider(xs, e + grout + w / 2, Math.abs(rect.minU - (e + grout)), thr)
    consider(xs, e - grout - w / 2, Math.abs(rect.maxU - (e - grout)), thr)
  }
  for (const e of guides.v) {
    consider(ys, e + grout + h / 2, Math.abs(rect.minV - (e + grout)), thr)
    consider(ys, e - grout - h / 2, Math.abs(rect.maxV - (e - grout)), thr)
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
  const guides = contourAxisGuides(contour)
  return snapRect(rect, neighborRects, guides, opts.groutM, thr)
}

export function snapTileOnFloor(
  floor: Floor,
  tile: PlacedTile,
  contour: TileContour | null,
  opts: TileSnapOpts,
): { u: number; v: number } {
  return snapTileCenter(tile, floor.tiles ?? [], contour, opts)
}
