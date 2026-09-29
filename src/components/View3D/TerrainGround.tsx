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
import { frameSizeX, frameSizeY } from '../../landscape/maps'
import { applyHeightsToPositions, ensureTerrain, terrainFrame } from '../../landscape/terrain'
import { HEX_SIZE_M } from '../../landscape/hexTiling'
import { applyTileRepeat, loadPbrMaps, type LoadedPbrMaps } from '../../materials/ambientcg'
import { materialCacheKey } from '../../materials/customTextures'
import type { MaterialRef } from '../../engine/types'
import { useBuildingStore } from '../../store/buildingStore'
import { disableRaycast } from './PaintPickables'

function useSplatMaps(layers: Array<MaterialRef | null | undefined>) {
  const key = layers
    .map((l) => (l ? `${materialCacheKey(l)}:${l.tileSizeM}` : ''))
    .join('|')
  const [maps, setMaps] = useState<Array<LoadedPbrMaps | null>>([
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
          return m
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

function layerTint(hex: string | undefined): THREE.Color {
  return new THREE.Color(hex ?? '#ffffff')
}

export function TerrainGround({
  shadowsEnabled,
  pickable,
}: {
  shadowsEnabled: boolean
  pickable: boolean
}) {
  const landscapeTerrain = useBuildingStore(
    (s) => s.building.floors.find((f) => f.kind === 'ground')?.landscapeTerrain,
  )
  const paint = useBuildingStore(
    (s) => s.building.floors.find((f) => f.kind === 'ground')?.landscapePaint,
  )
  const groundY = useBuildingStore(
    (s) => s.building.floors.find((f) => f.kind === 'ground')?.elevation ?? 0,
  )
  const workbench = useBuildingStore((s) => s.workbench)
  const tool = useBuildingStore((s) => s.tool)
  const terrain = ensureTerrain(
    useBuildingStore.getState().building,
    landscapeTerrain,
  )
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

  const sizeX = frameSizeX(frame)
  const sizeY = frameSizeY(frame)

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(sizeX, sizeY, res - 1, res - 1)
    geo.rotateX(-Math.PI / 2)
    applyHeightsToPositions(geo.attributes.position.array as Float32Array, heights, res, 0)
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    return geo
  }, [sizeX, sizeY, res, heights])

  useEffect(() => () => geometry.dispose(), [geometry])

  const layerMaps = useSplatMaps(paint?.layers ?? [null, null, null, null])
  const splatUniforms = useMemo(() => createSplatUniforms(), [])
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 1,
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
    const albedo = [
      layerMaps[0]?.map ?? emptySplatMap,
      layerMaps[1]?.map ?? emptySplatMap,
      layerMaps[2]?.map ?? emptySplatMap,
      layerMaps[3]?.map ?? emptySplatMap,
    ]
    const normals = [
      layerMaps[0]?.normalMap ?? emptySplatMap,
      layerMaps[1]?.normalMap ?? emptySplatMap,
      layerMaps[2]?.normalMap ?? emptySplatMap,
      layerMaps[3]?.normalMap ?? emptySplatMap,
    ]
    const roughMaps = [
      layerMaps[0]?.roughnessMap ?? emptySplatMap,
      layerMaps[1]?.roughnessMap ?? emptySplatMap,
      layerMaps[2]?.roughnessMap ?? emptySplatMap,
      layerMaps[3]?.roughnessMap ?? emptySplatMap,
    ]
    u.uL0.value = albedo[0]
    u.uL1.value = albedo[1]
    u.uL2.value = albedo[2]
    u.uL3.value = albedo[3]
    u.uN0.value = normals[0]
    u.uN1.value = normals[1]
    u.uN2.value = normals[2]
    u.uN3.value = normals[3]
    u.uR0.value = roughMaps[0]
    u.uR1.value = roughMaps[1]
    u.uR2.value = roughMaps[2]
    u.uR3.value = roughMaps[3]
    u.uHas.value.set(
      layerMaps[0] ? 1 : 0,
      layerMaps[1] ? 1 : 0,
      layerMaps[2] ? 1 : 0,
      layerMaps[3] ? 1 : 0,
    )
    u.uHasN.value.set(
      layerMaps[0]?.normalMap ? 1 : 0,
      layerMaps[1]?.normalMap ? 1 : 0,
      layerMaps[2]?.normalMap ? 1 : 0,
      layerMaps[3]?.normalMap ? 1 : 0,
    )
    u.uHasR.value.set(
      layerMaps[0]?.roughnessMap ? 1 : 0,
      layerMaps[1]?.roughnessMap ? 1 : 0,
      layerMaps[2]?.roughnessMap ? 1 : 0,
      layerMaps[3]?.roughnessMap ? 1 : 0,
    )
    u.uTint0.value.copy(layerTint(layers[0]?.tint))
    u.uTint1.value.copy(layerTint(layers[1]?.tint))
    u.uTint2.value.copy(layerTint(layers[2]?.tint))
    u.uTint3.value.copy(layerTint(layers[3]?.tint))
    u.uRough.value.set(
      layers[0]?.roughness ?? (layerMaps[0]?.roughnessMap ? 1 : 0.95),
      layers[1]?.roughness ?? (layerMaps[1]?.roughnessMap ? 1 : 0.95),
      layers[2]?.roughness ?? (layerMaps[2]?.roughnessMap ? 1 : 0.95),
      layers[3]?.roughness ?? (layerMaps[3]?.roughnessMap ? 1 : 0.95),
    )
    u.uMetal.value.set(
      layers[0]?.metalness ?? 0,
      layers[1]?.metalness ?? 0,
      layers[2]?.metalness ?? 0,
      layers[3]?.metalness ?? 0,
    )
    u.uNScale.value.set(
      layers[0]?.normalScale ?? 0.85,
      layers[1]?.normalScale ?? 0.85,
      layers[2]?.normalScale ?? 0.85,
      layers[3]?.normalScale ?? 0.85,
    )
    u.uOrigin.value.set(frame.originX, frame.originY)
    u.uSize.value.set(sizeX, sizeY)
    u.uHexSize.value = HEX_SIZE_M
    u.uTile.value.set(
      1 / Math.max(0.4, layers[0]?.tileSizeM ?? 4),
      1 / Math.max(0.4, layers[1]?.tileSizeM ?? 4),
      1 / Math.max(0.4, layers[2]?.tileSizeM ?? 4),
      1 / Math.max(0.4, layers[3]?.tileSizeM ?? 4),
    )
  }, [layerMaps, paint?.layers, frame.originX, frame.originY, sizeX, sizeY, splatUniforms])

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
