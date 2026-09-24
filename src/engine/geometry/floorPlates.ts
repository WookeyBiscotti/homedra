import type { Floor, FloorPlate, Id, MaterialRef } from '../types'
import { createId } from '../types'

export const FLOOR_PLATE_MIN = 0.5
export const FLOOR_PLATE_DEFAULT_WIDTH = 4
export const FLOOR_PLATE_DEFAULT_DEPTH = 4

export function floorPlateKey(id: Id): string {
  return `plate:${id}`
}

export function floorPlateIdFromKey(key: string): Id | null {
  return key.startsWith('plate:') ? key.slice('plate:'.length) : null
}

export function floorPlateCorners(p: FloorPlate): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  const hw = p.width / 2
  const hd = p.depth / 2
  return {
    minX: p.x - hw,
    maxX: p.x + hw,
    minY: p.y - hd,
    maxY: p.y + hd,
  }
}

export function floorPlateRect(
  p: FloorPlate,
): Array<{ x: number; y: number }> {
  const c = floorPlateCorners(p)
  return [
    { x: c.minX, y: c.minY },
    { x: c.maxX, y: c.minY },
    { x: c.maxX, y: c.maxY },
    { x: c.minX, y: c.maxY },
  ]
}

export function createFloorPlateFromDrag(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): FloorPlate {
  let width = Math.abs(x1 - x0)
  let depth = Math.abs(y1 - y0)
  if (width < FLOOR_PLATE_MIN) width = FLOOR_PLATE_DEFAULT_WIDTH
  if (depth < FLOOR_PLATE_MIN) depth = FLOOR_PLATE_DEFAULT_DEPTH
  width = Math.max(FLOOR_PLATE_MIN, width)
  depth = Math.max(FLOOR_PLATE_MIN, depth)
  return {
    id: createId('plt'),
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    width,
    depth,
  }
}

export function hitFloorPlate(
  floor: Floor,
  x: number,
  y: number,
): FloorPlate | undefined {
  for (const p of floor.plates ?? []) {
    const c = floorPlateCorners(p)
    if (x >= c.minX && x <= c.maxX && y >= c.minY && y <= c.maxY) return p
  }
  return undefined
}

export function updateFloorPlateFields(
  floor: Floor,
  id: Id,
  patch: Partial<Pick<FloorPlate, 'x' | 'y' | 'width' | 'depth' | 'material'>>,
): Floor {
  const plates = (floor.plates ?? []).map((p) => {
    if (p.id !== id) return p
    const next: FloorPlate = {
      ...p,
      ...patch,
      width: Math.max(FLOOR_PLATE_MIN, patch.width ?? p.width),
      depth: Math.max(FLOOR_PLATE_MIN, patch.depth ?? p.depth),
    }
    if ('material' in patch) {
      next.material = patch.material
    }
    return next
  })
  return { ...floor, plates }
}

export function setFloorPlateMaterial(
  floor: Floor,
  id: Id,
  material: MaterialRef | null,
): Floor {
  return updateFloorPlateFields(floor, id, { material })
}

/** Resolve finish for a paint region key (room or free plate). */
export function resolveFloorRegionMaterial(
  floor: Floor,
  key: string,
): MaterialRef | undefined {
  const plateId = floorPlateIdFromKey(key)
  if (plateId) {
    const plate = (floor.plates ?? []).find((p) => p.id === plateId)
    return plate?.material ?? undefined
  }
  return floor.roomFloorMaterials?.[key]
}
