import type {
  Floor,
  Id,
  MaterialRef,
  VolumeBox,
  VolumeCutout,
} from '../types'
import { createId } from '../types'

export const VOLUME_BOX_MIN = 0.2
export const VOLUME_BOX_DEFAULT_WIDTH = 1.2
export const VOLUME_BOX_DEFAULT_DEPTH = 0.6
export const VOLUME_BOX_DEFAULT_HEIGHT = 0.4

export const VOLUME_CUTOUT_MIN = 0.1
export const VOLUME_CUTOUT_DEFAULT = 0.3

export type AxisRect = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export function volumeBoxCorners(b: Pick<VolumeBox, 'x' | 'y' | 'width' | 'depth'>): AxisRect {
  const hw = b.width / 2
  const hd = b.depth / 2
  return {
    minX: b.x - hw,
    maxX: b.x + hw,
    minY: b.y - hd,
    maxY: b.y + hd,
  }
}

export function volumeBoxRect(
  b: Pick<VolumeBox, 'x' | 'y' | 'width' | 'depth'>,
): Array<{ x: number; y: number }> {
  const c = volumeBoxCorners(b)
  return [
    { x: c.minX, y: c.minY },
    { x: c.maxX, y: c.minY },
    { x: c.maxX, y: c.maxY },
    { x: c.minX, y: c.maxY },
  ]
}

export function volumeCutoutCorners(
  c: Pick<VolumeCutout, 'x' | 'y' | 'width' | 'depth'>,
): AxisRect {
  return volumeBoxCorners(c)
}

export function volumeCutoutRect(
  c: Pick<VolumeCutout, 'x' | 'y' | 'width' | 'depth'>,
): Array<{ x: number; y: number }> {
  return volumeBoxRect(c)
}

function dragSize(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  min: number,
  fallbackW: number,
  fallbackD: number,
): { x: number; y: number; width: number; depth: number } {
  let width = Math.abs(x1 - x0)
  let depth = Math.abs(y1 - y0)
  if (width < min) width = fallbackW
  if (depth < min) depth = fallbackD
  width = Math.max(min, width)
  depth = Math.max(min, depth)
  return {
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    width,
    depth,
  }
}

export function createVolumeBoxFromDrag(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): VolumeBox {
  const size = dragSize(
    x0,
    y0,
    x1,
    y1,
    VOLUME_BOX_MIN,
    VOLUME_BOX_DEFAULT_WIDTH,
    VOLUME_BOX_DEFAULT_DEPTH,
  )
  return {
    id: createId('box'),
    ...size,
    elevation: 0,
    height: VOLUME_BOX_DEFAULT_HEIGHT,
  }
}

export function createVolumeCutoutFromDrag(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  box: VolumeBox,
): VolumeCutout {
  const size = dragSize(
    x0,
    y0,
    x1,
    y1,
    VOLUME_CUTOUT_MIN,
    VOLUME_CUTOUT_DEFAULT,
    VOLUME_CUTOUT_DEFAULT,
  )
  return {
    id: createId('cut'),
    boxId: box.id,
    ...size,
    elevation: box.elevation,
    height: box.height,
  }
}

export function pointInRect(rect: AxisRect, x: number, y: number): boolean {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY
}

export function rectsOverlap(a: AxisRect, b: AxisRect, eps = 1e-6): boolean {
  return (
    a.minX < b.maxX - eps &&
    a.maxX > b.minX + eps &&
    a.minY < b.maxY - eps &&
    a.maxY > b.minY + eps
  )
}

export function overlapArea(a: AxisRect, b: AxisRect): number {
  const w = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX))
  const h = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY))
  return w * h
}

export function hitVolumeCutout(
  floor: Floor,
  x: number,
  y: number,
): VolumeCutout | undefined {
  const cuts = floor.boxCutouts ?? []
  for (let i = cuts.length - 1; i >= 0; i--) {
    const cut = cuts[i]
    if (pointInRect(volumeCutoutCorners(cut), x, y)) return cut
  }
  return undefined
}

export function hitVolumeBox(
  floor: Floor,
  x: number,
  y: number,
): VolumeBox | undefined {
  const boxes = floor.boxes ?? []
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i]
    if (pointInRect(volumeBoxCorners(box), x, y)) return box
  }
  return undefined
}

/** Prefer the selected box when it overlaps, otherwise the largest overlap. */
export function findBoxForCutout(
  floor: Floor,
  rect: AxisRect,
  preferredBoxId?: Id | null,
): VolumeBox | undefined {
  const boxes = floor.boxes ?? []
  if (preferredBoxId) {
    const preferred = boxes.find((b) => b.id === preferredBoxId)
    if (preferred && overlapArea(volumeBoxCorners(preferred), rect) > 1e-6) {
      return preferred
    }
  }
  let best: VolumeBox | undefined
  let bestArea = 0
  for (const box of boxes) {
    const area = overlapArea(volumeBoxCorners(box), rect)
    if (area > bestArea) {
      best = box
      bestArea = area
    }
  }
  return best
}

export function cutoutsForBox(floor: Floor, boxId: Id): VolumeCutout[] {
  return (floor.boxCutouts ?? []).filter((c) => c.boxId === boxId)
}

function clampBoxSize(width: number, depth: number): { width: number; depth: number } {
  return {
    width: Math.max(VOLUME_BOX_MIN, width),
    depth: Math.max(VOLUME_BOX_MIN, depth),
  }
}

function clampCutSize(width: number, depth: number): { width: number; depth: number } {
  return {
    width: Math.max(VOLUME_CUTOUT_MIN, width),
    depth: Math.max(VOLUME_CUTOUT_MIN, depth),
  }
}

export function clampVolumeHeight(height: number, min = 0.05): number {
  return Math.max(min, Math.min(8, height))
}

export function clampVolumeElevation(elevation: number): number {
  return Math.max(0, Math.min(8, elevation))
}

export function updateVolumeBoxFields(
  floor: Floor,
  id: Id,
  patch: Partial<
    Pick<VolumeBox, 'x' | 'y' | 'width' | 'depth' | 'elevation' | 'height' | 'material'>
  >,
): Floor {
  const boxes = (floor.boxes ?? []).map((b) => {
    if (b.id !== id) return b
    const size = clampBoxSize(patch.width ?? b.width, patch.depth ?? b.depth)
    const next: VolumeBox = {
      ...b,
      ...patch,
      ...size,
      elevation: clampVolumeElevation(patch.elevation ?? b.elevation),
      height: clampVolumeHeight(patch.height ?? b.height),
    }
    if ('material' in patch) next.material = patch.material
    return next
  })
  return { ...floor, boxes }
}

export function updateVolumeCutoutFields(
  floor: Floor,
  id: Id,
  patch: Partial<
    Pick<
      VolumeCutout,
      'x' | 'y' | 'width' | 'depth' | 'elevation' | 'height' | 'material'
    >
  >,
): Floor {
  const boxCutouts = (floor.boxCutouts ?? []).map((c) => {
    if (c.id !== id) return c
    const size = clampCutSize(patch.width ?? c.width, patch.depth ?? c.depth)
    const next: VolumeCutout = {
      ...c,
      ...patch,
      ...size,
      elevation: clampVolumeElevation(patch.elevation ?? c.elevation),
      height: clampVolumeHeight(patch.height ?? c.height),
    }
    if ('material' in patch) next.material = patch.material
    return next
  })
  return { ...floor, boxCutouts }
}

/** Move a box in plan and keep its cutouts attached. */
export function moveVolumeBox(
  floor: Floor,
  id: Id,
  x: number,
  y: number,
): Floor {
  const box = (floor.boxes ?? []).find((b) => b.id === id)
  if (!box) return floor
  const dx = x - box.x
  const dy = y - box.y
  const boxes = (floor.boxes ?? []).map((b) => (b.id === id ? { ...b, x, y } : b))
  const boxCutouts = (floor.boxCutouts ?? []).map((c) =>
    c.boxId === id ? { ...c, x: c.x + dx, y: c.y + dy } : c,
  )
  return { ...floor, boxes, boxCutouts }
}

export function setVolumeBoxMaterial(
  floor: Floor,
  id: Id,
  material: MaterialRef | null,
): Floor {
  return updateVolumeBoxFields(floor, id, { material })
}

export function setVolumeCutoutMaterial(
  floor: Floor,
  id: Id,
  material: MaterialRef | null,
): Floor {
  return updateVolumeCutoutFields(floor, id, { material })
}

export function removeVolumeBox(floor: Floor, id: Id): Floor {
  return {
    ...floor,
    boxes: (floor.boxes ?? []).filter((b) => b.id !== id),
    boxCutouts: (floor.boxCutouts ?? []).filter((c) => c.boxId !== id),
  }
}

export function removeVolumeCutout(floor: Floor, id: Id): Floor {
  return {
    ...floor,
    boxCutouts: (floor.boxCutouts ?? []).filter((c) => c.id !== id),
  }
}

export function rangesOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  eps = 1e-6,
): boolean {
  return a0 < b1 - eps && a1 > b0 + eps
}
