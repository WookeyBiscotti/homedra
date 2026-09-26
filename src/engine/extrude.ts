import polygonClipping from 'polygon-clipping'
import type { Building, Floor } from './types'
import {
  openingPlanRect,
  openingHeightBands,
  openingsActiveInBand,
} from './geometry/openings'
import { slabOpeningRect } from './geometry/slabOpenings'
import { floorPlateRect } from './geometry/floorPlates'
import {
  unionWallPlanRegions,
  type WallPlanRegion,
} from './geometry/wallSolid'

export interface WallExtrudeLayer {
  /** Absolute Y of layer bottom */
  y: number
  height: number
  rings: Array<Array<{ x: number; z: number }>>
  holes: Array<Array<Array<{ x: number; z: number }>>>
}

export interface FloorWallSolid {
  floorId: string
  elevation: number
  height: number
  layers: WallExtrudeLayer[]
}

export interface FloorSlab {
  floorId: string
  /** One or more slab footprints (outer + stair holes), XZ plan */
  regions: Array<{
    outer: Array<{ x: number; z: number }>
    holes: Array<Array<{ x: number; z: number }>>
  }>
  /** Top of slab = walking surface (matches floor.elevation) */
  y: number
  thickness: number
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

/** Ensure CCW for outer, CW for holes (Three.js Shape convention). */
function orientRing(
  ring: Array<{ x: number; y: number }>,
  ccw: boolean,
): Array<{ x: number; y: number }> {
  const area = signedRingArea(ring)
  const isCcw = area > 0
  if (isCcw === ccw) return ring
  return [...ring].reverse()
}

function regionToPoly(region: WallPlanRegion): Poly {
  const outer: Ring = region.outer.map((p) => [p.x, p.y])
  const f = outer[0]
  const l = outer[outer.length - 1]
  if (f && l && (f[0] !== l[0] || f[1] !== l[1])) outer.push([f[0], f[1]])
  const poly: Poly = [outer]
  for (const hole of region.holes) {
    const h: Ring = hole.map((p) => [p.x, p.y])
    const hf = h[0]
    const hl = h[h.length - 1]
    if (hf && hl && (hf[0] !== hl[0] || hf[1] !== hl[1])) h.push([hf[0], hf[1]])
    if (h.length >= 4) poly.push(h)
  }
  return poly
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

function multiToRegions(united: MultiPoly): WallPlanRegion[] {
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

/** Subtract opening plan rects active in [y0,y1] from wall union regions. */
export function wallRegionsMinusOpenings(
  floor: Floor,
  y0: number,
  y1: number,
): WallPlanRegion[] {
  const base = unionWallPlanRegions(floor)
  if (base.length === 0) return []

  const active = openingsActiveInBand(floor, y0, y1)
  if (active.length === 0) return base

  const cutters: Poly[] = []
  for (const o of active) {
    const rect = openingPlanRect(floor, o)
    const poly = rect ? rectToPoly(rect) : null
    if (poly) cutters.push(poly)
  }
  if (cutters.length === 0) return base

  let subject: MultiPoly = base.map(regionToPoly)
  for (const cutter of cutters) {
    try {
      subject = polygonClipping.difference(subject, cutter) as MultiPoly
    } catch {
      // keep previous if boolean fails on degenerate geometry
    }
  }
  return multiToRegions(subject)
}

function regionsToLayer(
  regions: WallPlanRegion[],
  y: number,
  height: number,
): WallExtrudeLayer {
  return {
    y,
    height,
    rings: regions.map((r) => r.outer.map((p) => ({ x: p.x, z: p.y }))),
    holes: regions.map((r) => r.holes.map((h) => h.map((p) => ({ x: p.x, z: p.y })))),
  }
}

/**
 * Layered extrusion: full wall union, then difference openings only in bands
 * where they are vertically active (supports windows with sill).
 */
export function extrudeFloorWalls(floor: Floor): FloorWallSolid {
  const bands = openingHeightBands(floor)
  const layers: WallExtrudeLayer[] = []
  for (let i = 0; i < bands.length - 1; i++) {
    const y0 = bands[i]
    const y1 = bands[i + 1]
    const dy = y1 - y0
    if (dy < 1e-6) continue
    const regions = wallRegionsMinusOpenings(floor, y0, y1)
    if (regions.length === 0) continue
    layers.push(regionsToLayer(regions, floor.elevation + y0, dy))
  }

  // No openings / empty bands fallback: single full-height layer
  if (layers.length === 0) {
    const regions = unionWallPlanRegions(floor)
    if (regions.length > 0) {
      layers.push(regionsToLayer(regions, floor.elevation, floor.height))
    }
  }

  return {
    floorId: floor.id,
    elevation: floor.elevation,
    height: floor.height,
    layers,
  }
}

/**
 * Floor slab footprints from the exterior outline of the wall union
 * (covers rooms and under walls) plus free floor plates (no walls).
 * Stair wells are explicit Shape holes
 * (more reliable than boolean difference for ExtrudeGeometry).
 */
export function extrudeFloorSlabs(floor: Floor): FloorSlab {
  const thickness = Math.max(0.05, floor.slabThickness ?? 0.2)
  const wallRegions = unionWallPlanRegions(floor)
  const plates = floor.plates ?? []

  const stairs = (floor.slabOpenings ?? []).map((o) => ({
    x: o.x,
    y: o.y,
    ring: slabOpeningRect(o),
  }))

  const regions: FloorSlab['regions'] = []

  for (const r of wallRegions) {
    const outer = orientRing(r.outer, true)
    const holes: Array<Array<{ x: number; z: number }>> = []
    for (const stair of stairs) {
      if (!pointInRing(stair.x, stair.y, outer)) continue
      holes.push(
        orientRing(stair.ring, false).map((p) => ({ x: p.x, z: p.y })),
      )
    }
    regions.push({
      outer: outer.map((p) => ({ x: p.x, z: p.y })),
      holes,
    })
  }

  for (const plate of plates) {
    const ring = floorPlateRect(plate)
    const outer = orientRing(ring, true)
    const holes: Array<Array<{ x: number; z: number }>> = []
    for (const stair of stairs) {
      if (!pointInRing(stair.x, stair.y, outer)) continue
      holes.push(
        orientRing(stair.ring, false).map((p) => ({ x: p.x, z: p.y })),
      )
    }
    regions.push({
      outer: outer.map((p) => ({ x: p.x, z: p.y })),
      holes,
    })
  }

  return {
    floorId: floor.id,
    regions,
    y: floor.elevation,
    thickness,
  }
}

function pointInRing(
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

/**
 * Vertical range of a story: bottom of slab … top of walls.
 */
export function floorVerticalRange(floor: Floor): { bottom: number; top: number } {
  const slab = Math.max(0.05, floor.slabThickness ?? 0.2)
  return {
    bottom: floor.elevation - slab,
    top: floor.elevation + floor.height,
  }
}

/** Whether the ground plane Y cuts through this story's slab or walls. */
export function groundIntersectsFloor(
  groundY: number,
  floor: Floor,
  eps = 1e-4,
): boolean {
  if (floor.kind === 'ground') return false
  const { bottom, top } = floorVerticalRange(floor)
  return groundY >= bottom - eps && groundY <= top + eps
}

function floorFilledFootprintPolys(floor: Floor): Poly[] {
  const wallRegions = unionWallPlanRegions(floor)
  const polys: Poly[] = []
  for (const r of wallRegions) {
    if (r.outer.length < 3) continue
    const outer = orientRing(r.outer, true)
    const ring: Ring = outer.map((p) => [p.x, p.y])
    const f = ring[0]
    const l = ring[ring.length - 1]
    if (f && l && (f[0] !== l[0] || f[1] !== l[1])) ring.push([f[0], f[1]])
    polys.push([ring])
  }
  for (const plate of floor.plates ?? []) {
    const outer = orientRing(floorPlateRect(plate), true)
    if (outer.length < 3) continue
    const ring: Ring = outer.map((p) => [p.x, p.y])
    const f = ring[0]
    const l = ring[ring.length - 1]
    if (f && l && (f[0] !== l[0] || f[1] !== l[1])) ring.push([f[0], f[1]])
    polys.push([ring])
  }
  return polys
}

/**
 * Ground-plane cutouts: filled outline of each story the ground elevation
 * intersects (slab or wall height). Different floors keep their own plan shape.
 */
export function buildingFootprintHoles(
  building: Building,
): Array<Array<{ x: number; z: number }>> {
  const groundY =
    building.floors.find((f) => f.kind === 'ground')?.elevation ?? 0

  const polys: Poly[] = []
  for (const floor of building.floors) {
    if (!groundIntersectsFloor(groundY, floor)) continue
    polys.push(...floorFilledFootprintPolys(floor))
  }
  if (polys.length === 0) return []

  let united: MultiPoly
  try {
    united = polygonClipping.union(polys[0], ...polys.slice(1)) as MultiPoly
  } catch {
    united = polys as MultiPoly
  }

  return multiToRegions(united)
    .map((r) => orientRing(r.outer, false)) // CW holes for THREE.Shape
    .filter((ring) => ring.length >= 3)
    .map((ring) => ring.map((p) => ({ x: p.x, z: p.y })))
}

/**
 * Identity of fields that affect wall/slab meshes and building bounds.
 * Object, plant, MEP and landscape edits must not remesh the building.
 */
export function floorMeshDeps(floor: Floor): readonly unknown[] {
  return [
    floor.id,
    floor.kind,
    floor.elevation,
    floor.height,
    floor.slabThickness,
    floor.vertices,
    floor.walls,
    floor.openings,
    floor.slabOpenings,
    floor.plates,
  ]
}

export function buildingMeshDeps(building: Building): readonly unknown[] {
  return building.floors.flatMap(floorMeshDeps)
}

/** True when wall/opening pick volumes can keep the previous React tree. */
export function sameBuildingPicks(a: Building, b: Building): boolean {
  if (a === b) return true
  if (a.floors.length !== b.floors.length) return false
  for (let i = 0; i < a.floors.length; i++) {
    const fa = a.floors[i]!
    const fb = b.floors[i]!
    if (
      fa.id !== fb.id ||
      fa.kind !== fb.kind ||
      fa.elevation !== fb.elevation ||
      fa.height !== fb.height ||
      fa.visible !== fb.visible ||
      fa.vertices !== fb.vertices ||
      fa.walls !== fb.walls ||
      fa.openings !== fb.openings ||
      fa.slabOpenings !== fb.slabOpenings
    ) {
      return false
    }
  }
  return true
}

export function extrudeBuilding(building: Building): {
  floors: FloorWallSolid[]
  slabs: FloorSlab[]
} {
  const stories = building.floors.filter((f) => f.kind !== 'ground')
  const floors = stories.map(extrudeFloorWalls)
  const slabs = stories.map(extrudeFloorSlabs)
  return { floors, slabs }
}

export function buildingBounds(building: Building): {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  minY: number
  maxY: number
} {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  const ground = building.floors.find((f) => f.kind === 'ground')
  if (ground) {
    minY = Math.min(minY, ground.elevation)
    maxY = Math.max(maxY, ground.elevation)
  }

  for (const floor of building.floors) {
    if (floor.kind === 'ground') continue
    const slab = floor.slabThickness ?? 0.2
    minY = Math.min(minY, floor.elevation - slab)
    maxY = Math.max(maxY, floor.elevation + floor.height)
    for (const v of floor.vertices) {
      minX = Math.min(minX, v.x)
      maxX = Math.max(maxX, v.x)
      minZ = Math.min(minZ, v.y)
      maxZ = Math.max(maxZ, v.y)
    }
    for (const p of floor.plates ?? []) {
      const hw = p.width / 2
      const hd = p.depth / 2
      minX = Math.min(minX, p.x - hw)
      maxX = Math.max(maxX, p.x + hw)
      minZ = Math.min(minZ, p.y - hd)
      maxZ = Math.max(maxZ, p.y + hd)
    }
  }

  if (!Number.isFinite(minX)) {
    const gy = ground?.elevation ?? 0
    return { minX: -5, maxX: 5, minZ: -5, maxZ: 5, minY: gy, maxY: gy + 3 }
  }
  return { minX, maxX, minZ, maxZ, minY, maxY }
}
