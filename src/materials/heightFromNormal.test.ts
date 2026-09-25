import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  displacementTextureFromNormal,
  ensureDisplacementMap,
  GENERATED_FROM_NORMAL,
  heightFromNormalRgba,
} from './heightFromNormal'
import type { LoadedPbrMaps } from './ambientcg'

function encodeNormal(nx: number, ny: number, nz: number): [number, number, number] {
  const len = Math.hypot(nx, ny, nz) || 1
  return [
    Math.round(((nx / len) * 0.5 + 0.5) * 255),
    Math.round(((ny / len) * 0.5 + 0.5) * 255),
    Math.round(((nz / len) * 0.5 + 0.5) * 255),
  ]
}

function fillNormals(
  width: number,
  height: number,
  at: (x: number, y: number) => [number, number, number],
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = encodeNormal(...at(x, y))
      const o = (y * width + x) * 4
      rgba[o] = r
      rgba[o + 1] = g
      rgba[o + 2] = b
      rgba[o + 3] = 255
    }
  }
  return rgba
}

describe('heightFromNormalRgba', () => {
  it('returns null for a flat +Z normal field', () => {
    const rgba = fillNormals(16, 16, () => [0, 0, 1])
    expect(heightFromNormalRgba(rgba, 16, 16)).toBeNull()
  })

  it('recovers a periodic sine ridge from its normals', () => {
    const w = 32
    const h = 16
    const rgba = fillNormals(w, h, (x) => {
      const gx = ((2 * Math.PI) / w) * Math.cos((2 * Math.PI * x) / w)
      return [-gx, 0, 1]
    })
    const height = heightFromNormalRgba(rgba, w, h, 120)
    expect(height).not.toBeNull()
    let num = 0
    let denS = 0
    let denH = 0
    let meanS = 0
    let meanH = 0
    const n = w * h
    const sine = (i: number) => Math.sin((2 * Math.PI * (i % w)) / w)
    for (let i = 0; i < n; i++) {
      meanS += sine(i)
      meanH += height![i]
    }
    meanS /= n
    meanH /= n
    for (let i = 0; i < n; i++) {
      const ds = sine(i) - meanS
      const dh = height![i] - meanH
      num += ds * dh
      denS += ds * ds
      denH += dh * dh
    }
    const corr = num / Math.sqrt(denS * denH)
    expect(corr).toBeGreaterThan(0.85)
  })

  it('puts a central bump higher than the corners', () => {
    const w = 24
    const h = 24
    const cx = (w - 1) / 2
    const cy = (h - 1) / 2
    const rgba = fillNormals(w, h, (x, y) => {
      const dx = (x - cx) / cx
      const dy = (y - cy) / cy
      return [dx * 0.6, dy * 0.6, 1]
    })
    const height = heightFromNormalRgba(rgba, w, h, 120)
    expect(height).not.toBeNull()
    const mid = height![12 * w + 12]
    const corner = height![0]
    expect(mid).toBeGreaterThan(corner + 0.15)
  })
})

describe('ensureDisplacementMap', () => {
  it('leaves an existing displacement map alone', () => {
    const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    const existing = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1)
    const maps: LoadedPbrMaps = { map, displacementMap: existing }
    ensureDisplacementMap(maps)
    expect(maps.displacementMap).toBe(existing)
  })

  it('builds a generated map from ImageData normals', () => {
    const w = 16
    const h = 16
    const rgba = fillNormals(w, h, (x) => {
      const gx = ((2 * Math.PI) / w) * Math.cos((2 * Math.PI * x) / w)
      return [-gx, 0, 1]
    })
    const normal = new THREE.Texture()
    normal.image = { data: rgba, width: w, height: h }
    const albedo = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    const maps: LoadedPbrMaps = { map: albedo, normalMap: normal }
    ensureDisplacementMap(maps)
    expect(maps.displacementMap).toBeTruthy()
    expect(maps.displacementMap?.userData[GENERATED_FROM_NORMAL]).toBe(true)
    expect(displacementTextureFromNormal(normal)?.image).toBeTruthy()
  })
})
