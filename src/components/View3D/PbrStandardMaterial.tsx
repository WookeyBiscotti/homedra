import { useEffect, useState } from 'react'
import * as THREE from 'three'
import type { MaterialRef, TileTexRegion } from '../../engine/types'
import {
  applyCeramicTileRepeat,
  applyTileRepeat,
  DEFAULT_DISPLACEMENT_SCALE,
  loadCeramicPbrMaps,
  loadFinishPbrMaps,
  type LoadedPbrMaps,
} from '../../materials/ambientcg'

export function usePbrMaps(
  material: MaterialRef | null | undefined,
  /** Set true when mesh UVs are already in meters (wall face geos). */
  meterUvs = false,
  worldWidthM = 1,
  worldHeightM = 1,
  texRegion?: TileTexRegion | null,
  ceramicStamp = false,
  faceWidthM = 1,
  faceHeightM = 1,
): {
  maps: LoadedPbrMaps | null
  status: 'idle' | 'loading' | 'ok' | 'error'
} {
  const [maps, setMaps] = useState<LoadedPbrMaps | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>(
    'idle',
  )
  const regionKey = texRegion
    ? `${texRegion.u0}:${texRegion.v0}:${texRegion.u1}:${texRegion.v1}`
    : 'full'
  const tileSizeM = material?.tileSizeM

  const applyMaps = (m: LoadedPbrMaps) => {
    if (ceramicStamp) {
      // Image is already the picker crop — do not apply region again.
      applyCeramicTileRepeat(m, faceWidthM, faceHeightM)
      return
    }
    const u = meterUvs ? 1 : worldWidthM
    const v = meterUvs ? 1 : worldHeightM
    // Crop is baked into the image when texRegion is set — tile the full stamp.
    applyTileRepeat(m, tileSizeM ?? 1.5, u, v)
  }

  // Reload when image identity or baked crop changes. Tile size only adjusts repeat.
  useEffect(() => {
    if (!material) {
      setMaps(null)
      setStatus('idle')
      return
    }
    let alive = true
    setStatus('loading')
    const pending = ceramicStamp
      ? loadCeramicPbrMaps(material, texRegion, faceWidthM, faceHeightM)
      : loadFinishPbrMaps(material, texRegion)
    pending
      .then((m) => {
        if (!alive) return
        if (!ceramicStamp) applyMaps(m)
        setMaps(m)
        setStatus('ok')
      })
      .catch((err) => {
        console.warn('[PBR] texture load failed', material.source, material.assetId, err)
        if (!alive) return
        setMaps(null)
        setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [
    material?.source,
    material?.assetId,
    material?.url,
    ceramicStamp,
    regionKey,
    ceramicStamp ? faceWidthM : 0,
    ceramicStamp ? faceHeightM : 0,
  ])

  useEffect(() => {
    if (!maps || !material || ceramicStamp) return
    applyMaps(maps)
  }, [maps, tileSizeM, meterUvs, worldWidthM, worldHeightM, ceramicStamp])

  return { maps, status }
}

/** Direct meshStandardMaterial child — must use attach so R3F binds it. */
export function PbrStandardMaterial({
  material,
  color = '#d4c4a8',
  transparent = false,
  opacity = 1,
  side = THREE.FrontSide,
  polygonOffset = false,
  polygonOffsetFactor = -1,
  polygonOffsetUnits = -1,
  meterUvs = false,
  worldWidthM,
  worldHeightM,
  texRegion,
  ceramicStamp = false,
  faceWidthM,
  faceHeightM,
  vertexDisplacement = true,
}: {
  material?: MaterialRef | null
  color?: string
  transparent?: boolean
  opacity?: number
  side?: THREE.Side
  polygonOffset?: boolean
  polygonOffsetFactor?: number
  polygonOffsetUnits?: number
  /** Wall face geos use meter UVs — don't multiply by world size. */
  meterUvs?: boolean
  worldWidthM?: number
  worldHeightM?: number
  texRegion?: TileTexRegion | null
  /** Ceramic tile: one stamp of the image on the 0–1 face, ignore tileSizeM. */
  ceramicStamp?: boolean
  faceWidthM?: number
  faceHeightM?: number
  /** Off for structural meshes — height maps must not lift the solid. */
  vertexDisplacement?: boolean
}) {
  const effectiveRegion = texRegion ?? material?.texRegion
  const { maps, status } = usePbrMaps(
    material,
    meterUvs,
    worldWidthM ?? 1,
    worldHeightM ?? 1,
    effectiveRegion,
    ceramicStamp,
    faceWidthM ?? 1,
    faceHeightM ?? 1,
  )

  const hasMap = !!maps?.map
  const nScale = material?.normalScale ?? 0.85
  const disp =
    vertexDisplacement && maps?.displacementMap
      ? (material?.displacementScale ?? DEFAULT_DISPLACEMENT_SCALE)
      : 0
  const displayColor =
    status === 'loading'
      ? '#c4b08a'
      : status === 'error'
        ? '#c45c26'
        : hasMap
          ? (material?.tint ?? '#ffffff')
          : (material?.tint ?? color)

  // Remount when loaded maps change (image and/or baked crop).
  const mapKey = [
    material ? `${material.source}:${material.assetId}` : 'none',
    status,
    hasMap ? 'm' : '',
    maps?.normalMap ? 'n' : '',
    maps?.roughnessMap ? 'r' : '',
    maps?.metalnessMap ? 'me' : '',
    maps?.aoMap ? 'ao' : '',
    `r:${effectiveRegion?.u0 ?? 0}:${effectiveRegion?.v0 ?? 0}:${effectiveRegion?.u1 ?? 1}:${effectiveRegion?.v1 ?? 1}`,
    disp > 0 ? 'd' : '',
  ].join('-')

  return (
    <meshStandardMaterial
      attach="material"
      key={mapKey}
      color={displayColor}
      map={maps?.map ?? undefined}
      normalMap={maps?.normalMap ?? undefined}
      roughnessMap={maps?.roughnessMap ?? undefined}
      metalnessMap={maps?.metalnessMap ?? undefined}
      aoMap={maps?.aoMap ?? undefined}
      displacementMap={
        vertexDisplacement && disp > 0
          ? (maps?.displacementMap ?? undefined)
          : undefined
      }
      displacementScale={disp}
      normalScale={
        maps?.normalMap ? new THREE.Vector2(nScale, nScale) : undefined
      }
      roughness={material?.roughness ?? (maps?.roughnessMap ? 1 : 0.75)}
      metalness={material?.metalness ?? (maps?.metalnessMap ? 1 : 0)}
      aoMapIntensity={
        maps?.aoMap ? (material?.aoMapIntensity ?? 1) : 0
      }
      envMapIntensity={material?.envMapIntensity ?? 0.75}
      transparent={transparent}
      opacity={opacity}
      side={side}
      polygonOffset={polygonOffset}
      polygonOffsetFactor={polygonOffsetFactor}
      polygonOffsetUnits={polygonOffsetUnits}
    />
  )
}
