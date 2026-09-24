import type {
  ModelAttribution,
  ModelRef,
  ObjectAppearance,
} from '../engine/types'
import type { CollectionItem } from './collection'
import { modelRefFromCacheKey } from './assetCache'

/** Build a pending placement payload from a collection item. */
export function pendingFromCollectionItem(item: CollectionItem): {
  model: ModelRef
  attribution?: ModelAttribution
  scale: number
  /** Local model bbox before scale (meters). */
  sizeX: number
  sizeY: number
  sizeZ: number
  appearance?: ObjectAppearance
} | null {
  let ref = modelRefFromCacheKey(item.cacheKey, item.objectId)
  if (!ref) {
    if (item.source.kind === 'url' && item.source.url) {
      ref = {
        source: 'url',
        url: item.source.url,
        objectId: item.objectId,
        license: item.source.attribution?.license,
      }
    } else if (
      item.source.kind === 'library' &&
      item.source.library &&
      item.source.id
    ) {
      ref = {
        source: 'library',
        library: item.source.library as
          | 'polyPizza'
          | 'smithsonian'
          | 'sketchfab'
          | 'polyHaven',
        id: item.source.id,
        objectId: item.objectId,
      }
    } else {
      return null
    }
  }
  if (item.cacheKey.startsWith('local:')) {
    ref = {
      source: 'local',
      localId: item.cacheKey.slice(6),
      objectId: item.objectId,
    }
  }
  return {
    model: ref,
    attribution: item.source.attribution,
    scale: item.defaultScale,
    sizeX: Math.max(0.05, item.bbox.x),
    sizeY: Math.max(0.05, item.bbox.y),
    sizeZ: Math.max(0.05, item.bbox.z),
    appearance: item.appearance,
  }
}
