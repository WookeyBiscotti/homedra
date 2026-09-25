/** Shared types and helpers for remote / local texture catalogs. */

import type { MaterialRef } from '../engine/types'
import { ambientcgThumbnailUrl, materialRefFromAsset, searchMaterials } from './ambientcg'
import { searchPexelsTextures } from './catalogs/pexels'
import { searchPixabayTextures } from './catalogs/pixabay'
import { searchPolyHavenTextures } from './catalogs/polyhavenTextures'
import { proxiedAssetUrl } from '../models/proxyUrl'
import type { LibraryTokenKey } from '../models/tokens'

export type TextureLibraryId = 'ambientcg' | 'polyhaven' | 'pixabay' | 'pexels'

export interface TextureHit {
  library: TextureLibraryId
  id: string
  title: string
  thumbnailUrl: string
  tileSizeM?: number
  /** Direct albedo URL for photo catalogs. */
  colorUrl?: string
}

export interface TextureSearchOpts {
  token?: string
  limit?: number
  offset?: number
  page?: number
}

export interface TextureSearchResult {
  total: number
  assets: TextureHit[]
}

export interface TextureLibraryMeta {
  id: TextureLibraryId
  label: string
  requiresToken: boolean
  tokenKey?: LibraryTokenKey
  placeholder: string
  footer?: string
  defaultQuery?: string
}

export const TEXTURE_LIBRARIES: TextureLibraryMeta[] = [
  {
    id: 'ambientcg',
    label: 'ambientCG',
    requiresToken: false,
    placeholder: 'Поиск: wood, tiles, plaster…',
    footer: 'Каталог ambientCG (CC0).',
  },
  {
    id: 'polyhaven',
    label: 'Poly Haven',
    requiresToken: false,
    placeholder: 'Поиск: brick, wood, concrete…',
    footer: 'Powered by Poly Haven · CC0.',
  },
  {
    id: 'pixabay',
    label: 'Pixabay',
    requiresToken: true,
    tokenKey: 'pixabay',
    placeholder: 'Поиск фото-текстур…',
    footer: 'Pixabay · нужен бесплатный API-ключ.',
    defaultQuery: 'texture',
  },
  {
    id: 'pexels',
    label: 'Pexels',
    requiresToken: true,
    tokenKey: 'pexels',
    placeholder: 'Поиск фото-текстур…',
    footer: 'Pexels · нужен бесплатный API-ключ.',
    defaultQuery: 'texture',
  },
]

export function textureLibraryMeta(
  id: TextureLibraryId,
): TextureLibraryMeta {
  return TEXTURE_LIBRARIES.find((l) => l.id === id) ?? TEXTURE_LIBRARIES[0]!
}

export function materialRefFromHit(
  hit: TextureHit,
  tileSizeM?: number,
): MaterialRef {
  const tile = Math.max(0.2, tileSizeM ?? hit.tileSizeM ?? 1.5)
  if (hit.library === 'ambientcg') {
    return materialRefFromAsset(
      {
        id: hit.id,
        title: hit.title,
        thumbnailUrl: hit.thumbnailUrl,
        tileWidthM: hit.tileSizeM,
        maps: ['color'],
      },
      tile,
    )
  }
  return {
    source: hit.library,
    assetId: hit.id,
    tileSizeM: tile,
    url: hit.colorUrl,
    name: hit.title,
  }
}

export function materialThumbnailUrl(ref: MaterialRef): string | null {
  if (ref.source === 'custom') return null
  if (ref.source === 'ambientcg') return ambientcgThumbnailUrl(ref.assetId, 128)
  if (ref.source === 'polyhaven') {
    return proxiedAssetUrl(
      `https://cdn.polyhaven.com/asset_img/thumbs/${ref.assetId}.png?width=256`,
    )
  }
  if (ref.url) return proxiedAssetUrl(ref.url)
  return null
}

export async function searchTextureCatalog(
  library: TextureLibraryId,
  q: string,
  opts: TextureSearchOpts = {},
): Promise<TextureSearchResult> {
  if (library === 'ambientcg') {
    const r = await searchMaterials(q, {
      limit: opts.limit,
      offset: opts.offset,
    })
    return {
      total: r.total,
      assets: r.assets.map((a) => ({
        library: 'ambientcg',
        id: a.id,
        title: a.title,
        thumbnailUrl: a.thumbnailUrl,
        tileSizeM: a.tileWidthM ?? a.tileHeightM,
      })),
    }
  }
  if (library === 'polyhaven') return searchPolyHavenTextures(q, opts)
  if (library === 'pixabay') return searchPixabayTextures(q, opts)
  return searchPexelsTextures(q, opts)
}

export function tabForMaterial(
  ref: MaterialRef | null | undefined,
): TextureLibraryId | 'custom' {
  if (!ref) return 'ambientcg'
  if (ref.source === 'custom') return 'custom'
  if (
    ref.source === 'polyhaven' ||
    ref.source === 'pixabay' ||
    ref.source === 'pexels'
  ) {
    return ref.source
  }
  return 'ambientcg'
}
