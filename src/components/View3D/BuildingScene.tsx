import { Canvas, useThree } from '@react-three/fiber'
import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
} from '@react-three/drei'
import {
  BrightnessContrast,
  EffectComposer,
  N8AO,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { buildingBounds, extrudeBuilding } from '../../engine/extrude'
import { floorPaintRegions } from '../../engine/geometry/floorPaint'
import { resolveFloorRegionMaterial } from '../../engine/geometry/floorPlates'
import { floorSlabOpeningHoles } from '../../engine/geometry/slabOpenings'
import {
  buildRoomFloorGeometry,
  buildWallFaceGeometry,
  FLOOR_FINISH_Y_OFFSET,
} from '../../engine/geometry/wallFaces'
import {
  buildSlabOpeningCutGeometry,
  buildWallCutGeometry,
} from '../../engine/geometry/wallCuts'
import {
  isFloorRendered,
  isMepDrawTool,
  isMepFixtureTool,
  isMepWorkbench,
  isStoryFloor,
  normalizeFloorVisibility,
  sunDirection,
  type FloorVisibility,
  type MaterialRef,
  type WallSide,
} from '../../engine/types'
import { useBuildingStore } from '../../store/buildingStore'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LightingPanel } from './LightingPanel'
import { OpeningPickables } from './OpeningPickables'
import { PaintPickables, disableRaycast } from './PaintPickables'
import { PbrStandardMaterial } from './PbrStandardMaterial'
import { VisitControls, type VisitActiveState } from './VisitControls'
import { WallPickables } from './WallPickables'
import { PlaceObjectFloorHit, PlacedObjects } from './PlacedObjects'
import { MepNetworks } from './MepNetworks'
import { TerrainGround } from './TerrainGround'
import { LandscapePlants } from './LandscapePlants'
import { LandscapeGrass } from './LandscapeGrass'
import { heightAt, shouldShowOutdoorLandscape } from '../../landscape/terrain'

/**
 * Procedural IBL via Lightformers (no CDN HDR).
 * Remount only when sky/ground tint changes; intensity updates live.
 */
function LocalEnvironment({
  intensity,
  skyColor,
  groundColor,
}: {
  intensity: number
  skyColor: string
  groundColor: string
}) {
  return (
    <Environment
      key={`${skyColor}-${groundColor}`}
      resolution={256}
      environmentIntensity={Math.max(0, intensity)}
      frames={1}
    >
      <Lightformer
        form="circle"
        intensity={2}
        color={skyColor}
        position={[0, 10, 0]}
        scale={14}
      />
      <Lightformer
        form="rect"
        intensity={2.8}
        color="#fff4e0"
        position={[8, 10, 6]}
        scale={[4, 4, 1]}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="ring"
        intensity={0.45}
        color={skyColor}
        position={[0, 3, -8]}
        scale={10}
      />
      <Lightformer
        form="rect"
        intensity={0.3}
        color={groundColor}
        position={[0, -5, 0]}
        scale={[16, 16, 1]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </Environment>
  )
}

/**
 * Post stack without Bloom / procedural Sky.
 * Sky shader outputs Inf near the sun → half-float NaN → black flashes by angle.
 */
function PostFx({
  exposure,
  aoIntensity,
  vignetteDarkness,
}: {
  exposure: number
  aoIntensity: number
  vignetteDarkness: number
}) {
  const brightness = (exposure - 1) * 0.35
  return (
    <EffectComposer
      multisampling={0}
      enableNormalPass={false}
      frameBufferType={THREE.HalfFloatType}
    >
      <N8AO
        quality="medium"
        aoRadius={0.5}
        distanceFalloff={1}
        intensity={Math.max(0, aoIntensity)}
        halfRes={false}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <BrightnessContrast brightness={brightness} contrast={0} />
      <Vignette offset={0.28} darkness={Math.max(0, vignetteDarkness)} />
      <SMAA />
    </EffectComposer>
  )
}

/** While painting, only paintTarget meshes receive pointer hits. */
function PaintEventFilter({ enabled }: { enabled: boolean }) {
  const setEvents = useThree((s) => s.setEvents)
  useEffect(() => {
    if (!enabled) {
      setEvents({ filter: (hits) => hits })
      return
    }
    setEvents({
      filter: (hits) => hits.filter((h) => h.object.userData?.paintTarget),
    })
    return () => setEvents({ filter: (hits) => hits })
  }, [enabled, setEvents])
  return null
}

function FloorWallSolidMesh({
  floorId,
  layers,
  activeFloorId,
  exterior,
  shadowsEnabled,
  ghost = false,
  pickable = true,
}: {
  floorId: string
  layers: Array<{
    y: number
    height: number
    rings: Array<Array<{ x: number; z: number }>>
    holes: Array<Array<Array<{ x: number; z: number }>>>
  }>
  activeFloorId: string
  exterior: boolean
  shadowsEnabled: boolean
  ghost?: boolean
  pickable?: boolean
}) {
  const geometry = useMemo(() => {
    if (layers.length === 0) return null
    const geos: THREE.BufferGeometry[] = []
    for (const layer of layers) {
      for (let i = 0; i < layer.rings.length; i++) {
        const ring = layer.rings[i]
        if (ring.length < 3) continue
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
    return merged
  }, [layers])

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  const isActive = floorId === activeFloorId
  const opacity = ghost ? 0.28 : 1
  const color = exterior
    ? isActive
      ? '#6b8f71'
      : '#8aa889'
    : isActive
      ? '#d4c4a8'
      : '#b8a88c'

  if (!geometry) return null

  return (
    <mesh
      geometry={geometry}
      castShadow={shadowsEnabled && !ghost}
      receiveShadow={shadowsEnabled && !ghost}
      raycast={pickable ? undefined : disableRaycast}
    >
      <meshStandardMaterial
        color={color}
        transparent={ghost}
        opacity={opacity}
        depthWrite={!ghost}
        roughness={0.78}
        metalness={0.04}
        envMapIntensity={0.35}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function WallFaceMesh({
  floorId,
  wallId,
  side,
  geometry,
  material,
  selected,
  dimmed,
}: {
  floorId: string
  wallId: string
  side: WallSide
  geometry: THREE.BufferGeometry
  material?: MaterialRef | null
  selected: boolean
  dimmed: boolean
}) {
  const sceneMode = useBuildingStore((s) => s.sceneMode)
  const setSelection = useBuildingStore((s) => s.setSelection)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const painting = sceneMode === 'paint'
  const placing = useBuildingStore(
    (s) => s.tool === 'placeObject' && s.pendingModel != null,
  )
  const routing = useBuildingStore(
    (s) => isMepDrawTool(s.tool) || isMepFixtureTool(s.tool),
  )
  const landscaping = useBuildingStore((s) => s.workbench === 'landscape')
  const blockHits = painting || placing || routing || landscaping

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    setActiveFloor(floorId)
    setSelection({ kind: 'wall', id: wallId })
  }

  return (
    <mesh
      geometry={geometry}
      // In paint/place mode only dedicated pickables receive hits
      raycast={blockHits ? disableRaycast : undefined}
      onClick={blockHits ? undefined : onClick}
      onPointerOver={
        blockHits
          ? undefined
          : (e) => {
              e.stopPropagation()
              document.body.style.cursor = 'pointer'
            }
      }
      onPointerOut={
        blockHits
          ? undefined
          : () => {
              document.body.style.cursor = 'default'
            }
      }
      userData={{ wallId, side }}
      renderOrder={3}
    >
      <PbrStandardMaterial
        material={material}
        color={selected ? '#e8d4b8' : '#d4c4a8'}
        transparent={dimmed}
        opacity={dimmed ? 0.4 : 1}
        side={THREE.FrontSide}
        meterUvs
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  )
}

function WallCutMesh({
  floorId,
  wallId,
  geometry,
  material,
  selected,
  dimmed,
}: {
  floorId: string
  wallId: string
  geometry: THREE.BufferGeometry
  material?: MaterialRef | null
  selected: boolean
  dimmed: boolean
}) {
  const sceneMode = useBuildingStore((s) => s.sceneMode)
  const setSelection = useBuildingStore((s) => s.setSelection)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const painting = sceneMode === 'paint'
  const placing = useBuildingStore(
    (s) => s.tool === 'placeObject' && s.pendingModel != null,
  )
  const routing = useBuildingStore(
    (s) => isMepDrawTool(s.tool) || isMepFixtureTool(s.tool),
  )
  const landscaping = useBuildingStore((s) => s.workbench === 'landscape')
  const blockHits = painting || placing || routing || landscaping

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    setActiveFloor(floorId)
    setSelection({ kind: 'wall', id: wallId })
  }

  return (
    <mesh
      geometry={geometry}
      raycast={blockHits ? disableRaycast : undefined}
      onClick={blockHits ? undefined : onClick}
      onPointerOver={
        blockHits
          ? undefined
          : (e) => {
              e.stopPropagation()
              document.body.style.cursor = 'pointer'
            }
      }
      onPointerOut={
        blockHits
          ? undefined
          : () => {
              document.body.style.cursor = 'default'
            }
      }
      userData={{ wallId, paintKind: 'wall-cut' }}
      renderOrder={3}
    >
      <PbrStandardMaterial
        material={material}
        color={selected ? '#e8d4b8' : '#d4c4a8'}
        transparent={dimmed}
        opacity={dimmed ? 0.4 : 1}
        side={THREE.FrontSide}
        meterUvs
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  )
}

function FloorFinishes({
  floorId,
  shadowsEnabled,
  ghost = false,
}: {
  floorId: string
  shadowsEnabled: boolean
  ghost?: boolean
}) {
  const floor = useBuildingStore((s) =>
    s.building.floors.find((f) => f.id === floorId),
  )
  const selection = useBuildingStore((s) => s.selection)
  const setSelection = useBuildingStore((s) => s.setSelection)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const sceneMode = useBuildingStore((s) => s.sceneMode)
  const painting = sceneMode === 'paint'
  const placing = useBuildingStore(
    (s) => s.tool === 'placeObject' && s.pendingModel != null,
  )
  const routing = useBuildingStore(
    (s) => isMepDrawTool(s.tool) || isMepFixtureTool(s.tool),
  )
  const landscaping = useBuildingStore((s) => s.workbench === 'landscape')
  const blockHits = painting || placing || routing || landscaping

  const wallFaces = useMemo(() => {
    if (!floor || !isStoryFloor(floor)) return []
    const items: Array<{
      key: string
      wallId: string
      side: WallSide
      geo: THREE.BufferGeometry
      material: NonNullable<
        NonNullable<(typeof floor.walls)[0]['materials']>['pos']
      >
    }> = []
    for (const wall of floor.walls) {
      for (const side of ['pos', 'neg'] as WallSide[]) {
        const mat = wall.materials?.[side]
        if (!mat) continue
        const geo = buildWallFaceGeometry(floor, wall, side)
        if (!geo) continue
        items.push({
          key: `${wall.id}-${side}`,
          wallId: wall.id,
          side,
          geo,
          material: mat,
        })
      }
    }
    return items
  }, [floor])

  const wallCuts = useMemo(() => {
    if (!floor || !isStoryFloor(floor)) return []
    const items: Array<{
      key: string
      wallId: string
      geo: THREE.BufferGeometry
      material: NonNullable<
        NonNullable<(typeof floor.walls)[0]['materials']>['cut']
      >
    }> = []
    for (const wall of floor.walls) {
      const mat = wall.materials?.cut
      if (!mat) continue
      const geo = buildWallCutGeometry(floor, wall)
      if (!geo) continue
      items.push({
        key: `${wall.id}-cut`,
        wallId: wall.id,
        geo,
        material: mat,
      })
    }
    return items
  }, [floor])

  const slabCuts = useMemo(() => {
    if (!floor || !isStoryFloor(floor)) return []
    const items: Array<{
      key: string
      openingId: string
      geo: THREE.BufferGeometry
      material: NonNullable<(typeof floor.slabOpenings)[0]['material']>
    }> = []
    for (const opening of floor.slabOpenings ?? []) {
      const mat = opening.material
      if (!mat) continue
      const geo = buildSlabOpeningCutGeometry(floor, opening)
      if (!geo) continue
      items.push({
        key: `${opening.id}-cut`,
        openingId: opening.id,
        geo,
        material: mat,
      })
    }
    return items
  }, [floor])

  const roomFloors = useMemo(() => {
    if (!floor || !isStoryFloor(floor)) return []
    const regions = floorPaintRegions(floor)
    const holes = floorSlabOpeningHoles(floor)
    const out: Array<{
      key: string
      geo: THREE.BufferGeometry
      mat: NonNullable<ReturnType<typeof resolveFloorRegionMaterial>>
    }> = []
    for (const region of regions) {
      const mat = resolveFloorRegionMaterial(floor, region.key)
      if (!mat) continue
      const geo = buildRoomFloorGeometry(region.polygon, floor.elevation, {
        holes,
        yOffset: FLOOR_FINISH_Y_OFFSET,
      })
      if (!geo) continue
      out.push({ key: region.key, geo, mat })
    }
    return out
  }, [floor])

  useEffect(() => {
    return () => {
      for (const item of wallFaces) item.geo.dispose()
      for (const item of wallCuts) item.geo.dispose()
      for (const item of slabCuts) item.geo.dispose()
      for (const item of roomFloors) item.geo.dispose()
    }
  }, [wallFaces, wallCuts, slabCuts, roomFloors])

  if (!floor) return null
  const dimmed = ghost

  return (
    <>
      {wallFaces.map((item) => (
        <WallFaceMesh
          key={item.key}
          floorId={floorId}
          wallId={item.wallId}
          side={item.side}
          geometry={item.geo}
          material={item.material}
          selected={
            selection?.kind === 'wall' && selection.id === item.wallId
          }
          dimmed={dimmed}
        />
      ))}
      {wallCuts.map((item) => (
        <WallCutMesh
          key={item.key}
          floorId={floorId}
          wallId={item.wallId}
          geometry={item.geo}
          material={item.material}
          selected={
            selection?.kind === 'wall' && selection.id === item.wallId
          }
          dimmed={dimmed}
        />
      ))}
      {slabCuts.map((item) => (
        <mesh
          key={item.key}
          geometry={item.geo}
          raycast={blockHits ? disableRaycast : undefined}
          onClick={
            blockHits
              ? undefined
              : (e: ThreeEvent<MouseEvent>) => {
                  e.stopPropagation()
                  setActiveFloor(floorId)
                  setSelection({ kind: 'slabOpening', id: item.openingId })
                }
          }
          onPointerOver={
            blockHits
              ? undefined
              : (e) => {
                  e.stopPropagation()
                  document.body.style.cursor = 'pointer'
                }
          }
          onPointerOut={
            blockHits
              ? undefined
              : () => {
                  document.body.style.cursor = 'default'
                }
          }
          userData={{ slabOpeningId: item.openingId, paintKind: 'slab-cut' }}
          renderOrder={3}
        >
          <PbrStandardMaterial
            material={item.material}
            color={
              selection?.kind === 'slabOpening' &&
              selection.id === item.openingId
                ? '#e8d4b8'
                : '#d4c4a8'
            }
            transparent={dimmed}
            opacity={dimmed ? 0.4 : 1}
            side={THREE.FrontSide}
            meterUvs
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ))}
      {roomFloors.map(({ key, geo, mat }) => (
        <mesh
          key={key}
          geometry={geo}
          receiveShadow={shadowsEnabled}
          raycast={blockHits ? disableRaycast : undefined}
          onClick={
            blockHits
              ? undefined
              : (e: ThreeEvent<MouseEvent>) => {
                  e.stopPropagation()
                  setActiveFloor(floorId)
                  setSelection({ kind: 'room', key })
                }
          }
          onPointerOver={
            blockHits
              ? undefined
              : (e) => {
                  e.stopPropagation()
                  document.body.style.cursor = 'pointer'
                }
          }
          onPointerOut={
            blockHits
              ? undefined
              : () => {
                  document.body.style.cursor = 'default'
                }
          }
          renderOrder={2}
        >
          <PbrStandardMaterial
            material={mat}
            color="#e8dfd0"
            transparent={dimmed}
            opacity={dimmed ? 0.45 : 1}
            side={THREE.DoubleSide}
            meterUvs
          />
        </mesh>
      ))}
    </>
  )
}

function FloorSlabs({
  slabs,
  activeFloorId,
  shadowsEnabled,
  visibilityByFloor,
  pickable = true,
}: {
  slabs: ReturnType<typeof extrudeBuilding>['slabs']
  activeFloorId: string
  shadowsEnabled: boolean
  visibilityByFloor: Map<string, FloorVisibility>
  pickable?: boolean
}) {
  return (
    <>
      {slabs.map((slab) =>
        slab.regions.map((region, ri) => (
          <FloorSlabRegionMesh
            key={`${slab.floorId}-${ri}`}
            floorId={slab.floorId}
            region={region}
            y={slab.y}
            thickness={slab.thickness}
            activeFloorId={activeFloorId}
            shadowsEnabled={shadowsEnabled}
            ghost={visibilityByFloor.get(slab.floorId) === 'ghost'}
            pickable={pickable}
          />
        )),
      )}
    </>
  )
}

function FloorSlabRegionMesh({
  floorId,
  region,
  y,
  thickness,
  activeFloorId,
  shadowsEnabled,
  ghost = false,
  pickable = true,
}: {
  floorId: string
  region: {
    outer: Array<{ x: number; z: number }>
    holes: Array<Array<{ x: number; z: number }>>
  }
  y: number
  thickness: number
  activeFloorId: string
  shadowsEnabled: boolean
  ghost?: boolean
  pickable?: boolean
}) {
  const geometry = useMemo(() => {
    if (region.outer.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(region.outer[0].x, region.outer[0].z)
    for (let i = 1; i < region.outer.length; i++) {
      shape.lineTo(region.outer[i].x, region.outer[i].z)
    }
    shape.closePath()
    for (const hole of region.holes) {
      if (hole.length < 3) continue
      const path = new THREE.Path()
      path.moveTo(hole[0].x, hole[0].z)
      for (let j = 1; j < hole.length; j++) {
        path.lineTo(hole[j].x, hole[j].z)
      }
      path.closePath()
      shape.holes.push(path)
    }
    try {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(0.05, thickness),
        bevelEnabled: false,
        curveSegments: 1,
        steps: 1,
      })
      // Same XZ mapping as walls: rotateX(-π/2) → world Z = −planY
      geo.rotateX(-Math.PI / 2)
      // Bottom at elevation−thickness, top slightly above elevation (vs ground)
      geo.translate(0, y - thickness + 0.01, 0)
      return geo
    } catch {
      return null
    }
  }, [region, y, thickness])

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!geometry) return null

  const isActive = floorId === activeFloorId
  const opaque = !ghost
  return (
    <mesh
      geometry={geometry}
      receiveShadow={shadowsEnabled && opaque}
      castShadow={shadowsEnabled && opaque}
      raycast={pickable ? undefined : disableRaycast}
      renderOrder={1}
    >
      <meshStandardMaterial
        color={isActive ? '#e8dfd0' : '#cfc3b0'}
        transparent={!opaque}
        opacity={opaque ? 1 : 0.28}
        roughness={0.92}
        metalness={0}
        side={THREE.DoubleSide}
        depthWrite={opaque}
      />
    </mesh>
  )
}

function SunLight({
  position,
  intensity,
  shadowsEnabled,
  target,
}: {
  position: [number, number, number]
  intensity: number
  shadowsEnabled: boolean
  target: [number, number, number]
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null)

  useEffect(() => {
    const light = lightRef.current
    if (!light) return
    light.target.position.set(...target)
    light.target.updateMatrixWorld()
  }, [target])

  return (
    <directionalLight
      ref={lightRef}
      position={position}
      intensity={intensity}
      color="#fff4e0"
      castShadow={shadowsEnabled}
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.00025}
      shadow-normalBias={0.04}
      shadow-camera-near={0.5}
      shadow-camera-far={80}
      shadow-camera-left={-28}
      shadow-camera-right={28}
      shadow-camera-top={28}
      shadow-camera-bottom={-28}
    />
  )
}

function ToneMappingSetup({ exposure }: { exposure: number }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    // Composer owns final tone mapping; keep exposure for materials / fallback.
    gl.toneMappingExposure = exposure
    gl.shadowMap.type = THREE.PCFSoftShadowMap
  }, [gl, exposure])
  return null
}

/** Restore orbit camera once when remounting after visit mode. */
function OrbitCameraReset({ center }: { center: [number, number, number] }) {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(10, 8, 10)
    camera.lookAt(center[0], center[1], center[2])
    if ('fov' in camera) {
      ;(camera as THREE.PerspectiveCamera).fov = 45
      ;(camera as THREE.PerspectiveCamera).updateProjectionMatrix()
    }
    // Mount-only: remounts when leaving visit mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [camera])
  return null
}

function SceneContent({
  onVisitActiveChange,
}: {
  onVisitActiveChange?: (state: VisitActiveState) => void
}) {
  const building = useBuildingStore((s) => s.building)
  const activeFloorId = useBuildingStore((s) => s.activeFloorId)
  const sceneMode = useBuildingStore((s) => s.sceneMode)
  const lighting = useBuildingStore((s) => s.lighting)
  const transformDragging = useBuildingStore((s) => s.transformDragging)
  const pendingModel = useBuildingStore((s) => s.pendingModel)
  const tool = useBuildingStore((s) => s.tool)
  const workbench = useBuildingStore((s) => s.workbench)

  const visit = sceneMode === 'visit'
  const exterior = sceneMode === 'exterior'
  const painting = sceneMode === 'paint'
  const placing =
    !visit && !painting && tool === 'placeObject' && pendingModel != null
  const landscaping =
    !visit && !painting && workbench === 'landscape'
  const routing =
    !visit &&
    !painting &&
    !placing &&
    !landscaping &&
    (isMepDrawTool(tool) || isMepFixtureTool(tool))
  const mepGhost = isMepWorkbench(workbench) && !visit && !painting
  /** Paint uses interior-style opacity (only active floor solid). */
  const finishExterior = exterior

  const { floors, slabs } = useMemo(() => extrudeBuilding(building), [building])
  const bounds = useMemo(() => buildingBounds(building), [building])
  const visibilityByFloor = useMemo(() => {
    const map = new Map<string, FloorVisibility>()
    for (const f of building.floors) {
      map.set(f.id, normalizeFloorVisibility(f.visible))
    }
    if (mepGhost) {
      const cur = map.get(activeFloorId)
      if (cur === 'solid') map.set(activeFloorId, 'ghost')
    }
    return map
  }, [building.floors, mepGhost, activeFloorId])

  const visibleFloorIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [id, vis] of visibilityByFloor) {
      if (isFloorRendered(vis)) ids.add(id)
    }
    return ids
  }, [visibilityByFloor])

  const visibleFloors = useMemo(
    () => floors.filter((f) => visibleFloorIds.has(f.floorId)),
    [floors, visibleFloorIds],
  )
  const visibleSlabs = useMemo(
    () => slabs.filter((s) => visibleFloorIds.has(s.floorId)),
    [slabs, visibleFloorIds],
  )

  const activeFloor = building.floors.find((f) => f.id === activeFloorId)
  const groundFloor = building.floors.find((f) => f.kind === 'ground')
  const groundY = groundFloor?.elevation ?? 0
  const groundVisible = isFloorRendered(
    normalizeFloorVisibility(groundFloor?.visible),
  )
  const showOutdoorLandscape = shouldShowOutdoorLandscape({
    groundVisible,
    sceneMode,
    workbench,
    activeFloorKind: activeFloor?.kind,
  })
  const floorY = activeFloor?.kind === 'ground'
    ? groundY
    : (activeFloor?.elevation ?? groundY)
  const planCenterX = (bounds.minX + bounds.maxX) / 2
  const planCenterZ = (bounds.minZ + bounds.maxZ) / 2
  const center: [number, number, number] = [
    planCenterX,
    (bounds.minY + bounds.maxY) / 2,
    // Plan Y → world −Z (same as ExtrudeGeometry + rotateX)
    -planCenterZ,
  ]
  const spawn: [number, number, number] = [center[0], floorY, center[2]]

  const span = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxZ - bounds.minZ,
    12,
  )
  const groundSize = Math.max(40, span * 3)

  const dir = useMemo(
    () => sunDirection(lighting.sunAzimuth, lighting.sunElevation),
    [lighting.sunAzimuth, lighting.sunElevation],
  )
  const sunDistance = Math.max(22, span * 2.2)
  const sunPosition: [number, number, number] = [
    center[0] + dir[0] * sunDistance,
    center[1] + dir[1] * sunDistance,
    center[2] + dir[2] * sunDistance,
  ]

  // Warm fill from opposite side of sun (bounce light)
  const fillPos: [number, number, number] = [
    center[0] - dir[0] * sunDistance * 0.55,
    Math.max(4, center[1] + sunDistance * 0.25),
    center[2] - dir[2] * sunDistance * 0.55,
  ]

  return (
    <>
      <ToneMappingSetup exposure={lighting.exposure} />
      <PaintEventFilter enabled={painting} />
      <color attach="background" args={[lighting.skyColor]} />
      <fog attach="fog" args={[lighting.skyColor, 40, 110]} />

      <hemisphereLight
        args={[lighting.skyColor, lighting.groundColor, lighting.ambientIntensity]}
      />
      <ambientLight intensity={lighting.ambientIntensity * 0.25} color="#e8eef4" />
      <LocalEnvironment
        intensity={lighting.ambientIntensity}
        skyColor={lighting.skyColor}
        groundColor={lighting.groundColor}
      />

      <SunLight
        position={sunPosition}
        intensity={lighting.sunIntensity}
        shadowsEnabled={lighting.shadowsEnabled}
        target={center}
      />
      <directionalLight
        position={fillPos}
        intensity={lighting.sunIntensity * 0.22}
        color="#a8c4e0"
      />

      {!visit && showOutdoorLandscape && (
        <TerrainGround
          shadowsEnabled={lighting.shadowsEnabled}
          pickable={!painting && !routing}
        />
      )}
      {showOutdoorLandscape && <LandscapeGrass visit={visit} />}
      {showOutdoorLandscape && (
        <LandscapePlants shadowsEnabled={lighting.shadowsEnabled} />
      )}
      {showOutdoorLandscape && groundFloor && (
        <PlacedObjects
          floor={groundFloor}
          shadowsEnabled={lighting.shadowsEnabled}
        />
      )}

      {lighting.contactShadows && showOutdoorLandscape && (
        <ContactShadows
          position={[planCenterX, groundY - 0.008, -planCenterZ]}
          opacity={0.4}
          scale={groundSize}
          blur={2.4}
          far={10}
          resolution={512}
          frames={1}
          color="#2a241c"
        />
      )}

      <group>
        {visibleFloors.map((f) => {
          const floorData = building.floors.find((fl) => fl.id === f.floorId)
          const ghost = visibilityByFloor.get(f.floorId) === 'ghost'
          return (
          <group key={f.floorId}>
            <FloorWallSolidMesh
              floorId={f.floorId}
              layers={f.layers}
              activeFloorId={activeFloorId}
              exterior={finishExterior}
              shadowsEnabled={lighting.shadowsEnabled}
              ghost={ghost}
              pickable={!painting && !placing && !routing && !landscaping}
            />
            <FloorFinishes
              floorId={f.floorId}
              shadowsEnabled={lighting.shadowsEnabled}
              ghost={ghost}
            />
            {painting && f.floorId === activeFloorId && (
              <PaintPickables floorId={f.floorId} />
            )}
            {floorData && (
              <PlacedObjects
                floor={floorData}
                shadowsEnabled={lighting.shadowsEnabled}
              />
            )}
          </group>
          )
        })}
        <FloorSlabs
          slabs={visibleSlabs}
          activeFloorId={activeFloorId}
          shadowsEnabled={lighting.shadowsEnabled}
          visibilityByFloor={visibilityByFloor}
          pickable={!painting && !placing && !routing && !landscaping}
        />
        {!visit && !painting && !placing && !routing && workbench !== 'landscape' && (
          <WallPickables />
        )}
        {!visit && !painting && !placing && !routing && workbench !== 'landscape' && (
          <OpeningPickables showSlabs />
        )}
        {!visit &&
          !painting &&
          building.floors
            .filter((f) => f.kind !== 'ground' && visibleFloorIds.has(f.id))
            .map((f) => (
              <MepNetworks
                key={`mep-${f.id}`}
                floor={f}
                routing={routing && f.id === activeFloorId}
              />
            ))}
        {/* Placement plane last so it wins raycasts over floors/walls */}
        {placing &&
          activeFloor &&
          activeFloor.kind !== 'ground' && (
            <PlaceObjectFloorHit floor={activeFloor} />
          )}
      </group>

      {visit ? (
        <VisitControls
          spawn={spawn}
          floorY={floorY}
          heightAtWorld={(x, z) =>
            groundY + heightAt(groundFloor?.landscapeTerrain, x, -z)
          }
          onActiveChange={onVisitActiveChange}
        />
      ) : (
        <>
          <OrbitCameraReset center={center} />
          <OrbitControls
            target={center}
            makeDefault
            enabled={!transformDragging}
            maxPolarAngle={Math.PI * 0.49}
            mouseButtons={{
              LEFT: -1 as unknown as THREE.MOUSE,
              MIDDLE: THREE.MOUSE.PAN,
              RIGHT: THREE.MOUSE.ROTATE,
            }}
          />
        </>
      )}

      <PostFx
        exposure={lighting.exposure}
        aoIntensity={lighting.aoIntensity}
        vignetteDarkness={lighting.vignetteDarkness}
      />
    </>
  )
}

export function BuildingScene() {
  const sceneMode = useBuildingStore((s) => s.sceneMode)
  const setSceneMode = useBuildingStore((s) => s.setSceneMode)
  const lightingMenuOpen = useBuildingStore((s) => s.lightingMenuOpen)
  const setLightingMenuOpen = useBuildingStore((s) => s.setLightingMenuOpen)
  const [visitActive, setVisitActive] = useState<VisitActiveState>({
    engaged: false,
    pointerLocked: false,
  })
  const painting = sceneMode === 'paint'

  return (
    <div
      className={`view3d${painting ? ' view3d-paint' : ''}${
        sceneMode === 'visit' ? ' view3d-visit' : ''
      }${
        sceneMode === 'visit' && visitActive.engaged ? ' view3d-visit-active' : ''
      }${
        sceneMode === 'visit' && visitActive.pointerLocked
          ? ' view3d-visit-locked'
          : ''
      }`}
    >
      <div className="view3d-bar">
        <button
          type="button"
          className={sceneMode === 'interior' ? 'active' : ''}
          onClick={() => setSceneMode('interior')}
          disabled={painting}
        >
          Интерьер
        </button>
        <button
          type="button"
          className={sceneMode === 'exterior' ? 'active' : ''}
          onClick={() => setSceneMode('exterior')}
          disabled={painting}
        >
          Экстерьер
        </button>
        <button
          type="button"
          className={sceneMode === 'visit' ? 'active' : ''}
          onClick={() => {
            setVisitActive({ engaged: false, pointerLocked: false })
            setSceneMode('visit')
          }}
          disabled={painting}
        >
          Виртуальный визит
        </button>
        <button
          type="button"
          className={lightingMenuOpen ? 'active' : ''}
          onClick={() => setLightingMenuOpen(!lightingMenuOpen)}
        >
          Свет
        </button>
      </div>
      {painting && (
        <div className="paint-hint-bar muted">
          ЛКМ — нанести · Alt+ЛКМ — стереть · Shift+ЛКМ по полу — все стены комнаты
        </div>
      )}
      <LightingPanel />
      <div
        className="view3d-body"
        onContextMenu={(e) => e.preventDefault()}
      >
        {sceneMode === 'visit' && !visitActive.pointerLocked && (
          <div className="visit-hint visit-hint-shooter">
            <strong>Кликните для захвата мыши</strong>
            <span>Мышь — обзор · WASD — ходьба · Shift — бег · Esc — выход</span>
            <span className="visit-hint-note">
              На Hyprland, если курсор упирается в край: Chromium через X11
              (`chromium --ozone-platform=x11`) или браузер в XWayland
            </span>
          </div>
        )}
        {sceneMode === 'visit' && visitActive.pointerLocked && (
          <div className="visit-crosshair" aria-hidden />
        )}
        <Canvas
          camera={{ position: [10, 8, 10], fov: 45 }}
          shadows
          gl={{
            antialias: false,
            toneMapping: THREE.NoToneMapping,
            powerPreference: 'high-performance',
          }}
          onPointerMissed={(e) => {
            if (e.button !== 0 || sceneMode === 'visit') return
            // Gizmo meshes aren't in the R3F event system, so clicks on them
            // look like "misses". Wait a tick for TransformControls mouseDown.
            window.setTimeout(() => {
              const s = useBuildingStore.getState()
              if (s.transformDragging) return
              s.setSelection(null)
            }, 0)
          }}
        >
          <Suspense fallback={null}>
            <SceneContent onVisitActiveChange={setVisitActive} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  )
}
