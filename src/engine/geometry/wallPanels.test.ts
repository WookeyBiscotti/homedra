import { describe, expect, it } from 'vitest'
import { wallFinishPanels, wallFinishPanelSegments } from './wallPanels'
import { createId, type Floor } from '../types'

function rectFloor(): Floor {
  return {
    id: createId('floor'),
    name: 'Test',
    kind: 'story',
    elevation: 0,
    height: 2.8,
    slabThickness: 0.2,
    visible: 'solid',
    vertices: [
      { id: 'v1', x: 0, y: 0 },
      { id: 'v2', x: 6, y: 0 },
      { id: 'v3', x: 6, y: 4 },
      { id: 'v4', x: 0, y: 4 },
    ],
    walls: [
      { id: 'w1', a: 'v1', b: 'v2', thickness: 0.2 },
      { id: 'w2', a: 'v2', b: 'v3', thickness: 0.2 },
      { id: 'w3', a: 'v3', b: 'v4', thickness: 0.2 },
      { id: 'w4', a: 'v4', b: 'v1', thickness: 0.2 },
    ],
    openings: [],
    slabOpenings: [],
    constraints: [],
  }
}

describe('wallFinishPanels', () => {
  it('places two side panels offset from the centerline', () => {
    const floor = rectFloor()
    const wall = floor.walls[0]
    const panels = wallFinishPanels(floor, wall)
    expect(panels).toHaveLength(2)
    const pos = panels.find((p) => p.side === 'pos')!
    const neg = panels.find((p) => p.side === 'neg')!
    // Wall along X at y=0 → world Z=0 centerline; sides offset in ±Z
    expect(pos.position[0]).toBeCloseTo(3, 5)
    expect(neg.position[0]).toBeCloseTo(3, 5)
    expect(pos.position[1]).toBeCloseTo(1.4, 5)
    expect(Math.abs(pos.position[2] - neg.position[2])).toBeGreaterThan(0.15)
  })

  it('cuts panels around a door opening', () => {
    const floor = rectFloor()
    floor.openings = [
      {
        id: 'o1',
        wallId: 'w1',
        kind: 'door',
        offset: 3,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
      },
    ]
    const segs = wallFinishPanelSegments(floor, floor.walls[0], 'pos')
    expect(segs.length).toBeGreaterThan(1)
    // Door band (~0–2.1): two side strips, total width < full wall
    const doorBand = segs.filter((p) => p.position[1] < 1.2)
    const doorW = doorBand.reduce((s, p) => s + p.width, 0)
    expect(doorW).toBeLessThan(5.5)
    expect(doorW).toBeGreaterThan(4)
  })
})
