export type Id = string

export interface Vertex {
  id: Id
  x: number
  y: number
}

/** PBR material reference (ambientCG asset; binary maps are not stored in JSON). */
export interface MaterialRef {
  source: 'ambientcg'
  assetId: string
  /** Meters per texture repeat (tile size). */
  tileSizeM: number
}

/** Side of a wall relative to direction a→b and its left-hand normal. */
export type WallSide = 'pos' | 'neg'

export interface WallMaterials {
  /** Side toward +normal (left of a→b). */
  pos?: MaterialRef | null
  /** Side toward −normal (right of a→b). */
  neg?: MaterialRef | null
}

export interface Wall {
  id: Id
  a: Id
  b: Id
  thickness: number
  materials?: WallMaterials
}

export type Constraint =
  | { id: Id; type: 'fixedLength'; wallId: Id; length: number }
  | { id: Id; type: 'fixedPosition'; vertexId: Id }
  | { id: Id; type: 'horizontal'; wallId: Id }
  | { id: Id; type: 'vertical'; wallId: Id }
  | {
      id: Id
      type: 'wallDistance'
      wallA: Id
      wallB: Id
      /** Distance between chosen faces, meters */
      distance: number
      face: 'center' | 'inner' | 'outer'
    }
  | {
      id: Id
      type: 'vertexDistance'
      vertexA: Id
      vertexB: Id
      /** Distance between chosen faces at vertices, meters */
      distance: number
      face: 'center' | 'inner' | 'outer'
    }
  | {
      id: Id
      type: 'pointsHorizontal'
      /** Points share the same Y */
      vertexIds: Id[]
    }
  | {
      id: Id
      type: 'pointsVertical'
      /** Points share the same X */
      vertexIds: Id[]
    }
  | {
      id: Id
      type: 'coincident'
      /** Two vertices locked to the same point (wall joint) */
      vertexA: Id
      vertexB: Id
    }
  | {
      id: Id
      type: 'pointOnWall'
      /** Vertex constrained to the wall centerline */
      vertexId: Id
      wallId: Id
    }

export type OpeningKind = 'door' | 'passage' | 'window'

export interface Opening {
  id: Id
  wallId: Id
  kind: OpeningKind
  /** Offset of opening center from wall vertex `a` along the wall, meters */
  offset: number
  width: number
  height: number
  /** Height of opening bottom from floor elevation, meters */
  sillHeight: number
}

/** Rectangular hole in the floor slab (e.g. stair well). Axis-aligned. */
export type SlabOpeningKind = 'stair'

export interface SlabOpening {
  id: Id
  kind: SlabOpeningKind
  /** Center X in plan, meters */
  x: number
  /** Center Y in plan, meters */
  y: number
  width: number
  depth: number
}

/** Terrain level vs. a normal story with walls/slab. */
export type FloorKind = 'ground' | 'story'

export interface Floor {
  id: Id
  name: string
  /** Terrain (`ground`) or building story (`story`). */
  kind: FloorKind
  elevation: number
  height: number
  /**
   * Thickness of the floor slab, meters.
   * Gap between the ceiling of the floor below and this floor's walking surface.
   * Unused for ground.
   */
  slabThickness: number
  /**
   * Show in 3D. Controlled by the checkbox on the floor tab.
   */
  visible: boolean
  vertices: Vertex[]
  walls: Wall[]
  constraints: Constraint[]
  openings: Opening[]
  slabOpenings: SlabOpening[]
  /** Room key (closed wall cycle) → floor finish. */
  roomFloorMaterials?: Record<string, MaterialRef>
}

export interface Building {
  id: Id
  name: string
  units: 'm'
  floors: Floor[]
}

export type Tool =
  | 'select'
  | 'wall'
  | 'door'
  | 'passage'
  | 'window'
  | 'stair'
  | 'lockLength'
  | 'lockPoint'
  | 'horizontal'
  | 'vertical'
  | 'wallDistance'

export type ViewMode = '2d' | '3d'
export type SceneMode = 'interior' | 'exterior' | 'visit' | 'paint'

/** Global / sun lighting for the 3D viewport (not part of building JSON). */
export interface LightingSettings {
  /** Hemisphere / ambient fill intensity */
  ambientIntensity: number
  /** Sun (directional) intensity */
  sunIntensity: number
  /** Azimuth degrees: 0 = +Z (север), 90 = +X (восток) */
  sunAzimuth: number
  /** Elevation degrees: 0 = горизонт, 90 = зенит */
  sunElevation: number
  /** Soft shadow penumbra size (drei SoftShadows / PCSS) */
  shadowSoftness: number
  /** Cast / receive shadows */
  shadowsEnabled: boolean
  /** Soft contact shadows on the ground plane */
  contactShadows: boolean
  /** ACES tone-mapping exposure */
  exposure: number
  /** N8AO intensity (0 = off) */
  aoIntensity: number
  /** Bloom intensity (0 = off) */
  bloomIntensity: number
  /** Vignette darkness (0 = off) */
  vignetteDarkness: number
  /** Sky / ground tint for hemisphere fill */
  skyColor: string
  groundColor: string
}

export const DEFAULT_LIGHTING: LightingSettings = {
  ambientIntensity: 0.45,
  sunIntensity: 1.35,
  sunAzimuth: 135,
  sunElevation: 48,
  shadowSoftness: 18,
  shadowsEnabled: true,
  contactShadows: true,
  exposure: 1.05,
  aoIntensity: 1.35,
  bloomIntensity: 0.35,
  vignetteDarkness: 0.4,
  skyColor: '#c8d9e8',
  groundColor: '#8a7a65',
}

/** Unit sun direction from azimuth + elevation (degrees). */
export function sunDirection(
  azimuthDeg: number,
  elevationDeg: number,
): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180
  const el = (elevationDeg * Math.PI) / 180
  const cosEl = Math.cos(el)
  return [cosEl * Math.sin(az), Math.sin(el), cosEl * Math.cos(az)]
}

export type Selection =
  | { kind: 'wall'; id: Id }
  | { kind: 'vertex'; id: Id }
  | { kind: 'opening'; id: Id }
  | { kind: 'slabOpening'; id: Id }
  | { kind: 'room'; key: string }
  | { kind: 'multi'; vertexIds: Id[]; wallIds: Id[] }
  | null

/** Wall opening tools (door / passage / window). */
export function isWallOpeningTool(tool: Tool): tool is OpeningKind {
  return tool === 'door' || tool === 'passage' || tool === 'window'
}

/** @deprecated use isWallOpeningTool — kept alias for older call sites */
export function isOpeningTool(tool: Tool): tool is OpeningKind {
  return isWallOpeningTool(tool)
}

export function isStairTool(tool: Tool): boolean {
  return tool === 'stair'
}

export function openingKindLabel(kind: OpeningKind): string {
  switch (kind) {
    case 'door':
      return 'Дверь'
    case 'passage':
      return 'Проём'
    case 'window':
      return 'Окно'
  }
}

export function slabOpeningKindLabel(kind: SlabOpeningKind): string {
  switch (kind) {
    case 'stair':
      return 'Проём лестницы'
  }
}

export function isVertexSelected(selection: Selection, id: Id): boolean {
  if (!selection) return false
  if (selection.kind === 'vertex') return selection.id === id
  if (selection.kind === 'multi') return selection.vertexIds.includes(id)
  return false
}

export function isWallSelected(selection: Selection, id: Id): boolean {
  if (!selection) return false
  if (selection.kind === 'wall') return selection.id === id
  if (selection.kind === 'multi') return selection.wallIds.includes(id)
  return false
}

export function selectedVertexIds(selection: Selection): Id[] {
  if (!selection) return []
  if (selection.kind === 'vertex') return [selection.id]
  if (selection.kind === 'multi') return selection.vertexIds
  if (selection.kind === 'wall') return []
  return []
}

export function selectedWallIds(selection: Selection): Id[] {
  if (!selection) return []
  if (selection.kind === 'wall') return [selection.id]
  if (selection.kind === 'multi') return selection.wallIds
  return []
}

export function isOpeningSelected(selection: Selection, id: Id): boolean {
  return selection?.kind === 'opening' && selection.id === id
}

export function isSlabOpeningSelected(selection: Selection, id: Id): boolean {
  return selection?.kind === 'slabOpening' && selection.id === id
}

export function selectedOpeningId(selection: Selection): Id | null {
  return selection?.kind === 'opening' ? selection.id : null
}

export function isRoomSelected(selection: Selection, key: string): boolean {
  return selection?.kind === 'room' && selection.key === key
}

export function selectedRoomKey(selection: Selection): string | null {
  return selection?.kind === 'room' ? selection.key : null
}

export function defaultMaterialRef(assetId: string, tileSizeM = 1.5): MaterialRef {
  return { source: 'ambientcg', assetId, tileSizeM }
}

export function createId(prefix = 'id'): Id {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function createEmptyFloor(
  name: string,
  elevation = 0,
  height = 2.8,
  kind: FloorKind = 'story',
): Floor {
  return {
    id: createId('floor'),
    name,
    kind,
    elevation,
    height,
    slabThickness: kind === 'ground' ? 0.05 : 0.2,
    visible: true,
    vertices: [],
    walls: [],
    constraints: [],
    openings: [],
    slabOpenings: [],
  }
}

export function createGroundFloor(elevation = 0): Floor {
  return createEmptyFloor('Земля', elevation, 0, 'ground')
}

export function isGroundFloor(floor: Floor): boolean {
  return floor.kind === 'ground'
}

export function isStoryFloor(floor: Floor): boolean {
  return floor.kind !== 'ground'
}

export function storyFloors(floors: Floor[]): Floor[] {
  return floors.filter(isStoryFloor)
}

export function groundFloor(floors: Floor[]): Floor | undefined {
  return floors.find(isGroundFloor)
}

/**
 * Ensure a single ground floor is first; migrate older projects without `kind`.
 * Story elevations are left intact (first story may sit above/below ground).
 */
export function ensureGroundFloor(floors: Floor[]): Floor[] {
  const normalized = floors.map((f) => ({
    ...f,
    kind: (f.kind ?? 'story') as FloorKind,
    visible: f.visible !== false,
  }))
  const existing = normalized.find(isGroundFloor)
  const stories = normalized.filter(isStoryFloor)
  if (existing) {
    return [
      {
        ...existing,
        name: existing.name || 'Земля',
        height: 0,
        visible: existing.visible !== false,
      },
      ...stories,
    ]
  }
  return [createGroundFloor(0), ...stories]
}

/**
 * Walking-surface elevations for stories:
 * - Ground elevation is independent (user-set).
 * - First story keeps its elevation (may differ from ground).
 * - story[i].elevation = story[i-1].elevation + story[i-1].height + story[i].slabThickness
 */
export function recalcFloorElevations(floors: Floor[]): Floor[] {
  const ordered = ensureGroundFloor(floors)
  let storyElev: number | null = null
  return ordered.map((f) => {
    if (isGroundFloor(f)) {
      return {
        ...f,
        kind: 'ground',
        height: 0,
        slabThickness: 0.05,
        elevation: f.elevation,
        visible: f.visible !== false,
      }
    }
    const slab = Math.max(0.05, Math.min(1, f.slabThickness ?? 0.2))
    if (storyElev === null) {
      storyElev = f.elevation
    } else {
      storyElev += slab
    }
    const next = {
      ...f,
      kind: 'story' as const,
      slabThickness: slab,
      elevation: storyElev,
    }
    storyElev += f.height
    return next
  })
}

/**
 * Normalize floors from older JSON: ensure openings/slabOpenings arrays,
 * migrate legacy wall openings with kind `stair` into slab openings.
 */
export function ensureFloorOpenings(floor: Floor): Floor {
  const rawOpenings = (floor.openings ?? []) as unknown as Array<
    Record<string, unknown>
  >
  const wallOpenings: Opening[] = []
  const migratedSlabs: SlabOpening[] = [...(floor.slabOpenings ?? [])]

  for (const raw of rawOpenings) {
    const kind = raw.kind as string
    if (kind === 'stair') {
      const wallId = raw.wallId as string
      const wall = floor.walls.find((w) => w.id === wallId)
      const a = wall && floor.vertices.find((v) => v.id === wall.a)
      const b = wall && floor.vertices.find((v) => v.id === wall.b)
      if (a && b && wall) {
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
        const ux = (b.x - a.x) / len
        const uy = (b.y - a.y) / len
        const offset = Number(raw.offset) || len / 2
        const width = Number(raw.width) || 0.9
        const cx = a.x + ux * offset
        const cy = a.y + uy * offset
        migratedSlabs.push({
          id: createId('sop'),
          kind: 'stair',
          x: cx,
          y: cy,
          width: Math.max(0.9, width),
          depth: 2.5,
        })
      }
      continue
    }
    if (kind === 'door' || kind === 'passage' || kind === 'window') {
      wallOpenings.push(raw as unknown as Opening)
    }
  }

  const kind: FloorKind = floor.kind === 'ground' ? 'ground' : 'story'
  return {
    ...floor,
    kind,
    visible: floor.visible !== false,
    slabThickness:
      kind === 'ground'
        ? 0.05
        : Math.max(0.05, Math.min(1, floor.slabThickness ?? 0.2)),
    openings: wallOpenings,
    slabOpenings: migratedSlabs,
  }
}

export function ensureBuildingOpenings(building: Building): Building {
  return {
    ...building,
    floors: recalcFloorElevations(
      ensureGroundFloor(building.floors.map(ensureFloorOpenings)),
    ),
  }
}

export function createEmptyBuilding(name = 'Новый проект'): Building {
  return {
    id: createId('building'),
    name,
    units: 'm',
    floors: [createGroundFloor(0), createEmptyFloor('Этаж 1', 0, 2.8)],
  }
}

export function wallLength(floor: Floor, wall: Wall): number {
  const a = floor.vertices.find((v) => v.id === wall.a)
  const b = floor.vertices.find((v) => v.id === wall.b)
  if (!a || !b) return 0
  return Math.hypot(b.x - a.x, b.y - a.y)
}
