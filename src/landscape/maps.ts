/** Shared raster helpers for height / splat / grass coverage. */

export const HEIGHT_LIMIT_M = 3
export const HEIGHT_MM = 1000

export type LandscapeFrame = {
  /** X extent in meters. Legacy square plots only set this. */
  size: number
  /** Y (plan) extent in meters. Defaults to `size`. */
  sizeY?: number
  originX: number
  originY: number
}

export function frameSizeX(frame: LandscapeFrame): number {
  return Math.max(1, frame.size)
}

export function frameSizeY(frame: LandscapeFrame): number {
  return Math.max(1, frame.sizeY ?? frame.size)
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(s)
}

export function base64ToBytes(raw: string): Uint8Array {
  const data = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw
  const bin = atob(data)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function encodeHeights(heights: Float32Array): string {
  const buf = new Int16Array(heights.length)
  for (let i = 0; i < heights.length; i++) {
    const mm = Math.round(
      Math.max(-HEIGHT_LIMIT_M, Math.min(HEIGHT_LIMIT_M, heights[i] ?? 0)) *
        HEIGHT_MM,
    )
    buf[i] = Math.max(-32767, Math.min(32767, mm))
  }
  return bytesToBase64(new Uint8Array(buf.buffer))
}

export function decodeHeights(raw: string | undefined, count: number): Float32Array {
  const out = new Float32Array(count)
  if (!raw) return out
  try {
    const bytes = base64ToBytes(raw)
    const src = new Int16Array(
      bytes.buffer,
      bytes.byteOffset,
      Math.floor(bytes.byteLength / 2),
    )
    const n = Math.min(count, src.length)
    for (let i = 0; i < n; i++) {
      out[i] = Math.max(
        -HEIGHT_LIMIT_M,
        Math.min(HEIGHT_LIMIT_M, (src[i] ?? 0) / HEIGHT_MM),
      )
    }
  } catch {
    /* empty map */
  }
  return out
}

export function encodeBytes(data: Uint8Array): string {
  return bytesToBase64(data)
}

export function decodeBytes(raw: string | undefined, count: number): Uint8Array {
  const out = new Uint8Array(count)
  if (!raw) return out
  try {
    const src = base64ToBytes(raw)
    out.set(src.subarray(0, Math.min(count, src.length)))
  } catch {
    /* empty */
  }
  return out
}

export function planToUv(
  x: number,
  y: number,
  frame: LandscapeFrame,
): { u: number; v: number } {
  const sx = frameSizeX(frame)
  const sy = frameSizeY(frame)
  return {
    u: (x - frame.originX + sx / 2) / sx,
    v: (y - frame.originY + sy / 2) / sy,
  }
}

export function uvToPlan(
  u: number,
  v: number,
  frame: LandscapeFrame,
): { x: number; y: number } {
  const sx = frameSizeX(frame)
  const sy = frameSizeY(frame)
  return {
    x: frame.originX - sx / 2 + u * sx,
    y: frame.originY - sy / 2 + v * sy,
  }
}

export function sampleBilinear(
  data: ArrayLike<number>,
  res: number,
  u: number,
  v: number,
  channels = 1,
  channel = 0,
): number {
  const ch = Math.max(1, channels)
  const c = Math.max(0, Math.min(ch - 1, channel))
  if (res <= 1) return data[c] ?? 0
  const x = Math.max(0, Math.min(1, u)) * (res - 1)
  const y = Math.max(0, Math.min(1, v)) * (res - 1)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(res - 1, x0 + 1)
  const y1 = Math.min(res - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  const a = data[(y0 * res + x0) * ch + c] ?? 0
  const b = data[(y0 * res + x1) * ch + c] ?? 0
  const c1 = data[(y1 * res + x0) * ch + c] ?? 0
  const d = data[(y1 * res + x1) * ch + c] ?? 0
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c1 * (1 - tx) * ty + d * tx * ty
}

/** World-locked resample when the plot rectangle moves or grows. */
export function resamplePlanGrid(
  src: ArrayLike<number>,
  srcRes: number,
  srcFrame: LandscapeFrame,
  dstRes: number,
  dstFrame: LandscapeFrame,
  channels = 1,
): Float32Array {
  const ch = Math.max(1, channels)
  const out = new Float32Array(dstRes * dstRes * ch)
  for (let j = 0; j < dstRes; j++) {
    for (let i = 0; i < dstRes; i++) {
      const u = dstRes <= 1 ? 0.5 : i / (dstRes - 1)
      const v = dstRes <= 1 ? 0.5 : j / (dstRes - 1)
      const p = uvToPlan(u, v, dstFrame)
      const uv = planToUv(p.x, p.y, srcFrame)
      if (uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1) continue
      const o = (j * dstRes + i) * ch
      for (let c = 0; c < ch; c++) {
        out[o + c] = sampleBilinear(src, srcRes, uv.u, uv.v, ch, c)
      }
    }
  }
  return out
}

export function brushWeight(
  dx: number,
  dy: number,
  radius: number,
  hardness: number,
): number {
  const r = Math.max(0.05, radius)
  const d = Math.hypot(dx, dy) / r
  if (d >= 1) return 0
  const inner = Math.max(0, Math.min(0.98, hardness))
  if (d <= inner) return 1
  const t = (d - inner) / (1 - inner)
  return 0.5 * (1 + Math.cos(Math.PI * t))
}

export function stampScalar(
  data: Float32Array | Uint8Array,
  res: number,
  frame: LandscapeFrame,
  cx: number,
  cy: number,
  radius: number,
  hardness: number,
  apply: (value: number, weight: number, i: number, j: number) => number,
  locked?: Uint8Array,
): void {
  const sx = frameSizeX(frame)
  const sy = frameSizeY(frame)
  const cellX = sx / Math.max(1, res - 1)
  const cellY = sy / Math.max(1, res - 1)
  const i0 = Math.max(0, Math.floor((cx - radius - (frame.originX - sx / 2)) / cellX) - 1)
  const i1 = Math.min(res - 1, Math.ceil((cx + radius - (frame.originX - sx / 2)) / cellX) + 1)
  const j0 = Math.max(0, Math.floor((cy - radius - (frame.originY - sy / 2)) / cellY) - 1)
  const j1 = Math.min(res - 1, Math.ceil((cy + radius - (frame.originY - sy / 2)) / cellY) + 1)
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const idx = j * res + i
      if (locked && locked[idx]) continue
      const p = uvToPlan(res <= 1 ? 0.5 : i / (res - 1), res <= 1 ? 0.5 : j / (res - 1), frame)
      const w = brushWeight(p.x - cx, p.y - cy, radius, hardness)
      if (w <= 0) continue
      data[idx] = apply(data[idx] ?? 0, w, i, j)
    }
  }
}

export function pointInRing(
  x: number,
  y: number,
  ring: Array<{ x: number; z: number }>,
): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.x ?? 0
    const yi = ring[i]?.z ?? 0
    const xj = ring[j]?.x ?? 0
    const yj = ring[j]?.z ?? 0
    const inter =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi
    if (inter) inside = !inside
  }
  return inside
}
