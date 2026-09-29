export type Id = string

export interface Vertex {
  id: Id
  x: number
  y: number
}

/** Sub-rectangle of a material image (image space, top-left origin). */
export type TileTexRegion = {
  u0: number
  v0: number
  u1: number
  v1: number
}

/** PBR / albedo material reference. Binary maps stay in cache / IndexedDB. */
export interface MaterialRef {
  source: 'ambientcg' | 'polyhaven' | 'pixabay' | 'pexels' | 'custom'
  /** Catalog asset id, or IndexedDB id for a user texture. */
  assetId: string
  /** Meters per texture repeat (tile size). */
  tileSizeM: number
  /** Vertex displacement amplitude in meters when a height map is present. */
  displacementScale?: number
  /** Image URL for photo catalogs or a custom import from a link. */
  url?: string
  /** Display name. */
  name?: string
  /** Multiply tint on albedo (`#rrggbb`). */
  tint?: string
  /** 0…1 scalar (multiplies roughnessMap when present). */
  roughness?: number
  /** 0…1 scalar (multiplies metalnessMap when present). */
  metalness?: number
  /** Uniform normal map strength. */
  normalScale?: number
  aoMapIntensity?: number
  envMapIntensity?: number
  /**
   * Sub-rectangle of the imported image used as the finish
   * (image space, top-left origin). Full image when omitted.
   */
  texRegion?: TileTexRegion
}

const MATERIAL_LOOK_KEYS = [
  'tint',
  'roughness',
  'metalness',
  'normalScale',
  'aoMapIntensity',
  'envMapIntensity',
  'displacementScale',
] as const

/** Keep tuned PBR sliders when the user swaps the texture image. */
export function keepMaterialLook(
  from: MaterialRef | null | undefined,
  next: MaterialRef,
): MaterialRef {
  if (!from) return next
  const out: MaterialRef = { ...next }
  for (const key of MATERIAL_LOOK_KEYS) {
    const value = from[key]
    if (value !== undefined) Object.assign(out, { [key]: value })
  }
  return out
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

/**
 * Architectural volume (soffit / bulkhead / podium). Axis-aligned in plan.
 * Elevation is above the story walking surface.
 */
export interface VolumeBox {
  id: Id
  x: number
  y: number
  width: number
  depth: number
  /** Bottom above walking surface, meters */
  elevation: number
  height: number
  /** Outer faces (sides, top, bottom). */
  material?: MaterialRef | null
}

/**
 * Prism cutout subtracted from a volume box. Axis-aligned in plan.
 * Elevation / height are above the walking surface (same space as the box).
 */
export interface VolumeCutout {
  id: Id
  boxId: Id
  x: number
  y: number
  width: number
  depth: number
  elevation: number
  height: number
  /** Reveal faces of the cut. */
  material?: MaterialRef | null
}

/** Hidden MEP route: inside a wall or inside the floor slab. */
export type MepAnchor =
  | { type: 'wall'; wallId: Id; offset: number }
  | { type: 'slab'; x: number; y: number }

export type PipeMedium = 'coldWater' | 'hotWater' | 'sewage' | 'gas'
export type PipeFixtureKind = 'valve' | 'heater'
export type ElectricalDeviceKind = 'outlet' | 'switch' | 'panel'

export interface PipeNode {
  id: Id
  anchor: MepAnchor
  /** Height above walking surface; wall nodes only. */
  elevation?: number
  fixture?: PipeFixtureKind
}

export interface PipeSegment {
  id: Id
  a: Id
  b: Id
  medium: PipeMedium
  /** Outer diameter, millimeters. */
  diameterMm: number
}

export interface PipeNetwork {
  nodes: PipeNode[]
  segments: PipeSegment[]
}

export interface ElectricalNode {
  id: Id
  anchor: MepAnchor
  /** Height above walking surface; wall nodes only. */
  elevation?: number
  device?: ElectricalDeviceKind
  /** Wall face the device sits on (centerline left-hand normal = pos). */
  side?: WallSide
  /** Face width along the wall, meters. */
  width?: number
  /** Face height, meters. */
  height?: number
  /** How far the device sticks out of the wall, meters. */
  depth?: number
}

export interface CableSegment {
  id: Id
  a: Id
  b: Id
  /** Conductor cross-section, mm². */
  sectionMm2: number
}

export interface CableNetwork {
  nodes: ElectricalNode[]
  segments: CableSegment[]
}

export const PIPE_MEDIUM_META: Record<
  PipeMedium,
  { label: string; color: string; diameterMm: number; elevation: number }
> = {
  coldWater: {
    label: 'Холодная',
    color: '#2b6cb0',
    diameterMm: 20,
    elevation: 0.3,
  },
  hotWater: {
    label: 'Горячая',
    color: '#c53030',
    diameterMm: 20,
    elevation: 0.3,
  },
  sewage: {
    label: 'Канализация',
    color: '#744210',
    diameterMm: 50,
    elevation: 0.1,
  },
  gas: {
    label: 'Газ',
    color: '#d69e2e',
    diameterMm: 20,
    elevation: 0.3,
  },
}

export const CABLE_META = {
  label: 'Кабель',
  color: '#dd6b20',
  sectionMm2: 2.5,
  elevation: 0.3,
} as const

export const ELECTRICAL_DEVICE_ELEVATION: Record<ElectricalDeviceKind, number> =
  {
    outlet: 0.3,
    switch: 0.3,
    panel: 1.4,
  }

export const ELECTRICAL_DEVICE_SIZE: Record<
  ElectricalDeviceKind,
  { width: number; height: number; depth: number }
> = {
  outlet: { width: 0.086, height: 0.086, depth: 0.014 },
  switch: { width: 0.086, height: 0.086, depth: 0.014 },
  panel: { width: 0.28, height: 0.45, depth: 0.08 },
}

export function electricalDeviceSize(node: ElectricalNode): {
  width: number
  height: number
  depth: number
} {
  const fallback = node.device
    ? ELECTRICAL_DEVICE_SIZE[node.device]
    : { width: 0.045, height: 0.045, depth: 0.045 }
  return {
    width: node.width ?? fallback.width,
    height: node.height ?? fallback.height,
    depth: node.depth ?? fallback.depth,
  }
}

export function emptyPipeNetwork(): PipeNetwork {
  return { nodes: [], segments: [] }
}

export function emptyCableNetwork(): CableNetwork {
  return { nodes: [], segments: [] }
}

export function ensurePipeNetwork(
  raw?: PipeNetwork | null,
): PipeNetwork {
  return {
    nodes: [...(raw?.nodes ?? [])],
    segments: [...(raw?.segments ?? [])],
  }
}

export function ensureCableNetwork(
  raw?: CableNetwork | null,
): CableNetwork {
  return {
    nodes: [...(raw?.nodes ?? [])],
    segments: [...(raw?.segments ?? [])],
  }
}

export function pipeMediumLabel(medium: PipeMedium): string {
  return PIPE_MEDIUM_META[medium].label
}

export function pipeFixtureLabel(kind: PipeFixtureKind): string {
  return kind === 'valve' ? 'Перекрытие' : 'Нагреватель'
}

export function electricalDeviceLabel(kind: ElectricalDeviceKind): string {
  switch (kind) {
    case 'outlet':
      return 'Розетка'
    case 'switch':
      return 'Выключатель'
    case 'panel':
      return 'Щиток'
  }
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
  /** Architectural boxes (коробы). */
  boxes?: VolumeBox[]
  /** Cutouts subtracted from boxes. */
  boxCutouts?: VolumeCutout[]
  /** Discrete tiles laid on floors, walls, or box faces. */
  tiles?: PlacedTile[]
  /** Skirting boards / cove moldings along wall faces. */
  moldings?: PlacedMolding[]
  /** Room key (closed wall cycle) → floor finish. */
  roomFloorMaterials?: Record<string, MaterialRef>
  /** Room key → ceiling finish. */
  roomCeilingMaterials?: Record<string, MaterialRef>
  /** Placed 3D objects (furniture / props) on this floor. */
  objects?: PlacedObject[]
  /** Plumbing graph (water / sewage / gas). */
  pipes?: PipeNetwork
  /** Electrical graph (cables + devices). */
  cables?: CableNetwork
  landscapeTerrain?: LandscapeTerrain
  landscapePaint?: LandscapePaint
  plants?: LandscapePlant[]
  landscapeGrass?: LandscapeGrass
}

export type SculptMode = 'raise' | 'lower' | 'smooth' | 'flatten'

export interface LandscapePaint {
  layers: [
    MaterialRef | null,
    MaterialRef | null,
    MaterialRef | null,
    MaterialRef | null,
  ]
  /** RGBA splat (R/G/B = layers 1..3). Base64 of raw bytes or data URL. */
  splatPng?: string
  resolution: 256 | 512
}

/** SeedThree white-oak / controls.js friendly sliders. */
export interface PlantShape {
  /** Mature height, metres (`params.scale`, demo default 13). */
  height: number
  levels: number
  /** Weber–Penn crown: 0 conical … 1 spherical … 7 tend flame. */
  crownShape: number
  branchDensity: number
  branchAngle: number
  gnarliness: number
  trunks: number
  trunkThickness: number
  leafSize: number
  leavesPerBranch: number
  leafAngle: number
  leafStart: number
  leafSizeVar: number
  leafAlpha: number
  showLeaves: boolean
}

export interface LandscapePlant {
  id: Id
  species: string
  seed: number
  x: number
  y: number
  rotationY: number
  scale: number
  shape?: Partial<PlantShape>
}

/**
 * Meadow sliders in metres. Rendering uses the EZ-Tree demo tuft (`grass.glb`);
 * alpha/roughness match src/app/grass.js.
 */
export const LANDSCAPE_GRASS_DEFAULTS = {
  density: 8,
  height: 0.85,
  width: 1.75,
  color: '#6fa83c',
  seed: 1,
  alphaTest: 0.5,
  roughness: 1,
} as const

/** @deprecated Prefer LANDSCAPE_GRASS_DEFAULTS — kept for older imports. */
export const SEEDTHREE_GRASS_DEFAULTS = LANDSCAPE_GRASS_DEFAULTS

export interface LandscapeGrassLayer {
  id: Id
  name: string
  coveragePng?: string
  density: number
  height: number
  width: number
  color: string
  seed: number
}

/** One coverage + look per painted type. Legacy single-layer JSON is migrated. */
export interface LandscapeGrass {
  resolution: 256 | 512
  layers: LandscapeGrassLayer[]
}

export interface LandscapeTerrain {
  /** Int16 millimetres, little-endian, base64. 0 = ground.elevation. */
  heightPng?: string
  resolution: 128 | 256
  /** Plot width (plan X), meters. Legacy square plots used this for both axes. */
  size: number
  /** Plot depth (plan Y), meters. Defaults to `size`. */
  sizeY?: number
  originX: number
  originY: number
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
  /** Vertex displacement amplitude in meters. */
  displacementScale?: number
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

/** World size in meters after instance scale (local bbox × scale). */
export function placedObjectWorldSize(o: {
  sizeX: number
  sizeY: number
  sizeZ: number
  scaleX: number
  scaleY: number
  scaleZ: number
}): { x: number; y: number; z: number } {
  return {
    x: Math.abs(o.sizeX * o.scaleX),
    y: Math.abs(o.sizeY * o.scaleY),
    z: Math.abs(o.sizeZ * o.scaleZ),
  }
}

/** Instance scale that yields the requested world size on one axis. */
export function scaleForWorldSize(world: number, native: number): number {
  const n = Math.max(1e-6, Math.abs(native))
  const w = Number.isFinite(world) ? Math.abs(world) : n
  // Allow cm-authored GLBs (native ~10–100, scale ~0.01) — a 0.05 floor
  // made a 0.8 m cabin jump to 4 m and blocked shrinking it back.
  return Math.max(0.001, Math.min(20, w / n))
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

/** Offset so a copy does not sit on top of the original (matches snap grid). */
export const PLACED_OBJECT_COPY_OFFSET = 0.25

/** New instance with a fresh id; appearance is deep-cloned. */
export function clonePlacedObject(
  obj: PlacedObject,
  opts?: { offsetX?: number; offsetY?: number },
): PlacedObject {
  const offsetX = opts?.offsetX ?? PLACED_OBJECT_COPY_OFFSET
  const offsetY = opts?.offsetY ?? PLACED_OBJECT_COPY_OFFSET
  return {
    ...obj,
    id: createId('obj'),
    x: obj.x + offsetX,
    y: obj.y + offsetY,
    model: { ...obj.model },
    attribution: obj.attribution ? { ...obj.attribution } : undefined,
    appearance: obj.appearance ? structuredClone(obj.appearance) : undefined,
  }
}

export type TransformGizmoMode = 'translate' | 'rotate' | 'scale'

export interface Building {
  id: Id
  name: string
  units: 'm'
  floors: Floor[]
}

/** Face of an axis-aligned volume box. */
export type BoxFace = 'posX' | 'negX' | 'posY' | 'negY' | 'top' | 'bottom'

export type TileSurface =
  | { type: 'floor' }
  | { type: 'wall'; wallId: Id; side: WallSide }
  | { type: 'box'; boxId: Id; face: BoxFace }

export type TileFillPattern = 'straight' | 'offset' | 'horizontal' | 'vertical'

export function defaultTileTexRegion(): TileTexRegion {
  return { u0: 0, v0: 0, u1: 1, v1: 1 }
}

export function normalizeTileTexRegion(
  raw?: Partial<TileTexRegion> | null,
): TileTexRegion {
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
  const u0 = clamp01(Number(raw?.u0) || 0)
  const v0 = clamp01(Number(raw?.v0) || 0)
  const u1 = clamp01(raw?.u1 == null ? 1 : Number(raw.u1))
  const v1 = clamp01(raw?.v1 == null ? 1 : Number(raw.v1))
  const min = 0.04
  let a = Math.min(u0, u1)
  let b = Math.max(u0, u1)
  let c = Math.min(v0, v1)
  let d = Math.max(v0, v1)
  if (b - a < min) {
    const mid = (a + b) / 2
    a = Math.max(0, mid - min / 2)
    b = Math.min(1, a + min)
    a = Math.max(0, b - min)
  }
  if (d - c < min) {
    const mid = (c + d) / 2
    c = Math.max(0, mid - min / 2)
    d = Math.min(1, c + min)
    c = Math.max(0, d - min)
  }
  return { u0: a, v0: c, u1: b, v1: d }
}

export function isFullTexRegion(region?: TileTexRegion | null): boolean {
  if (!region) return true
  const r = normalizeTileTexRegion(region)
  return r.u0 <= 1e-4 && r.v0 <= 1e-4 && r.u1 >= 1 - 1e-4 && r.v1 >= 1 - 1e-4
}

/** Catalog / editor spec for a ceramic tile. */
export interface TileSpec {
  name: string
  /** Meters along local U. */
  width: number
  /** Meters along local V. */
  length: number
  /** Thickness outward from the host face, meters. */
  thickness: number
  material: MaterialRef
  /** Which part of the texture image is printed on the tile face. */
  texRegion?: TileTexRegion
}

/** One laid tile. Spec is snapshotted so the project stays self-contained. */
export interface PlacedTile extends TileSpec {
  id: Id
  surface: TileSurface
  /** Center in the host face UV. */
  u: number
  v: number
  /** 0 or π/2 (and 180/270 as multiples). */
  rotation: number
  groutM: number
  /** Local polygon after a cut; omitted = full rectangle. */
  clip?: Array<{ x: number; y: number }>
}

export const DEFAULT_TILE_GROUT_M = 0.002
export const DEFAULT_TILE_THICKNESS = 0.008
export const MIN_TILE_AREA = 0.002

export function defaultTileSpec(): TileSpec {
  return {
    name: '30×30',
    width: 0.3,
    length: 0.3,
    thickness: DEFAULT_TILE_THICKNESS,
    material: defaultMaterialRef('Tiles141', 0.3),
  }
}

export function normalizeTileRotation(radians: number): number {
  const step = Math.PI / 2
  const q = Math.round(radians / step)
  const wrapped = ((q % 4) + 4) % 4
  return wrapped * step
}

export function tileAxesSwapped(rotation: number): boolean {
  const q = Math.round(normalizeTileRotation(rotation) / (Math.PI / 2)) % 2
  return q === 1
}

export function sameTileSurface(a: TileSurface, b: TileSurface): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'floor') return true
  if (a.type === 'wall' && b.type === 'wall') {
    return a.wallId === b.wallId && a.side === b.side
  }
  if (a.type === 'box' && b.type === 'box') {
    return a.boxId === b.boxId && a.face === b.face
  }
  return false
}

export function normalizePlacedTile(
  raw: Partial<PlacedTile> & { id?: Id },
): PlacedTile {
  const surface: TileSurface =
    raw.surface?.type === 'wall'
      ? { type: 'wall', wallId: raw.surface.wallId, side: raw.surface.side }
      : raw.surface?.type === 'box'
        ? { type: 'box', boxId: raw.surface.boxId, face: raw.surface.face }
        : { type: 'floor' }
  return {
    id: raw.id ?? createId('tile'),
    name: (raw.name ?? 'Плитка').trim() || 'Плитка',
    width: Math.max(0.05, Number(raw.width) || 0.3),
    length: Math.max(0.05, Number(raw.length) || 0.3),
    thickness: Math.max(0.002, Math.min(0.08, Number(raw.thickness) || DEFAULT_TILE_THICKNESS)),
    material: raw.material ?? defaultMaterialRef('Tiles141', 0.3),
    surface,
    u: Number(raw.u) || 0,
    v: Number(raw.v) || 0,
    rotation: normalizeTileRotation(Number(raw.rotation) || 0),
    groutM: Math.max(0, Math.min(0.04, Number(raw.groutM) || DEFAULT_TILE_GROUT_M)),
    clip:
      Array.isArray(raw.clip) && raw.clip.length >= 3
        ? raw.clip.map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }))
        : undefined,
    texRegion: raw.texRegion ? normalizeTileTexRegion(raw.texRegion) : undefined,
  }
}

/** Плинтус (пол) или галтель (потолок). */
export type MoldingKind = 'skirting' | 'cove'

export type MoldingVertex = { x: number; y: number }

/**
 * DXF-style bulge on the segment from vertex i → (i+1)%n.
 * 0 = straight; nonzero = circular arc (tan(includedAngle/4), sign = side).
 */
export type MoldingSegment = { bulge: number }

/** Closed cross-section: N vertices and N segments. Units: meters. */
export type MoldingProfile = {
  vertices: MoldingVertex[]
  segments: MoldingSegment[]
}

/** Catalog / editor spec for a molding profile. */
export interface MoldingSpec {
  name: string
  kind: MoldingKind
  profile: MoldingProfile
  material: MaterialRef
}

/** One installed molding plank along a wall face interval. */
export interface PlacedMolding extends MoldingSpec {
  id: Id
  wallId: Id
  side: WallSide
  /** Along-face U of the start (meters from face origin). */
  s0: number
  /** Along-face U of the end. */
  s1: number
  /** Horizontal miter at start (radians from perpendicular cut). */
  miterStart?: number
  /** Horizontal miter at end. */
  miterEnd?: number
}

export function defaultMoldingProfile(kind: MoldingKind = 'skirting'): MoldingProfile {
  if (kind === 'cove') {
    // Small cove: 40×40 mm quarter-ish with a bulge on the hypotenuse.
    return {
      vertices: [
        { x: 0, y: 0 },
        { x: 0.04, y: 0 },
        { x: 0, y: 0.04 },
      ],
      segments: [{ bulge: 0 }, { bulge: -0.4142 }, { bulge: 0 }],
    }
  }
  // Simple rectangular skirting 12×60 mm.
  return {
    vertices: [
      { x: 0, y: 0 },
      { x: 0.012, y: 0 },
      { x: 0.012, y: 0.06 },
      { x: 0, y: 0.06 },
    ],
    segments: [{ bulge: 0 }, { bulge: 0 }, { bulge: 0 }, { bulge: 0 }],
  }
}

export function defaultMoldingSpec(kind: MoldingKind = 'skirting'): MoldingSpec {
  return {
    name: kind === 'cove' ? 'Галтель' : 'Плинтус',
    kind,
    profile: defaultMoldingProfile(kind),
    material: defaultMaterialRef('WoodFloor043', 0.4),
  }
}

export function normalizeMoldingProfile(
  raw: Partial<MoldingProfile> | null | undefined,
  kind: MoldingKind = 'skirting',
): MoldingProfile {
  const fallback = defaultMoldingProfile(kind)
  const verts = Array.isArray(raw?.vertices)
    ? raw!.vertices.map((p) => ({
        x: Number(p.x) || 0,
        y: Number(p.y) || 0,
      }))
    : fallback.vertices
  if (verts.length < 3) return fallback
  const segs = Array.isArray(raw?.segments) ? raw!.segments : []
  const segments: MoldingSegment[] = verts.map((_, i) => ({
    bulge: Number(segs[i]?.bulge) || 0,
  }))
  return { vertices: verts, segments }
}

export function normalizePlacedMolding(
  raw: Partial<PlacedMolding> & { id?: Id },
): PlacedMolding {
  const kind: MoldingKind = raw.kind === 'cove' ? 'cove' : 'skirting'
  const s0 = Number(raw.s0) || 0
  const s1 = Number(raw.s1) || 0
  return {
    id: raw.id ?? createId('mold'),
    name:
      (raw.name ?? (kind === 'cove' ? 'Галтель' : 'Плинтус')).trim() ||
      (kind === 'cove' ? 'Галтель' : 'Плинтус'),
    kind,
    profile: normalizeMoldingProfile(raw.profile, kind),
    material: raw.material ?? defaultMaterialRef('WoodFloor043', 0.4),
    wallId: raw.wallId ?? '',
    side: raw.side === 'neg' ? 'neg' : 'pos',
    s0: Math.min(s0, s1),
    s1: Math.max(s0, s1),
    miterStart:
      raw.miterStart !== undefined && Number.isFinite(Number(raw.miterStart))
        ? Number(raw.miterStart)
        : undefined,
    miterEnd:
      raw.miterEnd !== undefined && Number.isFinite(Number(raw.miterEnd))
        ? Number(raw.miterEnd)
        : undefined,
  }
}

export function moldingKindLabel(kind: MoldingKind): string {
  return kind === 'cove' ? 'Галтель' : 'Плинтус'
}

export function tileSurfaceLabel(surface: TileSurface): string {
  switch (surface.type) {
    case 'floor':
      return 'Пол'
    case 'wall':
      return 'Стена'
    case 'box':
      return 'Короб'
  }
}

export type Tool =
  | 'select'
  | 'wall'
  | 'door'
  | 'passage'
  | 'window'
  | 'stair'
  | 'floor'
  | 'box'
  | 'cutout'
  | 'placeTile'
  | 'fillTile'
  | 'cutTile'
  | 'placeMolding'
  | 'fillMolding'
  | 'placeObject'
  | 'lockLength'
  | 'lockPoint'
  | 'horizontal'
  | 'vertical'
  | 'wallDistance'
  | 'pipe'
  | 'pipeValve'
  | 'pipeHeater'
  | 'cable'
  | 'outlet'
  | 'switch'
  | 'panel'
  | 'sculptGround'
  | 'paintGround'
  | 'plant'
  | 'paintGrass'

export type ViewMode = '2d' | '3d'
export type SceneMode = 'interior' | 'exterior' | 'visit' | 'paint'

/**
 * FreeCAD-style workbench: swaps the left tool rail and gates tools / view.
 * - draft: floor plan (walls, openings, constraints)
 * - paint: materials brush in 3D
 * - furnish: place / edit 3D objects
 * - plumbing: pipes in walls / slab
 * - electrical: cables, outlets, switches, panels
 * - landscape: site sculpt, ground paint, plants, grass
 * - tiling: lay ceramic tiles on floors, walls, and boxes
 * - decor: skirting boards and cove moldings along wall edges
 */
export type Workbench =
  | 'draft'
  | 'paint'
  | 'furnish'
  | 'plumbing'
  | 'electrical'
  | 'landscape'
  | 'tiling'
  | 'decor'

export const DRAFT_TOOLS: readonly Tool[] = [
  'select',
  'wall',
  'door',
  'passage',
  'window',
  'stair',
  'floor',
  'box',
  'cutout',
  'lockLength',
  'lockPoint',
  'horizontal',
  'vertical',
  'wallDistance',
]

export const FURNISH_TOOLS: readonly Tool[] = ['select', 'placeObject']

export const PLUMBING_TOOLS: readonly Tool[] = [
  'select',
  'pipe',
  'pipeValve',
  'pipeHeater',
]

export const ELECTRICAL_TOOLS: readonly Tool[] = [
  'select',
  'cable',
  'outlet',
  'switch',
  'panel',
]

export const LANDSCAPE_TOOLS: readonly Tool[] = [
  'select',
  'sculptGround',
  'placeObject',
  'paintGround',
  'plant',
  'paintGrass',
]

export const TILING_TOOLS: readonly Tool[] = [
  'select',
  'placeTile',
  'fillTile',
  'cutTile',
]

export const DECOR_TOOLS: readonly Tool[] = [
  'select',
  'placeMolding',
  'fillMolding',
]

export function toolsForWorkbench(workbench: Workbench): readonly Tool[] {
  switch (workbench) {
    case 'draft':
      return DRAFT_TOOLS
    case 'furnish':
      return FURNISH_TOOLS
    case 'paint':
      return ['select']
    case 'plumbing':
      return PLUMBING_TOOLS
    case 'electrical':
      return ELECTRICAL_TOOLS
    case 'landscape':
      return LANDSCAPE_TOOLS
    case 'tiling':
      return TILING_TOOLS
    case 'decor':
      return DECOR_TOOLS
  }
}

export function isLandscapeTool(tool: Tool): boolean {
  return (
    tool === 'sculptGround' ||
    tool === 'paintGround' ||
    tool === 'plant' ||
    tool === 'paintGrass' ||
    tool === 'placeObject'
  )
}

export function isLandscapeWorkbench(workbench: Workbench): boolean {
  return workbench === 'landscape'
}

export function isPlumbingTool(tool: Tool): boolean {
  return (
    tool === 'pipe' || tool === 'pipeValve' || tool === 'pipeHeater'
  )
}

export function isElectricalTool(tool: Tool): boolean {
  return (
    tool === 'cable' ||
    tool === 'outlet' ||
    tool === 'switch' ||
    tool === 'panel'
  )
}

export function isMepDrawTool(tool: Tool): boolean {
  return tool === 'pipe' || tool === 'cable'
}

export function isMepFixtureTool(tool: Tool): boolean {
  return (
    tool === 'pipeValve' ||
    tool === 'pipeHeater' ||
    tool === 'outlet' ||
    tool === 'switch' ||
    tool === 'panel'
  )
}

export function isMepWorkbench(workbench: Workbench): boolean {
  return workbench === 'plumbing' || workbench === 'electrical'
}

export function isTilingTool(tool: Tool): boolean {
  return tool === 'placeTile' || tool === 'fillTile' || tool === 'cutTile'
}

export function isTilingWorkbench(workbench: Workbench): boolean {
  return workbench === 'tiling'
}

export function isDecorTool(tool: Tool): boolean {
  return tool === 'placeMolding' || tool === 'fillMolding'
}

export function isDecorWorkbench(workbench: Workbench): boolean {
  return workbench === 'decor'
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
  | { kind: 'volumeBox'; id: Id }
  | { kind: 'volumeCutout'; id: Id }
  | { kind: 'tile'; id: Id }
  | { kind: 'tiles'; ids: Id[] }
  | { kind: 'molding'; id: Id }
  | { kind: 'moldings'; ids: Id[] }
  | { kind: 'object'; id: Id }
  | { kind: 'plant'; id: Id }
  | { kind: 'pipeSegment'; id: Id }
  | { kind: 'pipeNode'; id: Id }
  | { kind: 'cableSegment'; id: Id }
  | { kind: 'electricalNode'; id: Id }
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

export function isVolumeBoxTool(tool: Tool): boolean {
  return tool === 'box'
}

export function isVolumeCutoutTool(tool: Tool): boolean {
  return tool === 'cutout'
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

export function isVolumeBoxSelected(selection: Selection, id: Id): boolean {
  return selection?.kind === 'volumeBox' && selection.id === id
}

export function isVolumeCutoutSelected(selection: Selection, id: Id): boolean {
  return selection?.kind === 'volumeCutout' && selection.id === id
}

export function isTileSelected(selection: Selection, id: Id): boolean {
  if (!selection) return false
  if (selection.kind === 'tile') return selection.id === id
  if (selection.kind === 'tiles') return selection.ids.includes(id)
  return false
}

export function selectedTileIds(selection: Selection): Id[] {
  if (!selection) return []
  if (selection.kind === 'tile') return [selection.id]
  if (selection.kind === 'tiles') return selection.ids
  return []
}

export function selectedTileId(selection: Selection): Id | null {
  return selectedTileIds(selection)[0] ?? null
}

export function tileSelectionOf(ids: Id[]): Selection {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return null
  if (unique.length === 1) return { kind: 'tile', id: unique[0]! }
  return { kind: 'tiles', ids: unique }
}

export function isMoldingSelected(selection: Selection, id: Id): boolean {
  if (!selection) return false
  if (selection.kind === 'molding') return selection.id === id
  if (selection.kind === 'moldings') return selection.ids.includes(id)
  return false
}

export function selectedMoldingIds(selection: Selection): Id[] {
  if (!selection) return []
  if (selection.kind === 'molding') return [selection.id]
  if (selection.kind === 'moldings') return selection.ids
  return []
}

export function selectedMoldingId(selection: Selection): Id | null {
  return selectedMoldingIds(selection)[0] ?? null
}

export function moldingSelectionOf(ids: Id[]): Selection {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return null
  if (unique.length === 1) return { kind: 'molding', id: unique[0]! }
  return { kind: 'moldings', ids: unique }
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

export function isPipeSegmentSelected(selection: Selection, id: Id): boolean {
  return selection?.kind === 'pipeSegment' && selection.id === id
}

export function isPipeNodeSelected(selection: Selection, id: Id): boolean {
  return selection?.kind === 'pipeNode' && selection.id === id
}

export function isCableSegmentSelected(selection: Selection, id: Id): boolean {
  return selection?.kind === 'cableSegment' && selection.id === id
}

export function isElectricalNodeSelected(selection: Selection, id: Id): boolean {
  return selection?.kind === 'electricalNode' && selection.id === id
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
    boxes: [],
    boxCutouts: [],
    tiles: [],
    moldings: [],
    objects: [],
    pipes: emptyPipeNetwork(),
    cables: emptyCableNetwork(),
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

export function normalizeLandscapeTerrain(
  raw?: LandscapeTerrain | null,
): LandscapeTerrain | undefined {
  if (!raw) return undefined
  const resolution = raw.resolution === 256 ? 256 : 128
  const size = Math.max(8, Number(raw.size) || 40)
  const sizeY = Math.max(8, Number(raw.sizeY) || size)
  return {
    heightPng: typeof raw.heightPng === 'string' ? raw.heightPng : undefined,
    resolution,
    size,
    sizeY,
    originX: Number(raw.originX) || 0,
    originY: Number(raw.originY) || 0,
  }
}

export function normalizeLandscapePaint(
  raw?: LandscapePaint | null,
): LandscapePaint | undefined {
  if (!raw) return undefined
  const layers: LandscapePaint['layers'] = [
    raw.layers?.[0] ?? null,
    raw.layers?.[1] ?? null,
    raw.layers?.[2] ?? null,
    raw.layers?.[3] ?? null,
  ]
  return {
    layers,
    splatPng: typeof raw.splatPng === 'string' ? raw.splatPng : undefined,
    resolution: raw.resolution === 512 ? 512 : 256,
  }
}

export function normalizeLandscapePlant(
  raw: LandscapePlant | Partial<LandscapePlant>,
): LandscapePlant {
  return {
    id: raw.id ?? createId('plt'),
    species: raw.species ?? 'ponderosaPine',
    seed: Math.max(1, Math.round(Number(raw.seed) || 1)),
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    rotationY: Number(raw.rotationY) || 0,
    scale: Math.max(0.15, Number(raw.scale) || 1),
    shape: raw.shape ? { ...raw.shape } : undefined,
  }
}

type LegacyLandscapeGrass = Partial<LandscapeGrassLayer> & {
  resolution?: 256 | 512
  layers?: Array<Partial<LandscapeGrassLayer>>
}

export function normalizeLandscapeGrass(
  raw?: LandscapeGrass | LegacyLandscapeGrass | null,
): LandscapeGrass | undefined {
  if (!raw) return undefined
  const d = LANDSCAPE_GRASS_DEFAULTS
  const color = (value?: string) =>
    typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
      ? value
      : d.color
  const layerFrom = (
    layer: Partial<LandscapeGrassLayer>,
    fallbackName: string,
  ): LandscapeGrassLayer => ({
    id: layer.id ?? createId('grs'),
    name: (layer.name ?? fallbackName).trim() || fallbackName,
    coveragePng:
      typeof layer.coveragePng === 'string' ? layer.coveragePng : undefined,
    density: Math.max(0.2, Math.min(18, Number(layer.density) || d.density)),
    height: Math.max(0.15, Math.min(1.8, Number(layer.height) || d.height)),
    width: Math.max(0.6, Math.min(3.2, Number(layer.width) || d.width)),
    color: color(layer.color),
    seed: Math.max(1, Math.round(Number(layer.seed) || d.seed)),
  })
  const resolution = raw.resolution === 512 ? 512 : 256
  if (Array.isArray(raw.layers) && raw.layers.length > 0) {
    return {
      resolution,
      layers: raw.layers.map((layer, i) =>
        layerFrom(layer, i === 0 ? 'Луг' : `Трава ${i + 1}`),
      ),
    }
  }
  const legacy = raw as LegacyLandscapeGrass
  if (
    legacy.coveragePng ||
    legacy.density != null ||
    legacy.height != null ||
    legacy.color
  ) {
    return {
      resolution,
      layers: [layerFrom(legacy, 'Луг')],
    }
  }
  return undefined
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
    boxes: floor.boxes ?? [],
    boxCutouts: floor.boxCutouts ?? [],
    tiles: (floor.tiles ?? []).map((t) => normalizePlacedTile(t)),
    moldings: (floor.moldings ?? []).map((m) => normalizePlacedMolding(m)),
    objects: (floor.objects ?? []).map((o) =>
      normalizePlacedObject(o as PlacedObject & { scale?: number }),
    ),
    pipes: ensurePipeNetwork(floor.pipes),
    cables: ensureCableNetwork(floor.cables),
    landscapeTerrain: normalizeLandscapeTerrain(floor.landscapeTerrain),
    landscapePaint: normalizeLandscapePaint(floor.landscapePaint),
    plants: (floor.plants ?? []).map(normalizeLandscapePlant),
    landscapeGrass: normalizeLandscapeGrass(floor.landscapeGrass),
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
