import {
  createId,
  defaultMaterialRef,
  defaultTileSpec,
  type TileSpec,
} from '../engine/types'
import {
  idbReq,
  openModelsDb,
  STORE_TILE_FOLDERS,
  STORE_TILE_ITEMS,
} from '../models/idb'
import type { CollectionFolder } from '../models/collectionTypes'

export type TileCollectionFolder = CollectionFolder

export type TileCollectionItem = {
  id: string
  folderId: string | null
  spec: TileSpec
  createdAt: number
}

const listeners = new Set<() => void>()

export function subscribeTileCollection(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function notify(): void {
  for (const fn of listeners) fn()
}

export function createTileFolderId(): string {
  return createId('tlf')
}

export function createTileItemId(): string {
  return createId('tli')
}

const STARTER: TileSpec[] = [
  {
    name: '30×30',
    width: 0.3,
    length: 0.3,
    thickness: 0.008,
    material: defaultMaterialRef('Tiles141', 0.3),
  },
  {
    name: '30×60',
    width: 0.3,
    length: 0.6,
    thickness: 0.008,
    material: defaultMaterialRef('Tiles139', 0.3),
  },
  {
    name: '60×60',
    width: 0.6,
    length: 0.6,
    thickness: 0.01,
    material: defaultMaterialRef('Tiles141', 0.6),
  },
]

export async function putTileFolder(folder: TileCollectionFolder): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TILE_FOLDERS, 'readwrite')
    await idbReq(tx.objectStore(STORE_TILE_FOLDERS).put(folder))
  } finally {
    db.close()
  }
  notify()
}

export async function listTileFolders(): Promise<TileCollectionFolder[]> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TILE_FOLDERS, 'readonly')
    const rows = (await idbReq(
      tx.objectStore(STORE_TILE_FOLDERS).getAll(),
    )) as TileCollectionFolder[]
    return rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  } finally {
    db.close()
  }
}

export async function deleteTileFolder(id: string): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(
      [STORE_TILE_FOLDERS, STORE_TILE_ITEMS],
      'readwrite',
    )
    const folders = tx.objectStore(STORE_TILE_FOLDERS)
    const items = tx.objectStore(STORE_TILE_ITEMS)
    const allFolders = (await idbReq(folders.getAll())) as TileCollectionFolder[]
    const deleted = allFolders.find((f) => f.id === id)
    const parentId = deleted?.parentId ?? null
    for (const folder of allFolders) {
      if (folder.parentId === id) {
        await idbReq(folders.put({ ...folder, parentId }))
      }
    }
    const allItems = (await idbReq(items.getAll())) as TileCollectionItem[]
    for (const item of allItems) {
      if (item.folderId === id) {
        await idbReq(items.put({ ...item, folderId: parentId }))
      }
    }
    await idbReq(folders.delete(id))
  } finally {
    db.close()
  }
  notify()
}

export async function putTileItem(item: TileCollectionItem): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TILE_ITEMS, 'readwrite')
    await idbReq(tx.objectStore(STORE_TILE_ITEMS).put(item))
  } finally {
    db.close()
  }
  notify()
}

export async function listTileItems(): Promise<TileCollectionItem[]> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TILE_ITEMS, 'readonly')
    const rows = (await idbReq(
      tx.objectStore(STORE_TILE_ITEMS).getAll(),
    )) as TileCollectionItem[]
    return rows.sort((a, b) => b.createdAt - a.createdAt)
  } finally {
    db.close()
  }
}

export async function deleteTileItem(id: string): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TILE_ITEMS, 'readwrite')
    await idbReq(tx.objectStore(STORE_TILE_ITEMS).delete(id))
  } finally {
    db.close()
  }
  notify()
}

let starterPromise: Promise<TileCollectionItem[]> | null = null

export async function ensureStarterTiles(): Promise<TileCollectionItem[]> {
  if (!starterPromise) {
    starterPromise = (async () => {
      const existing = await listTileItems()
      if (existing.length > 0) return existing
      const seeded: TileCollectionItem[] = STARTER.map((spec) => ({
        id: createTileItemId(),
        folderId: null,
        spec,
        createdAt: Date.now(),
      }))
      for (const item of seeded) {
        await putTileItem(item)
      }
      return seeded
    })()
  }
  return starterPromise
}

export function newTileItem(
  spec?: Partial<TileSpec>,
  folderId: string | null = null,
): TileCollectionItem {
  const base = defaultTileSpec()
  return {
    id: createTileItemId(),
    folderId,
    spec: {
      ...base,
      ...spec,
      material: spec?.material ?? base.material,
    },
    createdAt: Date.now(),
  }
}
