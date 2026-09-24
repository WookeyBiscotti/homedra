/** Stable-key GLB asset cache in IndexedDB (shared DB with local models). */

import type { ModelAttribution, ModelRef } from '../engine/types'
import { openModelsDb, idbReq } from './idb'
import type { CollectionSource } from './collectionTypes'

const STORE = 'assets'

export interface CachedAsset {
  cacheKey: string
  blob: Blob
  contentType: string
  fetchedAt: number
  source: CollectionSource
}

export function cacheKeyForModelRef(ref: ModelRef): string | null {
  switch (ref.source) {
    case 'catalog':
      return `catalog:${ref.assetId}`
    case 'nasa':
      return `nasa:${ref.assetId}`
    case 'local':
      return `local:${ref.localId}`
    case 'library':
      return `library:${ref.library}:${ref.id}`
    case 'url':
      return urlCacheKey(ref.url)
  }
}

export function urlCacheKey(url: string): string {
  // Short stable key without storing full URL as IDB key path issues
  let h = 2166136261
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `url:${(h >>> 0).toString(36)}`
}

export function cacheKeyForLibrary(
  library: string,
  id: string,
  variantId?: string,
): string {
  return variantId
    ? `library:${library}:${id}:${variantId}`
    : `library:${library}:${id}`
}

export function sourceFromModelRef(
  ref: ModelRef,
  attribution?: ModelAttribution,
): CollectionSource {
  switch (ref.source) {
    case 'catalog':
      return {
        kind: 'catalog',
        id: ref.assetId,
        attribution,
      }
    case 'nasa':
      return {
        kind: 'nasa',
        id: ref.assetId,
        attribution,
      }
    case 'local':
      return {
        kind: 'local',
        id: ref.localId,
        attribution,
      }
    case 'library':
      return {
        kind: 'library',
        library: ref.library,
        id: ref.id,
        url: ref.glbUrl,
        attribution,
      }
    case 'url':
      return {
        kind: 'url',
        url: ref.url,
        attribution: attribution ?? (ref.license
          ? { author: 'URL', license: ref.license }
          : undefined),
      }
  }
}

export function modelRefFromCacheKey(
  cacheKey: string,
  objectId?: string,
): ModelRef | null {
  if (cacheKey.startsWith('catalog:')) {
    return { source: 'catalog', assetId: cacheKey.slice(8), objectId }
  }
  if (cacheKey.startsWith('nasa:')) {
    return { source: 'nasa', assetId: cacheKey.slice(5), objectId }
  }
  if (cacheKey.startsWith('local:')) {
    return { source: 'local', localId: cacheKey.slice(6), objectId }
  }
  if (cacheKey.startsWith('library:')) {
    const rest = cacheKey.slice(8)
    const parts = rest.split(':')
    const library = parts[0] as
      | 'polyPizza'
      | 'smithsonian'
      | 'sketchfab'
      | 'polyHaven'
    const id = parts[1]
    if (!library || !id) return null
    return { source: 'library', library, id, objectId }
  }
  if (cacheKey.startsWith('url:')) {
    // URL keys are hashed — need source.url from collection item, not reconstructable
    return null
  }
  return null
}

export async function getCachedAsset(
  cacheKey: string,
): Promise<CachedAsset | undefined> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const row = await idbReq(tx.objectStore(STORE).get(cacheKey))
    return row as CachedAsset | undefined
  } finally {
    db.close()
  }
}

export async function putCachedAsset(rec: CachedAsset): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).put(rec))
  } finally {
    db.close()
  }
}

export async function deleteCachedAsset(cacheKey: string): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).delete(cacheKey))
  } finally {
    db.close()
  }
}

export async function listCachedAssets(): Promise<CachedAsset[]> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const rows = await idbReq(tx.objectStore(STORE).getAll())
    return rows as CachedAsset[]
  } finally {
    db.close()
  }
}
