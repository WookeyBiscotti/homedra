import { describe, expect, it } from 'vitest'
import { base64ToBlob, blobToBase64 } from './blobBase64'
import {
  isProfilePackage,
  parseProfileJson,
  PROFILE_KIND,
  summarizeProfile,
  type ProfilePackageV1,
} from './profilePackage'
import { parseImportJson } from './projectPackage'

function sampleProfile(over: Partial<ProfilePackageV1> = {}): ProfilePackageV1 {
  return {
    kind: PROFILE_KIND,
    version: 1,
    exportedAt: 1,
    tokens: { sketchfab: 'sk_test' },
    models: [
      {
        id: 'local_1',
        name: 'Chair',
        dataBase64: btoa('glb'),
        contentType: 'model/gltf-binary',
        bbox: { x: 1, y: 1, z: 1 },
        createdAt: 1,
      },
    ],
    collectionFolders: [{ id: 'cf1', parentId: null, name: 'Мебель', order: 0 }],
    collectionItems: [
      {
        id: 'ci1',
        folderId: 'cf1',
        name: 'Стул',
        cacheKey: 'local:local_1',
        defaultScale: 1,
        bbox: { x: 1, y: 1, z: 1 },
        source: { kind: 'local', id: 'local_1' },
        createdAt: 1,
      },
    ],
    assets: {},
    textures: [
      {
        id: 'tex_1',
        name: 'Oak',
        dataBase64: btoa('png'),
        contentType: 'image/png',
        createdAt: 1,
      },
    ],
    ...over,
  }
}

describe('blobBase64', () => {
  it('round-trips binary data', async () => {
    const src = new Blob([new Uint8Array([1, 2, 200, 255])], {
      type: 'application/octet-stream',
    })
    const b64 = await blobToBase64(src)
    const back = base64ToBlob(b64, 'application/octet-stream')
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 200, 255]),
    )
  })
})

describe('parseProfileJson', () => {
  it('accepts a v1 profile with keys, models, and textures', () => {
    const pkg = parseProfileJson(JSON.stringify(sampleProfile()))
    expect(pkg.kind).toBe(PROFILE_KIND)
    expect(pkg.tokens.sketchfab).toBe('sk_test')
    expect(pkg.models[0]?.name).toBe('Chair')
    expect(pkg.textures[0]?.name).toBe('Oak')
    expect(summarizeProfile(pkg)).toEqual({
      keys: 1,
      localModels: 1,
      collectionItems: 1,
      textures: 1,
    })
  })

  it('counts texture collection items without double-counting custom blobs', () => {
    const pkg = sampleProfile({
      textureFolders: [{ id: 'tf1', parentId: null, name: 'Дерево', order: 0 }],
      textureItems: [
        {
          id: 'ti1',
          folderId: 'tf1',
          name: 'Oak',
          material: {
            source: 'custom',
            assetId: 'tex_1',
            tileSizeM: 1.5,
            name: 'Oak',
          },
          createdAt: 1,
        },
        {
          id: 'ti2',
          folderId: null,
          name: 'Wood',
          material: {
            source: 'ambientcg',
            assetId: 'Wood048',
            tileSizeM: 1.5,
          },
          createdAt: 2,
        },
      ],
    })
    expect(summarizeProfile(pkg).textures).toBe(2)
  })

  it('rejects project JSON and garbage', () => {
    expect(isProfilePackage({ version: 2, building: {}, assets: {} })).toBe(
      false,
    )
    expect(() => parseProfileJson(JSON.stringify({ version: 2 }))).toThrow(
      /не файл профиля/,
    )
    expect(() => parseProfileJson('{"kind":"nope"}')).toThrow(/не файл профиля/)
  })
})

describe('parseImportJson vs profile', () => {
  it('tells the user to import a profile in profile settings', () => {
    expect(() => parseImportJson(JSON.stringify(sampleProfile()))).toThrow(
      /файл профиля/,
    )
  })
})
