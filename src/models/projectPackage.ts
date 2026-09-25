/** Project package v2: building + asset cache + collection items used. */

import type { Building, ModelRef } from '../engine/types'
import {
  cacheKeyForModelRef,
  getCachedAsset,
  putCachedAsset,
  type CachedAsset,
} from './assetCache'
import {
  getItem,
  listItems,
  putItems,
  type CollectionItem,
  type CollectionItemJson,
  type CollectionSource,
} from './collection'
import { base64ToBlob, blobToBase64 } from './blobBase64'
import { getLocalModel } from './localStore'
import { PROFILE_KIND } from './profilePackage'

export type PackagedAsset = {
  contentType: string
  dataBase64: string
  source: CollectionSource
}

export type ProjectPackageV2 = {
  version: 2
  building: Building
  assets: Record<string, PackagedAsset>
  collectionItems: CollectionItemJson[]
}

function collectModelRefs(building: Building): ModelRef[] {
  const refs: ModelRef[] = []
  for (const floor of building.floors) {
    for (const obj of floor.objects ?? []) {
      refs.push(obj.model)
    }
  }
  return refs
}

async function resolveBlobForKey(
  cacheKey: string,
  ref: ModelRef,
): Promise<{ blob: Blob; contentType: string; source: CollectionSource } | null> {
  const cached = await getCachedAsset(cacheKey)
  if (cached) {
    return {
      blob: cached.blob,
      contentType: cached.contentType,
      source: cached.source,
    }
  }
  if (ref.source === 'local') {
    const local = await getLocalModel(ref.localId)
    if (local) {
      return {
        blob: local.blob,
        contentType: 'model/gltf-binary',
        source: {
          kind: 'local',
          id: ref.localId,
          attribution: local.attribution,
        },
      }
    }
  }
  return null
}

export async function buildProjectPackage(
  building: Building,
): Promise<ProjectPackageV2> {
  const assets: Record<string, PackagedAsset> = {}
  const itemIds = new Set<string>()
  const allItems = await listItems()

  for (const ref of collectModelRefs(building)) {
    const key = cacheKeyForModelRef(ref)
    if (!key || assets[key]) continue
    const resolved = await resolveBlobForKey(key, ref)
    if (resolved) {
      assets[key] = {
        contentType: resolved.contentType,
        dataBase64: await blobToBase64(resolved.blob),
        source: resolved.source,
      }
    }
    for (const item of allItems) {
      if (item.cacheKey === key) itemIds.add(item.id)
    }
  }

  const collectionItems: CollectionItemJson[] = []
  for (const id of itemIds) {
    const item = await getItem(id)
    if (!item) continue
    const { thumbBlob, ...rest } = item
    const json: CollectionItemJson = { ...rest }
    if (thumbBlob) {
      json.thumbBase64 = await blobToBase64(thumbBlob)
    }
    collectionItems.push(json)
  }

  return {
    version: 2,
    building,
    assets,
    collectionItems,
  }
}

export async function applyProjectPackage(
  pkg: ProjectPackageV2,
): Promise<void> {
  for (const [cacheKey, asset] of Object.entries(pkg.assets)) {
    const blob = base64ToBlob(asset.dataBase64, asset.contentType)
    const rec: CachedAsset = {
      cacheKey,
      blob,
      contentType: asset.contentType,
      fetchedAt: Date.now(),
      source: asset.source,
    }
    await putCachedAsset(rec)
  }

  const items: CollectionItem[] = pkg.collectionItems.map((j) => {
    const { thumbBase64, ...rest } = j
    const item: CollectionItem = { ...rest }
    if (thumbBase64) {
      item.thumbBlob = base64ToBlob(thumbBase64, 'image/webp')
    }
    return item
  })
  await putItems(items)
}

export function parseImportJson(json: string): {
  building: Building
  package?: ProjectPackageV2
} {
  const data = JSON.parse(json) as Building | ProjectPackageV2
  if (
    data &&
    typeof data === 'object' &&
    'kind' in data &&
    (data as { kind?: unknown }).kind === PROFILE_KIND
  ) {
    throw new Error('Это файл профиля — откройте Профиль и нажмите «Импорт»')
  }
  if (
    data &&
    typeof data === 'object' &&
    'version' in data &&
    (data as ProjectPackageV2).version === 2 &&
    'building' in data
  ) {
    const pkg = data as ProjectPackageV2
    return { building: pkg.building, package: pkg }
  }
  return { building: data as Building }
}
