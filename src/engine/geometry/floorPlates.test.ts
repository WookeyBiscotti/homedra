import { describe, expect, it } from 'vitest'
import {
  createFloorPlateFromDrag,
  floorPlateKey,
  floorPlateRect,
  hitFloorPlate,
} from './floorPlates'
import { createEmptyFloor } from '../types'

describe('floorPlates', () => {
  it('creates plate from drag with min size defaults', () => {
    const p = createFloorPlateFromDrag(0, 0, 0.1, 0.1)
    expect(p.width).toBeGreaterThanOrEqual(0.5)
    expect(p.depth).toBeGreaterThanOrEqual(0.5)
    expect(floorPlateRect(p)).toHaveLength(4)
  })

  it('uses drag size when large enough', () => {
    const p = createFloorPlateFromDrag(0, 0, 5, 3)
    expect(p.width).toBeCloseTo(5, 5)
    expect(p.depth).toBeCloseTo(3, 5)
    expect(p.x).toBeCloseTo(2.5, 5)
    expect(p.y).toBeCloseTo(1.5, 5)
  })

  it('hits plate by plan point', () => {
    const floor = createEmptyFloor('t')
    floor.plates = [
      { id: 'plt1', x: 2, y: 2, width: 4, depth: 2 },
    ]
    expect(hitFloorPlate(floor, 2, 2)?.id).toBe('plt1')
    expect(hitFloorPlate(floor, 10, 10)).toBeUndefined()
    expect(floorPlateKey('plt1')).toBe('plate:plt1')
  })
})
