import { describe, expect, it } from 'vitest'
import {
  isImageFile,
  materialCacheKey,
  materialLabel,
  materialRefFromCustom,
  nameFromImageUrl,
  normalizeTextureUrl,
  TextureImportError,
} from './customTextures'

describe('normalizeTextureUrl', () => {
  it('accepts http(s) and data image URLs', () => {
    expect(normalizeTextureUrl(' https://cdn.example/a.png ')).toBe(
      'https://cdn.example/a.png',
    )
    expect(normalizeTextureUrl('data:image/png;base64,aa')).toBe(
      'data:image/png;base64,aa',
    )
  })

  it('rejects empty, ftp, and garbage', () => {
    expect(() => normalizeTextureUrl('')).toThrow(TextureImportError)
    expect(() => normalizeTextureUrl('ftp://x/a.png')).toThrow(TextureImportError)
    expect(() => normalizeTextureUrl('not a url')).toThrow(TextureImportError)
  })
})

describe('nameFromImageUrl', () => {
  it('uses the file stem, then host', () => {
    expect(nameFromImageUrl('https://cdn.example/wood/Oak_Floor.jpg')).toBe(
      'Oak_Floor',
    )
    expect(nameFromImageUrl('https://textures.example/')).toBe(
      'textures.example',
    )
    expect(nameFromImageUrl('data:image/png;base64,aa')).toBe('Изображение')
  })
})

describe('isImageFile', () => {
  it('accepts image MIME or extension', () => {
    expect(isImageFile({ name: 'a.bin', type: 'image/png' })).toBe(true)
    expect(isImageFile({ name: 'floor.WEBP', type: '' })).toBe(true)
    expect(isImageFile({ name: 'notes.txt', type: 'text/plain' })).toBe(false)
  })
})

describe('material helpers', () => {
  it('builds a custom MaterialRef and labels it', () => {
    const ref = materialRefFromCustom({
      id: 'tex_abc',
      name: 'Oak',
      blob: new Blob(),
      createdAt: 1,
      url: 'https://cdn.example/oak.jpg',
    })
    expect(ref).toEqual({
      source: 'custom',
      assetId: 'tex_abc',
      tileSizeM: 1.5,
      url: 'https://cdn.example/oak.jpg',
      name: 'Oak',
    })
    expect(materialCacheKey(ref)).toBe('custom:tex_abc')
    expect(materialLabel(ref)).toBe('Oak')
    expect(
      materialCacheKey({ source: 'ambientcg', assetId: 'Wood048', tileSizeM: 1 }),
    ).toBe('ambientcg:Wood048')
    expect(materialLabel(null)).toBe('Нет текстуры')
  })
})
