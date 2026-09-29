import {
  isFullTexRegion,
  normalizeTileTexRegion,
  type TileTexRegion,
} from '../engine/types'

function imageSize(image: unknown): { width: number; height: number } | null {
  if (!image || typeof image !== 'object') return null
  const img = image as {
    width?: number
    height?: number
    videoWidth?: number
    videoHeight?: number
    naturalWidth?: number
    naturalHeight?: number
  }
  const w = img.width || img.videoWidth || img.naturalWidth || 0
  const h = img.height || img.videoHeight || img.naturalHeight || 0
  if (w < 1 || h < 1) return null
  return { width: w, height: h }
}

export function cropRectPx(
  width: number,
  height: number,
  region?: TileTexRegion | null,
): { sx: number; sy: number; sw: number; sh: number } {
  const r = normalizeTileTexRegion(region)
  return {
    sx: r.u0 * width,
    sy: r.v0 * height,
    sw: Math.max(1, (r.u1 - r.u0) * width),
    sh: Math.max(1, (r.v1 - r.v0) * height),
  }
}

const cropCanvasCache = new WeakMap<
  object,
  Map<string, HTMLCanvasElement>
>()

/** Raster crop in picker space (v=0 is the top of the photo). */
export function cropImageToCanvas(
  image: CanvasImageSource,
  region?: TileTexRegion | null,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  if (isFullTexRegion(region)) return null
  const size = imageSize(image)
  if (!size) return null
  const r = normalizeTileTexRegion(region)
  const cacheKey = `${r.u0}:${r.v0}:${r.u1}:${r.v1}:${size.width}x${size.height}`
  if (typeof image === 'object' && image) {
    const bucket = cropCanvasCache.get(image)
    const hit = bucket?.get(cacheKey)
    if (hit) return hit
  }
  const { sx, sy, sw, sh } = cropRectPx(size.width, size.height, region)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw))
  canvas.height = Math.max(1, Math.round(sh))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  try {
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  } catch {
    return null
  }
  if (typeof image === 'object' && image) {
    let bucket = cropCanvasCache.get(image)
    if (!bucket) {
      bucket = new Map()
      cropCanvasCache.set(image, bucket)
    }
    bucket.set(cacheKey, canvas)
  }
  return canvas
}
