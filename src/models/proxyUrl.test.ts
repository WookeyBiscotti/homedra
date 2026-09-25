import { describe, expect, it } from 'vitest'
import { proxiedAssetUrl, proxiedTextureUrl } from './proxyUrl'

describe('proxiedTextureUrl', () => {
  it('leaves blob, data, and already-proxied URLs alone', () => {
    expect(proxiedTextureUrl('blob:http://localhost/1')).toBe(
      'blob:http://localhost/1',
    )
    expect(proxiedTextureUrl('data:image/png;base64,aa')).toBe(
      'data:image/png;base64,aa',
    )
    expect(proxiedTextureUrl('/proxy/tex?url=https://x/a.png')).toBe(
      '/proxy/tex?url=https://x/a.png',
    )
  })

  it('rewrites remote images through /proxy/tex', () => {
    expect(proxiedTextureUrl('https://cdn.example/wood.jpg')).toBe(
      '/proxy/tex?url=https%3A%2F%2Fcdn.example%2Fwood.jpg',
    )
  })

  it('does not change the model proxy path helper', () => {
    expect(proxiedAssetUrl('https://dl.polyhaven.org/a.glb')).toBe(
      '/proxy/ext?url=https%3A%2F%2Fdl.polyhaven.org%2Fa.glb',
    )
  })
})
