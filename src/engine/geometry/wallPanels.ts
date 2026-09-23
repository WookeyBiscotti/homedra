import type { Floor, Wall, WallSide } from '../types'
import { wallAxes } from './wallSolid'
import { wallEndpoints, openingsForWall, openingSpan } from './openings'

export interface WallPanelDesc {
  wallId: string
  side: WallSide
  /** World-space center of the panel */
  position: [number, number, number]
  /** Yaw around Y */
  rotationY: number
  width: number
  height: number
  /** Thin panel depth */
  depth: number
}

/**
 * Thin finish panels on each wall face (same placement logic as opening pickables).
 * Prefer this over custom face BufferGeometry — matches the app's XZ convention.
 */
export function wallFinishPanels(
  floor: Floor,
  wall: Wall,
  sides: WallSide[] = ['pos', 'neg'],
): WallPanelDesc[] {
  const ends = wallEndpoints(floor, wall)
  const axes = wallAxes(floor, wall)
  if (!ends || !axes || ends.len < 1e-6) return []

  const ux = (ends.b.x - ends.a.x) / ends.len
  const uy = (ends.b.y - ends.a.y) / ends.len
  const rotY = Math.atan2(uy, ux)
  const depth = 0.02
  const out = wall.thickness / 2 + depth / 2 + 0.002

  const panels: WallPanelDesc[] = []
  for (const side of sides) {
    const sign = side === 'pos' ? 1 : -1
    const ox = axes.nx * out * sign
    const oy = axes.ny * out * sign
    const cx = ends.a.x + ux * (ends.len / 2) + ox
    const cz = -(ends.a.y + uy * (ends.len / 2) + oy)
    const cy = floor.elevation + floor.height / 2
    panels.push({
      wallId: wall.id,
      side,
      position: [cx, cy, cz],
      rotationY: rotY,
      width: ends.len,
      height: floor.height,
      depth,
    })
  }
  return panels
}

/**
 * Split a full-height panel into vertical strips avoiding openings (plan UV unused —
 * Three boxGeometry UVs are fine for tiling via texture.repeat).
 */
export function wallFinishPanelSegments(
  floor: Floor,
  wall: Wall,
  side: WallSide,
): WallPanelDesc[] {
  const full = wallFinishPanels(floor, wall, [side])
  if (full.length === 0) return []
  const base = full[0]
  const ends = wallEndpoints(floor, wall)
  if (!ends) return full

  const openings = openingsForWall(floor, wall.id)
  if (openings.length === 0) return full

  const bands = new Set<number>([0, floor.height])
  for (const o of openings) {
    bands.add(Math.max(0, o.sillHeight))
    bands.add(Math.min(floor.height, o.sillHeight + o.height))
  }
  const ys = [...bands].sort((a, b) => a - b)

  type Interval = { start: number; end: number }
  const freeAlong = (blocked: Interval[]): Interval[] => {
    const sorted = [...blocked]
      .map((b) => ({
        start: Math.max(0, b.start),
        end: Math.min(ends.len, b.end),
      }))
      .filter((b) => b.end > b.start + 1e-4)
      .sort((a, b) => a.start - b.start)
    const merged: Interval[] = []
    for (const b of sorted) {
      const last = merged[merged.length - 1]
      if (last && b.start <= last.end + 1e-6) {
        last.end = Math.max(last.end, b.end)
      } else {
        merged.push({ ...b })
      }
    }
    const free: Interval[] = []
    let c = 0
    for (const b of merged) {
      if (b.start > c + 1e-4) free.push({ start: c, end: b.start })
      c = Math.max(c, b.end)
    }
    if (ends.len > c + 1e-4) free.push({ start: c, end: ends.len })
    return free
  }

  const ux = (ends.b.x - ends.a.x) / ends.len
  const uy = (ends.b.y - ends.a.y) / ends.len
  const axes = wallAxes(floor, wall)!
  const sign = side === 'pos' ? 1 : -1
  const out = wall.thickness / 2 + base.depth / 2 + 0.002
  const ox = axes.nx * out * sign
  const oy = axes.ny * out * sign

  const segments: WallPanelDesc[] = []
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i]
    const y1 = ys[i + 1]
    const midY = (y0 + y1) / 2
    const blocked: Interval[] = []
    for (const o of openings) {
      const top = o.sillHeight + o.height
      if (midY <= o.sillHeight + 1e-6 || midY >= top - 1e-6) continue
      const span = openingSpan(o)
      blocked.push({ start: span.start, end: span.end })
    }
    for (const seg of freeAlong(blocked)) {
      const midU = (seg.start + seg.end) / 2
      const w = seg.end - seg.start
      const h = y1 - y0
      if (w < 1e-4 || h < 1e-4) continue
      const cx = ends.a.x + ux * midU + ox
      const cz = -(ends.a.y + uy * midU + oy)
      const cy = floor.elevation + (y0 + y1) / 2
      segments.push({
        wallId: wall.id,
        side,
        position: [cx, cy, cz],
        rotationY: base.rotationY,
        width: w,
        height: h,
        depth: base.depth,
      })
    }
  }
  return segments
}
