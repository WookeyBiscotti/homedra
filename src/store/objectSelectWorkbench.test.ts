import { beforeEach, describe, expect, it } from 'vitest'
import {
  createEmptyBuilding,
  isStoryFloor,
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
    rotationY: 0,
    rotationZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    sizeX: 0.8,
    sizeY: 1,
    sizeZ: 0.8,
    planHalfX: 0.4,
    planHalfY: 0.4,
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

describe('object select / edit only in furnish', () => {
  it('selectObject ignores clicks outside Objects mode', () => {
    const story = useBuildingStore.getState().activeFloor()
    useBuildingStore.setState({ workbench: 'draft', selection: null })
    useBuildingStore.getState().selectObject(story.id, 'obj_src')
    expect(useBuildingStore.getState().selection).toBeNull()
    expect(useBuildingStore.getState().workbench).toBe('draft')
  })

  it('selectAt does not pick objects in Планировка', () => {
    useBuildingStore.setState({ workbench: 'draft', selection: null })
    useBuildingStore.getState().selectAt(1, 2)
    expect(useBuildingStore.getState().selection?.kind).not.toBe('object')
  })

  it('selectAt picks objects in Objects mode', () => {
    useBuildingStore.setState({ selection: null })
    useBuildingStore.getState().selectAt(1, 2)
    expect(useBuildingStore.getState().selection).toEqual({
      kind: 'object',
      id: 'obj_src',
    })
  })

  it('leaving Objects mode drops object selection', () => {
    useBuildingStore.getState().setWorkbench('draft')
    expect(useBuildingStore.getState().selection).toBeNull()
    expect(useBuildingStore.getState().workbench).toBe('draft')
  })

  it('does not copy or resize objects outside Objects mode', () => {
    useBuildingStore.setState({ workbench: 'draft' })
    useBuildingStore.getState().copySelectedObject()
    expect(useBuildingStore.getState().activeFloor().objects).toHaveLength(1)
    useBuildingStore.getState().updatePlacedObject('obj_src', { scaleX: 2 })
    expect(useBuildingStore.getState().activeFloor().objects?.[0]?.scaleX).toBe(
      1,
    )
    useBuildingStore.getState().dragPlacedObject('obj_src', 8, 8)
    expect(useBuildingStore.getState().activeFloor().objects?.[0]?.x).toBe(1)
  })

  it('does not delete objects outside Objects mode', () => {
    useBuildingStore.setState({ workbench: 'draft' })
    useBuildingStore.getState().deleteSelection()
    expect(useBuildingStore.getState().activeFloor().objects).toHaveLength(1)
    expect(useBuildingStore.getState().statusMessage).toBe(
      'Объекты удаляют только в режиме «Объекты».',
    )
  })
})
