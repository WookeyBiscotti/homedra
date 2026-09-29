import {
  createId,
  defaultMoldingProfile,
  defaultMoldingSpec,
  normalizeMoldingProfile,
  type MoldingSpec,
} from '../engine/types'
import { defaultRoundedSkirtingProfile } from '../engine/geometry/moldingProfile'
import {
  idbReq,
  openModelsDb,
  STORE_MOLDING_FOLDERS,
  STORE_MOLDING_ITEMS,
} from '../models/idb'
import type { CollectionFolder } from '../models/collectionTypes'

export type MoldingCollectionFolder = CollectionFolder

export type MoldingCollectionItem = {
  id: string
  folderId: string | null
  spec: MoldingSpec
  createdAt: number
}

const listeners = new Set<() => void>()

export function subscribeMoldingCollection(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function notify(): void {
  for (const fn of listeners) fn()
}

export function createMoldingFolderId(): string {
  return createId('mlf')
}

export function createMoldingItemId(): string {
  return createId('mli')
}

const STARTER: MoldingSpec[] = [
  {
    name: 'Плинтус 60',
    kind: 'skirting',
    profile: defaultMoldingProfile('skirting'),
    material: defaultMoldingSpec('skirting').material,
  },
  {
    name: 'Плинтус скругл.',
    kind: 'skirting',
    profile: defaultRoundedSkirtingProfile(),
    material: defaultMoldingSpec('skirting').material,
  },
  {
    name: 'Галтель 40',
    kind: 'cove',
    profile: defaultMoldingProfile('cove'),
    material: defaultMoldingSpec('cove').material,
  },
]

export async function putMoldingFolder(
  folder: MoldingCollectionFolder,
): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_MOLDING_FOLDERS, 'readwrite')
    await idbReq(tx.objectStore(STORE_MOLDING_FOLDERS).put(folder))
  } finally {
    db.close()
  }
  notify()
}

export async function listMoldingFolders(): Promise<MoldingCollectionFolder[]> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_MOLDING_FOLDERS, 'readonly')
    const rows = (await idbReq(
      tx.objectStore(STORE_MOLDING_FOLDERS).getAll(),
    )) as MoldingCollectionFolder[]
    return rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  } finally {
    db.close()
  }
}

export async function deleteMoldingFolder(id: string): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(
      [STORE_MOLDING_FOLDERS, STORE_MOLDING_ITEMS],
      'readwrite',
    )
    const folders = tx.objectStore(STORE_MOLDING_FOLDERS)
    const items = tx.objectStore(STORE_MOLDING_ITEMS)
    const allFolders = (await idbReq(
      folders.getAll(),
    )) as MoldingCollectionFolder[]
    const deleted = allFolders.find((f) => f.id === id)
    const parentId = deleted?.parentId ?? null
    for (const folder of allFolders) {
      if (folder.parentId === id) {
        await idbReq(folders.put({ ...folder, parentId }))
      }
    }
    const allItems = (await idbReq(items.getAll())) as MoldingCollectionItem[]
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

export async function putMoldingItem(item: MoldingCollectionItem): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_MOLDING_ITEMS, 'readwrite')
    await idbReq(tx.objectStore(STORE_MOLDING_ITEMS).put(item))
  } finally {
    db.close()
  }
  notify()
}

export async function listMoldingItems(): Promise<MoldingCollectionItem[]> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_MOLDING_ITEMS, 'readonly')
    const rows = (await idbReq(
      tx.objectStore(STORE_MOLDING_ITEMS).getAll(),
    )) as MoldingCollectionItem[]
    return rows.sort((a, b) => b.createdAt - a.createdAt)
  } finally {
    db.close()
  }
}

export async function deleteMoldingItem(id: string): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_MOLDING_ITEMS, 'readwrite')
    await idbReq(tx.objectStore(STORE_MOLDING_ITEMS).delete(id))
  } finally {
    db.close()
  }
  notify()
}

let starterPromise: Promise<MoldingCollectionItem[]> | null = null

export async function ensureStarterMoldings(): Promise<MoldingCollectionItem[]> {
  if (!starterPromise) {
    starterPromise = (async () => {
      const existing = await listMoldingItems()
      if (existing.length > 0) return existing
      const seeded: MoldingCollectionItem[] = STARTER.map((spec) => ({
        id: createMoldingItemId(),
        folderId: null,
        spec: {
          ...spec,
          profile: normalizeMoldingProfile(spec.profile, spec.kind),
        },
        createdAt: Date.now(),
      }))
      for (const item of seeded) {
        await putMoldingItem(item)
      }
      return seeded
    })()
  }
  return starterPromise
}

export function newMoldingItem(
  spec?: Partial<MoldingSpec>,
  folderId: string | null = null,
): MoldingCollectionItem {
  const kind = spec?.kind === 'cove' ? 'cove' : 'skirting'
  const base = defaultMoldingSpec(kind)
  return {
    id: createMoldingItemId(),
    folderId,
    spec: {
      ...base,
      ...spec,
      kind,
      profile: normalizeMoldingProfile(spec?.profile ?? base.profile, kind),
      material: spec?.material ?? base.material,
    },
    createdAt: Date.now(),
  }
}
