import type { ModelRef } from '../engine/types'
import {
  cacheKeyForModelRef,
  getCachedAsset,
  putCachedAsset,
  sourceFromModelRef,
} from './assetCache'
import { getCatalogAsset } from './catalog'
import { getNasaAsset } from './nasaCatalog'
import { getLocalModel } from './localStore'
import { adapters } from './adapters'
import { getLibraryToken } from './tokens'
import { proxiedAssetUrl } from './proxyUrl'
import type { ResolveResult } from './types'
import { isGlbBuffer, MAX_BYTES } from './glbMagic'

async function tryServeFromCache(
  cacheKey: string,
): Promise<ResolveResult | null> {
  const hit = await getCachedAsset(cacheKey)
  if (!hit) return null
  return {
    url: URL.createObjectURL(hit.blob),
    revokeOnDispose: true,
    attribution: hit.source.attribution,
  }
}

async function fetchAndCacheGlb(
  cacheKey: string,
  fetchUrl: string,
  ref: ModelRef,
  attribution?: ResolveResult['attribution'],
): Promise<ResolveResult | null> {
  try {
    const res = await fetch(fetchUrl)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES || !isGlbBuffer(buf)) return null
    const blob = new Blob([buf], { type: 'model/gltf-binary' })
    await putCachedAsset({
      cacheKey,
      blob,
      contentType: 'model/gltf-binary',
      fetchedAt: Date.now(),
      source: sourceFromModelRef(ref, attribution),
    })
    return {
      url: URL.createObjectURL(blob),
      revokeOnDispose: true,
      attribution,
    }
  } catch {
    return null
  }
}

/**
 * Resolve a ModelRef to a loadable URL for GLTFLoader / useGLTF.
 * Prefers IndexedDB asset cache; on miss downloads and caches GLB when possible.
 */
export async function resolveModelRef(ref: ModelRef): Promise<ResolveResult> {
  const cacheKey = cacheKeyForModelRef(ref)

  if (cacheKey && ref.source !== 'local') {
    const cached = await tryServeFromCache(cacheKey)
    if (cached) return cached
  }

  switch (ref.source) {
    case 'catalog': {
      const asset = await getCatalogAsset(ref.assetId)
      if (!asset) throw new Error(`Каталог: ${ref.assetId} не найден`)
      const attribution = {
        author: asset.author ?? 'Catalog',
        license: asset.license,
      }
      const key = cacheKey ?? `catalog:${ref.assetId}`
      const proxied = proxiedAssetUrl(asset.glbUrl)
      const stored = await fetchAndCacheGlb(key, proxied, ref, attribution)
      if (stored) return stored
      return { url: proxied, attribution }
    }
    case 'nasa': {
      const asset = await getNasaAsset(ref.assetId)
      if (!asset) throw new Error(`NASA: ${ref.assetId} не найден`)
      const attribution = {
        author: 'NASA',
        license: asset.license,
        url: 'https://science.nasa.gov/3d-resources/',
      }
      const key = cacheKey ?? `nasa:${ref.assetId}`
      const proxied = proxiedAssetUrl(asset.glbUrl)
      const stored = await fetchAndCacheGlb(key, proxied, ref, attribution)
      if (stored) return stored
      return { url: proxied, attribution }
    }
    case 'local': {
      const rec = await getLocalModel(ref.localId)
      if (!rec) throw new Error('Локальная модель не найдена')
      // Also check assets store for local-keyed cache
      if (cacheKey) {
        const cached = await tryServeFromCache(cacheKey)
        if (cached) return cached
      }
      return {
        url: URL.createObjectURL(rec.blob),
        revokeOnDispose: true,
        attribution: rec.attribution,
      }
    }
    case 'url': {
      const key = cacheKey
      const proxied = proxiedAssetUrl(ref.url)
      const attribution = ref.license
        ? { author: 'URL', license: ref.license }
        : undefined
      if (key) {
        const stored = await fetchAndCacheGlb(key, proxied, ref, attribution)
        if (stored) return stored
      }
      return { url: proxied, attribution }
    }
    case 'library': {
      if (cacheKey) {
        const cached = await tryServeFromCache(cacheKey)
        if (cached) return cached
      }

      const adapter = adapters[ref.library]
      const tokenKey =
        ref.library === 'polyPizza'
          ? 'polyPizza'
          : ref.library === 'smithsonian'
            ? 'smithsonian'
            : ref.library === 'sketchfab'
              ? 'sketchfab'
              : undefined
      const token = tokenKey ? getLibraryToken(tokenKey) : undefined
      const resolved = await adapter.resolveGlb(
        {
          library: ref.library,
          id: ref.id,
          title: ref.id,
          license: 'Unknown',
          glbUrl: undefined,
        },
        { token },
      )

      // Prefer stable CDN hint when present (not Sketchfab / blob)
      const hintUrl =
        ref.library !== 'sketchfab' &&
        ref.glbUrl &&
        !ref.glbUrl.startsWith('blob:') &&
        !ref.glbUrl.startsWith('data:')
          ? proxiedAssetUrl(ref.glbUrl)
          : undefined

      const fetchUrl = resolved.revokeOnDispose
        ? resolved.url
        : hintUrl ?? proxiedAssetUrl(resolved.url)

      if (cacheKey) {
        try {
          // blob: URLs from adapters — fetch into cache by key
          const res = await fetch(fetchUrl)
          if (res.ok) {
            const buf = await res.arrayBuffer()
            if (buf.byteLength <= MAX_BYTES && isGlbBuffer(buf)) {
              const blob = new Blob([buf], { type: 'model/gltf-binary' })
              await putCachedAsset({
                cacheKey,
                blob,
                contentType: 'model/gltf-binary',
                fetchedAt: Date.now(),
                source: sourceFromModelRef(ref, resolved.attribution),
              })
              if (resolved.revokeOnDispose) URL.revokeObjectURL(resolved.url)
              return {
                url: URL.createObjectURL(blob),
                revokeOnDispose: true,
                attribution: resolved.attribution,
              }
            }
          }
        } catch {
          /* fall through to network URL */
        }
      }

      return {
        ...resolved,
        url: resolved.revokeOnDispose
          ? resolved.url
          : proxiedAssetUrl(resolved.url),
      }
    }
  }
}
