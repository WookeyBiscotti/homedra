import { describe, expect, it } from 'vitest'
import {
  createEmptyBuilding,
  createId,
  isStoryFloor,
} from '../engine/types'
import { encodeHeights } from './maps'
import {
  applyPlotFrame,
  clampHouseDelta,
  houseOffsetOnPlot,
  housePlanOutline,
  resizePlotEdge,
  translateStories,
} from './site'

function houseBuilding() {
  const b = createEmptyBuilding()
  const story = b.floors.find(isStoryFloor)!
  const v1 = { id: createId('v'), x: 0, y: 0 }
  const v2 = { id: createId('v'), x: 6, y: 0 }
  const v3 = { id: createId('v'), x: 6, y: 4 }
  const v4 = { id: createId('v'), x: 0, y: 4 }
  const walls = [
    { id: createId('wall'), a: v1.id, b: v2.id, thickness: 0.2 },
    { id: createId('wall'), a: v2.id, b: v3.id, thickness: 0.2 },
    { id: createId('wall'), a: v3.id, b: v4.id, thickness: 0.2 },
    { id: createId('wall'), a: v4.id, b: v1.id, thickness: 0.2 },
  ]
  return {
    ...b,
    floors: b.floors.map((f) =>
      f.id === story.id
        ? { ...f, vertices: [v1, v2, v3, v4], walls }
        : f,
    ),
  }
}

describe('landscape plot', () => {
  it('translates story vertices and keeps ground plants', () => {
    const building = houseBuilding()
    const ground = building.floors[0]!
    building.floors[0] = {
      ...ground,
      plants: [
        {
          id: 'p1',
          species: 'ponderosaPine',
          seed: 1,
          x: -8,
          y: -2,
          rotationY: 0,
          scale: 1,
        },
      ],
    }
    const next = translateStories(building, 3, -1)
    const story = next.floors.find(isStoryFloor)!
    expect(story.vertices[0]?.x).toBe(3)
    expect(story.vertices[0]?.y).toBe(-1)
    expect(next.floors[0]?.plants?.[0]?.x).toBe(-8)
  })

  it('clamps the house inside the plot', () => {
    const building = houseBuilding()
    const frame = { size: 20, sizeY: 16, originX: 3, originY: 2 }
    const far = clampHouseDelta(building, 40, 0, frame)
    expect(far.dx).toBeLessThan(20)
    const offset = houseOffsetOnPlot(
      translateStories(building, far.dx, far.dy),
      frame,
    )
    expect(Math.abs(offset.x)).toBeLessThan(10)
  })

  it('resizes one edge and keeps the opposite', () => {
    const building = houseBuilding()
    const frame = { size: 40, sizeY: 30, originX: 3, originY: 2 }
    const next = resizePlotEdge(frame, 'x+', 30, building)
    expect(next.size).toBeCloseTo(47, 5)
    expect(next.originX).toBeCloseTo(6.5, 5)
    expect(next.sizeY).toBeCloseTo(30, 5)
  })

  it('resamples height in world space when the plot grows', () => {
    const res = 5
    const heights = new Float32Array(res * res)
    heights[12] = 1.2
    const prev = {
      resolution: 128 as const,
      size: 10,
      sizeY: 10,
      originX: 0,
      originY: 0,
      heightPng: encodeHeights(heights),
    }
    const applied = applyPlotFrame(
      prev,
      undefined,
      undefined,
      { size: 20, sizeY: 10, originX: 0, originY: 0 },
    )
    expect(applied.terrain.size).toBe(20)
    expect(applied.terrain.sizeY).toBe(10)
    expect(applied.terrain.heightPng).toBeTruthy()
  })

  it('reports house offset from the plot centre', () => {
    const building = houseBuilding()
    const off = houseOffsetOnPlot(building, {
      size: 40,
      sizeY: 40,
      originX: 3,
      originY: 2,
    })
    expect(off.x).toBeCloseTo(0, 5)
    expect(off.y).toBeCloseTo(0, 5)
  })

  it('returns a closed house outline from the story walls', () => {
    const rings = housePlanOutline(houseBuilding())
    expect(rings.length).toBe(1)
    const xs = rings[0].map((p) => p.x)
    const ys = rings[0].map((p) => p.y)
    expect(Math.min(...xs)).toBeCloseTo(-0.1, 2)
    expect(Math.max(...xs)).toBeCloseTo(6.1, 2)
    expect(Math.min(...ys)).toBeCloseTo(-0.1, 2)
    expect(Math.max(...ys)).toBeCloseTo(4.1, 2)
  })
})
