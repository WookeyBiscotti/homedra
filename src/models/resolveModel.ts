import type { ModelRef } from '../engine/types'
import { getCatalogAsset } from './catalog'
import { getNasaAsset } from './nasaCatalog'
import { getLocalModel } from './localStore'
import { adapters } from './adapters'
import { getLibraryToken } from './tokens'
import { proxiedAssetUrl } from './proxyUrl'
import type { ResolveResult } from './types'

/**
 * Resolve a ModelRef to a loadable URL for GLTFLoader / useGLTF.
 */
export async function resolveModelRef(ref: ModelRef): Promise<ResolveResult> {
  switch (ref.source) {
    case 'catalog': {
      const asset = await getCatalogAsset(ref.assetId)
      if (!asset) throw new Error(`Каталог: ${ref.assetId} не найден`)
      return {
        url: proxiedAssetUrl(asset.glbUrl),
        attribution: {
          author: asset.author ?? 'Catalog',
          license: asset.license,
        },
      }
    }
    case 'nasa': {
      const asset = await getNasaAsset(ref.assetId)
      if (!asset) throw new Error(`NASA: ${ref.assetId} не найден`)
      return {
        url: proxiedAssetUrl(asset.glbUrl),
        attribution: {
          author: 'NASA',
          license: asset.license,
          url: 'https://science.nasa.gov/3d-resources/',
        },
      }
    }
    case 'local': {
      const rec = await getLocalModel(ref.localId)
      if (!rec) throw new Error('Локальная модель не найдена')
      return {
        url: URL.createObjectURL(rec.blob),
        revokeOnDispose: true,
        attribution: rec.attribution,
      }
    }
    case 'url':
      return {
        url: proxiedAssetUrl(ref.url),
        attribution: ref.license
          ? { author: 'URL', license: ref.license }
          : undefined,
      }
    case 'library': {
      // blob: and Sketchfab signed S3 URLs must not be reused — re-resolve.
      const cached =
        ref.library !== 'sketchfab' &&
        ref.glbUrl &&
        !ref.glbUrl.startsWith('blob:') &&
        !ref.glbUrl.startsWith('data:')
          ? ref.glbUrl
          : undefined
      if (cached) {
        return {
          url: proxiedAssetUrl(cached),
          attribution: undefined,
        }
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
      return {
        ...resolved,
        url: proxiedAssetUrl(resolved.url),
      }
    }
  }
}
