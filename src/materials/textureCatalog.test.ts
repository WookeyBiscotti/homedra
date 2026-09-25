import { describe, expect, it } from 'vitest'
import { resolveMaps } from './ambientcg'
import { pickPolyHavenJpg } from './catalogs/polyhavenTextures'
import {
  materialRefFromHit,
  tabForMaterial,
} from './textureCatalog'
import { materialCacheKey, materialLabel } from './customTextures'

describe('pickPolyHavenJpg', () => {
  it('prefers 1k jpg on named maps', () => {
    const files = {
      blend: { '1k': { blend: { url: 'https://x/skip.blend' } } },
      Diffuse: {
        '4k': { jpg: { url: 'https://x/diff_4k.jpg' } },
        '1k': { jpg: { url: 'https://x/diff_1k.jpg' }, png: { url: 'https://x/diff_1k.png' } },
      },
      nor_gl: {
        '2k': { jpg: { url: 'https://x/nor_2k.jpg' } },
      },
    }
    expect(pickPolyHavenJpg(files, ['Diffuse', 'diff'])).toBe(
      'https://x/diff_1k.jpg',
    )
    expect(pickPolyHavenJpg(files, ['nor_gl'])).toBe('https://x/nor_2k.jpg')
    expect(pickPolyHavenJpg(files, ['Metal'])).toBeUndefined()
    expect(
      pickPolyHavenJpg(
        { arm: { '1k': { jpg: { url: 'https://x/arm_1k.jpg' } } } },
        ['Metal', 'metal', 'arm'],
      ),
    ).toBe('https://x/arm_1k.jpg')
    expect(
      pickPolyHavenJpg(
        {
          disp: { '1k': { jpg: { url: 'https://x/disp_1k.jpg' } } },
        },
        ['Displacement', 'disp'],
      ),
    ).toBe('https://x/disp_1k.jpg')
  })
})

describe('resolveMaps', () => {
  it('includes ambientCG displacement preview URL', () => {
    const maps = resolveMaps('PavingStones050')
    expect(maps.displacement).toContain('PavingStones050_SQ_Displacement.jpg')
  })
})

describe('materialRefFromHit', () => {
  it('keeps ambientCG as source ambientcg', () => {
    const ref = materialRefFromHit({
      library: 'ambientcg',
      id: 'Wood048',
      title: 'Wood',
      thumbnailUrl: 'https://x/w.jpg',
      tileSizeM: 2,
    })
    expect(ref.source).toBe('ambientcg')
    expect(ref.assetId).toBe('Wood048')
    expect(ref.tileSizeM).toBe(2)
  })

  it('stores photo URL for Pixabay', () => {
    const ref = materialRefFromHit({
      library: 'pixabay',
      id: '99',
      title: 'Brick wall',
      thumbnailUrl: 'https://x/t.jpg',
      colorUrl: 'https://x/large.jpg',
    })
    expect(ref).toMatchObject({
      source: 'pixabay',
      assetId: '99',
      url: 'https://x/large.jpg',
      name: 'Brick wall',
    })
    expect(materialCacheKey(ref)).toBe('pixabay:99')
    expect(materialLabel(ref)).toBe('Brick wall')
    expect(tabForMaterial(ref)).toBe('pixabay')
  })
})
