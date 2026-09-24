import { Edges } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import {
  floorPaintRegions,
  hitFloorPaintRegion,
} from '../../engine/geometry/floorPaint'
import { resolveFloorRegionMaterial } from '../../engine/geometry/floorPlates'
import { floorSlabOpeningHoles } from '../../engine/geometry/slabOpenings'
import {
  buildRoomFloorGeometry,
  buildWallPaintHitGeometry,
  wallFaceHitInOpening,
} from '../../engine/geometry/wallFaces'
import {
  buildSlabOpeningCutGeometry,
  buildWallCutPaintHitGeometry,
} from '../../engine/geometry/wallCuts'
import {
  isStoryFloor,
  type Floor,
  type SlabOpening,
  type Wall,
  type WallSide,
} from '../../engine/types'
import { useBuildingStore } from '../../store/buildingStore'

const HOVER = '#c45c26'
const WALL_HIT_FLOOR_CLEARANCE = 0.22

/** No-op raycast — structural meshes ignore pointers in paint mode. */
export function disableRaycast() {}

/**
 * Raycast a wall face; drop opening hits and hits near the floor plane.
 */
function makeWallPaintRaycast(floor: Floor, wall: Wall, side: WallSide) {
  return function wallPaintRaycast(
    this: THREE.Mesh,
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[],
  ) {
    const before = intersects.length
    THREE.Mesh.prototype.raycast.call(this, raycaster, intersects)
    for (let i = intersects.length - 1; i >= before; i--) {
      const hit = intersects[i]
      if (hit.point.y < floor.elevation + WALL_HIT_FLOOR_CLEARANCE) {
        intersects.splice(i, 1)
        continue
      }
      if (
        wallFaceHitInOpening(floor, wall, side, {
          x: hit.point.x,
          y: hit.point.y,
          z: hit.point.z,
        })
      ) {
        intersects.splice(i, 1)
      }
    }
  }
}

function PaintWallFace({
  floorId,
  wall,
  side,
  floor,
  hasFinish,
}: {
  floorId: string
  wall: Wall
  side: WallSide
  floor: Floor
  hasFinish: boolean
}) {
  const paintBrush = useBuildingStore((s) => s.paintBrush)
  const setWallSideMaterial = useBuildingStore((s) => s.setWallSideMaterial)
  const setSelection = useBuildingStore((s) => s.setSelection)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const [hovered, setHovered] = useState(false)

  const geometry = useMemo(
    () => buildWallPaintHitGeometry(floor, wall, side),
    [floor, wall, side],
  )

  const raycast = useMemo(
    () => makeWallPaintRaycast(floor, wall, side),
    [floor, wall, side],
  )

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!geometry) return null

  return (
    <mesh
      geometry={geometry}
      raycast={raycast}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        setActiveFloor(floorId)
        setSelection({ kind: 'wall', id: wall.id })
        if (!paintBrush && !e.altKey) return
        setWallSideMaterial(wall.id, side, e.altKey ? null : paintBrush)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = paintBrush || e.altKey ? 'crosshair' : 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'default'
      }}
      userData={{ wallId: wall.id, side, paintTarget: true, paintKind: 'wall' }}
      renderOrder={10}
    >
      <meshBasicMaterial
        transparent
        opacity={hasFinish ? (hovered ? 0.14 : 0) : hovered ? 0.3 : 0.14}
        color={hovered ? HOVER : '#d4c4a8'}
        depthWrite={false}
        side={THREE.FrontSide}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
      {hovered && <Edges threshold={15} color={HOVER} scale={1.002} />}
    </mesh>
  )
}

function PaintFloorRegion({
  floorId,
  regionKey,
  geometry,
  hasFinish,
}: {
  floorId: string
  regionKey: string
  geometry: THREE.BufferGeometry
  hasFinish: boolean
}) {
  const paintBrush = useBuildingStore((s) => s.paintBrush)
  const setRoomFloorMaterial = useBuildingStore((s) => s.setRoomFloorMaterial)
  const setRoomWallsMaterial = useBuildingStore((s) => s.setRoomWallsMaterial)
  const setSelection = useBuildingStore((s) => s.setSelection)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const [hovered, setHovered] = useState(false)

  return (
    <mesh
      geometry={geometry}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        setActiveFloor(floorId)
        const plateId = regionKey.startsWith('plate:')
          ? regionKey.slice('plate:'.length)
          : null
        if (plateId) {
          setSelection({ kind: 'floorPlate', id: plateId })
        } else {
          setSelection({ kind: 'room', key: regionKey })
        }
        if (!paintBrush && !e.altKey) return
        const next = e.altKey ? null : paintBrush
        setRoomFloorMaterial(regionKey, next)
        if (e.shiftKey && !e.altKey && paintBrush) {
          setRoomWallsMaterial(regionKey, paintBrush)
        }
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = paintBrush || e.altKey ? 'crosshair' : 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'default'
      }}
      userData={{ roomKey: regionKey, paintTarget: true, paintKind: 'floor' }}
      renderOrder={20}
    >
      <meshBasicMaterial
        transparent
        opacity={hasFinish ? (hovered ? 0.18 : 0.04) : hovered ? 0.28 : 0.1}
        color={hovered ? HOVER : '#e8dfd0'}
        depthWrite={false}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-6}
        polygonOffsetUnits={-6}
      />
      {hovered && <Edges threshold={15} color={HOVER} scale={1.001} />}
    </mesh>
  )
}

function PaintWallCut({
  floorId,
  wall,
  floor,
  hasFinish,
}: {
  floorId: string
  wall: Wall
  floor: Floor
  hasFinish: boolean
}) {
  const paintBrush = useBuildingStore((s) => s.paintBrush)
  const setWallCutMaterial = useBuildingStore((s) => s.setWallCutMaterial)
  const setSelection = useBuildingStore((s) => s.setSelection)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const [hovered, setHovered] = useState(false)

  const geometry = useMemo(
    () => buildWallCutPaintHitGeometry(floor, wall),
    [floor, wall],
  )

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!geometry) return null

  return (
    <mesh
      geometry={geometry}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        setActiveFloor(floorId)
        setSelection({ kind: 'wall', id: wall.id })
        if (!paintBrush && !e.altKey) return
        setWallCutMaterial(wall.id, e.altKey ? null : paintBrush)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = paintBrush || e.altKey ? 'crosshair' : 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'default'
      }}
      userData={{ wallId: wall.id, paintTarget: true, paintKind: 'wall-cut' }}
      renderOrder={11}
    >
      <meshBasicMaterial
        transparent
        opacity={hasFinish ? (hovered ? 0.14 : 0) : hovered ? 0.3 : 0.14}
        color={hovered ? HOVER : '#d4c4a8'}
        depthWrite={false}
        side={THREE.FrontSide}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
      {hovered && <Edges threshold={15} color={HOVER} scale={1.002} />}
    </mesh>
  )
}

function PaintSlabCut({
  floorId,
  opening,
  floor,
  hasFinish,
}: {
  floorId: string
  opening: SlabOpening
  floor: Floor
  hasFinish: boolean
}) {
  const paintBrush = useBuildingStore((s) => s.paintBrush)
  const setSlabOpeningMaterial = useBuildingStore(
    (s) => s.setSlabOpeningMaterial,
  )
  const setSelection = useBuildingStore((s) => s.setSelection)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const [hovered, setHovered] = useState(false)

  const geometry = useMemo(
    () => buildSlabOpeningCutGeometry(floor, opening),
    [floor, opening],
  )

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!geometry) return null

  return (
    <mesh
      geometry={geometry}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        setActiveFloor(floorId)
        setSelection({ kind: 'slabOpening', id: opening.id })
        if (!paintBrush && !e.altKey) return
        setSlabOpeningMaterial(opening.id, e.altKey ? null : paintBrush)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = paintBrush || e.altKey ? 'crosshair' : 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'default'
      }}
      userData={{
        slabOpeningId: opening.id,
        paintTarget: true,
        paintKind: 'slab-cut',
      }}
      renderOrder={11}
    >
      <meshBasicMaterial
        transparent
        opacity={hasFinish ? (hovered ? 0.14 : 0) : hovered ? 0.3 : 0.14}
        color={hovered ? HOVER : '#d4c4a8'}
        depthWrite={false}
        side={THREE.FrontSide}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
      {hovered && <Edges threshold={15} color={HOVER} scale={1.002} />}
    </mesh>
  )
}

/**
 * Paint hit targets: wall side planes + cut faces + one mesh per enclosed floor region
 * (rooms + wall-union holes that weren't detected as rooms).
 */
export function PaintPickables({ floorId }: { floorId: string }) {
  const floor = useBuildingStore((s) =>
    s.building.floors.find((f) => f.id === floorId),
  )

  const wallItems = useMemo(() => {
    if (!floor || !isStoryFloor(floor)) return []
    const items: Array<{
      key: string
      wall: Wall
      side: WallSide
      hasFinish: boolean
    }> = []
    for (const wall of floor.walls) {
      for (const side of ['pos', 'neg'] as WallSide[]) {
        items.push({
          key: `${wall.id}-${side}`,
          wall,
          side,
          hasFinish: !!wall.materials?.[side],
        })
      }
    }
    return items
  }, [floor])

  const wallCutItems = useMemo(() => {
    if (!floor || !isStoryFloor(floor)) return []
    return floor.walls.map((wall) => ({
      key: `${wall.id}-cut`,
      wall,
      hasFinish: !!wall.materials?.cut,
    }))
  }, [floor])

  const slabCutItems = useMemo(() => {
    if (!floor || !isStoryFloor(floor)) return []
    return (floor.slabOpenings ?? []).map((opening) => ({
      key: `${opening.id}-cut`,
      opening,
      hasFinish: !!opening.material,
    }))
  }, [floor])

  const floorRegions = useMemo(() => {
    if (!floor || !isStoryFloor(floor)) return []
    const regions = floorPaintRegions(floor)
    const holes = floorSlabOpeningHoles(floor)
    const out: Array<{
      key: string
      geo: THREE.BufferGeometry
      hasFinish: boolean
    }> = []
    for (const r of regions) {
      // Slight inflate so the strip against walls is still hittable
      const geo = buildRoomFloorGeometry(r.polygon, floor.elevation, {
        yOffset: 0.03,
        inflateM: 0.12,
        holes,
      })
      if (!geo) continue
      out.push({
        key: r.key,
        geo,
        hasFinish: !!resolveFloorRegionMaterial(floor, r.key),
      })
    }
    return out
  }, [floor])

  useEffect(() => {
    return () => {
      for (const item of floorRegions) item.geo.dispose()
    }
  }, [floorRegions])

  if (!floor) return null

  return (
    <group>
      {floorRegions.map((item) => (
        <PaintFloorRegion
          key={item.key}
          floorId={floorId}
          regionKey={item.key}
          geometry={item.geo}
          hasFinish={item.hasFinish}
        />
      ))}
      {wallItems.map((item) => (
        <PaintWallFace
          key={item.key}
          floorId={floorId}
          floor={floor}
          wall={item.wall}
          side={item.side}
          hasFinish={item.hasFinish}
        />
      ))}
      {wallCutItems.map((item) => (
        <PaintWallCut
          key={item.key}
          floorId={floorId}
          floor={floor}
          wall={item.wall}
          hasFinish={item.hasFinish}
        />
      ))}
      {slabCutItems.map((item) => (
        <PaintSlabCut
          key={item.key}
          floorId={floorId}
          floor={floor}
          opening={item.opening}
          hasFinish={item.hasFinish}
        />
      ))}
    </group>
  )
}

/** Re-export for finish rendering / tests */
export { floorPaintRegions, hitFloorPaintRegion }
