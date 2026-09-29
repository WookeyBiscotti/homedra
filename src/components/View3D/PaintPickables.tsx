import { Edges } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import {
  floorPaintRegions,
  hitFloorPaintRegion,
} from '../../engine/geometry/floorPaint'
import { resolveFloorRegionMaterial, resolveCeilingRegionMaterial } from '../../engine/geometry/floorPlates'
import { floorOpeningIdFromKey } from '../../engine/geometry/openings'
import { floorSlabOpeningHoles } from '../../engine/geometry/slabOpenings'
import {
  buildRoomCeilingGeometry,
  buildRoomFloorGeometry,
  wallFaceHitInOpening,
} from '../../engine/geometry/wallFaces'
import { buildSlabOpeningCutGeometry } from '../../engine/geometry/wallCuts'
import {
  isStoryFloor,
  type Floor,
  type SlabOpening,
  type Wall,
  type WallSide,
} from '../../engine/types'
import { useBuildingStore } from '../../store/buildingStore'
import { PaintVolumeBox, PaintVolumeCutout } from './VolumeBoxes'

const HOVER = '#c45c26'
const WALL_HIT_FLOOR_CLEARANCE = 0.22
const WALL_HIT_CEILING_CLEARANCE = 0.22

/** No-op raycast — structural meshes ignore pointers in paint mode. */
export function disableRaycast() {}

/**
 * Raycast a wall face; drop opening hits and hits near floor / ceiling planes.
 */
export function makeWallPaintRaycast(floor: Floor, wall: Wall, side: WallSide) {
  return function wallPaintRaycast(
    this: THREE.Mesh,
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[],
  ) {
    const before = intersects.length
    THREE.Mesh.prototype.raycast.call(this, raycaster, intersects)
    const ceilY = floor.elevation + floor.height
    for (let i = intersects.length - 1; i >= before; i--) {
      const hit = intersects[i]
      if (hit.point.y < floor.elevation + WALL_HIT_FLOOR_CLEARANCE) {
        intersects.splice(i, 1)
        continue
      }
      if (hit.point.y > ceilY - WALL_HIT_CEILING_CLEARANCE) {
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
        const brush = useBuildingStore.getState().paintBrush
        if (!brush && !e.altKey) return
        const next = e.altKey ? null : brush
        setRoomFloorMaterial(regionKey, next)
        // Shift paints room walls; opening/plate thresholds have no wall contour
        if (
          e.shiftKey &&
          !e.altKey &&
          brush &&
          !plateId &&
          !floorOpeningIdFromKey(regionKey)
        ) {
          setRoomWallsMaterial(regionKey, brush)
        }
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        const brush = useBuildingStore.getState().paintBrush
        document.body.style.cursor = brush || e.altKey ? 'crosshair' : 'pointer'
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

function PaintCeilingRegion({
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
  const setRoomCeilingMaterial = useBuildingStore((s) => s.setRoomCeilingMaterial)
  const setSelection = useBuildingStore((s) => s.setSelection)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const [hovered, setHovered] = useState(false)

  return (
    <mesh
      geometry={geometry}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        setActiveFloor(floorId)
        setSelection({ kind: 'room', key: regionKey })
        const brush = useBuildingStore.getState().paintBrush
        if (!brush && !e.altKey) return
        setRoomCeilingMaterial(regionKey, e.altKey ? null : brush)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        const brush = useBuildingStore.getState().paintBrush
        document.body.style.cursor = brush || e.altKey ? 'crosshair' : 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'default'
      }}
      userData={{ roomKey: regionKey, paintTarget: true, paintKind: 'ceiling' }}
      renderOrder={20}
    >
      <meshBasicMaterial
        transparent
        opacity={hasFinish ? (hovered ? 0.18 : 0.04) : hovered ? 0.28 : 0.1}
        color={hovered ? HOVER : '#e8dfd0'}
        depthWrite={false}
        side={THREE.FrontSide}
        polygonOffset
        polygonOffsetFactor={-6}
        polygonOffsetUnits={-6}
      />
      {hovered && <Edges threshold={15} color={HOVER} scale={1.001} />}
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
        const brush = useBuildingStore.getState().paintBrush
        if (!brush && !e.altKey) return
        setSlabOpeningMaterial(opening.id, e.altKey ? null : brush)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        const brush = useBuildingStore.getState().paintBrush
        document.body.style.cursor = brush || e.altKey ? 'crosshair' : 'pointer'
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
 * Paint hit targets for floors, ceilings, slab wells and volume boxes.
 * Wall sides / cuts are painted on the wall solid itself.
 */
export function PaintPickables({ floorId }: { floorId: string }) {
  const floor = useBuildingStore((s) =>
    s.building.floors.find((f) => f.id === floorId),
  )

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
      const isOpening = !!floorOpeningIdFromKey(r.key)
      // Room floors inflate toward walls; opening strips stay exact so they
      // don't steal hits from adjacent rooms (and sit slightly above).
      const geo = buildRoomFloorGeometry(r.polygon, floor.elevation, {
        yOffset: isOpening ? 0.035 : 0.03,
        inflateM: isOpening ? 0 : 0.12,
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

  const ceilingRegions = useMemo(() => {
    if (!floor || !isStoryFloor(floor)) return []
    const regions = floorPaintRegions(floor)
    const holes = floorSlabOpeningHoles(floor)
    const out: Array<{
      key: string
      geo: THREE.BufferGeometry
      hasFinish: boolean
    }> = []
    for (const r of regions) {
      if (!r.room) continue
      const geo = buildRoomCeilingGeometry(
        r.polygon,
        floor.elevation,
        floor.height,
        { inflateM: 0.12, holes },
      )
      if (!geo) continue
      out.push({
        key: r.key,
        geo,
        hasFinish: !!resolveCeilingRegionMaterial(floor, r.key),
      })
    }
    return out
  }, [floor])

  useEffect(() => {
    return () => {
      for (const item of floorRegions) item.geo.dispose()
      for (const item of ceilingRegions) item.geo.dispose()
    }
  }, [floorRegions, ceilingRegions])

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
      {ceilingRegions.map((item) => (
        <PaintCeilingRegion
          key={`ceil-${item.key}`}
          floorId={floorId}
          regionKey={item.key}
          geometry={item.geo}
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
      {(floor.boxes ?? []).map((box) => (
        <PaintVolumeBox
          key={`box-${box.id}`}
          floor={floor}
          boxId={box.id}
          hasFinish={!!box.material}
        />
      ))}
      {(floor.boxCutouts ?? []).map((cut) => (
        <PaintVolumeCutout
          key={`cut-${cut.id}`}
          floor={floor}
          cutId={cut.id}
          hasFinish={!!cut.material}
        />
      ))}
    </group>
  )
}

/** Re-export for finish rendering / tests */
export { floorPaintRegions, hitFloorPaintRegion }
