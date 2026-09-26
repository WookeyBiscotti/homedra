import { describe, expect, it } from 'vitest'
import { createEmptyFloor } from '../types'
import {
  createVolumeBoxFromDrag,
  createVolumeCutoutFromDrag,
  findBoxForCutout,
  hitVolumeBox,
  hitVolumeCutout,
  moveVolumeBox,
  removeVolumeBox,
  volumeBoxRect,
} from './volumeBoxes'
import {
  extrudeVolumeBox,
  volumeBoxHeightBands,
} from './volumeBoxMesh'

describe('volumeBoxes', () => {
  it('creates a box from drag with min size defaults', () => {
    const box = createVolumeBoxFromDrag(0, 0, 0.05, 0.05)
    expect(box.width).toBeGreaterThanOrEqual(0.2)
    expect(box.depth).toBeGreaterThanOrEqual(0.2)
    expect(box.height).toBeCloseTo(0.4, 5)
    expect(box.elevation).toBe(0)
    expect(volumeBoxRect(box)).toHaveLength(4)
  })

  it('uses drag size when large enough', () => {
    const box = createVolumeBoxFromDrag(0, 0, 2, 1)
    expect(box.width).toBeCloseTo(2, 5)
    expect(box.depth).toBeCloseTo(1, 5)
    expect(box.x).toBeCloseTo(1, 5)
    expect(box.y).toBeCloseTo(0.5, 5)
  })

  it('hits box and cutout by plan point', () => {
    const floor = createEmptyFloor('t')
    const box = {
      id: 'box1',
      x: 2,
      y: 2,
      width: 2,
      depth: 2,
      elevation: 0,
      height: 0.4,
    }
    const cut = {
      id: 'cut1',
      boxId: 'box1',
      x: 2,
      y: 2,
      width: 0.6,
      depth: 0.6,
      elevation: 0,
      height: 0.4,
    }
    floor.boxes = [box]
    floor.boxCutouts = [cut]
    expect(hitVolumeBox(floor, 2, 2)?.id).toBe('box1')
    expect(hitVolumeCutout(floor, 2, 2)?.id).toBe('cut1')
    expect(hitVolumeBox(floor, 10, 10)).toBeUndefined()
  })

  it('picks the overlapping box for a cutout, preferring selection', () => {
    const floor = createEmptyFloor('t')
    floor.boxes = [
      { id: 'a', x: 0, y: 0, width: 2, depth: 2, elevation: 0, height: 0.4 },
      { id: 'b', x: 1.5, y: 0, width: 2, depth: 2, elevation: 0, height: 0.4 },
    ]
    const rect = { minX: 0.6, maxX: 0.9, minY: -0.2, maxY: 0.2 }
    expect(findBoxForCutout(floor, rect)?.id).toBeDefined()
    expect(findBoxForCutout(floor, rect, 'a')?.id).toBe('a')
    expect(findBoxForCutout(floor, { minX: 20, maxX: 21, minY: 20, maxY: 21 })).toBeUndefined()
  })

  it('moves a box together with its cutouts', () => {
    const floor = createEmptyFloor('t')
    floor.boxes = [
      { id: 'box1', x: 0, y: 0, width: 2, depth: 1, elevation: 0, height: 0.4 },
    ]
    floor.boxCutouts = [
      {
        id: 'cut1',
        boxId: 'box1',
        x: 0.2,
        y: 0,
        width: 0.4,
        depth: 0.4,
        elevation: 0,
        height: 0.4,
      },
    ]
    const next = moveVolumeBox(floor, 'box1', 1, 2)
    expect(next.boxes?.[0]?.x).toBe(1)
    expect(next.boxes?.[0]?.y).toBe(2)
    expect(next.boxCutouts?.[0]?.x).toBeCloseTo(1.2, 5)
    expect(next.boxCutouts?.[0]?.y).toBeCloseTo(2, 5)
  })

  it('deletes a box and its cutouts', () => {
    const floor = createEmptyFloor('t')
    floor.boxes = [
      { id: 'box1', x: 0, y: 0, width: 1, depth: 1, elevation: 0, height: 0.4 },
    ]
    floor.boxCutouts = [
      {
        id: 'cut1',
        boxId: 'box1',
        x: 0,
        y: 0,
        width: 0.3,
        depth: 0.3,
        elevation: 0,
        height: 0.4,
      },
    ]
    const next = removeVolumeBox(floor, 'box1')
    expect(next.boxes).toHaveLength(0)
    expect(next.boxCutouts).toHaveLength(0)
  })

  it('inherits parent box height when creating a cutout', () => {
    const box = createVolumeBoxFromDrag(0, 0, 2, 1)
    box.elevation = 1.2
    box.height = 0.5
    const cut = createVolumeCutoutFromDrag(0.2, 0.2, 0.8, 0.6, box)
    expect(cut.boxId).toBe(box.id)
    expect(cut.elevation).toBe(1.2)
    expect(cut.height).toBe(0.5)
  })
})

describe('volumeBoxMesh', () => {
  it('extrudes a solid box as a single layer', () => {
    const floor = createEmptyFloor('t')
    const box = createVolumeBoxFromDrag(0, 0, 2, 1)
    floor.boxes = [box]
    const solid = extrudeVolumeBox(floor, box)
    expect(solid.layers).toHaveLength(1)
    expect(solid.layers[0]?.height).toBeCloseTo(box.height, 5)
    expect(solid.layers[0]?.rings).toHaveLength(1)
    expect(solid.layers[0]?.holes[0]).toHaveLength(0)
  })

  it('splits height bands and punches a through cutout', () => {
    const floor = createEmptyFloor('t')
    const box = {
      id: 'box1',
      x: 0,
      y: 0,
      width: 2,
      depth: 2,
      elevation: 0,
      height: 0.4,
    }
    const cut = {
      id: 'cut1',
      boxId: 'box1',
      x: 0,
      y: 0,
      width: 0.6,
      depth: 0.6,
      elevation: 0,
      height: 0.4,
    }
    floor.boxes = [box]
    floor.boxCutouts = [cut]
    expect(volumeBoxHeightBands(box, [cut])).toEqual([0, 0.4])
    const solid = extrudeVolumeBox(floor, box)
    expect(solid.layers).toHaveLength(1)
    expect(solid.layers[0]?.holes[0]?.length).toBeGreaterThanOrEqual(1)
  })

  it('keeps solid bands around a partial-height cutout', () => {
    const floor = createEmptyFloor('t')
    const box = {
      id: 'box1',
      x: 0,
      y: 0,
      width: 2,
      depth: 2,
      elevation: 0,
      height: 0.8,
    }
    const cut = {
      id: 'cut1',
      boxId: 'box1',
      x: 0,
      y: 0,
      width: 0.6,
      depth: 0.6,
      elevation: 0.3,
      height: 0.2,
    }
    floor.boxes = [box]
    floor.boxCutouts = [cut]
    const bands = volumeBoxHeightBands(box, [cut])
    expect(bands).toEqual([0, 0.3, 0.5, 0.8])
    const solid = extrudeVolumeBox(floor, box)
    expect(solid.layers).toHaveLength(3)
    const mid = solid.layers.find((l) => Math.abs(l.y - 0.3) < 1e-6)
    expect(mid?.holes[0]?.length).toBeGreaterThanOrEqual(1)
    const bottom = solid.layers.find((l) => Math.abs(l.y - 0) < 1e-6)
    expect(bottom?.holes[0]).toHaveLength(0)
  })
})
