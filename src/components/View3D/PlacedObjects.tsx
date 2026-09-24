import { TransformControls, useGLTF } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import * as THREE from 'three'
import type { Floor, ModelRef, PlacedObject } from '../../engine/types'
import { snapToGrid } from '../../engine/geometry/walls'
import { snapObjectXY, planHalfSizeOf } from '../../engine/geometry/objectSnap'
import { resolveModelRef } from '../../models/resolveModel'
import { cloneSceneSelection } from '../../models/sceneParts'
import {
  clearLivePlanHalf,
  livePlanHalfMap,
  setLivePlanHalf,
} from '../../models/objectFootprintCache'
import { useBuildingStore } from '../../store/buildingStore'
import { useApplyAppearance } from '../../hooks/useApplyAppearance'

const AABB_COLOR = '#c45c26'

/** World-space AABB wireframe, updated every frame while the target moves. */
function SelectionAabb({
  targetRef,
}: {
  targetRef: RefObject<THREE.Object3D | null>
}) {
  const box = useMemo(() => new THREE.Box3(), [])
  const helper = useMemo(() => {
    const h = new THREE.Box3Helper(box, new THREE.Color(AABB_COLOR))
    h.raycast = () => {}
    return h
  }, [box])

  useFrame(() => {
    const target = targetRef.current
    if (!target) return
    box.setFromObject(target)
    if (box.isEmpty()) return
    helper.updateMatrixWorld(true)
  })

  useEffect(() => {
    return () => {
      helper.geometry.dispose()
      ;(helper.material as THREE.Material).dispose()
    }
  }, [helper])

  return <primitive object={helper} />
}

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

/**
 * Local model AABB (pre-instance scale/rotation).
 * Must not use setFromObject while the mesh sits under a scaled parent —
 * that would bake scale into sizeX and make planHalfSizeOf double-scale.
 */
function measureLocalModelSize(
  group: THREE.Object3D,
  scene: THREE.Object3D,
): { x: number; y: number; z: number } | null {
  const pos = group.position.clone()
  const rot = group.rotation.clone()
  const scl = group.scale.clone()
  group.position.set(0, 0, 0)
  group.rotation.set(0, 0, 0)
  group.scale.set(1, 1, 1)
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene)
  group.position.copy(pos)
  group.rotation.copy(rot)
  group.scale.copy(scl)
  group.updateMatrixWorld(true)
  if (box.isEmpty() || !Number.isFinite(box.min.x)) return null
  return {
    x: Math.max(0.05, box.max.x - box.min.x),
    y: Math.max(0.05, box.max.y - box.min.y),
    z: Math.max(0.05, box.max.z - box.min.z),
  }
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

function applyPlacedTransform(
  group: THREE.Object3D,
  obj: PlacedObject,
  floorElevation: number,
): void {
  group.position.set(obj.x, floorElevation + (obj.elevation ?? 0), -obj.y)
  group.rotation.set(obj.rotationX ?? 0, obj.rotationY, obj.rotationZ ?? 0)
  group.scale.set(obj.scaleX, obj.scaleY, obj.scaleZ)
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
  const groupRef = useRef<THREE.Group>(null)
  const gltf = useGLTF(url)
  const { camera, gl, invalidate } = useThree()
  const updatePlacedObject = useBuildingStore((s) => s.updatePlacedObject)
  const gizmoMode = useBuildingStore((s) => s.transformGizmoMode)
  const setTransformDragging = useBuildingStore((s) => s.setTransformDragging)
  const cycleTransformGizmoMode = useBuildingStore(
    (s) => s.cycleTransformGizmoMode,
  )
  const dragging = useBuildingStore((s) => s.transformDragging)
  const sceneMode = useBuildingStore((s) => s.sceneMode)
  const pendingModel = useBuildingStore((s) => s.pendingModel)
  const objectSnapEnabled = useBuildingStore((s) => s.objectSnapEnabled)
  const floor = useBuildingStore((s) => s.activeFloor())
  const xyDragCleanup = useRef<(() => void) | null>(null)
  /** Local flag so we don't skip applyPlacedTransform after store catch-up */
  const xyDragging = useRef(false)

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

  const clips = gltf.animations
  const clipDuration = useMemo(() => {
    if (!clips?.length) return 0
    return Math.max(0, ...clips.map((c) => c.duration))
  }, [clips])

  const { mixer, actions } = useMemo(() => {
    if (!clips?.length || clipDuration <= 0) {
      return { mixer: null as THREE.AnimationMixer | null, actions: [] as THREE.AnimationAction[] }
    }
    const m = new THREE.AnimationMixer(scene)
    const acts: THREE.AnimationAction[] = []
    for (const clip of clips) {
      const action = m.clipAction(clip)
      action.play()
      action.paused = true
      acts.push(action)
    }
    return { mixer: m, actions: acts }
  }, [scene, clips, clipDuration])

  // Persist duration so PropertiesPanel can show the scrubber.
  useEffect(() => {
    if (clipDuration <= 0) {
      if (obj.animationDuration != null && obj.animationDuration > 0) {
        useBuildingStore.setState((st) => {
          const floor = st.activeFloor()
          const objects = (floor.objects ?? []).map((o) =>
            o.id === obj.id
              ? { ...o, animationDuration: undefined, animationTime: undefined }
              : o,
          )
          return {
            building: {
              ...st.building,
              floors: st.building.floors.map((f) =>
                f.id === floor.id ? { ...f, objects } : f,
              ),
            },
          }
        })
      }
      return
    }
    const durationStale =
      obj.animationDuration == null ||
      Math.abs(obj.animationDuration - clipDuration) > 0.02
    if (!durationStale) return
    useBuildingStore.setState((st) => {
      const floor = st.activeFloor()
      const objects = (floor.objects ?? []).map((o) => {
        if (o.id !== obj.id) return o
        const t = Math.min(o.animationTime ?? 0, clipDuration)
        return {
          ...o,
          animationDuration: clipDuration,
          animationTime: t,
        }
      })
      return {
        building: {
          ...st.building,
          floors: st.building.floors.map((f) =>
            f.id === floor.id ? { ...f, objects } : f,
          ),
        },
      }
    })
  }, [clipDuration, obj.animationDuration, obj.id])

  useLayoutEffect(() => {
    if (!mixer || actions.length === 0) return
    const t = Math.min(
      Math.max(0, obj.animationTime ?? 0),
      clipDuration || 0,
    )
    // paused + mixer.setTime is a no-op (timeScale 0); set action.time directly.
    for (const action of actions) {
      action.time = Math.min(t, action.getClip().duration)
      action.paused = true
    }
    mixer.update(0)
    invalidate()
  }, [mixer, actions, obj.animationTime, clipDuration, invalidate])

  useApplyAppearance(scene, obj.appearance)

  useLayoutEffect(() => {
    if (!groupRef.current || dragging || xyDragging.current) return
    applyPlacedTransform(groupRef.current, obj, floorElevation)
  }, [obj, floorElevation, dragging])

  // Publish live + persisted plan AABB from the same world box as the 3D helper.
  useLayoutEffect(() => {
    const g = groupRef.current
    if (!g || dragging || xyDragging.current) return
    applyPlacedTransform(g, obj, floorElevation)
    const box = new THREE.Box3().setFromObject(g)
    if (box.isEmpty()) return

    const planHalfX = Math.max(0.05, (box.max.x - box.min.x) / 2)
    const planHalfY = Math.max(0.05, (box.max.z - box.min.z) / 2)
    setLivePlanHalf(obj.id, { x: planHalfX, y: planHalfY })

    const local = measureLocalModelSize(g, scene)
    const sizePatch =
      local &&
      (Math.abs(obj.sizeX - local.x) > 0.03 ||
        Math.abs(obj.sizeY - local.y) > 0.03 ||
        Math.abs(obj.sizeZ - local.z) > 0.03)
        ? { sizeX: local.x, sizeY: local.y, sizeZ: local.z }
        : null
    const aabbStale =
      Math.abs(obj.planHalfX - planHalfX) > 0.02 ||
      Math.abs(obj.planHalfY - planHalfY) > 0.02

    if (!sizePatch && !aabbStale) return

    useBuildingStore.setState((st) => {
      const floor = st.activeFloor()
      const objects = (floor.objects ?? []).map((o) =>
        o.id === obj.id
          ? {
              ...o,
              ...(sizePatch ?? {}),
              planHalfX,
              planHalfY,
            }
          : o,
      )
      return {
        building: {
          ...st.building,
          floors: st.building.floors.map((f) =>
            f.id === floor.id ? { ...f, objects } : f,
          ),
        },
      }
    })
  }, [obj, floorElevation, scene, dragging])

  useEffect(() => {
    return () => {
      clearLivePlanHalf(obj.id)
      xyDragCleanup.current?.()
      xyDragCleanup.current = null
    }
  }, [obj.id])

  // Gizmo in any 3D orbit mode when object is selected (not visit / paint)
  const showGizmo =
    selected && sceneMode !== 'visit' && sceneMode !== 'paint'

  const snapPlanXY = (x: number, y: number) => {
    if (!objectSnapEnabled) return { x, y, snappedX: false, snappedY: false }
    const g = groupRef.current
    let halfSize = planHalfSizeOf(obj)
    if (g) {
      const box = new THREE.Box3().setFromObject(g)
      if (!box.isEmpty()) {
        halfSize = {
          x: Math.max(0.05, (box.max.x - box.min.x) / 2),
          y: Math.max(0.05, (box.max.z - box.min.z) / 2),
        }
        setLivePlanHalf(obj.id, halfSize)
      }
    }
    return snapObjectXY(floor, x, y, {
      excludeObjectId: obj.id,
      halfSize,
      otherHalfSizes: livePlanHalfMap(),
    })
  }

  const commitTransform = (applyObjectSnap: boolean) => {
    const g = groupRef.current
    if (!g) return
    let px = g.position.x
    let py = -g.position.z
    if (applyObjectSnap) {
      const sn = snapPlanXY(px, py)
      px = sn.snappedX ? sn.x : snapToGrid(sn.x)
      py = sn.snappedY ? sn.y : snapToGrid(sn.y)
    } else {
      px = snapToGrid(px)
      py = snapToGrid(py)
    }
    g.position.x = px
    g.position.z = -py
    g.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(g)
    const planHalfX = box.isEmpty()
      ? undefined
      : Math.max(0.05, (box.max.x - box.min.x) / 2)
    const planHalfY = box.isEmpty()
      ? undefined
      : Math.max(0.05, (box.max.z - box.min.z) / 2)
    if (planHalfX != null && planHalfY != null) {
      setLivePlanHalf(obj.id, { x: planHalfX, y: planHalfY })
    }
    updatePlacedObject(obj.id, {
      x: px,
      y: py,
      elevation: Math.max(0, g.position.y - floorElevation),
      rotationX: g.rotation.x,
      rotationY: g.rotation.y,
      rotationZ: g.rotation.z,
      scaleX: Math.max(0.01, g.scale.x),
      scaleY: Math.max(0.01, g.scale.y),
      scaleZ: Math.max(0.01, g.scale.z),
      ...(planHalfX != null && planHalfY != null
        ? { planHalfX, planHalfY }
        : {}),
    })
  }

  const startXyDrag = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    if (pendingModel) return
    if (sceneMode === 'visit' || sceneMode === 'paint') return
    e.stopPropagation()
    onSelect()

    const planeY = floorElevation + (obj.elevation ?? 0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY)
    const hit = new THREE.Vector3()
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let moved = false

    xyDragging.current = true
    setTransformDragging(true)

    const onMove = (ev: PointerEvent) => {
      const g = groupRef.current
      if (!g) return
      const rect = gl.domElement.getBoundingClientRect()
      ndc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(plane, hit)) return
      const sn = snapPlanXY(hit.x, -hit.z)
      g.position.x = sn.x
      g.position.z = -sn.y
      moved = true
      invalidate()
    }

    const onUp = () => {
      xyDragging.current = false
      setTransformDragging(false)
      gl.domElement.removeEventListener('pointermove', onMove)
      gl.domElement.removeEventListener('pointerup', onUp)
      gl.domElement.removeEventListener('pointercancel', onUp)
      xyDragCleanup.current = null
      if (moved) commitTransform(true)
      else invalidate()
    }

    xyDragCleanup.current?.()
    gl.domElement.addEventListener('pointermove', onMove)
    gl.domElement.addEventListener('pointerup', onUp)
    gl.domElement.addEventListener('pointercancel', onUp)
    xyDragCleanup.current = onUp
  }

  return (
    <>
      <group
        ref={groupRef}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onSelect()
        }}
        onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onSelect()
          cycleTransformGizmoMode()
        }}
        onPointerDown={startXyDrag}
      >
        <primitive object={scene} />
      </group>
      {showGizmo && <SelectionAabb targetRef={groupRef} />}
      {showGizmo && (
        <TransformControls
          key={`${obj.id}-${gizmoMode}`}
          object={groupRef as RefObject<THREE.Object3D>}
          mode={gizmoMode}
          size={1}
          space="world"
          onMouseDown={() => setTransformDragging(true)}
          onMouseUp={() => {
            setTransformDragging(false)
            commitTransform(gizmoMode === 'translate')
          }}
        />
      )}
    </>
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
      position={[obj.x, floorElevation + (obj.elevation ?? 0) + 0.25, -obj.y]}
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
  const pendingModel = useBuildingStore((s) => s.pendingModel)
  const placeObjectAt = useBuildingStore((s) => s.placeObjectAt)
  if (tool !== 'placeObject' || !pendingModel) return null

  const size = 200
  const place = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.button !== 0) return
    const p = e.point
    placeObjectAt(p.x, -p.z)
  }

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, floor.elevation + 0.05, 0]}
      onPointerDown={place}
      renderOrder={1000}
    >
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        depthTest={false}
        side={THREE.DoubleSide}
      />
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
