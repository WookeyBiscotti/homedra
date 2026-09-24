import { describe, expect, it } from 'vitest'
import {
  buildCollectionItems,
  childrenOf,
  folderPath,
  type CollectionFolder,
} from './collection'
import {
  cacheKeyForLibrary,
  cacheKeyForModelRef,
  modelRefFromCacheKey,
  urlCacheKey,
} from './assetCache'
import { parseImportJson } from './projectPackage'
import type { Building } from '../engine/types'

describe('buildCollectionItems', () => {
  const base = {
    cacheKey: 'catalog:chair',
    name: 'Chair Pack',
    folderId: null as string | null,
    defaultScale: 0.5,
    bbox: { x: 2, y: 2, z: 2 },
    source: { kind: 'catalog' as const, id: 'chair' },
  }

  it('adds a single item for mode single', () => {
    const items = buildCollectionItems({
      ...base,
      mode: 'single',
      objectId: 'name:Seat',
      parts: [
        { id: 'name:Seat', label: 'Seat' },
        { id: 'name:Legs', label: 'Legs' },
      ],
    })
    expect(items).toHaveLength(1)
    expect(items[0]!.objectId).toBe('name:Seat')
    expect(items[0]!.defaultScale).toBe(0.5)
    expect(items[0]!.cacheKey).toBe('catalog:chair')
  })

  it('explodes whole asset into one item per part', () => {
    const parts = [
      { id: 'name:A', label: 'A' },
      { id: 'name:B', label: 'B' },
      { id: 'index:2', label: 'Модель 3' },
    ]
    const items = buildCollectionItems({
      ...base,
      mode: 'whole',
      parts,
    })
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.objectId)).toEqual([
      'name:A',
      'name:B',
      'index:2',
    ])
    expect(items[0]!.name).toBe('Chair Pack — A')
    expect(items.every((i) => i.defaultScale === 0.5)).toBe(true)
  })

  it('uses a per-part pictogram instead of the whole-asset thumb', () => {
    const partA = new Blob(['a'], { type: 'image/webp' })
    const partB = new Blob(['b'], { type: 'image/webp' })
    const items = buildCollectionItems({
      ...base,
      mode: 'whole',
      thumbBlob: new Blob(['whole'], { type: 'image/webp' }),
      partThumbs: { 'name:A': partA, 'name:B': partB },
      parts: [
        { id: 'name:A', label: 'A' },
        { id: 'name:B', label: 'B' },
      ],
    })
    expect(items[0]!.thumbBlob).toBe(partA)
    expect(items[1]!.thumbBlob).toBe(partB)
  })

  it('falls back to single when parts < 2 even in whole mode', () => {
    const items = buildCollectionItems({
      ...base,
      mode: 'whole',
      parts: [{ id: 'name:Only', label: 'Only' }],
    })
    expect(items).toHaveLength(1)
    expect(items[0]!.objectId).toBeUndefined()
  })
})

describe('collection folders helpers', () => {
  const folders: CollectionFolder[] = [
    { id: 'a', parentId: null, name: 'Furniture', order: 0 },
    { id: 'b', parentId: 'a', name: 'Chairs', order: 0 },
    { id: 'c', parentId: null, name: 'Decor', order: 1 },
  ]

  it('lists children of parent', () => {
    expect(childrenOf(folders, null).map((f) => f.id)).toEqual(['a', 'c'])
    expect(childrenOf(folders, 'a').map((f) => f.id)).toEqual(['b'])
  })

  it('builds folder path', () => {
    expect(folderPath(folders, 'b').map((f) => f.name)).toEqual([
      'Furniture',
      'Chairs',
    ])
    expect(folderPath(folders, null)).toEqual([])
  })
})

describe('cacheKeyForModelRef', () => {
  it('builds stable keys', () => {
    expect(
      cacheKeyForModelRef({ source: 'catalog', assetId: 'sofa' }),
    ).toBe('catalog:sofa')
    expect(
      cacheKeyForModelRef({
        source: 'library',
        library: 'sketchfab',
        id: 'abc',
      }),
    ).toBe('library:sketchfab:abc')
    expect(cacheKeyForLibrary('sketchfab', 'abc', 'lod1')).toBe(
      'library:sketchfab:abc:lod1',
    )
    expect(urlCacheKey('https://example.com/a.glb')).toMatch(/^url:/)
  })

  it('round-trips model refs from cache keys', () => {
    const ref = modelRefFromCacheKey('nasa:apollo', 'name:Body')
    expect(ref).toEqual({
      source: 'nasa',
      assetId: 'apollo',
      objectId: 'name:Body',
    })
  })
})

describe('parseImportJson', () => {
  const building = {
    id: 'b1',
    name: 'Test',
    units: 'm',
    floors: [
      {
        id: 'f1',
        name: '1',
        kind: 'story',
        elevation: 0,
        height: 2.7,
        slabThickness: 0.2,
        visible: 'solid',
        vertices: [],
        walls: [],
        constraints: [],
        openings: [],
        slabOpenings: [],
        objects: [],
      },
    ],
  } as Building

  it('accepts legacy building-only JSON', () => {
    const r = parseImportJson(JSON.stringify(building))
    expect(r.package).toBeUndefined()
    expect(r.building.id).toBe('b1')
  })

  it('parses v2 package with assets meta', () => {
    const r = parseImportJson(
      JSON.stringify({
        version: 2,
        building,
        assets: {
          'catalog:x': {
            contentType: 'model/gltf-binary',
            dataBase64: btoa('glTF'),
            source: { kind: 'catalog', id: 'x' },
          },
        },
        collectionItems: [],
      }),
    )
    expect(r.package?.version).toBe(2)
    expect(r.package?.assets['catalog:x']?.source.kind).toBe('catalog')
    expect(r.building.id).toBe('b1')
  })
})
