import { create } from 'zustand'
import {
  applyDragWithConstraints,
  applyMultiDrag,
  hasAxisConstraint,
  hasFixedLength,
  hasFixedPosition,
  solveFloor,
} from '../engine/constraints/solver'
import {
  addWallBetween,
  findWallEdgeNear,
  getOrCreateVertex,
  hitWall,
  mergeVertices,
  removeVertex,
  removeWall,
  resolveWallEndpoint,
  snapToGrid,
  splitWallAt,
} from '../engine/geometry/walls'
import { snapObjectXY, planHalfSizeOf } from '../engine/geometry/objectSnap'
import {
  wallsShareAxis,
  detectRooms,
  hitRoom,
  type WallFace,
} from '../engine/geometry/wallSolid'
import {
  applyFloorCopy,
  type CopyFloorOptions,
} from '../engine/copyFloor'
import {
  type Building,
  type CableSegment,
  type Constraint,
  CABLE_META,
  createEmptyBuilding,
  createEmptyFloor,
  createId,
  cycleFloorVisibility,
  DEFAULT_LIGHTING,
  ELECTRICAL_DEVICE_SIZE,
  type ElectricalDeviceKind,
  type ElectricalNode,
  ensureBuildingOpenings,
  ensureCableNetwork,
  ensurePipeNetwork,
  estimatePlanHalf,
  type Floor,
  type FloorVisibility,
  isElectricalTool,
  isGroundFloor,
  isLandscapeTool,
  isMepFixtureTool,
  isMepWorkbench,
  isPlumbingTool,
  isStoryFloor,
  type LandscapeGrass,
  type LandscapePlant,
  normalizeLandscapeGrass,
  type PlantShape,
  SEEDTHREE_GRASS_DEFAULTS,
  type SculptMode,
  type LightingSettings,
  type MaterialRef,
  type ModelAttribution,
  type ModelRef,
  type ObjectAppearance,
  type OpeningKind,
  type PipeFixtureKind,
  type PipeMedium,
  type PipeNode,
  type PipeSegment,
  PIPE_MEDIUM_META,
  type PlacedObject,
  normalizeFloorVisibility,
  recalcFloorElevations,
  type SceneMode,
  type Selection,
  selectedVertexIds,
  selectedWallIds,
  storyFloors,
  type Tool,
  type TransformGizmoMode,
  toolsForWorkbench,
  type ViewMode,
  type WallSide,
  type Workbench,
  isWallOpeningTool,
  wallLength,
} from '../engine/types'
import {
  createOpeningFromDrag,
  hitOpening,
  offsetAlongWall,
  openingDefaults,
  updateOpeningFields,
} from '../engine/geometry/openings'
import {
  createSlabOpeningFromDrag,
  hitSlabOpening,
  updateSlabOpeningFields,
} from '../engine/geometry/slabOpenings'
import {
  createFloorPlateFromDrag,
  floorPlateIdFromKey,
  hitFloorPlate,
  setFloorPlateMaterial as applyFloorPlateMaterial,
  updateFloorPlateFields,
} from '../engine/geometry/floorPlates'
import {
  connectMepNodes,
  findMepNodeNear,
  findMepSegmentNear,
  findWallCenterlineNear,
  makeCableSegment,
  makeElectricalNode,
  makePipeNode,
  makePipeSegment,
  placeElectricalDevice,
  relocateMepNode,
  removeMepNode,
  removeMepSegment,
  resolveMepEndpoint,
} from '../engine/geometry/mep'
import {
  applyProjectPackage,
  buildProjectPackage,
  parseImportJson,
} from '../models/projectPackage'
import { decodeBytes, decodeHeights, encodeBytes } from '../landscape/maps'
import { stampCoverage, stampSplat } from '../landscape/paintMaps'
import { defaultPlantShape, resolvePlantShape } from '../landscape/plantShape'
import {
  createGrassLayer,
  emptyGrassDoc,
  findGrassLayer,
  MAX_GRASS_LAYERS,
  nextGrassPreset,
  replaceGrassLayer,
} from '../landscape/grassLayers'
import {
  buildLockMask,
  ensureTerrain,
  footprintHolesForLock,
  persistHeights,
  pointInFootprint,
  sculptStamp,
  terrainFrame,
} from '../landscape/terrain'

const STORAGE_KEY = 'interior-planner-project'
const MAX_HISTORY = 50

function cloneBuilding(b: Building): Building {
  return structuredClone(b)
}

/** Read last saved project from localStorage, or null if missing/invalid. */
function readStoredBuilding(): Building | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = ensureBuildingOpenings(JSON.parse(raw) as Building)
    if (!data.floors?.length) return null
    return data
  } catch {
    return null
  }
}

function createDemoBuilding(): Building {
  const initial = ensureBuildingOpenings(createEmptyBuilding())
  const firstStory = storyFloors(initial.floors)[0] ?? initial.floors[0]
  const demo = seedDemoFloor(firstStory)
  return {
    ...initial,
    floors: initial.floors.map((f) => (f.id === demo.id ? demo : f)),
  }
}

interface BuildingState {
  building: Building
  activeFloorId: string
  tool: Tool
  workbench: Workbench
  viewMode: ViewMode
  sceneMode: SceneMode
  paintBrush: MaterialRef | null
  lighting: LightingSettings
  lightingMenuOpen: boolean
  selection: Selection
  conflict: boolean
  wallDraftFrom: string | null
  mepDraftFrom: string | null
  pipeMedium: PipeMedium
  pipeDiameterMm: number
  pipeElevation: number
  cableSectionMm2: number
  cableElevation: number
  openingDraft: {
    wallId: string
    kind: OpeningKind
    t0: number
    t1: number
  } | null
  /** Drag-rect draft for stair well in the slab */
  slabOpeningDraft: {
    x0: number
    y0: number
    x1: number
    y1: number
  } | null
  /** Drag-rect draft for free floor plate (no walls) */
  floorPlateDraft: {
    x0: number
    y0: number
    x1: number
    y1: number
  } | null
  history: Building[]
  future: Building[]
  statusMessage: string | null

  activeFloor: () => Floor
  pushHistory: () => void
  undo: () => void
  redo: () => void
  setTool: (tool: Tool) => void
  setWorkbench: (workbench: Workbench) => void
  setViewMode: (mode: ViewMode) => void
  setSceneMode: (mode: SceneMode) => void
  setPaintBrush: (brush: MaterialRef | null) => void
  setLighting: (patch: Partial<LightingSettings>) => void
  resetLighting: () => void
  setLightingMenuOpen: (open: boolean) => void
  setSelection: (sel: Selection) => void
  /** Select a wall opening, switching active floor if needed. */
  selectOpening: (floorId: string, id: string) => void
  /** Select a slab opening (stair), switching active floor if needed. */
  selectSlabOpening: (floorId: string, id: string) => void
  setBuildingName: (name: string) => void

  addFloor: (copyFromPrevious?: CopyFloorOptions | null) => void
  copyFromPreviousFloor: (options: CopyFloorOptions) => void
  removeFloor: (id: string) => void
  setActiveFloor: (id: string) => void
  renameFloor: (id: string, name: string) => void
  setFloorHeight: (id: string, height: number) => void
  setFloorSlabThickness: (id: string, thickness: number) => void
  /** Absolute Y for ground or first story walking surface. */
  setFloorElevation: (id: string, elevation: number) => void
  setFloorVisible: (id: string, visible: FloorVisibility) => void
  cycleFloorVisible: (id: string) => void

  updateActiveFloor: (fn: (floor: Floor) => Floor, recordHistory?: boolean) => void

  beginWall: (x: number, y: number) => void
  finishWall: (x: number, y: number) => void
  cancelWallDraft: () => void

  setPipeMedium: (medium: PipeMedium) => void
  setPipeDiameterMm: (mm: number) => void
  setPipeElevation: (elevation: number) => void
  setCableSectionMm2: (mm2: number) => void
  setCableElevation: (elevation: number) => void
  cancelMepDraft: () => void
  /** Click to start/continue a pipe or cable, or place a fixture. */
  clickMepAt: (x: number, y: number, elevation?: number) => void
  beginMepNodeDrag: () => void
  dragMepNode: (
    network: 'pipes' | 'cables',
    id: string,
    x: number,
    y: number,
    elevation?: number,
  ) => void
  updatePipeSegment: (
    id: string,
    patch: Partial<Pick<PipeSegment, 'medium' | 'diameterMm'>>,
  ) => void
  updatePipeNode: (
    id: string,
    patch: Partial<
      Pick<PipeNode, 'elevation' | 'fixture'> & { offset?: number; x?: number; y?: number }
    >,
  ) => void
  updateCableSegment: (
    id: string,
    patch: Partial<Pick<CableSegment, 'sectionMm2'>>,
  ) => void
  updateElectricalNode: (
    id: string,
    patch: Partial<
      Pick<ElectricalNode, 'elevation' | 'device' | 'side' | 'width' | 'height' | 'depth'> & {
        offset?: number
        x?: number
        y?: number
      }
    >,
  ) => void

  beginOpening: (x: number, y: number) => void
  updateOpeningDraft: (x: number, y: number) => void
  finishOpening: () => void
  cancelOpeningDraft: () => void
  updateOpening: (
    id: string,
    patch: Partial<{
      width: number
      height: number
      sillHeight: number
      offset: number
      kind: OpeningKind
    }>,
  ) => void
  /** Move wall opening along its wall (no history — caller pushes once on drag start). */
  dragOpening: (id: string, x: number, y: number) => void

  beginSlabOpening: (x: number, y: number) => void
  updateSlabOpeningDraft: (x: number, y: number) => void
  finishSlabOpening: () => void
  cancelSlabOpeningDraft: () => void
  updateSlabOpening: (
    id: string,
    patch: Partial<{ x: number; y: number; width: number; depth: number }>,
  ) => void
  /** Move slab opening by center (no history). */
  dragSlabOpening: (id: string, x: number, y: number) => void

  beginFloorPlate: (x: number, y: number) => void
  updateFloorPlateDraft: (x: number, y: number) => void
  finishFloorPlate: () => void
  cancelFloorPlateDraft: () => void
  updateFloorPlate: (
    id: string,
    patch: Partial<{ x: number; y: number; width: number; depth: number }>,
  ) => void
  /** Move floor plate by center (no history). */
  dragFloorPlate: (id: string, x: number, y: number) => void
  setFloorPlateMaterial: (
    id: string,
    material: MaterialRef | null,
  ) => void
  /** Select a floor plate, switching active floor if needed. */
  selectFloorPlate: (floorId: string, id: string) => void

  /** Pending model to place with the placeObject tool (3D or 2D). */
  pendingModel: {
    model: ModelRef
    attribution?: ModelAttribution
    /** Default scale from collection calibration. */
    scale?: number
    /** Local model bbox before scale (meters). */
    sizeX?: number
    sizeY?: number
    sizeZ?: number
    appearance?: ObjectAppearance
  } | null
  modelBrowserOpen: boolean
  collectionBrowserOpen: boolean
  libraryTokensOpen: boolean
  setModelBrowserOpen: (open: boolean) => void
  setCollectionBrowserOpen: (open: boolean) => void
  setLibraryTokensOpen: (open: boolean) => void
  setPendingModel: (
    pending: {
      model: ModelRef
      attribution?: ModelAttribution
      scale?: number
      sizeX?: number
      sizeY?: number
      sizeZ?: number
      appearance?: ObjectAppearance
    } | null,
  ) => void
  placeObjectAt: (x: number, y: number) => void
  updatePlacedObject: (
    id: string,
    patch: Partial<
      Pick<
        PlacedObject,
        | 'x'
        | 'y'
        | 'elevation'
        | 'rotationX'
        | 'rotationY'
        | 'rotationZ'
        | 'scaleX'
        | 'scaleY'
        | 'scaleZ'
        | 'sizeX'
        | 'sizeY'
        | 'sizeZ'
        | 'planHalfX'
        | 'planHalfY'
        | 'appearance'
        | 'animationTime'
        | 'animationDuration'
      >
    >,
  ) => void
  /** Drag placed object in plan (no history). */
  dragPlacedObject: (id: string, x: number, y: number) => void
  selectObject: (floorId: string, id: string) => void
  selectPlant: (id: string) => void
  placePlantAt: (x: number, y: number) => void
  updatePlant: (
    id: string,
    patch: Partial<
      Pick<LandscapePlant, 'x' | 'y' | 'rotationY' | 'scale' | 'seed' | 'species'>
    > & { shape?: Partial<PlantShape> },
  ) => void
  sculptMode: SculptMode
  setSculptMode: (mode: SculptMode) => void
  landscapeBrushRadius: number
  landscapeBrushHardness: number
  landscapeBrushStrength: number
  setLandscapeBrush: (patch: {
    radius?: number
    hardness?: number
    strength?: number
  }) => void
  groundPaintLayer: 0 | 1 | 2 | 3
  setGroundPaintLayer: (layer: 0 | 1 | 2 | 3) => void
  setGroundPaintLayerMaterial: (
    layer: 0 | 1 | 2 | 3,
    material: MaterialRef | null,
  ) => void
  pendingPlantSpecies: string | null
  pendingPlantScale: number
  pendingPlantShape: PlantShape
  setPendingPlant: (
    species: string | null,
    scale?: number,
    shape?: Partial<PlantShape>,
  ) => void
  setPendingPlantShape: (patch: Partial<PlantShape>) => void
  grassDensity: number
  grassTuftHeight: number
  grassTuftWidth: number
  grassColor: string
  grassSeed: number
  activeGrassLayerId: string | null
  setActiveGrassLayer: (id: string) => void
  addGrassLayer: () => void
  removeGrassLayer: (id: string) => void
  renameGrassLayer: (id: string, name: string) => void
  setGrassParams: (patch: {
    density?: number
    height?: number
    width?: number
    color?: string
    seed?: number
    name?: string
  }) => void
  beginLandscapeStroke: () => void
  stampSculptAt: (x: number, y: number, flattenTarget?: number) => void
  stampGroundPaintAt: (x: number, y: number, erase: boolean) => void
  stampGrassAt: (x: number, y: number, erase: boolean) => void
  ensureLandscapeReady: () => void

  transformGizmoMode: TransformGizmoMode
  setTransformGizmoMode: (mode: TransformGizmoMode) => void
  /** Cycle translate → rotate → scale → translate. */
  cycleTransformGizmoMode: () => void
  /** True while TransformControls is dragging (disables orbit). */
  transformDragging: boolean
  setTransformDragging: (dragging: boolean) => void
  /** Snap placed objects to walls / other objects. */
  objectSnapEnabled: boolean
  setObjectSnapEnabled: (enabled: boolean) => void
  toggleObjectSnap: () => void

  selectAt: (x: number, y: number) => void
  selectInRect: (minX: number, minY: number, maxX: number, maxY: number) => void
  applyConstraintTool: (x: number, y: number) => void

  dragVertex: (vertexId: string, x: number, y: number) => void
  dragSelection: (
    anchorId: string,
    x: number,
    y: number,
    startPositions: Record<string, { x: number; y: number }>,
  ) => void
  endDrag: () => void

  toggleFixedLength: (wallId: string) => void
  toggleFixedPosition: (vertexId: string) => void
  toggleAxis: (wallId: string, type: 'horizontal' | 'vertical') => void
  setWallThickness: (wallId: string, thickness: number) => void
  setWallSideMaterial: (
    wallId: string,
    side: WallSide,
    material: MaterialRef | null,
  ) => void
  setWallCutMaterial: (
    wallId: string,
    material: MaterialRef | null,
  ) => void
  setWallBothMaterials: (
    wallId: string,
    material: MaterialRef | null,
  ) => void
  setRoomFloorMaterial: (
    roomKey: string,
    material: MaterialRef | null,
  ) => void
  setRoomWallsMaterial: (
    roomKey: string,
    material: MaterialRef | null,
  ) => void
  setSlabOpeningMaterial: (
    openingId: string,
    material: MaterialRef | null,
  ) => void
  selectRoom: (key: string) => void
  setFixedLengthValue: (wallId: string, length: number) => void
  setWallDistance: (
    wallA: string,
    wallB: string,
    distance: number,
    face: WallFace,
  ) => void
  clearWallDistance: (wallA: string, wallB: string) => void
  setVertexDistance: (
    vertexA: string,
    vertexB: string,
    distance: number,
    face: WallFace,
  ) => void
  clearVertexDistance: (vertexA: string, vertexB: string) => void
  setPointsAligned: (
    vertexIds: string[],
    axis: 'horizontal' | 'vertical',
  ) => void
  clearPointsAligned: (
    vertexIds: string[],
    axis: 'horizontal' | 'vertical',
  ) => void
  setPointOnWall: (vertexId: string, wallId: string) => void
  clearPointOnWall: (vertexId: string, wallId: string) => void
  /** Alt+click mid-edge: split wall and select the junction vertex. */
  selectEdgePoint: (x: number, y: number, shift?: boolean) => boolean
  removeConstraint: (constraintId: string) => void
  toggleSelectWall: (wallId: string, shift: boolean) => void
  toggleSelectVertex: (vertexId: string, shift: boolean) => void
  deleteSelection: () => void
  /** Merge exactly two selected vertices into one (midpoint). */
  mergeSelectedVertices: () => void

  saveLocal: () => void
  loadLocal: () => boolean
  /** Sync building-only JSON (localStorage). */
  exportJson: () => string
  /** Async project package with asset cache (file export). */
  exportProjectPackage: () => Promise<string>
  importJson: (json: string) => Promise<boolean>
  newProject: () => void
}

/** Ignore a second 3D hit (wall + floor) from the same pointer event. */
let lastMepClickMs = 0

function replaceFloor(building: Building, floor: Floor): Building {
  return {
    ...building,
    floors: building.floors.map((f) => (f.id === floor.id ? floor : f)),
  }
}

export const useBuildingStore = create<BuildingState>((set, get) => {
  // Cold start: restore last saved project; otherwise seed a demo building
  const stored = readStoredBuilding()
  const building = stored ?? createDemoBuilding()

  return {
    building,
    activeFloorId: storyFloors(building.floors)[0]?.id ?? building.floors[0].id,
    tool: 'select',
    workbench: 'draft',
    viewMode: '2d',
    sceneMode: 'interior',
    paintBrush: null,
    lighting: { ...DEFAULT_LIGHTING },
    lightingMenuOpen: false,
    selection: null,
    conflict: false,
    wallDraftFrom: null,
    mepDraftFrom: null,
    pipeMedium: 'coldWater',
    pipeDiameterMm: PIPE_MEDIUM_META.coldWater.diameterMm,
    pipeElevation: PIPE_MEDIUM_META.coldWater.elevation,
    cableSectionMm2: CABLE_META.sectionMm2,
    cableElevation: CABLE_META.elevation,
    openingDraft: null,
    slabOpeningDraft: null,
    floorPlateDraft: null,
    pendingModel: null,
    modelBrowserOpen: false,
    collectionBrowserOpen: false,
    libraryTokensOpen: false,
    transformGizmoMode: 'translate',
    transformDragging: false,
    objectSnapEnabled: true,
    sculptMode: 'raise',
    landscapeBrushRadius: 3,
    landscapeBrushHardness: 0.35,
    landscapeBrushStrength: 0.35,
    groundPaintLayer: 1,
    pendingPlantSpecies: null,
    pendingPlantScale: 1,
    pendingPlantShape: defaultPlantShape('ponderosaPine'),
    grassDensity: SEEDTHREE_GRASS_DEFAULTS.density,
    grassTuftHeight: SEEDTHREE_GRASS_DEFAULTS.height,
    grassTuftWidth: SEEDTHREE_GRASS_DEFAULTS.width,
    grassColor: SEEDTHREE_GRASS_DEFAULTS.color,
    grassSeed: SEEDTHREE_GRASS_DEFAULTS.seed,
    activeGrassLayerId: null,
    history: [],
    future: [],
    statusMessage: null,

    activeFloor: () => {
      const { building, activeFloorId } = get()
      return building.floors.find((f) => f.id === activeFloorId) ?? building.floors[0]
    },

    pushHistory: () => {
      const { building, history } = get()
      set({
        history: [...history.slice(-(MAX_HISTORY - 1)), cloneBuilding(building)],
        future: [],
      })
    },

    undo: () => {
      const { history, building, future, activeFloorId } = get()
      if (history.length === 0) return
      const prev = history[history.length - 1]
      const floorExists = prev.floors.some((f) => f.id === activeFloorId)
      set({
        building: prev,
        history: history.slice(0, -1),
        future: [cloneBuilding(building), ...future].slice(0, MAX_HISTORY),
        activeFloorId: floorExists ? activeFloorId : prev.floors[0].id,
        conflict: false,
        selection: null,
        wallDraftFrom: null,
        mepDraftFrom: null,
        openingDraft: null,
        slabOpeningDraft: null,
        floorPlateDraft: null,
      })
    },

    redo: () => {
      const { future, building, history, activeFloorId } = get()
      if (future.length === 0) return
      const next = future[0]
      const floorExists = next.floors.some((f) => f.id === activeFloorId)
      set({
        building: next,
        future: future.slice(1),
        history: [...history, cloneBuilding(building)].slice(-MAX_HISTORY),
        activeFloorId: floorExists ? activeFloorId : next.floors[0].id,
        conflict: false,
        selection: null,
        openingDraft: null,
        slabOpeningDraft: null,
        floorPlateDraft: null,
      })
    },

    setTool: (tool) => {
      const { workbench } = get()
      const onGround = isGroundFloor(get().activeFloor())
      if (onGround && workbench !== 'landscape' && tool !== 'select') return
      if (
        onGround &&
        workbench === 'landscape' &&
        tool !== 'select' &&
        !isLandscapeTool(tool)
      ) {
        return
      }
      if (tool === 'placeObject') {
        if (workbench === 'landscape') {
          set({
            tool: 'placeObject',
            wallDraftFrom: null,
            mepDraftFrom: null,
            openingDraft: null,
            slabOpeningDraft: null,
            floorPlateDraft: null,
            pendingPlantSpecies: null,
            statusMessage: 'Выберите объект в коллекции слева',
          })
          return
        }
        set({
          workbench: 'furnish',
          tool: 'select',
          wallDraftFrom: null,
          mepDraftFrom: null,
          openingDraft: null,
          slabOpeningDraft: null,
          floorPlateDraft: null,
          collectionBrowserOpen: false,
          modelBrowserOpen: false,
          viewMode: '3d',
          sceneMode: get().sceneMode === 'paint' ? 'interior' : get().sceneMode,
          statusMessage: 'Выберите объект в списке коллекции слева',
        })
        return
      }
      if (isPlumbingTool(tool) && workbench !== 'plumbing') {
        get().setWorkbench('plumbing')
        get().setTool(tool)
        return
      }
      if (isElectricalTool(tool) && workbench !== 'electrical') {
        get().setWorkbench('electrical')
        get().setTool(tool)
        return
      }
      const allowed = toolsForWorkbench(workbench)
      if (!allowed.includes(tool) && workbench !== 'draft') {
        if (isMepWorkbench(workbench)) return
        // Draft tools from shortcut while in another workbench → switch to draft
        if (toolsForWorkbench('draft').includes(tool)) {
          get().setWorkbench('draft')
          get().setTool(tool)
          return
        }
        return
      }
      set({
        tool,
        wallDraftFrom: null,
        mepDraftFrom: null,
        openingDraft: null,
        slabOpeningDraft: null,
        floorPlateDraft: null,
        statusMessage: null,
      })
    },
    setWorkbench: (workbench) => {
      const prev = get().sceneMode
      const drafts = {
        wallDraftFrom: null as string | null,
        mepDraftFrom: null as string | null,
        openingDraft: null,
        slabOpeningDraft: null,
        floorPlateDraft: null,
        statusMessage: null as string | null,
      }
      if (workbench === 'draft') {
        set({
          workbench,
          viewMode: '2d',
          sceneMode: prev === 'paint' ? 'interior' : prev,
          tool: 'select',
          modelBrowserOpen: false,
          collectionBrowserOpen: false,
          ...drafts,
        })
        return
      }
      if (workbench === 'paint') {
        set({
          workbench,
          viewMode: '3d',
          sceneMode: 'paint',
          tool: 'select',
          pendingModel: null,
          modelBrowserOpen: false,
          collectionBrowserOpen: false,
          ...drafts,
        })
        return
      }
      if (workbench === 'plumbing' || workbench === 'electrical') {
        set({
          workbench,
          sceneMode: prev === 'paint' ? 'interior' : prev,
          tool: 'select',
          modelBrowserOpen: false,
          collectionBrowserOpen: false,
          ...drafts,
        })
        return
      }
      if (workbench === 'landscape') {
        const g = get().building.floors.find(isGroundFloor)
        set({
          workbench,
          viewMode: '3d',
          sceneMode: prev === 'visit' ? 'visit' : 'exterior',
          tool: 'select',
          activeFloorId: g?.id ?? get().activeFloorId,
          pendingModel: null,
          pendingPlantSpecies: null,
          modelBrowserOpen: false,
          collectionBrowserOpen: false,
          ...drafts,
        })
        get().ensureLandscapeReady()
        return
      }
      // furnish
      set({
        workbench,
        viewMode: '3d',
        sceneMode: prev === 'paint' ? 'interior' : prev,
        tool: 'select',
        ...drafts,
      })
    },
    setViewMode: (viewMode) => {
      const { workbench, sceneMode } = get()
      // Paint only makes sense in 3D — leaving 3D exits paint workbench
      if (viewMode === '2d' && (workbench === 'paint' || workbench === 'landscape')) {
        set({
          viewMode,
          workbench: 'draft',
          sceneMode: 'interior',
          tool: 'select',
        })
        return
      }
      if (viewMode === '2d' && sceneMode === 'paint') {
        set({ viewMode, sceneMode: 'interior' })
        return
      }
      set({ viewMode })
    },
    setSceneMode: (sceneMode) => {
      if (sceneMode === 'paint') {
        get().setWorkbench('paint')
        return
      }
      const { workbench } = get()
      set({
        sceneMode,
        ...(workbench === 'paint' ? { workbench: 'draft' as Workbench, tool: 'select' as Tool } : {}),
      })
    },
    setPaintBrush: (paintBrush) => set({ paintBrush }),
    setLighting: (patch) =>
      set({ lighting: { ...get().lighting, ...patch } }),
    resetLighting: () => set({ lighting: { ...DEFAULT_LIGHTING } }),
    setLightingMenuOpen: (lightingMenuOpen) => set({ lightingMenuOpen }),
    setSelection: (selection) => set({ selection }),
    selectOpening: (floorId, id) =>
      set({
        activeFloorId: floorId,
        selection: { kind: 'opening', id },
        wallDraftFrom: null,
        openingDraft: null,
        slabOpeningDraft: null,
        floorPlateDraft: null,
        statusMessage: null,
      }),
    selectSlabOpening: (floorId, id) =>
      set({
        activeFloorId: floorId,
        selection: { kind: 'slabOpening', id },
        wallDraftFrom: null,
        openingDraft: null,
        slabOpeningDraft: null,
        floorPlateDraft: null,
        statusMessage: null,
      }),
    setBuildingName: (name) => {
      get().pushHistory()
      set({ building: { ...get().building, name } })
    },

    addFloor: (copyFromPrevious = null) => {
      get().pushHistory()
      const { building } = get()
      const stories = storyFloors(building.floors)
      const last = stories[stories.length - 1]
      let floor = createEmptyFloor(
        `Этаж ${stories.length + 1}`,
        last?.elevation ?? 0,
        last?.height ?? 2.8,
      )
      if (copyFromPrevious && last) {
        floor = applyFloorCopy(floor, last, copyFromPrevious)
      }
      const floors = recalcFloorElevations([...building.floors, floor])
      const created = floors[floors.length - 1]
      set({
        building: { ...building, floors },
        activeFloorId: created.id,
        selection: null,
      })
    },

    copyFromPreviousFloor: (options) => {
      const { building, activeFloorId } = get()
      const stories = storyFloors(building.floors)
      const index = stories.findIndex((f) => f.id === activeFloorId)
      if (index <= 0) {
        set({ statusMessage: 'Нет предыдущего этажа' })
        return
      }
      const prev = stories[index - 1]
      const current = stories[index]
      get().pushHistory()
      const next = applyFloorCopy(current, prev, options)
      set({
        building: replaceFloor(building, next),
        selection: null,
        statusMessage: `Скопировано с «${prev.name}»`,
      })
    },

    removeFloor: (id) => {
      const { building } = get()
      const target = building.floors.find((f) => f.id === id)
      if (!target || isGroundFloor(target)) {
        set({ statusMessage: 'Землю удалить нельзя' })
        return
      }
      if (storyFloors(building.floors).length <= 1) {
        set({ statusMessage: 'Нужен хотя бы один этаж' })
        return
      }
      get().pushHistory()
      const floors = recalcFloorElevations(building.floors.filter((f) => f.id !== id))
      const nextActive =
        floors.find((f) => isStoryFloor(f))?.id ?? floors[0].id
      set({
        building: { ...building, floors },
        activeFloorId: nextActive,
        selection: null,
      })
    },

    setActiveFloor: (id) => {
      const floor = get().building.floors.find((f) => f.id === id)
      set({
        activeFloorId: id,
        selection: null,
        wallDraftFrom: null,
        mepDraftFrom: null,
        openingDraft: null,
        slabOpeningDraft: null,
        floorPlateDraft: null,
        conflict: false,
        ...(floor && isGroundFloor(floor) && get().workbench !== 'landscape'
          ? { tool: 'select' as const }
          : {}),
      })
    },

    renameFloor: (id, name) => {
      get().pushHistory()
      const { building } = get()
      set({
        building: {
          ...building,
          floors: building.floors.map((f) => (f.id === id ? { ...f, name } : f)),
        },
      })
    },

    setFloorHeight: (id, height) => {
      const floor = get().building.floors.find((f) => f.id === id)
      if (!floor || isGroundFloor(floor)) return
      get().pushHistory()
      const h = Math.max(2, Math.min(5, height))
      const floors = recalcFloorElevations(
        get().building.floors.map((f) =>
          f.id === id ? { ...f, height: h } : f,
        ),
      )
      set({ building: { ...get().building, floors } })
    },

    setFloorSlabThickness: (id, thickness) => {
      const floor = get().building.floors.find((f) => f.id === id)
      if (!floor || isGroundFloor(floor)) return
      get().pushHistory()
      const t = Math.max(0.05, Math.min(1, thickness))
      const floors = recalcFloorElevations(
        get().building.floors.map((f) =>
          f.id === id ? { ...f, slabThickness: t } : f,
        ),
      )
      set({ building: { ...get().building, floors } })
    },

    setFloorElevation: (id, elevation) => {
      const floor = get().building.floors.find((f) => f.id === id)
      if (!floor) return
      const elev = Math.max(-50, Math.min(100, elevation))
      get().pushHistory()
      if (isGroundFloor(floor)) {
        set({
          building: {
            ...get().building,
            floors: get().building.floors.map((f) =>
              f.id === id ? { ...f, elevation: elev } : f,
            ),
          },
        })
        return
      }
      const stories = storyFloors(get().building.floors)
      if (stories[0]?.id !== id) {
        set({
          statusMessage: 'Уровень задаётся для земли или первого этажа',
        })
        return
      }
      const floors = recalcFloorElevations(
        get().building.floors.map((f) =>
          f.id === id ? { ...f, elevation: elev } : f,
        ),
      )
      set({ building: { ...get().building, floors } })
    },

    setFloorVisible: (id, visible) => {
      get().pushHistory()
      set({
        building: {
          ...get().building,
          floors: get().building.floors.map((f) =>
            f.id === id ? { ...f, visible } : f,
          ),
        },
      })
    },

    cycleFloorVisible: (id) => {
      get().pushHistory()
      set({
        building: {
          ...get().building,
          floors: get().building.floors.map((f) =>
            f.id === id
              ? {
                  ...f,
                  visible: cycleFloorVisibility(
                    normalizeFloorVisibility(f.visible),
                  ),
                }
              : f,
          ),
        },
      })
    },
    updateActiveFloor: (fn, recordHistory = true) => {
      if (isGroundFloor(get().activeFloor())) return
      if (recordHistory) get().pushHistory()
      const floor = get().activeFloor()
      const next = fn(floor)
      set({ building: replaceFloor(get().building, next) })
    },

    beginWall: (x, y) => {
      if (isGroundFloor(get().activeFloor())) return
      get().pushHistory()
      const floor = get().activeFloor()
      const { floor: withV, vertex } = getOrCreateVertex(floor, x, y)
      set({
        building: replaceFloor(get().building, withV),
        wallDraftFrom: vertex.id,
        statusMessage: null,
      })
    },

    finishWall: (x, y) => {
      const from = get().wallDraftFrom
      if (!from) return
      let floor = get().activeFloor()
      // from id may still be valid after edge splits of other walls
      const { floor: withV, vertex, kind } = resolveWallEndpoint(floor, x, y)
      floor = withV
      // If draft start vertex was removed by a remap (unlikely), abort
      if (!floor.vertices.some((v) => v.id === from)) {
        set({ wallDraftFrom: null, statusMessage: 'Начальная точка потеряна' })
        return
      }
      const next = addWallBetween(floor, from, vertex.id)
      if (!next) {
        set({ wallDraftFrom: null, statusMessage: 'Стена не создана' })
        return
      }
      const solved = solveFloor(next)
      const newWall = solved.floor.walls.find(
        (w) =>
          (w.a === from && w.b === vertex.id) ||
          (w.b === from && w.a === vertex.id),
      )
      set({
        building: replaceFloor(get().building, solved.floor),
        wallDraftFrom: vertex.id,
        selection: newWall ? { kind: 'wall', id: newWall.id } : null,
        conflict: solved.conflict,
        statusMessage:
          kind === 'edge'
            ? 'Стена присоединена к середине'
            : kind === 'vertex'
              ? 'Стена присоединена к точке'
              : null,
      })
    },

    cancelWallDraft: () => set({ wallDraftFrom: null }),

    setPipeMedium: (medium) => {
      const meta = PIPE_MEDIUM_META[medium]
      set({
        pipeMedium: medium,
        pipeDiameterMm: meta.diameterMm,
        pipeElevation: meta.elevation,
      })
    },
    setPipeDiameterMm: (mm) => {
      const diameterMm = Math.max(6, Math.min(200, mm))
      set({ pipeDiameterMm: diameterMm })
      const sel = get().selection
      if (sel?.kind !== 'pipeSegment' && sel?.kind !== 'pipeNode') return
      const floor0 = get().activeFloor()
      if (isGroundFloor(floor0)) return
      const net0 = ensurePipeNetwork(floor0.pipes)
      const ids =
        sel.kind === 'pipeSegment'
          ? new Set([sel.id])
          : new Set(
              net0.segments
                .filter((s) => s.a === sel.id || s.b === sel.id)
                .map((s) => s.id),
            )
      if (ids.size === 0) return
      get().pushHistory()
      get().updateActiveFloor((floor) => {
        const net = ensurePipeNetwork(floor.pipes)
        return {
          ...floor,
          pipes: {
            ...net,
            segments: net.segments.map((s) =>
              ids.has(s.id) ? { ...s, diameterMm } : s,
            ),
          },
        }
      }, false)
    },
    setPipeElevation: (elevation) => {
      set({ pipeElevation: Math.max(0, Math.min(5, elevation)) })
    },
    setCableSectionMm2: (mm2) => {
      set({ cableSectionMm2: Math.max(0.75, Math.min(50, mm2)) })
    },
    setCableElevation: (elevation) => {
      set({ cableElevation: Math.max(0, Math.min(5, elevation)) })
    },
    cancelMepDraft: () => set({ mepDraftFrom: null }),

    clickMepAt: (x, y, elevation) => {
      const now = performance.now()
      if (now - lastMepClickMs < 50) return
      lastMepClickMs = now
      const floor0 = get().activeFloor()
      if (isGroundFloor(floor0)) return
      const tool = get().tool
      const plumbing = get().workbench === 'plumbing' || isPlumbingTool(tool)
      const elev =
        elevation ??
        (plumbing ? get().pipeElevation : get().cableElevation)

      if (isMepFixtureTool(tool)) {
        const electrical =
          tool === 'outlet' || tool === 'switch' || tool === 'panel'
        if (electrical) {
          const existing = findMepNodeNear(
            floor0,
            ensureCableNetwork(floor0.cables).nodes,
            x,
            y,
          )
          const onWall =
            findWallCenterlineNear(floor0, x, y) ||
            (existing && existing.anchor.type === 'wall')
          if (!onWall) {
            set({ statusMessage: 'Укажите стену' })
            return
          }
        }
        get().pushHistory()
        let floor = get().activeFloor()
        if (plumbing) {
          const net = ensurePipeNetwork(floor.pipes)
          const fixture: PipeFixtureKind =
            tool === 'pipeHeater' ? 'heater' : 'valve'
          const resolved = resolveMepEndpoint(
            floor,
            net.nodes,
            net.segments,
            x,
            y,
            elev,
            (anchor, el) => makePipeNode(anchor, el),
            (a, b) =>
              makePipeSegment(a, b, get().pipeMedium, get().pipeDiameterMm),
          )
          const nodes = resolved.nodes.map((n) =>
            n.id === resolved.node.id ? { ...n, fixture } : n,
          )
          floor = { ...floor, pipes: { nodes, segments: resolved.segments } }
          set({
            building: replaceFloor(get().building, floor),
            selection: { kind: 'pipeNode', id: resolved.node.id },
            mepDraftFrom: null,
            statusMessage: null,
          })
          return
        }
        const net = ensureCableNetwork(floor.cables)
        const device: ElectricalDeviceKind =
          tool === 'switch' ? 'switch' : tool === 'panel' ? 'panel' : 'outlet'
        const placed = placeElectricalDevice(floor, net, x, y, elev, device)
        if (!placed) {
          set({ statusMessage: 'Укажите стену' })
          return
        }
        floor = {
          ...floor,
          cables: { nodes: placed.nodes, segments: placed.segments },
        }
        set({
          building: replaceFloor(get().building, floor),
          selection: { kind: 'electricalNode', id: placed.node.id },
          mepDraftFrom: null,
          statusMessage: null,
        })
        return
      }

      if (tool !== 'pipe' && tool !== 'cable') return

      const from = get().mepDraftFrom
      if (!from) {
        get().pushHistory()
        let floor = get().activeFloor()
        if (plumbing) {
          const net = ensurePipeNetwork(floor.pipes)
          const resolved = resolveMepEndpoint(
            floor,
            net.nodes,
            net.segments,
            x,
            y,
            elev,
            (anchor, el) => makePipeNode(anchor, el),
            (a, b) =>
              makePipeSegment(a, b, get().pipeMedium, get().pipeDiameterMm),
          )
          floor = {
            ...floor,
            pipes: { nodes: resolved.nodes, segments: resolved.segments },
          }
          set({
            building: replaceFloor(get().building, floor),
            mepDraftFrom: resolved.node.id,
            selection: { kind: 'pipeNode', id: resolved.node.id },
            statusMessage: null,
          })
          return
        }
        const net = ensureCableNetwork(floor.cables)
        const resolved = resolveMepEndpoint(
          floor,
          net.nodes,
          net.segments,
          x,
          y,
          elev,
          (anchor, el) => makeElectricalNode(anchor, el),
          (a, b) => makeCableSegment(a, b, get().cableSectionMm2),
        )
        floor = {
          ...floor,
          cables: { nodes: resolved.nodes, segments: resolved.segments },
        }
        set({
          building: replaceFloor(get().building, floor),
          mepDraftFrom: resolved.node.id,
          selection: { kind: 'electricalNode', id: resolved.node.id },
          statusMessage: null,
        })
        return
      }

      get().pushHistory()
      let floor = get().activeFloor()
      if (plumbing) {
        const net = ensurePipeNetwork(floor.pipes)
        if (!net.nodes.some((n) => n.id === from)) {
          set({ mepDraftFrom: null, statusMessage: 'Начальная точка потеряна' })
          return
        }
        const resolved = resolveMepEndpoint(
          floor,
          net.nodes,
          net.segments,
          x,
          y,
          elev,
          (anchor, el) => makePipeNode(anchor, el),
          (a, b) =>
            makePipeSegment(a, b, get().pipeMedium, get().pipeDiameterMm),
        )
        const linked = connectMepNodes(
          floor,
          resolved.nodes,
          resolved.segments,
          from,
          resolved.node.id,
          (anchor, el) => makePipeNode(anchor, el),
          (a, b) =>
            makePipeSegment(a, b, get().pipeMedium, get().pipeDiameterMm),
        )
        if (!linked) {
          set({
            mepDraftFrom: resolved.node.id,
            selection: { kind: 'pipeNode', id: resolved.node.id },
            statusMessage: null,
          })
          return
        }
        floor = { ...floor, pipes: linked }
        const lastSeg = linked.segments[linked.segments.length - 1]
        set({
          building: replaceFloor(get().building, floor),
          mepDraftFrom: resolved.node.id,
          selection: lastSeg
            ? { kind: 'pipeSegment', id: lastSeg.id }
            : { kind: 'pipeNode', id: resolved.node.id },
          statusMessage: null,
        })
        return
      }

      const net = ensureCableNetwork(floor.cables)
      if (!net.nodes.some((n) => n.id === from)) {
        set({ mepDraftFrom: null, statusMessage: 'Начальная точка потеряна' })
        return
      }
      const resolved = resolveMepEndpoint(
        floor,
        net.nodes,
        net.segments,
        x,
        y,
        elev,
        (anchor, el) => makeElectricalNode(anchor, el),
        (a, b) => makeCableSegment(a, b, get().cableSectionMm2),
      )
      const linked = connectMepNodes(
        floor,
        resolved.nodes,
        resolved.segments,
        from,
        resolved.node.id,
        (anchor, el) => makeElectricalNode(anchor, el),
        (a, b) => makeCableSegment(a, b, get().cableSectionMm2),
      )
      if (!linked) {
        set({
          mepDraftFrom: resolved.node.id,
          selection: { kind: 'electricalNode', id: resolved.node.id },
          statusMessage: null,
        })
        return
      }
      floor = { ...floor, cables: linked }
      const lastSeg = linked.segments[linked.segments.length - 1]
      set({
        building: replaceFloor(get().building, floor),
        mepDraftFrom: resolved.node.id,
        selection: lastSeg
          ? { kind: 'cableSegment', id: lastSeg.id }
          : { kind: 'electricalNode', id: resolved.node.id },
        statusMessage: null,
      })
    },

    beginMepNodeDrag: () => {
      get().pushHistory()
    },

    dragMepNode: (network, id, x, y, elevation) => {
      const floor0 = get().activeFloor()
      if (isGroundFloor(floor0)) return
      get().updateActiveFloor((floor) => {
        if (network === 'pipes') {
          const net = ensurePipeNetwork(floor.pipes)
          return {
            ...floor,
            pipes: {
              ...net,
              nodes: net.nodes.map((n) =>
                n.id === id ? relocateMepNode(floor, n, x, y, elevation) : n,
              ),
            },
          }
        }
        const net = ensureCableNetwork(floor.cables)
        return {
          ...floor,
          cables: {
            ...net,
            nodes: net.nodes.map((n) =>
              n.id === id ? relocateMepNode(floor, n, x, y, elevation) : n,
            ),
          },
        }
      }, false)
    },

    updatePipeSegment: (id, patch) => {
      get().pushHistory()
      get().updateActiveFloor((floor) => {
        const net = ensurePipeNetwork(floor.pipes)
        return {
          ...floor,
          pipes: {
            ...net,
            segments: net.segments.map((s) =>
              s.id === id
                ? {
                    ...s,
                    ...patch,
                    diameterMm: Math.max(
                      6,
                      Math.min(200, patch.diameterMm ?? s.diameterMm),
                    ),
                  }
                : s,
            ),
          },
        }
      })
    },
    updatePipeNode: (id, patch) => {
      get().pushHistory()
      get().updateActiveFloor((floor) => {
        const net = ensurePipeNetwork(floor.pipes)
        return {
          ...floor,
          pipes: {
            ...net,
            nodes: net.nodes.map((n) => {
              if (n.id !== id) return n
              let anchor = n.anchor
              if (anchor.type === 'wall' && patch.offset != null) {
                anchor = { ...anchor, offset: Math.max(0, patch.offset) }
              }
              if (anchor.type === 'slab') {
                anchor = {
                  ...anchor,
                  x: patch.x ?? anchor.x,
                  y: patch.y ?? anchor.y,
                }
              }
              const elevation =
                anchor.type === 'wall'
                  ? Math.max(0, Math.min(5, patch.elevation ?? n.elevation ?? 0))
                  : undefined
              return {
                ...n,
                anchor,
                fixture: 'fixture' in patch ? patch.fixture : n.fixture,
                elevation,
              }
            }),
          },
        }
      })
    },
    updateCableSegment: (id, patch) => {
      get().pushHistory()
      get().updateActiveFloor((floor) => {
        const net = ensureCableNetwork(floor.cables)
        return {
          ...floor,
          cables: {
            ...net,
            segments: net.segments.map((s) =>
              s.id === id
                ? {
                    ...s,
                    sectionMm2: Math.max(
                      0.75,
                      Math.min(50, patch.sectionMm2 ?? s.sectionMm2),
                    ),
                  }
                : s,
            ),
          },
        }
      })
    },
    updateElectricalNode: (id, patch) => {
      get().pushHistory()
      get().updateActiveFloor((floor) => {
        const net = ensureCableNetwork(floor.cables)
        return {
          ...floor,
          cables: {
            ...net,
            nodes: net.nodes.map((n) => {
              if (n.id !== id) return n
              let anchor = n.anchor
              if (anchor.type === 'wall' && patch.offset != null) {
                anchor = { ...anchor, offset: Math.max(0, patch.offset) }
              }
              if (anchor.type === 'slab') {
                anchor = {
                  ...anchor,
                  x: patch.x ?? anchor.x,
                  y: patch.y ?? anchor.y,
                }
              }
              const elevation =
                anchor.type === 'wall'
                  ? Math.max(0, Math.min(5, patch.elevation ?? n.elevation ?? 0))
                  : undefined
              const device = 'device' in patch ? patch.device : n.device
              if (!device) {
                return { ...n, anchor, device: undefined, elevation }
              }
              const kindChanged = 'device' in patch && patch.device !== n.device
              const sized = ELECTRICAL_DEVICE_SIZE[device]
              const clampM = (v: number, min: number, max: number) =>
                Math.max(min, Math.min(max, v))
              return {
                ...n,
                anchor,
                device,
                elevation,
                side: patch.side ?? n.side ?? 'pos',
                width: clampM(
                  patch.width ?? (kindChanged ? sized.width : (n.width ?? sized.width)),
                  0.02,
                  1.5,
                ),
                height: clampM(
                  patch.height ?? (kindChanged ? sized.height : (n.height ?? sized.height)),
                  0.02,
                  2,
                ),
                depth: clampM(
                  patch.depth ?? (kindChanged ? sized.depth : (n.depth ?? sized.depth)),
                  0.004,
                  0.3,
                ),
              }
            }),
          },
        }
      })
    },

    beginOpening: (x, y) => {
      if (isGroundFloor(get().activeFloor())) return
      const tool = get().tool
      if (!isWallOpeningTool(tool)) return
      const floor = get().activeFloor()
      const wall = hitWall(floor, x, y, 0.3)
      if (!wall) {
        set({ statusMessage: 'Кликните на стену и тяните вдоль неё' })
        return
      }
      const t = offsetAlongWall(floor, wall, x, y)
      if (t == null) return
      set({
        openingDraft: { wallId: wall.id, kind: tool, t0: t, t1: t },
        statusMessage: null,
      })
    },

    updateOpeningDraft: (x, y) => {
      const draft = get().openingDraft
      if (!draft) return
      const floor = get().activeFloor()
      const wall = floor.walls.find((w) => w.id === draft.wallId)
      if (!wall) return
      const t = offsetAlongWall(floor, wall, x, y)
      if (t == null) return
      set({ openingDraft: { ...draft, t1: t } })
    },

    finishOpening: () => {
      const draft = get().openingDraft
      if (!draft) return
      const floor = get().activeFloor()
      const opening = createOpeningFromDrag(
        floor,
        draft.wallId,
        draft.kind,
        draft.t0,
        draft.t1,
      )
      if (!opening) {
        set({
          openingDraft: null,
          statusMessage: 'Стена слишком короткая для проёма',
        })
        return
      }
      get().pushHistory()
      const next: Floor = {
        ...floor,
        openings: [...(floor.openings ?? []), opening],
      }
      set({
        building: replaceFloor(get().building, next),
        openingDraft: null,
        selection: { kind: 'opening', id: opening.id },
        statusMessage: null,
      })
    },

    cancelOpeningDraft: () => set({ openingDraft: null }),

    beginSlabOpening: (x, y) => {
      if (isGroundFloor(get().activeFloor())) return
      if (get().tool !== 'stair') return
      set({
        slabOpeningDraft: { x0: x, y0: y, x1: x, y1: y },
        statusMessage: null,
      })
    },

    updateSlabOpeningDraft: (x, y) => {
      const draft = get().slabOpeningDraft
      if (!draft) return
      set({ slabOpeningDraft: { ...draft, x1: x, y1: y } })
    },

    finishSlabOpening: () => {
      const draft = get().slabOpeningDraft
      if (!draft) return
      const opening = createSlabOpeningFromDrag(
        draft.x0,
        draft.y0,
        draft.x1,
        draft.y1,
        'stair',
      )
      get().pushHistory()
      const floor = get().activeFloor()
      const next: Floor = {
        ...floor,
        slabOpenings: [...(floor.slabOpenings ?? []), opening],
      }
      set({
        building: replaceFloor(get().building, next),
        slabOpeningDraft: null,
        floorPlateDraft: null,
        selection: { kind: 'slabOpening', id: opening.id },
        statusMessage: null,
      })
    },

    cancelSlabOpeningDraft: () => set({ slabOpeningDraft: null }),

    beginFloorPlate: (x, y) => {
      if (isGroundFloor(get().activeFloor())) return
      if (get().tool !== 'floor') return
      set({
        floorPlateDraft: { x0: x, y0: y, x1: x, y1: y },
        statusMessage: null,
      })
    },

    updateFloorPlateDraft: (x, y) => {
      const draft = get().floorPlateDraft
      if (!draft) return
      set({ floorPlateDraft: { ...draft, x1: x, y1: y } })
    },

    finishFloorPlate: () => {
      const draft = get().floorPlateDraft
      if (!draft) return
      const plate = createFloorPlateFromDrag(
        draft.x0,
        draft.y0,
        draft.x1,
        draft.y1,
      )
      get().pushHistory()
      const floor = get().activeFloor()
      const next: Floor = {
        ...floor,
        plates: [...(floor.plates ?? []), plate],
      }
      set({
        building: replaceFloor(get().building, next),
        floorPlateDraft: null,
        selection: { kind: 'floorPlate', id: plate.id },
        statusMessage: null,
      })
    },

    cancelFloorPlateDraft: () => set({ floorPlateDraft: null }),

    updateFloorPlate: (id, patch) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const next = updateFloorPlateFields(floor, id, patch)
      set({ building: replaceFloor(get().building, next) })
    },

    dragFloorPlate: (id, x, y) => {
      const floor = get().activeFloor()
      const next = updateFloorPlateFields(floor, id, { x, y })
      set({
        building: replaceFloor(get().building, next),
        selection: { kind: 'floorPlate', id },
      })
    },

    setFloorPlateMaterial: (id, material) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const next = applyFloorPlateMaterial(floor, id, material)
      set({ building: replaceFloor(get().building, next) })
    },

    selectFloorPlate: (floorId, id) => {
      const floor = get().building.floors.find((f) => f.id === floorId)
      if (!floor?.plates?.some((p) => p.id === id)) return
      set({
        activeFloorId: floorId,
        selection: { kind: 'floorPlate', id },
        wallDraftFrom: null,
        openingDraft: null,
        slabOpeningDraft: null,
        floorPlateDraft: null,
      })
    },

    updateSlabOpening: (id, patch) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const next = updateSlabOpeningFields(floor, id, patch)
      set({ building: replaceFloor(get().building, next) })
    },

    dragSlabOpening: (id, x, y) => {
      const floor = get().activeFloor()
      const next = updateSlabOpeningFields(floor, id, { x, y })
      set({
        building: replaceFloor(get().building, next),
        selection: { kind: 'slabOpening', id },
      })
    },

    setModelBrowserOpen: (modelBrowserOpen) => set({ modelBrowserOpen }),
    setCollectionBrowserOpen: (collectionBrowserOpen) =>
      set({ collectionBrowserOpen }),
    setLibraryTokensOpen: (libraryTokensOpen) => set({ libraryTokensOpen }),
    setTransformGizmoMode: (transformGizmoMode) => set({ transformGizmoMode }),
    cycleTransformGizmoMode: () => {
      const order: TransformGizmoMode[] = ['translate', 'rotate', 'scale']
      const labels = {
        translate: 'Перемещение',
        rotate: 'Вращение',
        scale: 'Масштаб',
      } as const
      const cur = get().transformGizmoMode
      const next = order[(order.indexOf(cur) + 1) % order.length]!
      set({
        transformGizmoMode: next,
        statusMessage: `Gizmo: ${labels[next]}`,
      })
    },
    setTransformDragging: (transformDragging) => set({ transformDragging }),
    setObjectSnapEnabled: (objectSnapEnabled) => set({ objectSnapEnabled }),
    toggleObjectSnap: () =>
      set((s) => ({
        objectSnapEnabled: !s.objectSnapEnabled,
        statusMessage: !s.objectSnapEnabled
          ? 'Привязка к стенам и объектам включена'
          : 'Привязка выключена',
      })),
    setPendingModel: (pendingModel) =>
      set({
        pendingModel,
        workbench: pendingModel
          ? get().workbench === 'landscape'
            ? 'landscape'
            : 'furnish'
          : get().workbench,
        tool: pendingModel ? 'placeObject' : 'select',
        viewMode: pendingModel ? '3d' : get().viewMode,
        modelBrowserOpen: false,
        collectionBrowserOpen: false,
        pendingPlantSpecies: pendingModel ? null : get().pendingPlantSpecies,
        sceneMode:
          pendingModel && get().sceneMode === 'paint'
            ? 'interior'
            : get().sceneMode,
        statusMessage: pendingModel
          ? 'Кликните на плане или полу в 3D, чтобы поставить модель'
          : null,
      }),

    placeObjectAt: (x, y) => {
      const pending = get().pendingModel
      if (!pending) {
        set({
          statusMessage: 'Сначала выберите модель в коллекции слева',
        })
        return
      }
      get().pushHistory()
      const floor = get().activeFloor()
      const s = pending.scale ?? 1
      const sizeX = pending.sizeX ?? 1
      const sizeY = pending.sizeY ?? 1
      const sizeZ = pending.sizeZ ?? 1
      let px = x
      let py = y
      if (get().objectSnapEnabled) {
        const sn = snapObjectXY(floor, px, py, {
          halfSize: {
            x: Math.max(0.05, (sizeX * s) / 2),
            y: Math.max(0.05, (sizeZ * s) / 2),
          },
        })
        px = sn.snappedX ? sn.x : snapToGrid(sn.x)
        py = sn.snappedY ? sn.y : snapToGrid(sn.y)
      } else {
        px = snapToGrid(px)
        py = snapToGrid(py)
      }
      const estimated = estimatePlanHalf({
        sizeX,
        sizeZ,
        scaleX: s,
        scaleZ: s,
        rotationY: 0,
      })
      const obj: PlacedObject = {
        id: createId('obj'),
        model: pending.model,
        x: px,
        y: py,
        elevation: 0,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        scaleX: s,
        scaleY: s,
        scaleZ: s,
        sizeX,
        sizeY,
        sizeZ,
        planHalfX: estimated.x,
        planHalfY: estimated.y,
        attribution: pending.attribution,
        appearance: pending.appearance,
      }
      const next: Floor = {
        ...floor,
        objects: [...(floor.objects ?? []), obj],
      }
      set({
        building: replaceFloor(get().building, next),
        selection: { kind: 'object', id: obj.id },
        transformGizmoMode: 'translate',
        statusMessage: 'Объект размещён',
      })
    },

    updatePlacedObject: (id, patch) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const next: Floor = {
        ...floor,
        objects: (floor.objects ?? []).map((o) => {
          if (o.id !== id) return o
          const merged = { ...o, ...patch }
          const touchesFootprint =
            patch.scaleX != null ||
            patch.scaleY != null ||
            patch.scaleZ != null ||
            patch.rotationX != null ||
            patch.rotationY != null ||
            patch.rotationZ != null ||
            patch.sizeX != null ||
            patch.sizeY != null ||
            patch.sizeZ != null
          const hasMeasuredAabb =
            patch.planHalfX != null || patch.planHalfY != null
          if (touchesFootprint && !hasMeasuredAabb) {
            const h = estimatePlanHalf(merged)
            merged.planHalfX = h.x
            merged.planHalfY = h.y
          }
          return merged
        }),
      }
      set({ building: replaceFloor(get().building, next) })
    },

    dragPlacedObject: (id, x, y) => {
      const floor = get().activeFloor()
      let px = x
      let py = y
      if (get().objectSnapEnabled) {
        const moving = (floor.objects ?? []).find((o) => o.id === id)
        const sn = snapObjectXY(floor, px, py, {
          excludeObjectId: id,
          halfSize: moving ? planHalfSizeOf(moving) : undefined,
        })
        px = sn.x
        py = sn.y
      }
      const next: Floor = {
        ...floor,
        objects: (floor.objects ?? []).map((o) =>
          o.id === id ? { ...o, x: px, y: py } : o,
        ),
      }
      set({
        building: replaceFloor(get().building, next),
        selection: { kind: 'object', id },
      })
    },

    selectObject: (floorId, id) => {
      const prev = get().selection
      const same = prev?.kind === 'object' && prev.id === id
      set({
        activeFloorId: floorId,
        selection: { kind: 'object', id },
        wallDraftFrom: null,
        openingDraft: null,
        slabOpeningDraft: null,
        floorPlateDraft: null,
        // Stop placement mode so gizmo / LMB work on the object
        pendingModel: null,
        tool: 'select',
        workbench: get().workbench === 'landscape' ? 'landscape' : 'furnish',
        viewMode: '3d',
        statusMessage: null,
        // New selection → drag = move; double-click later cycles mode
        ...(same ? {} : { transformGizmoMode: 'translate' as const }),
      })
    },

    selectPlant: (id) => {
      const g = get().building.floors.find(isGroundFloor)
      if (!g) return
      set({
        activeFloorId: g.id,
        selection: { kind: 'plant', id },
        pendingModel: null,
        pendingPlantSpecies: null,
        tool: 'select',
        workbench: 'landscape',
        viewMode: '3d',
        transformGizmoMode: 'translate',
      })
    },

    setSculptMode: (sculptMode) => set({ sculptMode }),
    setLandscapeBrush: (patch) =>
      set({
        landscapeBrushRadius:
          patch.radius ?? get().landscapeBrushRadius,
        landscapeBrushHardness:
          patch.hardness ?? get().landscapeBrushHardness,
        landscapeBrushStrength:
          patch.strength ?? get().landscapeBrushStrength,
      }),
    setGroundPaintLayer: (groundPaintLayer) => set({ groundPaintLayer }),
    setPendingPlant: (species, scale, shape) =>
      set({
        pendingPlantSpecies: species,
        pendingPlantScale: scale ?? get().pendingPlantScale,
        pendingPlantShape: species
          ? resolvePlantShape(
              species,
              shape ??
                (species === get().pendingPlantSpecies
                  ? get().pendingPlantShape
                  : undefined),
            )
          : get().pendingPlantShape,
        pendingModel: species ? null : get().pendingModel,
        tool: species ? 'plant' : get().tool,
        statusMessage: species
          ? 'Кликните по земле, чтобы посадить растение'
          : null,
      }),
    setPendingPlantShape: (patch) => {
      const species = get().pendingPlantSpecies ?? 'ponderosaPine'
      set({
        pendingPlantShape: resolvePlantShape(species, {
          ...get().pendingPlantShape,
          ...patch,
        }),
      })
    },
    setGrassParams: (patch) => {
      const g = get().building.floors.find(isGroundFloor)
      if (!g) return
      const grass = normalizeLandscapeGrass(g.landscapeGrass) ?? emptyGrassDoc()
      const layer =
        findGrassLayer(grass, get().activeGrassLayerId) ?? grass.layers[0]
      if (!layer) return
      const next = replaceGrassLayer(grass, layer.id, {
        density: patch.density ?? layer.density,
        height: patch.height ?? layer.height,
        width: patch.width ?? layer.width,
        color: patch.color ?? layer.color,
        seed: patch.seed ?? layer.seed,
        name: patch.name ?? layer.name,
      })
      const updated = findGrassLayer(next, layer.id)!
      set({
        grassDensity: updated.density,
        grassTuftHeight: updated.height,
        grassTuftWidth: updated.width,
        grassColor: updated.color,
        grassSeed: updated.seed,
        activeGrassLayerId: updated.id,
        building: replaceFloor(get().building, {
          ...g,
          landscapeGrass: next,
        }),
      })
    },
    setActiveGrassLayer: (id) => {
      const g = get().building.floors.find(isGroundFloor)
      const layer = findGrassLayer(g?.landscapeGrass, id)
      if (!layer) return
      set({
        activeGrassLayerId: layer.id,
        grassDensity: layer.density,
        grassTuftHeight: layer.height,
        grassTuftWidth: layer.width,
        grassColor: layer.color,
        grassSeed: layer.seed,
        tool: 'paintGrass',
      })
    },
    addGrassLayer: () => {
      const g = get().building.floors.find(isGroundFloor)
      if (!g) return
      const grass = normalizeLandscapeGrass(g.landscapeGrass) ?? emptyGrassDoc()
      if (grass.layers.length >= MAX_GRASS_LAYERS) return
      get().pushHistory()
      const layer = createGrassLayer(nextGrassPreset(grass.layers))
      const next: LandscapeGrass = {
        ...grass,
        layers: [...grass.layers, layer],
      }
      set({
        activeGrassLayerId: layer.id,
        grassDensity: layer.density,
        grassTuftHeight: layer.height,
        grassTuftWidth: layer.width,
        grassColor: layer.color,
        grassSeed: layer.seed,
        tool: 'paintGrass',
        building: replaceFloor(get().building, {
          ...g,
          landscapeGrass: next,
        }),
        statusMessage: `Новый тип: ${layer.name}. Красьте кистью там, где он нужен.`,
      })
    },
    removeGrassLayer: (id) => {
      const g = get().building.floors.find(isGroundFloor)
      if (!g) return
      const grass = normalizeLandscapeGrass(g.landscapeGrass)
      if (!grass || grass.layers.length <= 1) return
      get().pushHistory()
      const next: LandscapeGrass = {
        ...grass,
        layers: grass.layers.filter((l) => l.id !== id),
      }
      const layer = findGrassLayer(next, get().activeGrassLayerId === id ? next.layers[0]?.id : get().activeGrassLayerId)
      set({
        building: replaceFloor(get().building, {
          ...g,
          landscapeGrass: next,
        }),
        ...(layer
          ? {
              activeGrassLayerId: layer.id,
              grassDensity: layer.density,
              grassTuftHeight: layer.height,
              grassTuftWidth: layer.width,
              grassColor: layer.color,
              grassSeed: layer.seed,
            }
          : {}),
      })
    },
    renameGrassLayer: (id, name) => {
      const g = get().building.floors.find(isGroundFloor)
      if (!g?.landscapeGrass) return
      set({
        building: replaceFloor(get().building, {
          ...g,
          landscapeGrass: replaceGrassLayer(g.landscapeGrass, id, { name }),
        }),
      })
    },

    ensureLandscapeReady: () => {
      const { building } = get()
      const g = building.floors.find(isGroundFloor)
      if (!g) return
      const terrain = ensureTerrain(building, g.landscapeTerrain)
      const grass = normalizeLandscapeGrass(g.landscapeGrass)
      const layer = findGrassLayer(grass, get().activeGrassLayerId)
      const patch: {
        building?: Building
        grassDensity?: number
        grassTuftHeight?: number
        grassTuftWidth?: number
        grassColor?: string
        grassSeed?: number
        activeGrassLayerId?: string
      } = {}
      if (grass && !g.landscapeGrass?.layers) {
        patch.building = replaceFloor(building, { ...g, landscapeGrass: grass })
      }
      if (layer) {
        patch.grassDensity = layer.density
        patch.grassTuftHeight = layer.height
        patch.grassTuftWidth = layer.width
        patch.grassColor = layer.color
        patch.grassSeed = layer.seed
        patch.activeGrassLayerId = layer.id
      }
      if (g.landscapeTerrain !== terrain) {
        const base = patch.building ?? building
        const floor = base.floors.find(isGroundFloor) ?? g
        patch.building = replaceFloor(base, { ...floor, landscapeTerrain: terrain })
      }
      if (Object.keys(patch).length > 0) set(patch)
    },

    beginLandscapeStroke: () => {
      get().ensureLandscapeReady()
      get().pushHistory()
    },

    stampSculptAt: (x, y, flattenTarget) => {
      const g = get().building.floors.find(isGroundFloor)
      if (!g) return
      const terrain = ensureTerrain(get().building, g.landscapeTerrain)
      const res = terrain.resolution
      const heights = decodeHeights(terrain.heightPng, res * res)
      const frame = terrainFrame(terrain)
      const lock = buildLockMask(
        res,
        frame,
        footprintHolesForLock(get().building),
      )
      sculptStamp(
        heights,
        res,
        frame,
        x,
        y,
        get().landscapeBrushRadius,
        get().landscapeBrushHardness,
        get().landscapeBrushStrength,
        get().sculptMode,
        lock,
        flattenTarget ?? 0,
      )
      set({
        building: replaceFloor(get().building, {
          ...g,
          landscapeTerrain: persistHeights(terrain, heights),
        }),
      })
    },

    setGroundPaintLayerMaterial: (layer, material) => {
      const g = get().building.floors.find(isGroundFloor)
      if (!g) return
      get().pushHistory()
      const layers: [
        MaterialRef | null,
        MaterialRef | null,
        MaterialRef | null,
        MaterialRef | null,
      ] = [
        g.landscapePaint?.layers[0] ?? null,
        g.landscapePaint?.layers[1] ?? null,
        g.landscapePaint?.layers[2] ?? null,
        g.landscapePaint?.layers[3] ?? null,
      ]
      layers[layer] = material
      set({
        building: replaceFloor(get().building, {
          ...g,
          landscapePaint: {
            layers,
            splatPng: g.landscapePaint?.splatPng,
            resolution: g.landscapePaint?.resolution ?? 256,
          },
        }),
        paintBrush: material,
        groundPaintLayer: layer,
      })
    },

    stampGroundPaintAt: (x, y, erase) => {
      const g = get().building.floors.find(isGroundFloor)
      if (!g) return
      const res = g.landscapePaint?.resolution ?? 256
      const data = decodeBytes(g.landscapePaint?.splatPng, res * res * 4)
      const terrain = ensureTerrain(get().building, g.landscapeTerrain)
      const lock = buildLockMask(
        res,
        terrainFrame(terrain),
        footprintHolesForLock(get().building),
      )
      stampSplat(
        data,
        res,
        terrainFrame(terrain),
        x,
        y,
        get().landscapeBrushRadius,
        get().landscapeBrushHardness,
        get().landscapeBrushStrength,
        get().groundPaintLayer,
        erase,
        lock,
      )
      set({
        building: replaceFloor(get().building, {
          ...g,
          landscapePaint: {
            layers: g.landscapePaint?.layers ?? [null, null, null, null],
            splatPng: encodeBytes(data),
            resolution: res,
          },
        }),
      })
    },

    stampGrassAt: (x, y, erase) => {
      const g = get().building.floors.find(isGroundFloor)
      if (!g) return
      const grass = normalizeLandscapeGrass(g.landscapeGrass) ?? emptyGrassDoc()
      const layer =
        findGrassLayer(grass, get().activeGrassLayerId) ??
        grass.layers[0] ??
        createGrassLayer()
      const layers = grass.layers.some((l) => l.id === layer.id)
        ? grass.layers
        : [...grass.layers, layer]
      const res = grass.resolution
      const data = decodeBytes(layer.coveragePng, res * res)
      const terrain = ensureTerrain(get().building, g.landscapeTerrain)
      const lock = buildLockMask(
        res,
        terrainFrame(terrain),
        footprintHolesForLock(get().building),
      )
      stampCoverage(
        data,
        res,
        terrainFrame(terrain),
        x,
        y,
        get().landscapeBrushRadius,
        get().landscapeBrushHardness,
        get().landscapeBrushStrength,
        erase,
        lock,
      )
      set({
        activeGrassLayerId: layer.id,
        building: replaceFloor(get().building, {
          ...g,
          landscapeGrass: {
            resolution: res,
            layers: layers.map((l) =>
              l.id === layer.id
                ? { ...l, coveragePng: encodeBytes(data) }
                : l,
            ),
          },
        }),
      })
    },

    placePlantAt: (x, y) => {
      const species = get().pendingPlantSpecies
      if (!species) {
        set({ statusMessage: 'Сначала выберите вид слева' })
        return
      }
      const g = get().building.floors.find(isGroundFloor)
      if (!g) return
      if (pointInFootprint(get().building, x, y)) {
        set({ statusMessage: 'Нельзя сажать на пятне здания' })
        return
      }
      get().pushHistory()
      const plant: LandscapePlant = {
        id: createId('plt'),
        species,
        seed: 1 + Math.floor(Math.random() * 9998),
        x,
        y,
        rotationY: Math.random() * Math.PI * 2,
        scale: get().pendingPlantScale,
        shape: { ...get().pendingPlantShape },
      }
      set({
        building: replaceFloor(get().building, {
          ...g,
          plants: [...(g.plants ?? []), plant],
        }),
        selection: { kind: 'plant', id: plant.id },
        statusMessage: 'Растение посажено',
      })
    },

    updatePlant: (id, patch) => {
      const g = get().building.floors.find(isGroundFloor)
      if (!g) return
      get().pushHistory()
      set({
        building: replaceFloor(get().building, {
          ...g,
          plants: (g.plants ?? []).map((p) => {
            if (p.id !== id) return p
            const { shape, ...rest } = patch
            const species = rest.species ?? p.species
            return {
              ...p,
              ...rest,
              shape: shape
                ? resolvePlantShape(species, { ...p.shape, ...shape })
                : p.shape,
            }
          }),
        }),
      })
    },

    updateOpening: (id, patch) => {
      get().pushHistory()
      const floor = get().activeFloor()
      let nextPatch = { ...patch }
      if (patch.kind) {
        const existing = (floor.openings ?? []).find((o) => o.id === id)
        if (existing && existing.kind !== patch.kind) {
          const defs = openingDefaults(patch.kind, floor.height)
          nextPatch = {
            ...nextPatch,
            height: defs.height,
            sillHeight: defs.sillHeight,
          }
        }
      }
      const next = updateOpeningFields(floor, id, nextPatch)
      set({ building: replaceFloor(get().building, next) })
    },

    dragOpening: (id, x, y) => {
      const floor = get().activeFloor()
      const opening = (floor.openings ?? []).find((o) => o.id === id)
      if (!opening) return
      const wall = floor.walls.find((w) => w.id === opening.wallId)
      if (!wall) return
      const t = offsetAlongWall(floor, wall, x, y)
      if (t == null) return
      const next = updateOpeningFields(floor, id, { offset: t })
      set({
        building: replaceFloor(get().building, next),
        selection: { kind: 'opening', id },
      })
    },

    selectAt: (x, y) => {
      const floor = get().activeFloor()
      if (isMepWorkbench(get().workbench)) {
        if (get().workbench === 'plumbing') {
          const net = ensurePipeNetwork(floor.pipes)
          const node = findMepNodeNear(floor, net.nodes, x, y)
          if (node) {
            set({ selection: { kind: 'pipeNode', id: node.id } })
            return
          }
          const hit = findMepSegmentNear(floor, net.nodes, net.segments, x, y)
          if (hit) {
            set({ selection: { kind: 'pipeSegment', id: hit.segment.id } })
            return
          }
          set({ selection: null })
          return
        }
        const net = ensureCableNetwork(floor.cables)
        const node = findMepNodeNear(floor, net.nodes, x, y)
        if (node) {
          set({ selection: { kind: 'electricalNode', id: node.id } })
          return
        }
        const hit = findMepSegmentNear(floor, net.nodes, net.segments, x, y)
        if (hit) {
          set({ selection: { kind: 'cableSegment', id: hit.segment.id } })
          return
        }
        set({ selection: null })
        return
      }
      const vertex = floor.vertices.find((v) => Math.hypot(v.x - x, v.y - y) <= 0.2)
      if (vertex) {
        set({ selection: { kind: 'vertex', id: vertex.id } })
        return
      }
      const obj = (floor.objects ?? []).find((o) => {
        const half = planHalfSizeOf(o)
        return (
          Math.abs(o.x - x) <= half.x && Math.abs(o.y - y) <= half.y
        )
      })
      if (obj) {
        set({ selection: { kind: 'object', id: obj.id } })
        return
      }
      const slab = hitSlabOpening(floor, x, y)
      if (slab) {
        set({ selection: { kind: 'slabOpening', id: slab.id } })
        return
      }
      const plate = hitFloorPlate(floor, x, y)
      if (plate) {
        set({ selection: { kind: 'floorPlate', id: plate.id } })
        return
      }
      const opening = hitOpening(floor, x, y)
      if (opening) {
        set({ selection: { kind: 'opening', id: opening.id } })
        return
      }
      const wall = hitWall(floor, x, y)
      if (wall) {
        set({ selection: { kind: 'wall', id: wall.id } })
        return
      }
      const room = hitRoom(floor, x, y)
      if (room) {
        set({ selection: { kind: 'room', key: room.key } })
        return
      }
      set({ selection: null })
    },

    selectInRect: (minX, minY, maxX, maxY) => {
      const floor = get().activeFloor()
      const x0 = Math.min(minX, maxX)
      const x1 = Math.max(minX, maxX)
      const y0 = Math.min(minY, maxY)
      const y1 = Math.max(minY, maxY)
      const vertexIds = floor.vertices
        .filter((v) => v.x >= x0 && v.x <= x1 && v.y >= y0 && v.y <= y1)
        .map((v) => v.id)
      if (vertexIds.length === 0) {
        set({ selection: null })
        return
      }
      const idSet = new Set(vertexIds)
      const wallIds = floor.walls
        .filter((w) => idSet.has(w.a) && idSet.has(w.b))
        .map((w) => w.id)
      if (vertexIds.length === 1 && wallIds.length === 0) {
        set({ selection: { kind: 'vertex', id: vertexIds[0] } })
        return
      }
      set({ selection: { kind: 'multi', vertexIds, wallIds } })
    },

    applyConstraintTool: (x, y) => {
      const tool = get().tool
      const floor = get().activeFloor()

      if (tool === 'lockPoint') {
        const vertex = floor.vertices.find((v) => Math.hypot(v.x - x, v.y - y) <= 0.25)
        if (!vertex) return
        get().toggleFixedPosition(vertex.id)
        set({ selection: { kind: 'vertex', id: vertex.id } })
        return
      }

      const wall = hitWall(floor, x, y, 0.25)
      if (!wall) return
      set({ selection: { kind: 'wall', id: wall.id } })
      if (tool === 'lockLength') get().toggleFixedLength(wall.id)
      if (tool === 'horizontal') get().toggleAxis(wall.id, 'horizontal')
      if (tool === 'vertical') get().toggleAxis(wall.id, 'vertical')
    },

    dragVertex: (vertexId, x, y) => {
      const floor = get().activeFloor()
      if (hasFixedPosition(floor.constraints, vertexId)) {
        set({ conflict: true, statusMessage: 'Вершина закреплена' })
        return
      }
      const result = applyDragWithConstraints(
        floor,
        vertexId,
        snapToGrid(x, 0.05),
        snapToGrid(y, 0.05),
      )
      set({
        building: replaceFloor(get().building, result.floor),
        conflict: result.conflict,
        statusMessage: result.conflict ? 'Конфликт ограничений' : null,
      })
    },

    dragSelection: (anchorId, x, y, startPositions) => {
      const floor = get().activeFloor()
      const start = startPositions[anchorId]
      if (!start) return
      const dx = snapToGrid(x, 0.05) - start.x
      const dy = snapToGrid(y, 0.05) - start.y
      const targets: Array<{ vertexId: string; x: number; y: number }> = []
      for (const [id, pos] of Object.entries(startPositions)) {
        if (hasFixedPosition(floor.constraints, id)) continue
        targets.push({ vertexId: id, x: pos.x + dx, y: pos.y + dy })
      }
      if (targets.length === 0) return
      const result = applyMultiDrag(floor, targets)
      set({
        building: replaceFloor(get().building, result.floor),
        conflict: result.conflict,
        statusMessage: result.conflict ? 'Конфликт ограничений' : null,
      })
    },

    endDrag: () => {
      const floor = get().activeFloor()
      const snapped: Floor = {
        ...floor,
        vertices: floor.vertices.map((v) => ({
          ...v,
          x: snapToGrid(v.x, 0.05),
          y: snapToGrid(v.y, 0.05),
        })),
      }
      // Re-solve so length constraints snap exactly after drag
      const solved = solveFloor(snapped, { rough: false })
      set({
        building: replaceFloor(get().building, solved.floor),
        conflict: solved.conflict,
        statusMessage: solved.conflict ? 'Конфликт ограничений' : null,
      })
    },

    toggleFixedLength: (wallId) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const wall = floor.walls.find((w) => w.id === wallId)
      if (!wall) return
      let constraints: Constraint[]
      if (hasFixedLength(floor.constraints, wallId)) {
        constraints = floor.constraints.filter(
          (c) => !(c.type === 'fixedLength' && c.wallId === wallId),
        )
      } else {
        const length = wallLength(floor, wall)
        constraints = [
          ...floor.constraints,
          {
            id: createId('c'),
            type: 'fixedLength',
            wallId,
            length,
          },
        ]
      }
      const solved = solveFloor({ ...floor, constraints })
      set({
        building: replaceFloor(get().building, solved.floor),
        conflict: solved.conflict,
        statusMessage: solved.conflict ? 'Конфликт ограничений' : null,
      })
    },

    toggleFixedPosition: (vertexId) => {
      get().pushHistory()
      const floor = get().activeFloor()
      let constraints: Constraint[]
      if (hasFixedPosition(floor.constraints, vertexId)) {
        constraints = floor.constraints.filter(
          (c) => !(c.type === 'fixedPosition' && c.vertexId === vertexId),
        )
      } else {
        constraints = [
          ...floor.constraints,
          {
            id: createId('c'),
            type: 'fixedPosition',
            vertexId,
          },
        ]
      }
      const solved = solveFloor({ ...floor, constraints })
      set({
        building: replaceFloor(get().building, solved.floor),
        conflict: solved.conflict,
        statusMessage: solved.conflict ? 'Конфликт ограничений' : null,
      })
    },

    toggleAxis: (wallId, type) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const opposite = type === 'horizontal' ? 'vertical' : 'horizontal'
      let constraints = floor.constraints.filter(
        (c) => !(c.type === opposite && c.wallId === wallId),
      )
      if (hasAxisConstraint(constraints, wallId, type)) {
        constraints = constraints.filter((c) => !(c.type === type && c.wallId === wallId))
      } else {
        constraints = [...constraints, { id: createId('c'), type, wallId }]
      }
      const solved = solveFloor({ ...floor, constraints })
      set({
        building: replaceFloor(get().building, solved.floor),
        conflict: solved.conflict,
        statusMessage: solved.conflict ? 'Конфликт ограничений' : null,
      })
    },

    setWallThickness: (wallId, thickness) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const next = {
        ...floor,
        walls: floor.walls.map((w) =>
          w.id === wallId ? { ...w, thickness: Math.max(0.1, Math.min(0.6, thickness)) } : w,
        ),
      }
      // Thickness changes face↔center mapping for distance constraints
      const needsSolve = next.constraints.some(
        (c) => c.type === 'wallDistance' || c.type === 'vertexDistance',
      )
      if (needsSolve) {
        const solved = solveFloor(next)
        set({
          building: replaceFloor(get().building, solved.floor),
          conflict: solved.conflict,
          statusMessage: solved.conflict ? 'Конфликт ограничений' : null,
        })
      } else {
        set({ building: replaceFloor(get().building, next) })
      }
    },

    setWallSideMaterial: (wallId, side, material) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const next = {
        ...floor,
        walls: floor.walls.map((w) => {
          if (w.id !== wallId) return w
          const materials = { ...w.materials }
          if (material == null) {
            delete materials[side]
          } else {
            materials[side] = material
          }
          const hasAny =
            materials.pos != null ||
            materials.neg != null ||
            materials.cut != null
          return {
            ...w,
            materials: hasAny ? materials : undefined,
          }
        }),
      }
      set({ building: replaceFloor(get().building, next) })
    },

    setWallCutMaterial: (wallId, material) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const next = {
        ...floor,
        walls: floor.walls.map((w) => {
          if (w.id !== wallId) return w
          const materials = { ...w.materials }
          if (material == null) {
            delete materials.cut
          } else {
            materials.cut = material
          }
          const hasAny =
            materials.pos != null ||
            materials.neg != null ||
            materials.cut != null
          return {
            ...w,
            materials: hasAny ? materials : undefined,
          }
        }),
      }
      set({ building: replaceFloor(get().building, next) })
    },

    setWallBothMaterials: (wallId, material) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const next = {
        ...floor,
        walls: floor.walls.map((w) => {
          if (w.id !== wallId) return w
          if (material == null) {
            const materials = { ...w.materials }
            delete materials.pos
            delete materials.neg
            const hasAny = materials.cut != null
            return {
              ...w,
              materials: hasAny ? materials : undefined,
            }
          }
          return {
            ...w,
            materials: {
              ...w.materials,
              pos: material,
              neg: material,
            },
          }
        }),
      }
      set({ building: replaceFloor(get().building, next) })
    },

    setRoomFloorMaterial: (roomKey, material) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const plateId = floorPlateIdFromKey(roomKey)
      if (plateId) {
        const next = applyFloorPlateMaterial(floor, plateId, material)
        set({ building: replaceFloor(get().building, next) })
        return
      }
      const map = { ...(floor.roomFloorMaterials ?? {}) }
      if (material == null) {
        delete map[roomKey]
      } else {
        map[roomKey] = material
      }
      const next = {
        ...floor,
        roomFloorMaterials:
          Object.keys(map).length > 0 ? map : undefined,
      }
      set({ building: replaceFloor(get().building, next) })
    },

    setRoomWallsMaterial: (roomKey, material) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const room = detectRooms(floor).find((r) => r.key === roomKey)
      if (!room) return
      const sideByWall = new Map(
        room.edges.map((e) => [e.wallId, e.side] as const),
      )
      const next = {
        ...floor,
        walls: floor.walls.map((w) => {
          const side = sideByWall.get(w.id)
          if (!side) return w
          const materials = { ...w.materials }
          if (material == null) {
            delete materials[side]
          } else {
            materials[side] = material
          }
          const hasAny =
            materials.pos != null ||
            materials.neg != null ||
            materials.cut != null
          return {
            ...w,
            materials: hasAny ? materials : undefined,
          }
        }),
      }
      set({ building: replaceFloor(get().building, next) })
    },

    setSlabOpeningMaterial: (openingId, material) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const next = {
        ...floor,
        slabOpenings: (floor.slabOpenings ?? []).map((o) => {
          if (o.id !== openingId) return o
          if (material == null) {
            const { material: _drop, ...rest } = o
            return rest
          }
          return { ...o, material }
        }),
      }
      set({ building: replaceFloor(get().building, next) })
    },

    selectRoom: (key) => {
      set({ selection: { kind: 'room', key } })
    },

    setFixedLengthValue: (wallId, length) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const L = Math.max(0.5, length)
      let constraints = floor.constraints.map((c) =>
        c.type === 'fixedLength' && c.wallId === wallId ? { ...c, length: L } : c,
      )
      if (!hasFixedLength(constraints, wallId)) {
        constraints = [
          ...constraints,
          { id: createId('c'), type: 'fixedLength', wallId, length: L },
        ]
      }
      const solved = solveFloor({ ...floor, constraints })
      set({
        building: replaceFloor(get().building, solved.floor),
        conflict: solved.conflict,
        statusMessage: solved.conflict ? 'Конфликт ограничений' : null,
      })
    },

    setWallDistance: (wallA, wallB, distance, face) => {
      const floor = get().activeFloor()
      const axis = wallsShareAxis(floor, wallA, wallB)
      if (!axis) {
        set({
          statusMessage:
            'Обе стены должны быть горизонтальными или обе вертикальными',
        })
        return
      }
      get().pushHistory()
      const D = Math.max(0.05, distance)
      let constraints = floor.constraints.filter(
        (c) =>
          !(
            c.type === 'wallDistance' &&
            ((c.wallA === wallA && c.wallB === wallB) ||
              (c.wallA === wallB && c.wallB === wallA))
          ),
      )
      constraints = [
        ...constraints,
        {
          id: createId('c'),
          type: 'wallDistance',
          wallA,
          wallB,
          distance: D,
          face,
        },
      ]
      const solved = solveFloor({ ...floor, constraints })
      set({
        building: replaceFloor(get().building, solved.floor),
        conflict: solved.conflict,
        statusMessage: solved.conflict
          ? 'Конфликт ограничений'
          : `Расстояние (${face}): ${D.toFixed(2)} м`,
      })
    },

    clearWallDistance: (wallA, wallB) => {
      get().pushHistory()
      const floor = get().activeFloor()
      set({
        building: replaceFloor(get().building, {
          ...floor,
          constraints: floor.constraints.filter(
            (c) =>
              !(
                c.type === 'wallDistance' &&
                ((c.wallA === wallA && c.wallB === wallB) ||
                  (c.wallA === wallB && c.wallB === wallA))
              ),
          ),
        }),
      })
    },

    setVertexDistance: (vertexA, vertexB, distance, face) => {
      if (vertexA === vertexB) return
      get().pushHistory()
      const floor = get().activeFloor()
      const D = Math.max(0.05, distance)
      let constraints = floor.constraints.filter(
        (c) =>
          !(
            c.type === 'vertexDistance' &&
            ((c.vertexA === vertexA && c.vertexB === vertexB) ||
              (c.vertexA === vertexB && c.vertexB === vertexA))
          ),
      )
      constraints = [
        ...constraints,
        {
          id: createId('c'),
          type: 'vertexDistance',
          vertexA,
          vertexB,
          distance: D,
          face,
        },
      ]
      const solved = solveFloor({ ...floor, constraints })
      set({
        building: replaceFloor(get().building, solved.floor),
        conflict: solved.conflict,
        statusMessage: solved.conflict
          ? 'Конфликт ограничений'
          : `Расстояние точек (${face}): ${D.toFixed(2)} м`,
      })
    },

    clearVertexDistance: (vertexA, vertexB) => {
      get().pushHistory()
      const floor = get().activeFloor()
      set({
        building: replaceFloor(get().building, {
          ...floor,
          constraints: floor.constraints.filter(
            (c) =>
              !(
                c.type === 'vertexDistance' &&
                ((c.vertexA === vertexA && c.vertexB === vertexB) ||
                  (c.vertexA === vertexB && c.vertexB === vertexA))
              ),
          ),
        }),
      })
    },

    setPointsAligned: (vertexIds, axis) => {
      const unique = [...new Set(vertexIds)]
      if (unique.length < 2) return
      get().pushHistory()
      const floor = get().activeFloor()
      const type = axis === 'horizontal' ? 'pointsHorizontal' : 'pointsVertical'
      const opposite =
        axis === 'horizontal' ? 'pointsVertical' : 'pointsHorizontal'
      // Drop opposite align on the same set; replace same-type match
      let constraints = floor.constraints.filter(
        (c) =>
          !(
            (c.type === type || c.type === opposite) &&
            c.vertexIds.length === unique.length &&
            unique.every((id) => c.vertexIds.includes(id))
          ),
      )
      constraints = [
        ...constraints,
        { id: createId('c'), type, vertexIds: unique },
      ]
      const solved = solveFloor({ ...floor, constraints })
      set({
        building: replaceFloor(get().building, solved.floor),
        conflict: solved.conflict,
        statusMessage: solved.conflict
          ? 'Конфликт ограничений'
          : axis === 'horizontal'
            ? 'Точки на одной горизонтали'
            : 'Точки на одной вертикали',
      })
    },

    clearPointsAligned: (vertexIds, axis) => {
      const unique = [...new Set(vertexIds)]
      get().pushHistory()
      const floor = get().activeFloor()
      const type = axis === 'horizontal' ? 'pointsHorizontal' : 'pointsVertical'
      const solved = solveFloor({
        ...floor,
        constraints: floor.constraints.filter(
          (c) =>
            !(
              c.type === type &&
              c.vertexIds.length === unique.length &&
              unique.every((id) => c.vertexIds.includes(id))
            ),
        ),
      })
      set({
        building: replaceFloor(get().building, solved.floor),
        conflict: solved.conflict,
        statusMessage: null,
      })
    },

    setPointOnWall: (vertexId, wallId) => {
      const floor = get().activeFloor()
      const wall = floor.walls.find((w) => w.id === wallId)
      const vertex = floor.vertices.find((v) => v.id === vertexId)
      if (!wall || !vertex) return
      if (wall.a === vertexId || wall.b === vertexId) {
        set({
          statusMessage: 'Точка уже является концом этой стены',
        })
        return
      }
      get().pushHistory()
      let constraints = floor.constraints.filter(
        (c) =>
          !(
            c.type === 'pointOnWall' &&
            c.vertexId === vertexId &&
            c.wallId === wallId
          ),
      )
      constraints = [
        ...constraints,
        { id: createId('c'), type: 'pointOnWall', vertexId, wallId },
      ]
      const solved = solveFloor({ ...floor, constraints })
      set({
        building: replaceFloor(get().building, solved.floor),
        conflict: solved.conflict,
        statusMessage: solved.conflict
          ? 'Конфликт ограничений'
          : 'Точка прикреплена к стене',
        selection: {
          kind: 'multi',
          vertexIds: [vertexId],
          wallIds: [wallId],
        },
      })
    },

    clearPointOnWall: (vertexId, wallId) => {
      get().pushHistory()
      const floor = get().activeFloor()
      set({
        building: replaceFloor(get().building, {
          ...floor,
          constraints: floor.constraints.filter(
            (c) =>
              !(
                c.type === 'pointOnWall' &&
                c.vertexId === vertexId &&
                c.wallId === wallId
              ),
          ),
        }),
        statusMessage: null,
      })
    },

    selectEdgePoint: (x, y, shift = false) => {
      const floor = get().activeFloor()
      const edge = findWallEdgeNear(floor, x, y)
      if (!edge) return false
      const split = splitWallAt(floor, edge.wall.id, edge.x, edge.y)
      if (!split) return false
      get().pushHistory()
      set({
        building: replaceFloor(get().building, split.floor),
        statusMessage: 'Точка на ребре выделена',
      })
      get().toggleSelectVertex(split.vertex.id, shift)
      return true
    },

    removeConstraint: (constraintId) => {
      get().pushHistory()
      const floor = get().activeFloor()
      const constraints = floor.constraints.filter((c) => c.id !== constraintId)
      const solved = solveFloor({ ...floor, constraints })
      set({
        building: replaceFloor(get().building, solved.floor),
        conflict: solved.conflict,
        statusMessage: null,
      })
    },

    toggleSelectWall: (wallId, shift) => {
      const { selection } = get()
      if (!shift) {
        set({ selection: { kind: 'wall', id: wallId } })
        return
      }
      const verts = new Set(
        selection
          ? selection.kind === 'vertex'
            ? [selection.id]
            : selection.kind === 'multi'
              ? selection.vertexIds
              : []
          : [],
      )
      const walls = new Set(selectedWallIds(selection))
      if (walls.has(wallId)) walls.delete(wallId)
      else walls.add(wallId)
      const vertexIds = [...verts]
      const wallIds = [...walls]
      if (wallIds.length === 0 && vertexIds.length === 0) {
        set({ selection: null })
      } else if (wallIds.length === 1 && vertexIds.length === 0) {
        set({ selection: { kind: 'wall', id: wallIds[0] } })
      } else if (wallIds.length === 0 && vertexIds.length === 1) {
        set({ selection: { kind: 'vertex', id: vertexIds[0] } })
      } else {
        set({ selection: { kind: 'multi', vertexIds, wallIds } })
      }
    },

    toggleSelectVertex: (vertexId, shift) => {
      const { selection } = get()
      if (!shift) {
        set({ selection: { kind: 'vertex', id: vertexId } })
        return
      }
      const verts = new Set(
        selection
          ? selection.kind === 'vertex'
            ? [selection.id]
            : selection.kind === 'multi'
              ? [...selection.vertexIds]
              : []
          : [],
      )
      const walls = new Set(selectedWallIds(selection))
      if (verts.has(vertexId)) verts.delete(vertexId)
      else verts.add(vertexId)
      const vertexIds = [...verts]
      const wallIds = [...walls]
      if (vertexIds.length === 0 && wallIds.length === 0) {
        set({ selection: null })
      } else if (vertexIds.length === 1 && wallIds.length === 0) {
        set({ selection: { kind: 'vertex', id: vertexIds[0] } })
      } else if (vertexIds.length === 0 && wallIds.length === 1) {
        set({ selection: { kind: 'wall', id: wallIds[0] } })
      } else {
        set({ selection: { kind: 'multi', vertexIds, wallIds } })
      }
    },

    deleteSelection: () => {
      const { selection } = get()
      if (!selection) return
      get().pushHistory()
      let floor = get().activeFloor()
      if (selection.kind === 'opening') {
        floor = {
          ...floor,
          openings: (floor.openings ?? []).filter((o) => o.id !== selection.id),
        }
      } else if (selection.kind === 'slabOpening') {
        floor = {
          ...floor,
          slabOpenings: (floor.slabOpenings ?? []).filter(
            (o) => o.id !== selection.id,
          ),
        }
      } else if (selection.kind === 'floorPlate') {
        floor = {
          ...floor,
          plates: (floor.plates ?? []).filter((p) => p.id !== selection.id),
        }
      } else if (selection.kind === 'object') {
        floor = {
          ...floor,
          objects: (floor.objects ?? []).filter((o) => o.id !== selection.id),
        }
      } else if (selection.kind === 'plant') {
        const g = get().building.floors.find(isGroundFloor) ?? floor
        floor = {
          ...g,
          plants: (g.plants ?? []).filter((p) => p.id !== selection.id),
        }
      } else if (selection.kind === 'pipeSegment') {
        const net = ensurePipeNetwork(floor.pipes)
        floor = {
          ...floor,
          pipes: { ...net, segments: removeMepSegment(net.segments, selection.id) },
        }
      } else if (selection.kind === 'pipeNode') {
        const net = ensurePipeNetwork(floor.pipes)
        const next = removeMepNode(net.nodes, net.segments, selection.id)
        floor = { ...floor, pipes: next }
      } else if (selection.kind === 'cableSegment') {
        const net = ensureCableNetwork(floor.cables)
        floor = {
          ...floor,
          cables: { ...net, segments: removeMepSegment(net.segments, selection.id) },
        }
      } else if (selection.kind === 'electricalNode') {
        const net = ensureCableNetwork(floor.cables)
        const next = removeMepNode(net.nodes, net.segments, selection.id)
        floor = { ...floor, cables: next }
      } else if (selection.kind === 'wall') {
        floor = removeWall(floor, selection.id)
      } else if (selection.kind === 'vertex') {
        floor = removeVertex(floor, selection.id)
      } else if (selection.kind === 'multi') {
        for (const wid of selection.wallIds) {
          floor = removeWall(floor, wid)
        }
        for (const vid of selection.vertexIds) {
          floor = removeVertex(floor, vid)
        }
      }
      set({
        building: replaceFloor(get().building, floor),
        selection: null,
      })
    },

    mergeSelectedVertices: () => {
      const ids = selectedVertexIds(get().selection)
      if (ids.length !== 2) {
        set({
          statusMessage: 'Выделите ровно 2 точки (Shift+клик)',
        })
        return
      }
      const [idA, idB] = ids
      const floor0 = get().activeFloor()
      if (
        !floor0.vertices.some((v) => v.id === idA) ||
        !floor0.vertices.some((v) => v.id === idB)
      ) {
        set({ statusMessage: 'Точки не найдены' })
        return
      }
      const degree = (id: string) =>
        floor0.walls.filter((w) => w.a === id || w.b === id).length
      const keepId = degree(idA) >= degree(idB) ? idA : idB
      const removeId = keepId === idA ? idB : idA

      get().pushHistory()
      const merged = mergeVertices(floor0, keepId, removeId, {
        position: 'mid',
      })
      const solved = solveFloor(merged)
      set({
        building: replaceFloor(get().building, solved.floor),
        selection: { kind: 'vertex', id: keepId },
        conflict: solved.conflict,
        statusMessage: solved.conflict
          ? 'Точки слиты, но есть конфликт ограничений'
          : 'Точки слиты в одну',
      })
    },

    saveLocal: () => {
      localStorage.setItem(STORAGE_KEY, get().exportJson())
      set({ statusMessage: 'Сохранено в браузере' })
    },

    loadLocal: () => {
      const data = readStoredBuilding()
      if (!data) {
        set({ statusMessage: 'Нет сохранённого проекта' })
        return false
      }
      get().pushHistory()
      set({
        building: data,
        activeFloorId: storyFloors(data.floors)[0]?.id ?? data.floors[0].id,
        selection: null,
        conflict: false,
        openingDraft: null,
        slabOpeningDraft: null,
        floorPlateDraft: null,
        statusMessage: 'Проект загружен',
      })
      return true
    },

    exportJson: () => JSON.stringify(get().building, null, 2),

    exportProjectPackage: async () => {
      const pkg = await buildProjectPackage(get().building)
      return JSON.stringify(pkg, null, 2)
    },

    importJson: async (json) => {
      try {
        const { building: raw, package: pkg } = parseImportJson(json)
        if (pkg) await applyProjectPackage(pkg)
        const data = ensureBuildingOpenings(raw)
        if (!data.floors?.length) throw new Error('invalid')
        get().pushHistory()
        set({
          building: data,
          activeFloorId:
            storyFloors(data.floors)[0]?.id ?? data.floors[0].id,
          selection: null,
          conflict: false,
          openingDraft: null,
          slabOpeningDraft: null,
          floorPlateDraft: null,
          statusMessage: pkg
            ? 'Проект и кеш объектов загружены'
            : 'Проект загружен',
        })
        return true
      } catch (e) {
        set({
          statusMessage:
            e instanceof Error && e.message.includes('файл профиля')
              ? e.message
              : 'Ошибка загрузки JSON',
        })
        return false
      }
    },

    newProject: () => {
      get().pushHistory()
      const b = createEmptyBuilding()
      set({
        building: b,
        activeFloorId: storyFloors(b.floors)[0]?.id ?? b.floors[0].id,
        selection: null,
        conflict: false,
        statusMessage: 'Новый проект',
      })
    },
  }
})

function seedDemoFloor(floor: Floor): Floor {
  const v1 = { id: createId('v'), x: 0, y: 0 }
  const v2 = { id: createId('v'), x: 6, y: 0 }
  const v3 = { id: createId('v'), x: 6, y: 4 }
  const v4 = { id: createId('v'), x: 0, y: 4 }
  const w1 = { id: createId('wall'), a: v1.id, b: v2.id, thickness: 0.2 }
  const w2 = { id: createId('wall'), a: v2.id, b: v3.id, thickness: 0.2 }
  const w3 = { id: createId('wall'), a: v3.id, b: v4.id, thickness: 0.2 }
  const w4 = { id: createId('wall'), a: v4.id, b: v1.id, thickness: 0.2 }
  return {
    ...floor,
    vertices: [v1, v2, v3, v4],
    walls: [w1, w2, w3, w4],
    openings: [],
    slabOpenings: [],
    plates: [],
    objects: [],
    constraints: [
      { id: createId('c'), type: 'fixedLength', wallId: w1.id, length: 6 },
      { id: createId('c'), type: 'fixedLength', wallId: w2.id, length: 4 },
      { id: createId('c'), type: 'fixedLength', wallId: w3.id, length: 6 },
      { id: createId('c'), type: 'fixedLength', wallId: w4.id, length: 4 },
      { id: createId('c'), type: 'fixedPosition', vertexId: v1.id },
    ],
  }
}
