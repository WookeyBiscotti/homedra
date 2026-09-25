/** User texture collection: folders + saved catalog / custom materials. */

import type { MaterialRef } from '../engine/types'
import { createId } from '../engine/types'
import {
  idbReq,
  openModelsDb,
  STORE_TEX_FOLDERS,
  STORE_TEX_ITEMS,
} from '../models/idb'
import type { CollectionFolder } from '../models/collectionTypes'
import { proxiedTextureUrl } from '../models/proxyUrl'
import {
  addTextureFromFile,
  addTextureFromUrl,
  deleteLocalTexture,
  listLocalTextures,
  materialCacheKey,
  materialLabel,
  materialRefFromCustom,
  type LocalTextureRecord,
} from './customTextures'

export type TextureCollectionFolder = CollectionFolder

export type TextureCollectionItem = {
  id: string
  folderId: string | null
  name: string
  material: MaterialRef
  thumbBlob?: Blob
  createdAt: number
}

export type TextureCollectionItemJson = Omit<TextureCollectionItem, 'thumbBlob'> & {
  thumbBase64?: string
}

const listeners = new Set<() => void>()

export function subscribeTextureCollection(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function notifyTextureCollection(): void {
  for (const fn of listeners) fn()
}

export function createTextureFolderId(): string {
  return createId('tf')
}

export function createTextureItemId(): string {
  return createId('ti')
}

export function textureItemDedupeKey(
  folderId: string | null,
  material: MaterialRef,
): string {
  return `${folderId ?? ''}:${materialCacheKey(material)}`
}

export function findDuplicateTextureItem(
  items: TextureCollectionItem[],
  folderId: string | null,
  material: MaterialRef,
): TextureCollectionItem | undefined {
  const key = textureItemDedupeKey(folderId, material)
  return items.find((item) => textureItemDedupeKey(item.folderId, item.material) === key)
}

export function orphanLocalTextures(
  locals: LocalTextureRecord[],
  items: TextureCollectionItem[],
): LocalTextureRecord[] {
  const used = new Set(
    items
      .filter((item) => item.material.source === 'custom')
      .map((item) => item.material.assetId),
  )
  return locals.filter((rec) => !used.has(rec.id))
}

export function countTextureLibrary(
  items: ReadonlyArray<{ material: { source: string; assetId: string } }>,
  locals: ReadonlyArray<{ id: string }>,
): number {
  const used = new Set(
    items
      .filter((item) => item.material.source === 'custom')
      .map((item) => item.material.assetId),
  )
  return items.length + locals.filter((rec) => !used.has(rec.id)).length
}

export function itemFromLocalTexture(
  rec: LocalTextureRecord,
  folderId: string | null,
): TextureCollectionItem {
  return {
    id: createTextureItemId(),
    folderId,
    name: rec.name,
    material: materialRefFromCustom(rec),
    createdAt: rec.createdAt,
  }
}

export async function putTextureFolder(
  folder: TextureCollectionFolder,
): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TEX_FOLDERS, 'readwrite')
    await idbReq(tx.objectStore(STORE_TEX_FOLDERS).put(folder))
  } finally {
    db.close()
  }
  notifyTextureCollection()
}

export async function putTextureFolders(
  recs: TextureCollectionFolder[],
): Promise<void> {
  if (recs.length === 0) return
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TEX_FOLDERS, 'readwrite')
    const store = tx.objectStore(STORE_TEX_FOLDERS)
    for (const rec of recs) {
      await idbReq(store.put(rec))
    }
  } finally {
    db.close()
  }
  notifyTextureCollection()
}

export async function listTextureFolders(): Promise<TextureCollectionFolder[]> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TEX_FOLDERS, 'readonly')
    const rows = (await idbReq(
      tx.objectStore(STORE_TEX_FOLDERS).getAll(),
    )) as TextureCollectionFolder[]
    return rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  } finally {
    db.close()
  }
}

export async function deleteTextureFolder(id: string): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(
      [STORE_TEX_FOLDERS, STORE_TEX_ITEMS],
      'readwrite',
    )
    const folders = tx.objectStore(STORE_TEX_FOLDERS)
    const items = tx.objectStore(STORE_TEX_ITEMS)

    const allFolders = (await idbReq(
      folders.getAll(),
    )) as TextureCollectionFolder[]
    const deleted = allFolders.find((f) => f.id === id)
    const parentId = deleted?.parentId ?? null

    for (const folder of allFolders) {
      if (folder.parentId === id) {
        await idbReq(folders.put({ ...folder, parentId }))
      }
    }

    const allItems = (await idbReq(items.getAll())) as TextureCollectionItem[]
    for (const item of allItems) {
      if (item.folderId === id) {
        await idbReq(items.put({ ...item, folderId: parentId }))
      }
    }

    await idbReq(folders.delete(id))
  } finally {
    db.close()
  }
  notifyTextureCollection()
}

export async function putTextureItem(item: TextureCollectionItem): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TEX_ITEMS, 'readwrite')
    await idbReq(tx.objectStore(STORE_TEX_ITEMS).put(item))
  } finally {
    db.close()
  }
  notifyTextureCollection()
}

export async function putTextureItems(
  recs: TextureCollectionItem[],
): Promise<void> {
  if (recs.length === 0) return
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TEX_ITEMS, 'readwrite')
    const store = tx.objectStore(STORE_TEX_ITEMS)
    for (const rec of recs) {
      await idbReq(store.put(rec))
    }
  } finally {
    db.close()
  }
  notifyTextureCollection()
}

export async function getTextureItem(
  id: string,
): Promise<TextureCollectionItem | undefined> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TEX_ITEMS, 'readonly')
    return (await idbReq(tx.objectStore(STORE_TEX_ITEMS).get(id))) as
      | TextureCollectionItem
      | undefined
  } finally {
    db.close()
  }
}

export async function listTextureItems(
  folderId?: string | null,
): Promise<TextureCollectionItem[]> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TEX_ITEMS, 'readonly')
    const rows = (await idbReq(
      tx.objectStore(STORE_TEX_ITEMS).getAll(),
    )) as TextureCollectionItem[]
    const filtered =
      folderId === undefined
        ? rows
        : rows.filter((row) =>
            folderId === null ? row.folderId == null : row.folderId === folderId,
          )
    return filtered.sort((a, b) => b.createdAt - a.createdAt)
  } finally {
    db.close()
  }
}

export async function deleteTextureItem(id: string): Promise<void> {
  const item = await getTextureItem(id)
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TEX_ITEMS, 'readwrite')
    await idbReq(tx.objectStore(STORE_TEX_ITEMS).delete(id))
  } finally {
    db.close()
  }

  if (item?.material.source === 'custom') {
    const remaining = await listTextureItems()
    const stillUsed = remaining.some(
      (row) =>
        row.material.source === 'custom' &&
        row.material.assetId === item.material.assetId,
    )
    if (!stillUsed) await deleteLocalTexture(item.material.assetId)
  }
  notifyTextureCollection()
}

async function fetchThumbBlob(url: string): Promise<Blob | undefined> {
  const candidates = [url]
  const proxied = proxiedTextureUrl(url)
  if (proxied !== url) candidates.unshift(proxied)
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { mode: 'cors', credentials: 'omit' })
      if (!res.ok) continue
      const blob = await res.blob()
      if (blob.size < 32) continue
      if (blob.type && !blob.type.startsWith('image/')) continue
      return blob
    } catch {
      /* try next candidate */
    }
  }
  return undefined
}

export async function addMaterialToTextureCollection(
  material: MaterialRef,
  folderId: string | null,
  opts?: { name?: string; thumbUrl?: string; thumbBlob?: Blob },
): Promise<TextureCollectionItem> {
  const items = await listTextureItems()
  const dup = findDuplicateTextureItem(items, folderId, material)
  if (dup) return dup

  let thumbBlob = opts?.thumbBlob
  if (!thumbBlob && opts?.thumbUrl) {
    thumbBlob = await fetchThumbBlob(opts.thumbUrl)
  }

  const item: TextureCollectionItem = {
    id: createTextureItemId(),
    folderId,
    name: opts?.name ?? materialLabel(material),
    material,
    thumbBlob,
    createdAt: Date.now(),
  }
  await putTextureItem(item)
  return item
}

export async function addFileToTextureCollection(
  file: File,
  folderId: string | null,
): Promise<TextureCollectionItem> {
  const rec = await addTextureFromFile(file)
  return addMaterialToTextureCollection(materialRefFromCustom(rec), folderId, {
    name: rec.name,
    thumbBlob: rec.blob,
  })
}

export async function addUrlToTextureCollection(
  url: string,
  folderId: string | null,
): Promise<TextureCollectionItem> {
  const rec = await addTextureFromUrl(url)
  return addMaterialToTextureCollection(materialRefFromCustom(rec), folderId, {
    name: rec.name,
    thumbBlob: rec.blob,
  })
}

export async function migrateLocalTexturesToCollection(): Promise<number> {
  const [locals, items] = await Promise.all([
    listLocalTextures(),
    listTextureItems(),
  ])
  const orphans = orphanLocalTextures(locals, items)
  if (orphans.length === 0) return 0
  await putTextureItems(orphans.map((rec) => itemFromLocalTexture(rec, null)))
  return orphans.length
}
