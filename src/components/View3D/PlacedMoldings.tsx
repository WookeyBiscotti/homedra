import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import {
  isMoldingSelected,
  isStoryFloor,
  type Floor,
  type PlacedMolding,
  type Wall,
  type WallSide,
} from '../../engine/types'
import {
  buildMoldingGeometry,
  fillRoomMoldings,
  freeMoldingIntervals,
  intervalContaining,
  placeMoldingAtFaceU,
} from '../../engine/geometry/moldings'
import {
  buildRoomFloorGeometry,
  buildWallPaintHitGeometry,
  FLOOR_FINISH_Y_OFFSET,
} from '../../engine/geometry/wallFaces'
import { floorPaintRegions } from '../../engine/geometry/floorPaint'
import { wallTileFrame, worldToUv } from '../../engine/geometry/tileSurfaces'
import { hitRoom } from '../../engine/geometry/wallSolid'
import { useBuildingStore } from '../../store/buildingStore'
import { PbrStandardMaterial } from './PbrStandardMaterial'

function MoldingMesh({
  floor,
  molding,
  selected,
  dimmed,
  shadowsEnabled,
  pickable,
  onMoldingClick,
}: {
  floor: Floor
  molding: PlacedMolding
  selected: boolean
  dimmed: boolean
  shadowsEnabled: boolean
  pickable: boolean
  onMoldingClick?: (moldingId: string) => void
}) {
  const geometry = useMemo(
    () => buildMoldingGeometry(floor, molding),
    [
      floor,
      molding.id,
      molding.wallId,
      molding.side,
      molding.s0,
      molding.s1,
      molding.kind,
      molding.profile,
      molding.miterStart,
      molding.miterEnd,
    ],
  )

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!geometry) return null

  const len = Math.max(0.01, molding.s1 - molding.s0)

  return (
    <mesh
      geometry={geometry}
      castShadow={shadowsEnabled && !dimmed}
      receiveShadow={shadowsEnabled}
      onClick={
        pickable
          ? (e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              onMoldingClick?.(molding.id)
            }
          : undefined
      }
      userData={{ moldingId: molding.id }}
    >
      <PbrStandardMaterial
        material={molding.material}
        color={selected ? '#c8e0ff' : '#d8cfc4'}
        meterUvs
        worldWidthM={len}
        worldHeightM={0.1}
        transparent={dimmed}
        opacity={dimmed ? 0.35 : 1}
        vertexDisplacement={false}
      />
    </mesh>
  )
}

function GhostMoldings({
  floor,
  moldings,
}: {
  floor: Floor
  moldings: PlacedMolding[]
}) {
  const geos = useMemo(() => {
    return moldings
      .map((m) => {
        const geo = buildMoldingGeometry(floor, m)
        return geo ? { id: m.id, geo, molding: m } : null
      })
      .filter(
        (x): x is { id: string; geo: THREE.BufferGeometry; molding: PlacedMolding } =>
          x !== null,
      )
  }, [floor, moldings])

  useEffect(() => {
    return () => {
      for (const g of geos) g.geo.dispose()
    }
  }, [geos])

  return (
    <group>
      {geos.map(({ id, geo, molding }) => (
        <mesh key={id} geometry={geo} renderOrder={8}>
          <PbrStandardMaterial
            material={molding.material}
            color="#b8d4a8"
            transparent
            opacity={0.55}
            meterUvs
            worldWidthM={Math.max(0.01, molding.s1 - molding.s0)}
            worldHeightM={0.1}
            vertexDisplacement={false}
          />
        </mesh>
      ))}
    </group>
  )
}

export function FloorPlacedMoldings({
  floor,
  dimmed,
  shadowsEnabled,
  pickable,
}: {
  floor: Floor
  dimmed: boolean
  shadowsEnabled: boolean
  pickable: boolean
}) {
  const selection = useBuildingStore((s) => s.selection)
  const tool = useBuildingStore((s) => s.tool)
  const selectMolding = useBuildingStore((s) => s.selectMolding)
  const deleteMolding = useBuildingStore((s) => s.deleteMolding)
  if (!isStoryFloor(floor)) return null

  const onMoldingClick = (moldingId: string) => {
    // In place/fill tools, click an existing plank to remove it.
    if (tool === 'placeMolding' || tool === 'fillMolding') {
      deleteMolding(floor.id, moldingId)
      return
    }
    selectMolding(floor.id, moldingId)
  }

  return (
    <group>
      {(floor.moldings ?? []).map((molding) => (
        <MoldingMesh
          key={molding.id}
          floor={floor}
          molding={molding}
          selected={isMoldingSelected(selection, molding.id)}
          dimmed={dimmed}
          shadowsEnabled={shadowsEnabled}
          pickable={pickable}
          onMoldingClick={onMoldingClick}
        />
      ))}
    </group>
  )
}

function WallMoldingHit({
  floor,
  wall,
  side,
  onHover,
  onLeave,
}: {
  floor: Floor
  wall: Wall
  side: WallSide
  onHover: (hit: { wallId: string; side: WallSide; u: number; v: number }) => void
  onLeave: () => void
}) {
  const placeMoldingOnHit = useBuildingStore((s) => s.placeMoldingOnHit)
  const tool = useBuildingStore((s) => s.tool)
  const geometry = useMemo(
    () => buildWallPaintHitGeometry(floor, wall, side),
    [floor, wall, side],
  )
  const frame = useMemo(
    () => wallTileFrame(floor, wall.id, side),
    [floor, wall.id, side],
  )

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!geometry || !frame) return null

  return (
    <mesh
      geometry={geometry}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        const uv = worldToUv(frame, { x: e.point.x, y: e.point.y, z: e.point.z })
        if (uv) onHover({ wallId: wall.id, side, u: uv.u, v: uv.v })
      }}
      onPointerOut={onLeave}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        if (tool !== 'placeMolding') return
        const uv = worldToUv(frame, { x: e.point.x, y: e.point.y, z: e.point.z })
        if (uv) placeMoldingOnHit(wall.id, side, uv.u)
      }}
      userData={{ moldingTarget: true, pickKind: 'molding' }}
      renderOrder={12}
    >
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function RoomMoldingHit({
  floor,
  geometry,
  roomKey,
  onHover,
  onLeave,
}: {
  floor: Floor
  geometry: THREE.BufferGeometry
  roomKey: string
  onHover: (roomKey: string) => void
  onLeave: () => void
}) {
  const fillMoldingsOnRoom = useBuildingStore((s) => s.fillMoldingsOnRoom)
  const tool = useBuildingStore((s) => s.tool)

  return (
    <mesh
      geometry={geometry}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        onHover(roomKey)
      }}
      onPointerOut={onLeave}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        if (tool !== 'fillMolding') return
        const planX = e.point.x
        const planY = -e.point.z
        const room = hitRoom(floor, planX, planY)
        fillMoldingsOnRoom(room?.key ?? roomKey)
      }}
      userData={{ moldingTarget: true, pickKind: 'molding' }}
      renderOrder={12}
    >
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export function MoldingLayPickables({ floor }: { floor: Floor }) {
  const pendingMolding = useBuildingStore((s) => s.pendingMolding)
  const tool = useBuildingStore((s) => s.tool)
  const [wallHit, setWallHit] = useState<{
    wallId: string
    side: WallSide
    u: number
    v: number
  } | null>(null)
  const [roomKey, setRoomKey] = useState<string | null>(null)

  const ghosts = useMemo(() => {
    if (!pendingMolding) return [] as PlacedMolding[]
    if (tool === 'placeMolding' && wallHit) {
      const placed = placeMoldingAtFaceU(
        floor,
        pendingMolding,
        wallHit.wallId,
        wallHit.side,
        wallHit.u,
      )
      return placed ? [placed] : []
    }
    if (tool === 'fillMolding' && roomKey) {
      return fillRoomMoldings(floor, roomKey, pendingMolding)
    }
    return []
  }, [floor, pendingMolding, tool, wallHit, roomKey])

  const floorRegions = useMemo(() => {
    return floorPaintRegions(floor)
      .map((region) => {
        const geometry = buildRoomFloorGeometry(region.polygon, floor.elevation, {
          yOffset: FLOOR_FINISH_Y_OFFSET + 0.004,
        })
        return geometry ? { key: region.key, geometry } : null
      })
      .filter((x): x is { key: string; geometry: THREE.BufferGeometry } => x !== null)
  }, [floor])

  useEffect(() => {
    return () => {
      for (const r of floorRegions) r.geometry.dispose()
    }
  }, [floorRegions])

  if (!pendingMolding || (tool !== 'placeMolding' && tool !== 'fillMolding')) {
    return null
  }
  if (!isStoryFloor(floor)) return null

  return (
    <group>
      {tool === 'fillMolding' &&
        floorRegions.map((r) => (
          <RoomMoldingHit
            key={r.key}
            floor={floor}
            geometry={r.geometry}
            roomKey={r.key}
            onHover={setRoomKey}
            onLeave={() => setRoomKey(null)}
          />
        ))}
      {tool === 'placeMolding' &&
        floor.walls.map((wall) => (
          <group key={wall.id}>
            <WallMoldingHit
              floor={floor}
              wall={wall}
              side="pos"
              onHover={setWallHit}
              onLeave={() => setWallHit(null)}
            />
            <WallMoldingHit
              floor={floor}
              wall={wall}
              side="neg"
              onHover={setWallHit}
              onLeave={() => setWallHit(null)}
            />
          </group>
        ))}
      <GhostMoldings floor={floor} moldings={ghosts} />
    </group>
  )
}

/** Helpers kept for tests / debugging. */
export function previewInterval(
  floor: Floor,
  wallId: string,
  side: WallSide,
  kind: PlacedMolding['kind'],
  u: number,
) {
  return intervalContaining(freeMoldingIntervals(floor, wallId, side, kind), u)
}
