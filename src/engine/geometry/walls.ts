import type { Constraint, Floor, Id, Vertex, Wall } from '../types'
import { createId } from '../types'
import { reassignMepAfterWallSplit, detachMepFromWall } from './mep'
import { reassignOpeningsAfterSplit, removeOpeningsForWall } from './openings'

export const SNAP_GRID = 0.25
export const VERTEX_HIT_RADIUS = 0.2
export const EDGE_HIT_RADIUS = 0.22
/** Ignore edge hits this close to an endpoint (prefer vertex snap). */
const EDGE_END_MARGIN = 0.1

export function snapToGrid(value: number, grid = SNAP_GRID): number {
  return Math.round(value / grid) * grid
}

export function findVertexNear(
  floor: Floor,
  x: number,
  y: number,
  radius = VERTEX_HIT_RADIUS,
): Vertex | undefined {
  let best: Vertex | undefined
  let bestDist = radius
  for (const v of floor.vertices) {
    const d = Math.hypot(v.x - x, v.y - y)
    if (d <= bestDist) {
      best = v
      bestDist = d
    }
  }
  return best
}

export function projectOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number; t: number; dist: number } {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-18) {
    return { x: x1, y: y1, t: 0, dist: Math.hypot(px - x1, py - y1) }
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const x = x1 + t * dx
  const y = y1 + t * dy
  return { x, y, t, dist: Math.hypot(px - x, py - y) }
}

/** Hit distance for mid-edge snap: at least half thickness so thick walls are clickable. */
export function wallEdgeHitThreshold(wall: Wall, base = EDGE_HIT_RADIUS): number {
  return Math.max(base, wall.thickness / 2 + 0.06)
}

export function findWallEdgeNear(
  floor: Floor,
  x: number,
  y: number,
  threshold?: number,
): { wall: Wall; x: number; y: number; t: number } | undefined {
  let best: { wall: Wall; x: number; y: number; t: number; dist: number } | undefined
  for (const wall of floor.walls) {
    const a = floor.vertices.find((v) => v.id === wall.a)
    const b = floor.vertices.find((v) => v.id === wall.b)
    if (!a || !b) continue
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < EDGE_END_MARGIN * 2) continue
    const proj = projectOnSegment(x, y, a.x, a.y, b.x, b.y)
    const along = proj.t * len
    if (along < EDGE_END_MARGIN || along > len - EDGE_END_MARGIN) continue
    const maxDist = threshold ?? wallEdgeHitThreshold(wall)
    if (proj.dist > maxDist) continue
    if (!best || proj.dist < best.dist) {
      best = { wall, x: proj.x, y: proj.y, t: proj.t, dist: proj.dist }
    }
  }
  return best
    ? { wall: best.wall, x: best.x, y: best.y, t: best.t }
    : undefined
}

/** Replace all references to `fromId` with `toId` (walls + constraints). */
export function remapVertexId(floor: Floor, fromId: Id, toId: Id): Floor {
  if (fromId === toId) return floor
  const walls = floor.walls.map((w) => ({
    ...w,
    a: w.a === fromId ? toId : w.a,
    b: w.b === fromId ? toId : w.b,
  })).filter((w) => w.a !== w.b)

  const constraints = floor.constraints
    .map((c): Constraint | null => {
      if (c.type === 'fixedPosition') {
        if (c.vertexId === fromId) return { ...c, vertexId: toId }
        return c
      }
      if (c.type === 'coincident') {
        const vertexA = c.vertexA === fromId ? toId : c.vertexA
        const vertexB = c.vertexB === fromId ? toId : c.vertexB
        if (vertexA === vertexB) return null
        return { ...c, vertexA, vertexB }
      }
      if (c.type === 'vertexDistance') {
        const vertexA = c.vertexA === fromId ? toId : c.vertexA
        const vertexB = c.vertexB === fromId ? toId : c.vertexB
        if (vertexA === vertexB) return null
        return { ...c, vertexA, vertexB }
      }
      if (c.type === 'pointsHorizontal' || c.type === 'pointsVertical') {
        const vertexIds = [
          ...new Set(c.vertexIds.map((id) => (id === fromId ? toId : id))),
        ]
        if (vertexIds.length < 2) return null
        return { ...c, vertexIds }
      }
      if (c.type === 'pointOnWall') {
        const vertexId = c.vertexId === fromId ? toId : c.vertexId
        return { ...c, vertexId }
      }
      return c
    })
    .filter((c): c is Constraint => c !== null)

  return pruneOrphanVertices({
    ...floor,
    walls,
    vertices: floor.vertices.filter((v) => v.id !== fromId),
    constraints,
  })
}

/**
 * Merge two vertices into one. Keeps `keepId`, removes `removeId`,
 * retargets walls/constraints. By default the survivor moves to the midpoint.
 */
export function mergeVertices(
  floor: Floor,
  keepId: Id,
  removeId: Id,
  opts?: { position?: 'keep' | 'mid' },
): Floor {
  if (keepId === removeId) return floor
  const keep = floor.vertices.find((v) => v.id === keepId)
  const remove = floor.vertices.find((v) => v.id === removeId)
  if (!keep || !remove) return floor

  let next = floor
  if ((opts?.position ?? 'mid') === 'mid') {
    const x = (keep.x + remove.x) / 2
    const y = (keep.y + remove.y) / 2
    next = {
      ...floor,
      vertices: floor.vertices.map((v) =>
        v.id === keepId ? { ...v, x, y } : v,
      ),
    }
  }
  return remapVertexId(next, removeId, keepId)
}

/**
 * Ensure joint vertices that coincide geometrically are the same id,
 * and that every shared joint has an explicit coincident constraint
 * between the wall endpoint roles is represented by shared identity.
 * Also adds coincident constraints for any remaining duplicate-position pairs
 * that belong to connected wall clusters within snap radius.
 */
export function ensureConnectedVerticesCoincident(floor: Floor): Floor {
  let next = floor
  // Merge vertices that sit on top of each other
  let merged = true
  while (merged) {
    merged = false
    const verts = next.vertices
    for (let i = 0; i < verts.length; i++) {
      for (let j = i + 1; j < verts.length; j++) {
        const a = verts[i]
        const b = verts[j]
        if (Math.hypot(a.x - b.x, a.y - b.y) <= VERTEX_HIT_RADIUS) {
          // Prefer keeping the one used by more walls
          const useA =
            next.walls.filter((w) => w.a === a.id || w.b === a.id).length >=
            next.walls.filter((w) => w.a === b.id || w.b === b.id).length
          next = mergeVertices(next, useA ? a.id : b.id, useA ? b.id : a.id, {
            position: 'keep',
          })
          merged = true
          break
        }
      }
      if (merged) break
    }
  }

  // Connected walls share endpoint vertex ids — coincidence is by identity.
  return next
}

/**
 * Split wall at a point on its segment. Returns the junction vertex.
 * Transfers H/V to both halves; fixedLength → two lengths by segment size;
 * wallDistance refs retarget to the longer half.
 */
export function splitWallAt(
  floor: Floor,
  wallId: Id,
  x: number,
  y: number,
): { floor: Floor; vertex: Vertex } | null {
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return null
  const a = floor.vertices.find((v) => v.id === wall.a)
  const b = floor.vertices.find((v) => v.id === wall.b)
  if (!a || !b) return null

  const proj = projectOnSegment(x, y, a.x, a.y, b.x, b.y)
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (proj.t * len < EDGE_END_MARGIN || (1 - proj.t) * len < EDGE_END_MARGIN) {
    // Too close to end — use existing endpoint
    const end = proj.t < 0.5 ? a : b
    return { floor, vertex: end }
  }

  // Reuse nearby vertex if any
  const near = findVertexNear(floor, proj.x, proj.y, VERTEX_HIT_RADIUS * 0.75)
  const vertex: Vertex = near ?? { id: createId('v'), x: proj.x, y: proj.y }
  let vertices = near ? floor.vertices : [...floor.vertices, vertex]

  const wall1: Wall = {
    id: createId('wall'),
    a: wall.a,
    b: vertex.id,
    thickness: wall.thickness,
  }
  const wall2: Wall = {
    id: createId('wall'),
    a: vertex.id,
    b: wall.b,
    thickness: wall.thickness,
  }

  const len1 = Math.hypot(vertex.x - a.x, vertex.y - a.y)
  const len2 = Math.hypot(b.x - vertex.x, b.y - vertex.y)
  const longerId = len1 >= len2 ? wall1.id : wall2.id

  const constraints: Constraint[] = []
  for (const c of floor.constraints) {
    if (
      (c.type === 'fixedLength' ||
        c.type === 'horizontal' ||
        c.type === 'vertical') &&
      c.wallId === wallId
    ) {
      if (c.type === 'fixedLength') {
        const total = c.length
        const ratio = len > 1e-9 ? len1 / len : 0.5
        constraints.push({
          id: createId('c'),
          type: 'fixedLength',
          wallId: wall1.id,
          length: Math.max(0.05, total * ratio),
        })
        constraints.push({
          id: createId('c'),
          type: 'fixedLength',
          wallId: wall2.id,
          length: Math.max(0.05, total * (1 - ratio)),
        })
      } else {
        constraints.push({ ...c, id: createId('c'), wallId: wall1.id })
        constraints.push({ ...c, id: createId('c'), wallId: wall2.id })
      }
      continue
    }
    if (c.type === 'wallDistance') {
      let wallA = c.wallA
      let wallB = c.wallB
      if (wallA === wallId) wallA = longerId
      if (wallB === wallId) wallB = longerId
      if (wallA === wallB) continue
      constraints.push({ ...c, wallA, wallB })
      continue
    }
    if (c.type === 'pointOnWall' && c.wallId === wallId) {
      const on1 = c.vertexId === wall1.a || c.vertexId === wall1.b
      const on2 = c.vertexId === wall2.a || c.vertexId === wall2.b
      let nextWallId = longerId
      if (on1 && !on2) nextWallId = wall1.id
      else if (on2 && !on1) nextWallId = wall2.id
      constraints.push({ ...c, wallId: nextWallId })
      continue
    }
    constraints.push(c)
  }

  const walls = floor.walls.filter((w) => w.id !== wallId).concat([wall1, wall2])
  let next: Floor = {
    ...floor,
    vertices,
    walls,
    constraints,
  }
  next = reassignOpeningsAfterSplit(next, wallId, wall1, wall2, len1)
  next = reassignMepAfterWallSplit(next, wallId, wall1, wall2, len1)
  next = ensureConnectedVerticesCoincident(next)
  const v = next.vertices.find((p) => p.id === vertex.id) ?? vertex
  return { floor: next, vertex: v }
}

/**
 * Resolve a click to a wall endpoint: existing vertex, mid-edge split, or new point.
 */
export function resolveWallEndpoint(
  floor: Floor,
  x: number,
  y: number,
  snapGrid = true,
): { floor: Floor; vertex: Vertex; created: boolean; kind: 'vertex' | 'edge' | 'new' } {
  const existing = findVertexNear(floor, x, y)
  if (existing) {
    return { floor, vertex: existing, created: false, kind: 'vertex' }
  }

  // Prefer mid-edge attach before grid snap — grid often pulls the click off the wall.
  const edge = findWallEdgeNear(floor, x, y)
  if (edge) {
    const split = splitWallAt(floor, edge.wall.id, edge.x, edge.y)
    if (split) {
      return {
        floor: split.floor,
        vertex: split.vertex,
        created: true,
        kind: 'edge',
      }
    }
  }

  const sx = snapGrid ? snapToGrid(x) : x
  const sy = snapGrid ? snapToGrid(y) : y
  if (sx !== x || sy !== y) {
    const afterSnap = findVertexNear(floor, sx, sy)
    if (afterSnap) {
      return { floor, vertex: afterSnap, created: false, kind: 'vertex' }
    }
    // Generous re-check: snapped point may sit on the wall face / near centerline
    const edge2 = findWallEdgeNear(floor, sx, sy)
    if (edge2) {
      const split = splitWallAt(floor, edge2.wall.id, edge2.x, edge2.y)
      if (split) {
        return {
          floor: split.floor,
          vertex: split.vertex,
          created: true,
          kind: 'edge',
        }
      }
    }
    // If raw click projected onto a wall within a looser band, still attach
    // (grid snap moved away from the wall along its normal).
    const loose = findWallEdgeNear(floor, x, y, EDGE_HIT_RADIUS * 2)
    if (loose) {
      const split = splitWallAt(floor, loose.wall.id, loose.x, loose.y)
      if (split) {
        return {
          floor: split.floor,
          vertex: split.vertex,
          created: true,
          kind: 'edge',
        }
      }
    }
  }

  const vertex: Vertex = { id: createId('v'), x: sx, y: sy }
  return {
    floor: { ...floor, vertices: [...floor.vertices, vertex] },
    vertex,
    created: true,
    kind: 'new',
  }
}

export function getOrCreateVertex(
  floor: Floor,
  x: number,
  y: number,
  snap = true,
): { floor: Floor; vertex: Vertex; created: boolean } {
  const r = resolveWallEndpoint(floor, x, y, snap)
  return { floor: r.floor, vertex: r.vertex, created: r.created }
}

export function addWallBetween(
  floor: Floor,
  aId: Id,
  bId: Id,
  thickness = 0.2,
): Floor | null {
  if (aId === bId) return null
  const exists = floor.walls.some(
    (w) => (w.a === aId && w.b === bId) || (w.a === bId && w.b === aId),
  )
  if (exists) return null
  const wall: Wall = { id: createId('wall'), a: aId, b: bId, thickness }
  let next: Floor = { ...floor, walls: [...floor.walls, wall] }
  // Connected walls share endpoint vertices ⇒ same point (coincident by id).
  // Record explicit coincident only if somehow duplicated — normalize first.
  next = ensureConnectedVerticesCoincident(next)
  return next
}

export function pruneOrphanVertices(floor: Floor): Floor {
  const used = new Set<Id>()
  for (const w of floor.walls) {
    used.add(w.a)
    used.add(w.b)
  }
  for (const c of floor.constraints) {
    if (c.type === 'fixedPosition') used.add(c.vertexId)
    if (c.type === 'pointOnWall') used.add(c.vertexId)
    if (c.type === 'coincident') {
      used.add(c.vertexA)
      used.add(c.vertexB)
    }
  }
  return {
    ...floor,
    vertices: floor.vertices.filter((v) => used.has(v.id)),
  }
}

export function removeWall(floor: Floor, wallId: Id): Floor {
  const detached = detachMepFromWall(floor, wallId)
  const next: Floor = removeOpeningsForWall(
    {
      ...detached,
      walls: floor.walls.filter((w) => w.id !== wallId),
      constraints: floor.constraints.filter((c) => {
        if (c.type === 'fixedLength' || c.type === 'horizontal' || c.type === 'vertical') {
          return c.wallId !== wallId
        }
        if (c.type === 'wallDistance') {
          return c.wallA !== wallId && c.wallB !== wallId
        }
        if (c.type === 'pointOnWall') {
          return c.wallId !== wallId
        }
        return true
      }),
    },
    wallId,
  )
  return pruneOrphanVertices(next)
}

export function removeVertex(floor: Floor, vertexId: Id): Floor {
  const wallIds = floor.walls
    .filter((w) => w.a === vertexId || w.b === vertexId)
    .map((w) => w.id)
  let next = floor
  for (const id of wallIds) {
    next = removeWall(next, id)
  }
  return {
    ...next,
    vertices: next.vertices.filter((v) => v.id !== vertexId),
    constraints: next.constraints
      .map((c) => {
        if (c.type === 'fixedPosition') {
          return c.vertexId === vertexId ? null : c
        }
        if (c.type === 'pointsHorizontal' || c.type === 'pointsVertical') {
          const vertexIds = c.vertexIds.filter((id) => id !== vertexId)
          if (vertexIds.length < 2) return null
          return { ...c, vertexIds }
        }
        if (c.type === 'vertexDistance') {
          return c.vertexA === vertexId || c.vertexB === vertexId ? null : c
        }
        if (c.type === 'coincident') {
          return c.vertexA === vertexId || c.vertexB === vertexId ? null : c
        }
        if (c.type === 'pointOnWall') {
          return c.vertexId === vertexId ? null : c
        }
        return c
      })
      .filter((c): c is NonNullable<typeof c> => c !== null),
  }
}

export function wallMidpoint(floor: Floor, wall: Wall): { x: number; y: number } | null {
  const a = floor.vertices.find((v) => v.id === wall.a)
  const b = floor.vertices.find((v) => v.id === wall.b)
  if (!a || !b) return null
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function hitWall(
  floor: Floor,
  x: number,
  y: number,
  threshold = 0.15,
): Wall | undefined {
  let best: Wall | undefined
  let bestDist = threshold
  for (const wall of floor.walls) {
    const a = floor.vertices.find((v) => v.id === wall.a)
    const b = floor.vertices.find((v) => v.id === wall.b)
    if (!a || !b) continue
    const proj = projectOnSegment(x, y, a.x, a.y, b.x, b.y)
    if (proj.dist < bestDist) {
      best = wall
      bestDist = proj.dist
    }
  }
  return best
}

/** Degree of a vertex (number of incident walls). */
export function vertexWallDegree(floor: Floor, vertexId: Id): number {
  return floor.walls.filter((w) => w.a === vertexId || w.b === vertexId).length
}

export function wallsShareVertex(floor: Floor, wallA: Id, wallB: Id): Id | null {
  const a = floor.walls.find((w) => w.id === wallA)
  const b = floor.walls.find((w) => w.id === wallB)
  if (!a || !b) return null
  if (a.a === b.a || a.a === b.b) return a.a
  if (a.b === b.a || a.b === b.b) return a.b
  return null
}
