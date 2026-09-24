import { Edges } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { wallEndpoints } from '../../engine/geometry/openings'
import {
  isFloorRendered,
  isOpeningSelected,
  isSlabOpeningSelected,
  normalizeFloorVisibility,
} from '../../engine/types'
import { useBuildingStore } from '../../store/buildingStore'

const SELECTED = '#c45c26'
const IDLE = '#2a6f6a'
const IDLE_WINDOW = '#3d7a9a'

function WallOpeningMesh({
  floorId,
  elevation,
  opening,
  wallThickness,
  ends,
  selected,
  dimmed,
}: {
  floorId: string
  elevation: number
  opening: {
    id: string
    kind: 'door' | 'passage' | 'window'
    offset: number
    width: number
    height: number
    sillHeight: number
  }
  wallThickness: number
  ends: { a: { x: number; y: number }; b: { x: number; y: number }; len: number }
  selected: boolean
  dimmed: boolean
}) {
  const selectOpening = useBuildingStore((s) => s.selectOpening)

  const ux = (ends.b.x - ends.a.x) / ends.len
  const uy = (ends.b.y - ends.a.y) / ends.len
  // Plan (x,y) → world (x, -y) after ExtrudeGeometry + rotateX(-π/2)
  const cx = ends.a.x + ux * opening.offset
  const cz = -(ends.a.y + uy * opening.offset)
  const cy = elevation + opening.sillHeight + opening.height / 2
  // Wall direction in world XZ is (ux, -uy)
  const rotY = Math.atan2(uy, ux)

  const color =
    selected ? SELECTED : opening.kind === 'window' ? IDLE_WINDOW : IDLE
  const opacity = selected ? 0.4 : dimmed ? 0.12 : 0.22

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    selectOpening(floorId, opening.id)
  }

  return (
    <mesh
      position={[cx, cy, cz]}
      rotation={[0, rotY, 0]}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      <boxGeometry
        args={[opening.width, opening.height, wallThickness + 0.06]}
      />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        roughness={0.55}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
      <Edges
        threshold={15}
        color={selected ? SELECTED : color}
        scale={1.001}
      />
    </mesh>
  )
}

function SlabOpeningMesh({
  floorId,
  elevation,
  slabThickness,
  opening,
  selected,
  dimmed,
}: {
  floorId: string
  elevation: number
  slabThickness: number
  opening: { id: string; x: number; y: number; width: number; depth: number }
  selected: boolean
  dimmed: boolean
}) {
  const selectSlabOpening = useBuildingStore((s) => s.selectSlabOpening)
  const color = selected ? SELECTED : IDLE
  const opacity = selected ? 0.38 : dimmed ? 0.1 : 0.2
  const thickness = Math.max(0.08, slabThickness + 0.04)
  const cy = elevation - slabThickness / 2

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    selectSlabOpening(floorId, opening.id)
  }

  return (
    <mesh
      position={[opening.x, cy, -opening.y]}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      <boxGeometry args={[opening.width, thickness, opening.depth]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        roughness={0.7}
        metalness={0}
        side={THREE.DoubleSide}
      />
      <Edges
        threshold={15}
        color={selected ? SELECTED : color}
        scale={1.001}
      />
    </mesh>
  )
}

/** Translucent hit targets for wall & slab openings in 3D. */
export function OpeningPickables({ showSlabs }: { showSlabs: boolean }) {
  const building = useBuildingStore((s) => s.building)
  const activeFloorId = useBuildingStore((s) => s.activeFloorId)
  const selection = useBuildingStore((s) => s.selection)

  return (
    <group>
      {building.floors.map((floor) => {
        if (floor.kind === 'ground') return null
        if (!isFloorRendered(normalizeFloorVisibility(floor.visible))) return null
        const dimmed = floor.id !== activeFloorId
        return (
          <group key={floor.id}>
            {(floor.openings ?? []).map((opening) => {
              const wall = floor.walls.find((w) => w.id === opening.wallId)
              if (!wall) return null
              const ends = wallEndpoints(floor, wall)
              if (!ends || ends.len < 1e-9) return null
              return (
                <WallOpeningMesh
                  key={opening.id}
                  floorId={floor.id}
                  elevation={floor.elevation}
                  opening={opening}
                  wallThickness={wall.thickness}
                  ends={ends}
                  selected={isOpeningSelected(selection, opening.id)}
                  dimmed={dimmed}
                />
              )
            })}
            {showSlabs &&
              (floor.slabOpenings ?? []).map((opening) => (
                <SlabOpeningMesh
                  key={opening.id}
                  floorId={floor.id}
                  elevation={floor.elevation}
                  slabThickness={floor.slabThickness}
                  opening={opening}
                  selected={isSlabOpeningSelected(selection, opening.id)}
                  dimmed={dimmed}
                />
              ))}
          </group>
        )
      })}
    </group>
  )
}
