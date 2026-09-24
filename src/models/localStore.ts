/** IndexedDB store for user-uploaded and cached library GLBs. */

const DB_NAME = 'interior-models'
const DB_VERSION = 1
const STORE = 'models'

export interface LocalModelRecord {
  id: string
  name: string
  blob: Blob
  thumbBlob?: Blob
  /** Axis-aligned size in meters after normalize */
  bbox: { x: number; y: number; z: number }
  createdAt: number
  sourceLibrary?: string
  attribution?: { author: string; license: string; url?: string }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
  })
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IDB request failed'))
  })
}

export async function putLocalModel(rec: LocalModelRecord): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).put(rec))
  } finally {
    db.close()
  }
}

export async function getLocalModel(
  id: string,
): Promise<LocalModelRecord | undefined> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const row = await idbReq(tx.objectStore(STORE).get(id))
    return row as LocalModelRecord | undefined
  } finally {
    db.close()
  }
}

export async function listLocalModels(): Promise<LocalModelRecord[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const rows = await idbReq(tx.objectStore(STORE).getAll())
    return (rows as LocalModelRecord[]).sort((a, b) => b.createdAt - a.createdAt)
  } finally {
    db.close()
  }
}

export async function deleteLocalModel(id: string): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).delete(id))
  } finally {
    db.close()
  }
}

export function createLocalId(): string {
  return `local_${Math.random().toString(36).slice(2, 10)}`
}
