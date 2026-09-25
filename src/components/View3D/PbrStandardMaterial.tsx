import { useEffect, useState } from 'react'
import * as THREE from 'three'
import type { MaterialRef } from '../../engine/types'
import {
  applyTileRepeat,
  DEFAULT_DISPLACEMENT_SCALE,
  loadPbrMaps,
  type LoadedPbrMaps,
} from '../../materials/ambientcg'

export function usePbrMaps(
  material: MaterialRef | null | undefined,
  /** Set true when mesh UVs are already in meters (wall face geos). */
  meterUvs = false,
  worldWidthM = 1,
  worldHeightM = 1,
): {
  maps: LoadedPbrMaps | null
  status: 'idle' | 'loading' | 'ok' | 'error'
} {
  const [maps, setMaps] = useState<LoadedPbrMaps | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>(
    'idle',
  )

  useEffect(() => {
    if (!material) {
      setMaps(null)
      setStatus('idle')
      return
    }
    let alive = true
    setStatus('loading')
    loadPbrMaps(material)
      .then((m) => {
        if (!alive) return
        const u = meterUvs ? 1 : worldWidthM
        const v = meterUvs ? 1 : worldHeightM
        applyTileRepeat(m, material.tileSizeM, u, v)
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
    material?.tileSizeM,
    meterUvs,
    worldWidthM,
    worldHeightM,
  ])

  useEffect(() => {
    if (!maps || !material) return
    const u = meterUvs ? 1 : worldWidthM
    const v = meterUvs ? 1 : worldHeightM
    applyTileRepeat(maps, material.tileSizeM, u, v)
  }, [maps, material?.tileSizeM, meterUvs, worldWidthM, worldHeightM])

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
}) {
  const { maps, status } = usePbrMaps(
    material,
    meterUvs,
    worldWidthM ?? 1,
    worldHeightM ?? 1,
  )

  const hasMap = !!maps?.map
  const displayColor =
    status === 'loading'
      ? '#c4b08a'
      : status === 'error'
        ? '#c45c26'
        : hasMap
          ? '#ffffff'
          : color

  const mapKey = [
    material ? `${material.source}:${material.assetId}` : 'none',
    status,
    hasMap ? 'm' : '',
    maps?.normalMap ? 'n' : '',
    maps?.roughnessMap ? 'r' : '',
    maps?.metalnessMap ? 'me' : '',
    maps?.aoMap ? 'ao' : '',
    maps?.displacementMap ? 'd' : '',
    maps?.displacementMap
      ? String(material?.displacementScale ?? DEFAULT_DISPLACEMENT_SCALE)
      : '',
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
      displacementMap={maps?.displacementMap ?? undefined}
      displacementScale={
        maps?.displacementMap
          ? (material?.displacementScale ?? DEFAULT_DISPLACEMENT_SCALE)
          : 0
      }
      normalScale={
        maps?.normalMap ? new THREE.Vector2(0.85, 0.85) : undefined
      }
      roughness={maps?.roughnessMap ? 1 : 0.75}
      metalness={maps?.metalnessMap ? 1 : 0}
      aoMapIntensity={maps?.aoMap ? 1 : 0}
      envMapIntensity={0.75}
      transparent={transparent}
      opacity={opacity}
      side={side}
      polygonOffset={polygonOffset}
      polygonOffsetFactor={polygonOffsetFactor}
      polygonOffsetUnits={polygonOffsetUnits}
    />
  )
}
