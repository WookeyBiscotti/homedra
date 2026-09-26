import { TransformControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { tickEzTreeWind } from '../../landscape/eztree'
import { tickFoliageWind } from '../../landscape/foliageWind'
import { heightAt } from '../../landscape/terrain'
import { growPlant } from '../../landscape/seedthree'
import type { LandscapePlant } from '../../engine/types'
import { useBuildingStore } from '../../store/buildingStore'

function PlantInstance({
  plant,
  groundY,
  selected,
}: {
  plant: LandscapePlant
  groundY: number
  selected: boolean
}) {
  const mesh = useMemo(
    () => growPlant(plant.species, plant.seed, plant.shape),
    [plant.species, plant.seed, plant.shape],
  )
  const terrain = useBuildingStore(
    (s) => s.building.floors.find((f) => f.kind === 'ground')?.landscapeTerrain,
  )
  const sceneMode = useBuildingStore((s) => s.sceneMode)
  const gizmoMode = useBuildingStore((s) => s.transformGizmoMode)
  const setDragging = useBuildingStore((s) => s.setTransformDragging)
  const updatePlant = useBuildingStore((s) => s.updatePlant)
  const selectPlant = useBuildingStore((s) => s.selectPlant)
  const rootRef = useRef<THREE.Group>(null)

  const y = groundY + heightAt(terrain, plant.x, plant.y)

  // World pose lives on a stable wrapper so remeshing (shape sliders) cannot
  // drop the tree back to the origin of a freshly cloned growPlant group.
  useLayoutEffect(() => {
    const g = rootRef.current
    if (!g) return
    g.position.set(plant.x, y, -plant.y)
    g.rotation.y = plant.rotationY
    g.scale.setScalar(plant.scale)
  }, [plant.x, plant.y, plant.rotationY, plant.scale, y])

  return (
    <>
      <group
        ref={rootRef}
        frustumCulled={false}
        userData={{ pickKind: 'plant', plantId: plant.id }}
        onPointerDown={(e: { stopPropagation: () => void; button: number }) => {
          if (e.button !== 0) return
          e.stopPropagation()
          selectPlant(plant.id)
        }}
      >
        <primitive object={mesh} />
      </group>
      {selected && sceneMode !== 'visit' && sceneMode !== 'paint' && (
        <TransformControls
          object={rootRef as RefObject<THREE.Object3D>}
          mode={gizmoMode === 'scale' ? 'scale' : gizmoMode === 'rotate' ? 'rotate' : 'translate'}
          onMouseDown={() => setDragging(true)}
          onMouseUp={() => {
            setDragging(false)
            const g = rootRef.current
            if (!g) return
            updatePlant(plant.id, {
              x: g.position.x,
              y: -g.position.z,
              rotationY: g.rotation.y,
              scale: (g.scale.x + g.scale.y + g.scale.z) / 3,
            })
          }}
        />
      )}
    </>
  )
}

export function LandscapePlants({ shadowsEnabled }: { shadowsEnabled: boolean }) {
  const ground = useBuildingStore((s) =>
    s.building.floors.find((f) => f.kind === 'ground'),
  )
  const selection = useBuildingStore((s) => s.selection)
  const sceneMode = useBuildingStore((s) => s.sceneMode)
  const plants = ground?.plants ?? []

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    tickFoliageWind(t, sceneMode === 'visit' ? 0.55 : 1)
    tickEzTreeWind(t)
  })

  if (!ground || plants.length === 0) return null
  void shadowsEnabled
  return (
    <group>
      {plants.map((p) => (
        <PlantInstance
          key={p.id}
          plant={p}
          groundY={ground.elevation}
          selected={selection?.kind === 'plant' && selection.id === p.id}
        />
      ))}
    </group>
  )
}
