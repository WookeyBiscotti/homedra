import { describe, expect, it } from 'vitest'
import { placedObjectWorldSize, scaleForWorldSize } from './types'

describe('placedObjectWorldSize', () => {
  it('multiplies native bbox by instance scale', () => {
    expect(
      placedObjectWorldSize({
        sizeX: 0.8,
        sizeY: 1.2,
        sizeZ: 0.4,
        scaleX: 2,
        scaleY: 0.5,
        scaleZ: 1,
      }),
    ).toEqual({ x: 1.6, y: 0.6, z: 0.4 })
  })
})

describe('scaleForWorldSize', () => {
  it('divides world size by native bbox', () => {
    expect(scaleForWorldSize(1.6, 0.8)).toBeCloseTo(2)
  })

  it('clamps tiny and huge scales', () => {
    expect(scaleForWorldSize(0.0001, 1)).toBe(0.001)
    expect(scaleForWorldSize(100, 1)).toBe(20)
  })

  it('keeps cm-authored models at catalog scale', () => {
    expect(scaleForWorldSize(0.8, 80)).toBeCloseTo(0.01)
  })

  it('falls back when native size is zero', () => {
    expect(scaleForWorldSize(2, 0)).toBe(20)
  })
})
