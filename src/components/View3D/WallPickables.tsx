import { Edges } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { wallEndpoints, worldHitInWallOpening } from '../../engine/geometry/openings'
import { isFloorRendered, isWallSelected, normalizeFloorVisibility } from '../../engine/types'
import { useBuildingStore } from '../../store/buildingStore'
import { useMemo } from 'react'

const SELECTED = '#c45c26'

function WallPickMesh({
  floorId,
  elevation,
  height,
  wallId,
  thickness,
  ends,
  selected,
}: {
  floorId: string
  elevation: number
  height: number
  wallId: string
  thickness: number
  ends: { a: { x: number; y: number }; b: { x: number; y: number }; len: number }
  selected: boolean
}) {
  const setSelection = useBuildingStore((s) => s.setSelection)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const floor = useBuildingStore((s) =>
    s.building.floors.find((f) => f.id === floorId),
  )
  const wall = floor?.walls.find((w) => w.id === wallId)

  const raycast = useMemo(() => {
    if (!floor || !wall) return undefined
    return function wallPickRaycast(
      this: THREE.Mesh,
      raycaster: THREE.Raycaster,
      intersects: THREE.Intersection[],
    ) {
      const before = intersects.length
      THREE.Mesh.prototype.raycast.call(this, raycaster, intersects)
      for (let i = intersects.length - 1; i >= before; i--) {
        if (worldHitInWallOpening(floor, wall, intersects[i].point)) {
          intersects.splice(i, 1)
        }
      }
    }
  }, [floor, wall])

  const ux = (ends.b.x - ends.a.x) / ends.len
  const uy = (ends.b.y - ends.a.y) / ends.len
  const cx = ends.a.x + ux * (ends.len / 2)
  const cz = -(ends.a.y + uy * (ends.len / 2))
  const cy = elevation + height / 2
  const rotY = Math.atan2(uy, ux)

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    setActiveFloor(floorId)
    setSelection({ kind: 'wall', id: wallId })
  }

  return (
    <mesh
      position={[cx, cy, cz]}
      rotation={[0, rotY, 0]}
      raycast={raycast}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
      userData={{ wallId, pickKind: 'wall' }}
      renderOrder={1}
    >
      <boxGeometry args={[ends.len, height, thickness + 0.04]} />
      {/* Invisible hit volume — must not cover textured faces */}
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
      {selected && (
        <Edges threshold={15} color={SELECTED} scale={1.002} />
      )}
    </mesh>
  )
}

/** Clickable volumes for walls in 3D (works without applied textures). */
export function WallPickables() {
  const building = useBuildingStore((s) => s.building)
  const selection = useBuildingStore((s) => s.selection)

  return (
    <group>
      {building.floors.map((floor) => {
        if (floor.kind === 'ground') return null
        if (!isFloorRendered(normalizeFloorVisibility(floor.visible))) return null
        return (
          <group key={floor.id}>
            {floor.walls.map((wall) => {
              const ends = wallEndpoints(floor, wall)
              if (!ends || ends.len < 1e-9) return null
              return (
                <WallPickMesh
                  key={wall.id}
                  floorId={floor.id}
                  elevation={floor.elevation}
                  height={floor.height}
                  wallId={wall.id}
                  thickness={wall.thickness}
                  ends={ends}
                  selected={isWallSelected(selection, wall.id)}
                />
              )
            })}
          </group>
        )
      })}
    </group>
  )
}
