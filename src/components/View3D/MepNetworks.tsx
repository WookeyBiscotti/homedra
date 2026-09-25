import type { ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import {
  CABLE_META,
  PIPE_MEDIUM_META,
  electricalDeviceSize,
  ensureCableNetwork,
  ensurePipeNetwork,
  isCableSegmentSelected,
  isElectricalNodeSelected,
  isMepDrawTool,
  isMepFixtureTool,
  isPipeNodeSelected,
  isPipeSegmentSelected,
  type ElectricalNode,
  type Floor,
} from '../../engine/types'
import { wallEndpoints } from '../../engine/geometry/openings'
import { wallAxes } from '../../engine/geometry/wallSolid'
import {
  devicePlanPoint,
  nodePlanPoint,
  wallAnchor,
  wallNodeWorldY,
  type MepNodeLike,
} from '../../engine/geometry/mep'
import { useBuildingStore } from '../../store/buildingStore'

function worldOf(floor: Floor, node: MepNodeLike) {
  const p = nodePlanPoint(floor, node)
  if (!p) return null
  return new THREE.Vector3(p.x, wallNodeWorldY(floor, node), -p.y)
}

function deviceWorldPose(floor: Floor, node: ElectricalNode) {
  const onWall = wallAnchor(node.anchor)
  if (!node.device || !onWall) {
    const w = worldOf(floor, node)
    if (!w) return null
    const size = electricalDeviceSize(node)
    return {
      position: w,
      quaternion: new THREE.Quaternion(),
      size,
    }
  }
  const wall = floor.walls.find((w) => w.id === onWall.wallId)
  const axes = wall ? wallAxes(floor, wall) : null
  const p = devicePlanPoint(floor, node)
  if (!wall || !axes || !p) return null
  const size = electricalDeviceSize(node)
  const sign = (node.side ?? 'pos') === 'pos' ? 1 : -1
  const along = new THREE.Vector3(axes.ux, 0, -axes.uy).normalize()
  const up = new THREE.Vector3(0, 1, 0)
  const face = new THREE.Vector3(axes.nx * sign, 0, -axes.ny * sign).normalize()
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(along, up, face),
  )
  return {
    position: new THREE.Vector3(p.x, wallNodeWorldY(floor, node), -p.y),
    quaternion,
    size,
  }
}

function Tube({
  a,
  b,
  radius,
  color,
  selected,
  pickable,
  onClick,
}: {
  a: THREE.Vector3
  b: THREE.Vector3
  radius: number
  color: string
  selected: boolean
  pickable: boolean
  onClick?: (e: ThreeEvent<MouseEvent>) => void
}) {
  const { mid, quat, len } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a)
    const len = Math.max(dir.length(), 0.02)
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    )
    return { mid, quat, len }
  }, [a, b])

  return (
    <mesh
      position={mid}
      quaternion={quat}
      onClick={pickable ? onClick : undefined}
      raycast={pickable ? undefined : () => {}}
    >
      <cylinderGeometry args={[radius, radius, len, 10]} />
      <meshStandardMaterial
        color={selected ? '#c45c26' : color}
        roughness={0.45}
        metalness={0.2}
      />
    </mesh>
  )
}

function MepDrawHits({ floor }: { floor: Floor }) {
  const clickMepAt = useBuildingStore((s) => s.clickMepAt)
  const tool = useBuildingStore((s) => s.tool)
  if (!isMepDrawTool(tool) && !isMepFixtureTool(tool)) return null

  const placeWall = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.button !== 0) return
    const elev = Math.max(
      0,
      Math.min(floor.height, e.point.y - floor.elevation),
    )
    clickMepAt(e.point.x, -e.point.z, elev)
  }

  const placeSlab = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.button !== 0) return
    clickMepAt(e.point.x, -e.point.z)
  }

  return (
    <group>
      {floor.walls.map((wall) => {
        const ends = wallEndpoints(floor, wall)
        if (!ends || ends.len < 1e-6) return null
        const ux = (ends.b.x - ends.a.x) / ends.len
        const uy = (ends.b.y - ends.a.y) / ends.len
        const cx = ends.a.x + ux * (ends.len / 2)
        const cz = -(ends.a.y + uy * (ends.len / 2))
        const cy = floor.elevation + floor.height / 2
        const rotY = Math.atan2(uy, ux)
        return (
          <mesh
            key={wall.id}
            position={[cx, cy, cz]}
            rotation={[0, rotY, 0]}
            onPointerDown={placeWall}
          >
            <boxGeometry args={[ends.len, floor.height, wall.thickness + 0.08]} />
            <meshBasicMaterial
              transparent
              opacity={0}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        )
      })}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, floor.elevation + 0.01, 0]}
        onPointerDown={placeSlab}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

function DraggableMepNode({
  floor,
  network,
  nodeId,
  position,
  quaternion,
  children,
  onSelect,
}: {
  floor: Floor
  network: 'pipes' | 'cables'
  nodeId: string
  position: THREE.Vector3
  quaternion?: THREE.Quaternion
  children: ReactNode
  onSelect: () => void
}) {
  const beginMepNodeDrag = useBuildingStore((s) => s.beginMepNodeDrag)
  const dragMepNode = useBuildingStore((s) => s.dragMepNode)
  const dragging = useRef(false)

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    dragging.current = true
    beginMepNodeDrag()
    onSelect()
    const target = e.target as { setPointerCapture?: (id: number) => void } | null
    target?.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    e.stopPropagation()
    const net =
      network === 'pipes'
        ? ensurePipeNetwork(useBuildingStore.getState().activeFloor().pipes)
        : ensureCableNetwork(useBuildingStore.getState().activeFloor().cables)
    const node = net.nodes.find((n) => n.id === nodeId)
    const hit = new THREE.Vector3()
    const onWall = node ? wallAnchor(node.anchor) : null
    if (onWall) {
      const wall = floor.walls.find((w) => w.id === onWall.wallId)
      const ends = wall ? wallEndpoints(floor, wall) : null
      if (ends && ends.len > 1e-6) {
        const ux = (ends.b.x - ends.a.x) / ends.len
        const uy = (ends.b.y - ends.a.y) / ends.len
        const normal = new THREE.Vector3(-uy, 0, -ux)
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          normal,
          position,
        )
        if (e.ray.intersectPlane(plane, hit)) {
          const elev = Math.max(0, Math.min(floor.height, hit.y - floor.elevation))
          dragMepNode(network, nodeId, hit.x, -hit.z, elev)
          return
        }
      }
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floor.elevation)
    if (e.ray.intersectPlane(plane, hit)) {
      dragMepNode(network, nodeId, hit.x, -hit.z)
    }
  }

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    dragging.current = false
    e.stopPropagation()
  }

  return (
    <mesh
      position={position}
      quaternion={quaternion}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      {children}
    </mesh>
  )
}

export function MepNetworks({
  floor,
  routing,
}: {
  floor: Floor
  routing: boolean
}) {
  const selection = useBuildingStore((s) => s.selection)
  const setSelection = useBuildingStore((s) => s.setSelection)
  const tool = useBuildingStore((s) => s.tool)
  const pipes = ensurePipeNetwork(floor.pipes)
  const cables = ensureCableNetwork(floor.cables)
  const canDrag = !routing && tool === 'select'

  return (
    <group>
      {pipes.segments.map((seg) => {
        const a = pipes.nodes.find((n) => n.id === seg.a)
        const b = pipes.nodes.find((n) => n.id === seg.b)
        if (!a || !b) return null
        const wa = worldOf(floor, a)
        const wb = worldOf(floor, b)
        if (!wa || !wb) return null
        return (
          <Tube
            key={seg.id}
            a={wa}
            b={wb}
            radius={Math.max(0.012, seg.diameterMm / 1400)}
            color={PIPE_MEDIUM_META[seg.medium].color}
            selected={isPipeSegmentSelected(selection, seg.id)}
            pickable={!routing}
            onClick={(e) => {
              e.stopPropagation()
              setSelection({ kind: 'pipeSegment', id: seg.id })
            }}
          />
        )
      })}
      {cables.segments.map((seg) => {
        const a = cables.nodes.find((n) => n.id === seg.a)
        const b = cables.nodes.find((n) => n.id === seg.b)
        if (!a || !b) return null
        const wa = worldOf(floor, a)
        const wb = worldOf(floor, b)
        if (!wa || !wb) return null
        return (
          <Tube
            key={seg.id}
            a={wa}
            b={wb}
            radius={0.01}
            color={CABLE_META.color}
            selected={isCableSegmentSelected(selection, seg.id)}
            pickable={!routing}
            onClick={(e) => {
              e.stopPropagation()
              setSelection({ kind: 'cableSegment', id: seg.id })
            }}
          />
        )
      })}
      {pipes.nodes.map((n) => {
        const w = worldOf(floor, n)
        if (!w) return null
        const selected = isPipeNodeSelected(selection, n.id)
        const geo = (
          <>
            <sphereGeometry args={[n.fixture === 'heater' ? 0.08 : 0.04, 10, 10]} />
            <meshStandardMaterial
              color={selected ? '#c45c26' : n.fixture ? '#4a5568' : '#2b6cb0'}
            />
          </>
        )
        if (routing) {
          return (
            <mesh key={n.id} position={w} raycast={() => {}}>
              {geo}
            </mesh>
          )
        }
        if (!canDrag) {
          return (
            <mesh
              key={n.id}
              position={w}
              onClick={(e) => {
                e.stopPropagation()
                setSelection({ kind: 'pipeNode', id: n.id })
              }}
            >
              {geo}
            </mesh>
          )
        }
        return (
          <DraggableMepNode
            key={n.id}
            floor={floor}
            network="pipes"
            nodeId={n.id}
            position={w}
            onSelect={() => setSelection({ kind: 'pipeNode', id: n.id })}
          >
            {geo}
          </DraggableMepNode>
        )
      })}
      {cables.nodes.map((n) => {
        const selected = isElectricalNodeSelected(selection, n.id)
        const pose = n.device ? deviceWorldPose(floor, n) : null
        const w = pose?.position ?? worldOf(floor, n)
        if (!w) return null
        const size = pose
          ? ([pose.size.width, pose.size.height, pose.size.depth] as const)
          : ([0.045, 0.045, 0.045] as const)
        const geo = (
          <>
            <boxGeometry args={[...size]} />
            <meshStandardMaterial
              color={selected ? '#c45c26' : n.device ? '#2d3748' : CABLE_META.color}
            />
          </>
        )
        if (routing) {
          return (
            <mesh
              key={n.id}
              position={w}
              quaternion={pose?.quaternion}
              raycast={() => {}}
            >
              {geo}
            </mesh>
          )
        }
        return (
          <DraggableMepNode
            key={n.id}
            floor={floor}
            network="cables"
            nodeId={n.id}
            position={w}
            quaternion={pose?.quaternion}
            onSelect={() => setSelection({ kind: 'electricalNode', id: n.id })}
          >
            {geo}
          </DraggableMepNode>
        )
      })}
      {routing && <MepDrawHits floor={floor} />}
    </group>
  )
}
