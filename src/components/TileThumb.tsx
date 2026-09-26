import { useEffect, useState } from 'react'
import {
  normalizeTileTexRegion,
  type MaterialRef,
  type TileTexRegion,
} from '../engine/types'
import { materialThumbnailUrl } from '../materials/textureCatalog'
import { useMaterialThumb } from './TextureBrowser'

export function TileThumb({
  material,
  alt = '',
  className,
  width,
  length,
  texRegion,
}: {
  material: MaterialRef
  alt?: string
  className?: string
  width?: number
  length?: number
  texRegion?: TileTexRegion
}) {
  const loaded = useMaterialThumb(material)
  const thumb = loaded ?? materialThumbnailUrl(material)
  const aspect =
    width && length && width > 0 && length > 0 ? `${width} / ${length}` : undefined
  const region = normalizeTileTexRegion(texRegion)
  const du = Math.max(0.04, region.u1 - region.u0)
  const dv = Math.max(0.04, region.v1 - region.v0)
  if (!thumb) {
    return (
      <div
        className={className ? `${className} tile-thumb` : 'tile-thumb model-thumb-fallback'}
        style={aspect ? { aspectRatio: aspect } : undefined}
        aria-hidden
      />
    )
  }
  return (
    <div
      className={className ? `${className} tile-thumb` : 'tile-thumb'}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      <img
        src={thumb}
        alt={alt}
        referrerPolicy="no-referrer"
        style={{
          width: `${100 / du}%`,
          height: `${100 / dv}%`,
          left: `${(-region.u0 * 100) / du}%`,
          top: `${(-region.v0 * 100) / dv}%`,
        }}
        onError={(e) => {
          const el = e.currentTarget
          if (material.source !== 'ambientcg' || el.dataset.fallback) {
            el.style.visibility = 'hidden'
            return
          }
          el.dataset.fallback = '1'
          el.src = `https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/${material.assetId}/${material.assetId}_SQ_Color.jpg`
        }}
      />
    </div>
  )
}

function materialImageKey(material: MaterialRef): string {
  return `${material.source}:${material.assetId}:${material.url ?? ''}`
}

const imageCache = new Map<string, HTMLImageElement>()

/** Konva fillPattern image for a material thumbnail. */
export function useMaterialHtmlImage(
  material: MaterialRef | null | undefined,
): HTMLImageElement | null {
  const url = useMaterialThumb(material)
  const [image, setImage] = useState<HTMLImageElement | null>(() => {
    if (!material) return null
    return imageCache.get(materialImageKey(material)) ?? null
  })

  useEffect(() => {
    if (!material || !url) {
      setImage(null)
      return
    }
    const key = materialImageKey(material)
    const cached = imageCache.get(key)
    if (cached && cached.src === url) {
      setImage(cached)
      return
    }
    let alive = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.onload = () => {
      if (!alive) return
      imageCache.set(key, img)
      setImage(img)
    }
    img.onerror = () => {
      if (!alive || material.source !== 'ambientcg' || img.dataset.fallback) {
        if (alive) setImage(null)
        return
      }
      img.dataset.fallback = '1'
      img.src = `https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/${material.assetId}/${material.assetId}_SQ_Color.jpg`
    }
    img.src = url
    return () => {
      alive = false
    }
  }, [material?.source, material?.assetId, material?.url, url])

  return image
}
