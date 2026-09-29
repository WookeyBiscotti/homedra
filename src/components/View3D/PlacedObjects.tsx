import { TransformControls, useGLTF } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  Component,
  memo,
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
import {
  estimatePlanHalf,
  type Floor,
  type ModelRef,
  type PlacedObject,
} from '../../engine/types'
import { heightAt } from '../../landscape/terrain'
import { snapObjectXY, planHalfSizeOf } from '../../engine/geometry/objectSnap'
import {
  localGeometrySize,
  measuredSizeLooksPlausible,
  recoverExplodedInstance,
} from '../../engine/geometry/modelSize'
import { resolveModelRef } from '../../models/resolveModel'
import { cloneSceneSelection } from '../../models/sceneParts'
import {
  clearLivePlanHalf,
  livePlanHalfMap,
  setLivePlanHalf,
} from '../../models/objectFootprintCache'
import { useBuildingStore } from '../../store/buildingStore'
import { useApplyAppearance } from '../../hooks/useApplyAppearance'
import { listSceneMaterials } from '../../models/objectAppearance'
import {
  forgetObjectMaterials,
  publishObjectMaterials,
} from '../../models/objectMaterialRegistry'

const AABB_COLOR = '#c45c26'

/** World-space AABB wireframe, updated every frame while the target moves. */
function SelectionAabb({
  targetRef,
  sizeX,
  sizeY,
  sizeZ,
}: {
  targetRef: RefObject<THREE.Object3D | null>
  sizeX: number
  sizeY: number
  sizeZ: number
}) {
  const box = useMemo(() => new THREE.Box3(), [])
  const local = useMemo(() => new THREE.Box3(), [])
  const helper = useMemo(() => {
    const h = new THREE.Box3Helper(box, new THREE.Color(AABB_COLOR))
    h.raycast = () => {}
    return h
  }, [box])

  useFrame(() => {
    const target = targetRef.current
    if (!target) return
    // Parent matrix only — setFromObject walks every skinned/mesh vertex.
    target.updateWorldMatrix(true, false)
    const hx = Math.max(0.05, sizeX / 2)
    const hz = Math.max(0.05, sizeZ / 2)
    local.min.set(-hx, 0, -hz)
    local.max.set(hx, Math.max(0.05, sizeY), hz)
    box.copy(local).applyMatrix4(target.matrixWorld)
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
  terrainLift = 0,
): void {
  group.position.set(
    obj.x,
    floorElevation + terrainLift + (obj.elevation ?? 0),
    -obj.y,
  )
  group.rotation.set(obj.rotationX ?? 0, obj.rotationY, obj.rotationZ ?? 0)
  group.scale.set(obj.scaleX, obj.scaleY, obj.scaleZ)
}

function GlbInstance({
  url,
  objectId,
  obj,
  floorElevation,
  terrainLift = 0,
  selected,
  onSelect,
  shadowsEnabled,
}: {
  url: string
  objectId?: string
  obj: PlacedObject
  floorElevation: number
  terrainLift?: number
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
  const sceneMode = useBuildingStore((s) => s.sceneMode)
  const workbench = useBuildingStore((s) => s.workbench)
  const pendingModel = useBuildingStore((s) => s.pendingModel)
  const objectSnapEnabled = useBuildingStore((s) => s.objectSnapEnabled)
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

  useEffect(() => {
    publishObjectMaterials(obj.id, listSceneMaterials(scene))
    return () => forgetObjectMaterials(obj.id)
  }, [obj.id, scene])

  const lockStoredScale = (group: THREE.Object3D) => {
    group.scale.set(obj.scaleX, obj.scaleY, obj.scaleZ)
  }

  useLayoutEffect(() => {
    if (!groupRef.current) return
    const dragging =
      useBuildingStore.getState().transformDragging || xyDragging.current
    if (dragging) {
      // Translate/rotate must not keep a temporary scale=1 (R3F remount or
      // TransformControls world-space decompose) on the instance.
      if (gizmoMode !== 'scale') lockStoredScale(groupRef.current)
      return
    }
    applyPlacedTransform(groupRef.current, obj, floorElevation, terrainLift)
    // Primitive pose fields only — full `obj` changes on AABB/size writes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    obj.x,
    obj.y,
    obj.elevation,
    obj.rotationX,
    obj.rotationY,
    obj.rotationZ,
    obj.scaleX,
    obj.scaleY,
    obj.scaleZ,
    floorElevation,
    terrainLift,
    gizmoMode,
  ])

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const st = useBuildingStore.getState()
    const scaling = st.transformGizmoMode === 'scale' && st.transformDragging
    if (scaling) return
    if (
      Math.abs(g.scale.x - obj.scaleX) > 1e-5 ||
      Math.abs(g.scale.y - obj.scaleY) > 1e-5 ||
      Math.abs(g.scale.z - obj.scaleZ) > 1e-5
    ) {
      lockStoredScale(g)
    }
  })

  // Local model size is independent of instance scale — measure once per mesh.
  useLayoutEffect(() => {
    const local = localGeometrySize(scene)
    if (!local) return
    const recovered = recoverExplodedInstance(obj, local)
    const sizeMatches =
      Math.abs(obj.sizeX - local.x) <= 0.03 &&
      Math.abs(obj.sizeY - local.y) <= 0.03 &&
      Math.abs(obj.sizeZ - local.z) <= 0.03
    if (!recovered) {
      if (!measuredSizeLooksPlausible(local) || sizeMatches) return
    }
    useBuildingStore.setState((st) => {
      const floor = st.activeFloor()
      const objects = (floor.objects ?? []).map((o) => {
        if (o.id !== obj.id) return o
        if (recovered) {
          const half = estimatePlanHalf({
            sizeX: recovered.sizeX,
            sizeZ: recovered.sizeZ,
            scaleX: recovered.scaleX,
            scaleZ: recovered.scaleZ,
            rotationY: o.rotationY,
          })
          return { ...o, ...recovered, planHalfX: half.x, planHalfY: half.y }
        }
        return { ...o, sizeX: local.x, sizeY: local.y, sizeZ: local.z }
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
    // Only when the cloned scene is ready; size does not depend on scale.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, obj.id])

  useLayoutEffect(() => {
    if (useBuildingStore.getState().transformDragging || xyDragging.current) {
      return
    }
    setLivePlanHalf(
      obj.id,
      estimatePlanHalf({
        sizeX: obj.sizeX,
        sizeZ: obj.sizeZ,
        scaleX: obj.scaleX,
        scaleZ: obj.scaleZ,
        rotationY: obj.rotationY,
      }),
    )
  }, [
    obj.id,
    obj.sizeX,
    obj.sizeZ,
    obj.scaleX,
    obj.scaleZ,
    obj.rotationY,
  ])

  useEffect(() => {
    return () => {
      clearLivePlanHalf(obj.id)
      xyDragCleanup.current?.()
      xyDragCleanup.current = null
    }
  }, [obj.id])

  // Gizmo / drag only in Objects workbench (not visit / paint)
  const canEdit =
    workbench === 'furnish' && sceneMode !== 'visit' && sceneMode !== 'paint'
  const showGizmo = selected && canEdit

  const snapPlanXY = (x: number, y: number) => {
    if (!objectSnapEnabled) return { x, y, snappedX: false, snappedY: false }
    const g = groupRef.current
    const halfSize = g
      ? estimatePlanHalf({
          sizeX: obj.sizeX,
          sizeZ: obj.sizeZ,
          // Store scale — live group.scale can be 1 during a translate.
          scaleX: obj.scaleX,
          scaleZ: obj.scaleZ,
          rotationY: g.rotation.y,
        })
      : planHalfSizeOf(obj)
    setLivePlanHalf(obj.id, halfSize)
    const floor = useBuildingStore.getState().activeFloor()
    return snapObjectXY(floor, x, y, {
      excludeObjectId: obj.id,
      halfSize,
      otherHalfSizes: livePlanHalfMap(),
    })
  }

  const commitTransform = () => {
    const g = groupRef.current
    if (!g) return
    // Persist only what the current gizmo / body-drag actually edits.
    // Writing scale from the live group after a translate used to bake a
    // temporary measure-reset (scale=1) or a skinned AABB into the instance.
    const px = g.position.x
    const py = -g.position.z
    const patch: Partial<PlacedObject> = {
      x: px,
      y: py,
      elevation: g.position.y - floorElevation - terrainLift,
    }
    if (gizmoMode === 'rotate') {
      patch.rotationX = g.rotation.x
      patch.rotationY = g.rotation.y
      patch.rotationZ = g.rotation.z
    } else if (gizmoMode === 'scale') {
      patch.scaleX = Math.max(0.001, g.scale.x)
      patch.scaleY = Math.max(0.001, g.scale.y)
      patch.scaleZ = Math.max(0.001, g.scale.z)
    } else {
      lockStoredScale(g)
    }
    const merged = { ...obj, ...patch }
    const half = estimatePlanHalf({
      sizeX: merged.sizeX,
      sizeZ: merged.sizeZ,
      scaleX: merged.scaleX,
      scaleZ: merged.scaleZ,
      rotationY: merged.rotationY,
    })
    patch.planHalfX = half.x
    patch.planHalfY = half.y
    setLivePlanHalf(obj.id, half)
    updatePlacedObject(obj.id, patch)
  }

  const cancelXyDrag = () => {
    xyDragCleanup.current?.()
    xyDragCleanup.current = null
    xyDragging.current = false
    const g = groupRef.current
    if (g) applyPlacedTransform(g, obj, floorElevation, terrainLift)
    invalidate()
  }

  const startXyDrag = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    if (pendingModel) return
    if (!canEdit) return
    // Scale / rotate gizmos sit over the mesh. A body drag on the same
    // pointer would slide the object while the handle changes size.
    if (selected && gizmoMode !== 'translate') return
    e.stopPropagation()
    onSelect()

    const g0 = groupRef.current
    if (!g0) return

    const planeY = g0.position.y
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY)
    const hit = new THREE.Vector3()
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let moved = false

    const projectPlan = (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect()
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(plane, hit)) return null
      return { x: hit.x, y: -hit.z }
    }

    const grab0 = projectPlan(e.nativeEvent.clientX, e.nativeEvent.clientY)
    const grabOffset = grab0
      ? { x: g0.position.x - grab0.x, y: -g0.position.z - grab0.y }
      : { x: 0, y: 0 }

    xyDragging.current = true
    setTransformDragging(true)

    const detach = () => {
      gl.domElement.removeEventListener('pointermove', onMove)
      gl.domElement.removeEventListener('pointerup', onUp)
      gl.domElement.removeEventListener('pointercancel', onUp)
      xyDragCleanup.current = null
    }

    const onMove = (ev: PointerEvent) => {
      const g = groupRef.current
      if (!g) return
      const p = projectPlan(ev.clientX, ev.clientY)
      if (!p) return
      const sn = snapPlanXY(p.x + grabOffset.x, p.y + grabOffset.y)
      g.position.x = sn.x
      g.position.z = -sn.y
      lockStoredScale(g)
      moved = true
      invalidate()
    }

    const onUp = () => {
      detach()
      if (moved) commitTransform()
      else invalidate()
      // Clear flags after persist so layout effects cannot write the
      // pre-drag store pose back onto the mesh.
      xyDragging.current = false
      setTransformDragging(false)
    }

    xyDragCleanup.current?.()
    gl.domElement.addEventListener('pointermove', onMove)
    gl.domElement.addEventListener('pointerup', onUp)
    gl.domElement.addEventListener('pointercancel', onUp)
    xyDragCleanup.current = () => {
      detach()
      xyDragging.current = false
    }
  }

  return (
    <>
      <group
        ref={groupRef}
        scale={[obj.scaleX, obj.scaleY, obj.scaleZ]}
        userData={{ pickKind: 'object', objectId: obj.id }}
        onClick={
          canEdit
            ? (e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation()
                onSelect()
              }
            : undefined
        }
        onDoubleClick={
          canEdit
            ? (e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation()
                onSelect()
                cycleTransformGizmoMode()
              }
            : undefined
        }
        onPointerDown={
          canEdit && (!selected || gizmoMode === 'translate')
            ? startXyDrag
            : undefined
        }
      >
        <primitive object={scene} />
        <mesh
          position={[0, obj.sizeY / 2, 0]}
          userData={{ pickKind: 'object', objectId: obj.id }}
        >
          <boxGeometry args={[obj.sizeX, obj.sizeY, obj.sizeZ]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
      {showGizmo && (
        <SelectionAabb
          targetRef={groupRef}
          sizeX={obj.sizeX}
          sizeY={obj.sizeY}
          sizeZ={obj.sizeZ}
        />
      )}
      {showGizmo && (
        <TransformControls
          key={`${obj.id}-${gizmoMode}`}
          object={groupRef as RefObject<THREE.Object3D>}
          mode={gizmoMode}
          size={1}
          space={gizmoMode === 'translate' ? 'world' : 'local'}
          onMouseDown={() => {
            cancelXyDrag()
            setTransformDragging(true)
          }}
          onObjectChange={() => {
            const g = groupRef.current
            if (!g) return
            if (gizmoMode !== 'scale') lockStoredScale(g)
          }}
          onMouseUp={() => {
            commitTransform()
            setTransformDragging(false)
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
  terrainLift = 0,
}: {
  obj: PlacedObject
  floorId: string
  floorElevation: number
  terrainLift?: number
}) {
  const selectObject = useBuildingStore((s) => s.selectObject)
  const workbench = useBuildingStore((s) => s.workbench)
  return (
    <mesh
      position={[
        obj.x,
        floorElevation + terrainLift + (obj.elevation ?? 0) + 0.25,
        -obj.y,
      ]}
      onClick={
        workbench === 'furnish'
          ? (e) => {
              e.stopPropagation()
              selectObject(floorId, obj.id)
            }
          : undefined
      }
    >
      <boxGeometry args={[0.4, 0.5, 0.4]} />
      <meshStandardMaterial color="#8b3a2a" />
    </mesh>
  )
}

const ResolvedObject = memo(function ResolvedObject({
  obj,
  floorId,
  floorElevation,
  terrainLift = 0,
  shadowsEnabled,
}: {
  obj: PlacedObject
  floorId: string
  floorElevation: number
  terrainLift?: number
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
      terrainLift={terrainLift}
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
          terrainLift={terrainLift}
          selected={selected}
          onSelect={() => selectObject(floorId, obj.id)}
          shadowsEnabled={shadowsEnabled}
        />
      </Suspense>
    </GlbErrorBoundary>
  )
})

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
          terrainLift={
            floor.kind === 'ground'
              ? heightAt(floor.landscapeTerrain, obj.x, obj.y)
              : 0
          }
          shadowsEnabled={shadowsEnabled}
        />
      ))}
    </group>
  )
}
