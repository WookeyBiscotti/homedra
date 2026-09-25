import { beforeEach, describe, expect, it } from 'vitest'
import { useBuildingStore } from '../store/buildingStore'
import {
  createEmptyBuilding,
  createId,
  isGroundFloor,
  isStoryFloor,
} from '../engine/types'

function houseAtOrigin() {
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
  const building = {
    ...b,
    floors: b.floors.map((f) =>
      f.id === story.id
        ? { ...f, vertices: [v1, v2, v3, v4], walls }
        : f,
    ),
  }
  const ground = building.floors.find(isGroundFloor)!
  useBuildingStore.setState({
    building,
    activeFloorId: ground.id,
    workbench: 'draft',
    tool: 'select',
  })
}

describe('landscape workbench', () => {
  beforeEach(() => {
    houseAtOrigin()
  })

  it('switches to the ground floor in 3D exterior', () => {
    useBuildingStore.getState().setWorkbench('landscape')
    const s = useBuildingStore.getState()
    expect(s.workbench).toBe('landscape')
    expect(s.viewMode).toBe('3d')
    expect(s.sceneMode).toBe('exterior')
    expect(isGroundFloor(s.activeFloor())).toBe(true)
    expect(s.activeFloor().landscapeTerrain?.resolution).toBe(128)
  })

  it('places a plant on the ground', () => {
    useBuildingStore.getState().setWorkbench('landscape')
    useBuildingStore.getState().setPendingPlant('cultivatedApple', 1)
    useBuildingStore.getState().placePlantAt(-4, -3)
    const g = useBuildingStore.getState().building.floors.find(isGroundFloor)
    const plant = g?.plants?.find((p) => p.x === -4 && p.y === -3)
    expect(plant).toBeTruthy()
    expect(plant?.species).toBe('cultivatedApple')
    expect(plant?.shape?.height).toBe(5.5)
    expect(plant?.shape?.branchDensity).toBe(16)
    expect(plant?.shape?.leafSize).toBe(0.32)
  })

  it('writes SeedThree grass defaults onto the floor', () => {
    useBuildingStore.getState().setWorkbench('landscape')
    useBuildingStore.getState().setGrassParams({ density: 8 })
    const g = useBuildingStore.getState().building.floors.find(isGroundFloor)
    const layer = g?.landscapeGrass?.layers[0]
    expect(layer?.height).toBe(0.85)
    expect(layer?.width).toBe(1.75)
    expect(layer?.color).toBe('#6fa83c')
  })

  it('keeps a second grass type independent', () => {
    useBuildingStore.getState().setWorkbench('landscape')
    useBuildingStore.getState().setGrassParams({ density: 8, color: '#6fa83c' })
    useBuildingStore.getState().addGrassLayer()
    useBuildingStore.getState().setGrassParams({ density: 12, color: '#4f9d32' })
    const g = useBuildingStore.getState().building.floors.find(isGroundFloor)
    expect(g?.landscapeGrass?.layers).toHaveLength(2)
    expect(g?.landscapeGrass?.layers[0]?.color).toBe('#6fa83c')
    expect(g?.landscapeGrass?.layers[1]?.color).toBe('#4f9d32')
    expect(g?.landscapeGrass?.layers[1]?.density).toBe(12)
  })

  it('rejects a plant inside the building footprint', () => {
    useBuildingStore.getState().setWorkbench('landscape')
    useBuildingStore.getState().setPendingPlant('cultivatedApple', 1)
    useBuildingStore.getState().placePlantAt(2, 2)
    const g = useBuildingStore.getState().building.floors.find(isGroundFloor)
    expect(g?.plants ?? []).toHaveLength(0)
  })

  it('keeps placeObject on the landscape workbench', () => {
    useBuildingStore.getState().setWorkbench('landscape')
    useBuildingStore.getState().setTool('placeObject')
    expect(useBuildingStore.getState().workbench).toBe('landscape')
    expect(useBuildingStore.getState().tool).toBe('placeObject')
  })
})
