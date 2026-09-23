import type { MaterialRef } from '../engine/types'
import * as THREE from 'three'

/**
 * ambientCG's JSON API does not send CORS headers, so the browser cannot
 * call it directly. We ship a same-origin catalog and load maps from their
 * Backblaze CDN (which does allow CORS).
 */
const CATALOG_URL = '/ambientcg-catalog.json'
const THUMB_BASE =
  'https://f003.backblazeb2.com/file/ambientCG-Web/media/thumbnail'
const PREVIEW_BASE =
  'https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview'

const CACHE_NAME = 'ambientcg-textures-v2'

export interface AmbientcgAssetSummary {
  id: string
  title: string
  thumbnailUrl: string
  tileWidthM?: number
  tileHeightM?: number
  maps: string[]
}

export interface AmbientcgMaps {
  colorCandidates: string[]
  normal?: string
  roughness?: string
  metalness?: string
  ao?: string
}

type CatalogAsset = {
  id: string
  title: string
  tileWidthM?: number
  tileHeightM?: number
}

type CatalogFile = {
  source?: string
  count?: number
  assets: CatalogAsset[]
}

let catalogPromise: Promise<CatalogAsset[]> | null = null

function loadCatalog(): Promise<CatalogAsset[]> {
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Catalog load failed (${res.status})`)
        const data = (await res.json()) as CatalogFile
        return data.assets ?? []
      })
      .catch((err) => {
        catalogPromise = null
        throw err
      })
  }
  return catalogPromise
}

function thumbnailUrl(id: string, size: 128 | 256 | 512 = 256): string {
  return `${THUMB_BASE}/${size}-JPG-FFFFFF/${id}.jpg`
}

/** Public helper for UI thumbnails (Backblaze CDN). */
export function ambientcgThumbnailUrl(
  assetId: string,
  size: 128 | 256 = 128,
): string {
  return thumbnailUrl(assetId, size)
}

function toSummary(a: CatalogAsset): AmbientcgAssetSummary {
  return {
    id: a.id,
    title: a.title || a.id,
    thumbnailUrl: thumbnailUrl(a.id),
    tileWidthM: a.tileWidthM,
    tileHeightM: a.tileHeightM,
    maps: ['color', 'normal', 'roughness', 'metalness', 'ao'],
  }
}

function matchesQuery(a: CatalogAsset, q: string): boolean {
  if (!q) return true
  const hay = `${a.id} ${a.title}`.toLowerCase()
  const tokens = q.toLowerCase().split(/[\s,]+/).filter(Boolean)
  return tokens.every((t) => hay.includes(t))
}

/** Browse / search ambientCG materials (CC0) via local catalog. */
export const CATALOG_PAGE_SIZE = 60

export async function searchMaterials(
  q: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ total: number; assets: AmbientcgAssetSummary[] }> {
  const all = await loadCatalog()
  const filtered = all.filter((a) => matchesQuery(a, q.trim()))
  const offset = Math.max(0, opts.offset ?? 0)
  // No hard 100-cap — UI paginates; allow fetching the rest of the catalog.
  const limit = Math.max(1, opts.limit ?? CATALOG_PAGE_SIZE)
  const page = filtered.slice(offset, offset + limit).map(toSummary)
  return { total: filtered.length, assets: page }
}

/** Candidate URLs for albedo (preview → higher thumbs). */
export function resolveMaps(assetId: string): AmbientcgMaps {
  const base = `${PREVIEW_BASE}/${assetId}/${assetId}_SQ`
  return {
    colorCandidates: [
      `${base}_Color.jpg`,
      thumbnailUrl(assetId, 512),
      thumbnailUrl(assetId, 256),
    ],
    normal: `${base}_NormalGL.jpg`,
    roughness: `${base}_Roughness.jpg`,
    metalness: `${base}_Metalness.jpg`,
    ao: `${base}_AmbientOcclusion.jpg`,
  }
}

export function materialRefFromAsset(
  asset: AmbientcgAssetSummary,
  tileSizeM?: number,
): MaterialRef {
  const tile = tileSizeM ?? asset.tileWidthM ?? asset.tileHeightM ?? 1.5
  return {
    source: 'ambientcg',
    assetId: asset.id,
    tileSizeM: Math.max(0.2, tile),
  }
}

async function fetchCachedBlob(url: string): Promise<Blob> {
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME)
      const hit = await cache.match(url)
      if (hit) {
        if (!hit.ok) throw new Error(`Cached miss ${url}`)
        return await hit.blob()
      }
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
      if (!res.ok) throw new Error(`Failed to load ${url}`)
      const clone = res.clone()
      void cache.put(url, clone)
      return await res.blob()
    } catch {
      // fall through
    }
  }
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
  if (!res.ok) throw new Error(`Failed to load ${url}`)
  return await res.blob()
}

const textureCache = new Map<string, Promise<THREE.Texture>>()

function loadTextureFromUrl(url: string, colorSpace: boolean): Promise<THREE.Texture> {
  const key = `${colorSpace ? 'c' : 'd'}:${url}`
  let pending = textureCache.get(key)
  if (pending) return pending

  pending = (async () => {
    const blob = await fetchCachedBlob(url)
    if (blob.size < 100) throw new Error(`Empty texture ${url}`)
    const objectUrl = URL.createObjectURL(blob)
    return await new Promise<THREE.Texture>((resolve, reject) => {
      const loader = new THREE.TextureLoader()
      loader.load(
        objectUrl,
        (tex) => {
          URL.revokeObjectURL(objectUrl)
          tex.wrapS = THREE.RepeatWrapping
          tex.wrapT = THREE.RepeatWrapping
          tex.colorSpace = colorSpace
            ? THREE.SRGBColorSpace
            : THREE.NoColorSpace
          tex.anisotropy = 8
          tex.needsUpdate = true
          resolve(tex)
        },
        undefined,
        (err) => {
          URL.revokeObjectURL(objectUrl)
          reject(err)
        },
      )
    })
  })()

  textureCache.set(key, pending)
  pending.catch(() => textureCache.delete(key))
  return pending
}

async function loadFirstTexture(
  urls: string[],
  colorSpace: boolean,
): Promise<{ tex: THREE.Texture; fromPreview: boolean }> {
  let lastErr: unknown
  for (let i = 0; i < urls.length; i++) {
    try {
      const tex = await loadTextureFromUrl(urls[i], colorSpace)
      return { tex, fromPreview: i === 0 }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error('No texture URL worked')
}

export interface LoadedPbrMaps {
  map: THREE.Texture
  normalMap?: THREE.Texture
  roughnessMap?: THREE.Texture
  metalnessMap?: THREE.Texture
  aoMap?: THREE.Texture
}

export async function loadPbrMaps(ref: MaterialRef): Promise<LoadedPbrMaps> {
  const urls = resolveMaps(ref.assetId)
  const { tex: colorSrc, fromPreview } = await loadFirstTexture(
    urls.colorCandidates,
    true,
  )
  const map = colorSrc.clone()
  map.needsUpdate = true

  // Extra maps only when real surface-preview color was found (thumbs aren't PBR).
  let normalMap: THREE.Texture | undefined
  let roughnessMap: THREE.Texture | undefined
  let metalnessMap: THREE.Texture | undefined
  let aoMap: THREE.Texture | undefined
  if (fromPreview) {
    const [normalSrc, roughnessSrc, metalnessSrc, aoSrc] = await Promise.all([
      urls.normal
        ? loadTextureFromUrl(urls.normal, false).catch(() => undefined)
        : Promise.resolve(undefined),
      urls.roughness
        ? loadTextureFromUrl(urls.roughness, false).catch(() => undefined)
        : Promise.resolve(undefined),
      urls.metalness
        ? loadTextureFromUrl(urls.metalness, false).catch(() => undefined)
        : Promise.resolve(undefined),
      urls.ao
        ? loadTextureFromUrl(urls.ao, false).catch(() => undefined)
        : Promise.resolve(undefined),
    ])
    normalMap = normalSrc?.clone()
    roughnessMap = roughnessSrc?.clone()
    metalnessMap = metalnessSrc?.clone()
    aoMap = aoSrc?.clone()
    if (normalMap) normalMap.needsUpdate = true
    if (roughnessMap) roughnessMap.needsUpdate = true
    if (metalnessMap) metalnessMap.needsUpdate = true
    if (aoMap) aoMap.needsUpdate = true
  }

  const maps: LoadedPbrMaps = {
    map,
    normalMap,
    roughnessMap,
    metalnessMap,
    aoMap,
  }
  applyTileRepeat(maps, ref.tileSizeM)
  return maps
}

/**
 * Apply tile size. For meter-based UVs use uScale=vScale=1.
 * For 0–1 mesh UVs pass world width/height in meters as uScale/vScale.
 */
export function applyTileRepeat(
  maps: LoadedPbrMaps,
  tileSizeM: number,
  uScale = 1,
  vScale = 1,
) {
  const sx = uScale / Math.max(0.05, tileSizeM)
  const sy = vScale / Math.max(0.05, tileSizeM)
  for (const t of [
    maps.map,
    maps.normalMap,
    maps.roughnessMap,
    maps.metalnessMap,
    maps.aoMap,
  ]) {
    if (!t) continue
    t.repeat.set(sx, sy)
    t.needsUpdate = true
  }
}
