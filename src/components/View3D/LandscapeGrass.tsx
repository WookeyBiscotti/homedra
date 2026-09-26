import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { applyGrassWind, tickFoliageWind } from '../../landscape/foliageWind'
import { decodeBytes } from '../../landscape/maps'
import { GRASS_INSTANCE_CAP, layoutGrass } from '../../landscape/grassField'
import { grassLayers } from '../../landscape/grassLayers'
import { ensureTerrain, terrainFrame } from '../../landscape/terrain'
import {
  buildingFootprintHoles,
  buildingMeshDeps,
} from '../../engine/extrude'
import {
  SEEDTHREE_GRASS_DEFAULTS,
  type Building,
  type LandscapeGrassLayer,
} from '../../engine/types'
import { useRefMemo } from '../../hooks/useRefMemo'
import { useBuildingEqual } from '../../store/buildingStore'
import { disableRaycast } from './PaintPickables'

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

function tuftGeometry(planes: number, width: number): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let base = 0
  for (let q = 0; q < planes; q++) {
    const a = (q * Math.PI) / planes
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    for (const [lx, ly] of [
      [-0.5 * width, 0],
      [0.5 * width, 0],
      [0.5 * width, 1],
      [-0.5 * width, 1],
    ] as const) {
      positions.push(lx * ca, ly, lx * sa)
      normals.push(-sa, 0.55, ca)
      uvs.push(lx / width + 0.5, ly)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    base += 4
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(indices)
  return g
}

function makeTuftTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, 64, 64)
  for (let i = 0; i < 9; i++) {
    const x = 6 + i * 6.5
    const lean = (i % 2 ? 7 : -6) + (i - 4)
    ctx.beginPath()
    ctx.moveTo(x - 2.4, 63)
    ctx.lineTo(x + 2.4, 63)
    ctx.quadraticCurveTo(x + lean * 0.35, 30, x + lean * 0.15, 3)
    ctx.closePath()
    ctx.fillStyle = `rgba(${70 + i * 8},${140 + i * 10},48,1)`
    ctx.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function GrassLayerMesh({
  layer,
  resolution,
  tufts,
  geos,
  tex,
}: {
  layer: LandscapeGrassLayer
  resolution: number
  tufts: ReturnType<typeof layoutGrass>
  geos: readonly [THREE.BufferGeometry, THREE.BufferGeometry]
  tex: THREE.CanvasTexture
}) {
  void resolution
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: layer.color || SEEDTHREE_GRASS_DEFAULTS.color,
      map: tex,
      alphaTest: SEEDTHREE_GRASS_DEFAULTS.alphaTest,
      side: THREE.DoubleSide,
      roughness: SEEDTHREE_GRASS_DEFAULTS.roughness,
      metalness: 0,
    })
    applyGrassWind(m)
    return m
  }, [tex, layer.color])

  useEffect(
    () => () => {
      mat.dispose()
    },
    [mat],
  )

  const mesh0 = useRef<THREE.InstancedMesh>(null)
  const mesh1 = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const dummy = new THREE.Object3D()
    const groups = [tufts.filter((t) => t.variant === 0), tufts.filter((t) => t.variant === 1)]
    const meshes = [mesh0.current, mesh1.current]
    groups.forEach((list, vi) => {
      const mesh = meshes[vi]
      if (!mesh) return
      list.forEach((t, i) => {
        dummy.position.set(t.x, t.y, t.z)
        dummy.rotation.set(0, t.yaw, 0)
        dummy.scale.set(t.sx, t.sy, t.sz)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.count = list.length
      mesh.instanceMatrix.needsUpdate = true
    })
  }, [tufts])

  if (tufts.length === 0) return null
  const n0 = Math.max(1, tufts.filter((t) => t.variant === 0).length)
  const n1 = Math.max(1, tufts.filter((t) => t.variant === 1).length)

  return (
    <group>
      <instancedMesh
        ref={mesh0}
        args={[geos[0], mat, n0]}
        raycast={disableRaycast}
        frustumCulled={false}
      />
      <instancedMesh
        ref={mesh1}
        args={[geos[1], mat, n1]}
        raycast={disableRaycast}
        frustumCulled={false}
      />
    </group>
  )
}

export function LandscapeGrass({ visit }: { visit: boolean }) {
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

  const geos = useMemo(
    () => [tuftGeometry(2, 1), tuftGeometry(3, 0.6)] as const,
    [],
  )
  const tex = useMemo(() => makeTuftTexture(), [])

  useEffect(
    () => () => {
      geos[0].dispose()
      geos[1].dispose()
      tex.dispose()
    },
    [geos, tex],
  )

  useFrame(({ clock }) => {
    tickFoliageWind(clock.elapsedTime, visit ? 0.55 : 1)
  })

  if (!ground || laid.every((l) => l.tufts.length === 0)) return null

  return (
    <group>
      {laid.map(({ layer, tufts }) => (
        <GrassLayerMesh
          key={layer.id}
          layer={layer}
          resolution={res}
          tufts={tufts}
          geos={geos}
          tex={tex}
        />
      ))}
    </group>
  )
}
