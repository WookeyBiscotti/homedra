import { describe, expect, it } from 'vitest'
import { hitToModelRef } from './types'

describe('hitToModelRef', () => {
  it('maps catalog hits', () => {
    expect(
      hitToModelRef({
        library: 'catalog',
        id: 'chair',
        title: 'Стул',
        license: 'CC0',
      }),
    ).toEqual({ source: 'catalog', assetId: 'chair' })
  })

  it('maps library hits with glbUrl', () => {
    expect(
      hitToModelRef({
        library: 'polyPizza',
        id: 'abc',
        title: 'Chair',
        license: 'CC0',
        glbUrl: 'https://example.com/a.glb',
      }),
    ).toEqual({
      source: 'library',
      library: 'polyPizza',
      id: 'abc',
      glbUrl: 'https://example.com/a.glb',
    })
  })

  it('maps nasa and local', () => {
    expect(
      hitToModelRef({
        library: 'nasa',
        id: 'jwst',
        title: 'JWST',
        license: 'NASA Media',
      }),
    ).toEqual({ source: 'nasa', assetId: 'jwst' })
    expect(
      hitToModelRef({
        library: 'local',
        id: 'local_1',
        title: 'Mine',
        license: 'Private',
      }),
    ).toEqual({ source: 'local', localId: 'local_1' })
  })
})
