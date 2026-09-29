import {
  copyCableNetwork,
  copyPipeNetwork,
} from './geometry/mep'
import {
  createId,
  emptyCableNetwork,
  emptyPipeNetwork,
  type Constraint,
  type Floor,
  type FloorPlate,
  type Opening,
  type OpeningKind,
  type SlabOpening,
  type Vertex,
  type PlacedTile,
  type PlacedMolding,
  type VolumeBox,
  type VolumeCutout,
  type Wall,
} from './types'

export interface CopyFloorOptions {
  walls: boolean
  constraints: boolean
  doors: boolean
  windows: boolean
  passages: boolean
  stairs: boolean
  plates: boolean
  boxes: boolean
  pipes: boolean
  cables: boolean
  tiles: boolean
  moldings: boolean
}

export const DEFAULT_COPY_FLOOR_OPTIONS: CopyFloorOptions = {
  walls: true,
  constraints: true,
  doors: true,
  windows: true,
  passages: true,
  stairs: true,
  plates: true,
  boxes: true,
  pipes: true,
  cables: true,
  tiles: true,
  moldings: true,
}

function openingKindSelected(
  kind: OpeningKind,
  options: CopyFloorOptions,
): boolean {
  switch (kind) {
    case 'door':
      return options.doors
    case 'window':
      return options.windows
    case 'passage':
      return options.passages
  }
}

function remapConstraint(
  c: Constraint,
  vertexMap: Map<string, string>,
  wallMap: Map<string, string>,
): Constraint | null {
  const mapV = (id: string) => vertexMap.get(id)
  const mapW = (id: string) => wallMap.get(id)

  switch (c.type) {
    case 'fixedLength': {
      const wallId = mapW(c.wallId)
      if (!wallId) return null
      return { ...c, id: createId('c'), wallId }
    }
    case 'fixedPosition': {
      const vertexId = mapV(c.vertexId)
      if (!vertexId) return null
      return { ...c, id: createId('c'), vertexId }
    }
    case 'horizontal':
    case 'vertical': {
      const wallId = mapW(c.wallId)
      if (!wallId) return null
      return { ...c, id: createId('c'), wallId }
    }
    case 'wallDistance': {
      const wallA = mapW(c.wallA)
      const wallB = mapW(c.wallB)
      if (!wallA || !wallB) return null
      return { ...c, id: createId('c'), wallA, wallB }
    }
    case 'vertexDistance': {
      const vertexA = mapV(c.vertexA)
      const vertexB = mapV(c.vertexB)
      if (!vertexA || !vertexB) return null
      return { ...c, id: createId('c'), vertexA, vertexB }
    }
    case 'pointsHorizontal':
    case 'pointsVertical': {
      const vertexIds = c.vertexIds
        .map((id) => mapV(id))
        .filter((id): id is string => Boolean(id))
      if (vertexIds.length < 2) return null
      return { ...c, id: createId('c'), vertexIds }
    }
    case 'coincident': {
      const vertexA = mapV(c.vertexA)
      const vertexB = mapV(c.vertexB)
      if (!vertexA || !vertexB) return null
      return { ...c, id: createId('c'), vertexA, vertexB }
    }
    case 'pointOnWall': {
      const vertexId = mapV(c.vertexId)
      const wallId = mapW(c.wallId)
      if (!vertexId || !wallId) return null
      return { ...c, id: createId('c'), vertexId, wallId }
    }
  }
}

export function copyFloorNeedsWalls(options: CopyFloorOptions): boolean {
  return (
    options.walls ||
    options.constraints ||
    options.doors ||
    options.windows ||
    options.passages ||
    options.moldings
  )
}

/**
 * Copy selected geometry from `source` onto `target`, regenerating IDs.
 * Keeps target id/name/elevation/height.
 * Walls (vertices+walls) are copied whenever wall openings or constraints are
 * selected, since those depend on remapped wall/vertex IDs.
 * Stair slab openings and free floor plates copy independently of walls.
 */
export function applyFloorCopy(
  target: Floor,
  source: Floor,
  options: CopyFloorOptions,
): Floor {
  const wantsWallOpenings =
    options.doors || options.windows || options.passages
  const copyWalls = copyFloorNeedsWalls(options)

  const slabOpenings: SlabOpening[] = options.stairs
    ? (source.slabOpenings ?? []).map((o) => ({
        ...o,
        id: createId('sop'),
      }))
    : []

  const plates: FloorPlate[] = options.plates
    ? (source.plates ?? []).map((p) => ({
        ...p,
        id: createId('plt'),
      }))
    : []

  const boxIdMap = new Map<string, string>()
  const boxes: VolumeBox[] = options.boxes
    ? (source.boxes ?? []).map((b) => {
        const id = createId('box')
        boxIdMap.set(b.id, id)
        return { ...b, id }
      })
    : []
  const boxCutouts: VolumeCutout[] = options.boxes
    ? (source.boxCutouts ?? [])
        .map((c) => {
          const boxId = boxIdMap.get(c.boxId)
          if (!boxId) return null
          return { ...c, id: createId('cut'), boxId }
        })
        .filter((c): c is VolumeCutout => c !== null)
    : []

  const remapTiles = (wallMap: Map<string, string> | null): PlacedTile[] => {
    if (!options.tiles) return target.tiles ?? []
    const out: PlacedTile[] = []
    for (const t of source.tiles ?? []) {
      let surface = t.surface
      if (surface.type === 'wall') {
        const wallId = wallMap?.get(surface.wallId)
        if (!wallId) continue
        surface = { ...surface, wallId }
      } else if (surface.type === 'box') {
        const boxId = boxIdMap.get(surface.boxId)
        if (!boxId) continue
        surface = { ...surface, boxId }
      }
      const next: PlacedTile = {
        ...t,
        id: createId('tile'),
        material: { ...t.material },
        surface,
      }
      if (t.clip) next.clip = t.clip.map((p) => ({ ...p }))
      out.push(next)
    }
    return out
  }

  const remapMoldings = (
    wallMap: Map<string, string> | null,
  ): PlacedMolding[] => {
    if (!options.moldings) return target.moldings ?? []
    if (!wallMap) return target.moldings ?? []
    const out: PlacedMolding[] = []
    for (const m of source.moldings ?? []) {
      const wallId = wallMap.get(m.wallId)
      if (!wallId) continue
      out.push({
        ...m,
        id: createId('mold'),
        wallId,
        material: { ...m.material },
        profile: {
          vertices: m.profile.vertices.map((p) => ({ ...p })),
          segments: m.profile.segments.map((s) => ({ ...s })),
        },
      })
    }
    return out
  }

  if (!copyWalls) {
    return {
      ...target,
      slabOpenings: options.stairs ? slabOpenings : (target.slabOpenings ?? []),
      plates: options.plates ? plates : (target.plates ?? []),
      boxes: options.boxes ? boxes : (target.boxes ?? []),
      boxCutouts: options.boxes ? boxCutouts : (target.boxCutouts ?? []),
      tiles: remapTiles(null),
      moldings: target.moldings ?? [],
      pipes: options.pipes ? copyPipeNetwork(source, null) : (target.pipes ?? emptyPipeNetwork()),
      cables: options.cables
        ? copyCableNetwork(source, null)
        : (target.cables ?? emptyCableNetwork()),
    }
  }

  const vertexMap = new Map<string, string>()
  const wallMap = new Map<string, string>()

  const vertices: Vertex[] = source.vertices.map((v) => {
    const id = createId('v')
    vertexMap.set(v.id, id)
    return { id, x: v.x, y: v.y }
  })
  const walls: Wall[] = source.walls.map((w) => {
    const id = createId('wall')
    wallMap.set(w.id, id)
    const a = vertexMap.get(w.a)
    const b = vertexMap.get(w.b)
    if (!a || !b) {
      throw new Error('copyFloor: wall endpoints missing after remap')
    }
    return { id, a, b, thickness: w.thickness }
  })

  const constraints: Constraint[] = options.constraints
    ? source.constraints
        .map((c) => remapConstraint(c, vertexMap, wallMap))
        .filter((c): c is Constraint => c !== null)
    : []

  const openings: Opening[] = wantsWallOpenings
    ? (source.openings ?? [])
        .filter((o) => openingKindSelected(o.kind, options))
        .map((o) => {
          const wallId = wallMap.get(o.wallId)
          if (!wallId) return null
          return { ...o, id: createId('op'), wallId }
        })
        .filter((o): o is Opening => o !== null)
    : []

  return {
    ...target,
    vertices,
    walls,
    constraints,
    openings,
    slabOpenings: options.stairs ? slabOpenings : [],
    plates: options.plates ? plates : [],
    boxes: options.boxes ? boxes : [],
    boxCutouts: options.boxes ? boxCutouts : [],
    tiles: remapTiles(wallMap),
    moldings: remapMoldings(wallMap),
    pipes: options.pipes
      ? copyPipeNetwork(source, wallMap)
      : (target.pipes ?? emptyPipeNetwork()),
    cables: options.cables
      ? copyCableNetwork(source, wallMap)
      : (target.cables ?? emptyCableNetwork()),
  }
}
