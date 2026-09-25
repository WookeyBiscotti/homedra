/** User textures imported from a file or an image URL (IndexedDB). */

import type { MaterialRef } from '../engine/types'
import { openModelsDb, idbReq, STORE_TEXTURES } from '../models/idb'
import { proxiedTextureUrl } from '../models/proxyUrl'

export const MAX_TEXTURE_BYTES = 16 * 1024 * 1024

export const IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp'

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp)$/i
const IMAGE_MIME =
  /^(image\/(jpeg|jpg|png|webp|gif|avif|bmp)|application\/octet-stream)/i

export interface LocalTextureRecord {
  id: string
  name: string
  blob: Blob
  createdAt: number
  /** Original URL when imported from a link. */
  url?: string
}

export class TextureImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TextureImportError'
  }
}

const listeners = new Set<() => void>()

export function subscribeTextures(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function notifyTextures(): void {
  for (const fn of listeners) fn()
}

export function createTextureId(): string {
  return `tex_${Math.random().toString(36).slice(2, 10)}`
}

export function isImageFile(file: { name: string; type: string }): boolean {
  if (file.type && file.type.startsWith('image/')) return true
  return IMAGE_EXT.test(file.name)
}

export function normalizeTextureUrl(raw: string): string {
  const url = raw.trim()
  if (!url) throw new TextureImportError('Вставьте ссылку на изображение')
  if (url.startsWith('data:image/')) return url
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new TextureImportError('Некорректная ссылка')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TextureImportError('Нужна ссылка http(s) на изображение')
  }
  return parsed.href
}

export function nameFromImageUrl(url: string): string {
  if (url.startsWith('data:')) return 'Изображение'
  try {
    const parsed = new URL(url)
    const last = decodeURIComponent(
      parsed.pathname.split('/').filter(Boolean).pop() ?? '',
    )
    const base = last.replace(/\.[a-z0-9]+$/i, '')
    if (base) return base.slice(0, 80)
    return parsed.hostname
  } catch {
    return 'Текстура'
  }
}

export function materialCacheKey(ref: MaterialRef): string {
  return `${ref.source}:${ref.assetId}`
}

export function materialLabel(ref: MaterialRef | null | undefined): string {
  if (!ref) return 'Нет текстуры'
  if (ref.name?.trim()) return ref.name
  if (ref.source === 'custom' && ref.url) return nameFromImageUrl(ref.url)
  return ref.assetId
}

export function materialRefFromCustom(
  rec: LocalTextureRecord,
  tileSizeM = 1.5,
): MaterialRef {
  return {
    source: 'custom',
    assetId: rec.id,
    tileSizeM: Math.max(0.2, tileSizeM),
    url: rec.url,
    name: rec.name,
  }
}

export async function putLocalTexture(rec: LocalTextureRecord): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TEXTURES, 'readwrite')
    await idbReq(tx.objectStore(STORE_TEXTURES).put(rec))
  } finally {
    db.close()
  }
  notifyTextures()
}

export async function getLocalTexture(
  id: string,
): Promise<LocalTextureRecord | undefined> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TEXTURES, 'readonly')
    const row = await idbReq(tx.objectStore(STORE_TEXTURES).get(id))
    return row as LocalTextureRecord | undefined
  } finally {
    db.close()
  }
}

export async function listLocalTextures(): Promise<LocalTextureRecord[]> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TEXTURES, 'readonly')
    const rows = await idbReq(tx.objectStore(STORE_TEXTURES).getAll())
    return (rows as LocalTextureRecord[]).sort((a, b) => b.createdAt - a.createdAt)
  } finally {
    db.close()
  }
}

export async function deleteLocalTexture(id: string): Promise<void> {
  const db = await openModelsDb()
  try {
    const tx = db.transaction(STORE_TEXTURES, 'readwrite')
    await idbReq(tx.objectStore(STORE_TEXTURES).delete(id))
  } finally {
    db.close()
  }
  notifyTextures()
}

async function assertImageBlob(blob: Blob): Promise<void> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob)
      bmp.close()
      return
    } catch {
      throw new TextureImportError('Не удалось прочитать изображение')
    }
  }
  if (blob.type && !IMAGE_MIME.test(blob.type)) {
    throw new TextureImportError('Ссылка не ведёт на изображение')
  }
}

function rejectIfTooLarge(blob: Blob): void {
  if (blob.size > MAX_TEXTURE_BYTES) {
    throw new TextureImportError(
      `Файл слишком большой (макс. ${MAX_TEXTURE_BYTES / (1024 * 1024)} МБ)`,
    )
  }
  if (blob.size < 32) {
    throw new TextureImportError('Пустой файл изображения')
  }
}

export async function fetchTextureBlob(url: string): Promise<Blob> {
  const href = normalizeTextureUrl(url)
  const candidates = [href]
  const proxied = proxiedTextureUrl(href)
  if (proxied !== href) candidates.push(proxied)

  let lastErr: unknown
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { mode: 'cors', credentials: 'omit' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      rejectIfTooLarge(blob)
      await assertImageBlob(blob)
      return blob
    } catch (err) {
      lastErr = err
    }
  }
  if (lastErr instanceof TextureImportError) throw lastErr
  throw new TextureImportError(
    lastErr instanceof Error
      ? `Не удалось скачать изображение: ${lastErr.message}`
      : 'Не удалось скачать изображение (CORS?)',
  )
}

export async function addTextureFromFile(
  file: File,
): Promise<LocalTextureRecord> {
  if (!isImageFile(file)) {
    throw new TextureImportError('Нужен файл изображения (JPG, PNG, WebP…)')
  }
  rejectIfTooLarge(file)
  await assertImageBlob(file)
  const rec: LocalTextureRecord = {
    id: createTextureId(),
    name: file.name.replace(/\.[^.]+$/, '') || 'Текстура',
    blob: file,
    createdAt: Date.now(),
  }
  await putLocalTexture(rec)
  return rec
}

export async function addTextureFromUrl(url: string): Promise<LocalTextureRecord> {
  const href = normalizeTextureUrl(url)
  const blob = await fetchTextureBlob(href)
  const rec: LocalTextureRecord = {
    id: createTextureId(),
    name: nameFromImageUrl(href),
    blob,
    createdAt: Date.now(),
    url: href.startsWith('data:') ? undefined : href,
  }
  await putLocalTexture(rec)
  return rec
}
