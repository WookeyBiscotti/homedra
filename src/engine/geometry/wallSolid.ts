import polygonClipping from 'polygon-clipping'
import type { Constraint, Floor, Id, Wall, WallSide } from '../types'
import { wallLength } from '../types'

export type WallFace = 'center' | 'inner' | 'outer'

function hasAxis(
  constraints: Constraint[],
  wallId: Id,
  type: 'horizontal' | 'vertical',
): boolean {
  return constraints.some((c) => c.type === type && c.wallId === wallId)
}

/** Unit direction and normal for a wall centerline */
export function wallAxes(floor: Floor, wall: Wall) {
  const a = floor.vertices.find((v) => v.id === wall.a)
  const b = floor.vertices.find((v) => v.id === wall.b)
  if (!a || !b) return null
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return null
  const ux = dx / len
  const uy = dy / len
  // Left-hand normal
  const nx = -uy
  const ny = ux
  return { a, b, ux, uy, nx, ny, len }
}

/** Signed offset from centerline toward the measured face. */
export function faceOffsetFromCenter(
  face: WallFace,
  thickness: number,
  /** +1 if the other wall lies in the +axis direction from this wall */
  towardOther: 1 | -1,
): number {
  const half = thickness / 2
  if (face === 'center') return 0
  // Inner faces look toward each other; outer faces look away
  if (face === 'inner') return towardOther * half
  return towardOther * -half
}

/**
 * World-space endpoints of a dimension line for wallDistance,
 * plus label position and text.
 */
export function wallDistanceDimension(
  floor: Floor,
  wallA: Wall,
  wallB: Wall,
  face: WallFace,
  distance: number,
): {
  p0: { x: number; y: number }
  p1: { x: number; y: number }
  label: { x: number; y: number }
  text: string
  axis: 'horizontal' | 'vertical'
} | null {
  const axis = wallsShareAxis(floor, wallA.id, wallB.id)
  if (!axis) return null
  const axA = wallAxes(floor, wallA)
  const axB = wallAxes(floor, wallB)
  if (!axA || !axB) return null

  if (axis === 'horizontal') {
    const yA = (axA.a.y + axA.b.y) / 2
    const yB = (axB.a.y + axB.b.y) / 2
    const aTowardB: 1 | -1 = yB >= yA ? 1 : -1
    const bTowardA: 1 | -1 = yA >= yB ? 1 : -1
    const fyA = yA + faceOffsetFromCenter(face, wallA.thickness, aTowardB)
    const fyB = yB + faceOffsetFromCenter(face, wallB.thickness, bTowardA)
    const overlapLo = Math.max(
      Math.min(axA.a.x, axA.b.x),
      Math.min(axB.a.x, axB.b.x),
    )
    const overlapHi = Math.min(
      Math.max(axA.a.x, axA.b.x),
      Math.max(axB.a.x, axB.b.x),
    )
    const midX =
      overlapHi > overlapLo
        ? (overlapLo + overlapHi) / 2
        : ([axA.a.x, axA.b.x, axB.a.x, axB.b.x].reduce((s, v) => s + v, 0) /
            4)
    return {
      p0: { x: midX, y: fyA },
      p1: { x: midX, y: fyB },
      label: { x: midX, y: (fyA + fyB) / 2 },
      text: `${distance.toFixed(2)} м`,
      axis,
    }
  }

  const xA = (axA.a.x + axA.b.x) / 2
  const xB = (axB.a.x + axB.b.x) / 2
  const aTowardB: 1 | -1 = xB >= xA ? 1 : -1
  const bTowardA: 1 | -1 = xA >= xB ? 1 : -1
  const fxA = xA + faceOffsetFromCenter(face, wallA.thickness, aTowardB)
  const fxB = xB + faceOffsetFromCenter(face, wallB.thickness, bTowardA)
  const overlapLo = Math.max(
    Math.min(axA.a.y, axA.b.y),
    Math.min(axB.a.y, axB.b.y),
  )
  const overlapHi = Math.min(
    Math.max(axA.a.y, axA.b.y),
    Math.max(axB.a.y, axB.b.y),
  )
  const midY =
    overlapHi > overlapLo
      ? (overlapLo + overlapHi) / 2
      : ([axA.a.y, axA.b.y, axB.a.y, axB.b.y].reduce((s, v) => s + v, 0) / 4)
  return {
    p0: { x: fxA, y: midY },
    p1: { x: fxB, y: midY },
    label: { x: (fxA + fxB) / 2, y: midY },
    text: `${distance.toFixed(2)} м`,
    axis,
  }
}

/** 4 corners of wall footprint (centerline ± half thickness) */
export function wallFootprint(
  floor: Floor,
  wall: Wall,
): Array<{ x: number; y: number }> | null {
  const axes = wallAxes(floor, wall)
  if (!axes) return null
  const { a, b, nx, ny } = axes
  const hx = (nx * wall.thickness) / 2
  const hy = (ny * wall.thickness) / 2
  return [
    { x: a.x + hx, y: a.y + hy },
    { x: b.x + hx, y: b.y + hy },
    { x: b.x - hx, y: b.y - hy },
    { x: a.x - hx, y: a.y - hy },
  ]
}

export function wallMidpointY(floor: Floor, wall: Wall): number {
  const a = floor.vertices.find((v) => v.id === wall.a)!
  const b = floor.vertices.find((v) => v.id === wall.b)!
  return (a.y + b.y) / 2
}

export function wallMidpointX(floor: Floor, wall: Wall): number {
  const a = floor.vertices.find((v) => v.id === wall.a)!
  const b = floor.vertices.find((v) => v.id === wall.b)!
  return (a.x + b.x) / 2
}

/** Centerline distance between two walls (assumes roughly parallel) */
export function centerDistance(floor: Floor, wallA: Wall, wallB: Wall): number {
  const aH = hasAxis(floor.constraints, wallA.id, 'horizontal')
  const bH = hasAxis(floor.constraints, wallB.id, 'horizontal')
  if (aH && bH) {
    return Math.abs(wallMidpointY(floor, wallA) - wallMidpointY(floor, wallB))
  }
  const aV = hasAxis(floor.constraints, wallA.id, 'vertical')
  const bV = hasAxis(floor.constraints, wallB.id, 'vertical')
  if (aV && bV) {
    return Math.abs(wallMidpointX(floor, wallA) - wallMidpointX(floor, wallB))
  }
  // Fallback: distance between midpoints projected on average normal
  const ax = wallAxes(floor, wallA)
  if (!ax) return 0
  const midA = { x: (ax.a.x + ax.b.x) / 2, y: (ax.a.y + ax.b.y) / 2 }
  const bx = wallAxes(floor, wallB)
  if (!bx) return 0
  const midB = { x: (bx.a.x + bx.b.x) / 2, y: (bx.a.y + bx.b.y) / 2 }
  return Math.abs((midB.x - midA.x) * ax.nx + (midB.y - midA.y) * ax.ny)
}

/** Convert face distance ↔ centerline distance */
export function faceToCenterDistance(
  face: WallFace,
  faceDist: number,
  tA: number,
  tB: number,
): number {
  if (face === 'inner') return faceDist + tA / 2 + tB / 2
  if (face === 'outer') return Math.max(0.05, faceDist - tA / 2 - tB / 2)
  return faceDist
}

export function centerToFaceDistance(
  face: WallFace,
  centerDist: number,
  tA: number,
  tB: number,
): number {
  if (face === 'inner') return Math.max(0, centerDist - tA / 2 - tB / 2)
  if (face === 'outer') return centerDist + tA / 2 + tB / 2
  return centerDist
}

/** Max thickness of walls meeting at a vertex (0 if none). */
export function vertexWallThickness(floor: Floor, vertexId: Id): number {
  let max = 0
  for (const w of floor.walls) {
    if (w.a === vertexId || w.b === vertexId) {
      max = Math.max(max, w.thickness)
    }
  }
  return max
}

/** Euclidean centerline distance between two vertices. */
export function vertexCenterDistance(
  floor: Floor,
  vertexA: Id,
  vertexB: Id,
): number {
  const a = floor.vertices.find((v) => v.id === vertexA)
  const b = floor.vertices.find((v) => v.id === vertexB)
  if (!a || !b) return 0
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Dimension line between two vertices for vertexDistance
 * (endpoints on center / inner / outer along the segment).
 */
export function vertexDistanceDimension(
  floor: Floor,
  vertexA: Id,
  vertexB: Id,
  face: WallFace,
  distance: number,
): {
  p0: { x: number; y: number }
  p1: { x: number; y: number }
  label: { x: number; y: number }
  text: string
} | null {
  const a = floor.vertices.find((v) => v.id === vertexA)
  const b = floor.vertices.find((v) => v.id === vertexB)
  if (!a || !b) return null
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return null
  const ux = dx / len
  const uy = dy / len
  const tA = vertexWallThickness(floor, vertexA)
  const tB = vertexWallThickness(floor, vertexB)
  let oA = 0
  let oB = 0
  if (face === 'inner') {
    oA = tA / 2
    oB = tB / 2
  } else if (face === 'outer') {
    oA = -tA / 2
    oB = -tB / 2
  }
  const p0 = { x: a.x + ux * oA, y: a.y + uy * oA }
  const p1 = { x: b.x - ux * oB, y: b.y - uy * oB }
  return {
    p0,
    p1,
    label: { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 },
    text: `${distance.toFixed(2)} м`,
  }
}

export function wallsShareAxis(
  floor: Floor,
  wallA: Id,
  wallB: Id,
): 'horizontal' | 'vertical' | null {
  if (
    hasAxis(floor.constraints, wallA, 'horizontal') &&
    hasAxis(floor.constraints, wallB, 'horizontal')
  ) {
    return 'horizontal'
  }
  if (
    hasAxis(floor.constraints, wallA, 'vertical') &&
    hasAxis(floor.constraints, wallB, 'vertical')
  ) {
    return 'vertical'
  }
  return null
}

/**
 * How far to extend a wall past a vertex along its centerline (legacy helper).
 */
export function wallJoinExtension(floor: Floor, wall: Wall, vertexId: Id): number {
  const others = floor.walls.filter(
    (w) => w.id !== wall.id && (w.a === vertexId || w.b === vertexId),
  )
  if (others.length === 0) return 0
  const into = wallOutFromVertex(floor, wall, vertexId)
  if (!into) return Math.max(...others.map((o) => o.thickness)) / 2

  let maxExt = 0
  for (const other of others) {
    const otherOut = wallOutFromVertex(floor, other, vertexId)
    if (!otherOut) continue
    const cross = into.x * otherOut.y - into.y * otherOut.x
    const sin = Math.abs(cross)
    if (sin < 1e-6) maxExt = Math.max(maxExt, other.thickness / 2)
    else maxExt = Math.max(maxExt, other.thickness / 2 / sin)
  }
  return maxExt
}

type Pt = { x: number; y: number }

function add(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y }
}

function scale(a: Pt, s: number): Pt {
  return { x: a.x * s, y: a.y * s }
}

function rot90(d: Pt): Pt {
  return { x: -d.y, y: d.x }
}

function lineIntersect(p: Pt, r: Pt, q: Pt, s: Pt): Pt | null {
  const rxs = r.x * s.y - r.y * s.x
  if (Math.abs(rxs) < 1e-12) return null
  const qpx = q.x - p.x
  const qpy = q.y - p.y
  const t = (qpx * s.y - qpy * s.x) / rxs
  return { x: p.x + t * r.x, y: p.y + t * r.y }
}

/**
 * Miter left/right corners at a vertex (left = +n of wall a→b).
 * Uses outgoing directions so open L/V joins get proper trapezoid tips.
 */
function miterAtVertex(
  floor: Floor,
  wall: Wall,
  vertexId: Id,
  half: number,
  nx: number,
  ny: number,
): { left: Pt; right: Pt } {
  const v = vertexPos(floor, vertexId)!
  const baseL = { x: v.x + nx * half, y: v.y + ny * half }
  const baseR = { x: v.x - nx * half, y: v.y - ny * half }

  const others = floor.walls.filter(
    (w) => w.id !== wall.id && (w.a === vertexId || w.b === vertexId),
  )
  if (others.length === 0) return { left: baseL, right: baseR }

  const dSelf = wallOutFromVertex(floor, wall, vertexId)
  if (!dSelf) return { left: baseL, right: baseR }

  // Prefer the sharpest turn (largest |cross|) — typical room/L corner
  let bestOther: Wall | null = null
  let bestScore = -1
  for (const other of others) {
    const dOther = wallOutFromVertex(floor, other, vertexId)
    if (!dOther) continue
    const score = Math.abs(dSelf.x * dOther.y - dSelf.y * dOther.x)
    if (score > bestScore) {
      bestScore = score
      bestOther = other
    }
  }
  if (!bestOther) return { left: baseL, right: baseR }

  const dOther = wallOutFromVertex(floor, bestOther, vertexId)!
  const nSelf = rot90(dSelf)
  const nOther = rot90(dOther)
  const ho = bestOther.thickness / 2

  const pCCW =
    lineIntersect(
      { x: v.x + nSelf.x * half, y: v.y + nSelf.y * half },
      dSelf,
      { x: v.x - nOther.x * ho, y: v.y - nOther.y * ho },
      dOther,
    ) ?? baseL
  const pCW =
    lineIntersect(
      { x: v.x - nSelf.x * half, y: v.y - nSelf.y * half },
      dSelf,
      { x: v.x + nOther.x * ho, y: v.y + nOther.y * ho },
      dOther,
    ) ?? baseR

  // At wall.a, outgoing aligns with a→b so CCW ≡ left; at wall.b it's flipped
  if (wall.a === vertexId) return { left: pCCW, right: pCW }
  return { left: pCW, right: pCCW }
}

function wallOutFromVertex(
  floor: Floor,
  wall: Wall,
  vertexId: Id,
): Pt | null {
  const axes = wallAxes(floor, wall)
  if (!axes) return null
  if (wall.a === vertexId) return { x: axes.ux, y: axes.uy }
  if (wall.b === vertexId) return { x: -axes.ux, y: -axes.uy }
  return null
}

function vertexPos(floor: Floor, id: Id): Pt | null {
  const v = floor.vertices.find((p) => p.id === id)
  return v ? { x: v.x, y: v.y } : null
}

type CycleEdge = { wallId: Id; from: Id; to: Id }

export type { CycleEdge }

/** Sharpest left turn at `at`, arriving from `from`. */
function nextLeftEdge(
  floor: Floor,
  from: Id,
  at: Id,
): { wallId: Id; to: Id } | null {
  const a = vertexPos(floor, from)
  const b = vertexPos(floor, at)
  if (!a || !b) return null
  const arrive = { x: b.x - a.x, y: b.y - a.y }
  const alen = Math.hypot(arrive.x, arrive.y)
  if (alen < 1e-12) return null
  arrive.x /= alen
  arrive.y /= alen

  let best: { wallId: Id; to: Id } | null = null
  let bestAng = -Infinity
  for (const w of floor.walls) {
    if (w.a !== at && w.b !== at) continue
    const to = w.a === at ? w.b : w.a
    if (to === from) continue
    const c = vertexPos(floor, to)
    if (!c) continue
    const out = { x: c.x - b.x, y: c.y - b.y }
    const olen = Math.hypot(out.x, out.y)
    if (olen < 1e-12) continue
    out.x /= olen
    out.y /= olen
    const ang = Math.atan2(
      arrive.x * out.y - arrive.y * out.x,
      arrive.x * out.x + arrive.y * out.y,
    )
    if (ang > bestAng) {
      bestAng = ang
      best = { wallId: w.id, to }
    }
  }
  return best
}

function cycleSignedArea(floor: Floor, cycle: CycleEdge[]): number {
  let area = 0
  for (const e of cycle) {
    const a = vertexPos(floor, e.from)
    const b = vertexPos(floor, e.to)
    if (!a || !b) continue
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

function edgeKey(wallId: Id, from: Id, to: Id) {
  return `${wallId}:${from}->${to}`
}

/**
 * Trace room loops (CCW, positive area) via left-turn face walk on the wall graph.
 */
export function findRoomCycles(floor: Floor): CycleEdge[][] {
  const visited = new Set<string>()
  const rooms: CycleEdge[][] = []

  for (const wall of floor.walls) {
    for (const [from, to] of [
      [wall.a, wall.b],
      [wall.b, wall.a],
    ] as const) {
      const startKey = edgeKey(wall.id, from, to)
      if (visited.has(startKey)) continue

      const cycle: CycleEdge[] = []
      const localKeys: string[] = []
      let curFrom = from
      let curTo = to
      let curWall = wall.id
      let guard = 0
      const max = floor.walls.length * 4 + 2
      let closed = false

      while (guard++ < max) {
        const key = edgeKey(curWall, curFrom, curTo)
        if (cycle.length > 0 && key === startKey) {
          closed = true
          break
        }
        if (localKeys.includes(key) || visited.has(key)) break

        localKeys.push(key)
        cycle.push({ wallId: curWall, from: curFrom, to: curTo })

        const next = nextLeftEdge(floor, curFrom, curTo)
        if (!next) break
        curFrom = curTo
        curTo = next.to
        curWall = next.wallId
      }

      if (closed && cycle.length >= 3) {
        const area = cycleSignedArea(floor, cycle)
        if (area > 1e-6) {
          for (const k of localKeys) visited.add(k)
          rooms.push(cycle)
        }
      }
    }
  }
  return rooms
}

/** Inward unit normal for a wall as oriented in a CCW room cycle (left of travel). */
export function inwardNormalForEdge(floor: Floor, edge: CycleEdge): Pt | null {
  const a = vertexPos(floor, edge.from)
  const b = vertexPos(floor, edge.to)
  if (!a || !b) return null
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-12) return null
  const ux = dx / len
  const uy = dy / len
  return { x: -uy, y: ux }
}

type WallSideInfo = {
  inward: Pt
  /** Cycle neighbour at edge.from */
  neighbourAtFrom: CycleEdge
  /** Cycle neighbour at edge.to */
  neighbourAtTo: CycleEdge
  forward: boolean
}

function wallRoomSideInfo(floor: Floor): Map<Id, WallSideInfo> {
  const rooms = findRoomCycles(floor)
  rooms.sort(
    (a, b) =>
      Math.abs(cycleSignedArea(floor, a)) - Math.abs(cycleSignedArea(floor, b)),
  )

  const map = new Map<Id, WallSideInfo>()
  for (const cycle of rooms) {
    for (let i = 0; i < cycle.length; i++) {
      const edge = cycle[i]
      if (map.has(edge.wallId)) continue
      const wall = floor.walls.find((w) => w.id === edge.wallId)
      if (!wall) continue
      const inward = inwardNormalForEdge(floor, edge)
      if (!inward) continue
      const prev = cycle[(i - 1 + cycle.length) % cycle.length]
      const next = cycle[(i + 1) % cycle.length]
      const forward = edge.from === wall.a && edge.to === wall.b
      map.set(edge.wallId, {
        inward,
        neighbourAtFrom: prev,
        neighbourAtTo: next,
        forward,
      })
    }
  }
  return map
}

function offsetLine(
  floor: Floor,
  edge: CycleEdge,
  towardInward: boolean,
  half: number,
): { p: Pt; d: Pt } | null {
  const a = vertexPos(floor, edge.from)
  const b = vertexPos(floor, edge.to)
  if (!a || !b) return null
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-12) return null
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const s = towardInward ? half : -half
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  return {
    p: { x: mid.x + nx * s, y: mid.y + ny * s },
    d: { x: ux, y: uy },
  }
}

function halfThickness(floor: Floor, wallId: Id): number {
  const w = floor.walls.find((x) => x.id === wallId)
  return (w?.thickness ?? 0.2) / 2
}

/**
 * Trapezoid footprint: wide outside, narrow inside when the wall bounds a room.
 * Open joins (L/V) get angle-matched miters; free ends stay square.
 */
export function joinedWallFootprint(
  floor: Floor,
  wall: Wall,
  sideMap?: Map<Id, WallSideInfo>,
): Array<{ x: number; y: number }> | null {
  const axes = wallAxes(floor, wall)
  if (!axes) return null
  const half = wall.thickness / 2
  const map = sideMap ?? wallRoomSideInfo(floor)
  const info = map.get(wall.id)

  if (!info) {
    const { nx, ny } = axes
    const atA = miterAtVertex(floor, wall, wall.a, half, nx, ny)
    const atB = miterAtVertex(floor, wall, wall.b, half, nx, ny)
    return [atA.left, atB.left, atB.right, atA.right]
  }

  const { inward, neighbourAtFrom, neighbourAtTo, forward } = info
  const edge: CycleEdge = forward
    ? { wallId: wall.id, from: wall.a, to: wall.b }
    : { wallId: wall.id, from: wall.b, to: wall.a }

  const selfInner = offsetLine(floor, edge, true, half)
  const selfOuter = offsetLine(floor, edge, false, half)
  if (!selfInner || !selfOuter) return null

  const corner = (
    atFromEnd: boolean,
    neighbour: CycleEdge,
  ): { inner: Pt; outer: Pt } => {
    const v = atFromEnd
      ? vertexPos(floor, edge.from)!
      : vertexPos(floor, edge.to)!
    const baseInner = add(v, scale(inward, half))
    const baseOuter = add(v, scale(inward, -half))

    const nh = halfThickness(floor, neighbour.wallId)
    const nInner = offsetLine(floor, neighbour, true, nh)
    const nOuter = offsetLine(floor, neighbour, false, nh)
    if (!nInner || !nOuter) {
      return { inner: baseInner, outer: baseOuter }
    }

    const inner =
      lineIntersect(selfInner.p, selfInner.d, nInner.p, nInner.d) ?? baseInner
    const outer =
      lineIntersect(selfOuter.p, selfOuter.d, nOuter.p, nOuter.d) ?? baseOuter
    return { inner, outer }
  }

  const atFrom = corner(true, neighbourAtFrom)
  const atTo = corner(false, neighbourAtTo)

  // CCW trapezoid a→b: outer-a, outer-b, inner-b, inner-a (wide outside)
  if (forward) {
    return [atFrom.outer, atTo.outer, atTo.inner, atFrom.inner]
  }
  return [atTo.outer, atFrom.outer, atFrom.inner, atTo.inner]
}

export function wallCenterLength(floor: Floor, wall: Wall): number {
  return wallLength(floor, wall)
}

/** Precompute all footprints once (shared room-side map). */
export function allJoinedWallFootprints(
  floor: Floor,
): Map<Id, Array<{ x: number; y: number }>> {
  const sideMap = wallRoomSideInfo(floor)
  const out = new Map<Id, Array<{ x: number; y: number }>>()
  for (const wall of floor.walls) {
    const fp = joinedWallFootprint(floor, wall, sideMap)
    if (fp) out.set(wall.id, fp)
  }
  return out
}

export interface DetectedRoomEdge {
  wallId: Id
  /** Which wall side faces the interior of this room. */
  side: WallSide
}

export interface DetectedRoom {
  key: string
  wallIds: Id[]
  /** Interior plan polygon (CCW), along inner faces with miters. */
  polygon: Array<{ x: number; y: number }>
  edges: DetectedRoomEdge[]
}

/** Stable room key from the set of wall ids in the cycle. */
export function roomKeyFromWallIds(wallIds: Id[]): string {
  return [...wallIds].sort().join('+')
}

/**
 * Which material side of the wall faces the given world-space inward normal.
 * `pos` = +left-hand normal of a→b, `neg` = opposite.
 */
export function wallSideForInwardNormal(
  floor: Floor,
  wall: Wall,
  inward: { x: number; y: number },
): WallSide | null {
  const axes = wallAxes(floor, wall)
  if (!axes) return null
  const dot = inward.x * axes.nx + inward.y * axes.ny
  return dot >= 0 ? 'pos' : 'neg'
}

function offsetEdgeLine(
  floor: Floor,
  edge: CycleEdge,
  half: number,
): { p: Pt; d: Pt } | null {
  return offsetLine(floor, edge, true, half)
}

/** Inner-face polygon for a CCW room cycle (mitered corners). */
function roomInnerPolygon(floor: Floor, cycle: CycleEdge[]): Pt[] {
  const n = cycle.length
  if (n < 3) return []
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const edge = cycle[i]
    const prev = cycle[(i - 1 + n) % n]
    const half = halfThickness(floor, edge.wallId)
    const prevHalf = halfThickness(floor, prev.wallId)
    const self = offsetEdgeLine(floor, edge, half)
    const neigh = offsetEdgeLine(floor, prev, prevHalf)
    const v = vertexPos(floor, edge.from)
    const inward = inwardNormalForEdge(floor, edge)
    if (!v || !inward) continue
    const base = add(v, scale(inward, half))
    if (self && neigh) {
      pts.push(lineIntersect(self.p, self.d, neigh.p, neigh.d) ?? base)
    } else {
      pts.push(base)
    }
  }
  return pts
}

/**
 * Detect closed rooms (wall cycles) with stable keys and per-edge wall sides.
 */
export function detectRooms(floor: Floor): DetectedRoom[] {
  const cycles = findRoomCycles(floor)
  const rooms: DetectedRoom[] = []
  for (const cycle of cycles) {
    const wallIds = cycle.map((e) => e.wallId)
    const key = roomKeyFromWallIds(wallIds)
    const edges: DetectedRoomEdge[] = []
    for (const edge of cycle) {
      const wall = floor.walls.find((w) => w.id === edge.wallId)
      if (!wall) continue
      const inward = inwardNormalForEdge(floor, edge)
      if (!inward) continue
      const side = wallSideForInwardNormal(floor, wall, inward)
      if (!side) continue
      edges.push({ wallId: wall.id, side })
    }
    const polygon = roomInnerPolygon(floor, cycle)
    if (polygon.length < 3 || edges.length < 3) continue
    rooms.push({ key, wallIds, polygon, edges })
  }
  // Smaller rooms first (helpful for hit-testing nested-ish layouts)
  rooms.sort((a, b) => polygonArea(a.polygon) - polygonArea(b.polygon))
  return rooms
}

function polygonArea(poly: Array<{ x: number; y: number }>): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

function pointInPolygon(
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

/** Hit-test a plan point against detected rooms (smallest containing room wins). */
export function hitRoom(floor: Floor, x: number, y: number): DetectedRoom | null {
  const rooms = detectRooms(floor)
  for (const room of rooms) {
    if (pointInPolygon(x, y, room.polygon)) return room
  }
  return null
}

/** Rooms that touch each side of a wall (for UI labels). */
export function roomsForWallSides(
  floor: Floor,
  wallId: Id,
): { pos: DetectedRoom | null; neg: DetectedRoom | null } {
  const rooms = detectRooms(floor)
  let pos: DetectedRoom | null = null
  let neg: DetectedRoom | null = null
  for (const room of rooms) {
    for (const e of room.edges) {
      if (e.wallId !== wallId) continue
      if (e.side === 'pos' && !pos) pos = room
      if (e.side === 'neg' && !neg) neg = room
    }
  }
  return { pos, neg }
}

/**
 * Endpoints of one wall face (pos = +left-hand normal of a→b).
 * Uses the same footprint as the 3D solid so finish/paint planes sit on the
 * outer surface — not a diagonal cut from mismatched miters.
 */
export function wallFaceEndpoints(
  floor: Floor,
  wall: Wall,
  side: WallSide,
): { a: Pt; b: Pt; length: number } | null {
  const axes = wallAxes(floor, wall)
  if (!axes) return null

  const fp = joinedWallFootprint(floor, wall)
  if (!fp || fp.length < 4) return null

  // Footprint ring: [e0, e1, e2, e3] with long edges e0→e1 and e3→e2 (same a→b sense).
  const mid01 = {
    x: (fp[0].x + fp[1].x) / 2,
    y: (fp[0].y + fp[1].y) / 2,
  }
  const mid32 = {
    x: (fp[3].x + fp[2].x) / 2,
    y: (fp[3].y + fp[2].y) / 2,
  }
  const center = {
    x: (axes.a.x + axes.b.x) / 2,
    y: (axes.a.y + axes.b.y) / 2,
  }
  const d01 =
    (mid01.x - center.x) * axes.nx + (mid01.y - center.y) * axes.ny
  const d32 =
    (mid32.x - center.x) * axes.nx + (mid32.y - center.y) * axes.ny

  // pos = side toward +n; neg = toward -n
  let a: Pt
  let b: Pt
  if (side === 'pos') {
    if (d01 >= d32) {
      a = fp[0]
      b = fp[1]
    } else {
      a = fp[3]
      b = fp[2]
    }
  } else if (d01 <= d32) {
    a = fp[0]
    b = fp[1]
  } else {
    a = fp[3]
    b = fp[2]
  }

  // Keep a→b aligned with wall a→b
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx * axes.ux + dy * axes.uy < 0) {
    const tmp = a
    a = b
    b = tmp
  }

  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length < 1e-6) return null
  return { a, b, length }
}

type Pair = [number, number]
type Ring = Pair[]
type Poly = Ring[]
type MultiPoly = Poly[]

function footprintToClipPoly(pts: Array<{ x: number; y: number }>): Poly | null {
  if (pts.length < 3) return null
  const ring: Ring = pts.map((p) => [p.x, p.y])
  const f = ring[0]
  const l = ring[ring.length - 1]
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]])
  return [ring]
}

function stripClose(ring: Array<{ x: number; y: number }>) {
  if (
    ring.length > 1 &&
    ring[0].x === ring[ring.length - 1].x &&
    ring[0].y === ring[ring.length - 1].y
  ) {
    ring.pop()
  }
  return ring
}

/** Drop consecutive near-duplicates that confuse ExtrudeGeometry. */
function cleanRing(ring: Array<{ x: number; y: number }>, eps = 1e-6) {
  const out: Array<{ x: number; y: number }> = []
  for (const p of stripClose(ring)) {
    const prev = out[out.length - 1]
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < eps) continue
    out.push(p)
  }
  if (
    out.length > 1 &&
    Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <
      eps
  ) {
    out.pop()
  }
  return out
}

export interface WallPlanRegion {
  outer: Array<{ x: number; y: number }>
  holes: Array<Array<{ x: number; y: number }>>
}

/** Boolean-union of all wall footprints on a floor (for 3D extrusion). */
export function unionWallPlanRegions(floor: Floor): WallPlanRegion[] {
  const footprints = allJoinedWallFootprints(floor)
  const polys: Poly[] = []
  for (const fp of footprints.values()) {
    const poly = footprintToClipPoly(fp)
    if (poly) polys.push(poly)
  }
  if (polys.length === 0) return []

  const united = polygonClipping.union(
    polys[0] as Poly,
    ...(polys.slice(1) as Poly[]),
  ) as MultiPoly

  const regions: WallPlanRegion[] = []
  for (const polygon of united) {
    if (!polygon.length) continue
    const outer = cleanRing(polygon[0].map(([x, y]) => ({ x, y })))
    const holes = polygon
      .slice(1)
      .map((h) => cleanRing(h.map(([x, y]) => ({ x, y }))))
      .filter((h) => h.length >= 3)
    if (outer.length >= 3) regions.push({ outer, holes })
  }
  return regions
}


