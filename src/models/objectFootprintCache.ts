import type { PlanHalfSize } from '../engine/geometry/objectSnap'

/** Live plan AABB half-extents measured from loaded meshes (3D). */
const liveHalf = new Map<string, PlanHalfSize>()

export function setLivePlanHalf(id: string, half: PlanHalfSize): void {
  liveHalf.set(id, half)
}

export function clearLivePlanHalf(id: string): void {
  liveHalf.delete(id)
}

export function getLivePlanHalf(id: string): PlanHalfSize | undefined {
  return liveHalf.get(id)
}

export function livePlanHalfMap(): Record<string, PlanHalfSize> {
  const out: Record<string, PlanHalfSize> = {}
  for (const [id, h] of liveHalf) out[id] = h
  return out
}
