import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Edges, Line } from '@react-three/drei'
import { buildingBounds } from '../../engine/extrude'
import { frameSizeX, frameSizeY } from '../../landscape/maps'
import {
  plotFrame,
  plotRect,
  resizePlotEdge,
  type PlotEdge,
} from '../../landscape/site'
import { heightAt } from '../../landscape/terrain'
import { useBuildingStore } from '../../store/buildingStore'

function projectPlan(
  clientX: number,
  clientY: number,
  planeY: number,
  gl: THREE.WebGLRenderer,
  camera: THREE.Camera,
): { x: number; y: number } | null {
  const rect = gl.domElement.getBoundingClientRect()
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  )
  const raycaster = new THREE.Raycaster()
  const hit = new THREE.Vector3()
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY)
  raycaster.setFromCamera(ndc, camera)
  if (!raycaster.ray.intersectPlane(plane, hit)) return null
  return { x: hit.x, y: -hit.z }
}

function PlotOutline({
  minX,
  maxX,
  minY,
  maxY,
  y,
}: {
  minX: number
  maxX: number
  minY: number
  maxY: number
  y: number
}) {
  const points = useMemo(
    () =>
      [
        [minX, y, -minY],
        [maxX, y, -minY],
        [maxX, y, -maxY],
        [minX, y, -maxY],
        [minX, y, -minY],
      ] as Array<[number, number, number]>,
    [minX, maxX, minY, maxY, y],
  )
  return <Line points={points} color="#c45c26" lineWidth={1} raycast={() => {}} />
}

function EdgeHandle({
  edge,
  x,
  y,
  z,
  onDrag,
  onEnd,
}: {
  edge: PlotEdge
  x: number
  y: number
  z: number
  onDrag: (edge: PlotEdge, world: number) => void
  onEnd: () => void
}) {
  const { camera, gl } = useThree()
  const setDragging = useBuildingStore((s) => s.setTransformDragging)
  const cursor = edge === 'x+' || edge === 'x-' ? 'ew-resize' : 'ns-resize'

  const start = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    setDragging(true)
    const planeY = y
    const apply = (clientX: number, clientY: number) => {
      const p = projectPlan(clientX, clientY, planeY, gl, camera)
      if (!p) return
      onDrag(edge, edge === 'x+' || edge === 'x-' ? p.x : p.y)
    }
    const onMove = (ev: PointerEvent) => apply(ev.clientX, ev.clientY)
    const onUp = () => {
      gl.domElement.removeEventListener('pointermove', onMove)
      gl.domElement.removeEventListener('pointerup', onUp)
      gl.domElement.removeEventListener('pointercancel', onUp)
      setDragging(false)
      document.body.style.cursor = 'default'
      onEnd()
    }
    gl.domElement.addEventListener('pointermove', onMove)
    gl.domElement.addEventListener('pointerup', onUp)
    gl.domElement.addEventListener('pointercancel', onUp)
    document.body.style.cursor = cursor
  }

  return (
    <mesh
      position={[x, y, z]}
      onPointerDown={start}
      onPointerOver={() => {
        document.body.style.cursor = cursor
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      <boxGeometry args={[0.45, 0.45, 0.45]} />
      <meshBasicMaterial color="#c45c26" />
    </mesh>
  )
}

export function SiteLayoutGizmo() {
  const building = useBuildingStore((s) => s.building)
  const terrain = useBuildingStore(
    (s) => s.building.floors.find((f) => f.kind === 'ground')?.landscapeTerrain,
  )
  const groundY = useBuildingStore(
    (s) => s.building.floors.find((f) => f.kind === 'ground')?.elevation ?? 0,
  )
  const tool = useBuildingStore((s) => s.tool)
  const selection = useBuildingStore((s) => s.selection)
  const preview = useBuildingStore((s) => s.siteHousePreview)
  const beginDrag = useBuildingStore((s) => s.beginSiteHouseDrag)
  const previewDrag = useBuildingStore((s) => s.previewSiteHouseDrag)
  const commitDrag = useBuildingStore((s) => s.commitSiteHouseDrag)
  const { camera, gl } = useThree()

  const storedFrame = plotFrame(terrain)
  const [liveFrame, setLiveFrame] = useState<ReturnType<typeof plotFrame> | null>(
    null,
  )
  const liveRef = useRef(liveFrame)
  liveRef.current = liveFrame
  const frame = liveFrame ?? storedFrame
  const rect = plotRect(frame)
  const house = buildingBounds(building)
  const dx = preview?.dx ?? 0
  const dy = preview?.dy ?? 0
  const hx = (house.minX + house.maxX) / 2 + dx
  const hz = (house.minZ + house.maxZ) / 2 + dy
  const hw = Math.max(0.6, house.maxX - house.minX)
  const hd = Math.max(0.6, house.maxZ - house.minZ)
  const hh = Math.max(0.8, house.maxY - house.minY)
  const houseY = (house.minY + house.maxY) / 2

  const handleY = (x: number, y: number) =>
    groundY + heightAt(terrain, x, y) + 0.22

  const onEdgeDrag = (edge: PlotEdge, world: number) => {
    setLiveFrame(resizePlotEdge(storedFrame, edge, world, building))
  }

  const onEdgeEnd = () => {
    const cur = liveRef.current
    setLiveFrame(null)
    if (!cur) return
    const sx = frameSizeX(cur)
    const sy = frameSizeY(cur)
    if (
      Math.abs(sx - frameSizeX(storedFrame)) < 1e-4 &&
      Math.abs(sy - frameSizeY(storedFrame)) < 1e-4 &&
      Math.abs(cur.originX - storedFrame.originX) < 1e-4 &&
      Math.abs(cur.originY - storedFrame.originY) < 1e-4
    ) {
      return
    }
    useBuildingStore.getState().setLandscapePlot({
      sizeX: sx,
      sizeY: sy,
      originX: cur.originX,
      originY: cur.originY,
    })
  }

  const startHouseDrag = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const planeY = groundY
    const grab0 = projectPlan(
      e.nativeEvent.clientX,
      e.nativeEvent.clientY,
      planeY,
      gl,
      camera,
    )
    if (!grab0) return
    const origin = { x: grab0.x, y: grab0.y }
    beginDrag()
    const onMove = (ev: PointerEvent) => {
      const p = projectPlan(ev.clientX, ev.clientY, planeY, gl, camera)
      if (!p) return
      previewDrag(p.x - origin.x, p.y - origin.y)
    }
    const onUp = () => {
      gl.domElement.removeEventListener('pointermove', onMove)
      gl.domElement.removeEventListener('pointerup', onUp)
      gl.domElement.removeEventListener('pointercancel', onUp)
      commitDrag()
    }
    gl.domElement.addEventListener('pointermove', onMove)
    gl.domElement.addEventListener('pointerup', onUp)
    gl.domElement.addEventListener('pointercancel', onUp)
  }

  if (tool !== 'select') {
    return (
      <PlotOutline
        minX={rect.minX}
        maxX={rect.maxX}
        minY={rect.minY}
        maxY={rect.maxY}
        y={groundY + 0.05}
      />
    )
  }

  const grabHouse = selection?.kind !== 'plant' && selection?.kind !== 'object'

  return (
    <group>
      <PlotOutline
        minX={rect.minX}
        maxX={rect.maxX}
        minY={rect.minY}
        maxY={rect.maxY}
        y={groundY + 0.05}
      />
      <EdgeHandle
        edge="x+"
        x={rect.maxX}
        y={handleY(rect.maxX, frame.originY)}
        z={-frame.originY}
        onDrag={onEdgeDrag}
        onEnd={onEdgeEnd}
      />
      <EdgeHandle
        edge="x-"
        x={rect.minX}
        y={handleY(rect.minX, frame.originY)}
        z={-frame.originY}
        onDrag={onEdgeDrag}
        onEnd={onEdgeEnd}
      />
      <EdgeHandle
        edge="y+"
        x={frame.originX}
        y={handleY(frame.originX, rect.maxY)}
        z={-rect.maxY}
        onDrag={onEdgeDrag}
        onEnd={onEdgeEnd}
      />
      <EdgeHandle
        edge="y-"
        x={frame.originX}
        y={handleY(frame.originX, rect.minY)}
        z={-rect.minY}
        onDrag={onEdgeDrag}
        onEnd={onEdgeEnd}
      />
      {grabHouse && (
        <mesh
          position={[hx, houseY, -hz]}
          onPointerDown={startHouseDrag}
          onPointerOver={() => {
            document.body.style.cursor = 'move'
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'default'
          }}
        >
          <boxGeometry args={[hw, hh, hd]} />
          <meshBasicMaterial
            color="#2b6cb0"
            transparent
            opacity={0.12}
            depthWrite={false}
          />
          <Edges threshold={15} color="#2b6cb0" />
        </mesh>
      )}
    </group>
  )
}
