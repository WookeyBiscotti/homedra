import * as THREE from 'three'
import {
  createId,
  normalizeMoldingProfile,
  type Floor,
  type MoldingKind,
  type MoldingSpec,
  type PlacedMolding,
  type WallSide,
} from '../types'
import { openingsForWall, openingSpan } from './openings'
import { detectRooms, type DetectedRoom } from './wallSolid'
import {
  CEILING_FINISH_Y_OFFSET,
  FLOOR_FINISH_Y_OFFSET,
  wallFaceFrame,
} from './wallFaces'
import {
  profileEdgeShadingNormals,
  reverseSmoothEdges,
  tessellateProfileDetailed,
} from './moldingProfile'

export type MoldingInterval = { s0: number; s1: number }

const MIN_MOLDING_LEN = 0.02

function mergeIntervals(
  intervals: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const out: Array<{ start: number; end: number }> = [
    { ...sorted[0]! },
  ]
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!
    const last = out[out.length - 1]!
    if (cur.start <= last.end + 1e-6) {
      last.end = Math.max(last.end, cur.end)
    } else {
      out.push({ ...cur })
    }
  }
  return out
}

function subtractFromSpan(
  spanStart: number,
  spanEnd: number,
  blocked: Array<{ start: number; end: number }>,
): MoldingInterval[] {
  const merged = mergeIntervals(blocked)
  const free: MoldingInterval[] = []
  let cursor = spanStart
  for (const b of merged) {
    const bs = Math.max(spanStart, b.start)
    const be = Math.min(spanEnd, b.end)
    if (be <= bs) continue
    if (bs - cursor >= MIN_MOLDING_LEN) {
      free.push({ s0: cursor, s1: bs })
    }
    cursor = Math.max(cursor, be)
  }
  if (spanEnd - cursor >= MIN_MOLDING_LEN) {
    free.push({ s0: cursor, s1: spanEnd })
  }
  return free
}

/**
 * Free along-face intervals for a molding kind.
 * Skirting is cut by doors/passages that reach the floor; cove ignores openings.
 */
export function freeMoldingIntervals(
  floor: Floor,
  wallId: string,
  side: WallSide,
  kind: MoldingKind,
): MoldingInterval[] {
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return []
  const face = wallFaceFrame(floor, wall, side)
  if (!face || face.len < MIN_MOLDING_LEN) return []

  const blocked: Array<{ start: number; end: number }> = []
  if (kind === 'skirting') {
    for (const o of openingsForWall(floor, wallId)) {
      if (o.kind === 'window') continue
      if (o.sillHeight > 0.05) continue
      const span = openingSpan(o)
      blocked.push({
        start: span.start - face.s0,
        end: span.end - face.s0,
      })
    }
  }
  return subtractFromSpan(0, face.len, blocked)
}

export function intervalContaining(
  intervals: MoldingInterval[],
  u: number,
): MoldingInterval | null {
  for (const iv of intervals) {
    if (u >= iv.s0 - 1e-4 && u <= iv.s1 + 1e-4) return iv
  }
  // Snap to nearest if within a small margin of a gap edge
  let best: MoldingInterval | null = null
  let bestDist = 0.05
  for (const iv of intervals) {
    const d = Math.min(Math.abs(u - iv.s0), Math.abs(u - iv.s1))
    if (u >= iv.s0 && u <= iv.s1) return iv
    if (d < bestDist) {
      bestDist = d
      best = iv
    }
  }
  return best
}

export function makePlacedMolding(
  spec: MoldingSpec,
  wallId: string,
  side: WallSide,
  interval: MoldingInterval,
  miters?: { miterStart?: number; miterEnd?: number },
): PlacedMolding {
  return {
    id: createId('mold'),
    name: spec.name,
    kind: spec.kind,
    profile: normalizeMoldingProfile(spec.profile, spec.kind),
    material: { ...spec.material },
    wallId,
    side,
    s0: interval.s0,
    s1: interval.s1,
    miterStart: miters?.miterStart,
    miterEnd: miters?.miterEnd,
  }
}

/** Place one plank on the free interval under face-U `u`. */
export function placeMoldingAtFaceU(
  floor: Floor,
  spec: MoldingSpec,
  wallId: string,
  side: WallSide,
  u: number,
): PlacedMolding | null {
  const iv = intervalContaining(
    freeMoldingIntervals(floor, wallId, side, spec.kind),
    u,
  )
  if (!iv) return null
  return makePlacedMolding(spec, wallId, side, iv)
}

function wallFaceTangent(
  floor: Floor,
  wallId: string,
  side: WallSide,
): { ux: number; uz: number } | null {
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return null
  const face = wallFaceFrame(floor, wall, side)
  if (!face) return null
  return { ux: face.ux, uz: face.uz }
}

/**
 * Travel direction along a room edge (CCW cycle: interior on the left).
 * Face `ux` always follows wall a→b; on the neg side the room walks b→a.
 */
export function roomEdgeTravel(
  floor: Floor,
  wallId: string,
  side: WallSide,
): { ux: number; uz: number; /** true = along face ux (s0→s1) */ forward: boolean } | null {
  const t = wallFaceTangent(floor, wallId, side)
  if (!t) return null
  if (side === 'pos') return { ux: t.ux, uz: t.uz, forward: true }
  return { ux: -t.ux, uz: -t.uz, forward: false }
}

const MAX_MITER_RAD = (75 * Math.PI) / 180

function clampMiter(radians: number): number {
  if (!Number.isFinite(radians)) return 0
  return Math.max(-MAX_MITER_RAD, Math.min(MAX_MITER_RAD, radians))
}

/**
 * Interior turn at room corner between edge i-1 → i (outgoing of previous,
 * incoming of current). Returns miter offset angles for the end of prev and
 * start of current (radians from a square cut).
 */
export function cornerMiters(
  floor: Floor,
  room: DetectedRoom,
  cornerIndex: number,
): { endOfPrev: number; startOfNext: number } {
  const n = room.edges.length
  const prev = room.edges[(cornerIndex - 1 + n) % n]!
  const next = room.edges[cornerIndex]!
  const t0 = roomEdgeTravel(floor, prev.wallId, prev.side)
  const t1 = roomEdgeTravel(floor, next.wallId, next.side)
  if (!t0 || !t1) return { endOfPrev: 0, startOfNext: 0 }
  // Plan tangent as (x,y) with y = -z in world
  const ax = t0.ux
  const ay = -t0.uz
  const bx = t1.ux
  const by = -t1.uz
  const cross = ax * by - ay * bx
  const dot = ax * bx + ay * by
  const turn = Math.atan2(cross, dot)
  // Half turn from a square cut; clamp so tan(miter) stays finite
  const half = clampMiter(turn * 0.5)
  return { endOfPrev: half, startOfNext: -half }
}

/** All moldings for a room perimeter (with miters). */
export function fillRoomMoldings(
  floor: Floor,
  roomKey: string,
  spec: MoldingSpec,
): PlacedMolding[] {
  const room = detectRooms(floor).find((r) => r.key === roomKey)
  if (!room) return []
  const n = room.edges.length
  const endMiters = new Array<number>(n).fill(0)
  const startMiters = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) {
    const m = cornerMiters(floor, room, i)
    endMiters[(i - 1 + n) % n] = m.endOfPrev
    startMiters[i] = m.startOfNext
  }

  const out: PlacedMolding[] = []
  for (let i = 0; i < n; i++) {
    const edge = room.edges[i]!
    const travel = roomEdgeTravel(floor, edge.wallId, edge.side)
    if (!travel) continue
    const intervals = freeMoldingIntervals(
      floor,
      edge.wallId,
      edge.side,
      spec.kind,
    )
    for (const iv of intervals) {
      const wall = floor.walls.find((w) => w.id === edge.wallId)
      if (!wall) continue
      const face = wallFaceFrame(floor, wall, edge.side)
      if (!face) continue
      const atS0 = Math.abs(iv.s0) < 1e-3
      const atS1 = Math.abs(iv.s1 - face.len) < 1e-3
      // Cycle start/end miters map to face s0/s1 depending on travel dir.
      let miterStart = 0
      let miterEnd = 0
      if (travel.forward) {
        if (atS0) miterStart = startMiters[i]!
        if (atS1) miterEnd = endMiters[i]!
      } else {
        // Walks s1→s0: cycle start is at s1, cycle end at s0.
        if (atS1) miterEnd = startMiters[i]!
        if (atS0) miterStart = endMiters[i]!
      }
      out.push(
        makePlacedMolding(spec, edge.wallId, edge.side, iv, {
          miterStart: clampMiter(miterStart),
          miterEnd: clampMiter(miterEnd),
        }),
      )
    }
  }
  return out
}

export function addMoldings(floor: Floor, moldings: PlacedMolding[]): Floor {
  return {
    ...floor,
    moldings: [...(floor.moldings ?? []), ...moldings],
  }
}

/** Same wall face + kind with overlapping along-face span. */
export function moldingsOverlap(
  a: Pick<PlacedMolding, 'wallId' | 'side' | 'kind' | 's0' | 's1'>,
  b: Pick<PlacedMolding, 'wallId' | 'side' | 'kind' | 's0' | 's1'>,
): boolean {
  if (a.wallId !== b.wallId || a.side !== b.side || a.kind !== b.kind) {
    return false
  }
  return a.s0 < b.s1 - 1e-4 && a.s1 > b.s0 + 1e-4
}

/** Drop existing planks that collide with `moldings`, then append the new ones. */
export function addMoldingsReplacing(
  floor: Floor,
  moldings: PlacedMolding[],
): Floor {
  if (moldings.length === 0) return floor
  const kept = (floor.moldings ?? []).filter(
    (old) => !moldings.some((neu) => moldingsOverlap(old, neu)),
  )
  return { ...floor, moldings: [...kept, ...moldings] }
}

export function removeMolding(floor: Floor, id: string): Floor {
  return {
    ...floor,
    moldings: (floor.moldings ?? []).filter((m) => m.id !== id),
  }
}

export function removeMoldings(floor: Floor, ids: string[]): Floor {
  const set = new Set(ids)
  return {
    ...floor,
    moldings: (floor.moldings ?? []).filter((m) => !set.has(m.id)),
  }
}

export function removeMoldingsForWall(floor: Floor, wallId: string): Floor {
  return {
    ...floor,
    moldings: (floor.moldings ?? []).filter((m) => m.wallId !== wallId),
  }
}

/**
 * Sweep molding profile along a wall-face interval.
 * Profile x → into room (wall normal); profile y → up from floor / down from ceiling.
 * Straight profile edges get flat face normals; bulge arcs stay smooth.
 */
export function buildMoldingGeometry(
  floor: Floor,
  molding: PlacedMolding,
): THREE.BufferGeometry | null {
  const wall = floor.walls.find((w) => w.id === molding.wallId)
  if (!wall) return null
  const face = wallFaceFrame(floor, wall, molding.side)
  if (!face) return null
  const len = molding.s1 - molding.s0
  if (len < MIN_MOLDING_LEN) return null

  const tess = tessellateProfileDetailed(
    normalizeMoldingProfile(molding.profile, molding.kind),
  )
  let profile = tess.vertices
  let smoothEdge = tess.smoothEdge
  if (profile.length < 3) return null

  const ux = face.ux
  const uz = face.uz
  const nx = face.wnx
  const nz = face.wnz
  const hand = -uz * nx + ux * nz // (T × Up) · N
  let area = 0
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i]!
    const q = profile[(i + 1) % profile.length]!
    area += p.x * q.y - q.x * p.y
  }
  const wantCcw = hand >= 0
  const isCcw = area >= 0
  if (wantCcw !== isCcw) {
    profile = [...profile].reverse()
    smoothEdge = reverseSmoothEdges(smoothEdge)
  }

  // Sit on the visible floor / under the ceiling finish (not under the slab).
  const baseY =
    molding.kind === 'cove'
      ? face.elevation + face.height - CEILING_FINISH_Y_OFFSET
      : face.elevation + FLOOR_FINISH_Y_OFFSET
  const ySign = molding.kind === 'cove' ? -1 : 1
  // Tiny pull into the wall so the back doesn't float off the finish.
  const wallSeat = 0.001

  const miter0 = clampMiter(molding.miterStart ?? 0)
  const miter1 = clampMiter(molding.miterEnd ?? 0)

  const n = profile.length

  const ringPos = (end: 0 | 1, i: number): [number, number, number] => {
    const s = end === 0 ? molding.s0 : molding.s1
    const miter = end === 0 ? miter0 : miter1
    const tanM = Math.tan(miter)
    const ox = face.ax + ux * s - nx * wallSeat
    const oz = face.az + uz * s - nz * wallSeat
    const p = profile[i]!
    const shear = p.x * tanM * (end === 0 ? 1 : -1)
    return [
      ox + nx * p.x + ux * shear,
      baseY + ySign * p.y,
      oz + nz * p.x + uz * shear,
    ]
  }

  const toWorldNormal = (n2: { x: number; y: number }): [number, number, number] => {
    const wx = n2.x * nx
    const wy = n2.y * ySign
    const wz = n2.x * nz
    const wlen = Math.hypot(wx, wy, wz) || 1
    return [wx / wlen, wy / wlen, wz / wlen]
  }

  // Side shell: one quad per profile edge, unique verts so flat edges stay flat.
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  let cx = 0
  let cy = 0
  let cz = 0
  for (let i = 0; i < n; i++) {
    const p0 = ringPos(0, i)
    const p1 = ringPos(1, i)
    cx += p0[0] + p1[0]
    cy += p0[1] + p1[1]
    cz += p0[2] + p1[2]
  }
  cx /= n * 2
  cy /= n * 2
  cz /= n * 2

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const shade = profileEdgeShadingNormals(profile, smoothEdge, i)
    const nA = toWorldNormal(shade.a)
    const nB = toWorldNormal(shade.b)
    const a0 = ringPos(0, i)
    const b0 = ringPos(0, j)
    const b1 = ringPos(1, j)
    const a1 = ringPos(1, i)
    const base = positions.length / 3
    // a0, b0, b1, a1
    positions.push(
      a0[0], a0[1], a0[2],
      b0[0], b0[1], b0[2],
      b1[0], b1[1], b1[2],
      a1[0], a1[1], a1[2],
    )
    normals.push(
      nA[0], nA[1], nA[2],
      nB[0], nB[1], nB[2],
      nB[0], nB[1], nB[2],
      nA[0], nA[1], nA[2],
    )
    uvs.push(0, i / n, 0, j / n, len, j / n, len, i / n)

    const midX = (a0[0] + b0[0] + b1[0] + a1[0]) * 0.25
    const midY = (a0[1] + b0[1] + b1[1] + a1[1]) * 0.25
    const midZ = (a0[2] + b0[2] + b1[2] + a1[2]) * 0.25
    const e1x = b0[0] - a0[0]
    const e1y = b0[1] - a0[1]
    const e1z = b0[2] - a0[2]
    const e2x = a1[0] - a0[0]
    const e2y = a1[1] - a0[1]
    const e2z = a1[2] - a0[2]
    const fx = e1y * e2z - e1z * e2y
    const fy = e1z * e2x - e1x * e2z
    const fz = e1x * e2y - e1y * e2x
    const outward =
      fx * (midX - cx) + fy * (midY - cy) + fz * (midZ - cz) >= 0
    if (outward) {
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    } else {
      indices.push(base, base + 3, base + 2, base, base + 2, base + 1)
    }
  }

  // End caps: unique verts so normals stay ±face (not averaged with sides).
  const capPositions: number[] = []
  const capNormals: number[] = []
  const capUvs: number[] = []
  const capIndices: number[] = []
  const baseVertex = positions.length / 3

  for (const end of [0, 1] as const) {
    const miter = end === 0 ? miter0 : miter1
    const tanM = Math.tan(miter)
    const depthX = nx + ux * tanM * (end === 0 ? 1 : -1)
    const depthZ = nz + uz * tanM * (end === 0 ? 1 : -1)
    let nxw = depthZ
    let nyw = 0
    let nzw = -depthX
    const nSign = end === 0 ? -1 : 1
    if (nxw * ux * nSign + nzw * uz * nSign < 0) {
      nxw = -nxw
      nzw = -nzw
    }
    const nlen = Math.hypot(nxw, nzw) || 1
    nxw /= nlen
    nzw /= nlen

    const rim: Array<[number, number, number]> = []
    let rcx = 0
    let rcy = 0
    let rcz = 0
    for (let i = 0; i < n; i++) {
      const p = ringPos(end, i)
      rim.push(p)
      rcx += p[0]
      rcy += p[1]
      rcz += p[2]
    }
    rcx /= n
    rcy /= n
    rcz /= n

    const cIdx = baseVertex + capPositions.length / 3
    capPositions.push(rcx, rcy, rcz)
    capNormals.push(nxw, nyw, nzw)
    capUvs.push(0.5, 0.5)
    const rimStart = cIdx + 1
    for (let i = 0; i < n; i++) {
      const p = rim[i]!
      capPositions.push(p[0], p[1], p[2])
      capNormals.push(nxw, nyw, nzw)
      capUvs.push(profile[i]!.x * 10 + 0.5, profile[i]!.y * 10 + 0.5)
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const ai = rimStart + i
      const bi = rimStart + j
      const a = rim[i]!
      const b = rim[j]!
      const rax = a[0] - rcx
      const ray = a[1] - rcy
      const raz = a[2] - rcz
      const rbx = b[0] - rcx
      const rby = b[1] - rcy
      const rbz = b[2] - rcz
      const fx = ray * rbz - raz * rby
      const fy = raz * rbx - rax * rbz
      const fz = rax * rby - ray * rbx
      if (fx * nxw + fy * nyw + fz * nzw >= 0) {
        capIndices.push(cIdx, ai, bi)
      } else {
        capIndices.push(cIdx, bi, ai)
      }
    }
  }

  const allPos = new Float32Array(positions.length + capPositions.length)
  allPos.set(positions)
  allPos.set(capPositions, positions.length)
  const allNor = new Float32Array(normals.length + capNormals.length)
  allNor.set(normals)
  allNor.set(capNormals, normals.length)
  const allUv = new Float32Array(uvs.length + capUvs.length)
  allUv.set(uvs)
  allUv.set(capUvs, uvs.length)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(allPos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(allNor, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(allUv, 2))
  geo.setIndex([...indices, ...capIndices])
  return geo
}
