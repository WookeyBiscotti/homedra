import type { Floor } from '../types'
import {
  detectRooms,
  unionWallPlanRegions,
  type DetectedRoom,
} from './wallSolid'
import { inflatePolygonOutward } from './wallFaces'

export type FloorPaintRegion = {
  key: string
  polygon: Array<{ x: number; y: number }>
  /** Room from cycle detect, if matched */
  room: DetectedRoom | null
}

function signedArea(poly: Array<{ x: number; y: number }>): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

/** Ensure CCW ring for ShapeGeometry / point-in-polygon consistency. */
export function orientPolygonCCW(
  polygon: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  if (polygon.length < 3) return polygon.map((p) => ({ ...p }))
  const copy = polygon.map((p) => ({ ...p }))
  if (signedArea(copy) < 0) copy.reverse()
  return copy
}

function centroid(poly: Array<{ x: number; y: number }>) {
  let x = 0
  let y = 0
  for (const p of poly) {
    x += p.x
    y += p.y
  }
  const n = poly.length || 1
  return { x: x / n, y: y / n }
}

function pointInPoly(
  x: number,
  y: number,
  poly: Array<{ x: number; y: number }>,
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

/**
 * Paintable floor regions: prefer detected rooms; also include wall-union
 * interior holes that didn't become rooms (so every enclosed floor area works).
 */
export function floorPaintRegions(floor: Floor): FloorPaintRegion[] {
  const rooms = detectRooms(floor)
  const out: FloorPaintRegion[] = rooms.map((room) => ({
    key: room.key,
    polygon: orientPolygonCCW(room.polygon),
    room,
  }))

  const covered = (x: number, y: number) =>
    out.some((r) => pointInPoly(x, y, r.polygon))

  const wallRegions = unionWallPlanRegions(floor)
  for (let ri = 0; ri < wallRegions.length; ri++) {
    const holes = wallRegions[ri].holes
    for (let hi = 0; hi < holes.length; hi++) {
      const hole = orientPolygonCCW(holes[hi])
      if (hole.length < 3) continue
      if (Math.abs(signedArea(hole)) < 1e-4) continue
      const c = centroid(hole)
      if (covered(c.x, c.y)) continue
      // Match a room by centroid if room polygon failed but cycle exists
      const room =
        rooms.find((r) => pointInPoly(c.x, c.y, r.polygon)) ?? null
      out.push({
        key: room?.key ?? `void:${ri}:${hi}`,
        polygon: hole,
        room,
      })
    }
  }

  // Smallest first for hit-tests
  out.sort(
    (a, b) => Math.abs(signedArea(a.polygon)) - Math.abs(signedArea(b.polygon)),
  )
  return out
}

/** Resolve which floor region contains a plan point (with inflate near walls). */
export function hitFloorPaintRegion(
  floor: Floor,
  x: number,
  y: number,
  inflateM = 0.25,
): FloorPaintRegion | null {
  const regions = floorPaintRegions(floor)
  for (const r of regions) {
    const poly = inflatePolygonOutward(r.polygon, inflateM)
    if (pointInPoly(x, y, poly)) return r
  }
  for (const r of regions) {
    if (pointInPoly(x, y, r.polygon)) return r
  }
  // Nearest region within 0.4m (covers clicks slightly outside polygon)
  let best: FloorPaintRegion | null = null
  let bestD = 0.4
  for (const r of regions) {
    const d = distToPolygon(x, y, r.polygon)
    if (d < bestD) {
      bestD = d
      best = r
    }
  }
  return best
}

function distToPolygon(
  x: number,
  y: number,
  poly: Array<{ x: number; y: number }>,
): number {
  if (pointInPoly(x, y, poly)) return 0
  let min = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    min = Math.min(min, distToSegment(x, y, a.x, a.y, b.x, b.y))
  }
  return min
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-18) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
