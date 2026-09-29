/** Replace painted finishes that still match a previous brush with an updated one. */

import type {
  Building,
  Floor,
  MaterialRef,
  TileTexRegion,
  WallMaterials,
} from '../types'
import { normalizeTileTexRegion } from '../types'
import { materialCacheKey } from '../../materials/customTextures'

function regionEqual(
  a: TileTexRegion | undefined,
  b: TileTexRegion | undefined,
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  const x = normalizeTileTexRegion(a)
  const y = normalizeTileTexRegion(b)
  return x.u0 === y.u0 && x.v0 === y.v0 && x.u1 === y.u1 && x.v1 === y.v1
}

/** True when two finishes are the same painted covering (image + look + crop). */
export function materialRefsEqual(
  a: MaterialRef | null | undefined,
  b: MaterialRef | null | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null
  return (
    materialCacheKey(a) === materialCacheKey(b) &&
    a.tileSizeM === b.tileSizeM &&
    a.url === b.url &&
    a.name === b.name &&
    a.tint === b.tint &&
    a.roughness === b.roughness &&
    a.metalness === b.metalness &&
    a.normalScale === b.normalScale &&
    a.aoMapIntensity === b.aoMapIntensity &&
    a.envMapIntensity === b.envMapIntensity &&
    a.displacementScale === b.displacementScale &&
    regionEqual(a.texRegion, b.texRegion)
  )
}

function swap(
  value: MaterialRef | null | undefined,
  from: MaterialRef,
  to: MaterialRef,
): MaterialRef | null | undefined {
  if (value == null) return value
  return materialRefsEqual(value, from) ? { ...to } : value
}

function swapWallMaterials(
  materials: WallMaterials | undefined,
  from: MaterialRef,
  to: MaterialRef,
): WallMaterials | undefined {
  if (!materials) return materials
  const pos = swap(materials.pos, from, to)
  const neg = swap(materials.neg, from, to)
  const cut = swap(materials.cut, from, to)
  if (pos === materials.pos && neg === materials.neg && cut === materials.cut) {
    return materials
  }
  const next: WallMaterials = {}
  if (pos != null) next.pos = pos
  if (neg != null) next.neg = neg
  if (cut != null) next.cut = cut
  return Object.keys(next).length > 0 ? next : undefined
}

export function replacePaintMaterialOnFloor(
  floor: Floor,
  from: MaterialRef,
  to: MaterialRef,
): Floor {
  let changed = false

  const walls = floor.walls.map((w) => {
    const materials = swapWallMaterials(w.materials, from, to)
    if (materials === w.materials) return w
    changed = true
    return { ...w, materials }
  })

  let roomFloorMaterials = floor.roomFloorMaterials
  if (roomFloorMaterials) {
    let mapChanged = false
    const map: Record<string, MaterialRef> = {}
    for (const [key, mat] of Object.entries(roomFloorMaterials)) {
      const next = swap(mat, from, to)
      if (next && next !== mat) mapChanged = true
      if (next) map[key] = next
    }
    if (mapChanged) {
      roomFloorMaterials = Object.keys(map).length > 0 ? map : undefined
      changed = true
    }
  }

  const plates = floor.plates?.map((p) => {
    const material = swap(p.material, from, to)
    if (material === p.material) return p
    changed = true
    return { ...p, material: material ?? null }
  })

  const boxes = floor.boxes?.map((b) => {
    const material = swap(b.material, from, to)
    if (material === b.material) return b
    changed = true
    return { ...b, material: material ?? null }
  })

  const boxCutouts = floor.boxCutouts?.map((c) => {
    const material = swap(c.material, from, to)
    if (material === c.material) return c
    changed = true
    return { ...c, material: material ?? null }
  })

  const slabOpenings = floor.slabOpenings.map((o) => {
    const material = swap(o.material, from, to)
    if (material === o.material) return o
    changed = true
    return { ...o, material: material ?? null }
  })

  if (!changed) return floor
  return {
    ...floor,
    walls,
    roomFloorMaterials,
    plates,
    boxes,
    boxCutouts,
    slabOpenings,
  }
}

export function replacePaintMaterial(
  building: Building,
  from: MaterialRef,
  to: MaterialRef,
): Building {
  if (materialRefsEqual(from, to)) return building
  let changed = false
  const floors = building.floors.map((floor) => {
    const next = replacePaintMaterialOnFloor(floor, from, to)
    if (next !== floor) changed = true
    return next
  })
  return changed ? { ...building, floors } : building
}
