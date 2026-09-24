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
  /**
   * Cut faces: free wall ends and opening reveals
   * (jambs / sill / head for door, window, passage).
   */
  cut?: MaterialRef | null
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
  /** Finish on vertical faces of the slab well (stair cut). */
  material?: MaterialRef | null
}

/**
 * Free rectangular floor plate (slab region without walls).
 * Axis-aligned in plan; extruded with the story's slab thickness.
 */
export interface FloorPlate {
  id: Id
  /** Center X in plan, meters */
  x: number
  /** Center Y in plan, meters */
  y: number
  width: number
  depth: number
  /** Top-surface finish (paint / properties). */
  material?: MaterialRef | null
}

/** Terrain level vs. a normal story with walls/slab. */
export type FloorKind = 'ground' | 'story'

/**
 * Per-floor 3D visibility (floor tab cycles these):
 * - solid — fully opaque
 * - ghost — translucent
 * - hidden — not rendered
 */
export type FloorVisibility = 'solid' | 'ghost' | 'hidden'

export const FLOOR_VISIBILITY_CYCLE: FloorVisibility[] = [
  'solid',
  'ghost',
  'hidden',
]

/** Migrate older boolean `visible` and normalize unknown values. */
export function normalizeFloorVisibility(value: unknown): FloorVisibility {
  if (value === false || value === 'hidden') return 'hidden'
  if (value === 'ghost') return 'ghost'
  return 'solid'
}

export function cycleFloorVisibility(value: FloorVisibility): FloorVisibility {
  const i = FLOOR_VISIBILITY_CYCLE.indexOf(value)
  return FLOOR_VISIBILITY_CYCLE[(i + 1) % FLOOR_VISIBILITY_CYCLE.length]!
}

export function isFloorRendered(value: FloorVisibility): boolean {
  return value !== 'hidden'
}

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
   * 3D visibility. Controlled by the button on the floor tab.
   */
  visible: FloorVisibility
  vertices: Vertex[]
  walls: Wall[]
  constraints: Constraint[]
  openings: Opening[]
  slabOpenings: SlabOpening[]
  /** Free floor plates (slab without walls). */
  plates?: FloorPlate[]
  /** Room key (closed wall cycle) → floor finish. */
  roomFloorMaterials?: Record<string, MaterialRef>
  /** Placed 3D objects (furniture / props) on this floor. */
  objects?: PlacedObject[]
}

/** Reference to a mesh asset; binaries live outside project JSON. */
export type ModelRef =
  | { source: 'catalog'; assetId: string; objectId?: string }
  | { source: 'nasa'; assetId: string; objectId?: string }
  | {
      source: 'library'
      library: 'polyPizza' | 'smithsonian' | 'sketchfab' | 'polyHaven'
      id: string
      /** Optional cached CDN / download hint. */
      glbUrl?: string
      /** Sub-object inside a multi-model glTF (`name:…` / `index:…`). */
      objectId?: string
    }
  | { source: 'local'; localId: string; objectId?: string }
  | { source: 'url'; url: string; license?: string; objectId?: string }

export interface ModelAttribution {
  author: string
  license: string
  url?: string
}

/** Per-material paint / texture / PBR override (mirrors collection appearance). */
export type ObjectMaterialOverride = {
  /** Multiply tint on albedo (`#rrggbb`). */
  tint?: string
  /** Replace maps with ambientCG material. */
  material?: MaterialRef | null
  /** 0…1 scalar (multiplies roughnessMap when present). */
  roughness?: number
  /** 0…1 scalar (multiplies metalnessMap when present). */
  metalness?: number
  emissive?: string
  emissiveIntensity?: number
  /** 0…1; enables transparency when < 1. */
  opacity?: number
  envMapIntensity?: number
  /** Uniform normal map strength. */
  normalScale?: number
  aoMapIntensity?: number
}

/** Visual overrides applied when rendering a placed GLB. */
export type ObjectAppearance = ObjectMaterialOverride & {
  slots?: Record<string, ObjectMaterialOverride>
}

/** Instance of a 3D model on a floor (plan XZ → world XZ, Y up). */
export interface PlacedObject {
  id: Id
  model: ModelRef
  /** Plan X (meters) */
  x: number
  /** Plan Y → world Z (meters) */
  y: number
  /** Height above floor slab (meters) */
  elevation: number
  /** Euler rotation, radians */
  rotationX: number
  rotationY: number
  rotationZ: number
  /** Non-uniform scale */
  scaleX: number
  scaleY: number
  scaleZ: number
  /**
   * Local model bbox size (meters) before instance scale.
   * Used for AABB snap / flush. From collection calibration.
   */
  sizeX: number
  sizeY: number
  sizeZ: number
  /**
   * Measured plan AABB half-extents (meters), same as 3D world AABB on XZ.
   * planHalfY corresponds to world |Z| extent. Source of truth for 2D draw.
   */
  planHalfX: number
  planHalfY: number
  attribution?: ModelAttribution
  /** Paint / texture overrides from collection or per-instance edit. */
  appearance?: ObjectAppearance
  /**
   * Pose time within the model's GLTF animation clips (seconds).
   * Only meaningful when animationDuration > 0.
   */
  animationTime?: number
  /** Longest clip duration in seconds; set when the GLB is first resolved. */
  animationDuration?: number
}

/** Plan AABB half-extents from local size × scale × yaw (estimate). */
export function estimatePlanHalf(o: {
  sizeX: number
  sizeZ: number
  scaleX: number
  scaleZ: number
  rotationY: number
}): { x: number; y: number } {
  const hx = Math.max(0.05, (Math.abs(o.sizeX) * Math.abs(o.scaleX)) / 2)
  const hz = Math.max(0.05, (Math.abs(o.sizeZ) * Math.abs(o.scaleZ)) / 2)
  const c = Math.cos(o.rotationY)
  const s = Math.sin(o.rotationY)
  return {
    x: Math.abs(hx * c) + Math.abs(hz * s),
    y: Math.abs(hx * s) + Math.abs(hz * c),
  }
}

/** Normalize legacy placed objects (uniform `scale`, missing elevation/axes). */
export function normalizePlacedObject(
  raw: PlacedObject | (Partial<PlacedObject> & { scale?: number }),
): PlacedObject {
  const legacy = (raw as { scale?: number }).scale
  const s = raw.scaleX ?? legacy ?? 1
  const sizeX = raw.sizeX ?? 1
  const sizeY = raw.sizeY ?? 1
  const sizeZ = raw.sizeZ ?? 1
  const scaleX = raw.scaleX ?? s
  const scaleY = raw.scaleY ?? s
  const scaleZ = raw.scaleZ ?? s
  const rotationY = raw.rotationY ?? 0
  const estimated = estimatePlanHalf({
    sizeX,
    sizeZ,
    scaleX,
    scaleZ,
    rotationY,
  })
  return {
    id: raw.id!,
    model: raw.model!,
    x: raw.x ?? 0,
    y: raw.y ?? 0,
    elevation: raw.elevation ?? 0,
    rotationX: raw.rotationX ?? 0,
    rotationY,
    rotationZ: raw.rotationZ ?? 0,
    scaleX,
    scaleY,
    scaleZ,
    sizeX,
    sizeY,
    sizeZ,
    planHalfX: raw.planHalfX ?? estimated.x,
    planHalfY: raw.planHalfY ?? estimated.y,
    attribution: raw.attribution,
    appearance: raw.appearance,
    animationTime: raw.animationTime,
    animationDuration: raw.animationDuration,
  }
}

export type TransformGizmoMode = 'translate' | 'rotate' | 'scale'

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
  | 'floor'
  | 'placeObject'
  | 'lockLength'
  | 'lockPoint'
  | 'horizontal'
  | 'vertical'
  | 'wallDistance'

export type ViewMode = '2d' | '3d'
export type SceneMode = 'interior' | 'exterior' | 'visit' | 'paint'

/**
 * FreeCAD-style workbench: swaps the left tool rail and gates tools / view.
 * - draft: floor plan (walls, openings, constraints)
 * - paint: materials brush in 3D
 * - furnish: place / edit 3D objects
 */
export type Workbench = 'draft' | 'paint' | 'furnish'

export const DRAFT_TOOLS: readonly Tool[] = [
  'select',
  'wall',
  'door',
  'passage',
  'window',
  'stair',
  'floor',
  'lockLength',
  'lockPoint',
  'horizontal',
  'vertical',
  'wallDistance',
]

export const FURNISH_TOOLS: readonly Tool[] = ['select', 'placeObject']

export function toolsForWorkbench(workbench: Workbench): readonly Tool[] {
  switch (workbench) {
    case 'draft':
      return DRAFT_TOOLS
    case 'furnish':
      return FURNISH_TOOLS
    case 'paint':
      return ['select']
  }
}

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
  /** Unused legacy field (kept for store compatibility) */
  shadowSoftness: number
  /** Cast / receive shadows */
  shadowsEnabled: boolean
  /** Soft contact shadows on the ground plane */
  contactShadows: boolean
  /** ACES tone-mapping exposure */
  exposure: number
  /** N8AO intensity (0 = off) */
  aoIntensity: number
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
  aoIntensity: 1.2,
  vignetteDarkness: 0.35,
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
  | { kind: 'floorPlate'; id: Id }
  | { kind: 'object'; id: Id }
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

export function isFloorPlateTool(tool: Tool): boolean {
  return tool === 'floor'
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

export function isFloorPlateSelected(selection: Selection, id: Id): boolean {
  return selection?.kind === 'floorPlate' && selection.id === id
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

export function isObjectSelected(selection: Selection, id: Id): boolean {
  return selection?.kind === 'object' && selection.id === id
}

export function selectedObjectId(selection: Selection): Id | null {
  return selection?.kind === 'object' ? selection.id : null
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
    visible: 'solid',
    vertices: [],
    walls: [],
    constraints: [],
    openings: [],
    slabOpenings: [],
    plates: [],
    objects: [],
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
    visible: normalizeFloorVisibility(f.visible),
  }))
  const existing = normalized.find(isGroundFloor)
  const stories = normalized.filter(isStoryFloor)
  if (existing) {
    return [
      {
        ...existing,
        name: existing.name || 'Земля',
        height: 0,
        visible: normalizeFloorVisibility(existing.visible),
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
        visible: normalizeFloorVisibility(f.visible),
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
    visible: normalizeFloorVisibility(floor.visible),
    slabThickness:
      kind === 'ground'
        ? 0.05
        : Math.max(0.05, Math.min(1, floor.slabThickness ?? 0.2)),
    openings: wallOpenings,
    slabOpenings: migratedSlabs,
    plates: floor.plates ?? [],
    objects: (floor.objects ?? []).map((o) =>
      normalizePlacedObject(o as PlacedObject & { scale?: number }),
    ),
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
