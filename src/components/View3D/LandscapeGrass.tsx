import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { decodeBytes } from '../../landscape/maps'
import {
  disposeEzGrassMaterial,
  EZ_GRASS_GLB_URL,
  makeEzGrassMaterial,
  prepareEzGrassTuft,
  tickEzGrassWind,
} from '../../landscape/ezGrass'
import { GRASS_INSTANCE_CAP, layoutGrass } from '../../landscape/grassField'
import { grassLayers } from '../../landscape/grassLayers'
import { ensureTerrain, terrainFrame } from '../../landscape/terrain'
import {
  buildingFootprintHoles,
  buildingMeshDeps,
} from '../../engine/extrude'
import { type Building, type LandscapeGrassLayer } from '../../engine/types'
import { useRefMemo } from '../../hooks/useRefMemo'
import { useBuildingEqual } from '../../store/buildingStore'
import { disableRaycast } from './PaintPickables'

useGLTF.preload(EZ_GRASS_GLB_URL)

function grassSceneEqual(a: Building, b: Building): boolean {
  if (a === b) return true
  const ga = a.floors.find((f) => f.kind === 'ground')
  const gb = b.floors.find((f) => f.kind === 'ground')
  if (ga?.landscapeGrass !== gb?.landscapeGrass) return false
  if (ga?.landscapeTerrain !== gb?.landscapeTerrain) return false
  if (ga?.plants !== gb?.plants) return false
  if (ga?.elevation !== gb?.elevation) return false
  const da = buildingMeshDeps(a)
  const db = buildingMeshDeps(b)
  if (da.length !== db.length) return false
  for (let i = 0; i < da.length; i++) {
    if (da[i] !== db[i]) return false
  }
  return true
}

function GrassLayerMesh({
  layer,
  tufts,
  geometry,
  map,
}: {
  layer: LandscapeGrassLayer
  tufts: ReturnType<typeof layoutGrass>
  geometry: THREE.BufferGeometry
  map: THREE.Texture | null
}) {
  const mat = useMemo(
    () => makeEzGrassMaterial(map, layer.color),
    [map, layer.color],
  )

  useEffect(
    () => () => {
      disposeEzGrassMaterial(mat)
    },
    [mat],
  )

  const mesh = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const inst = mesh.current
    if (!inst) return
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    tufts.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z)
      dummy.rotation.set(0, t.yaw, 0)
      dummy.scale.set(t.sx, t.sy, t.sz)
      dummy.updateMatrix()
      inst.setMatrixAt(i, dummy.matrix)
      color.setRGB(t.tintR, t.tintG, t.tintB)
      inst.setColorAt(i, color)
    })
    inst.count = tufts.length
    inst.instanceMatrix.needsUpdate = true
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
  }, [tufts])

  if (tufts.length === 0) return null

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, mat, tufts.length]}
      raycast={disableRaycast}
      frustumCulled={false}
      receiveShadow
    />
  )
}

export function LandscapeGrass({ visit }: { visit: boolean }) {
  const gltf = useGLTF(EZ_GRASS_GLB_URL)
  const scene = gltf.scene
  const tuft = useMemo(() => prepareEzGrassTuft(scene), [scene])
  const building = useBuildingEqual((s) => s.building, grassSceneEqual)
  const ground = building.floors.find((f) => f.kind === 'ground')
  const grass = ground?.landscapeGrass
  const layers = grassLayers(grass)
  const terrain = ensureTerrain(building, ground?.landscapeTerrain)
  const holes = useRefMemo(
    () => buildingFootprintHoles(building),
    buildingMeshDeps(building),
  )
  const res = grass?.resolution ?? 256
  const cap = Math.max(4000, Math.floor(GRASS_INSTANCE_CAP / Math.max(1, layers.length)))

  const laid = useMemo(() => {
    if (!ground) return []
    return layers.map((layer) => {
      if (!layer.coveragePng) return { layer, tufts: [] }
      const coverage = decodeBytes(layer.coveragePng, res * res)
      return {
        layer,
        tufts: layoutGrass({
          grass: { ...layer, resolution: res },
          coverage,
          terrain,
          groundY: ground.elevation,
          frame: terrainFrame(terrain),
          holes,
          plants: ground.plants,
          cap,
        }),
      }
    })
    // `ground` identity changes on furniture edits; keep grass/terrain/plants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    grass,
    layers,
    res,
    terrain,
    holes,
    cap,
    ground?.elevation,
    ground?.plants,
    ground?.landscapeTerrain,
  ])

  useEffect(
    () => () => {
      tuft?.geometry.dispose()
    },
    [tuft],
  )

  useFrame(({ clock }) => {
    tickEzGrassWind(clock.elapsedTime * (visit ? 0.55 : 1))
  })

  if (!tuft || !ground || laid.every((l) => l.tufts.length === 0)) return null

  return (
    <group>
      {laid.map(({ layer, tufts }) => (
        <GrassLayerMesh
          key={layer.id}
          layer={layer}
          tufts={tufts}
          geometry={tuft.geometry}
          map={tuft.map}
        />
      ))}
    </group>
  )
}
