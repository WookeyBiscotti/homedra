import polygonClipping from 'polygon-clipping'
import * as THREE from 'three'
import type { Floor, VolumeBox, VolumeCutout } from '../types'
import { tessellateByMaxEdge } from './tessellate'
import {
  cutoutsForBox,
  rangesOverlap,
  rectsOverlap,
  volumeBoxCorners,
  volumeBoxRect,
  volumeCutoutCorners,
  volumeCutoutRect,
} from './volumeBoxes'

export interface VolumeBoxLayer {
  /** Absolute Y of layer bottom */
  y: number
  height: number
  rings: Array<Array<{ x: number; z: number }>>
  holes: Array<Array<Array<{ x: number; z: number }>>>
}

export interface VolumeBoxSolid {
  boxId: string
  layers: VolumeBoxLayer[]
}

type Pair = [number, number]
type Ring = Pair[]
type Poly = Ring[]
type MultiPoly = Poly[]

function signedRingArea(ring: Array<{ x: number; y: number }>): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

function orientRing(
  ring: Array<{ x: number; y: number }>,
  ccw: boolean,
): Array<{ x: number; y: number }> {
  const area = signedRingArea(ring)
  const isCcw = area > 0
  if (isCcw === ccw) return ring
  return [...ring].reverse()
}

function rectToPoly(pts: Array<{ x: number; y: number }>): Poly | null {
  if (pts.length < 3) return null
  const ring: Ring = pts.map((p) => [p.x, p.y])
  const f = ring[0]
  const l = ring[ring.length - 1]
  if (f && l && (f[0] !== l[0] || f[1] !== l[1])) ring.push([f[0], f[1]])
  return [ring]
}

function cleanRing(ring: Array<{ x: number; y: number }>, eps = 1e-6) {
  const out: Array<{ x: number; y: number }> = []
  const strip =
    ring.length > 1 &&
    ring[0].x === ring[ring.length - 1].x &&
    ring[0].y === ring[ring.length - 1].y
      ? ring.slice(0, -1)
      : ring
  for (const p of strip) {
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

function multiToRegions(united: MultiPoly): Array<{
  outer: Array<{ x: number; y: number }>
  holes: Array<Array<{ x: number; y: number }>>
}> {
  const regions: Array<{
    outer: Array<{ x: number; y: number }>
    holes: Array<Array<{ x: number; y: number }>>
  }> = []
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

function uniqueSorted(values: number[], eps = 1e-5): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const v of sorted) {
    const last = out[out.length - 1]
    if (last == null || Math.abs(v - last) > eps) out.push(v)
  }
  return out
}

function cutoutVertRange(box: VolumeBox, cut: VolumeCutout): [number, number] | null {
  const box0 = box.elevation
  const box1 = box.elevation + box.height
  const c0 = Math.max(box0, cut.elevation)
  const c1 = Math.min(box1, cut.elevation + cut.height)
  if (c1 - c0 < 1e-4) return null
  return [c0, c1]
}

export function volumeBoxHeightBands(
  box: VolumeBox,
  cutouts: VolumeCutout[],
): number[] {
  const box0 = box.elevation
  const box1 = box.elevation + box.height
  const ys = [box0, box1]
  for (const cut of cutouts) {
    const range = cutoutVertRange(box, cut)
    if (!range) continue
    if (!rectsOverlap(volumeBoxCorners(box), volumeCutoutCorners(cut))) continue
    ys.push(range[0], range[1])
  }
  return uniqueSorted(ys.filter((y) => y >= box0 - 1e-6 && y <= box1 + 1e-6))
}

function subtractCutouts(
  box: VolumeBox,
  active: VolumeCutout[],
): Array<{
  outer: Array<{ x: number; y: number }>
  holes: Array<Array<{ x: number; y: number }>>
}> {
  const subjectPoly = rectToPoly(volumeBoxRect(box))
  if (!subjectPoly) return []
  let subject: MultiPoly = [subjectPoly]
  for (const cut of active) {
    const cutter = rectToPoly(volumeCutoutRect(cut))
    if (!cutter) continue
    try {
      subject = polygonClipping.difference(subject, cutter) as MultiPoly
    } catch {
      // keep previous if boolean fails
    }
  }
  return multiToRegions(subject)
}

export function extrudeVolumeBox(
  floor: Floor,
  box: VolumeBox,
): VolumeBoxSolid {
  const cutouts = cutoutsForBox(floor, box.id)
  const bands = volumeBoxHeightBands(box, cutouts)
  const layers: VolumeBoxLayer[] = []
  for (let i = 0; i < bands.length - 1; i++) {
    const y0 = bands[i]!
    const y1 = bands[i + 1]!
    const dy = y1 - y0
    if (dy < 1e-4) continue
    const active = cutouts.filter((cut) => {
      const range = cutoutVertRange(box, cut)
      if (!range) return false
      if (!rectsOverlap(volumeBoxCorners(box), volumeCutoutCorners(cut))) {
        return false
      }
      return rangesOverlap(y0, y1, range[0], range[1])
    })
    const regions = subtractCutouts(box, active)
    if (regions.length === 0) continue
    layers.push({
      y: floor.elevation + y0,
      height: dy,
      rings: regions.map((r) =>
        orientRing(r.outer, true).map((p) => ({ x: p.x, z: p.y })),
      ),
      holes: regions.map((r) =>
        r.holes.map((h) => orientRing(h, false).map((p) => ({ x: p.x, z: p.y }))),
      ),
    })
  }
  return { boxId: box.id, layers }
}

export function extrudeFloorBoxes(floor: Floor): VolumeBoxSolid[] {
  return (floor.boxes ?? []).map((box) => extrudeVolumeBox(floor, box))
}

/** World-space meter UVs from vertex position + normal. */
export function applyWorldMeterUvs(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position
  const nrm = geo.attributes.normal
  if (!pos) return
  if (!nrm) geo.computeVertexNormals()
  const normals = geo.attributes.normal
  const uvs = new Float32Array((pos.count ?? 0) * 2)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const nx = normals.getX(i)
    const ny = normals.getY(i)
    const nz = normals.getZ(i)
    const anx = Math.abs(nx)
    const any = Math.abs(ny)
    const anz = Math.abs(nz)
    let u = x
    let v = y
    if (any >= anx && any >= anz) {
      u = x
      v = -z
    } else if (anx >= anz) {
      u = -z
      v = y
    } else {
      u = x
      v = y
    }
    uvs[i * 2] = u
    uvs[i * 2 + 1] = v
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setAttribute('uv2', geo.attributes.uv.clone())
}

const CUT_OUTSET = 0.012

type Pt = { x: number; y: number }

function pushVerticalPlanQuad(args: {
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
  p0: Pt
  p1: Pt
  y0: number
  y1: number
  outward: Pt
}) {
  const { positions, normals, uvs, indices, p0, p1, y0, y1, outward } = args
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  if (len < 1e-4 || y1 - y0 < 1e-4) return

  const ax = p0.x
  const az = -p0.y
  const bx = p1.x
  const bz = -p1.y
  const wnx = outward.x
  const wnz = -outward.y

  const base = positions.length / 3
  const edgeDx = bx - ax
  const edgeDz = bz - az
  const geomNx = -edgeDz
  const geomNz = edgeDx
  const flip = geomNx * wnx + geomNz * wnz < 0

  if (flip) {
    positions.push(bx, y0, bz, ax, y0, az, ax, y1, az, bx, y1, bz)
    uvs.push(len, 0, 0, 0, 0, y1 - y0, len, y1 - y0)
  } else {
    positions.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az)
    uvs.push(0, 0, len, 0, len, y1 - y0, 0, y1 - y0)
  }
  for (let i = 0; i < 4; i++) normals.push(wnx, 0, wnz)
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

function pushHorizontalPlanQuad(args: {
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
  p00: Pt
  p10: Pt
  p11: Pt
  p01: Pt
  y: number
  normalY: 1 | -1
}) {
  const { positions, normals, uvs, indices, p00, p10, p11, p01, y, normalY } =
    args
  const uLen = Math.hypot(p10.x - p00.x, p10.y - p00.y)
  const vLen = Math.hypot(p01.x - p00.x, p01.y - p00.y)
  if (uLen < 1e-4 || vLen < 1e-4) return

  const toWorld = (p: Pt) => ({ x: p.x, y, z: -p.y })
  const a = toWorld(p00)
  const b = toWorld(p10)
  const c = toWorld(p11)
  const d = toWorld(p01)

  const base = positions.length / 3
  if (normalY > 0) {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z)
    uvs.push(0, 0, uLen, 0, uLen, vLen, 0, vLen)
  } else {
    positions.push(a.x, a.y, a.z, d.x, d.y, d.z, c.x, c.y, c.z, b.x, b.y, b.z)
    uvs.push(0, 0, 0, vLen, uLen, vLen, uLen, 0)
  }
  for (let i = 0; i < 4; i++) normals.push(0, normalY, 0)
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

function finalizeCutGeometry(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
): THREE.BufferGeometry | null {
  if (positions.length === 0) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  const tess = tessellateByMaxEdge(geo)
  if (tess !== geo) geo.dispose()
  const uv = tess.attributes.uv
  if (uv) tess.setAttribute('uv2', uv.clone())
  try {
    tess.computeTangents()
  } catch {
    // ignore
  }
  tess.computeBoundingSphere()
  return tess
}

/**
 * Reveal faces of a cutout inside its parent box (vertical jambs + pocket caps).
 */
export function buildVolumeCutoutGeometry(
  floor: Floor,
  cut: VolumeCutout,
): THREE.BufferGeometry | null {
  const box = (floor.boxes ?? []).find((b) => b.id === cut.boxId)
  if (!box) return null
  const range = cutoutVertRange(box, cut)
  if (!range) return null
  if (!rectsOverlap(volumeBoxCorners(box), volumeCutoutCorners(cut))) return null

  const y0 = floor.elevation + range[0] + CUT_OUTSET
  const y1 = floor.elevation + range[1] - CUT_OUTSET
  if (y1 - y0 < 1e-4) return null

  const c = volumeCutoutCorners(cut)
  const minX = c.minX + CUT_OUTSET
  const maxX = c.maxX - CUT_OUTSET
  const minY = c.minY + CUT_OUTSET
  const maxY = c.maxY - CUT_OUTSET
  if (maxX - minX < 1e-4 || maxY - minY < 1e-4) return null

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  const sides: Array<{ p0: Pt; p1: Pt; outward: Pt }> = [
    { p0: { x: minX, y: minY }, p1: { x: maxX, y: minY }, outward: { x: 0, y: 1 } },
    { p0: { x: maxX, y: minY }, p1: { x: maxX, y: maxY }, outward: { x: -1, y: 0 } },
    { p0: { x: maxX, y: maxY }, p1: { x: minX, y: maxY }, outward: { x: 0, y: -1 } },
    { p0: { x: minX, y: maxY }, p1: { x: minX, y: minY }, outward: { x: 1, y: 0 } },
  ]

  for (const side of sides) {
    pushVerticalPlanQuad({
      positions,
      normals,
      uvs,
      indices,
      p0: side.p0,
      p1: side.p1,
      y0,
      y1,
      outward: side.outward,
    })
  }

  const p00 = { x: minX, y: minY }
  const p10 = { x: maxX, y: minY }
  const p11 = { x: maxX, y: maxY }
  const p01 = { x: minX, y: maxY }

  if (range[0] > box.elevation + 1e-3) {
    pushHorizontalPlanQuad({
      positions,
      normals,
      uvs,
      indices,
      p00,
      p10,
      p11,
      p01,
      y: y0,
      normalY: 1,
    })
  }
  if (range[1] < box.elevation + box.height - 1e-3) {
    pushHorizontalPlanQuad({
      positions,
      normals,
      uvs,
      indices,
      p00,
      p10,
      p11,
      p01,
      y: y1,
      normalY: -1,
    })
  }

  return finalizeCutGeometry(positions, normals, uvs, indices)
}
