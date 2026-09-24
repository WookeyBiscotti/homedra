import type {
  ModelAttribution,
  ObjectAppearance,
} from '../engine/types'

export type { ObjectAppearance, ObjectMaterialOverride } from '../engine/types'

/** Provenance so a cached / collection item can be re-downloaded. */
export type CollectionSource = {
  kind: 'catalog' | 'nasa' | 'library' | 'local' | 'url'
  library?: string
  id?: string
  url?: string
  attribution?: ModelAttribution
}

export type CollectionFolder = {
  id: string
  parentId: string | null
  name: string
  order: number
}

export type CollectionItem = {
  id: string
  folderId: string | null
  name: string
  cacheKey: string
  /** Sub-object inside a multi-model glTF (`name:…` / `index:…`). */
  objectId?: string
  /** Applied as uniform PlacedObject.scaleX/Y/Z when placing. */
  defaultScale: number
  /** Axis-aligned size in meters at scale=1 (after normalizeRoot). */
  bbox: { x: number; y: number; z: number }
  source: CollectionSource
  /** Default paint / texture overrides when placing. */
  appearance?: ObjectAppearance
  thumbBlob?: Blob
  createdAt: number
}

/** Serializable form (no Blobs) for project packages. */
export type CollectionItemJson = Omit<CollectionItem, 'thumbBlob'> & {
  thumbBase64?: string
}
