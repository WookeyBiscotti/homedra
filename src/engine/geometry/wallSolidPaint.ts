import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Floor, Id, Wall, WallSide } from '../types'
import type { WallExtrudeLayer } from '../extrude'
import { projectOnSegment } from './walls'
import {
  openingPlanRect,
  openingsForWall,
  openingSpan,
  wallEndpoints,
} from './openings'
import { wallAxes, wallFaceEndpoints } from './wallSolid'
import { wallFaceFrame } from './wallFaces'
import { wallFreeEndPlanEdge, appendOpeningHorizontalCutQuads } from './wallCuts'

export type WallSolidSlot = 'pos' | 'neg' | 'cut' | 'body'

export type WallSolidPart = {
  key: string
  wallId?: Id
  slot: WallSolidSlot
  geometry: THREE.BufferGeometry
}

type Pt = { x: number; y: number }

type FaceSeg = {
  wallId: Id
  slot: 'pos' | 'neg' | 'cut'
  a: Pt
  b: Pt
  outward: Pt
}

const VERTICAL_NY = 0.55
const MATCH_DIST = 0.045
const MATCH_ALIGN = 0.45
const SEAM_ON_EDGE = 0.02

function planFromWorld(x: number, z: number): Pt {
  return { x, y: -z }
}

function ringArea(ring: Array<{ x: number; z: number }>): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    a += p.x * q.z - q.x * p.z
  }
  return a / 2
}

/** Outward (away from solid) plan normal for an edge of a wall-union ring. */
export function ringEdgeOutward(
  ring: Array<{ x: number; z: number }>,
  i: number,
): Pt {
  const a = ring[i]
  const b = ring[(i + 1) % ring.length]
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz) || 1
  // Right of travel in XZ-as-XY: (dz, -dx). Flip if the ring winds CW
  // so the normal always leaves the solid (outer CCW, hole CW).
  const sign = ringArea(ring) >= 0 ? 1 : -1
  return { x: (sign * dz) / len, y: (-sign * dx) / len }
}

export function buildWallSolidFaceCatalog(floor: Floor): FaceSeg[] {
  const segs: FaceSeg[] = []
  for (const wall of floor.walls) {
    const axes = wallAxes(floor, wall)
    if (!axes) continue
    for (const side of ['pos', 'neg'] as WallSide[]) {
      const ends = wallFaceEndpoints(floor, wall, side)
      if (!ends) continue
      const outward =
        side === 'pos'
          ? { x: axes.nx, y: axes.ny }
          : { x: -axes.nx, y: -axes.ny }
      segs.push({
        wallId: wall.id,
        slot: side,
        a: ends.a,
        b: ends.b,
        outward,
      })
    }
    for (const end of ['a', 'b'] as const) {
      const edge = wallFreeEndPlanEdge(floor, wall, end)
      if (!edge) continue
      segs.push({
        wallId: wall.id,
        slot: 'cut',
        a: edge.p0,
        b: edge.p1,
        outward: edge.outward,
      })
    }
    const ends = wallEndpoints(floor, wall)
    if (!ends || ends.len < 1e-9) continue
    const halfT = wall.thickness / 2 + 0.03
    for (const opening of openingsForWall(floor, wall.id)) {
      const span = openingSpan(opening)
      const along = (s: number, n: number): Pt => ({
        x: ends.a.x + axes.ux * s + axes.nx * n,
        y: ends.a.y + axes.uy * s + axes.ny * n,
      })
      // Jambs face into the opening (same as pushOpeningReveals).
      segs.push({
        wallId: wall.id,
        slot: 'cut',
        a: along(span.start, -halfT),
        b: along(span.start, halfT),
        outward: { x: axes.ux, y: axes.uy },
      })
      segs.push({
        wallId: wall.id,
        slot: 'cut',
        a: along(span.end, -halfT),
        b: along(span.end, halfT),
        outward: { x: -axes.ux, y: -axes.uy },
      })
    }
  }
  return segs
}

function seamPoints(floor: Floor): Pt[] {
  const pts: Pt[] = []
  const seen = new Set<string>()
  const add = (p: Pt) => {
    const k = `${p.x.toFixed(4)},${p.y.toFixed(4)}`
    if (seen.has(k)) return
    seen.add(k)
    pts.push(p)
  }
  for (const wall of floor.walls) {
    for (const side of ['pos', 'neg'] as WallSide[]) {
      const ends = wallFaceEndpoints(floor, wall, side)
      if (!ends) continue
      add(ends.a)
      add(ends.b)
    }
    for (const end of ['a', 'b'] as const) {
      const edge = wallFreeEndPlanEdge(floor, wall, end)
      if (!edge) continue
      add(edge.p0)
      add(edge.p1)
    }
    for (const opening of openingsForWall(floor, wall.id)) {
      const rect = openingPlanRect(floor, opening)
      if (!rect) continue
      for (const p of rect) add(p)
    }
  }
  return pts
}

/**
 * Insert wall-joint / opening points onto a union ring so colinear walls
 * keep separate extrusion edges (otherwise one long face spans two walls).
 */
export function splitPlanRingAtSeams(
  ring: Array<{ x: number; z: number }>,
  seams: Pt[],
): Array<{ x: number; z: number }> {
  if (ring.length < 2 || seams.length === 0) return ring.map((p) => ({ ...p }))
  const out: Array<{ x: number; z: number }> = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    out.push({ x: a.x, z: a.z })
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) continue
    const hits: number[] = []
    for (const s of seams) {
      const proj = projectOnSegment(s.x, s.y, a.x, a.z, b.x, b.z)
      if (proj.dist > SEAM_ON_EDGE) continue
      if (proj.t < 1e-3 || proj.t > 1 - 1e-3) continue
      hits.push(proj.t)
    }
    hits.sort((x, y) => x - y)
    let last = 0
    for (const t of hits) {
      if (t - last < 1e-3) continue
      out.push({ x: a.x + dx * t, z: a.z + dz * t })
      last = t
    }
  }
  return out
}

function splitLayerRings(
  floor: Floor,
  layers: WallExtrudeLayer[],
): WallExtrudeLayer[] {
  const seams = seamPoints(floor)
  return layers.map((layer) => ({
    ...layer,
    rings: layer.rings.map((ring) => splitPlanRingAtSeams(ring, seams)),
    holes: layer.holes.map((hs) =>
      hs.map((hole) => splitPlanRingAtSeams(hole, seams)),
    ),
  }))
}

function extrudeLayer(layer: WallExtrudeLayer): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = []
  for (let i = 0; i < layer.rings.length; i++) {
    const ring = layer.rings[i]
    if (ring.length < 3) continue
    const shape = new THREE.Shape()
    shape.moveTo(ring[0].x, ring[0].z)
    for (let j = 1; j < ring.length; j++) {
      shape.lineTo(ring[j].x, ring[j].z)
    }
    shape.closePath()
    for (const hole of layer.holes[i] ?? []) {
      if (hole.length < 3) continue
      const path = new THREE.Path()
      path.moveTo(hole[0].x, hole[0].z)
      for (let j = 1; j < hole.length; j++) {
        path.lineTo(hole[j].x, hole[j].z)
      }
      path.closePath()
      shape.holes.push(path)
    }
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: layer.height,
      bevelEnabled: false,
      curveSegments: 1,
      steps: 1,
    })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, layer.y, 0)
    geos.push(geo)
  }
  if (geos.length === 0) return null
  const merged = mergeGeometries(geos, false)
  for (const g of geos) g.dispose()
  return merged
}

function pointInRing(p: Pt, ring: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].y
    const yj = ring[j].y
    if (Math.abs(yj - yi) < 1e-15) continue
    const t = ((ring[j].x - ring[i].x) * (p.y - yi)) / (yj - yi) + ring[i].x
    if (yi > p.y !== yj > p.y && p.x < t) inside = !inside
  }
  return inside
}

export function classifyWallSolidTriangle(
  floor: Floor,
  catalog: FaceSeg[],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): { wallId: Id; slot: 'pos' | 'neg' | 'cut' } | { slot: 'body' } {
  const e1x = bx - ax
  const e1y = by - ay
  const e1z = bz - az
  const e2x = cx - ax
  const e2y = cy - ay
  const e2z = cz - az
  let nx = e1y * e2z - e1z * e2y
  let ny = e1z * e2x - e1x * e2z
  let nz = e1x * e2y - e1y * e2x
  const nlen = Math.hypot(nx, ny, nz) || 1
  nx /= nlen
  ny /= nlen
  nz /= nlen
  const mx = (ax + bx + cx) / 3
  const my = (ay + by + cy) / 3
  const mz = (az + bz + cz) / 3
  const plan = planFromWorld(mx, mz)

  if (Math.abs(ny) > VERTICAL_NY) {
    for (const wall of floor.walls) {
      for (const opening of openingsForWall(floor, wall.id)) {
        const ySill = floor.elevation + Math.max(0, opening.sillHeight)
        const yHead =
          floor.elevation +
          Math.min(floor.height, opening.sillHeight + opening.height)
        const nearSill = Math.abs(my - ySill) < 0.06 && ny > 0
        const nearHead = Math.abs(my - yHead) < 0.06 && ny < 0
        if (!nearSill && !nearHead) continue
        const rect = openingPlanRect(floor, opening)
        if (rect && pointInRing(plan, rect)) {
          return { wallId: wall.id, slot: 'cut' }
        }
      }
    }
    return { slot: 'body' }
  }

  const pnx = nx
  const pny = -nz
  const plen = Math.hypot(pnx, pny) || 1
  const onx = pnx / plen
  const ony = pny / plen

  let best: { wallId: Id; slot: 'pos' | 'neg' | 'cut'; score: number } | null =
    null
  for (const seg of catalog) {
    const proj = projectOnSegment(plan.x, plan.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y)
    if (proj.dist > MATCH_DIST) continue
    const slen = Math.hypot(seg.outward.x, seg.outward.y) || 1
    const align =
      (onx * seg.outward.x + ony * seg.outward.y) / slen
    if (align < MATCH_ALIGN) continue
    const score = align * 2 - proj.dist * 8
    if (!best || score > best.score) {
      best = { wallId: seg.wallId, slot: seg.slot, score }
    }
  }
  if (best) return { wallId: best.wallId, slot: best.slot }
  return { slot: 'body' }
}

type Bucket = {
  wallId?: Id
  slot: WallSolidSlot
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
}

function bucketKey(wallId: Id | undefined, slot: WallSolidSlot): string {
  return slot === 'body' ? 'body' : `${wallId}:${slot}`
}

function pushTri(
  bucket: Bucket,
  floor: Floor,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
) {
  const e1x = bx - ax
  const e1y = by - ay
  const e1z = bz - az
  const e2x = cx - ax
  const e2y = cy - ay
  const e2z = cz - az
  let nx = e1y * e2z - e1z * e2y
  let ny = e1z * e2x - e1x * e2z
  let nz = e1x * e2y - e1y * e2x
  const nlen = Math.hypot(nx, ny, nz) || 1
  nx /= nlen
  ny /= nlen
  nz /= nlen

  const uvAt = (x: number, y: number, z: number): [number, number] => {
    if (bucket.slot === 'body' || !bucket.wallId) {
      return [x, -z]
    }
    const wall = floor.walls.find((w) => w.id === bucket.wallId)
    if (!wall) return [x, y]
    if (bucket.slot === 'pos' || bucket.slot === 'neg') {
      const frame = wallFaceFrame(floor, wall, bucket.slot, 0)
      if (!frame) return [x, y]
      const u = (x - frame.ax) * frame.ux + (z - frame.az) * frame.uz
      const v = y - frame.elevation
      return [u, v]
    }
    // cut: meters along the face from the first vertex, v = height
    const u = Math.hypot(x - ax, z - az)
    return [u, y - floor.elevation]
  }

  const base = bucket.positions.length / 3
  bucket.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz)
  for (let i = 0; i < 3; i++) bucket.normals.push(nx, ny, nz)
  const uva = uvAt(ax, ay, az)
  const uvb = uvAt(bx, by, bz)
  const uvc = uvAt(cx, cy, cz)
  bucket.uvs.push(uva[0], uva[1], uvb[0], uvb[1], uvc[0], uvc[1])
  bucket.indices.push(base, base + 1, base + 2)
}

function finalizePartGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = geo.attributes.uv
  if (uv) geo.setAttribute('uv2', uv.clone())
  try {
    geo.computeTangents()
  } catch {
    // skip
  }
  geo.computeBoundingSphere()
  return geo
}

function geometryFromBucket(bucket: Bucket): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(bucket.positions, 3),
  )
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2))
  geo.setIndex(bucket.indices)
  return finalizePartGeometry(geo)
}

function walkTriangles(
  geo: THREE.BufferGeometry,
  fn: (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => void,
) {
  const pos = geo.attributes.position
  if (!pos) return
  const idx = geo.index
  const read = (i: number) => ({
    x: pos.getX(i),
    y: pos.getY(i),
    z: pos.getZ(i),
  })
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const a = read(idx.getX(i))
      const b = read(idx.getX(i + 1))
      const c = read(idx.getX(i + 2))
      fn(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    }
    return
  }
  for (let i = 0; i < pos.count; i += 3) {
    const a = read(i)
    const b = read(i + 1)
    const c = read(i + 2)
    fn(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }
}

/**
 * Split the floor wall solid into the structural body plus one mesh per
 * wall side / cut. Faces sit on the extrusion — no finish outset.
 */
export function buildWallSolidPaintParts(
  floor: Floor,
  layers: WallExtrudeLayer[],
): WallSolidPart[] {
  const split = splitLayerRings(floor, layers)
  const raw: THREE.BufferGeometry[] = []
  for (const layer of split) {
    const geo = extrudeLayer(layer)
    if (geo) raw.push(geo)
  }
  if (raw.length === 0) return []

  const catalog = buildWallSolidFaceCatalog(floor)
  const buckets = new Map<string, Bucket>()
  const ensure = (wallId: Id | undefined, slot: WallSolidSlot): Bucket => {
    const key = bucketKey(wallId, slot)
    let b = buckets.get(key)
    if (!b) {
      b = { wallId, slot, positions: [], normals: [], uvs: [], indices: [] }
      buckets.set(key, b)
    }
    return b
  }

  for (const geo of raw) {
    walkTriangles(geo, (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      const hit = classifyWallSolidTriangle(
        floor,
        catalog,
        ax,
        ay,
        az,
        bx,
        by,
        bz,
        cx,
        cy,
        cz,
      )
      const bucket =
        hit.slot === 'body'
          ? ensure(undefined, 'body')
          : ensure(hit.wallId, hit.slot)
      pushTri(bucket, floor, ax, ay, az, bx, by, bz, cx, cy, cz)
    })
    geo.dispose()
  }

  // Extrusion caps triangulate across whole wall spans, so opening heads/sills
  // rarely classify. Inject explicit horizontal reveal quads into cut buckets.
  for (const wall of floor.walls) {
    for (const opening of openingsForWall(floor, wall.id)) {
      const positions: number[] = []
      const normals: number[] = []
      const uvs: number[] = []
      const indices: number[] = []
      appendOpeningHorizontalCutQuads(
        floor,
        wall,
        opening,
        positions,
        normals,
        uvs,
        indices,
      )
      if (positions.length === 0) continue
      const bucket = ensure(wall.id, 'cut')
      appendIndexedMeshToBucket(bucket, positions, normals, uvs, indices)
    }
  }

  const parts: WallSolidPart[] = []
  for (const bucket of buckets.values()) {
    if (bucket.positions.length === 0) continue
    parts.push({
      key: bucketKey(bucket.wallId, bucket.slot),
      wallId: bucket.wallId,
      slot: bucket.slot,
      geometry: geometryFromBucket(bucket),
    })
  }
  return parts
}

function appendIndexedMeshToBucket(
  bucket: Bucket,
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
) {
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i]
    const ib = indices[i + 1]
    const ic = indices[i + 2]
    const base = bucket.positions.length / 3
    for (const ii of [ia, ib, ic]) {
      bucket.positions.push(
        positions[ii * 3],
        positions[ii * 3 + 1],
        positions[ii * 3 + 2],
      )
      bucket.normals.push(
        normals[ii * 3],
        normals[ii * 3 + 1],
        normals[ii * 3 + 2],
      )
      bucket.uvs.push(uvs[ii * 2], uvs[ii * 2 + 1])
    }
    bucket.indices.push(base, base + 1, base + 2)
  }
}

export function wallSolidPartMaterial(
  wall: Wall | undefined,
  slot: WallSolidSlot,
) {
  if (!wall || slot === 'body') return undefined
  if (slot === 'cut') return wall.materials?.cut ?? undefined
  return wall.materials?.[slot] ?? undefined
}
