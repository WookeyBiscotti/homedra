import { describe, expect, it } from 'vitest'
import {
  createSlabOpeningFromDrag,
  hitSlabOpening,
  slabOpeningCorners,
  SLAB_OPENING_MIN,
} from './slabOpenings'
import { createEmptyFloor } from '../types'

describe('slab openings', () => {
  it('creates stair well from drag with min size', () => {
    const o = createSlabOpeningFromDrag(1, 1, 1.2, 1.1)
    expect(o.kind).toBe('stair')
    expect(o.width).toBeGreaterThanOrEqual(SLAB_OPENING_MIN)
    expect(o.depth).toBeGreaterThanOrEqual(SLAB_OPENING_MIN)
    expect(o.x).toBeCloseTo(1.1, 5)
    expect(o.y).toBeCloseTo(1.05, 5)
  })

  it('uses drag size when large enough', () => {
    const o = createSlabOpeningFromDrag(0, 0, 2, 3)
    expect(o.width).toBeCloseTo(2, 5)
    expect(o.depth).toBeCloseTo(3, 5)
    expect(o.x).toBeCloseTo(1, 5)
    expect(o.y).toBeCloseTo(1.5, 5)
  })

  it('hits opening by center point', () => {
    const floor = createEmptyFloor('t')
    const o = createSlabOpeningFromDrag(0, 0, 2, 2)
    floor.slabOpenings = [o]
    expect(hitSlabOpening(floor, 1, 1)?.id).toBe(o.id)
    expect(hitSlabOpening(floor, 5, 5)).toBeUndefined()
    const c = slabOpeningCorners(o)
    expect(c.minX).toBeCloseTo(0, 5)
    expect(c.maxY).toBeCloseTo(2, 5)
  })
})
