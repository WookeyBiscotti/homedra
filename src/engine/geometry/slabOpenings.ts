import type { Floor, Id, SlabOpening } from '../types'
import { createId } from '../types'

export const SLAB_OPENING_MIN = 0.8
export const STAIR_DEFAULT_WIDTH = 1.0
export const STAIR_DEFAULT_DEPTH = 2.5

export function slabOpeningCorners(o: SlabOpening): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  const hw = o.width / 2
  const hd = o.depth / 2
  return {
    minX: o.x - hw,
    maxX: o.x + hw,
    minY: o.y - hd,
    maxY: o.y + hd,
  }
}

export function slabOpeningRect(
  o: SlabOpening,
): Array<{ x: number; y: number }> {
  const c = slabOpeningCorners(o)
  return [
    { x: c.minX, y: c.minY },
    { x: c.maxX, y: c.minY },
    { x: c.maxX, y: c.maxY },
    { x: c.minX, y: c.maxY },
  ]
}

/** Plan rings for all stair wells on a floor (for Shape holes). */
export function floorSlabOpeningHoles(
  floor: Floor,
): Array<Array<{ x: number; y: number }>> {
  return (floor.slabOpenings ?? []).map(slabOpeningRect)
}

export function createSlabOpeningFromDrag(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  kind: SlabOpening['kind'] = 'stair',
): SlabOpening {
  let width = Math.abs(x1 - x0)
  let depth = Math.abs(y1 - y0)
  if (width < SLAB_OPENING_MIN) width = STAIR_DEFAULT_WIDTH
  if (depth < SLAB_OPENING_MIN) depth = STAIR_DEFAULT_DEPTH
  width = Math.max(SLAB_OPENING_MIN, width)
  depth = Math.max(SLAB_OPENING_MIN, depth)
  return {
    id: createId('sop'),
    kind,
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    width,
    depth,
  }
}

export function hitSlabOpening(
  floor: Floor,
  x: number,
  y: number,
): SlabOpening | undefined {
  for (const o of floor.slabOpenings ?? []) {
    const c = slabOpeningCorners(o)
    if (x >= c.minX && x <= c.maxX && y >= c.minY && y <= c.maxY) return o
  }
  return undefined
}

export function updateSlabOpeningFields(
  floor: Floor,
  id: Id,
  patch: Partial<Pick<SlabOpening, 'x' | 'y' | 'width' | 'depth'>>,
): Floor {
  const slabOpenings = (floor.slabOpenings ?? []).map((o) => {
    if (o.id !== id) return o
    return {
      ...o,
      ...patch,
      width: Math.max(SLAB_OPENING_MIN, patch.width ?? o.width),
      depth: Math.max(SLAB_OPENING_MIN, patch.depth ?? o.depth),
    }
  })
  return { ...floor, slabOpenings }
}
