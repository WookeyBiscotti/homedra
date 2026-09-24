/** IndexedDB store for user-uploaded GLBs (legacy "local" tab). */

import { openModelsDb, idbReq, STORE_MODELS } from './idb'

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

export async function putLocalModel(rec: LocalModelRecord): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_MODELS, 'readwrite')
    await idbReq(tx.objectStore(STORE_MODELS).put(rec))
  } finally {
    db.close()
  }
}

export async function getLocalModel(
  id: string,
): Promise<LocalModelRecord | undefined> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_MODELS, 'readonly')
    const row = await idbReq(tx.objectStore(STORE_MODELS).get(id))
    return row as LocalModelRecord | undefined
  } finally {
    db.close()
  }
}

export async function listLocalModels(): Promise<LocalModelRecord[]> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_MODELS, 'readonly')
    const rows = await idbReq(tx.objectStore(STORE_MODELS).getAll())
    return (rows as LocalModelRecord[]).sort((a, b) => b.createdAt - a.createdAt)
  } finally {
    db.close()
  }
}

export async function deleteLocalModel(id: string): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_MODELS, 'readwrite')
    await idbReq(tx.objectStore(STORE_MODELS).delete(id))
  } finally {
    db.close()
  }
}

export function createLocalId(): string {
  return `local_${Math.random().toString(36).slice(2, 10)}`
}
