import { describe, expect, it } from 'vitest'
import { applyFloorCopy, DEFAULT_COPY_FLOOR_OPTIONS } from './copyFloor'
import { createEmptyFloor, createId, type Floor } from './types'

function sampleFloor(): Floor {
  const v1 = { id: createId('v'), x: 0, y: 0 }
  const v2 = { id: createId('v'), x: 4, y: 0 }
  const v3 = { id: createId('v'), x: 4, y: 3 }
  const w1 = { id: createId('wall'), a: v1.id, b: v2.id, thickness: 0.2 }
  const w2 = { id: createId('wall'), a: v2.id, b: v3.id, thickness: 0.2 }
  return {
    ...createEmptyFloor('Источник', 0, 2.8),
    vertices: [v1, v2, v3],
    walls: [w1, w2],
    constraints: [
      { id: createId('c'), type: 'fixedLength', wallId: w1.id, length: 4 },
      { id: createId('c'), type: 'fixedPosition', vertexId: v1.id },
    ],
    openings: [
      {
        id: createId('op'),
        wallId: w1.id,
        kind: 'door',
        offset: 1,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
      },
      {
        id: createId('op'),
        wallId: w1.id,
        kind: 'window',
        offset: 2.5,
        width: 1.2,
        height: 1.4,
        sillHeight: 0.9,
      },
      {
        id: createId('op'),
        wallId: w2.id,
        kind: 'passage',
        offset: 1,
        width: 1,
        height: 2.1,
        sillHeight: 0,
      },
    ],
  }
}

describe('applyFloorCopy', () => {
  it('copies walls, constraints and selected openings with new ids', () => {
    const source = sampleFloor()
    const target = createEmptyFloor('Этаж 2', 2.8, 2.8)
    const result = applyFloorCopy(target, source, {
      ...DEFAULT_COPY_FLOOR_OPTIONS,
      stairs: false,
    })

    expect(result.id).toBe(target.id)
    expect(result.name).toBe('Этаж 2')
    expect(result.elevation).toBe(2.8)
    expect(result.vertices).toHaveLength(3)
    expect(result.walls).toHaveLength(2)
    expect(result.constraints).toHaveLength(2)
    expect(result.openings).toHaveLength(3)

    const sourceIds = new Set([
      ...source.vertices.map((v) => v.id),
      ...source.walls.map((w) => w.id),
      ...source.constraints.map((c) => c.id),
      ...source.openings.map((o) => o.id),
    ])
    for (const v of result.vertices) expect(sourceIds.has(v.id)).toBe(false)
    for (const w of result.walls) {
      expect(sourceIds.has(w.id)).toBe(false)
      expect(result.vertices.some((v) => v.id === w.a)).toBe(true)
      expect(result.vertices.some((v) => v.id === w.b)).toBe(true)
    }
    for (const o of result.openings) {
      expect(sourceIds.has(o.id)).toBe(false)
      expect(result.walls.some((w) => w.id === o.wallId)).toBe(true)
    }
  })

  it('filters opening kinds', () => {
    const source = sampleFloor()
    const target = createEmptyFloor('Этаж 2', 2.8, 2.8)
    const result = applyFloorCopy(target, source, {
      walls: true,
      constraints: false,
      doors: true,
      windows: false,
      passages: false,
      stairs: false,
    })

    expect(result.constraints).toHaveLength(0)
    expect(result.openings).toHaveLength(1)
    expect(result.openings[0].kind).toBe('door')
  })

  it('copies only walls when openings unchecked', () => {
    const source = sampleFloor()
    const target = createEmptyFloor('Этаж 2', 2.8, 2.8)
    const result = applyFloorCopy(target, source, {
      walls: true,
      constraints: false,
      doors: false,
      windows: false,
      passages: false,
      stairs: false,
    })

    expect(result.walls).toHaveLength(2)
    expect(result.openings).toHaveLength(0)
    expect(result.constraints).toHaveLength(0)
  })
})
