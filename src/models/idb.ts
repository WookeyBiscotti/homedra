/** Shared IndexedDB open helper for models / assets / collection. */

const DB_NAME = 'interior-models'
const DB_VERSION = 4

export const STORE_MODELS = 'models'
export const STORE_ASSETS = 'assets'
export const STORE_FOLDERS = 'collectionFolders'
export const STORE_ITEMS = 'collectionItems'
export const STORE_TEXTURES = 'textures'
export const STORE_TEX_FOLDERS = 'textureFolders'
export const STORE_TEX_ITEMS = 'textureItems'

export function openModelsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_MODELS)) {
        db.createObjectStore(STORE_MODELS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: 'cacheKey' })
      }
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const items = db.createObjectStore(STORE_ITEMS, { keyPath: 'id' })
        items.createIndex('folderId', 'folderId', { unique: false })
        items.createIndex('cacheKey', 'cacheKey', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_TEXTURES)) {
        db.createObjectStore(STORE_TEXTURES, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_TEX_FOLDERS)) {
        db.createObjectStore(STORE_TEX_FOLDERS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_TEX_ITEMS)) {
        const texItems = db.createObjectStore(STORE_TEX_ITEMS, { keyPath: 'id' })
        texItems.createIndex('folderId', 'folderId', { unique: false })
      }
    }
  })
}

export function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IDB request failed'))
  })
}
