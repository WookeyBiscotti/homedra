import { describe, expect, it } from 'vitest'
import { applyFloorCopy } from '../copyFloor'
import {
  createEmptyFloor,
  emptyCableNetwork,
  type Floor,
  type PipeNode,
  type PipeSegment,
} from '../types'
import { splitWallAt, removeWall } from './walls'
import {
  connectMepNodes,
  copyPipeNetwork,
  devicePlanPoint,
  findWallCenterlineNear,
  makeElectricalNode,
  makePipeNode,
  placeElectricalDevice,
  relocateMepNode,
  makePipeSegment,
  resolveMepEndpoint,
  sameUndirected,
  splitMepSegment,
  wallSideAt,
} from './mep'

function LFloor(): Floor {
  const v1 = { id: 'v1', x: 0, y: 0 }
  const v2 = { id: 'v2', x: 4, y: 0 }
  const v3 = { id: 'v3', x: 4, y: 3 }
  return {
    ...createEmptyFloor('t'),
    vertices: [v1, v2, v3],
    walls: [
      { id: 'w1', a: 'v1', b: 'v2', thickness: 0.2 },
      { id: 'w2', a: 'v2', b: 'v3', thickness: 0.2 },
    ],
  }
}

function pipeFns(medium: PipeSegment['medium'] = 'coldWater', d = 20) {
  return {
    makeNode: (anchor: PipeNode['anchor'], elevation?: number) =>
      makePipeNode(anchor, elevation),
    makeSegment: (a: string, b: string) => makePipeSegment(a, b, medium, d),
  }
}

describe('mep', () => {
  it('snaps a click on wall thickness to a wall anchor', () => {
    const floor = LFloor()
    const { makeNode, makeSegment } = pipeFns()
    const resolved = resolveMepEndpoint(
      floor,
      [],
      [],
      2,
      0.08,
      0.3,
      makeNode,
      makeSegment,
    )
    expect(resolved.kind).toBe('wall')
    expect(resolved.node.anchor.type).toBe('wall')
    if (resolved.node.anchor.type === 'wall') {
      expect(resolved.node.anchor.wallId).toBe('w1')
      expect(resolved.node.anchor.offset).toBeCloseTo(2, 1)
    }
    expect(resolved.node.elevation).toBe(0.3)
  })

  it('snaps away from walls onto the slab grid', () => {
    const floor = LFloor()
    const { makeNode, makeSegment } = pipeFns()
    const resolved = resolveMepEndpoint(
      floor,
      [],
      [],
      1.1,
      1.1,
      0.3,
      makeNode,
      makeSegment,
    )
    expect(resolved.kind).toBe('slab')
    expect(resolved.node.anchor.type).toBe('slab')
    if (resolved.node.anchor.type === 'slab') {
      expect(resolved.node.anchor.x).toBe(1)
      expect(resolved.node.anchor.y).toBe(1)
    }
  })

  it('inserts a corner node when connecting adjacent walls', () => {
    const floor = LFloor()
    const { makeNode, makeSegment } = pipeFns()
    const a = makePipeNode({ type: 'wall', wallId: 'w1', offset: 1 }, 0.3)
    const b = makePipeNode({ type: 'wall', wallId: 'w2', offset: 1 }, 0.3)
    const linked = connectMepNodes(
      floor,
      [a, b],
      [],
      a.id,
      b.id,
      makeNode,
      makeSegment,
    )
    expect(linked).not.toBeNull()
    expect(linked!.nodes.length).toBe(3)
    expect(linked!.segments.length).toBe(2)
    const corner = linked!.nodes.find((n) => n.id !== a.id && n.id !== b.id)
    expect(corner?.anchor.type).toBe('wall')
    if (corner?.anchor.type === 'wall') {
      expect(corner.anchor.wallId).toBe('w1')
      expect(corner.anchor.offset).toBeCloseTo(4, 5)
    }
  })

  it('drops into the slab when connecting a wall node to a slab node', () => {
    const floor = LFloor()
    const { makeNode, makeSegment } = pipeFns()
    const wall = makePipeNode({ type: 'wall', wallId: 'w1', offset: 2 }, 0.3)
    const slab = makePipeNode({ type: 'slab', x: 1, y: 1 })
    const linked = connectMepNodes(
      floor,
      [wall, slab],
      [],
      wall.id,
      slab.id,
      makeNode,
      makeSegment,
    )
    expect(linked).not.toBeNull()
    const drop = linked!.nodes.find(
      (n) =>
        n.id !== wall.id &&
        n.id !== slab.id &&
        n.anchor.type === 'wall' &&
        n.elevation === 0,
    )
    expect(drop).toBeTruthy()
    expect(linked!.segments.length).toBe(2)
  })

  it('creates a riser at the same wall offset with a new elevation', () => {
    const floor = LFloor()
    const { makeNode, makeSegment } = pipeFns()
    const low = makePipeNode({ type: 'wall', wallId: 'w1', offset: 2 }, 0.1)
    const resolved = resolveMepEndpoint(
      floor,
      [low],
      [],
      2,
      0,
      1.2,
      makeNode,
      makeSegment,
    )
    expect(resolved.created).toBe(true)
    expect(resolved.node.elevation).toBe(1.2)
    expect(resolved.node.id).not.toBe(low.id)
    if (resolved.node.anchor.type === 'wall') {
      expect(resolved.node.anchor.offset).toBeCloseTo(2, 1)
    }
  })

  it('splits a segment and rejects a duplicate edge', () => {
    const floor = LFloor()
    const { makeNode, makeSegment } = pipeFns()
    const a = makePipeNode({ type: 'slab', x: 0, y: 1 })
    const b = makePipeNode({ type: 'slab', x: 2, y: 1 })
    const seg = makePipeSegment(a.id, b.id, 'coldWater', 20)
    const split = splitMepSegment(
      floor,
      [a, b],
      [seg],
      seg.id,
      1,
      1,
      0,
      makeNode,
      makeSegment,
    )
    expect(split).not.toBeNull()
    expect(split!.nodes).toHaveLength(3)
    expect(split!.segments).toHaveLength(2)
    expect(sameUndirected(split!.segments, a.id, split!.node.id)).toBe(true)

    const again = connectMepNodes(
      floor,
      split!.nodes,
      split!.segments,
      a.id,
      split!.node.id,
      makeNode,
      makeSegment,
    )
    expect(again!.segments).toHaveLength(2)
  })

  it('rejects a self-loop', () => {
    const floor = LFloor()
    const { makeNode, makeSegment } = pipeFns()
    const a = makePipeNode({ type: 'slab', x: 0, y: 1 })
    expect(
      connectMepNodes(floor, [a], [], a.id, a.id, makeNode, makeSegment),
    ).toBeNull()
  })

  it('remaps wall anchors after a wall split', () => {
    const floor = LFloor()
    const node = makePipeNode({ type: 'wall', wallId: 'w1', offset: 3 }, 0.3)
    const withPipe: Floor = {
      ...floor,
      pipes: { nodes: [node], segments: [] },
    }
    const split = splitWallAt(withPipe, 'w1', 2, 0)
    expect(split).not.toBeNull()
    const moved = split!.floor.pipes?.nodes[0]
    expect(moved?.anchor.type).toBe('wall')
    if (moved?.anchor.type === 'wall') {
      expect(moved.anchor.wallId).not.toBe('w1')
      expect(moved.anchor.offset).toBeCloseTo(1, 5)
    }
  })

  it('converts wall anchors to slab when the wall is deleted', () => {
    const floor = LFloor()
    const node = makePipeNode({ type: 'wall', wallId: 'w1', offset: 2 }, 0.3)
    const withPipe: Floor = {
      ...floor,
      pipes: { nodes: [node], segments: [] },
    }
    const next = removeWall(withPipe, 'w1')
    expect(next.pipes?.nodes[0]?.anchor.type).toBe('slab')
    if (next.pipes?.nodes[0]?.anchor.type === 'slab') {
      expect(next.pipes.nodes[0].anchor.x).toBeCloseTo(2, 5)
      expect(next.pipes.nodes[0].anchor.y).toBeCloseTo(0, 5)
    }
  })

  it('copies a pipe network and remaps wall ids', () => {
    const source = LFloor()
    const a = makePipeNode({ type: 'wall', wallId: 'w1', offset: 1 }, 0.3)
    const b = makePipeNode({ type: 'slab', x: 1, y: 1 })
    source.pipes = {
      nodes: [a, b],
      segments: [makePipeSegment(a.id, b.id, 'hotWater', 20)],
    }
    const target = createEmptyFloor('Этаж 2', 2.8, 2.8)
    const copied = applyFloorCopy(target, source, {
      walls: true,
      constraints: false,
      doors: false,
      windows: false,
      passages: false,
      stairs: false,
      plates: false,
      pipes: true,
      cables: false,
    })
    expect(copied.pipes?.nodes).toHaveLength(2)
    expect(copied.pipes?.segments).toHaveLength(1)
    const wallNode = copied.pipes!.nodes.find((n) => n.anchor.type === 'wall')
    expect(wallNode?.anchor.type).toBe('wall')
    if (wallNode?.anchor.type === 'wall') {
      expect(copied.walls.some((w) => w.id === wallNode.anchor.wallId)).toBe(
        true,
      )
      expect(wallNode.anchor.wallId).not.toBe('w1')
    }
    expect(copied.pipes!.nodes[0].id).not.toBe(a.id)
  })

  it('finds a wall along its full length including endpoints', () => {
    const floor = LFloor()
    const end = findWallCenterlineNear(floor, 0, 0.04)
    expect(end?.wall.id).toBe('w1')
    expect(end?.offset).toBeCloseTo(0, 5)
    const mid = findWallCenterlineNear(floor, 2, 0)
    expect(mid?.wall.id).toBe('w1')
  })

  it('copyPipeNetwork without walls falls back to slab anchors', () => {
    const source = LFloor()
    const a = makePipeNode({ type: 'wall', wallId: 'w1', offset: 2 }, 0.3)
    source.pipes = { nodes: [a], segments: [] }
    const net = copyPipeNetwork(source, null)
    expect(net.nodes[0]?.anchor.type).toBe('slab')
  })

  it('slides a wall node along its wall and drops to slab when pulled away', () => {
    const floor = LFloor()
    const node = makePipeNode({ type: 'wall', wallId: 'w1', offset: 1 }, 0.3)
    const along = relocateMepNode(floor, node, 3, 0.05, 0.4)
    expect(along.anchor.type).toBe('wall')
    if (along.anchor.type === 'wall') {
      expect(along.anchor.wallId).toBe('w1')
      expect(along.anchor.offset).toBeCloseTo(3, 1)
    }
    expect(along.elevation).toBe(0.4)

    const dropped = relocateMepNode(floor, node, 1, 1.5)
    expect(dropped.anchor.type).toBe('slab')
    if (dropped.anchor.type === 'slab') {
      expect(dropped.anchor.x).toBe(1)
      expect(dropped.anchor.y).toBe(1.5)
    }
  })

  it('picks the wall face from the click side', () => {
    const floor = LFloor()
    const wall = floor.walls[0]!
    expect(wallSideAt(floor, wall, 2, 0.1)).toBe('pos')
    expect(wallSideAt(floor, wall, 2, -0.1)).toBe('neg')
  })

  it('places outlets on opposite faces as separate devices', () => {
    const floor = LFloor()
    const first = placeElectricalDevice(
      floor,
      emptyCableNetwork(),
      2,
      0.08,
      0.3,
      'outlet',
    )
    expect(first).not.toBeNull()
    expect(first!.node.side).toBe('pos')
    const second = placeElectricalDevice(
      floor,
      { nodes: first!.nodes, segments: first!.segments },
      2,
      -0.08,
      0.3,
      'switch',
    )
    expect(second).not.toBeNull()
    expect(second!.nodes).toHaveLength(2)
    expect(second!.node.side).toBe('neg')
    expect(second!.node.device).toBe('switch')
    const pos = devicePlanPoint(floor, first!.node)
    const neg = devicePlanPoint(floor, second!.node)
    expect(pos).not.toBeNull()
    expect(neg).not.toBeNull()
    expect(pos!.y).toBeGreaterThan(neg!.y)
  })

  it('flips a device face when dragged across the wall', () => {
    const floor = LFloor()
    const node = makeElectricalNode(
      { type: 'wall', wallId: 'w1', offset: 2 },
      0.3,
      'outlet',
      { side: 'pos', width: 0.086, height: 0.086, depth: 0.014 },
    )
    const flipped = relocateMepNode(floor, node, 2, -0.12)
    expect(flipped.side).toBe('neg')
    expect(flipped.anchor.type).toBe('wall')
  })
})
