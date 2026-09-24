import { describe, expect, it } from 'vitest'
import { paginateHits } from './catalog'
import type { ModelHit } from './types'

function hits(n: number): ModelHit[] {
  return Array.from({ length: n }, (_, i) => ({
    library: 'catalog' as const,
    id: `id${i}`,
    title: `Item ${i}`,
    license: 'CC0',
  }))
}

describe('paginateHits', () => {
  it('returns first page and total', () => {
    const r = paginateHits(hits(25), { page: 1, limit: 12 })
    expect(r.hits).toHaveLength(12)
    expect(r.total).toBe(25)
    expect(r.nextCursor).toBe('2')
    expect(r.hits[0]?.id).toBe('id0')
  })

  it('returns last partial page', () => {
    const r = paginateHits(hits(25), { page: 3, limit: 12 })
    expect(r.hits).toHaveLength(1)
    expect(r.total).toBe(25)
    expect(r.nextCursor).toBeUndefined()
    expect(r.hits[0]?.id).toBe('id24')
  })

  it('empty list', () => {
    const r = paginateHits([], { page: 1, limit: 12 })
    expect(r.hits).toHaveLength(0)
    expect(r.total).toBe(0)
    expect(r.nextCursor).toBeUndefined()
  })
})
