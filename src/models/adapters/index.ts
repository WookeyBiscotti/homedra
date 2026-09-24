import { searchCatalog, paginateHits } from '../catalog'
import { searchNasa } from '../nasaCatalog'
import { listLocalModels, getLocalModel } from '../localStore'
import type { LibraryAdapter, LibraryId, ModelHit } from '../types'
import { metAdapter } from './met'
import { polyHavenAdapter } from './polyHaven'
import { polyPizzaAdapter } from './polyPizza'
import { sketchfabAdapter } from './sketchfab'
import { smithsonianAdapter } from './smithsonian'

const catalogAdapter: LibraryAdapter = {
  id: 'catalog',
  label: 'Каталог',
  requiresToken: false,
  search: (q, opts) => searchCatalog(q, opts),
  async resolveGlb(hit) {
    if (!hit.glbUrl) throw new Error('Нет URL в каталоге')
    return {
      url: hit.glbUrl,
      attribution: {
        author: hit.author ?? 'Catalog',
        license: hit.license,
      },
    }
  },
}

const nasaAdapter: LibraryAdapter = {
  id: 'nasa',
  label: 'NASA',
  requiresToken: false,
  search: (q, opts) => searchNasa(q, opts),
  async resolveGlb(hit) {
    if (!hit.glbUrl) throw new Error('Нет URL NASA')
    return {
      url: hit.glbUrl,
      attribution: {
        author: 'NASA',
        license: hit.license,
        url: hit.url,
      },
    }
  },
}

const localAdapter: LibraryAdapter = {
  id: 'local',
  label: 'Мои модели',
  requiresToken: false,
  async search(q, opts) {
    const rows = await listLocalModels()
    const needle = q.trim().toLowerCase()
    const filtered = needle
      ? rows.filter((r) => r.name.toLowerCase().includes(needle))
      : rows
    const all: ModelHit[] = filtered.map((r) => ({
      library: 'local',
      id: r.id,
      title: r.name,
      thumbUrl: r.thumbBlob ? URL.createObjectURL(r.thumbBlob) : undefined,
      license: r.attribution?.license ?? 'Private',
      author: r.attribution?.author,
    }))
    return paginateHits(all, opts)
  },
  async resolveGlb(hit) {
    const rec = await getLocalModel(hit.id)
    if (!rec) throw new Error('Локальная модель не найдена')
    const url = URL.createObjectURL(rec.blob)
    return {
      url,
      revokeOnDispose: true,
      attribution: rec.attribution,
    }
  },
}

export const adapters: Record<LibraryId, LibraryAdapter> = {
  catalog: catalogAdapter,
  nasa: nasaAdapter,
  met: metAdapter,
  polyPizza: polyPizzaAdapter,
  smithsonian: smithsonianAdapter,
  sketchfab: sketchfabAdapter,
  polyHaven: polyHavenAdapter,
  local: localAdapter,
}

export const BROWSER_TABS: LibraryId[] = [
  'catalog',
  'nasa',
  'met',
  'polyPizza',
  'smithsonian',
  'polyHaven',
  'sketchfab',
  'local',
]

export function adapterFor(id: LibraryId): LibraryAdapter {
  return adapters[id]
}
