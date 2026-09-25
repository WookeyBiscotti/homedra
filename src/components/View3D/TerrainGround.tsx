import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { decodeBytes, decodeHeights } from '../../landscape/maps'
import {
  bindSplatShader,
  createSplatUniforms,
  emptySplatMap,
  makeSplatTexture,
  writeSplatTexture,
} from '../../landscape/splatMaterial'
import { applyHeightsToPositions, ensureTerrain, terrainFrame } from '../../landscape/terrain'
import { loadPbrMaps } from '../../materials/ambientcg'
import { applyTileRepeat } from '../../materials/ambientcg'
import { materialCacheKey } from '../../materials/customTextures'
import type { MaterialRef } from '../../engine/types'
import { useBuildingStore } from '../../store/buildingStore'
import { disableRaycast } from './PaintPickables'

function useSplatMaps(layers: Array<MaterialRef | null | undefined>) {
  const key = layers
    .map((l) => (l ? `${materialCacheKey(l)}:${l.tileSizeM}` : ''))
    .join('|')
  const [maps, setMaps] = useState<Array<THREE.Texture | null>>([
    null,
    null,
    null,
    null,
  ])
  useEffect(() => {
    let alive = true
    const refs = key.split('|').map((part, i) => (part ? layers[i] : null))
    void Promise.all(
      refs.map(async (l) => {
        if (!l) return null
        try {
          const m = await loadPbrMaps(l)
          applyTileRepeat(m, l.tileSizeM, 1, 1)
          return m.map
        } catch {
          return null
        }
      }),
    ).then((loaded) => {
      if (alive) setMaps(loaded)
    })
    return () => {
      alive = false
    }
    // layers is read only when key changes — avoid identity churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return maps
}

export function TerrainGround({
  shadowsEnabled,
  pickable,
}: {
  shadowsEnabled: boolean
  pickable: boolean
}) {
  const building = useBuildingStore((s) => s.building)
  const workbench = useBuildingStore((s) => s.workbench)
  const tool = useBuildingStore((s) => s.tool)
  const ground = building.floors.find((f) => f.kind === 'ground')
  const terrain = ensureTerrain(building, ground?.landscapeTerrain)
  const paint = ground?.landscapePaint
  const groundY = ground?.elevation ?? 0
  const res = terrain.resolution
  const frame = terrainFrame(terrain)
  const heights = useMemo(
    () => decodeHeights(terrain.heightPng, res * res),
    [terrain.heightPng, res],
  )
  const splatBytes = useMemo(
    () => decodeBytes(paint?.splatPng, (paint?.resolution ?? 256) ** 2 * 4),
    [paint?.splatPng, paint?.resolution],
  )

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(frame.size, frame.size, res - 1, res - 1)
    geo.rotateX(-Math.PI / 2)
    applyHeightsToPositions(geo.attributes.position.array as Float32Array, heights, res, 0)
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    return geo
  }, [frame.size, res, heights])

  useEffect(() => () => geometry.dispose(), [geometry])

  const layerMaps = useSplatMaps(paint?.layers ?? [null, null, null, null])
  const splatUniforms = useMemo(() => createSplatUniforms(), [])
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    bindSplatShader(mat, splatUniforms)
    return mat
  }, [splatUniforms])
  const splatTexRef = useRef<THREE.DataTexture | null>(null)

  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const r = paint?.resolution ?? 256
    let tex = splatTexRef.current
    if (!tex || tex.image.width !== r) {
      tex?.dispose()
      tex = makeSplatTexture(r, splatBytes)
      splatTexRef.current = tex
      splatUniforms.uSplat.value = tex
    } else {
      writeSplatTexture(tex, splatBytes)
    }
  }, [splatBytes, paint?.resolution, splatUniforms])

  useEffect(() => () => splatTexRef.current?.dispose(), [])

  useEffect(() => {
    const u = splatUniforms
    const layers = paint?.layers ?? [null, null, null, null]
    u.uL0.value = layerMaps[0] ?? emptySplatMap
    u.uL1.value = layerMaps[1] ?? emptySplatMap
    u.uL2.value = layerMaps[2] ?? emptySplatMap
    u.uL3.value = layerMaps[3] ?? emptySplatMap
    u.uHas.value.set(
      layerMaps[0] ? 1 : 0,
      layerMaps[1] ? 1 : 0,
      layerMaps[2] ? 1 : 0,
      layerMaps[3] ? 1 : 0,
    )
    u.uOrigin.value.set(frame.originX, frame.originY)
    u.uSize.value = frame.size
    u.uTile.value.set(
      1 / Math.max(0.4, layers[0]?.tileSizeM ?? 4),
      1 / Math.max(0.4, layers[1]?.tileSizeM ?? 4),
      1 / Math.max(0.4, layers[2]?.tileSizeM ?? 4),
      1 / Math.max(0.4, layers[3]?.tileSizeM ?? 4),
    )
  }, [layerMaps, paint?.layers, frame.originX, frame.originY, frame.size, splatUniforms])

  const stroking = useRef(false)
  const flatten = useRef(0)
  const cursor = useRef<THREE.Mesh>(null)
  const begin = useBuildingStore((s) => s.beginLandscapeStroke)
  const stampSculpt = useBuildingStore((s) => s.stampSculptAt)
  const stampPaint = useBuildingStore((s) => s.stampGroundPaintAt)
  const stampGrass = useBuildingStore((s) => s.stampGrassAt)
  const placeObjectAt = useBuildingStore((s) => s.placeObjectAt)
  const placePlantAt = useBuildingStore((s) => s.placePlantAt)
  const pendingModel = useBuildingStore((s) => s.pendingModel)
  const pendingPlant = useBuildingStore((s) => s.pendingPlantSpecies)
  const radius = useBuildingStore((s) => s.landscapeBrushRadius)

  const landscape = workbench === 'landscape'
  const brush =
    landscape &&
    (tool === 'sculptGround' || tool === 'paintGround' || tool === 'paintGrass')

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    if (!landscape) return
    e.stopPropagation()
    const x = e.point.x
    const y = -e.point.z
    if (tool === 'placeObject' && pendingModel) {
      placeObjectAt(x, y)
      return
    }
    if (tool === 'plant' && pendingPlant) {
      placePlantAt(x, y)
      return
    }
    if (!brush) return
    stroking.current = true
    flatten.current = e.point.y - groundY
    begin()
    if (tool === 'sculptGround') stampSculpt(x, y, flatten.current)
    else if (tool === 'paintGround') stampPaint(x, y, e.altKey)
    else stampGrass(x, y, e.altKey)
  }

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (cursor.current) {
      cursor.current.position.copy(e.point)
      cursor.current.parent?.worldToLocal(cursor.current.position)
      cursor.current.position.y += 0.03
    }
    if (!stroking.current || !brush) return
    e.stopPropagation()
    const x = e.point.x
    const y = -e.point.z
    if (tool === 'sculptGround') stampSculpt(x, y, flatten.current)
    else if (tool === 'paintGround') stampPaint(x, y, e.altKey)
    else stampGrass(x, y, e.altKey)
  }

  const onUp = () => {
    stroking.current = false
  }

  useFrame(() => {
    if (cursor.current) cursor.current.visible = brush
  })

  return (
    <group position={[frame.originX, groundY, -frame.originY]}>
      <mesh
        geometry={geometry}
        material={material}
        receiveShadow={shadowsEnabled}
        renderOrder={-1}
        raycast={pickable ? undefined : disableRaycast}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />
      <mesh ref={cursor} rotation={[-Math.PI / 2, 0, 0]} raycast={disableRaycast}>
        <ringGeometry args={[Math.max(0.05, radius * 0.92), radius, 48]} />
        <meshBasicMaterial color="#c45c26" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
