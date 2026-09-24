import numeric from 'numeric'
import {
  createByConstraintName,
  EqualsTo,
  Weighted,
} from 'jsketcher/constr/solverConstraints'
import { prepare } from 'jsketcher/constr/solver'
import {
  faceToCenterDistance,
  vertexWallThickness,
  wallsShareAxis,
} from '../geometry/wallSolid'
import type { Constraint, Floor, Id, Vertex } from '../types'

// numeric.js uses eval() that expects a global `numeric` identifier
;(globalThis as unknown as { numeric: typeof numeric }).numeric = numeric

export interface SolveOptions {
  /** Soft attraction toward target (does not hard-lock the point) */
  drag?: { vertexId: Id; x: number; y: number; weight?: number }
  /** Soft-lock several vertices at given positions (multi-drag) */
  softLocks?: Array<{ vertexId: Id; x: number; y: number; weight?: number }>
  rough?: boolean
}

export interface SolveResult {
  ok: boolean
  floor: Floor
  residual: number
  iterations: number
  conflict: boolean
}

/** Minimal parameter object compatible with jsketcher solver */
class SolverParam {
  value: number
  constant = false
  j = -1
  initial: number

  constructor(value: number) {
    this.value = value
    this.initial = value
  }

  set(value: number) {
    if (this.constant) return
    this.value = value
  }

  get() {
    return this.value
  }

  rollback() {
    this.value = this.initial
  }
}

type ParamPair = { x: SolverParam; y: SolverParam }

/**
 * Solve floor-plan constraints using JS.Sketcher's dogleg / LM numerical solver,
 * then project fixed-length constraints so lengths cannot stretch.
 */
export function solveFloor(floor: Floor, options: SolveOptions = {}): SolveResult {
  if (floor.vertices.length === 0) {
    return { ok: true, floor, residual: 0, iterations: 0, conflict: false }
  }

  const params = new Map<Id, ParamPair>()
  for (const v of floor.vertices) {
    params.set(v.id, {
      x: new SolverParam(v.x),
      y: new SolverParam(v.y),
    })
  }

  const lockedIds = new Set<Id>()
  for (const c of floor.constraints) {
    if (c.type === 'fixedPosition') {
      const p = params.get(c.vertexId)
      if (!p) continue
      p.x.constant = true
      p.y.constant = true
      lockedIds.add(c.vertexId)
    }
  }

  const constrs: unknown[] = []

  const addSoftPoint = (vertexId: Id, x: number, y: number, weight: number) => {
    const p = params.get(vertexId)
    if (!p || lockedIds.has(vertexId)) return
    // Seed near target so solver starts from a good guess
    p.x.value = x
    p.y.value = y
    p.x.initial = x
    p.y.initial = y
    constrs.push(new Weighted(new EqualsTo([p.x], x), weight))
    constrs.push(new Weighted(new EqualsTo([p.y], y), weight))
  }

  if (options.drag) {
    addSoftPoint(
      options.drag.vertexId,
      options.drag.x,
      options.drag.y,
      options.drag.weight ?? 0.35,
    )
  }
  for (const lock of options.softLocks ?? []) {
    addSoftPoint(lock.vertexId, lock.x, lock.y, lock.weight ?? 0.5)
  }

  for (const c of floor.constraints) {
    if (c.type === 'fixedLength') {
      const wall = floor.walls.find((w) => w.id === c.wallId)
      if (!wall) continue
      const a = params.get(wall.a)
      const b = params.get(wall.b)
      if (!a || !b) continue
      constrs.push(
        new Weighted(
          createByConstraintName('P2PDistance', [a.x, a.y, b.x, b.y], [c.length])!,
          8,
        ),
      )
    } else if (c.type === 'horizontal') {
      const wall = floor.walls.find((w) => w.id === c.wallId)
      if (!wall) continue
      const a = params.get(wall.a)
      const b = params.get(wall.b)
      if (!a || !b) continue
      constrs.push(new Weighted(createByConstraintName('equal', [a.y, b.y], [])!, 6))
    } else if (c.type === 'vertical') {
      const wall = floor.walls.find((w) => w.id === c.wallId)
      if (!wall) continue
      const a = params.get(wall.a)
      const b = params.get(wall.b)
      if (!a || !b) continue
      constrs.push(new Weighted(createByConstraintName('equal', [a.x, b.x], [])!, 6))
    } else if (c.type === 'wallDistance') {
      const wa = floor.walls.find((w) => w.id === c.wallA)
      const wb = floor.walls.find((w) => w.id === c.wallB)
      if (!wa || !wb) continue
      const axis = wallsShareAxis(floor, wa.id, wb.id)
      if (!axis) continue
      const centerDist = faceToCenterDistance(
        c.face,
        c.distance,
        wa.thickness,
        wb.thickness,
      )
      const pa = params.get(wa.a)
      const pb = params.get(wb.a)
      if (!pa || !pb) continue
      // Seed signed order from current geometry
      const curA = axis === 'horizontal' ? pa.y.get() : pa.x.get()
      const curB = axis === 'horizontal' ? pb.y.get() : pb.x.get()
      const signed = curA >= curB ? centerDist : -centerDist
      if (axis === 'horizontal') {
        constrs.push(
          new Weighted(createByConstraintName('Diff', [pa.y, pb.y], [signed])!, 8),
        )
      } else {
        constrs.push(
          new Weighted(createByConstraintName('Diff', [pa.x, pb.x], [signed])!, 8),
        )
      }
    } else if (c.type === 'pointsHorizontal') {
      const ids = c.vertexIds.filter((id) => params.has(id))
      for (let i = 1; i < ids.length; i++) {
        const a = params.get(ids[0])!
        const b = params.get(ids[i])!
        constrs.push(new Weighted(createByConstraintName('equal', [a.y, b.y], [])!, 6))
      }
    } else if (c.type === 'pointsVertical') {
      const ids = c.vertexIds.filter((id) => params.has(id))
      for (let i = 1; i < ids.length; i++) {
        const a = params.get(ids[0])!
        const b = params.get(ids[i])!
        constrs.push(new Weighted(createByConstraintName('equal', [a.x, b.x], [])!, 6))
      }
    } else if (c.type === 'vertexDistance') {
      const a = params.get(c.vertexA)
      const b = params.get(c.vertexB)
      if (!a || !b) continue
      const tA = vertexWallThickness(floor, c.vertexA)
      const tB = vertexWallThickness(floor, c.vertexB)
      const centerDist = faceToCenterDistance(c.face, c.distance, tA, tB)
      constrs.push(
        new Weighted(
          createByConstraintName(
            'P2PDistance',
            [a.x, a.y, b.x, b.y],
            [Math.max(0.05, centerDist)],
          )!,
          8,
        ),
      )
    } else if (c.type === 'coincident') {
      const a = params.get(c.vertexA)
      const b = params.get(c.vertexB)
      if (!a || !b) continue
      constrs.push(new Weighted(createByConstraintName('equal', [a.x, b.x], [])!, 10))
      constrs.push(new Weighted(createByConstraintName('equal', [a.y, b.y], [])!, 10))
    } else if (c.type === 'pointOnWall') {
      const wall = floor.walls.find((w) => w.id === c.wallId)
      if (!wall) continue
      if (wall.a === c.vertexId || wall.b === c.vertexId) continue
      const p = params.get(c.vertexId)
      const a = params.get(wall.a)
      const b = params.get(wall.b)
      if (!p || !a || !b) continue
      constrs.push(
        new Weighted(
          createByConstraintName(
            'P2LDistanceSigned',
            [p.x, p.y, a.x, a.y, b.x, b.y],
            [0],
          )!,
          10,
        ),
      )
    }
  }

  const valid = constrs.filter(Boolean) as object[]

  let residual = 0
  let conflict = false
  let ok = true

  if (valid.length > 0) {
    const solver = prepare(valid, [])
    const diagnosis = solver.diagnose()
    conflict = Boolean(diagnosis.conflict)
    const result = solver.solveSystem(options.rough ?? false)
    residual = typeof result.error === 'number' ? result.error : solver.error()
    ok = Boolean(result.success) && !conflict
  }

  // Hard projection: fixed lengths must not stretch after numerical solve
  projectFixedLengths(floor, params, lockedIds, 60)

  // Recompute residual on hard constraints only
  residual = hardResidual(floor, params)
  if (residual > 0.02) {
    conflict = true
    ok = false
  } else {
    ok = true
    conflict = false
  }

  const vertices: Vertex[] = floor.vertices.map((v) => {
    const p = params.get(v.id)!
    return { id: v.id, x: p.x.get(), y: p.y.get() }
  })

  return {
    ok,
    conflict,
    residual,
    iterations: 1,
    floor: { ...floor, vertices },
  }
}

function projectFixedLengths(
  floor: Floor,
  params: Map<Id, ParamPair>,
  lockedIds: Set<Id>,
  maxIter: number,
) {
  for (let iter = 0; iter < maxIter; iter++) {
    let maxErr = 0
    for (const c of floor.constraints) {
      if (c.type === 'fixedLength') {
        const wall = floor.walls.find((w) => w.id === c.wallId)
        if (!wall) continue
        const a = params.get(wall.a)
        const b = params.get(wall.b)
        if (!a || !b) continue
        const aLocked = lockedIds.has(wall.a)
        const bLocked = lockedIds.has(wall.b)
        if (aLocked && bLocked) continue

        let dx = b.x.get() - a.x.get()
        let dy = b.y.get() - a.y.get()
        let len = Math.hypot(dx, dy)
        if (len < 1e-9) {
          dx = c.length
          dy = 0
          len = c.length
        }
        const err = len - c.length
        maxErr = Math.max(maxErr, Math.abs(err))
        const ux = dx / len
        const uy = dy / len

        if (aLocked) {
          b.x.value = a.x.get() + ux * c.length
          b.y.value = a.y.get() + uy * c.length
        } else if (bLocked) {
          a.x.value = b.x.get() - ux * c.length
          a.y.value = b.y.get() - uy * c.length
        } else {
          const half = err * 0.5
          a.x.value += ux * half
          a.y.value += uy * half
          b.x.value -= ux * half
          b.y.value -= uy * half
        }
      } else if (c.type === 'horizontal') {
        const wall = floor.walls.find((w) => w.id === c.wallId)
        if (!wall) continue
        const a = params.get(wall.a)
        const b = params.get(wall.b)
        if (!a || !b) continue
        const aLocked = lockedIds.has(wall.a)
        const bLocked = lockedIds.has(wall.b)
        if (aLocked && !bLocked) b.y.value = a.y.get()
        else if (bLocked && !aLocked) a.y.value = b.y.get()
        else if (!aLocked && !bLocked) {
          const mid = (a.y.get() + b.y.get()) / 2
          a.y.value = mid
          b.y.value = mid
        }
      } else if (c.type === 'vertical') {
        const wall = floor.walls.find((w) => w.id === c.wallId)
        if (!wall) continue
        const a = params.get(wall.a)
        const b = params.get(wall.b)
        if (!a || !b) continue
        const aLocked = lockedIds.has(wall.a)
        const bLocked = lockedIds.has(wall.b)
        if (aLocked && !bLocked) b.x.value = a.x.get()
        else if (bLocked && !aLocked) a.x.value = b.x.get()
        else if (!aLocked && !bLocked) {
          const mid = (a.x.get() + b.x.get()) / 2
          a.x.value = mid
          b.x.value = mid
        }
      } else if (c.type === 'wallDistance') {
        const wa = floor.walls.find((w) => w.id === c.wallA)
        const wb = floor.walls.find((w) => w.id === c.wallB)
        if (!wa || !wb) continue
        const axis = wallsShareAxis(floor, wa.id, wb.id)
        if (!axis) continue
        const target = faceToCenterDistance(
          c.face,
          c.distance,
          wa.thickness,
          wb.thickness,
        )
        const endsA = [params.get(wa.a), params.get(wa.b)].filter(Boolean) as ParamPair[]
        const endsB = [params.get(wb.a), params.get(wb.b)].filter(Boolean) as ParamPair[]
        if (endsA.length < 2 || endsB.length < 2) continue
        const midA =
          axis === 'horizontal'
            ? (endsA[0].y.get() + endsA[1].y.get()) / 2
            : (endsA[0].x.get() + endsA[1].x.get()) / 2
        const midB =
          axis === 'horizontal'
            ? (endsB[0].y.get() + endsB[1].y.get()) / 2
            : (endsB[0].x.get() + endsB[1].x.get()) / 2
        const cur = midA - midB
        const signedTarget = cur >= 0 ? target : -target
        const err = cur - signedTarget
        maxErr = Math.max(maxErr, Math.abs(err))
        const half = err * 0.5
        const vidsA = [wa.a, wa.b]
        const vidsB = [wb.a, wb.b]
        endsA.forEach((p, i) => {
          if (lockedIds.has(vidsA[i])) return
          if (axis === 'horizontal') p.y.value -= half
          else p.x.value -= half
        })
        endsB.forEach((p, i) => {
          if (lockedIds.has(vidsB[i])) return
          if (axis === 'horizontal') p.y.value += half
          else p.x.value += half
        })
      } else if (c.type === 'pointsHorizontal') {
        const pts = c.vertexIds
          .map((id) => ({ id, p: params.get(id) }))
          .filter((x): x is { id: Id; p: ParamPair } => Boolean(x.p))
        if (pts.length < 2) continue
        const unlocked = pts.filter((x) => !lockedIds.has(x.id))
        const locked = pts.filter((x) => lockedIds.has(x.id))
        let targetY: number
        if (locked.length > 0) {
          targetY = locked[0].p.y.get()
        } else {
          targetY =
            unlocked.reduce((s, x) => s + x.p.y.get(), 0) / unlocked.length
        }
        for (const { id, p } of pts) {
          const err = Math.abs(p.y.get() - targetY)
          maxErr = Math.max(maxErr, err)
          if (!lockedIds.has(id)) p.y.value = targetY
        }
      } else if (c.type === 'pointsVertical') {
        const pts = c.vertexIds
          .map((id) => ({ id, p: params.get(id) }))
          .filter((x): x is { id: Id; p: ParamPair } => Boolean(x.p))
        if (pts.length < 2) continue
        const unlocked = pts.filter((x) => !lockedIds.has(x.id))
        const locked = pts.filter((x) => lockedIds.has(x.id))
        let targetX: number
        if (locked.length > 0) {
          targetX = locked[0].p.x.get()
        } else {
          targetX =
            unlocked.reduce((s, x) => s + x.p.x.get(), 0) / unlocked.length
        }
        for (const { id, p } of pts) {
          const err = Math.abs(p.x.get() - targetX)
          maxErr = Math.max(maxErr, err)
          if (!lockedIds.has(id)) p.x.value = targetX
        }
      } else if (c.type === 'vertexDistance') {
        const a = params.get(c.vertexA)
        const b = params.get(c.vertexB)
        if (!a || !b) continue
        const aLocked = lockedIds.has(c.vertexA)
        const bLocked = lockedIds.has(c.vertexB)
        if (aLocked && bLocked) continue
        const tA = vertexWallThickness(floor, c.vertexA)
        const tB = vertexWallThickness(floor, c.vertexB)
        const target = Math.max(
          0.05,
          faceToCenterDistance(c.face, c.distance, tA, tB),
        )
        let dx = b.x.get() - a.x.get()
        let dy = b.y.get() - a.y.get()
        let len = Math.hypot(dx, dy)
        if (len < 1e-9) {
          dx = target
          dy = 0
          len = target
        }
        const err = len - target
        maxErr = Math.max(maxErr, Math.abs(err))
        const ux = dx / len
        const uy = dy / len
        if (aLocked) {
          b.x.value = a.x.get() + ux * target
          b.y.value = a.y.get() + uy * target
        } else if (bLocked) {
          a.x.value = b.x.get() - ux * target
          a.y.value = b.y.get() - uy * target
        } else {
          const half = err * 0.5
          a.x.value += ux * half
          a.y.value += uy * half
          b.x.value -= ux * half
          b.y.value -= uy * half
        }
      } else if (c.type === 'coincident') {
        const a = params.get(c.vertexA)
        const b = params.get(c.vertexB)
        if (!a || !b) continue
        const aLocked = lockedIds.has(c.vertexA)
        const bLocked = lockedIds.has(c.vertexB)
        if (aLocked && bLocked) continue
        const errX = a.x.get() - b.x.get()
        const errY = a.y.get() - b.y.get()
        maxErr = Math.max(maxErr, Math.abs(errX), Math.abs(errY))
        if (aLocked) {
          b.x.value = a.x.get()
          b.y.value = a.y.get()
        } else if (bLocked) {
          a.x.value = b.x.get()
          a.y.value = b.y.get()
        } else {
          const mx = (a.x.get() + b.x.get()) / 2
          const my = (a.y.get() + b.y.get()) / 2
          a.x.value = mx
          a.y.value = my
          b.x.value = mx
          b.y.value = my
        }
      } else if (c.type === 'pointOnWall') {
        const wall = floor.walls.find((w) => w.id === c.wallId)
        if (!wall) continue
        if (wall.a === c.vertexId || wall.b === c.vertexId) continue
        const p = params.get(c.vertexId)
        const a = params.get(wall.a)
        const b = params.get(wall.b)
        if (!p || !a || !b) continue
        if (lockedIds.has(c.vertexId)) continue
        const ax = a.x.get()
        const ay = a.y.get()
        const bx = b.x.get()
        const by = b.y.get()
        const dx = bx - ax
        const dy = by - ay
        const len2 = dx * dx + dy * dy
        if (len2 < 1e-18) continue
        const t = ((p.x.get() - ax) * dx + (p.y.get() - ay) * dy) / len2
        const px = ax + t * dx
        const py = ay + t * dy
        const err = Math.hypot(p.x.get() - px, p.y.get() - py)
        maxErr = Math.max(maxErr, err)
        p.x.value = px
        p.y.value = py
      }
    }
    if (maxErr < 1e-5) break
  }
}

function hardResidual(floor: Floor, params: Map<Id, ParamPair>): number {
  let residual = 0
  for (const c of floor.constraints) {
    if (c.type === 'fixedLength') {
      const wall = floor.walls.find((w) => w.id === c.wallId)
      if (!wall) continue
      const a = params.get(wall.a)
      const b = params.get(wall.b)
      if (!a || !b) continue
      residual += Math.abs(
        Math.hypot(b.x.get() - a.x.get(), b.y.get() - a.y.get()) - c.length,
      )
    } else if (c.type === 'horizontal') {
      const wall = floor.walls.find((w) => w.id === c.wallId)
      if (!wall) continue
      const a = params.get(wall.a)
      const b = params.get(wall.b)
      if (!a || !b) continue
      residual += Math.abs(a.y.get() - b.y.get())
    } else if (c.type === 'vertical') {
      const wall = floor.walls.find((w) => w.id === c.wallId)
      if (!wall) continue
      const a = params.get(wall.a)
      const b = params.get(wall.b)
      if (!a || !b) continue
      residual += Math.abs(a.x.get() - b.x.get())
    } else if (c.type === 'wallDistance') {
      const wa = floor.walls.find((w) => w.id === c.wallA)
      const wb = floor.walls.find((w) => w.id === c.wallB)
      if (!wa || !wb) continue
      const axis = wallsShareAxis(floor, wa.id, wb.id)
      if (!axis) continue
      const target = faceToCenterDistance(
        c.face,
        c.distance,
        wa.thickness,
        wb.thickness,
      )
      // Rebuild midpoints from params
      const pa = params.get(wa.a)!
      const pa2 = params.get(wa.b)!
      const pb = params.get(wb.a)!
      const pb2 = params.get(wb.b)!
      const midA =
        axis === 'horizontal'
          ? (pa.y.get() + pa2.y.get()) / 2
          : (pa.x.get() + pa2.x.get()) / 2
      const midB =
        axis === 'horizontal'
          ? (pb.y.get() + pb2.y.get()) / 2
          : (pb.x.get() + pb2.x.get()) / 2
      residual += Math.abs(Math.abs(midA - midB) - target)
    } else if (c.type === 'pointsHorizontal') {
      const ys = c.vertexIds
        .map((id) => params.get(id)?.y.get())
        .filter((v): v is number => v !== undefined)
      if (ys.length < 2) continue
      const ref = ys[0]
      for (let i = 1; i < ys.length; i++) residual += Math.abs(ys[i] - ref)
    } else if (c.type === 'pointsVertical') {
      const xs = c.vertexIds
        .map((id) => params.get(id)?.x.get())
        .filter((v): v is number => v !== undefined)
      if (xs.length < 2) continue
      const ref = xs[0]
      for (let i = 1; i < xs.length; i++) residual += Math.abs(xs[i] - ref)
    } else if (c.type === 'vertexDistance') {
      const a = params.get(c.vertexA)
      const b = params.get(c.vertexB)
      if (!a || !b) continue
      const tA = vertexWallThickness(floor, c.vertexA)
      const tB = vertexWallThickness(floor, c.vertexB)
      const target = faceToCenterDistance(c.face, c.distance, tA, tB)
      residual += Math.abs(
        Math.hypot(b.x.get() - a.x.get(), b.y.get() - a.y.get()) - target,
      )
    } else if (c.type === 'coincident') {
      const a = params.get(c.vertexA)
      const b = params.get(c.vertexB)
      if (!a || !b) continue
      residual += Math.abs(a.x.get() - b.x.get())
      residual += Math.abs(a.y.get() - b.y.get())
    } else if (c.type === 'pointOnWall') {
      const wall = floor.walls.find((w) => w.id === c.wallId)
      if (!wall) continue
      if (wall.a === c.vertexId || wall.b === c.vertexId) continue
      const p = params.get(c.vertexId)
      const a = params.get(wall.a)
      const b = params.get(wall.b)
      if (!p || !a || !b) continue
      const ax = a.x.get()
      const ay = a.y.get()
      const bx = b.x.get()
      const by = b.y.get()
      const dx = bx - ax
      const dy = by - ay
      const len = Math.hypot(dx, dy)
      if (len < 1e-9) continue
      const signed = (-dy * (p.x.get() - ax) + dx * (p.y.get() - ay)) / len
      residual += Math.abs(signed)
    }
  }
  return residual
}

export function applyDragWithConstraints(
  floor: Floor,
  vertexId: Id,
  x: number,
  y: number,
): SolveResult {
  return solveFloor(floor, { drag: { vertexId, x, y }, rough: true })
}

export function applyMultiDrag(
  floor: Floor,
  targets: Array<{ vertexId: Id; x: number; y: number }>,
): SolveResult {
  return solveFloor(floor, { softLocks: targets, rough: true })
}

export function hasFixedLength(constraints: Constraint[], wallId: Id): boolean {
  return constraints.some((c) => c.type === 'fixedLength' && c.wallId === wallId)
}

export function hasFixedPosition(constraints: Constraint[], vertexId: Id): boolean {
  return constraints.some((c) => c.type === 'fixedPosition' && c.vertexId === vertexId)
}

export function hasAxisConstraint(
  constraints: Constraint[],
  wallId: Id,
  type: 'horizontal' | 'vertical',
): boolean {
  return constraints.some((c) => c.type === type && c.wallId === wallId)
}

import { publicUrl } from '../../publicUrl'

export const CONSTRAINT_ICONS = {
  fixedLength: publicUrl('icons/constraints/distance-constraint.svg'),
  fixedPosition: publicUrl('icons/constraints/lock-constraint.svg'),
  horizontal: publicUrl('icons/constraints/horizontal-constraint.svg'),
  vertical: publicUrl('icons/constraints/vertical-constraint.svg'),
  wallDistance: publicUrl('icons/constraints/distancepl-constraint.svg'),
  vertexDistance: publicUrl('icons/constraints/distance-constraint.svg'),
  pointsHorizontal: publicUrl('icons/constraints/horizontal-constraint.svg'),
  pointsVertical: publicUrl('icons/constraints/vertical-constraint.svg'),
  coincident: publicUrl('icons/constraints/coincident-constraint.svg'),
  pointOnWall: publicUrl('icons/constraints/point-on-line-constraint.svg'),
} as const

export function hasPointOnWall(
  constraints: Constraint[],
  vertexId: Id,
  wallId: Id,
): boolean {
  return constraints.some(
    (c) =>
      c.type === 'pointOnWall' &&
      c.vertexId === vertexId &&
      c.wallId === wallId,
  )
}

export function wallConstraintTypes(
  constraints: Constraint[],
  wallId: Id,
): Array<'fixedLength' | 'horizontal' | 'vertical' | 'wallDistance'> {
  const out: Array<'fixedLength' | 'horizontal' | 'vertical' | 'wallDistance'> = []
  for (const c of constraints) {
    if (c.type === 'fixedLength' && c.wallId === wallId) out.push('fixedLength')
    if (c.type === 'horizontal' && c.wallId === wallId) out.push('horizontal')
    if (c.type === 'vertical' && c.wallId === wallId) out.push('vertical')
    if (
      c.type === 'wallDistance' &&
      (c.wallA === wallId || c.wallB === wallId)
    ) {
      out.push('wallDistance')
    }
  }
  return out
}

function sameIdSet(a: Id[], b: Id[]): boolean {
  if (a.length !== b.length) return false
  const sb = new Set(b)
  return a.every((id) => sb.has(id))
}

export function hasPointsAligned(
  constraints: Constraint[],
  vertexIds: Id[],
  type: 'pointsHorizontal' | 'pointsVertical',
): boolean {
  return constraints.some(
    (c) => c.type === type && sameIdSet(c.vertexIds, vertexIds),
  )
}
