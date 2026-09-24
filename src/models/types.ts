import type { ModelAttribution, ModelRef } from '../engine/types'

export type LibraryId =
  | 'catalog'
  | 'nasa'
  | 'met'
  | 'polyPizza'
  | 'smithsonian'
  | 'sketchfab'
  | 'polyHaven'
  | 'local'

/** One downloadable / placable model inside a multi-file library asset. */
export interface ModelVariant {
  id: string
  label: string
  glbUrl: string
}

export interface ModelHit {
  library: LibraryId
  id: string
  title: string
  thumbUrl?: string
  license: string
  author?: string
  /** Direct or hint URL for GLB when known. */
  glbUrl?: string
  /** When the asset ships several models, list them for picker UI. */
  variants?: ModelVariant[]
  url?: string
}

export interface ResolveResult {
  url: string
  attribution?: ModelAttribution
  /** Caller must revokeObjectURL when done if true. */
  revokeOnDispose?: boolean
}

export interface SearchOpts {
  token?: string
  /** Opaque cursor from a previous response (Poly Pizza / Sketchfab). */
  cursor?: string
  /** 1-based page for offset-based sources. */
  page?: number
  limit?: number
}

export interface SearchResult {
  hits: ModelHit[]
  /** Total matching items when known (offset sources). */
  total?: number
  nextCursor?: string
}

export interface LibraryAdapter {
  id: LibraryId
  label: string
  requiresToken: boolean
  search(q: string, opts: SearchOpts): Promise<SearchResult>
  resolveGlb(
    hit: ModelHit,
    opts: { token?: string },
  ): Promise<ResolveResult>
}

export function hitToModelRef(hit: ModelHit): ModelRef {
  switch (hit.library) {
    case 'catalog':
      return { source: 'catalog', assetId: hit.id }
    case 'nasa':
      return { source: 'nasa', assetId: hit.id }
    case 'met':
      if (!hit.glbUrl) {
        // Browse-only until user uploads; still allow pick to fail later
        return { source: 'url', url: '', license: hit.license }
      }
      return {
        source: 'url',
        url: hit.glbUrl,
        license: hit.license,
      }
    case 'local':
      return { source: 'local', localId: hit.id }
    case 'polyPizza':
    case 'smithsonian':
    case 'sketchfab':
    case 'polyHaven':
      return {
        source: 'library',
        library: hit.library,
        id: hit.id,
        glbUrl: hit.glbUrl,
      }
  }
}

export function hitAttribution(hit: ModelHit): ModelAttribution | undefined {
  if (!hit.author && !hit.license) return undefined
  return {
    author: hit.author ?? hit.library,
    license: hit.license,
    url: hit.url,
  }
}
