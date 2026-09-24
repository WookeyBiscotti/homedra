import type { ModelHit, SearchOpts, SearchResult } from './types'
import { paginateHits } from './catalog'
import { proxiedAssetUrl } from './proxyUrl'

export interface NasaAsset {
  id: string
  title: string
  path: string
  license: string
  glbUrl: string
  thumbnailUrl?: string
}

type NasaCatalogFile = {
  source?: string
  mirror?: string
  licenseNote?: string
  assets: Array<{
    id: string
    title: string
    path: string
    license: string
  }>
}

const CATALOG_URL = '/nasa-catalog.json'
const GITHUB_RAW =
  'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/'

let catalogPromise: Promise<{ assets: NasaAsset[]; note?: string }> | null =
  null

function encodePath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

function loadNasaCatalog(): Promise<{ assets: NasaAsset[]; note?: string }> {
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`NASA catalog failed (${res.status})`)
        const data = (await res.json()) as NasaCatalogFile
        const assets = (data.assets ?? []).map((a) => {
          const remote = `${GITHUB_RAW}${encodePath(a.path)}`
          return {
            id: a.id,
            title: a.title,
            path: a.path,
            license: a.license,
            glbUrl: proxiedAssetUrl(remote),
            thumbnailUrl: `/models/nasa-thumbs/${a.id}.svg`,
          }
        })
        return { assets, note: data.licenseNote }
      })
      .catch((err) => {
        catalogPromise = null
        throw err
      })
  }
  return catalogPromise
}

export async function getNasaAsset(id: string): Promise<NasaAsset | undefined> {
  const { assets } = await loadNasaCatalog()
  return assets.find((a) => a.id === id)
}

export async function searchNasa(
  q: string,
  opts: SearchOpts = {},
): Promise<SearchResult> {
  const { assets } = await loadNasaCatalog()
  const needle = q.trim().toLowerCase()
  const filtered = needle
    ? assets.filter(
        (a) =>
          a.title.toLowerCase().includes(needle) ||
          a.id.toLowerCase().includes(needle),
      )
    : assets
  const all: ModelHit[] = filtered.map((a) => ({
    library: 'nasa',
    id: a.id,
    title: a.title,
    thumbUrl: a.thumbnailUrl,
    license: a.license,
    author: 'NASA',
    glbUrl: a.glbUrl,
    url: 'https://science.nasa.gov/3d-resources/',
  }))
  return paginateHits(all, opts)
}
