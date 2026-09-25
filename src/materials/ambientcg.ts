import type { MaterialRef } from '../engine/types'
import { fetchTextureBlob, getLocalTexture } from './customTextures'
import { resolvePolyHavenMaps } from './catalogs/polyhavenTextures'
import { ensureDisplacementMap } from './heightFromNormal'
import { proxiedAssetUrl, proxiedTextureUrl } from '../models/proxyUrl'
import { publicUrl } from '../publicUrl'
import * as THREE from 'three'

/**
 * ambientCG's JSON API does not send CORS headers, so the browser cannot
 * call it directly. We ship a same-origin catalog and load maps from their
 * Backblaze CDN (which does allow CORS).
 */
const CATALOG_URL = publicUrl('ambientcg-catalog.json')
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
  displacement?: string
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
    maps: ['color', 'normal', 'roughness', 'metalness', 'ao', 'displacement'],
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
    displacement: `${base}_Displacement.jpg`,
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

function textureFromBlob(
  blob: Blob,
  colorSpace: boolean,
): Promise<THREE.Texture> {
  const objectUrl = URL.createObjectURL(blob)
  return new Promise<THREE.Texture>((resolve, reject) => {
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
}

function loadTextureFromUrl(url: string, colorSpace: boolean): Promise<THREE.Texture> {
  const key = `${colorSpace ? 'c' : 'd'}:${url}`
  let pending = textureCache.get(key)
  if (pending) return pending

  pending = (async () => {
    const blob = await fetchCachedBlob(url)
    if (blob.size < 100) throw new Error(`Empty texture ${url}`)
    return await textureFromBlob(blob, colorSpace)
  })()

  textureCache.set(key, pending)
  pending.catch(() => textureCache.delete(key))
  return pending
}

async function loadCustomMaps(ref: MaterialRef): Promise<LoadedPbrMaps> {
  const rec = await getLocalTexture(ref.assetId)
  let blob = rec?.blob
  if (!blob && ref.url) {
    blob = await fetchTextureBlob(ref.url)
  }
  if (!blob) {
    throw new Error(`Custom texture ${ref.assetId} not found`)
  }
  const map = await textureFromBlob(blob, true)
  const maps: LoadedPbrMaps = { map }
  applyTileRepeat(maps, ref.tileSizeM)
  return maps
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

/** Meters of vertex offset when the displacement map is 1. */
export const DEFAULT_DISPLACEMENT_SCALE = 0.025

export interface LoadedPbrMaps {
  map: THREE.Texture
  normalMap?: THREE.Texture
  roughnessMap?: THREE.Texture
  metalnessMap?: THREE.Texture
  aoMap?: THREE.Texture
  displacementMap?: THREE.Texture
}

async function loadUrlMaps(ref: MaterialRef): Promise<LoadedPbrMaps> {
  if (!ref.url) throw new Error(`Нет URL текстуры ${ref.assetId}`)
  const candidates = [...new Set([proxiedAssetUrl(ref.url), proxiedTextureUrl(ref.url)])]
  let lastErr: unknown
  for (const url of candidates) {
    try {
      const map = await loadTextureFromUrl(url, true)
      const maps: LoadedPbrMaps = { map }
      applyTileRepeat(maps, ref.tileSizeM)
      return maps
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error(`Не удалось загрузить ${ref.url}`)
}

async function loadPolyHavenPbr(ref: MaterialRef): Promise<LoadedPbrMaps> {
  const urls = await resolvePolyHavenMaps(ref.assetId)
  const map = await loadTextureFromUrl(proxiedAssetUrl(urls.color), true)
  const [normalMap, roughnessMap, metalnessMap, aoMap, displacementMap] =
    await Promise.all([
      urls.normal
        ? loadTextureFromUrl(proxiedAssetUrl(urls.normal), false).catch(
            () => undefined,
          )
        : undefined,
      urls.roughness
        ? loadTextureFromUrl(proxiedAssetUrl(urls.roughness), false).catch(
            () => undefined,
          )
        : undefined,
      urls.metalness
        ? loadTextureFromUrl(proxiedAssetUrl(urls.metalness), false).catch(
            () => undefined,
          )
        : undefined,
      urls.ao
        ? loadTextureFromUrl(proxiedAssetUrl(urls.ao), false).catch(() => undefined)
        : undefined,
      urls.displacement
        ? loadTextureFromUrl(proxiedAssetUrl(urls.displacement), false).catch(
            () => undefined,
          )
        : undefined,
    ])
  const maps: LoadedPbrMaps = {
    map,
    normalMap,
    roughnessMap,
    metalnessMap,
    aoMap,
    displacementMap,
  }
  ensureDisplacementMap(maps)
  applyTileRepeat(maps, ref.tileSizeM)
  return maps
}

export async function loadPbrMaps(ref: MaterialRef): Promise<LoadedPbrMaps> {
  if (ref.source === 'custom') return loadCustomMaps(ref)
  if (ref.source === 'polyhaven') return loadPolyHavenPbr(ref)
  if (ref.source === 'pixabay' || ref.source === 'pexels') return loadUrlMaps(ref)
  const urls = resolveMaps(ref.assetId)
  const { tex: colorSrc } = await loadFirstTexture(
    urls.colorCandidates,
    true,
  )
  const map = colorSrc.clone()
  map.needsUpdate = true

  const [normalSrc, roughnessSrc, metalnessSrc, aoSrc, displacementSrc] =
    await Promise.all([
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
      urls.displacement
        ? loadTextureFromUrl(urls.displacement, false).catch(() => undefined)
        : Promise.resolve(undefined),
    ])
  const cloneMap = (src: THREE.Texture | undefined) => {
    if (!src) return undefined
    const tex = src.clone()
    tex.needsUpdate = true
    return tex
  }
  const normalMap = cloneMap(normalSrc)
  const roughnessMap = cloneMap(roughnessSrc)
  const metalnessMap = cloneMap(metalnessSrc)
  const aoMap = cloneMap(aoSrc)
  const displacementMap = cloneMap(displacementSrc)

  const maps: LoadedPbrMaps = {
    map,
    normalMap,
    roughnessMap,
    metalnessMap,
    aoMap,
    displacementMap,
  }
  ensureDisplacementMap(maps)
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
    maps.displacementMap,
  ]) {
    if (!t) continue
    t.repeat.set(sx, sy)
    t.needsUpdate = true
  }
}
