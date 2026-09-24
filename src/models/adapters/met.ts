import { publicUrl } from '../../publicUrl'
import { paginateHits } from '../catalog'
import type { LibraryAdapter, ModelHit, SearchResult } from '../types'

/**
 * Met Museum — offline catalog mirror (no stable public 3D download API).
 */
type MetAsset = {
  id: string
  title: string
  objectUrl?: string
  license: string
  glbUrl?: string
}

type MetFile = { assets: MetAsset[] }

let catalogPromise: Promise<MetAsset[]> | null = null

function loadMet(): Promise<MetAsset[]> {
  if (!catalogPromise) {
    catalogPromise = fetch(publicUrl('met-catalog.json'))
      .then(async (res) => {
        if (!res.ok) throw new Error(`Met catalog (${res.status})`)
        const data = (await res.json()) as MetFile
        return data.assets ?? []
      })
      .catch((err) => {
        catalogPromise = null
        throw err
      })
  }
  return catalogPromise
}

export const metAdapter: LibraryAdapter = {
  id: 'met',
  label: 'Met Museum',
  requiresToken: false,
  async search(q, opts): Promise<SearchResult> {
    const assets = await loadMet()
    const needle = q.trim().toLowerCase()
    const filtered = needle
      ? assets.filter(
          (a) =>
            a.title.toLowerCase().includes(needle) || a.id.includes(needle),
        )
      : assets
    const all: ModelHit[] = filtered.map((a) => ({
      library: 'met',
      id: a.id,
      title: a.title,
      license: a.license,
      author: 'The Met',
      glbUrl: a.glbUrl || undefined,
      url: a.objectUrl,
    }))
    return paginateHits(all, opts)
  },
  async resolveGlb(hit) {
    if (!hit.glbUrl) {
      throw new Error(
        'У записи Met нет прямого GLB — откройте страницу объекта или загрузите файл во вкладке «Мои модели»',
      )
    }
    return {
      url: hit.glbUrl,
      attribution: {
        author: 'The Met',
        license: hit.license,
        url: hit.url,
      },
    }
  },
}
