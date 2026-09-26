import { describe, expect, it } from 'vitest'
import {
  clonePlacedObject,
  PLACED_OBJECT_COPY_OFFSET,
  type PlacedObject,
} from './types'

function sampleObject(patch?: Partial<PlacedObject>): PlacedObject {
  return {
    id: 'obj_src',
    model: { source: 'catalog', assetId: 'chair' },
    x: 1,
    y: 2,
    elevation: 0.15,
    rotationX: 0.1,
    rotationY: 0.5,
    rotationZ: 0.2,
    scaleX: 1.1,
    scaleY: 0.9,
    scaleZ: 1.2,
    sizeX: 0.8,
    sizeY: 1,
    sizeZ: 0.6,
    planHalfX: 0.4,
    planHalfY: 0.3,
    attribution: { author: 'Ada', license: 'CC0', url: 'https://ex.test' },
    appearance: { tint: '#ff0000', slots: { Seat: { tint: '#00ff00' } } },
    animationTime: 1.25,
    animationDuration: 4,
    ...patch,
  }
}

describe('clonePlacedObject', () => {
  it('assigns a new id and offsets the plan position', () => {
    const src = sampleObject()
    const copy = clonePlacedObject(src)
    expect(copy.id).not.toBe(src.id)
    expect(copy.id.startsWith('obj_')).toBe(true)
    expect(copy.x).toBeCloseTo(src.x + PLACED_OBJECT_COPY_OFFSET)
    expect(copy.y).toBeCloseTo(src.y + PLACED_OBJECT_COPY_OFFSET)
    expect(copy.elevation).toBe(src.elevation)
    expect(copy.rotationY).toBe(src.rotationY)
    expect(copy.scaleX).toBe(src.scaleX)
    expect(copy.model).toEqual(src.model)
    expect(copy.model).not.toBe(src.model)
    expect(copy.animationTime).toBe(src.animationTime)
  })

  it('deep-clones appearance so edits do not leak', () => {
    const src = sampleObject()
    const copy = clonePlacedObject(src)
    expect(copy.appearance).toEqual(src.appearance)
    expect(copy.appearance).not.toBe(src.appearance)
    copy.appearance!.tint = '#0000ff'
    copy.appearance!.slots!.Seat.tint = '#ffffff'
    expect(src.appearance?.tint).toBe('#ff0000')
    expect(src.appearance?.slots?.Seat.tint).toBe('#00ff00')
  })

  it('honours a custom offset', () => {
    const src = sampleObject()
    const copy = clonePlacedObject(src, { offsetX: 2, offsetY: -1 })
    expect(copy.x).toBe(3)
    expect(copy.y).toBe(1)
  })
})
