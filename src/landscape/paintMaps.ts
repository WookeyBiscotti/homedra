import type { LandscapeFrame } from './maps'
import { brushWeight, stampScalar, uvToPlan } from './maps'

/** Paint splat R/G/B weights (layers 1..3). Layer 0 is the remainder. */
export function stampSplat(
  data: Uint8Array,
  res: number,
  frame: LandscapeFrame,
  cx: number,
  cy: number,
  radius: number,
  hardness: number,
  strength: number,
  layer: 0 | 1 | 2 | 3,
  erase: boolean,
  locked?: Uint8Array,
): void {
  const amt = Math.max(0, Math.min(1, strength))
  const half = frame.size / 2
  const cell = frame.size / Math.max(1, res - 1)
  const i0 = Math.max(0, Math.floor((cx - radius - (frame.originX - half)) / cell) - 1)
  const i1 = Math.min(res - 1, Math.ceil((cx + radius - (frame.originX - half)) / cell) + 1)
  const j0 = Math.max(0, Math.floor((cy - radius - (frame.originY - half)) / cell) - 1)
  const j1 = Math.min(res - 1, Math.ceil((cy + radius - (frame.originY - half)) / cell) + 1)
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (locked && locked[j * res + i]) continue
      const p = uvToPlan(res <= 1 ? 0.5 : i / (res - 1), res <= 1 ? 0.5 : j / (res - 1), frame)
      const w = brushWeight(p.x - cx, p.y - cy, radius, hardness)
      if (w <= 0) continue
      const idx = (j * res + i) * 4
      const r = data[idx] ?? 0
      const g = data[idx + 1] ?? 0
      const b = data[idx + 2] ?? 0
      const t = amt * w
      let nr = r
      let ng = g
      let nb = b
      if (erase || layer === 0) {
        const k = 1 - t
        nr = r * k
        ng = g * k
        nb = b * k
      } else {
        const add = 255 * t
        if (layer === 1) nr = Math.min(255, r + add)
        if (layer === 2) ng = Math.min(255, g + add)
        if (layer === 3) nb = Math.min(255, b + add)
        const sum = nr + ng + nb
        if (sum > 255) {
          const s = 255 / sum
          nr *= s
          ng *= s
          nb *= s
        }
      }
      data[idx] = nr
      data[idx + 1] = ng
      data[idx + 2] = nb
      data[idx + 3] = 255
    }
  }
}

export function stampCoverage(
  data: Uint8Array,
  res: number,
  frame: LandscapeFrame,
  cx: number,
  cy: number,
  radius: number,
  hardness: number,
  strength: number,
  erase: boolean,
  locked?: Uint8Array,
): void {
  const amt = Math.max(0, Math.min(1, strength)) * 255
  stampScalar(
    data,
    res,
    frame,
    cx,
    cy,
    radius,
    hardness,
    (value, w) => {
      const delta = amt * w
      const next = erase ? value - delta : value + delta
      return Math.max(0, Math.min(255, next))
    },
    locked,
  )
}
