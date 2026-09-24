import { describe, expect, it } from 'vitest'
import { planHalfSizeOf, snapObjectXY } from './objectSnap'
import type { Floor, PlacedObject } from '../types'

function floor(partial: Partial<Floor> & Pick<Floor, 'walls' | 'vertices'>): Floor {
  return {
    id: 'f1',
    name: '1',
    kind: 'story',
    elevation: 0,
    height: 2.7,
    slabThickness: 0.2,
    visible: 'solid',
    constraints: [],
    openings: [],
    slabOpenings: [],
    objects: [],
    ...partial,
  }
}

function obj(partial: Partial<PlacedObject> & Pick<PlacedObject, 'id' | 'x' | 'y'>): PlacedObject {
  const base = {
    model: { source: 'url' as const, url: 'x' },
    elevation: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    sizeX: 1,
    sizeY: 1,
    sizeZ: 1,
    planHalfX: 0.5,
    planHalfY: 0.5,
    ...partial,
  }
  if (partial.planHalfX == null || partial.planHalfY == null) {
    const hx = Math.max(0.05, (Math.abs(base.sizeX) * Math.abs(base.scaleX)) / 2)
    const hz = Math.max(0.05, (Math.abs(base.sizeZ) * Math.abs(base.scaleZ)) / 2)
    base.planHalfX = partial.planHalfX ?? hx
    base.planHalfY = partial.planHalfY ?? hz
  }
  return base
}

const half = { x: 0.5, y: 0.5 }

describe('snapObjectXY', () => {
  it('snaps flush to wall finish cladding, not the solid core', () => {
    const f = floor({
      vertices: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 4, y: 0 },
      ],
      walls: [{ id: 'w1', a: 'a', b: 'b', thickness: 0.2 }],
    })
    // halfT 0.1 + finish 0.025 + support 0.5 = 0.625
    const sn = snapObjectXY(f, 2, 0.8, { halfSize: half })
    expect(sn.snappedY).toBe(true)
    expect(sn.y).toBeCloseTo(0.625, 5)
    expect(sn.x).toBeCloseTo(2, 5)
  })

  it('snaps to every wall independently (vertical + horizontal)', () => {
    const f = floor({
      vertices: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 4, y: 0 },
        { id: 'c', x: 0, y: 3 },
      ],
      walls: [
        { id: 'wH', a: 'a', b: 'b', thickness: 0.2 },
        { id: 'wV', a: 'a', b: 'c', thickness: 0.2 },
      ],
    })
    const sn = snapObjectXY(f, 0.75, 0.75, { halfSize: half })
    expect(sn.snappedX).toBe(true)
    expect(sn.snappedY).toBe(true)
    expect(sn.x).toBeCloseTo(0.625, 5)
    expect(sn.y).toBeCloseTo(0.625, 5)
  })

  it('flushes AABB edge to another object without overlapping', () => {
    const f = floor({
      vertices: [],
      walls: [],
      objects: [obj({ id: 'o1', x: 0, y: 0, sizeX: 1, sizeZ: 1 })],
    })
    // other half 0.5, self 0.5 → flush center at ±1.0
    const sn = snapObjectXY(f, 1.15, 0.1, {
      excludeObjectId: 'self',
      halfSize: half,
      otherHalfSizes: { o1: { x: 0.5, y: 0.5 } },
    })
    expect(sn.snappedX).toBe(true)
    expect(sn.x).toBeCloseTo(1.0, 5)
    // Must not snap centers together
    expect(sn.x).not.toBeCloseTo(0, 5)
  })

  it('does not snap object centers on top of each other', () => {
    const f = floor({
      vertices: [],
      walls: [],
      objects: [obj({ id: 'o1', x: 1, y: 2, sizeX: 1, sizeZ: 1 })],
    })
    const sn = snapObjectXY(f, 1.1, 3, {
      excludeObjectId: 'self',
      halfSize: half,
      otherHalfSizes: { o1: { x: 0.5, y: 0.5 } },
    })
    // 1.1 is near center (1.0) but center-align is disabled; flush at 1±1.0
    // |1.1 - 2.0| = 0.9, |1.1 - 0.0| = 1.1 → nearer flush is x=2 if thr allows
    // gapX=1, thrX=max(0.55,1.2)=1.2, dist to 2.0 is 0.9 → snap to 2
    expect(sn.x).toBeCloseTo(2, 5)
    expect(sn.x).not.toBeCloseTo(1, 5)
  })

  it('uses measured planHalf when present', () => {
    const o = obj({
      id: 'a',
      x: 0,
      y: 0,
      sizeX: 2,
      sizeZ: 4,
      scaleX: 0.5,
      scaleZ: 0.5,
      planHalfX: 1.25,
      planHalfY: 0.8,
    })
    const h = planHalfSizeOf(o)
    expect(h.x).toBeCloseTo(1.25, 5)
    expect(h.y).toBeCloseTo(0.8, 5)
  })

  it('estimates from footprint × scale when planHalf missing', () => {
    const o = obj({
      id: 'a',
      x: 0,
      y: 0,
      sizeX: 2,
      sizeZ: 4,
      scaleX: 0.5,
      scaleZ: 0.5,
      rotationY: 0,
      planHalfX: 0,
      planHalfY: 0,
    })
    // 0 is treated as missing → estimate
    const h = planHalfSizeOf({ ...o, planHalfX: 0, planHalfY: 0 })
    expect(h.x).toBeCloseTo(0.5, 5)
    expect(h.y).toBeCloseTo(1.0, 5)
  })

  it('excludes the moved object', () => {
    const f = floor({
      vertices: [],
      walls: [],
      objects: [obj({ id: 'self', x: 5, y: 5 })],
    })
    const sn = snapObjectXY(f, 5.05, 5.05, {
      excludeObjectId: 'self',
      halfSize: half,
    })
    expect(sn.snappedX).toBe(false)
    expect(sn.snappedY).toBe(false)
  })
})
