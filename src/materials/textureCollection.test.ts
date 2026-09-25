import { describe, expect, it } from 'vitest'
import type { MaterialRef } from '../engine/types'
import type { LocalTextureRecord } from './customTextures'
import {
  countTextureLibrary,
  findDuplicateTextureItem,
  itemFromLocalTexture,
  orphanLocalTextures,
  textureItemDedupeKey,
  type TextureCollectionItem,
} from './textureCollection'

const oak: MaterialRef = {
  source: 'ambientcg',
  assetId: 'Wood048',
  tileSizeM: 1.5,
  name: 'Wood',
}

const custom: MaterialRef = {
  source: 'custom',
  assetId: 'tex_oak',
  tileSizeM: 1.5,
  name: 'Oak',
}

function item(
  over: Partial<TextureCollectionItem> & { material: MaterialRef },
): TextureCollectionItem {
  return {
    id: over.id ?? 'ti1',
    folderId: over.folderId ?? null,
    name: over.name ?? 'Tex',
    material: over.material,
    createdAt: over.createdAt ?? 1,
  }
}

describe('texture collection helpers', () => {
  it('dedupes the same material in the same folder', () => {
    const items = [item({ material: oak, folderId: 'tf1' })]
    expect(textureItemDedupeKey('tf1', oak)).toBe('tf1:ambientcg:Wood048')
    expect(findDuplicateTextureItem(items, 'tf1', oak)?.id).toBe('ti1')
    expect(findDuplicateTextureItem(items, null, oak)).toBeUndefined()
  })

  it('migrates only local textures that are not already in the collection', () => {
    const locals: LocalTextureRecord[] = [
      { id: 'tex_oak', name: 'Oak', blob: new Blob(), createdAt: 1 },
      { id: 'tex_new', name: 'New', blob: new Blob(), createdAt: 2 },
    ]
    const items = [item({ material: custom })]
    const orphans = orphanLocalTextures(locals, items)
    expect(orphans.map((r) => r.id)).toEqual(['tex_new'])
    expect(itemFromLocalTexture(orphans[0]!, 'tf1')).toMatchObject({
      folderId: 'tf1',
      name: 'New',
      material: {
        source: 'custom',
        assetId: 'tex_new',
        name: 'New',
      },
    })
  })

  it('counts collection items plus leftover local blobs', () => {
    expect(
      countTextureLibrary(
        [item({ material: custom }), item({ id: 'ti2', material: oak })],
        [{ id: 'tex_oak' }, { id: 'tex_loose' }],
      ),
    ).toBe(3)
    expect(countTextureLibrary([], [{ id: 'tex_loose' }])).toBe(1)
    expect(countTextureLibrary([item({ material: oak })], [])).toBe(1)
  })
})
