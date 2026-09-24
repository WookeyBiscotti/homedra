import { describe, expect, it } from 'vitest'
import { publicUrl } from './publicUrl'

describe('publicUrl', () => {
  it('prefixes Vite BASE_URL for public/ paths', () => {
    const base = import.meta.env.BASE_URL || '/'
    expect(publicUrl('ambientcg-catalog.json')).toBe(
      `${base}ambientcg-catalog.json`,
    )
    expect(publicUrl('/icons/tools/wall.svg')).toBe(
      publicUrl('icons/tools/wall.svg'),
    )
  })

  it('leaves remote and object URLs unchanged', () => {
    expect(publicUrl('https://cdn.example/a.jpg')).toBe(
      'https://cdn.example/a.jpg',
    )
    expect(publicUrl('blob:http://localhost/1')).toBe('blob:http://localhost/1')
    expect(publicUrl('data:image/png;base64,aa')).toBe(
      'data:image/png;base64,aa',
    )
  })

  it('is idempotent when the path already includes BASE_URL', () => {
    const once = publicUrl('ambientcg-catalog.json')
    expect(publicUrl(once)).toBe(once)
  })
})
