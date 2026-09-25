/** Pexels photo textures — free API key (BYOK). */

import { proxiedAssetUrl } from '../../models/proxyUrl'
import type { TextureHit, TextureSearchOpts, TextureSearchResult } from '../textureCatalog'

const API = 'https://api.pexels.com/v1/search'

type PxPhoto = {
  id?: number
  alt?: string
  photographer?: string
  src?: {
    tiny?: string
    small?: string
    medium?: string
    large?: string
    original?: string
  }
}

export async function searchPexelsTextures(
  q: string,
  opts: TextureSearchOpts = {},
): Promise<TextureSearchResult> {
  const key = opts.token?.trim()
  if (!key) throw new Error('Нужен ключ Pexels')
  const query = q.trim() || 'texture'
  const limit = Math.min(40, Math.max(1, opts.limit ?? 20))
  const page = Math.max(1, opts.page ?? 1)
  const params = new URLSearchParams({
    query,
    per_page: String(limit),
    page: String(page),
  })
  const res = await fetch(proxiedAssetUrl(`${API}?${params}`), {
    headers: { Authorization: key },
  })
  if (!res.ok) throw new Error(`Pexels: ${res.status}`)
  const data = (await res.json()) as {
    total_results?: number
    photos?: PxPhoto[]
  }
  const assets: TextureHit[] = (data.photos ?? [])
    .filter((p) => p.id != null && (p.src?.large || p.src?.medium || p.src?.original))
    .map((p) => {
      const color = p.src?.large ?? p.src?.medium ?? p.src?.original ?? ''
      const thumb = p.src?.small ?? p.src?.tiny ?? color
      return {
        library: 'pexels' as const,
        id: String(p.id),
        title: p.alt?.trim() || p.photographer || `Pexels ${p.id}`,
        thumbnailUrl: proxiedAssetUrl(thumb),
        colorUrl: color,
        tileSizeM: 2,
      }
    })
  return { total: data.total_results ?? assets.length, assets }
}
