import type {
  Building,
  FloorKind,
  LandscapeTerrain,
  SceneMode,
  SculptMode,
  Workbench,
} from '../engine/types'
import { buildingBounds, buildingFootprintHoles } from '../engine/extrude'
import {
  decodeHeights,
  encodeHeights,
  HEIGHT_LIMIT_M,
  type LandscapeFrame,
  planToUv,
  pointInRing,
  sampleBilinear,
  stampScalar,
  uvToPlan,
} from './maps'

export { HEIGHT_LIMIT_M } from './maps'
export type { LandscapeFrame }

export function defaultLandscapeFrame(building: Building): LandscapeFrame {
  const b = buildingBounds(building)
  if (!Number.isFinite(b.minX)) {
    return { size: 40, originX: 0, originY: 0 }
  }
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 8)
  return {
    size: Math.max(40, span * 3),
    originX: (b.minX + b.maxX) / 2,
    originY: (b.minZ + b.maxZ) / 2,
  }
}

export function terrainFrame(terrain?: LandscapeTerrain | null): LandscapeFrame {
  if (!terrain) return { size: 40, originX: 0, originY: 0 }
  return {
    size: terrain.size,
    originX: terrain.originX,
    originY: terrain.originY,
  }
}

export function ensureTerrain(
  building: Building,
  terrain?: LandscapeTerrain | null,
): LandscapeTerrain {
  if (terrain) return terrain
  const frame = defaultLandscapeFrame(building)
  return {
    resolution: 128,
    size: frame.size,
    originX: frame.originX,
    originY: frame.originY,
  }
}

export function heightGrid(terrain?: LandscapeTerrain | null): Float32Array {
  const res = terrain?.resolution ?? 128
  return decodeHeights(terrain?.heightPng, res * res)
}

export function heightAt(
  terrain: LandscapeTerrain | null | undefined,
  x: number,
  y: number,
): number {
  if (!terrain) return 0
  const { u, v } = planToUv(x, y, terrain)
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0
  return sampleBilinear(heightGrid(terrain), terrain.resolution, u, v)
}

export function worldHeight(
  groundElevation: number,
  terrain: LandscapeTerrain | null | undefined,
  x: number,
  y: number,
  extra = 0,
): number {
  return groundElevation + heightAt(terrain, x, y) + extra
}

export function buildLockMask(
  res: number,
  frame: LandscapeFrame,
  holes: Array<Array<{ x: number; z: number }>>,
): Uint8Array {
  const mask = new Uint8Array(res * res)
  if (holes.length === 0) return mask
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const p = uvToPlan(
        res <= 1 ? 0.5 : i / (res - 1),
        res <= 1 ? 0.5 : j / (res - 1),
        frame,
      )
      if (holes.some((ring) => pointInRing(p.x, p.y, ring))) {
        mask[j * res + i] = 1
      }
    }
  }
  return mask
}

export function lockFootprintHeights(
  heights: Float32Array,
  lock: Uint8Array,
): void {
  for (let i = 0; i < heights.length; i++) {
    if (lock[i]) heights[i] = 0
  }
}

export function footprintHolesForLock(
  building: Building,
): Array<Array<{ x: number; z: number }>> {
  return buildingFootprintHoles(building)
}

export function pointInFootprint(building: Building, x: number, y: number): boolean {
  return footprintHolesForLock(building).some((ring) => pointInRing(x, y, ring))
}

export function sculptStamp(
  heights: Float32Array,
  res: number,
  frame: LandscapeFrame,
  cx: number,
  cy: number,
  radius: number,
  hardness: number,
  strength: number,
  mode: SculptMode,
  locked: Uint8Array,
  flattenTarget: number,
): void {
  const amt = Math.max(0, strength)
  stampScalar(
    heights,
    res,
    frame,
    cx,
    cy,
    radius,
    hardness,
    (value, w, i, j) => {
      if (mode === 'raise') {
        return Math.min(HEIGHT_LIMIT_M, value + amt * w)
      }
      if (mode === 'lower') {
        return Math.max(-HEIGHT_LIMIT_M, value - amt * w)
      }
      if (mode === 'flatten') {
        return value + (flattenTarget - value) * amt * w
      }
      // smooth
      let sum = 0
      let n = 0
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di
          const jj = j + dj
          if (ii < 0 || jj < 0 || ii >= res || jj >= res) continue
          const idx = jj * res + ii
          if (locked[idx]) continue
          sum += heights[idx] ?? 0
          n++
        }
      }
      const avg = n > 0 ? sum / n : value
      return value + (avg - value) * Math.min(1, amt * 2) * w
    },
    locked,
  )
  lockFootprintHeights(heights, locked)
}

export function persistHeights(
  terrain: LandscapeTerrain,
  heights: Float32Array,
): LandscapeTerrain {
  return { ...terrain, heightPng: encodeHeights(heights) }
}

/** Outdoor dirt / grass / plants stay out of interior story rooms (basement). */
export function shouldShowOutdoorLandscape(opts: {
  groundVisible: boolean
  sceneMode: SceneMode
  workbench: Workbench
  activeFloorKind?: FloorKind
}): boolean {
  if (!opts.groundVisible) return false
  if (opts.sceneMode === 'visit' || opts.sceneMode === 'exterior') return true
  if (opts.workbench === 'landscape') return true
  return opts.activeFloorKind === 'ground'
}

export function applyHeightsToPositions(
  positions: Float32Array,
  heights: Float32Array,
  res: number,
  groundY: number,
): void {
  // PlaneGeometry (then rotateX -90°) has iy=0 at local Z = -size/2.
  // World plan Y is -worldZ, so that row is high plan Y — heightmap j=res-1.
  for (let iy = 0; iy < res; iy++) {
    const srcJ = res - 1 - iy
    for (let ix = 0; ix < res; ix++) {
      positions[(iy * res + ix) * 3 + 1] = groundY + (heights[srcJ * res + ix] ?? 0)
    }
  }
}
