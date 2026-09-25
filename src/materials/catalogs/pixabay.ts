/** Pixabay photo textures — free API key (BYOK). */

import { proxiedAssetUrl } from '../../models/proxyUrl'
import type { TextureHit, TextureSearchOpts, TextureSearchResult } from '../textureCatalog'

const API = 'https://pixabay.com/api/'

type PxHit = {
  id?: number
  tags?: string
  previewURL?: string
  webformatURL?: string
  largeImageURL?: string
  user?: string
}

export async function searchPixabayTextures(
  q: string,
  opts: TextureSearchOpts = {},
): Promise<TextureSearchResult> {
  const key = opts.token?.trim()
  if (!key) throw new Error('Нужен ключ Pixabay')
  const query = q.trim() || 'texture'
  const limit = Math.min(40, Math.max(1, opts.limit ?? 20))
  const page = Math.max(1, opts.page ?? 1)
  const params = new URLSearchParams({
    key,
    q: query,
    image_type: 'photo',
    safesearch: 'true',
    per_page: String(limit),
    page: String(page),
  })
  const res = await fetch(proxiedAssetUrl(`${API}?${params}`))
  if (!res.ok) throw new Error(`Pixabay: ${res.status}`)
  const data = (await res.json()) as {
    totalHits?: number
    hits?: PxHit[]
  }
  const assets: TextureHit[] = (data.hits ?? [])
    .filter((h) => h.id != null && (h.webformatURL || h.largeImageURL))
    .map((h) => {
      const color = h.webformatURL ?? h.largeImageURL ?? ''
      const thumb = h.previewURL ?? color
      return {
        library: 'pixabay' as const,
        id: String(h.id),
        title: (h.tags ?? 'Pixabay').split(',')[0]?.trim() || `Pixabay ${h.id}`,
        thumbnailUrl: proxiedAssetUrl(thumb),
        colorUrl: color,
        tileSizeM: 2,
      }
    })
  return { total: data.totalHits ?? assets.length, assets }
}
