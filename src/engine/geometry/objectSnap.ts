import {
  estimatePlanHalf,
  type Floor,
  type PlacedObject,
  type WallSide,
} from '../types'
import { wallAxes, wallFaceEndpoints } from './wallSolid'
import { WALL_FINISH_OUTSET } from './wallFaces'

/** Magnetic range for wall faces / object edges (meters). */
const DEFAULT_THRESHOLD = 0.55

export type PlanHalfSize = { x: number; y: number }

export type ObjectSnapOpts = {
  /** Skip this placed object (the one being moved). */
  excludeObjectId?: string
  threshold?: number
  /**
   * Half-extents of the moving object's plan AABB (meters).
   * Used so the object flushes against wall faces / other AABBs.
   */
  halfSize?: PlanHalfSize
  /** Override half-extents for other objects (by id). */
  otherHalfSizes?: Record<string, PlanHalfSize>
}

export type ObjectSnapResult = {
  x: number
  y: number
  snappedX: boolean
  snappedY: boolean
}

/**
 * Plan-space AABB half-extents. Prefers measured planHalfX/Y (same as 3D
 * world AABB); falls back to size × scale × yaw estimate.
 */
export function planHalfSizeOf(o: PlacedObject): PlanHalfSize {
  if (
    Number.isFinite(o.planHalfX) &&
    Number.isFinite(o.planHalfY) &&
    o.planHalfX > 0 &&
    o.planHalfY > 0
  ) {
    return { x: o.planHalfX, y: o.planHalfY }
  }
  return estimatePlanHalf(o)
}

type AxisCand = { value: number; dist: number }

function consider(cands: AxisCand[], value: number, dist: number, thr: number) {
  if (dist > thr || !Number.isFinite(dist) || !Number.isFinite(value)) return
  cands.push({ value, dist })
}

function bestAxis(cands: AxisCand[]): AxisCand | null {
  if (cands.length === 0) return null
  let best = cands[0]!
  for (let i = 1; i < cands.length; i++) {
    const c = cands[i]!
    if (c.dist < best.dist) best = c
  }
  return best
}

function considerFinishFace(
  xs: AxisCand[],
  ys: AxisCand[],
  coupled: { current: { x: number; y: number; dist: number } | null },
  x: number,
  y: number,
  fa: { x: number; y: number },
  fb: { x: number; y: number },
  /** Outward unit normal (points away from wall core). */
  nx: number,
  ny: number,
  support: number,
  thr: number,
) {
  const dx = fb.x - fa.x
  const dy = fb.y - fa.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return
  const ux = dx / len
  const uy = dy / len
  const endPad = support
  let t = ((x - fa.x) * ux + (y - fa.y) * uy) / len
  const tMin = -endPad / len
  const tMax = 1 + endPad / len
  if (t >= tMin && t <= tMax) {
    t = Math.max(0, Math.min(1, t))
    const cx = fa.x + ux * (t * len)
    const cy = fa.y + uy * (t * len)
    // Positive signed = outside the wall (along outward normal).
    const signed = (x - cx) * nx + (y - cy) * ny
    const gap = Math.abs(signed - support)
    const tx = cx + nx * support
    const ty = cy + ny * support
    if (Math.abs(nx) > 0.92) {
      consider(xs, tx, gap, thr)
    } else if (Math.abs(ny) > 0.92) {
      consider(ys, ty, gap, thr)
    } else if (gap <= thr) {
      if (!coupled.current || gap < coupled.current.dist) {
        coupled.current = { x: tx, y: ty, dist: gap }
      }
    }
  }

  // Finish-face corners (not structural centerline vertices).
  for (const v of [fa, fb]) {
    const tx = v.x + nx * support
    const ty = v.y + ny * support
    consider(xs, tx, Math.abs(x - tx), thr)
    consider(ys, ty, Math.abs(y - ty), thr)
  }
}

/**
 * Snap a plan-space point so objects clip flush to the wall solid face
 * and other AABBs (not the wall core / centerline).
 */
export function snapObjectXY(
  floor: Floor,
  x: number,
  y: number,
  opts: ObjectSnapOpts = {},
): ObjectSnapResult {
  const baseThr = opts.threshold ?? DEFAULT_THRESHOLD
  const self = opts.halfSize ?? { x: 0.25, y: 0.25 }
  const xs: AxisCand[] = []
  const ys: AxisCand[] = []
  const coupled = {
    current: null as { x: number; y: number; dist: number } | null,
  }

  for (const wall of floor.walls) {
    const axes = wallAxes(floor, wall)
    if (!axes) continue
    const halfT = Math.max(0.01, wall.thickness / 2)
    const sides: WallSide[] = ['pos', 'neg']

    for (const side of sides) {
      const nx = side === 'pos' ? axes.nx : -axes.nx
      const ny = side === 'pos' ? axes.ny : -axes.ny
      const support = self.x * Math.abs(nx) + self.y * Math.abs(ny)
      const thr = Math.max(baseThr, support + halfT + WALL_FINISH_OUTSET + 0.15)

      const ends = wallFaceEndpoints(floor, wall, side)
      let fa: { x: number; y: number }
      let fb: { x: number; y: number }
      if (ends) {
        // Solid outer face (same as wallFaceFrame).
        fa = {
          x: ends.a.x + nx * WALL_FINISH_OUTSET,
          y: ends.a.y + ny * WALL_FINISH_OUTSET,
        }
        fb = {
          x: ends.b.x + nx * WALL_FINISH_OUTSET,
          y: ends.b.y + ny * WALL_FINISH_OUTSET,
        }
      } else {
        const off = halfT + WALL_FINISH_OUTSET
        fa = { x: axes.a.x + nx * off, y: axes.a.y + ny * off }
        fb = { x: axes.b.x + nx * off, y: axes.b.y + ny * off }
      }

      considerFinishFace(xs, ys, coupled, x, y, fa, fb, nx, ny, support, thr)
    }
  }

  for (const o of floor.objects ?? []) {
    if (o.id === opts.excludeObjectId) continue
    const other = opts.otherHalfSizes?.[o.id] ?? planHalfSizeOf(o)
    const gapX = self.x + other.x
    const gapY = self.y + other.y
    const thrX = Math.max(baseThr, gapX + 0.2)
    const thrY = Math.max(baseThr, gapY + 0.2)

    consider(xs, o.x + gapX, Math.abs(x - (o.x + gapX)), thrX)
    consider(xs, o.x - gapX, Math.abs(x - (o.x - gapX)), thrX)
    consider(ys, o.y + gapY, Math.abs(y - (o.y + gapY)), thrY)
    consider(ys, o.y - gapY, Math.abs(y - (o.y - gapY)), thrY)
  }

  const bestCoupled = coupled.current
  if (bestCoupled && bestCoupled.dist <= baseThr) {
    const bx = bestAxis(xs)
    const by = bestAxis(ys)
    const indepScore =
      (bx ? bx.dist : baseThr + 1) + (by ? by.dist : baseThr + 1)
    if (bestCoupled.dist * 2 <= indepScore) {
      return {
        x: bestCoupled.x,
        y: bestCoupled.y,
        snappedX: true,
        snappedY: true,
      }
    }
  }

  const bx = bestAxis(xs)
  const by = bestAxis(ys)
  return {
    x: bx ? bx.value : x,
    y: by ? by.value : y,
    snappedX: !!bx,
    snappedY: !!by,
  }
}
