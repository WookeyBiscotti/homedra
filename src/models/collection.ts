/** User collection: folders + calibrated placable items. */

import { createId } from '../engine/types'
import {
  openModelsDb,
  idbReq,
  STORE_FOLDERS,
  STORE_ITEMS,
} from './idb'
import type {
  CollectionFolder,
  CollectionItem,
  CollectionSource,
} from './collectionTypes'
import type { ScenePart } from './sceneParts'

export type {
  CollectionFolder,
  CollectionItem,
  CollectionSource,
  CollectionItemJson,
  ObjectAppearance,
  ObjectMaterialOverride,
} from './collectionTypes'

export function createFolderId(): string {
  return createId('cf')
}

export function createItemId(): string {
  return createId('ci')
}

export async function putFolder(folder: CollectionFolder): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_FOLDERS, 'readwrite')
    await idbReq(tx.objectStore(STORE_FOLDERS).put(folder))
  } finally {
    db.close()
  }
}

export async function putFolders(recs: CollectionFolder[]): Promise<void> {
  if (recs.length === 0) return
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_FOLDERS, 'readwrite')
    const store = tx.objectStore(STORE_FOLDERS)
    for (const rec of recs) {
      await idbReq(store.put(rec))
    }
  } finally {
    db.close()
  }
}

export async function getFolder(
  id: string,
): Promise<CollectionFolder | undefined> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_FOLDERS, 'readonly')
    return (await idbReq(tx.objectStore(STORE_FOLDERS).get(id))) as
      | CollectionFolder
      | undefined
  } finally {
    db.close()
  }
}

export async function listFolders(): Promise<CollectionFolder[]> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_FOLDERS, 'readonly')
    const rows = (await idbReq(
      tx.objectStore(STORE_FOLDERS).getAll(),
    )) as CollectionFolder[]
    return rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  } finally {
    db.close()
  }
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction([STORE_FOLDERS, STORE_ITEMS], 'readwrite')
    const folders = tx.objectStore(STORE_FOLDERS)
    const items = tx.objectStore(STORE_ITEMS)

    // Move children folders to parent of deleted; move items to parent
    const allFolders = (await idbReq(
      folders.getAll(),
    )) as CollectionFolder[]
    const deleted = allFolders.find((f) => f.id === id)
    const parentId = deleted?.parentId ?? null

    for (const f of allFolders) {
      if (f.parentId === id) {
        await idbReq(folders.put({ ...f, parentId }))
      }
    }

    const allItems = (await idbReq(items.getAll())) as CollectionItem[]
    for (const item of allItems) {
      if (item.folderId === id) {
        await idbReq(items.put({ ...item, folderId: parentId }))
      }
    }

    await idbReq(folders.delete(id))
  } finally {
    db.close()
  }
}

export async function putItem(item: CollectionItem): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_ITEMS, 'readwrite')
    await idbReq(tx.objectStore(STORE_ITEMS).put(item))
  } finally {
    db.close()
  }
}

export async function putItems(recs: CollectionItem[]): Promise<void> {
  if (recs.length === 0) return
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_ITEMS, 'readwrite')
    const store = tx.objectStore(STORE_ITEMS)
    for (const rec of recs) {
      await idbReq(store.put(rec))
    }
  } finally {
    db.close()
  }
}

export async function getItem(
  id: string,
): Promise<CollectionItem | undefined> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_ITEMS, 'readonly')
    return (await idbReq(tx.objectStore(STORE_ITEMS).get(id))) as
      | CollectionItem
      | undefined
  } finally {
    db.close()
  }
}

export async function listItems(
  folderId?: string | null,
): Promise<CollectionItem[]> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_ITEMS, 'readonly')
    const rows = (await idbReq(
      tx.objectStore(STORE_ITEMS).getAll(),
    )) as CollectionItem[]
    const filtered =
      folderId === undefined
        ? rows
        : rows.filter((r) =>
            folderId === null ? r.folderId == null : r.folderId === folderId,
          )
    return filtered.sort((a, b) => b.createdAt - a.createdAt)
  } finally {
    db.close()
  }
}

export async function deleteItem(id: string): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_ITEMS, 'readwrite')
    await idbReq(tx.objectStore(STORE_ITEMS).delete(id))
  } finally {
    db.close()
  }
}

export type ExplodeSpec = {
  cacheKey: string
  name: string
  folderId: string | null
  defaultScale: number
  bbox: { x: number; y: number; z: number }
  source: CollectionSource
  thumbBlob?: Blob
  /** Per-part pictograms keyed by objectId (`''` = whole scene). */
  partThumbs?: Record<string, Blob>
  /** When adding one part only. */
  objectId?: string
  /** When adding whole asset — explode into these parts (empty = single whole). */
  parts?: ScenePart[]
  mode: 'single' | 'whole'
}

/**
 * Build collection item(s) for one part or whole multi-part asset.
 * Does not write to IDB — caller persists with putItems.
 */
export function buildCollectionItems(spec: ExplodeSpec): CollectionItem[] {
  const now = Date.now()
  if (spec.mode === 'single' || !spec.parts || spec.parts.length < 2) {
    return [
      {
        id: createItemId(),
        folderId: spec.folderId,
        name: spec.name,
        cacheKey: spec.cacheKey,
        objectId: spec.objectId,
        defaultScale: spec.defaultScale,
        bbox: spec.bbox,
        source: spec.source,
        thumbBlob:
          spec.partThumbs?.[spec.objectId ?? ''] ?? spec.thumbBlob,
        createdAt: now,
      },
    ]
  }

  return spec.parts.map((part, i) => ({
    id: createItemId(),
    folderId: spec.folderId,
    name: `${spec.name} — ${part.label}`,
    cacheKey: spec.cacheKey,
    objectId: part.id,
    defaultScale: spec.defaultScale,
    bbox: spec.bbox,
    source: spec.source,
    thumbBlob:
      spec.partThumbs?.[part.id] ?? (i === 0 ? spec.thumbBlob : undefined),
    createdAt: now + i,
  }))
}

/** Child folders of a parent (null = root). */
export function childrenOf(
  folders: CollectionFolder[],
  parentId: string | null,
): CollectionFolder[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

/** Path from root to folder (inclusive). */
export function folderPath(
  folders: CollectionFolder[],
  folderId: string | null,
): CollectionFolder[] {
  if (!folderId) return []
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path: CollectionFolder[] = []
  let cur: string | null = folderId
  const guard = new Set<string>()
  while (cur && !guard.has(cur)) {
    guard.add(cur)
    const f = byId.get(cur)
    if (!f) break
    path.unshift(f)
    cur = f.parentId
  }
  return path
}
