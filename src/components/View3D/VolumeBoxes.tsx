import { Edges } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  applyWorldMeterUvs,
  buildVolumeCutoutGeometry,
  extrudeVolumeBox,
} from '../../engine/geometry/volumeBoxMesh'
import { tessellateByMaxEdge } from '../../engine/geometry/tessellate'
import {
  isStoryFloor,
  isVolumeBoxSelected,
  isVolumeCutoutSelected,
  type Floor,
} from '../../engine/types'
import { useBuildingStore } from '../../store/buildingStore'
import { PbrStandardMaterial } from './PbrStandardMaterial'

function disableRaycast() {}

function buildSolidGeometry(
  layers: ReturnType<typeof extrudeVolumeBox>['layers'],
): THREE.BufferGeometry | null {
  if (layers.length === 0) return null
  const geos: THREE.BufferGeometry[] = []
  for (const layer of layers) {
    for (let i = 0; i < layer.rings.length; i++) {
      const ring = layer.rings[i]
      if (!ring || ring.length < 3) continue
      const shape = new THREE.Shape()
      shape.moveTo(ring[0].x, ring[0].z)
      for (let j = 1; j < ring.length; j++) {
        shape.lineTo(ring[j].x, ring[j].z)
      }
      shape.closePath()
      for (const hole of layer.holes[i] ?? []) {
        if (hole.length < 3) continue
        const path = new THREE.Path()
        path.moveTo(hole[0].x, hole[0].z)
        for (let j = 1; j < hole.length; j++) {
          path.lineTo(hole[j].x, hole[j].z)
        }
        path.closePath()
        shape.holes.push(path)
      }
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: layer.height,
        bevelEnabled: false,
        curveSegments: 1,
        steps: 1,
      })
      geo.rotateX(-Math.PI / 2)
      geo.translate(0, layer.y, 0)
      geos.push(geo)
    }
  }
  if (geos.length === 0) return null
  const merged = mergeGeometries(geos, false)
  for (const g of geos) g.dispose()
  if (!merged) return null
  merged.computeVertexNormals()
  applyWorldMeterUvs(merged)
  const tess = tessellateByMaxEdge(merged)
  if (tess !== merged) merged.dispose()
  try {
    tess.computeTangents()
  } catch {
    // ignore
  }
  tess.computeBoundingSphere()
  return tess
}

function VolumeBoxMesh({
  floor,
  boxId,
  selected,
  dimmed,
  shadowsEnabled,
  pickable,
}: {
  floor: Floor
  boxId: string
  selected: boolean
  dimmed: boolean
  shadowsEnabled: boolean
  pickable: boolean
}) {
  const selectVolumeBox = useBuildingStore((s) => s.selectVolumeBox)
  const box = (floor.boxes ?? []).find((b) => b.id === boxId)
  const solid = useMemo(() => {
    if (!box) return null
    return extrudeVolumeBox(floor, box)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- structural
  }, [box, floor.elevation, floor.boxCutouts])

  const geometry = useMemo(
    () => (solid ? buildSolidGeometry(solid.layers) : null),
    [solid],
  )

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!box || !geometry) return null

  const material = box.material ?? null
  const color = selected ? '#e8d4b8' : dimmed ? '#b8a88c' : '#c9b089'

  const onClick = pickable
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        selectVolumeBox(floor.id, box.id)
      }
    : undefined

  return (
    <mesh
      geometry={geometry}
      castShadow={shadowsEnabled && !dimmed}
      receiveShadow={shadowsEnabled && !dimmed}
      raycast={pickable ? undefined : disableRaycast}
      onClick={onClick}
      onPointerOver={
        pickable
          ? (e) => {
              e.stopPropagation()
              document.body.style.cursor = 'pointer'
            }
          : undefined
      }
      onPointerOut={
        pickable
          ? () => {
              document.body.style.cursor = 'default'
            }
          : undefined
      }
      userData={{ pickKind: 'volumeBox', boxId: box.id }}
    >
      {material ? (
        <PbrStandardMaterial
          material={material}
          color={color}
          transparent={dimmed}
          opacity={dimmed ? 0.4 : 1}
          side={THREE.DoubleSide}
          meterUvs
        />
      ) : (
        <meshStandardMaterial
          color={color}
          transparent={dimmed}
          opacity={dimmed ? 0.4 : 1}
          depthWrite={!dimmed}
          roughness={0.82}
          metalness={0.04}
          side={THREE.DoubleSide}
        />
      )}
    </mesh>
  )
}

function VolumeCutoutMesh({
  floor,
  cutId,
  selected,
  dimmed,
  pickable,
}: {
  floor: Floor
  cutId: string
  selected: boolean
  dimmed: boolean
  pickable: boolean
}) {
  const selectVolumeCutout = useBuildingStore((s) => s.selectVolumeCutout)
  const cut = (floor.boxCutouts ?? []).find((c) => c.id === cutId)

  const geometry = useMemo(
    () => (cut ? buildVolumeCutoutGeometry(floor, cut) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- structural
    [cut, floor.elevation, floor.boxes],
  )

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!cut || !geometry) return null

  const material = cut.material ?? null
  const color = selected ? '#e8d4b8' : '#d4c4a8'
  const onClick = pickable
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        selectVolumeCutout(floor.id, cut.id)
      }
    : undefined

  return (
    <mesh
      geometry={geometry}
      raycast={pickable ? undefined : disableRaycast}
      onClick={onClick}
      onPointerOver={
        pickable
          ? (e) => {
              e.stopPropagation()
              document.body.style.cursor = 'pointer'
            }
          : undefined
      }
      onPointerOut={
        pickable
          ? () => {
              document.body.style.cursor = 'default'
            }
          : undefined
      }
      userData={{ pickKind: 'volumeCutout', cutoutId: cut.id }}
      renderOrder={3}
    >
      {material ? (
        <PbrStandardMaterial
          material={material}
          color={color}
          transparent={dimmed}
          opacity={dimmed ? 0.4 : 1}
          side={THREE.FrontSide}
          meterUvs
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      ) : (
        <meshStandardMaterial
          color={color}
          transparent
          opacity={selected ? 0.35 : dimmed ? 0.08 : 0.16}
          depthWrite={false}
          roughness={0.7}
          metalness={0}
          side={THREE.FrontSide}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      )}
      {selected && <Edges threshold={15} color="#c45c26" scale={1.001} />}
    </mesh>
  )
}

export function FloorVolumeBoxes({
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
  if (!isStoryFloor(floor)) return null

  return (
    <group>
      {(floor.boxes ?? []).map((box) => (
        <VolumeBoxMesh
          key={box.id}
          floor={floor}
          boxId={box.id}
          selected={isVolumeBoxSelected(selection, box.id)}
          dimmed={dimmed}
          shadowsEnabled={shadowsEnabled}
          pickable={pickable}
        />
      ))}
      {(floor.boxCutouts ?? []).map((cut) => (
        <VolumeCutoutMesh
          key={cut.id}
          floor={floor}
          cutId={cut.id}
          selected={isVolumeCutoutSelected(selection, cut.id)}
          dimmed={dimmed}
          pickable={pickable}
        />
      ))}
    </group>
  )
}

export function PaintVolumeBox({
  floor,
  boxId,
  hasFinish,
}: {
  floor: Floor
  boxId: string
  hasFinish: boolean
}) {
  const paintBrush = useBuildingStore((s) => s.paintBrush)
  const setVolumeBoxMaterial = useBuildingStore((s) => s.setVolumeBoxMaterial)
  const setSelection = useBuildingStore((s) => s.setSelection)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const box = (floor.boxes ?? []).find((b) => b.id === boxId)
  const solid = useMemo(() => {
    if (!box) return null
    return extrudeVolumeBox(floor, box)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- structural
  }, [box, floor.elevation, floor.boxCutouts])
  const geometry = useMemo(
    () => (solid ? buildSolidGeometry(solid.layers) : null),
    [solid],
  )

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!box || !geometry) return null

  return (
    <mesh
      geometry={geometry}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        setActiveFloor(floor.id)
        setSelection({ kind: 'volumeBox', id: box.id })
        if (!paintBrush && !e.altKey) return
        setVolumeBoxMaterial(box.id, e.altKey ? null : paintBrush)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = paintBrush || e.altKey ? 'crosshair' : 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
      userData={{ paintTarget: true, paintKind: 'volume-box', boxId: box.id }}
      renderOrder={11}
    >
      <meshBasicMaterial
        transparent
        opacity={hasFinish ? 0.08 : 0.16}
        color="#c9b089"
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export function PaintVolumeCutout({
  floor,
  cutId,
  hasFinish,
}: {
  floor: Floor
  cutId: string
  hasFinish: boolean
}) {
  const paintBrush = useBuildingStore((s) => s.paintBrush)
  const setVolumeCutoutMaterial = useBuildingStore(
    (s) => s.setVolumeCutoutMaterial,
  )
  const setSelection = useBuildingStore((s) => s.setSelection)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const cut = (floor.boxCutouts ?? []).find((c) => c.id === cutId)
  const geometry = useMemo(
    () => (cut ? buildVolumeCutoutGeometry(floor, cut) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- structural
    [cut, floor.elevation, floor.boxes],
  )

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!cut || !geometry) return null

  return (
    <mesh
      geometry={geometry}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        setActiveFloor(floor.id)
        setSelection({ kind: 'volumeCutout', id: cut.id })
        if (!paintBrush && !e.altKey) return
        setVolumeCutoutMaterial(cut.id, e.altKey ? null : paintBrush)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = paintBrush || e.altKey ? 'crosshair' : 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
      userData={{
        paintTarget: true,
        paintKind: 'volume-cutout',
        cutoutId: cut.id,
      }}
      renderOrder={12}
    >
      <meshBasicMaterial
        transparent
        opacity={hasFinish ? 0.1 : 0.22}
        color="#d4c4a8"
        depthWrite={false}
        side={THREE.FrontSide}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
    </mesh>
  )
}
