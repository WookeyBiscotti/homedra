import type { KonvaEventObject } from 'konva/lib/Node'
import { Circle, Group, Line, Rect } from 'react-konva'
import {
  CABLE_META,
  PIPE_MEDIUM_META,
  electricalDeviceSize,
  ensureCableNetwork,
  ensurePipeNetwork,
  isCableSegmentSelected,
  isElectricalNodeSelected,
  isMepWorkbench,
  isPipeNodeSelected,
  isPipeSegmentSelected,
  type ElectricalNode,
  type Floor,
  type Selection,
} from '../../engine/types'
import {
  devicePlanPoint,
  findWallCenterlineNear,
  mepPoint,
  nodePlanPoint,
  previewMepPath,
} from '../../engine/geometry/mep'
import { snapToGrid } from '../../engine/geometry/walls'
import { useBuildingStore } from '../../store/buildingStore'

function fixtureSymbol(
  kind: 'valve' | 'heater' | 'outlet' | 'switch' | 'panel',
  x: number,
  y: number,
  color: string,
) {
  if (kind === 'valve') {
    return (
      <Group listening={false}>
        <Circle x={x} y={y} radius={6} stroke={color} strokeWidth={1.5} />
        <Line points={[x - 4, y - 4, x + 4, y + 4]} stroke={color} strokeWidth={1.2} />
        <Line points={[x + 4, y - 4, x - 4, y + 4]} stroke={color} strokeWidth={1.2} />
      </Group>
    )
  }
  if (kind === 'heater') {
    return (
      <Rect
        x={x - 8}
        y={y - 5}
        width={16}
        height={10}
        stroke={color}
        strokeWidth={1.5}
        listening={false}
      />
    )
  }
  if (kind === 'panel') {
    return (
      <Rect
        x={x - 7}
        y={y - 8}
        width={14}
        height={16}
        stroke={color}
        strokeWidth={1.5}
        listening={false}
      />
    )
  }
  return (
    <Circle x={x} y={y} radius={5} stroke={color} strokeWidth={1.5} listening={false} />
  )
}

export function MepPlanLayer({
  floor,
  toScreen,
  toWorld,
  pointer,
}: {
  floor: Floor
  toScreen: (x: number, y: number) => { x: number; y: number }
  toWorld: (sx: number, sy: number) => { x: number; y: number }
  pointer: { x: number; y: number } | null
}) {
  const workbench = useBuildingStore((s) => s.workbench)
  const tool = useBuildingStore((s) => s.tool)
  const selection = useBuildingStore((s) => s.selection)
  const mepDraftFrom = useBuildingStore((s) => s.mepDraftFrom)
  const pipeElevation = useBuildingStore((s) => s.pipeElevation)
  const cableElevation = useBuildingStore((s) => s.cableElevation)
  const beginMepNodeDrag = useBuildingStore((s) => s.beginMepNodeDrag)
  const dragMepNode = useBuildingStore((s) => s.dragMepNode)
  const setSelection = useBuildingStore((s) => s.setSelection)
  const active = isMepWorkbench(workbench)
  const canDrag = active && tool === 'select'
  const opacity = active ? 1 : 0.35
  const pipes = ensurePipeNetwork(floor.pipes)
  const cables = ensureCableNetwork(floor.cables)

  const draft = (() => {
    if (!mepDraftFrom || !pointer || !active) return null
    const nodes = workbench === 'plumbing' ? pipes.nodes : cables.nodes
    const from = nodes.find((n) => n.id === mepDraftFrom)
    if (!from) return null
    const wall = findWallCenterlineNear(floor, pointer.x, pointer.y)
    const toAnchor = wall
      ? { type: 'wall' as const, wallId: wall.wall.id, offset: wall.offset }
      : { type: 'slab' as const, x: snapToGrid(pointer.x), y: snapToGrid(pointer.y) }
    const elev = workbench === 'plumbing' ? pipeElevation : cableElevation
    const path = previewMepPath(floor, from, toAnchor, elev)
    if (path.length < 2) return null
    const pts = path.flatMap((p) => {
      const s = toScreen(p.x, p.y)
      return [s.x, s.y]
    })
    const color =
      workbench === 'plumbing' ? PIPE_MEDIUM_META.coldWater.color : CABLE_META.color
    return { pts, color }
  })()

  const onNodeDrag = (
    network: 'pipes' | 'cables',
    id: string,
    e: KonvaEventObject<DragEvent>,
  ) => {
    const w = toWorld(e.target.x(), e.target.y())
    dragMepNode(network, id, w.x, w.y)
    const net =
      network === 'pipes'
        ? ensurePipeNetwork(useBuildingStore.getState().activeFloor().pipes)
        : ensureCableNetwork(useBuildingStore.getState().activeFloor().cables)
    const node = net.nodes.find((n) => n.id === id)
    const p = node
      ? node.device
        ? devicePlanPoint(floor, node)
        : mepPoint(floor, node.anchor)
      : null
    if (p) {
      const s = toScreen(p.x, p.y)
      e.target.position(s)
    }
  }

  return (
    <Group opacity={opacity}>
      {renderNetwork(
        floor,
        pipes.nodes,
        pipes.segments.map((s) => ({
          id: s.id,
          a: s.a,
          b: s.b,
          color: PIPE_MEDIUM_META[s.medium].color,
          width: Math.max(2, s.diameterMm / 12),
        })),
        toScreen,
        selection,
        'pipe',
        canDrag,
        setSelection,
        beginMepNodeDrag,
        onNodeDrag,
      )}
      {renderNetwork(
        floor,
        cables.nodes,
        cables.segments.map((s) => ({
          id: s.id,
          a: s.a,
          b: s.b,
          color: CABLE_META.color,
          width: 2.2,
        })),
        toScreen,
        selection,
        'cable',
        canDrag,
        setSelection,
        beginMepNodeDrag,
        onNodeDrag,
      )}
      {draft && (
        <Line
          points={draft.pts}
          stroke={draft.color}
          strokeWidth={2}
          dash={[6, 4]}
          listening={false}
        />
      )}
    </Group>
  )
}

function renderNetwork(
  floor: Floor,
  nodes: Array<{
    id: string
    anchor: { type: 'wall'; wallId: string; offset: number } | { type: 'slab'; x: number; y: number }
    fixture?: 'valve' | 'heater'
    device?: 'outlet' | 'switch' | 'panel'
  }>,
  segments: Array<{ id: string; a: string; b: string; color: string; width: number }>,
  toScreen: (x: number, y: number) => { x: number; y: number },
  selection: Selection,
  kind: 'pipe' | 'cable',
  canDrag: boolean,
  setSelection: (sel: Selection) => void,
  beginMepNodeDrag: () => void,
  onNodeDrag: (
    network: 'pipes' | 'cables',
    id: string,
    e: KonvaEventObject<DragEvent>,
  ) => void,
) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return (
    <Group>
      {segments.map((seg) => {
        const a = byId.get(seg.a)
        const b = byId.get(seg.b)
        if (!a || !b) return null
        const pa = nodePlanPoint(floor, a)
        const pb = nodePlanPoint(floor, b)
        if (!pa || !pb) return null
        const sa = toScreen(pa.x, pa.y)
        const sb = toScreen(pb.x, pb.y)
        const selected =
          kind === 'pipe'
            ? isPipeSegmentSelected(selection, seg.id)
            : isCableSegmentSelected(selection, seg.id)
        return (
          <Line
            key={seg.id}
            points={[sa.x, sa.y, sb.x, sb.y]}
            stroke={selected ? '#c45c26' : seg.color}
            strokeWidth={selected ? seg.width + 1.5 : seg.width}
            hitStrokeWidth={Math.max(14, seg.width + 10)}
            lineCap="round"
            listening={canDrag}
            onMouseDown={(e) => {
              e.cancelBubble = true
            }}
            onClick={(e) => {
              e.cancelBubble = true
              setSelection(
                kind === 'pipe'
                  ? { kind: 'pipeSegment', id: seg.id }
                  : { kind: 'cableSegment', id: seg.id },
              )
            }}
          />
        )
      })}
      {nodes.map((n) => {
        const p =
          n.device && n.anchor.type === 'wall'
            ? devicePlanPoint(floor, n as ElectricalNode)
            : mepPoint(floor, n.anchor)
        if (!p) return null
        const s = toScreen(p.x, p.y)
        const selected =
          kind === 'pipe'
            ? isPipeNodeSelected(selection, n.id)
            : isElectricalNodeSelected(selection, n.id)
        const color = selected ? '#c45c26' : kind === 'pipe' ? '#2b6cb0' : CABLE_META.color
        const fixture = n.fixture ?? n.device
        const size = n.device
          ? electricalDeviceSize(n as ElectricalNode)
          : null
        const px =
          size != null
            ? Math.max(
                6,
                Math.hypot(
                  toScreen(p.x + size.width, p.y).x - s.x,
                  toScreen(p.x + size.width, p.y).y - s.y,
                ) / 2,
              )
            : selected
              ? 7
              : 5
        return (
          <Group key={n.id}>
            <Circle
              x={s.x}
              y={s.y}
              radius={px}
              fill={color}
              listening={canDrag}
              draggable={canDrag}
              onMouseDown={(e) => {
                e.cancelBubble = true
              }}
              onClick={(e) => {
                e.cancelBubble = true
                setSelection(
                  kind === 'pipe'
                    ? { kind: 'pipeNode', id: n.id }
                    : { kind: 'electricalNode', id: n.id },
                )
              }}
              onDragStart={(e) => {
                e.cancelBubble = true
                beginMepNodeDrag()
                setSelection(
                  kind === 'pipe'
                    ? { kind: 'pipeNode', id: n.id }
                    : { kind: 'electricalNode', id: n.id },
                )
              }}
              onDragMove={(e) => {
                e.cancelBubble = true
                onNodeDrag(kind === 'pipe' ? 'pipes' : 'cables', n.id, e)
              }}
            />
            {fixture && fixtureSymbol(fixture, s.x, s.y, color)}
          </Group>
        )
      })}
    </Group>
  )
}
