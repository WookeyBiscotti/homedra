/** Browser profile: API keys + saved models + custom textures (not the building). */

import {
  listLocalTextures,
  putLocalTexture,
  type LocalTextureRecord,
} from '../materials/customTextures'
import {
  countTextureLibrary,
  listTextureFolders,
  listTextureItems,
  putTextureFolders,
  putTextureItems,
  type TextureCollectionFolder,
  type TextureCollectionItem,
  type TextureCollectionItemJson,
} from '../materials/textureCollection'
import {
  getCachedAsset,
  putCachedAsset,
  type CachedAsset,
} from './assetCache'
import { base64ToBlob, blobToBase64 } from './blobBase64'
import {
  listFolders,
  listItems,
  putFolders,
  putItems,
  type CollectionFolder,
  type CollectionItem,
  type CollectionItemJson,
  type CollectionSource,
} from './collection'
import {
  listLocalModels,
  putLocalModel,
  type LocalModelRecord,
} from './localStore'
import { readLibraryTokens, writeLibraryTokens, type LibraryTokens } from './tokens'

export const PROFILE_KIND = 'interior-profile'
export const PROFILE_VERSION = 1 as const

export type PackagedAsset = {
  contentType: string
  dataBase64: string
  source: CollectionSource
}

export type PackagedLocalModel = {
  id: string
  name: string
  dataBase64: string
  contentType: string
  thumbBase64?: string
  bbox: { x: number; y: number; z: number }
  createdAt: number
  sourceLibrary?: string
  attribution?: { author: string; license: string; url?: string }
}

export type PackagedTexture = {
  id: string
  name: string
  dataBase64: string
  contentType: string
  createdAt: number
  url?: string
}

export type ProfilePackageV1 = {
  kind: typeof PROFILE_KIND
  version: typeof PROFILE_VERSION
  exportedAt: number
  tokens: LibraryTokens
  models: PackagedLocalModel[]
  collectionFolders: CollectionFolder[]
  collectionItems: CollectionItemJson[]
  assets: Record<string, PackagedAsset>
  textures: PackagedTexture[]
  textureFolders?: TextureCollectionFolder[]
  textureItems?: TextureCollectionItemJson[]
}

export type ProfileInventory = {
  keys: number
  localModels: number
  collectionItems: number
  textures: number
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return !!data && typeof data === 'object'
}

export function isProfilePackage(data: unknown): data is ProfilePackageV1 {
  if (!isRecord(data)) return false
  return (
    data.kind === PROFILE_KIND &&
    data.version === PROFILE_VERSION &&
    isRecord(data.tokens) &&
    Array.isArray(data.models) &&
    Array.isArray(data.collectionFolders) &&
    Array.isArray(data.collectionItems) &&
    isRecord(data.assets) &&
    Array.isArray(data.textures)
  )
}

export function parseProfileJson(json: string): ProfilePackageV1 {
  const data = JSON.parse(json) as unknown
  if (!isProfilePackage(data)) {
    throw new Error('Это не файл профиля Interior')
  }
  return data
}

export async function readProfileInventory(): Promise<ProfileInventory> {
  const tokens = readLibraryTokens()
  const [models, items, textures, texItems] = await Promise.all([
    listLocalModels(),
    listItems(),
    listLocalTextures(),
    listTextureItems(),
  ])
  return {
    keys: Object.values(tokens).filter(Boolean).length,
    localModels: models.length,
    collectionItems: items.length,
    textures: countTextureLibrary(texItems, textures),
  }
}

async function packageLocalModel(
  rec: LocalModelRecord,
): Promise<PackagedLocalModel> {
  const packaged: PackagedLocalModel = {
    id: rec.id,
    name: rec.name,
    dataBase64: await blobToBase64(rec.blob),
    contentType: rec.blob.type || 'model/gltf-binary',
    bbox: rec.bbox,
    createdAt: rec.createdAt,
  }
  if (rec.thumbBlob) {
    packaged.thumbBase64 = await blobToBase64(rec.thumbBlob)
  }
  if (rec.sourceLibrary) packaged.sourceLibrary = rec.sourceLibrary
  if (rec.attribution) packaged.attribution = rec.attribution
  return packaged
}

async function packageTexture(
  rec: LocalTextureRecord,
): Promise<PackagedTexture> {
  const packaged: PackagedTexture = {
    id: rec.id,
    name: rec.name,
    dataBase64: await blobToBase64(rec.blob),
    contentType: rec.blob.type || 'image/png',
    createdAt: rec.createdAt,
  }
  if (rec.url) packaged.url = rec.url
  return packaged
}

async function packageCollectionItem(
  item: CollectionItem,
): Promise<CollectionItemJson> {
  const { thumbBlob, ...rest } = item
  const json: CollectionItemJson = { ...rest }
  if (thumbBlob) json.thumbBase64 = await blobToBase64(thumbBlob)
  return json
}

async function packageTextureItem(
  item: TextureCollectionItem,
): Promise<TextureCollectionItemJson> {
  const { thumbBlob, ...rest } = item
  const json: TextureCollectionItemJson = { ...rest }
  if (thumbBlob) json.thumbBase64 = await blobToBase64(thumbBlob)
  return json
}

export async function buildProfilePackage(): Promise<ProfilePackageV1> {
  const [models, folders, items, textures, textureFolders, textureItems] =
    await Promise.all([
      listLocalModels(),
      listFolders(),
      listItems(),
      listLocalTextures(),
      listTextureFolders(),
      listTextureItems(),
    ])

  const assets: Record<string, PackagedAsset> = {}
  for (const item of items) {
    if (assets[item.cacheKey]) continue
    const cached = await getCachedAsset(item.cacheKey)
    if (!cached) continue
    assets[item.cacheKey] = {
      contentType: cached.contentType,
      dataBase64: await blobToBase64(cached.blob),
      source: cached.source,
    }
  }

  return {
    kind: PROFILE_KIND,
    version: PROFILE_VERSION,
    exportedAt: Date.now(),
    tokens: readLibraryTokens(),
    models: await Promise.all(models.map(packageLocalModel)),
    collectionFolders: folders,
    collectionItems: await Promise.all(items.map(packageCollectionItem)),
    assets,
    textures: await Promise.all(textures.map(packageTexture)),
    textureFolders,
    textureItems: await Promise.all(textureItems.map(packageTextureItem)),
  }
}

export function summarizeProfile(pkg: ProfilePackageV1): ProfileInventory {
  return {
    keys: Object.values(pkg.tokens).filter(Boolean).length,
    localModels: pkg.models.length,
    collectionItems: pkg.collectionItems.length,
    textures: countTextureLibrary(pkg.textureItems ?? [], pkg.textures),
  }
}

function unpackLocalModel(row: PackagedLocalModel): LocalModelRecord {
  const rec: LocalModelRecord = {
    id: row.id,
    name: row.name,
    blob: base64ToBlob(row.dataBase64, row.contentType || 'model/gltf-binary'),
    bbox: row.bbox,
    createdAt: row.createdAt,
  }
  if (row.thumbBase64) {
    rec.thumbBlob = base64ToBlob(row.thumbBase64, 'image/webp')
  }
  if (row.sourceLibrary) rec.sourceLibrary = row.sourceLibrary
  if (row.attribution) rec.attribution = row.attribution
  return rec
}

function unpackTexture(row: PackagedTexture): LocalTextureRecord {
  const rec: LocalTextureRecord = {
    id: row.id,
    name: row.name,
    blob: base64ToBlob(row.dataBase64, row.contentType || 'image/png'),
    createdAt: row.createdAt,
  }
  if (row.url) rec.url = row.url
  return rec
}

export async function applyProfilePackage(pkg: ProfilePackageV1): Promise<void> {
  writeLibraryTokens({ ...readLibraryTokens(), ...pkg.tokens })

  for (const row of pkg.models) {
    await putLocalModel(unpackLocalModel(row))
  }

  await putFolders(pkg.collectionFolders)

  const items: CollectionItem[] = pkg.collectionItems.map((j) => {
    const { thumbBase64, ...rest } = j
    const item: CollectionItem = { ...rest }
    if (thumbBase64) {
      item.thumbBlob = base64ToBlob(thumbBase64, 'image/webp')
    }
    return item
  })
  await putItems(items)

  for (const [cacheKey, asset] of Object.entries(pkg.assets)) {
    const rec: CachedAsset = {
      cacheKey,
      blob: base64ToBlob(asset.dataBase64, asset.contentType),
      contentType: asset.contentType,
      fetchedAt: Date.now(),
      source: asset.source,
    }
    await putCachedAsset(rec)
  }

  for (const row of pkg.textures) {
    await putLocalTexture(unpackTexture(row))
  }

  if (pkg.textureFolders?.length) {
    await putTextureFolders(pkg.textureFolders)
  }

  if (pkg.textureItems?.length) {
    const texItems: TextureCollectionItem[] = pkg.textureItems.map((row) => {
      const { thumbBase64, ...rest } = row
      const item: TextureCollectionItem = { ...rest }
      if (thumbBase64) {
        item.thumbBlob = base64ToBlob(thumbBase64, 'image/webp')
      }
      return item
    })
    await putTextureItems(texItems)
  }
}
