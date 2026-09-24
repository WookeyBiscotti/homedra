import { publicUrl } from '../publicUrl'
import type { ModelHit, SearchOpts, SearchResult } from './types'

export interface CatalogAsset {
  id: string
  title: string
  category?: string
  license: string
  author?: string
  glbUrl: string
  thumbnailUrl?: string
  bbox?: { x: number; y: number; z: number }
}

type CatalogFile = {
  source?: string
  count?: number
  assets: CatalogAsset[]
}

const CATALOG_URL = publicUrl('model-catalog.json')

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

export async function getCatalogAsset(
  id: string,
): Promise<CatalogAsset | undefined> {
  const assets = await loadCatalog()
  return assets.find((a) => a.id === id)
}

/** Shared offset pagination for in-memory / full-list sources. */
export function paginateHits(
  all: ModelHit[],
  opts: SearchOpts,
): SearchResult {
  const limit = opts.limit ?? 12
  const page = Math.max(1, opts.page ?? 1)
  const start = (page - 1) * limit
  const hits = all.slice(start, start + limit)
  const total = all.length
  const hasMore = start + hits.length < total
  return {
    hits,
    total,
    nextCursor: hasMore ? String(page + 1) : undefined,
  }
}

export async function searchCatalog(
  q: string,
  opts: SearchOpts = {},
): Promise<SearchResult> {
  const assets = await loadCatalog()
  const needle = q.trim().toLowerCase()
  const filtered = needle
    ? assets.filter(
        (a) =>
          a.title.toLowerCase().includes(needle) ||
          a.id.toLowerCase().includes(needle) ||
          (a.category ?? '').toLowerCase().includes(needle),
      )
    : assets
  const all: ModelHit[] = filtered.map((a) => ({
    library: 'catalog',
    id: a.id,
    title: a.title,
    thumbUrl: publicUrl(a.thumbnailUrl || `/models/fixtures/${a.id}.svg`),
    license: a.license,
    author: a.author,
    glbUrl: publicUrl(a.glbUrl),
  }))
  return paginateHits(all, opts)
}
