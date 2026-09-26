import type { Floor, Id, Opening, OpeningKind, Wall } from '../types'
import { createId, wallLength } from '../types'
import { projectOnSegment } from './walls'
import polygonClipping from 'polygon-clipping'

export const OPENING_END_MARGIN = 0.05
/** Extra half-thickness so boolean cut always clears the wall footprint. */
export const OPENING_CUT_EPS = 0.02

export interface OpeningDefaults {
  height: number
  sillHeight: number
  minWidth: number
}

export function openingDefaults(
  kind: OpeningKind,
  floorHeight: number,
): OpeningDefaults {
  switch (kind) {
    case 'door':
      return { height: 2.1, sillHeight: 0, minWidth: 0.6 }
    case 'passage':
      return { height: floorHeight, sillHeight: 0, minWidth: 0.6 }
    case 'window':
      return { height: 1.4, sillHeight: 0.9, minWidth: 0.6 }
  }
}

export function wallEndpoints(
  floor: Floor,
  wall: Wall,
): { a: { x: number; y: number }; b: { x: number; y: number }; len: number } | null {
  const a = floor.vertices.find((v) => v.id === wall.a)
  const b = floor.vertices.find((v) => v.id === wall.b)
  if (!a || !b) return null
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  return { a, b, len }
}

/** Distance along wall from vertex `a` for a world point projected onto the segment. */
export function offsetAlongWall(
  floor: Floor,
  wall: Wall,
  x: number,
  y: number,
): number | null {
  const ends = wallEndpoints(floor, wall)
  if (!ends || ends.len < 1e-9) return null
  const proj = projectOnSegment(x, y, ends.a.x, ends.a.y, ends.b.x, ends.b.y)
  return proj.t * ends.len
}

export function clampOpeningToWall(
  floor: Floor,
  wallId: Id,
  offset: number,
  width: number,
  minWidth = 0.6,
): { offset: number; width: number } | null {
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return null
  const len = wallLength(floor, wall)
  const margin = OPENING_END_MARGIN
  const available = len - 2 * margin
  if (available < minWidth - 1e-6) return null

  let w = Math.max(minWidth, Math.min(width, available))
  const half = w / 2
  let center = offset
  const minC = margin + half
  const maxC = len - margin - half
  if (maxC < minC) {
    w = available
    center = len / 2
  } else {
    center = Math.max(minC, Math.min(maxC, center))
  }
  return { offset: center, width: w }
}

export function openingPlanRect(
  floor: Floor,
  opening: Opening,
): Array<{ x: number; y: number }> | null {
  const wall = floor.walls.find((w) => w.id === opening.wallId)
  if (!wall) return null
  const ends = wallEndpoints(floor, wall)
  if (!ends || ends.len < 1e-9) return null

  const ux = (ends.b.x - ends.a.x) / ends.len
  const uy = (ends.b.y - ends.a.y) / ends.len
  const nx = -uy
  const ny = ux
  const halfW = opening.width / 2
  const halfT = wall.thickness / 2 + OPENING_CUT_EPS
  const cx = ends.a.x + ux * opening.offset
  const cy = ends.a.y + uy * opening.offset

  const along = (s: number, n: number) => ({
    x: cx + ux * s + nx * n,
    y: cy + uy * s + ny * n,
  })

  return [
    along(-halfW, -halfT),
    along(halfW, -halfT),
    along(halfW, halfT),
    along(-halfW, halfT),
  ]
}

/** Opening span along wall as [start, end] distances from vertex a. */
export function openingSpan(opening: Opening): { start: number; end: number } {
  const half = opening.width / 2
  return { start: opening.offset - half, end: opening.offset + half }
}

export function createOpeningFromDrag(
  floor: Floor,
  wallId: Id,
  kind: OpeningKind,
  t0: number,
  t1: number,
): Opening | null {
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return null
  const defs = openingDefaults(kind, floor.height)
  const start = Math.min(t0, t1)
  const end = Math.max(t0, t1)
  const width = Math.max(defs.minWidth, end - start)
  const offset = (start + end) / 2
  const clamped = clampOpeningToWall(floor, wallId, offset, width, defs.minWidth)
  if (!clamped) return null

  let height = defs.height
  let sillHeight = defs.sillHeight
  if (sillHeight + height > floor.height) {
    height = Math.max(0.3, floor.height - sillHeight)
  }

  return {
    id: createId('op'),
    wallId,
    kind,
    offset: clamped.offset,
    width: clamped.width,
    height,
    sillHeight,
  }
}

export function openingsForWall(floor: Floor, wallId: Id): Opening[] {
  return (floor.openings ?? []).filter((o) => o.wallId === wallId)
}

/**
 * World-space hit on a wall volume that lands inside a door / window / passage.
 * Used so wall pickables do not steal clicks from openings (and objects in them).
 */
export function worldHitInWallOpening(
  floor: Floor,
  wall: Wall,
  world: { x: number; y: number; z: number },
): boolean {
  const ends = wallEndpoints(floor, wall)
  if (!ends || ends.len < 1e-9) return false
  const ux = (ends.b.x - ends.a.x) / ends.len
  const uy = (ends.b.y - ends.a.y) / ends.len
  const planX = world.x
  const planY = -world.z
  const along = (planX - ends.a.x) * ux + (planY - ends.a.y) * uy
  const y = world.y - floor.elevation
  for (const o of openingsForWall(floor, wall.id)) {
    const span = openingSpan(o)
    if (along < span.start - 1e-3 || along > span.end + 1e-3) continue
    const top = o.sillHeight + o.height
    if (y >= o.sillHeight - 1e-3 && y <= top + 1e-3) return true
  }
  return false
}

export function removeOpeningsForWall(floor: Floor, wallId: Id): Floor {
  return {
    ...floor,
    openings: (floor.openings ?? []).filter((o) => o.wallId !== wallId),
  }
}

/**
 * After splitting `oldWallId` into `wall1` (a→mid) and `wall2` (mid→b),
 * reassign openings by which segment contains their center.
 */
export function reassignOpeningsAfterSplit(
  floor: Floor,
  oldWallId: Id,
  wall1: Wall,
  wall2: Wall,
  splitOffsetFromA: number,
): Floor {
  const openings = (floor.openings ?? []).map((o) => {
    if (o.wallId !== oldWallId) return o
    if (o.offset <= splitOffsetFromA) {
      return { ...o, wallId: wall1.id }
    }
    return {
      ...o,
      wallId: wall2.id,
      offset: o.offset - splitOffsetFromA,
    }
  })
  return { ...floor, openings }
}

/** Unique sorted band edges for layered extrusion (0 … floor.height). */
export function openingHeightBands(floor: Floor): number[] {
  const set = new Set<number>([0, floor.height])
  for (const o of floor.openings ?? []) {
    const top = Math.min(floor.height, o.sillHeight + o.height)
    const sill = Math.max(0, Math.min(floor.height, o.sillHeight))
    set.add(sill)
    set.add(top)
  }
  return [...set].sort((a, b) => a - b).filter((y, i, arr) => i === 0 || y > arr[i - 1] + 1e-9)
}

/** Openings that cut through the vertical band [y0, y1]. */
export function openingsActiveInBand(
  floor: Floor,
  y0: number,
  y1: number,
): Opening[] {
  const mid = (y0 + y1) / 2
  return (floor.openings ?? []).filter((o) => {
    const top = o.sillHeight + o.height
    return o.sillHeight < mid && top > mid
  })
}

export function updateOpeningFields(
  floor: Floor,
  openingId: Id,
  patch: Partial<Pick<Opening, 'width' | 'height' | 'sillHeight' | 'offset' | 'kind'>>,
): Floor {
  const openings = (floor.openings ?? []).map((o) => {
    if (o.id !== openingId) return o
    const next = { ...o, ...patch }
    const defs = openingDefaults(next.kind, floor.height)
    const clamped = clampOpeningToWall(
      floor,
      next.wallId,
      next.offset,
      next.width,
      defs.minWidth,
    )
    if (!clamped) return o
    let height = Math.max(0.2, Math.min(floor.height, next.height))
    let sill = Math.max(0, Math.min(floor.height - 0.2, next.sillHeight))
    if (sill + height > floor.height) {
      height = floor.height - sill
    }
    return {
      ...next,
      offset: clamped.offset,
      width: clamped.width,
      height,
      sillHeight: sill,
    }
  })
  return { ...floor, openings }
}

type Pair = [number, number]
type Ring = Pair[]
type Poly = Ring[]
type MultiPoly = Poly[]

function ptsToPoly(pts: Array<{ x: number; y: number }>): Poly | null {
  if (pts.length < 3) return null
  const ring: Ring = pts.map((p) => [p.x, p.y])
  const f = ring[0]
  const l = ring[ring.length - 1]
  if (f && l && (f[0] !== l[0] || f[1] !== l[1])) ring.push([f[0], f[1]])
  return [ring]
}

function polyToRings(multi: MultiPoly): Array<Array<{ x: number; y: number }>> {
  const out: Array<Array<{ x: number; y: number }>> = []
  for (const polygon of multi) {
    if (!polygon[0] || polygon[0].length < 3) continue
    const ring = polygon[0].map(([x, y]) => ({ x, y }))
    if (
      ring.length > 1 &&
      ring[0].x === ring[ring.length - 1].x &&
      ring[0].y === ring[ring.length - 1].y
    ) {
      ring.pop()
    }
    if (ring.length >= 3) out.push(ring)
  }
  return out
}

/**
 * Wall footprint minus openings on that wall (for 2D plan display).
 * Returns one or more polygons (outer rings only).
 */
export function wallFootprintMinusOpenings(
  floor: Floor,
  wallId: Id,
  footprint: Array<{ x: number; y: number }>,
): Array<Array<{ x: number; y: number }>> {
  const subject = ptsToPoly(footprint)
  if (!subject) return []
  const openings = openingsForWall(floor, wallId)
  if (openings.length === 0) return [footprint]

  let result: MultiPoly = [subject]
  for (const o of openings) {
    const rect = openingPlanRect(floor, o)
    const cutter = rect ? ptsToPoly(rect) : null
    if (!cutter) continue
    try {
      result = polygonClipping.difference(result, cutter) as MultiPoly
    } catch {
      // keep previous
    }
  }
  const rings = polyToRings(result)
  return rings.length > 0 ? rings : [footprint]
}

/** Hit-test opening under a plan point (prefer closest center). */
export function hitOpening(
  floor: Floor,
  x: number,
  y: number,
  threshold = 0.2,
): Opening | undefined {
  let best: Opening | undefined
  let bestDist = threshold
  for (const o of floor.openings ?? []) {
    const wall = floor.walls.find((w) => w.id === o.wallId)
    if (!wall) continue
    const ends = wallEndpoints(floor, wall)
    if (!ends || ends.len < 1e-9) continue
    const ux = (ends.b.x - ends.a.x) / ends.len
    const uy = (ends.b.y - ends.a.y) / ends.len
    const cx = ends.a.x + ux * o.offset
    const cy = ends.a.y + uy * o.offset
    const proj = projectOnSegment(x, y, ends.a.x, ends.a.y, ends.b.x, ends.b.y)
    const along = proj.t * ends.len
    const span = openingSpan(o)
    if (along < span.start - 0.05 || along > span.end + 0.05) continue
    const dist = Math.hypot(x - cx, y - cy)
    const maxDist = Math.max(threshold, wall.thickness / 2 + 0.08)
    if (proj.dist <= maxDist && dist < bestDist + o.width) {
      if (proj.dist < bestDist || !best) {
        best = o
        bestDist = proj.dist
      }
    }
  }
  return best
}

