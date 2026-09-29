import * as THREE from 'three'
import type { Floor, Opening, SlabOpening, Wall } from '../types'
import { openingsForWall, openingSpan, wallEndpoints } from './openings'
import { slabOpeningCorners } from './slabOpenings'
import { tessellateByMaxEdge } from './tessellate'
import { joinedWallFootprint, wallAxes } from './wallSolid'

/** Slight inset into the void so finishes sit clear of the solid. */
const CUT_OUTSET = 0.02

type Pt = { x: number; y: number }

/** True when no other wall shares this vertex (square free end). */
export function wallVertexIsFree(floor: Floor, vertexId: string): boolean {
  let count = 0
  for (const w of floor.walls) {
    if (w.a === vertexId || w.b === vertexId) count++
    if (count > 1) return false
  }
  return count === 1
}

/**
 * Plan-space short edge at a free wall end (thickness face).
 * Returns null if the vertex is joined to another wall.
 */
export function wallFreeEndPlanEdge(
  floor: Floor,
  wall: Wall,
  end: 'a' | 'b',
): { p0: Pt; p1: Pt; outward: Pt; length: number } | null {
  const vertexId = end === 'a' ? wall.a : wall.b
  if (!wallVertexIsFree(floor, vertexId)) return null

  const axes = wallAxes(floor, wall)
  const fp = joinedWallFootprint(floor, wall)
  if (!axes || !fp || fp.length < 4) return null

  // Footprint ring: [e0, e1, e2, e3] — short edges e0→e3 at a, e1→e2 at b.
  const p0 = end === 'a' ? fp[0] : fp[1]
  const p1 = end === 'a' ? fp[3] : fp[2]
  const length = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  if (length < 1e-6) return null

  const outward =
    end === 'a'
      ? { x: -axes.ux, y: -axes.uy }
      : { x: axes.ux, y: axes.uy }

  return { p0, p1, outward, length }
}

/**
 * All cut-face quads for one wall: free ends + opening reveals.
 * UV in meters (u along face, v along height or depth).
 */
export function buildWallCutGeometry(
  floor: Floor,
  wall: Wall,
): THREE.BufferGeometry | null {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  pushFreeEnds(floor, wall, positions, normals, uvs, indices)
  for (const opening of openingsForWall(floor, wall.id)) {
    pushOpeningReveals(
      floor,
      wall,
      opening,
      positions,
      normals,
      uvs,
      indices,
    )
  }

  if (positions.length === 0) return null
  return finalizeCutGeometry(positions, normals, uvs, indices)
}

/** Full-size paint hit mesh for wall cuts (same faces, slightly larger outset). */
export function buildWallCutPaintHitGeometry(
  floor: Floor,
  wall: Wall,
): THREE.BufferGeometry | null {
  // Reuse visible builder — CUT_OUTSET already clears the solid.
  return buildWallCutGeometry(floor, wall)
}

/**
 * Vertical faces of a stair / slab well through the slab thickness.
 * Faces look into the well; UV in meters.
 */
export function buildSlabOpeningCutGeometry(
  floor: Floor,
  opening: SlabOpening,
): THREE.BufferGeometry | null {
  const thickness = Math.max(0.05, floor.slabThickness ?? 0.2)
  const yTop = floor.elevation + CUT_OUTSET
  const yBot = floor.elevation - thickness + 0.01 + CUT_OUTSET
  if (yTop - yBot < 1e-4) return null

  const c = slabOpeningCorners(opening)
  // Inset slightly into the well
  const minX = c.minX + CUT_OUTSET
  const maxX = c.maxX - CUT_OUTSET
  const minY = c.minY + CUT_OUTSET
  const maxY = c.maxY - CUT_OUTSET
  if (maxX - minX < 1e-4 || maxY - minY < 1e-4) return null

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  // Four sides; outward plan normal points into the well (inward of slab).
  const sides: Array<{ p0: Pt; p1: Pt; outward: Pt }> = [
    {
      p0: { x: minX, y: minY },
      p1: { x: maxX, y: minY },
      outward: { x: 0, y: 1 },
    },
    {
      p0: { x: maxX, y: minY },
      p1: { x: maxX, y: maxY },
      outward: { x: -1, y: 0 },
    },
    {
      p0: { x: maxX, y: maxY },
      p1: { x: minX, y: maxY },
      outward: { x: 0, y: -1 },
    },
    {
      p0: { x: minX, y: maxY },
      p1: { x: minX, y: minY },
      outward: { x: 1, y: 0 },
    },
  ]

  for (const side of sides) {
    pushVerticalPlanQuad({
      positions,
      normals,
      uvs,
      indices,
      p0: side.p0,
      p1: side.p1,
      y0: yBot,
      y1: yTop,
      outward: side.outward,
    })
  }

  if (positions.length === 0) return null
  return finalizeCutGeometry(positions, normals, uvs, indices)
}

function pushFreeEnds(
  floor: Floor,
  wall: Wall,
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
) {
  for (const end of ['a', 'b'] as const) {
    const edge = wallFreeEndPlanEdge(floor, wall, end)
    if (!edge) continue
    const ox = edge.outward.x * CUT_OUTSET
    const oy = edge.outward.y * CUT_OUTSET
    pushVerticalPlanQuad({
      positions,
      normals,
      uvs,
      indices,
      p0: { x: edge.p0.x + ox, y: edge.p0.y + oy },
      p1: { x: edge.p1.x + ox, y: edge.p1.y + oy },
      y0: floor.elevation,
      y1: floor.elevation + floor.height,
      outward: edge.outward,
    })
  }
}

function pushOpeningReveals(
  floor: Floor,
  wall: Wall,
  opening: Opening,
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
) {
  const ends = wallEndpoints(floor, wall)
  const axes = wallAxes(floor, wall)
  if (!ends || !axes || ends.len < 1e-9) return

  const span = openingSpan(opening)
  const halfT = wall.thickness / 2
  const ySill = floor.elevation + Math.max(0, opening.sillHeight)
  const yHead = floor.elevation + Math.min(
    floor.height,
    opening.sillHeight + opening.height,
  )
  if (yHead - ySill < 1e-4) return

  const along = (s: number, n: number): Pt => ({
    x: ends.a.x + axes.ux * s + axes.nx * n,
    y: ends.a.y + axes.uy * s + axes.ny * n,
  })

  // Jambs: into the opening
  const leftOut = { x: axes.ux, y: axes.uy }
  const rightOut = { x: -axes.ux, y: -axes.uy }
  const leftS = span.start + CUT_OUTSET
  const rightS = span.end - CUT_OUTSET

  pushVerticalPlanQuad({
    positions,
    normals,
    uvs,
    indices,
    p0: along(leftS, -halfT),
    p1: along(leftS, halfT),
    y0: ySill,
    y1: yHead,
    outward: leftOut,
  })
  pushVerticalPlanQuad({
    positions,
    normals,
    uvs,
    indices,
    p0: along(rightS, halfT),
    p1: along(rightS, -halfT),
    y0: ySill,
    y1: yHead,
    outward: rightOut,
  })

  appendOpeningHorizontalCutQuads(
    floor,
    wall,
    opening,
    positions,
    normals,
    uvs,
    indices,
  )
}

/**
 * Sill + head quads for an opening (into the void). Used by solid paint so
 * horizontal reveals stay pickable even when extrusion caps triangulate poorly.
 */
export function appendOpeningHorizontalCutQuads(
  floor: Floor,
  wall: Wall,
  opening: Opening,
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
): void {
  const ends = wallEndpoints(floor, wall)
  const axes = wallAxes(floor, wall)
  if (!ends || !axes || ends.len < 1e-9) return

  const span = openingSpan(opening)
  const halfT = wall.thickness / 2
  const ySill = floor.elevation + Math.max(0, opening.sillHeight)
  const yHead = floor.elevation + Math.min(
    floor.height,
    opening.sillHeight + opening.height,
  )
  if (yHead - ySill < 1e-4) return

  const along = (s: number, n: number): Pt => ({
    x: ends.a.x + axes.ux * s + axes.nx * n,
    y: ends.a.y + axes.uy * s + axes.ny * n,
  })

  if (opening.sillHeight > 1e-3) {
    pushHorizontalPlanQuad({
      positions,
      normals,
      uvs,
      indices,
      p00: along(span.start, -halfT),
      p10: along(span.end, -halfT),
      p11: along(span.end, halfT),
      p01: along(span.start, halfT),
      y: ySill + CUT_OUTSET,
      normalY: 1,
    })
  }

  if (opening.sillHeight + opening.height < floor.height - 1e-3) {
    pushHorizontalPlanQuad({
      positions,
      normals,
      uvs,
      indices,
      p00: along(span.start, -halfT),
      p10: along(span.end, -halfT),
      p11: along(span.end, halfT),
      p01: along(span.start, halfT),
      y: yHead - CUT_OUTSET,
      normalY: -1,
    })
  }
}

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

  // World: plan Y → −Z
  const ax = p0.x
  const az = -p0.y
  const bx = p1.x
  const bz = -p1.y
  const wnx = outward.x
  const wnz = -outward.y

  const base = positions.length / 3
  // Winding a→b→up; flip if geom normal faces away from outward
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
): THREE.BufferGeometry {
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
