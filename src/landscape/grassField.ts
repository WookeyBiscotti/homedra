import type { LandscapeFrame } from './maps'
import { frameSizeX, frameSizeY, pointInRing, uvToPlan } from './maps'
import { heightAt } from './terrain'
import {
  LANDSCAPE_GRASS_DEFAULTS,
  type LandscapeGrassLayer,
  type LandscapePlant,
  type LandscapeTerrain,
} from '../engine/types'

export const GRASS_INSTANCE_CAP = 28000

export type GrassTuft = {
  x: number
  y: number
  z: number
  yaw: number
  sx: number
  sy: number
  sz: number
  tintR: number
  tintG: number
  tintB: number
}

function hash(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export function layoutGrass(opts: {
  grass: Pick<LandscapeGrassLayer, 'density' | 'height' | 'seed'> & {
    resolution: number
    width?: number
  }
  coverage: Uint8Array
  terrain?: LandscapeTerrain | null
  groundY: number
  frame: LandscapeFrame
  holes: Array<Array<{ x: number; z: number }>>
  plants?: LandscapePlant[]
  cap?: number
}): GrassTuft[] {
  const res = opts.grass.resolution
  const density = opts.grass.density
  const h = opts.grass.height
  const seed = opts.grass.seed
  const width = opts.grass.width ?? LANDSCAPE_GRASS_DEFAULTS.width
  const cellX = frameSizeX(opts.frame) / res
  const cellY = frameSizeY(opts.frame) / res
  const area = cellX * cellY
  const perCell = density * area
  const out: GrassTuft[] = []
  const plants = opts.plants ?? []

  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const cov = opts.coverage[j * res + i] ?? 0
      if (cov < 8) continue
      // High-res maps have <<1 tuft per cell; round() wiped the whole meadow.
      const expected = (cov / 255) * perCell
      const whole = Math.floor(expected)
      const extra = hash(seed * 19 + i * 311 + j * 701) < expected - whole ? 1 : 0
      const n = Math.min(6, whole + extra)
      if (n <= 0) continue
      const base = uvToPlan((i + 0.5) / res, (j + 0.5) / res, opts.frame)
      if (opts.holes.some((ring) => pointInRing(base.x, base.y, ring))) continue
      for (let k = 0; k < n; k++) {
        const rnd = hash(seed * 17 + i * 131 + j * 917 + k * 53)
        const rnd2 = hash(rnd * 1000 + 3)
        const rnd3 = hash(rnd2 * 1000 + 7)
        const x = base.x + (rnd - 0.5) * cellX
        const y = base.y + (rnd2 - 0.5) * cellY
        if (opts.holes.some((ring) => pointInRing(x, y, ring))) continue
        if (
          plants.some((p) => Math.hypot(p.x - x, p.y - y) < 0.4 * p.scale)
        ) {
          continue
        }
        const hy = opts.groundY + heightAt(opts.terrain, x, y) - 0.02
        // EZ-Tree sizeVariation: y swings more than x/z.
        const hh = h * (0.7 + rnd * 0.55)
        const spreadX = width * (0.8 + rnd2 * 0.4)
        const spreadZ = width * (0.8 + rnd3 * 0.4)
        out.push({
          x,
          y: hy,
          z: -y,
          yaw: rnd * Math.PI * 2,
          sx: hh * spreadX,
          sy: hh,
          sz: hh * spreadZ,
          // EZ-Tree instanceColor greens, as multipliers on the layer tint.
          tintR: 0.85 + rnd * 0.2,
          tintG: 0.7 + rnd2 * 0.55,
          tintB: 0.9 + rnd3 * 0.12,
        })
      }
    }
  }

  const cap = Math.max(1, opts.cap ?? GRASS_INSTANCE_CAP)
  if (out.length <= cap) return out
  const step = out.length / cap
  const trimmed: GrassTuft[] = []
  for (let i = 0; i < cap; i++) {
    const t = out[Math.floor(i * step)]
    if (t) trimmed.push(t)
  }
  return trimmed
}
