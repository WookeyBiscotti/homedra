import { useGLTF } from '@react-three/drei'
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Floor, ModelRef, PlacedObject } from '../../engine/types'
import { resolveModelRef } from '../../models/resolveModel'
import { cloneSceneSelection } from '../../models/sceneParts'
import { useBuildingStore } from '../../store/buildingStore'

function normalizeRoot(root: THREE.Object3D): void {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  if (!Number.isFinite(box.min.x) || box.isEmpty()) return
  const center = new THREE.Vector3()
  box.getCenter(center)
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= box.min.y
}

function modelResolveKey(model: ModelRef): string {
  switch (model.source) {
    case 'catalog':
      return `catalog:${model.assetId}:${model.objectId ?? ''}`
    case 'nasa':
      return `nasa:${model.assetId}:${model.objectId ?? ''}`
    case 'local':
      return `local:${model.localId}:${model.objectId ?? ''}`
    case 'url':
      return `url:${model.url}:${model.objectId ?? ''}`
    case 'library':
      return `library:${model.library}:${model.id}:${model.glbUrl ?? ''}:${model.objectId ?? ''}`
  }
}

function GlbInstance({
  url,
  objectId,
  obj,
  floorElevation,
  selected,
  onSelect,
  shadowsEnabled,
}: {
  url: string
  objectId?: string
  obj: PlacedObject
  floorElevation: number
  selected: boolean
  onSelect: () => void
  shadowsEnabled: boolean
}) {
  const gltf = useGLTF(url)
  const scene = useMemo(() => {
    const clone = cloneSceneSelection(gltf.scene, objectId)
    normalizeRoot(clone)
    clone.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        const m = c as THREE.Mesh
        m.castShadow = shadowsEnabled
        m.receiveShadow = shadowsEnabled
      }
    })
    return clone
  }, [gltf.scene, objectId, shadowsEnabled])

  return (
    <group
      position={[obj.x, floorElevation, -obj.y]}
      rotation={[0, obj.rotationY, 0]}
      scale={obj.scale}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <primitive object={scene} />
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.35, 0.45, 32]} />
          <meshBasicMaterial color="#c45c26" transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  )
}

class GlbErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}

function PlaceholderObject({
  obj,
  floorId,
  floorElevation,
}: {
  obj: PlacedObject
  floorId: string
  floorElevation: number
}) {
  const selectObject = useBuildingStore((s) => s.selectObject)
  return (
    <mesh
      position={[obj.x, floorElevation + 0.25, -obj.y]}
      onClick={(e) => {
        e.stopPropagation()
        selectObject(floorId, obj.id)
      }}
    >
      <boxGeometry args={[0.4, 0.5, 0.4]} />
      <meshStandardMaterial color="#8b3a2a" />
    </mesh>
  )
}

function ResolvedObject({
  obj,
  floorId,
  floorElevation,
  shadowsEnabled,
}: {
  obj: PlacedObject
  floorId: string
  floorElevation: number
  shadowsEnabled: boolean
}) {
  const selection = useBuildingStore((s) => s.selection)
  const selectObject = useBuildingStore((s) => s.selectObject)
  const [url, setUrl] = useState<string | null>(null)
  const [revoke, setRevoke] = useState(false)
  const [error, setError] = useState(false)
  const resolveKey = modelResolveKey(obj.model)

  useEffect(() => {
    let cancelled = false
    let localRevoke = false
    let objectUrl: string | null = null
    setUrl(null)
    setError(false)
    void resolveModelRef(obj.model)
      .then((r) => {
        if (cancelled) {
          if (r.revokeOnDispose) URL.revokeObjectURL(r.url)
          return
        }
        objectUrl = r.url
        localRevoke = !!r.revokeOnDispose
        setRevoke(localRevoke)
        setUrl(r.url)
        setError(false)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
      if (localRevoke && objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // resolveKey captures identity of the model ref fields we care about
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveKey])

  useLayoutEffect(() => {
    return () => {
      if (revoke && url) URL.revokeObjectURL(url)
    }
  }, [revoke, url])

  const selected =
    selection?.kind === 'object' && selection.id === obj.id

  const fallback = (
    <PlaceholderObject
      obj={obj}
      floorId={floorId}
      floorElevation={floorElevation}
    />
  )

  if (error || !url) {
    return error ? fallback : null
  }

  return (
    <GlbErrorBoundary fallback={fallback}>
      <Suspense fallback={null}>
        <GlbInstance
          url={url}
          objectId={obj.model.objectId}
          obj={obj}
          floorElevation={floorElevation}
          selected={selected}
          onSelect={() => selectObject(floorId, obj.id)}
          shadowsEnabled={shadowsEnabled}
        />
      </Suspense>
    </GlbErrorBoundary>
  )
}

/** Floor click target for placing objects in 3D. */
export function PlaceObjectFloorHit({
  floor,
}: {
  floor: Floor
}) {
  const tool = useBuildingStore((s) => s.tool)
  const placeObjectAt = useBuildingStore((s) => s.placeObjectAt)
  if (tool !== 'placeObject') return null

  const size = 80
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, floor.elevation + 0.01, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        const p = e.point
        placeObjectAt(p.x, -p.z)
      }}
    >
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

export function PlacedObjects({
  floor,
  shadowsEnabled,
}: {
  floor: Floor
  shadowsEnabled: boolean
}) {
  const objects = floor.objects ?? []
  if (objects.length === 0) return null
  return (
    <group>
      {objects.map((obj) => (
        <ResolvedObject
          key={obj.id}
          obj={obj}
          floorId={floor.id}
          floorElevation={floor.elevation}
          shadowsEnabled={shadowsEnabled}
        />
      ))}
    </group>
  )
}
