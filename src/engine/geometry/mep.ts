import {
  createId,
  ELECTRICAL_DEVICE_SIZE,
  electricalDeviceSize,
  ensureCableNetwork,
  ensurePipeNetwork,
  type CableNetwork,
  type CableSegment,
  type ElectricalDeviceKind,
  type ElectricalNode,
  type Floor,
  type Id,
  type MepAnchor,
  type PipeNetwork,
  type PipeNode,
  type PipeSegment,
  type Wall,
  type WallSide,
} from '../types'
import { wallEndpoints } from './openings'
import { wallAxes } from './wallSolid'
import {
  projectOnSegment,
  snapToGrid,
  wallEdgeHitThreshold,
} from './walls'

export const MEP_NODE_HIT = 0.2
export const MEP_SEG_HIT = 0.16
/** Wall-node elevation used when dropping a run into the slab. */
export const SLAB_CONNECT_ELEVATION = 0
const ELEV_EPS = 0.02
const XY_EPS = 0.04

export type MepNetworkKey = 'pipes' | 'cables'

export type WallAnchor = Extract<MepAnchor, { type: 'wall' }>

export function wallAnchor(anchor: MepAnchor): WallAnchor | null {
  return anchor.type === 'wall' ? anchor : null
}

export interface MepNodeLike {
  id: Id
  anchor: MepAnchor
  elevation?: number
}

export interface MepSegmentLike {
  id: Id
  a: Id
  b: Id
}

export function mepPoint(
  floor: Floor,
  anchor: MepAnchor,
): { x: number; y: number } | null {
  if (anchor.type === 'slab') return { x: anchor.x, y: anchor.y }
  const wall = floor.walls.find((w) => w.id === anchor.wallId)
  if (!wall) return null
  const ends = wallEndpoints(floor, wall)
  if (!ends || ends.len < 1e-9) return null
  const t = Math.max(0, Math.min(1, anchor.offset / ends.len))
  return {
    x: ends.a.x + (ends.b.x - ends.a.x) * t,
    y: ends.a.y + (ends.b.y - ends.a.y) * t,
  }
}

export function nodePlanPoint(
  floor: Floor,
  node: MepNodeLike,
): { x: number; y: number } | null {
  return mepPoint(floor, node.anchor)
}

/**
 * Move a node: stay on its wall when the drag is near that wall,
 * snap to another wall if close, otherwise drop into the slab.
 * Wall-mounted electrical devices never leave a wall.
 */
export function relocateMepNode<N extends MepNodeLike>(
  floor: Floor,
  node: N,
  x: number,
  y: number,
  elevation?: number,
): N {
  const mustStayOnWall =
    'device' in node && Boolean((node as { device?: unknown }).device)
  const elev = elevation ?? node.elevation

  const onWall = wallAnchor(node.anchor)
  if (onWall) {
    const wall = floor.walls.find((w) => w.id === onWall.wallId)
    if (wall) {
      const ends = wallEndpoints(floor, wall)
      if (ends && ends.len > 1e-9) {
        const proj = projectOnSegment(
          x,
          y,
          ends.a.x,
          ends.a.y,
          ends.b.x,
          ends.b.y,
        )
        const stay = Math.max(wall.thickness / 2 + 0.35, 0.45)
        if (proj.dist <= stay) {
          return withDeviceSide(
            {
              ...node,
              anchor: {
                type: 'wall',
                wallId: wall.id,
                offset: proj.t * ends.len,
              },
              elevation: elev,
            },
            floor,
            wall,
            x,
            y,
          )
        }
      }
    }
  }

  const wallHit = findWallCenterlineNear(floor, x, y)
  if (wallHit) {
    return withDeviceSide(
      {
        ...node,
        anchor: {
          type: 'wall',
          wallId: wallHit.wall.id,
          offset: wallHit.offset,
        },
        elevation: elev,
      },
      floor,
      wallHit.wall,
      x,
      y,
    )
  }

  if (mustStayOnWall && node.anchor.type === 'wall') {
    return node
  }

  return {
    ...node,
    anchor: { type: 'slab', x: snapToGrid(x), y: snapToGrid(y) },
    elevation: undefined,
  }
}

export function wallOffsetAt(
  floor: Floor,
  wall: Wall,
  x: number,
  y: number,
): number | null {
  const ends = wallEndpoints(floor, wall)
  if (!ends || ends.len < 1e-9) return null
  const proj = projectOnSegment(x, y, ends.a.x, ends.a.y, ends.b.x, ends.b.y)
  return proj.t * ends.len
}

/** Hit the full wall length, including endpoints (unlike findWallEdgeNear). */
export function findWallCenterlineNear(
  floor: Floor,
  x: number,
  y: number,
): { wall: Wall; offset: number; x: number; y: number } | undefined {
  let best:
    | { wall: Wall; offset: number; x: number; y: number; dist: number }
    | undefined
  for (const wall of floor.walls) {
    const ends = wallEndpoints(floor, wall)
    if (!ends || ends.len < 1e-9) continue
    const proj = projectOnSegment(x, y, ends.a.x, ends.a.y, ends.b.x, ends.b.y)
    const maxDist = wallEdgeHitThreshold(wall)
    if (proj.dist > maxDist) continue
    if (!best || proj.dist < best.dist) {
      best = {
        wall,
        offset: proj.t * ends.len,
        x: proj.x,
        y: proj.y,
        dist: proj.dist,
      }
    }
  }
  return best
    ? { wall: best.wall, offset: best.offset, x: best.x, y: best.y }
    : undefined
}

export function wallSideAt(
  floor: Floor,
  wall: Wall,
  x: number,
  y: number,
): WallSide {
  const axes = wallAxes(floor, wall)
  if (!axes) return 'pos'
  const signed = (x - axes.a.x) * axes.nx + (y - axes.a.y) * axes.ny
  return signed >= 0 ? 'pos' : 'neg'
}

function isWallDevice(
  node: MepNodeLike,
): node is MepNodeLike & ElectricalNode {
  return 'device' in node && Boolean((node as ElectricalNode).device)
}

function withDeviceSide<N extends MepNodeLike>(
  node: N,
  floor: Floor,
  wall: Wall,
  x: number,
  y: number,
): N {
  if (!isWallDevice(node)) return node
  return { ...node, side: wallSideAt(floor, wall, x, y) }
}

/** Plan point of a wall-mounted device on its face (cables stay on the axis). */
export function devicePlanPoint(
  floor: Floor,
  node: ElectricalNode,
): { x: number; y: number } | null {
  const onWall = wallAnchor(node.anchor)
  if (!onWall || !node.device) {
    return mepPoint(floor, node.anchor)
  }
  const wall = floor.walls.find((w) => w.id === onWall.wallId)
  const p = mepPoint(floor, node.anchor)
  const axes = wall ? wallAxes(floor, wall) : null
  if (!wall || !p || !axes) return p
  const size = electricalDeviceSize(node)
  const sign = (node.side ?? 'pos') === 'pos' ? 1 : -1
  const outset = wall.thickness / 2 + size.depth / 2
  return {
    x: p.x + axes.nx * sign * outset,
    y: p.y + axes.ny * sign * outset,
  }
}

export function findMepNodeNear<N extends MepNodeLike>(
  floor: Floor,
  nodes: N[],
  x: number,
  y: number,
  radius = MEP_NODE_HIT,
): N | undefined {
  let best: N | undefined
  let bestDist = radius
  for (const node of nodes) {
    const pts = [nodePlanPoint(floor, node)]
    if (isWallDevice(node)) pts.push(devicePlanPoint(floor, node))
    for (const p of pts) {
      if (!p) continue
      const d = Math.hypot(p.x - x, p.y - y)
      if (d <= bestDist) {
        best = node
        bestDist = d
      }
    }
  }
  return best
}

export function placeElectricalDevice(
  floor: Floor,
  net: CableNetwork,
  x: number,
  y: number,
  elevation: number,
  device: ElectricalDeviceKind,
): {
  nodes: ElectricalNode[]
  segments: CableSegment[]
  node: ElectricalNode
} | null {
  const wallHit = findWallCenterlineNear(floor, x, y)
  if (!wallHit) return null
  const side = wallSideAt(floor, wallHit.wall, x, y)
  const defaults = ELECTRICAL_DEVICE_SIZE[device]
  const existing = findMepNodeNear(floor, net.nodes, x, y)
  if (existing && existing.anchor.type === 'wall') {
    const existingSide = existing.side ?? 'pos'
    const canReuse = !existing.device || existingSide === side
    if (canReuse) {
      const nodes = net.nodes.map((n) =>
        n.id === existing.id
          ? {
              ...n,
              device,
              side,
              elevation,
              width: n.width ?? defaults.width,
              height: n.height ?? defaults.height,
              depth: n.depth ?? defaults.depth,
            }
          : n,
      )
      const node = nodes.find((n) => n.id === existing.id)
      if (node) return { nodes, segments: net.segments, node }
    }
  }
  const node = makeElectricalNode(
    { type: 'wall', wallId: wallHit.wall.id, offset: wallHit.offset },
    elevation,
    device,
    {
      side,
      width: defaults.width,
      height: defaults.height,
      depth: defaults.depth,
    },
  )
  return { nodes: [...net.nodes, node], segments: net.segments, node }
}

export function findMepSegmentNear<
  N extends MepNodeLike,
  S extends MepSegmentLike,
>(
  floor: Floor,
  nodes: N[],
  segments: S[],
  x: number,
  y: number,
  threshold = MEP_SEG_HIT,
): { segment: S; x: number; y: number; t: number } | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let best:
    | { segment: S; x: number; y: number; t: number; dist: number }
    | undefined
  for (const seg of segments) {
    const a = byId.get(seg.a)
    const b = byId.get(seg.b)
    if (!a || !b) continue
    const pa = nodePlanPoint(floor, a)
    const pb = nodePlanPoint(floor, b)
    if (!pa || !pb) continue
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y)
    if (len < 1e-6) continue
    const proj = projectOnSegment(x, y, pa.x, pa.y, pb.x, pb.y)
    if (proj.dist > threshold) continue
    if (!best || proj.dist < best.dist) {
      best = {
        segment: seg,
        x: proj.x,
        y: proj.y,
        t: proj.t,
        dist: proj.dist,
      }
    }
  }
  return best
    ? { segment: best.segment, x: best.x, y: best.y, t: best.t }
    : undefined
}

export function sameUndirected(
  segments: MepSegmentLike[],
  a: Id,
  b: Id,
): boolean {
  return segments.some(
    (s) => (s.a === a && s.b === b) || (s.a === b && s.b === a),
  )
}

function elevOf(node: MepNodeLike): number {
  if (node.anchor.type === 'slab') return SLAB_CONNECT_ELEVATION
  return node.elevation ?? SLAB_CONNECT_ELEVATION
}

function samePlanPoint(
  floor: Floor,
  a: MepNodeLike,
  b: MepNodeLike,
): boolean {
  const pa = nodePlanPoint(floor, a)
  const pb = nodePlanPoint(floor, b)
  if (!pa || !pb) return false
  return Math.hypot(pa.x - pb.x, pa.y - pb.y) < XY_EPS
}

function wallsShareVertex(
  floor: Floor,
  wallA: Wall,
  wallB: Wall,
): { vertexId: Id; offsetA: number; offsetB: number } | null {
  const endsA = wallEndpoints(floor, wallA)
  const endsB = wallEndpoints(floor, wallB)
  if (!endsA || !endsB) return null
  if (wallA.a === wallB.a) {
    return { vertexId: wallA.a, offsetA: 0, offsetB: 0 }
  }
  if (wallA.a === wallB.b) {
    return { vertexId: wallA.a, offsetA: 0, offsetB: endsB.len }
  }
  if (wallA.b === wallB.a) {
    return { vertexId: wallA.b, offsetA: endsA.len, offsetB: 0 }
  }
  if (wallA.b === wallB.b) {
    return { vertexId: wallA.b, offsetA: endsA.len, offsetB: endsB.len }
  }
  return null
}

function findExistingNode<N extends MepNodeLike>(
  _floor: Floor,
  nodes: N[],
  anchor: MepAnchor,
  elevation: number | undefined,
): N | undefined {
  for (const n of nodes) {
    if (anchor.type === 'slab') {
      if (n.anchor.type !== 'slab') continue
      if (Math.hypot(n.anchor.x - anchor.x, n.anchor.y - anchor.y) <= XY_EPS) {
        return n
      }
      continue
    }
    const nodeWall = wallAnchor(n.anchor)
    const targetWall = wallAnchor(anchor)
    if (!nodeWall || !targetWall) continue
    if (nodeWall.wallId !== targetWall.wallId) continue
    if (Math.abs(nodeWall.offset - targetWall.offset) > XY_EPS) continue
    const e = elevation ?? SLAB_CONNECT_ELEVATION
    if (Math.abs(elevOf(n) - e) <= ELEV_EPS) return n
  }
  return undefined
}

export type ResolveMepKind = 'node' | 'segment' | 'wall' | 'slab'

export function resolveMepEndpoint<
  N extends MepNodeLike,
  S extends MepSegmentLike,
>(
  floor: Floor,
  nodes: N[],
  segments: S[],
  x: number,
  y: number,
  elevation: number,
  makeNode: (anchor: MepAnchor, elevation?: number) => N,
  makeSegment: (a: Id, b: Id) => S,
): {
  nodes: N[]
  segments: S[]
  node: N
  created: boolean
  kind: ResolveMepKind
} {
  const existing = findMepNodeNear(floor, nodes, x, y)
  if (existing) {
    const p = nodePlanPoint(floor, existing)
    const sameSpot = p && Math.hypot(p.x - x, p.y - y) <= MEP_NODE_HIT
    if (sameSpot && existing.anchor.type === 'wall') {
      const want = elevation
      if (Math.abs(elevOf(existing) - want) > ELEV_EPS) {
        const riser: N = makeNode(existing.anchor, want)
        return {
          nodes: [...nodes, riser],
          segments,
          node: riser,
          created: true,
          kind: 'node',
        }
      }
    }
    return { nodes, segments, node: existing, created: false, kind: 'node' }
  }

  const hitSeg = findMepSegmentNear(floor, nodes, segments, x, y)
  if (hitSeg) {
    const split = splitMepSegment(
      floor,
      nodes,
      segments,
      hitSeg.segment.id,
      hitSeg.x,
      hitSeg.y,
      elevation,
      makeNode,
      makeSegment,
    )
    if (split) {
      return {
        nodes: split.nodes,
        segments: split.segments,
        node: split.node,
        created: true,
        kind: 'segment',
      }
    }
  }

  const wallHit = findWallCenterlineNear(floor, x, y)
  if (wallHit) {
    const anchor: MepAnchor = {
      type: 'wall',
      wallId: wallHit.wall.id,
      offset: wallHit.offset,
    }
    const found = findExistingNode(floor, nodes, anchor, elevation)
    if (found) {
      return { nodes, segments, node: found, created: false, kind: 'wall' }
    }
    const node = makeNode(anchor, elevation)
    return {
      nodes: [...nodes, node],
      segments,
      node,
      created: true,
      kind: 'wall',
    }
  }

  const sx = snapToGrid(x)
  const sy = snapToGrid(y)
  const slabAnchor: MepAnchor = { type: 'slab', x: sx, y: sy }
  const foundSlab = findExistingNode(floor, nodes, slabAnchor, undefined)
  if (foundSlab) {
    return { nodes, segments, node: foundSlab, created: false, kind: 'slab' }
  }
  const node = makeNode(slabAnchor)
  return {
    nodes: [...nodes, node],
    segments,
    node,
    created: true,
    kind: 'slab',
  }
}

export function splitMepSegment<
  N extends MepNodeLike,
  S extends MepSegmentLike,
>(
  floor: Floor,
  nodes: N[],
  segments: S[],
  segmentId: Id,
  x: number,
  y: number,
  elevation: number,
  makeNode: (anchor: MepAnchor, elevation?: number) => N,
  makeSegment: (a: Id, b: Id) => S,
): { nodes: N[]; segments: S[]; node: N } | null {
  const seg = segments.find((s) => s.id === segmentId)
  if (!seg) return null
  const a = nodes.find((n) => n.id === seg.a)
  const b = nodes.find((n) => n.id === seg.b)
  if (!a || !b) return null
  const pa = nodePlanPoint(floor, a)
  const pb = nodePlanPoint(floor, b)
  if (!pa || !pb) return null
  const proj = projectOnSegment(x, y, pa.x, pa.y, pb.x, pb.y)

  let anchor: MepAnchor
  let nodeElev: number | undefined
  const aWall = wallAnchor(a.anchor)
  const bWall = wallAnchor(b.anchor)
  if (aWall && bWall && aWall.wallId === bWall.wallId) {
    const off = aWall.offset + (bWall.offset - aWall.offset) * proj.t
    anchor = { type: 'wall', wallId: aWall.wallId, offset: off }
    nodeElev = elevOf(a) + (elevOf(b) - elevOf(a)) * proj.t
  } else if (a.anchor.type === 'slab' && b.anchor.type === 'slab') {
    anchor = { type: 'slab', x: proj.x, y: proj.y }
  } else {
    anchor = { type: 'slab', x: proj.x, y: proj.y }
  }

  const found = findExistingNode(floor, nodes, anchor, nodeElev)
  const node = found ?? makeNode(anchor, nodeElev ?? elevation)
  const nextNodes = found ? nodes : [...nodes, node]
  const rest = segments.filter((s) => s.id !== seg.id)
  if (node.id === seg.a || node.id === seg.b) {
    return { nodes: nextNodes, segments, node }
  }
  const s1 = makeSegment(seg.a, node.id)
  const s2 = makeSegment(node.id, seg.b)
  return { nodes: nextNodes, segments: [...rest, s1, s2], node }
}

function pushSegment<S extends MepSegmentLike>(
  segments: S[],
  a: Id,
  b: Id,
  makeSegment: (a: Id, b: Id) => S,
): S[] {
  if (a === b) return segments
  if (sameUndirected(segments, a, b)) return segments
  return [...segments, makeSegment(a, b)]
}

function findOrAdd<N extends MepNodeLike>(
  floor: Floor,
  nodes: N[],
  anchor: MepAnchor,
  elevation: number | undefined,
  makeNode: (anchor: MepAnchor, elevation?: number) => N,
): { nodes: N[]; node: N } {
  const found = findExistingNode(floor, nodes, anchor, elevation)
  if (found) return { nodes, node: found }
  const node = makeNode(anchor, elevation)
  return { nodes: [...nodes, node], node }
}

/**
 * Connect two nodes, inserting corner / slab-drop nodes so the run stays
 * inside walls or the slab (never a diagonal through air).
 */
export function connectMepNodes<
  N extends MepNodeLike,
  S extends MepSegmentLike,
>(
  floor: Floor,
  nodes: N[],
  segments: S[],
  fromId: Id,
  toId: Id,
  makeNode: (anchor: MepAnchor, elevation?: number) => N,
  makeSegment: (a: Id, b: Id) => S,
): { nodes: N[]; segments: S[] } | null {
  if (fromId === toId) return null
  const from = nodes.find((n) => n.id === fromId)
  const to = nodes.find((n) => n.id === toId)
  if (!from || !to) return null

  let nextNodes = nodes
  let nextSegs = segments

  const link = (a: Id, b: Id) => {
    nextSegs = pushSegment(nextSegs, a, b, makeSegment)
  }

  const fromWall = wallAnchor(from.anchor)
  const toWall = wallAnchor(to.anchor)
  if (fromWall && toWall) {
    if (fromWall.wallId === toWall.wallId) {
      link(from.id, to.id)
      return { nodes: nextNodes, segments: nextSegs }
    }
    const wallA = floor.walls.find((w) => w.id === fromWall.wallId)
    const wallB = floor.walls.find((w) => w.id === toWall.wallId)
    if (wallA && wallB) {
      const shared = wallsShareVertex(floor, wallA, wallB)
      if (shared) {
        const corner = findOrAdd(
          floor,
          nextNodes,
          {
            type: 'wall',
            wallId: fromWall.wallId,
            offset: shared.offsetA,
          },
          elevOf(from),
          makeNode,
        )
        nextNodes = corner.nodes
        link(from.id, corner.node.id)
        link(corner.node.id, to.id)
        return { nodes: nextNodes, segments: nextSegs }
      }
    }
    // Unrelated walls: drop both into the slab and run through the floor.
    const dropFrom = findOrAdd(
      floor,
      nextNodes,
      from.anchor,
      SLAB_CONNECT_ELEVATION,
      makeNode,
    )
    nextNodes = dropFrom.nodes
    const dropTo = findOrAdd(
      floor,
      nextNodes,
      to.anchor,
      SLAB_CONNECT_ELEVATION,
      makeNode,
    )
    nextNodes = dropTo.nodes
    link(from.id, dropFrom.node.id)
    link(dropFrom.node.id, dropTo.node.id)
    link(dropTo.node.id, to.id)
    return { nodes: nextNodes, segments: nextSegs }
  }

  if (from.anchor.type === 'slab' && to.anchor.type === 'slab') {
    link(from.id, to.id)
    return { nodes: nextNodes, segments: nextSegs }
  }

  const wallNode = from.anchor.type === 'wall' ? from : to
  const slabNode = from.anchor.type === 'slab' ? from : to
  if (wallNode.anchor.type !== 'wall') return null

  let dropId = wallNode.id
  if (Math.abs(elevOf(wallNode) - SLAB_CONNECT_ELEVATION) > ELEV_EPS) {
    const drop = findOrAdd(
      floor,
      nextNodes,
      wallNode.anchor,
      SLAB_CONNECT_ELEVATION,
      makeNode,
    )
    nextNodes = drop.nodes
    link(wallNode.id, drop.node.id)
    dropId = drop.node.id
  }
  link(dropId, slabNode.id)
  return { nodes: nextNodes, segments: nextSegs }
}

export function removeMepNode<
  N extends MepNodeLike,
  S extends MepSegmentLike,
>(
  nodes: N[],
  segments: S[],
  nodeId: Id,
): { nodes: N[]; segments: S[] } {
  return {
    nodes: nodes.filter((n) => n.id !== nodeId),
    segments: segments.filter((s) => s.a !== nodeId && s.b !== nodeId),
  }
}

export function removeMepSegment<S extends MepSegmentLike>(
  segments: S[],
  segmentId: Id,
): S[] {
  return segments.filter((s) => s.id !== segmentId)
}

export function pruneOrphanMepNodes<
  N extends MepNodeLike,
  S extends MepSegmentLike,
>(nodes: N[], segments: S[], keepIds: Iterable<Id> = []): N[] {
  const used = new Set<Id>(keepIds)
  for (const s of segments) {
    used.add(s.a)
    used.add(s.b)
  }
  return nodes.filter(
    (n) =>
      used.has(n.id) ||
      ('fixture' in n && n.fixture) ||
      ('device' in n && n.device),
  )
}

export function previewMepPath(
  floor: Floor,
  from: MepNodeLike,
  toAnchor: MepAnchor,
  toElevation: number | undefined,
): Array<{ x: number; y: number }> {
  const a = nodePlanPoint(floor, from)
  const b = mepPoint(floor, toAnchor)
  if (!a || !b) return []
  const fromWall = wallAnchor(from.anchor)
  const toWall = wallAnchor(toAnchor)
  if (fromWall && toWall) {
    if (fromWall.wallId === toWall.wallId) return [a, b]
    const wallA = floor.walls.find((w) => w.id === fromWall.wallId)
    const wallB = floor.walls.find((w) => w.id === toWall.wallId)
    if (wallA && wallB) {
      const shared = wallsShareVertex(floor, wallA, wallB)
      if (shared) {
        const corner = mepPoint(floor, {
          type: 'wall',
          wallId: fromWall.wallId,
          offset: shared.offsetA,
        })
        if (corner) return [a, corner, b]
      }
    }
  }
  void toElevation
  return [a, b]
}

export function segmentEmbed(
  floor: Floor,
  a: MepNodeLike,
  b: MepNodeLike,
): 'wall' | 'slab' | 'mixed' {
  const aWall = wallAnchor(a.anchor)
  const bWall = wallAnchor(b.anchor)
  if (aWall && bWall) {
    if (aWall.wallId === bWall.wallId) return 'wall'
    const wallA = floor.walls.find((w) => w.id === aWall.wallId)
    const wallB = floor.walls.find((w) => w.id === bWall.wallId)
    if (wallA && wallB && wallsShareVertex(floor, wallA, wallB)) return 'wall'
    return 'slab'
  }
  if (a.anchor.type === 'slab' && b.anchor.type === 'slab') return 'slab'
  return 'mixed'
}

export function segmentLength(
  floor: Floor,
  a: MepNodeLike,
  b: MepNodeLike,
): number {
  const pa = nodePlanPoint(floor, a)
  const pb = nodePlanPoint(floor, b)
  if (!pa || !pb) return 0
  const plan = Math.hypot(pb.x - pa.x, pb.y - pa.y)
  const dz = elevOf(b) - elevOf(a)
  return Math.hypot(plan, dz)
}

function remapAnchor(anchor: MepAnchor, wallMap: Map<string, string>): MepAnchor {
  if (anchor.type === 'slab') return { ...anchor }
  const wallId = wallMap.get(anchor.wallId)
  if (!wallId) return { type: 'slab', x: 0, y: 0 }
  return { ...anchor, wallId }
}

function remapPipeNetwork(
  net: PipeNetwork,
  wallMap: Map<string, string>,
  floor: Floor,
  fallbackToSlab: boolean,
): PipeNetwork {
  const nodeMap = new Map<string, string>()
  const nodes: PipeNode[] = net.nodes.map((n) => {
    const id = createId('pn')
    nodeMap.set(n.id, id)
    let anchor = n.anchor
    if (anchor.type === 'wall') {
      const mapped = wallMap.get(anchor.wallId)
      if (mapped) {
        anchor = { ...anchor, wallId: mapped }
      } else if (fallbackToSlab) {
        const p = mepPoint(floor, anchor) ?? { x: 0, y: 0 }
        anchor = { type: 'slab', x: p.x, y: p.y }
      } else {
        anchor = remapAnchor(anchor, wallMap)
      }
    } else {
      anchor = { ...anchor }
    }
    return { ...n, id, anchor }
  })
  const segments: PipeSegment[] = net.segments
    .map((s) => {
      const a = nodeMap.get(s.a)
      const b = nodeMap.get(s.b)
      if (!a || !b) return null
      return { ...s, id: createId('ps'), a, b }
    })
    .filter((s): s is PipeSegment => s !== null)
  return { nodes, segments }
}

function remapCableNetwork(
  net: CableNetwork,
  wallMap: Map<string, string>,
  floor: Floor,
  fallbackToSlab: boolean,
): CableNetwork {
  const nodeMap = new Map<string, string>()
  const nodes: ElectricalNode[] = net.nodes.map((n) => {
    const id = createId('en')
    nodeMap.set(n.id, id)
    let anchor = n.anchor
    if (anchor.type === 'wall') {
      const mapped = wallMap.get(anchor.wallId)
      if (mapped) {
        anchor = { ...anchor, wallId: mapped }
      } else if (fallbackToSlab) {
        const p = mepPoint(floor, anchor) ?? { x: 0, y: 0 }
        anchor = { type: 'slab', x: p.x, y: p.y }
      }
    } else {
      anchor = { ...anchor }
    }
    return { ...n, id, anchor }
  })
  const segments: CableSegment[] = net.segments
    .map((s) => {
      const a = nodeMap.get(s.a)
      const b = nodeMap.get(s.b)
      if (!a || !b) return null
      return { ...s, id: createId('cs'), a, b }
    })
    .filter((s): s is CableSegment => s !== null)
  return { nodes, segments }
}

export function copyPipeNetwork(
  source: Floor,
  wallMap: Map<string, string> | null,
): PipeNetwork {
  const net = ensurePipeNetwork(source.pipes)
  if (!wallMap) {
    return remapPipeNetwork(net, new Map(), source, true)
  }
  return remapPipeNetwork(net, wallMap, source, true)
}

export function copyCableNetwork(
  source: Floor,
  wallMap: Map<string, string> | null,
): CableNetwork {
  const net = ensureCableNetwork(source.cables)
  if (!wallMap) {
    return remapCableNetwork(net, new Map(), source, true)
  }
  return remapCableNetwork(net, wallMap, source, true)
}

function reassignNodesAfterSplit<N extends MepNodeLike>(
  _floor: Floor,
  nodes: N[],
  oldWallId: Id,
  wall1: Wall,
  wall2: Wall,
  splitOffsetFromA: number,
): N[] {
  return nodes.map((n) => {
    if (n.anchor.type !== 'wall' || n.anchor.wallId !== oldWallId) return n
    if (n.anchor.offset <= splitOffsetFromA + 1e-6) {
      return { ...n, anchor: { ...n.anchor, wallId: wall1.id } }
    }
    return {
      ...n,
      anchor: {
        type: 'wall',
        wallId: wall2.id,
        offset: n.anchor.offset - splitOffsetFromA,
      },
    }
  })
}

export function reassignMepAfterWallSplit(
  floor: Floor,
  oldWallId: Id,
  wall1: Wall,
  wall2: Wall,
  splitOffsetFromA: number,
): Floor {
  const pipes = ensurePipeNetwork(floor.pipes)
  const cables = ensureCableNetwork(floor.cables)
  return {
    ...floor,
    pipes: {
      ...pipes,
      nodes: reassignNodesAfterSplit(
        floor,
        pipes.nodes,
        oldWallId,
        wall1,
        wall2,
        splitOffsetFromA,
      ),
    },
    cables: {
      ...cables,
      nodes: reassignNodesAfterSplit(
        floor,
        cables.nodes,
        oldWallId,
        wall1,
        wall2,
        splitOffsetFromA,
      ),
    },
  }
}

function detachNodesFromWall<N extends MepNodeLike>(
  floor: Floor,
  nodes: N[],
  wallId: Id,
): N[] {
  return nodes.map((n) => {
    if (n.anchor.type !== 'wall' || n.anchor.wallId !== wallId) return n
    const p = mepPoint(floor, n.anchor)
    if (!p) return { ...n, anchor: { type: 'slab', x: 0, y: 0 } }
    return { ...n, anchor: { type: 'slab', x: p.x, y: p.y } }
  })
}

export function detachMepFromWall(floor: Floor, wallId: Id): Floor {
  const pipes = ensurePipeNetwork(floor.pipes)
  const cables = ensureCableNetwork(floor.cables)
  return {
    ...floor,
    pipes: { ...pipes, nodes: detachNodesFromWall(floor, pipes.nodes, wallId) },
    cables: {
      ...cables,
      nodes: detachNodesFromWall(floor, cables.nodes, wallId),
    },
  }
}

export function makePipeNode(
  anchor: MepAnchor,
  elevation?: number,
  fixture?: PipeNode['fixture'],
): PipeNode {
  return {
    id: createId('pn'),
    anchor,
    elevation: anchor.type === 'wall' ? elevation : undefined,
    fixture,
  }
}

export function makePipeSegment(
  a: Id,
  b: Id,
  medium: PipeSegment['medium'],
  diameterMm: number,
): PipeSegment {
  return { id: createId('ps'), a, b, medium, diameterMm }
}

export function makeElectricalNode(
  anchor: MepAnchor,
  elevation?: number,
  device?: ElectricalNode['device'],
  extra?: Pick<ElectricalNode, 'side' | 'width' | 'height' | 'depth'>,
): ElectricalNode {
  return {
    id: createId('en'),
    anchor,
    elevation: anchor.type === 'wall' ? elevation : undefined,
    device,
    ...extra,
  }
}

export function makeCableSegment(
  a: Id,
  b: Id,
  sectionMm2: number,
): CableSegment {
  return { id: createId('cs'), a, b, sectionMm2 }
}

export function slabWorldY(floor: Floor): number {
  const slab = Math.max(0.05, floor.slabThickness ?? 0.2)
  return floor.elevation - slab / 2
}

export function wallNodeWorldY(floor: Floor, node: MepNodeLike): number {
  if (node.anchor.type === 'slab') return slabWorldY(floor)
  return floor.elevation + elevOf(node)
}

export { samePlanPoint }
