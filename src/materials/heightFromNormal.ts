import * as THREE from 'three'

/** Cap so Poisson stays interactive on 1k+ catalog previews. */
const MAX_EDGE = 256
const ITERATIONS = 80
const FLAT_EPS = 1e-5

export const GENERATED_FROM_NORMAL = '__generatedFromNormal'

const generatedByImage = new WeakMap<object, THREE.Texture>()

function wrap(i: number, n: number): number {
  return ((i % n) + n) % n
}

/**
 * Periodic Poisson reconstruction of a 0–1 height field from a
 * tangent-space OpenGL normal map (RGBA8, row-major, top-left origin).
 * Returns null when the field is flat.
 */
export function heightFromNormalRgba(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  iterations = ITERATIONS,
): Float32Array | null {
  if (width < 2 || height < 2) return null
  const n = width * height
  const gx = new Float32Array(n)
  const gy = new Float32Array(n)
  const div = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    const o = i * 4
    let nx = rgba[o] / 255 * 2 - 1
    let ny = rgba[o + 1] / 255 * 2 - 1
    let nz = rgba[o + 2] / 255 * 2 - 1
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    const denom = Math.max(0.2, nz)
    gx[i] = -nx / denom
    gy[i] = -ny / denom
  }

  for (let y = 0; y < height; y++) {
    const ym = wrap(y - 1, height)
    for (let x = 0; x < width; x++) {
      const xm = wrap(x - 1, width)
      const i = y * width + x
      div[i] = gx[i] - gx[y * width + xm] + gy[i] - gy[ym * width + x]
    }
  }

  const h = new Float32Array(n)
  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < height; y++) {
      const yp = wrap(y + 1, height)
      const ym = wrap(y - 1, height)
      for (let x = 0; x < width; x++) {
        const xp = wrap(x + 1, width)
        const xm = wrap(x - 1, width)
        const i = y * width + x
        h[i] =
          0.25 *
          (h[y * width + xm] +
            h[y * width + xp] +
            h[ym * width + x] +
            h[yp * width + x] -
            div[i])
      }
    }
  }

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < n; i++) {
    if (h[i] < min) min = h[i]
    if (h[i] > max) max = h[i]
  }
  const range = max - min
  if (!Number.isFinite(range) || range < FLAT_EPS) return null
  const scale = 1 / range
  for (let i = 0; i < n; i++) h[i] = (h[i] - min) * scale
  return h
}

function asPixelBuffer(
  image: unknown,
): { data: Uint8ClampedArray; width: number; height: number } | null {
  if (!image || typeof image !== 'object') return null
  if (!('data' in image) || !('width' in image) || !('height' in image)) {
    return null
  }
  const width = Number((image as { width: number }).width)
  const height = Number((image as { height: number }).height)
  const raw = (image as { data: ArrayLike<number> }).data
  if (!width || !height || !raw || raw.length < width * height * 4) return null
  const data =
    raw instanceof Uint8ClampedArray ? raw : new Uint8ClampedArray(raw as ArrayLike<number>)
  return { data, width, height }
}

function readNormalPixels(
  image: TexImageSource,
): { data: Uint8ClampedArray; width: number; height: number } | null {
  const raw = asPixelBuffer(image)
  if (raw) return raw
  const srcW = 'width' in image ? Number(image.width) : 0
  const srcH = 'height' in image ? Number(image.height) : 0
  if (!srcW || !srcH || typeof document === 'undefined') return null
  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH))
  const width = Math.max(2, Math.round(srcW * scale))
  const height = Math.max(2, Math.round(srcH * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image as CanvasImageSource, 0, 0, width, height)
  const id = ctx.getImageData(0, 0, width, height)
  return { data: id.data, width, height }
}

/** Build a grayscale displacement texture aligned with `normal`. */
export function displacementTextureFromNormal(
  normal: THREE.Texture,
): THREE.Texture | null {
  const image = normal.image as TexImageSource | undefined
  if (!image) return null
  const pixels = readNormalPixels(image)
  if (!pixels) return null
  const height = heightFromNormalRgba(pixels.data, pixels.width, pixels.height)
  if (!height) return null

  const rgba = new Uint8Array(pixels.width * pixels.height * 4)
  for (let i = 0; i < height.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(height[i] * 255)))
    const o = i * 4
    rgba[o] = v
    rgba[o + 1] = v
    rgba[o + 2] = v
    rgba[o + 3] = 255
  }
  const tex = new THREE.DataTexture(
    rgba,
    pixels.width,
    pixels.height,
    THREE.RGBAFormat,
  )
  tex.flipY = normal.flipY
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.NoColorSpace
  tex.anisotropy = normal.anisotropy || 8
  tex.userData = { ...tex.userData, [GENERATED_FROM_NORMAL]: true }
  tex.needsUpdate = true
  return tex
}

/**
 * If a PBR set has normals but no height map, reconstruct displacement.
 * Cached per source image so clones of the same normal reuse the solve.
 */
export function ensureDisplacementMap<
  T extends {
    displacementMap?: THREE.Texture
    normalMap?: THREE.Texture
  },
>(maps: T): T {
  if (maps.displacementMap || !maps.normalMap) return maps
  const image = maps.normalMap.image as object | undefined
  let disp: THREE.Texture | null | undefined
  if (image) disp = generatedByImage.get(image)
  if (!disp) {
    disp = displacementTextureFromNormal(maps.normalMap)
    if (disp && image) generatedByImage.set(image, disp)
  }
  if (disp) maps.displacementMap = disp
  return maps
}
