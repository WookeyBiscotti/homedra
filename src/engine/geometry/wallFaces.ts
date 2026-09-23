import * as THREE from 'three'
import type { Floor, Wall, WallSide } from '../types'
import { wallFaceEndpoints, wallAxes } from './wallSolid'
import { openingsForWall, openingSpan, wallEndpoints } from './openings'

const FACE_OUTSET = 0.025
/** Wall paint hit starts above the slab so floor pick owns near-wall clicks. */
const WALL_PAINT_Y0 = 0.22

type Interval = { start: number; end: number }

function mergeIntervals(spans: Interval[]): Interval[] {
  if (spans.length === 0) return []
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const out: Interval[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]
    const last = out[out.length - 1]
    if (cur.start <= last.end + 1e-6) {
      last.end = Math.max(last.end, cur.end)
    } else {
      out.push({ ...cur })
    }
  }
  return out
}

function freeIntervals(length: number, blocked: Interval[]): Interval[] {
  const merged = mergeIntervals(
    blocked
      .map((s) => ({
        start: Math.max(0, s.start),
        end: Math.min(length, s.end),
      }))
      .filter((s) => s.end - s.start > 1e-4),
  )
  const free: Interval[] = []
  let cursor = 0
  for (const b of merged) {
    if (b.start > cursor + 1e-4) free.push({ start: cursor, end: b.start })
    cursor = Math.max(cursor, b.end)
  }
  if (length > cursor + 1e-4) free.push({ start: cursor, end: length })
  return free
}

/**
 * Vertical face mesh for one wall side, with openings cut out.
 * UV in meters: u along wall from a, v from floor elevation.
 */
export function buildWallFaceGeometry(
  floor: Floor,
  wall: Wall,
  side: WallSide,
): THREE.BufferGeometry | null {
  const frame = wallFaceFrame(floor, wall, side)
  if (!frame) return null
  const { ax, az, bx, bz, len, ux, uz, wnx, wnz } = frame

  const openings = openingsForWall(floor, wall.id)
  // Opening offsets are along the centerline; scale onto the mitered face length.
  const center = wallEndpoints(floor, wall)
  const uScale =
    center && center.len > 1e-6 ? len / center.len : 1

  const ySet = new Set<number>([0, floor.height])
  for (const o of openings) {
    ySet.add(Math.max(0, o.sillHeight))
    ySet.add(Math.min(floor.height, o.sillHeight + o.height))
  }
  const ys = [...ySet].sort((a, b) => a - b)

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  const pushQuad = (
    u0: number,
    u1: number,
    y0: number,
    y1: number,
  ) => {
    if (u1 - u0 < 1e-4 || y1 - y0 < 1e-4) return
    pushFaceQuad({
      positions,
      normals,
      uvs,
      indices,
      ax,
      az,
      ux,
      uz,
      wnx,
      wnz,
      elevation: floor.elevation,
      u0,
      u1,
      y0,
      y1,
    })
  }

  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i]
    const y1 = ys[i + 1]
    const midY = (y0 + y1) / 2
    const blocked: Interval[] = []
    for (const o of openings) {
      const top = o.sillHeight + o.height
      if (midY <= o.sillHeight + 1e-6 || midY >= top - 1e-6) continue
      const span = openingSpan(o)
      blocked.push({
        start: span.start * uScale,
        end: span.end * uScale,
      })
    }
    for (const seg of freeIntervals(len, blocked)) {
      pushQuad(seg.start, seg.end, y0, y1)
    }
  }

  if (positions.length === 0) return null

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  return finalizePbrGeometry(geo)
}

export type WallFaceFrame = {
  ax: number
  az: number
  bx: number
  bz: number
  len: number
  ux: number
  uz: number
  wnx: number
  wnz: number
  /** Plan-space endpoints before world convert (for opening tests). */
  planA: { x: number; y: number }
  planB: { x: number; y: number }
  uScale: number
  height: number
  elevation: number
}

/** Shared frame for finish + paint-hit meshes on one wall side. */
export function wallFaceFrame(
  floor: Floor,
  wall: Wall,
  side: WallSide,
  outset = FACE_OUTSET,
): WallFaceFrame | null {
  const ends = wallFaceEndpoints(floor, wall, side)
  const axes = wallAxes(floor, wall)
  if (!ends || !axes || ends.length < 1e-6) return null

  const nx = side === 'pos' ? axes.nx : -axes.nx
  const ny = side === 'pos' ? axes.ny : -axes.ny
  const ox = nx * outset
  const oz = ny * outset

  const ax = ends.a.x + ox
  const az = -(ends.a.y + oz)
  const bx = ends.b.x + ox
  const bz = -(ends.b.y + oz)
  const len = ends.length
  const ux = (bx - ax) / len
  const uz = (bz - az) / len
  const wnx = nx
  const wnz = -ny

  const center = wallEndpoints(floor, wall)
  const uScale =
    center && center.len > 1e-6 ? len / center.len : 1

  return {
    ax,
    az,
    bx,
    bz,
    len,
    ux,
    uz,
    wnx,
    wnz,
    planA: ends.a,
    planB: ends.b,
    uScale,
    height: floor.height,
    elevation: floor.elevation,
  }
}

/**
 * Single full-height quad for paint picking (no opening cuts).
 * Openings are filtered in raycast so there are no gaps between strips.
 */
export function buildWallPaintHitGeometry(
  floor: Floor,
  wall: Wall,
  side: WallSide,
): THREE.BufferGeometry | null {
  // Extra outset so the hit plane sits clearly outside the solid extrusion
  const frame = wallFaceFrame(floor, wall, side, FACE_OUTSET + 0.03)
  if (!frame) return null
  const { ax, az, ux, uz, wnx, wnz, len, height, elevation } = frame

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  pushFaceQuad({
    positions,
    normals,
    uvs,
    indices,
    ax,
    az,
    ux,
    uz,
    wnx,
    wnz,
    elevation,
    u0: 0,
    u1: len,
    // Leave a gap above the floor so the floor paint plane owns the slab
    y0: WALL_PAINT_Y0,
    y1: height,
  })

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeBoundingSphere()
  return geo
}

/** True if a world-space hit on the face lies inside a wall opening. */
export function wallFaceHitInOpening(
  floor: Floor,
  wall: Wall,
  side: WallSide,
  worldPoint: { x: number; y: number; z: number },
): boolean {
  const frame = wallFaceFrame(floor, wall, side, FACE_OUTSET + 0.03)
  if (!frame) return false
  const { ax, az, ux, uz, len, uScale, elevation } = frame
  const dx = worldPoint.x - ax
  const dz = worldPoint.z - az
  const u = dx * ux + dz * uz
  const y = worldPoint.y - elevation
  if (u < -1e-3 || u > len + 1e-3) return false
  if (y < -1e-3 || y > floor.height + 1e-3) return false

  const uCenter = u / uScale
  for (const o of openingsForWall(floor, wall.id)) {
    const span = openingSpan(o)
    if (uCenter < span.start - 1e-3 || uCenter > span.end + 1e-3) continue
    const top = o.sillHeight + o.height
    if (y >= o.sillHeight - 1e-3 && y <= top + 1e-3) return true
  }
  return false
}

function pushFaceQuad(args: {
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
  ax: number
  az: number
  ux: number
  uz: number
  wnx: number
  wnz: number
  elevation: number
  u0: number
  u1: number
  y0: number
  y1: number
}) {
  const {
    positions,
    normals,
    uvs,
    indices,
    ax,
    az,
    ux,
    uz,
    wnx,
    wnz,
    elevation,
    u0,
    u1,
    y0,
    y1,
  } = args
  const base = positions.length / 3
  const yBot = elevation + y0
  const yTop = elevation + y1
  const x0 = ax + ux * u0
  const z0 = az + uz * u0
  const x1 = ax + ux * u1
  const z1 = az + uz * u1

  // Winding a→b→up gives geom normal (-uz, 0, ux). Flip when it faces
  // inward so FrontSide culling/raycast matches outward (wnx, 0, wnz).
  const forwardDot = -uz * wnx + ux * wnz
  const flip = forwardDot < 0

  if (flip) {
    positions.push(x1, yBot, z1, x0, yBot, z0, x0, yTop, z0, x1, yTop, z1)
    uvs.push(u1, y0, u0, y0, u0, y1, u1, y1)
  } else {
    positions.push(x0, yBot, z0, x1, yBot, z1, x1, yTop, z1, x0, yTop, z0)
    uvs.push(u0, y0, u1, y0, u1, y1, u0, y1)
  }
  for (let i = 0; i < 4; i++) normals.push(wnx, 0, wnz)
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

/** Flat floor polygon for a room (walking surface). UV = world XZ in meters. */
export function buildRoomFloorGeometry(
  polygon: Array<{ x: number; y: number }>,
  elevation: number,
  opts?: {
    yOffset?: number
    inflateM?: number
    /** Plan-space holes (e.g. stair wells), CCW or CW — will be oriented CW */
    holes?: Array<Array<{ x: number; y: number }>>
  },
): THREE.BufferGeometry | null {
  if (polygon.length < 3) return null
  const yOffset = opts?.yOffset ?? 0.002
  const inflated =
    opts?.inflateM && opts.inflateM > 0
      ? inflatePolygonOutward(polygon, opts.inflateM)
      : polygon

  const shape = new THREE.Shape()
  // Shape XY → after rotateX(-π/2): world (x, y, -shapeY); use shapeY = plan.y
  const outer = orientRingForShape(inflated, true)
  shape.moveTo(outer[0].x, outer[0].y)
  for (let i = 1; i < outer.length; i++) {
    shape.lineTo(outer[i].x, outer[i].y)
  }
  shape.closePath()

  for (const hole of opts?.holes ?? []) {
    if (hole.length < 3) continue
    // Earcut crashes / yields NaN if a hole lies outside the outer ring.
    const cx = hole.reduce((s, p) => s + p.x, 0) / hole.length
    const cy = hole.reduce((s, p) => s + p.y, 0) / hole.length
    if (!pointInRingXY(cx, cy, outer)) continue
    const ring = orientRingForShape(hole, false)
    const path = new THREE.Path()
    path.moveTo(ring[0].x, ring[0].y)
    for (let i = 1; i < ring.length; i++) {
      path.lineTo(ring[i].x, ring[i].y)
    }
    path.closePath()
    shape.holes.push(path)
  }

  let geo: THREE.BufferGeometry
  try {
    geo = new THREE.ShapeGeometry(shape)
  } catch {
    return null
  }
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, elevation + yOffset, 0)

  // Rebuild UVs as world XZ (after rotate, Z = -planY)
  const pos = geo.attributes.position
  if (!pos || pos.count === 0) {
    geo.dispose()
    return null
  }
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      geo.dispose()
      return null
    }
    uv[i * 2] = x
    uv[i * 2 + 1] = -z // plan Y for stable tiling with tileSize
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.computeVertexNormals()
  return finalizePbrGeometry(geo)
}

function pointInRingXY(
  x: number,
  y: number,
  ring: Array<{ x: number; y: number }>,
): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x
    const yi = ring[i].y
    const xj = ring[j].x
    const yj = ring[j].y
    if (Math.abs(yj - yi) < 1e-15) continue
    const t = ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (yi > y !== yj > y && x < t) inside = !inside
  }
  return inside
}

function orientRingForShape(
  ring: Array<{ x: number; y: number }>,
  ccw: boolean,
): Array<{ x: number; y: number }> {
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    area += p.x * q.y - q.x * p.y
  }
  const isCcw = area > 0
  const copy = ring.map((p) => ({ ...p }))
  if (isCcw !== ccw) copy.reverse()
  return copy
}

/**
 * Push a CCW plan polygon outward by `delta` (covers the strip between
 * inner wall faces and the visible slab near walls).
 * If the ring is clockwise, treats outward accordingly.
 */
export function inflatePolygonOutward(
  polygon: Array<{ x: number; y: number }>,
  delta: number,
): Array<{ x: number; y: number }> {
  const n = polygon.length
  if (n < 3 || delta === 0) return polygon.map((p) => ({ ...p }))

  let area2 = 0
  for (let i = 0; i < n; i++) {
    const p = polygon[i]
    const q = polygon[(i + 1) % n]
    area2 += p.x * q.y - q.x * p.y
  }
  // CCW → positive area2 → outward = right of edge (dy, -dx)
  // CW → flip
  const sign = area2 >= 0 ? 1 : -1

  const out: Array<{ x: number; y: number }> = []
  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n]
    const cur = polygon[i]
    const next = polygon[(i + 1) % n]

    let dx1 = cur.x - prev.x
    let dy1 = cur.y - prev.y
    const len1 = Math.hypot(dx1, dy1) || 1
    dx1 /= len1
    dy1 /= len1
    const ox1 = sign * dy1
    const oy1 = sign * -dx1

    let dx2 = next.x - cur.x
    let dy2 = next.y - cur.y
    const len2 = Math.hypot(dx2, dy2) || 1
    dx2 /= len2
    dy2 /= len2
    const ox2 = sign * dy2
    const oy2 = sign * -dx2

    let ox = ox1 + ox2
    let oy = oy1 + oy2
    const ol = Math.hypot(ox, oy) || 1
    ox /= ol
    oy /= ol
    out.push({ x: cur.x + ox * delta, y: cur.y + oy * delta })
  }
  return out
}

/** AO needs uv2; normal maps need tangents on custom BufferGeometry. */
function finalizePbrGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = geo.attributes.uv
  if (uv) {
    geo.setAttribute('uv2', uv.clone())
  }
  try {
    geo.computeTangents()
  } catch {
    // Non-indexed or degenerate — skip; normalMap still mostly works
  }
  return geo
}
