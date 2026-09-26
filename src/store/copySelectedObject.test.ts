import { beforeEach, describe, expect, it } from 'vitest'
import {
  createEmptyBuilding,
  isStoryFloor,
  PLACED_OBJECT_COPY_OFFSET,
  type PlacedObject,
} from '../engine/types'
import { useBuildingStore } from './buildingStore'

function chair(id: string): PlacedObject {
  return {
    id,
    model: { source: 'catalog', assetId: 'chair' },
    x: 1,
    y: 2,
    elevation: 0,
    rotationX: 0,
    rotationY: 0.3,
    rotationZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    sizeX: 0.8,
    sizeY: 1,
    sizeZ: 0.8,
    planHalfX: 0.4,
    planHalfY: 0.4,
    appearance: { tint: '#aabbcc' },
  }
}

beforeEach(() => {
  const building = createEmptyBuilding()
  const story = building.floors.find(isStoryFloor)!
  story.objects = [chair('obj_src')]
  useBuildingStore.setState({
    building,
    activeFloorId: story.id,
    selection: { kind: 'object', id: 'obj_src' },
    workbench: 'furnish',
    tool: 'select',
    statusMessage: null,
    history: [],
    future: [],
  })
})

describe('copySelectedObject', () => {
  it('duplicates the selected object and selects the copy', () => {
    useBuildingStore.getState().copySelectedObject()
    const floor = useBuildingStore.getState().activeFloor()
    const objects = floor.objects ?? []
    expect(objects).toHaveLength(2)
    const src = objects.find((o) => o.id === 'obj_src')!
    const copy = objects.find((o) => o.id !== 'obj_src')!
    expect(copy.model).toEqual(src.model)
    expect(copy.x).toBeCloseTo(src.x + PLACED_OBJECT_COPY_OFFSET)
    expect(copy.y).toBeCloseTo(src.y + PLACED_OBJECT_COPY_OFFSET)
    expect(copy.appearance).toEqual(src.appearance)
    expect(copy.appearance).not.toBe(src.appearance)
    expect(useBuildingStore.getState().selection).toEqual({
      kind: 'object',
      id: copy.id,
    })
    expect(useBuildingStore.getState().statusMessage).toBe('Объект скопирован')
  })

  it('does nothing when nothing is selected', () => {
    useBuildingStore.setState({ selection: null })
    useBuildingStore.getState().copySelectedObject()
    expect(useBuildingStore.getState().activeFloor().objects).toHaveLength(1)
    expect(useBuildingStore.getState().statusMessage).toBe(
      'Сначала выберите объект',
    )
  })
})
