import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type Konva from 'konva'
import {
  hasFixedLength,
  hasFixedPosition,
} from '../../engine/constraints/solver'
import { wallMidpoint, findWallEdgeNear, VERTEX_HIT_RADIUS } from '../../engine/geometry/walls'
import { detectRooms } from '../../engine/geometry/wallSolid'
import {
  createOpeningFromDrag,
  openingPlanRect,
  wallEndpoints,
  wallFootprintMinusOpenings,
} from '../../engine/geometry/openings'
import {
  createSlabOpeningFromDrag,
  slabOpeningRect,
} from '../../engine/geometry/slabOpenings'
import {
  createFloorPlateFromDrag,
  floorPlateRect,
} from '../../engine/geometry/floorPlates'
import {
  createVolumeBoxFromDrag,
  createVolumeCutoutFromDrag,
  volumeBoxRect,
  volumeCutoutRect,
} from '../../engine/geometry/volumeBoxes'
import {
  allJoinedWallFootprints,
  wallFootprint,
  joinedWallFootprint,
} from '../../engine/geometry/wallSolid'
import { planHalfSizeOf } from '../../engine/geometry/objectSnap'
import { plantPlanAabbSide } from '../../landscape/plantAabb'
import { housePlanOutline, plotFrame, plotRect } from '../../landscape/site'
import { speciesByKey } from '../../landscape/species'
import {
  hitFloorTile,
  tileLocalPolygon,
  tileLocalRect,
} from '../../engine/geometry/tiles'
import { useMaterialHtmlImage } from '../TileThumb'
import { cropImageToCanvas } from '../../materials/cropImage'
import { fillTilesOnSurface, layoutTile } from '../../engine/geometry/tileFill'
import {
  isFloorPlateSelected,
  isFloorPlateTool,
  isTileSelected,
  selectedTileIds,
  isVolumeBoxSelected,
  isVolumeBoxTool,
  isVolumeCutoutSelected,
  isVolumeCutoutTool,
  isMepDrawTool,
  isMepFixtureTool,
  isObjectSelected,
  isOpeningSelected,
  isSlabOpeningSelected,
  isStairTool,
  isVertexSelected,
  isWallOpeningTool,
  isWallSelected,
  selectedVertexIds,
  isFullTexRegion,
  normalizeTileTexRegion,
  type Floor,
  type Opening,
  type PlacedTile,
  type Wall,
  wallLength,
} from '../../engine/types'
import { useBuildingStore } from '../../store/buildingStore'
import { ConstraintPictograms } from './ConstraintPictograms'
import { MepPlanLayer } from './MepPlanLayer'

const DEFAULT_SCALE = 40 // px per meter
const MIN_SCALE = 8
const MAX_SCALE = 200
const GRID = 0.25

type Marquee = { x0: number; y0: number; x1: number; y1: number } | null

type LengthEdit = {
  wallId: string
  screenX: number
  screenY: number
  value: string
}

type ViewOrigin = { x: number; y: number }

function contentCenter(
  floor: Floor,
  lower: Floor | null,
  extra: Array<{ x: number; y: number }> = [],
): { cx: number; cy: number } {
  const verts = [...floor.vertices, ...(lower?.vertices ?? [])]
  const platePts: Array<{ x: number; y: number }> = []
  for (const p of [
    ...(floor.plates ?? []),
    ...(lower?.plates ?? []),
    ...(floor.boxes ?? []),
    ...(lower?.boxes ?? []),
  ]) {
    const hw = p.width / 2
    const hd = p.depth / 2
    platePts.push(
      { x: p.x - hw, y: p.y - hd },
      { x: p.x + hw, y: p.y + hd },
    )
  }
  const all = [...verts, ...platePts, ...extra]
  if (!all.length) return { cx: 3, cy: 2 }
  const xs = all.map((v) => v.x)
  const ys = all.map((v) => v.y)
  return {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
  }
}

function worldRingToScreen(
  ring: Array<{ x: number; y: number }>,
  toScreen: (x: number, y: number) => { x: number; y: number },
): number[] {
  const screenPts: number[] = []
  for (const p of ring) {
    const s = toScreen(p.x, p.y)
    screenPts.push(s.x, s.y)
  }
  return screenPts
}

function tilePatternProps(
  tile: PlacedTile,
  toScreen: (x: number, y: number) => { x: number; y: number },
  image: HTMLImageElement | null,
) {
  if (!image || image.width < 1 || image.height < 1) return {}
  const r = tileLocalRect(tile)
  const a = toScreen(r.minU, r.maxV)
  const b = toScreen(r.maxU, r.minV)
  const w = Math.abs(b.x - a.x)
  const h = Math.abs(b.y - a.y)
  if (w < 1 || h < 1) return {}
  const region = normalizeTileTexRegion(tile.texRegion)
  const stamp = isFullTexRegion(region)
    ? image
    : (cropImageToCanvas(image, region) ?? image)
  const tileW = Math.max(1e-4, r.maxU - r.minU)
  const originX = Math.min(a.x, b.x)
  const originY = Math.min(a.y, b.y)
  const ppmX = w / tileW
  const ppmY = h / Math.max(1e-4, r.maxV - r.minV)
  const aspect = stamp.width / stamp.height
  const cellW = tileW
  const cellH = tileW / aspect
  const scaleX = (ppmX * cellW) / stamp.width
  const scaleY = (ppmY * cellH) / stamp.height
  return {
    fill: '#ffffff',
    fillPriority: 'pattern' as const,
    // Konva accepts canvas patterns at runtime; typings only list HTMLImageElement.
    fillPatternImage: stamp as HTMLImageElement,
    fillPatternX: originX,
    fillPatternY: originY,
    fillPatternScaleX: scaleX,
    fillPatternScaleY: scaleY,
  }
}

function FloorTileShape({
  tile,
  toScreen,
  selected,
  ghost,
  listening,
  ...handlers
}: {
  tile: PlacedTile
  toScreen: (x: number, y: number) => { x: number; y: number }
  selected?: boolean
  ghost?: boolean
  listening?: boolean
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void
  onMouseDown?: (e: Konva.KonvaEventObject<MouseEvent>) => void
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void
}) {
  const image = useMaterialHtmlImage(tile.material)
  const pts = worldRingToScreen(tileLocalPolygon(tile), toScreen)
  const pattern = tilePatternProps(tile, toScreen, image)
  return (
    <Line
      points={pts}
      closed
      listening={listening}
      fill={
        image
          ? undefined
          : ghost
            ? 'rgba(90, 90, 90, 0.28)'
            : selected
              ? 'rgba(196, 92, 38, 0.35)'
              : 'rgba(180, 140, 90, 0.28)'
      }
      {...pattern}
      opacity={ghost ? 0.82 : 1}
      stroke={
        ghost ? '#5a5a5a' : selected ? '#c45c26' : '#8a6a45'
      }
      strokeWidth={ghost ? 1.5 : selected ? 3 : 1}
      dash={ghost ? [5, 4] : undefined}
      {...handlers}
    />
  )
}

function openingSymbolLines(
  floor: Floor,
  opening: Opening,
  toScreen: (x: number, y: number) => { x: number; y: number },
  selected: boolean,
): ReactElement | null {
  const wall = floor.walls.find((w) => w.id === opening.wallId)
  if (!wall) return null
  const ends = wallEndpoints(floor, wall)
  if (!ends || ends.len < 1e-9) return null
  const ux = (ends.b.x - ends.a.x) / ends.len
  const uy = (ends.b.y - ends.a.y) / ends.len
  const nx = -uy
  const ny = ux
  const half = opening.width / 2
  const cx = ends.a.x + ux * opening.offset
  const cy = ends.a.y + uy * opening.offset
  const p0 = { x: cx - ux * half, y: cy - uy * half }
  const p1 = { x: cx + ux * half, y: cy + uy * half }
  const s0 = toScreen(p0.x, p0.y)
  const s1 = toScreen(p1.x, p1.y)
  const stroke = selected ? '#c45c26' : '#2a6f6a'

  if (opening.kind === 'window') {
    const o0 = toScreen(p0.x + nx * 0.04, p0.y + ny * 0.04)
    const o1 = toScreen(p1.x + nx * 0.04, p1.y + ny * 0.04)
    const i0 = toScreen(p0.x - nx * 0.04, p0.y - ny * 0.04)
    const i1 = toScreen(p1.x - nx * 0.04, p1.y - ny * 0.04)
    return (
      <Group listening={false}>
        <Line points={[o0.x, o0.y, o1.x, o1.y]} stroke={stroke} strokeWidth={2} />
        <Line points={[i0.x, i0.y, i1.x, i1.y]} stroke={stroke} strokeWidth={2} />
      </Group>
    )
  }

  if (opening.kind === 'door') {
    const hinge = s0
    const swing = toScreen(p0.x + nx * half + ux * 0.02, p0.y + ny * half + uy * 0.02)
    return (
      <Group listening={false}>
        <Line points={[s0.x, s0.y, s1.x, s1.y]} stroke={stroke} strokeWidth={1.5} dash={[4, 3]} />
        <Line
          points={[hinge.x, hinge.y, swing.x, swing.y]}
          stroke={stroke}
          strokeWidth={1.5}
        />
      </Group>
    )
  }

  return (
    <Group listening={false}>
      <Line
        points={[s0.x, s0.y, s1.x, s1.y]}
        stroke={stroke}
        strokeWidth={1.5}
        dash={[6, 4]}
      />
    </Group>
  )
}

export function FloorPlanCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [scale, setScale] = useState(DEFAULT_SCALE)
  const [origin, setOrigin] = useState<ViewOrigin>({ x: 400, y: 300 })
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [marquee, setMarquee] = useState<Marquee>(null)
  const [lengthEdit, setLengthEdit] = useState<LengthEdit | null>(null)
  const marqueeActive = useRef(false)
  const panActive = useRef(false)
  const panMoved = useRef(false)
  const panLast = useRef<{ x: number; y: number } | null>(null)
  const spaceDown = useRef(false)
  const viewFitted = useRef(false)
  const dragStartPositions = useRef<Record<string, { x: number; y: number }>>({})
  const edgeDrag = useRef<{
    wallId: string
    anchorId: string
    startPointer: { x: number; y: number }
    startPositions: Record<string, { x: number; y: number }>
    moved: boolean
  } | null>(null)
  /** Survives until click so we don't re-toggle selection after a drag. */
  const edgeDragMoved = useRef(false)
  const lengthInputRef = useRef<HTMLInputElement>(null)

  const building = useBuildingStore((s) => s.building)
  const activeFloorId = useBuildingStore((s) => s.activeFloorId)
  const floor = useBuildingStore((s) => s.activeFloor())
  const workbench = useBuildingStore((s) => s.workbench)
  const landscapeMonth = useBuildingStore((s) => s.landscapeMonth)
  const groundPlants = useBuildingStore(
    (s) => s.building.floors.find((f) => f.kind === 'ground')?.plants,
  )
  const tool = useBuildingStore((s) => s.tool)
  const selection = useBuildingStore((s) => s.selection)
  const wallDraftFrom = useBuildingStore((s) => s.wallDraftFrom)
  const openingDraft = useBuildingStore((s) => s.openingDraft)
  const slabOpeningDraft = useBuildingStore((s) => s.slabOpeningDraft)
  const floorPlateDraft = useBuildingStore((s) => s.floorPlateDraft)
  const boxDraft = useBuildingStore((s) => s.boxDraft)
  const cutoutDraft = useBuildingStore((s) => s.cutoutDraft)
  const conflict = useBuildingStore((s) => s.conflict)
  const beginWall = useBuildingStore((s) => s.beginWall)
  const finishWall = useBuildingStore((s) => s.finishWall)
  const beginOpening = useBuildingStore((s) => s.beginOpening)
  const updateOpeningDraft = useBuildingStore((s) => s.updateOpeningDraft)
  const finishOpening = useBuildingStore((s) => s.finishOpening)
  const dragOpening = useBuildingStore((s) => s.dragOpening)
  const beginSlabOpening = useBuildingStore((s) => s.beginSlabOpening)
  const updateSlabOpeningDraft = useBuildingStore((s) => s.updateSlabOpeningDraft)
  const finishSlabOpening = useBuildingStore((s) => s.finishSlabOpening)
  const dragSlabOpening = useBuildingStore((s) => s.dragSlabOpening)
  const beginFloorPlate = useBuildingStore((s) => s.beginFloorPlate)
  const updateFloorPlateDraft = useBuildingStore((s) => s.updateFloorPlateDraft)
  const finishFloorPlate = useBuildingStore((s) => s.finishFloorPlate)
  const dragFloorPlate = useBuildingStore((s) => s.dragFloorPlate)
  const beginVolumeBox = useBuildingStore((s) => s.beginVolumeBox)
  const updateVolumeBoxDraft = useBuildingStore((s) => s.updateVolumeBoxDraft)
  const finishVolumeBox = useBuildingStore((s) => s.finishVolumeBox)
  const dragVolumeBox = useBuildingStore((s) => s.dragVolumeBox)
  const beginVolumeCutout = useBuildingStore((s) => s.beginVolumeCutout)
  const updateVolumeCutoutDraft = useBuildingStore((s) => s.updateVolumeCutoutDraft)
  const finishVolumeCutout = useBuildingStore((s) => s.finishVolumeCutout)
  const dragVolumeCutout = useBuildingStore((s) => s.dragVolumeCutout)
  const placeObjectAt = useBuildingStore((s) => s.placeObjectAt)
  const placePlantAt = useBuildingStore((s) => s.placePlantAt)
  const dragPlant = useBuildingStore((s) => s.dragPlant)
  const placeTileOnHit = useBuildingStore((s) => s.placeTileOnHit)
  const fillTilesOnHit = useBuildingStore((s) => s.fillTilesOnHit)
  const dragTile = useBuildingStore((s) => s.dragTile)
  const beginTileCut = useBuildingStore((s) => s.beginTileCut)
  const finishTileCut = useBuildingStore((s) => s.finishTileCut)
  const pendingTile = useBuildingStore((s) => s.pendingTile)
  const tileGroutM = useBuildingStore((s) => s.tileGroutM)
  const tileSnapEnabled = useBuildingStore((s) => s.tileSnapEnabled)
  const tileRotation = useBuildingStore((s) => s.tileRotation)
  const tileFillPattern = useBuildingStore((s) => s.tileFillPattern)
  const tileCutDraft = useBuildingStore((s) => s.tileCutDraft)
  const clickMepAt = useBuildingStore((s) => s.clickMepAt)
  const dragPlacedObject = useBuildingStore((s) => s.dragPlacedObject)
  const selectAt = useBuildingStore((s) => s.selectAt)
  const selectInRect = useBuildingStore((s) => s.selectInRect)
  const applyConstraintTool = useBuildingStore((s) => s.applyConstraintTool)
  const dragVertex = useBuildingStore((s) => s.dragVertex)
  const dragSelection = useBuildingStore((s) => s.dragSelection)
  const endDrag = useBuildingStore((s) => s.endDrag)
  const pushHistory = useBuildingStore((s) => s.pushHistory)
  const toggleSelectWall = useBuildingStore((s) => s.toggleSelectWall)
  const toggleSelectVertex = useBuildingStore((s) => s.toggleSelectVertex)
  const selectEdgePoint = useBuildingStore((s) => s.selectEdgePoint)
  const setSelection = useBuildingStore((s) => s.setSelection)
  const toggleSelectTile = useBuildingStore((s) => s.toggleSelectTile)
  const setFixedLengthValue = useBuildingStore((s) => s.setFixedLengthValue)
  const openingDragActive = useRef(false)
  const slabDragActive = useRef(false)
  const plateDragActive = useRef(false)
  const boxDragActive = useRef(false)
  const cutoutDragActive = useRef(false)
  const openingMove = useRef<{
    id: string
    start: { x: number; y: number }
    moved: boolean
  } | null>(null)
  const openingMoveMoved = useRef(false)
  const slabMove = useRef<{
    id: string
    start: { x: number; y: number }
    origin: { x: number; y: number }
    moved: boolean
  } | null>(null)
  const slabMoveMoved = useRef(false)
  const plateMove = useRef<{
    id: string
    start: { x: number; y: number }
    origin: { x: number; y: number }
    moved: boolean
  } | null>(null)
  const plateMoveMoved = useRef(false)
  const boxMove = useRef<{
    id: string
    start: { x: number; y: number }
    origin: { x: number; y: number }
    moved: boolean
  } | null>(null)
  const boxMoveMoved = useRef(false)
  const cutoutMove = useRef<{
    id: string
    start: { x: number; y: number }
    origin: { x: number; y: number }
    moved: boolean
  } | null>(null)
  const cutoutMoveMoved = useRef(false)
  const objectMove = useRef<{
    id: string
    start: { x: number; y: number }
    origin: { x: number; y: number }
    moved: boolean
  } | null>(null)
  const objectMoveMoved = useRef(false)
  const plantMove = useRef<{
    id: string
    start: { x: number; y: number }
    origin: { x: number; y: number }
    moved: boolean
  } | null>(null)
  const plantMoveMoved = useRef(false)
  const tileMove = useRef<{
    id: string
    ids: string[]
    start: { x: number; y: number }
    origin: { u: number; v: number }
    moved: boolean
  } | null>(null)
  const tileMoveMoved = useRef(false)

  const lowerFloor = useMemo(() => {
    const idx = building.floors.findIndex((f) => f.id === activeFloorId)
    if (idx <= 0) return null
    const prev = building.floors[idx - 1]
    // Ground has no walls — don't use it as a ghost plan underlay
    if (prev.kind === 'ground') return null
    return prev
  }, [building.floors, activeFloorId])

  const houseOutline = useMemo(
    () => (workbench === 'landscape' ? housePlanOutline(building) : []),
    [workbench, building],
  )
  const plotOutline = useMemo(() => {
    if (workbench !== 'landscape') return null
    const terrain = building.floors.find((f) => f.kind === 'ground')
      ?.landscapeTerrain
    return plotRect(plotFrame(terrain))
  }, [workbench, building])

  const tileGhosts = useMemo(() => {
    if (!pointer || !pendingTile) return []
    if (tool === 'fillTile') {
      return fillTilesOnSurface(
        pendingTile,
        { type: 'floor' },
        pointer.x,
        pointer.y,
        tileGroutM,
        tileRotation,
        tileFillPattern,
        floor,
        { limit: 200, snap: tileSnapEnabled },
      )
    }
    if (tool === 'placeTile') {
      const tile = layoutTile(
        pendingTile,
        { type: 'floor' },
        pointer.x,
        pointer.y,
        tileGroutM,
        tileRotation,
        floor,
        { snap: tileSnapEnabled },
      )
      return tile ? [tile] : []
    }
    return []
  }, [
    pointer,
    pendingTile,
    tool,
    tileGroutM,
    tileRotation,
    tileFillPattern,
    tileSnapEnabled,
    floor,
  ])

  const fitView = useCallback(
    (nextScale = DEFAULT_SCALE) => {
      const extra = [
        ...houseOutline.flat(),
        ...(plotOutline
          ? [
              { x: plotOutline.minX, y: plotOutline.minY },
              { x: plotOutline.maxX, y: plotOutline.maxY },
            ]
          : []),
      ]
      const { cx, cy } = contentCenter(floor, lowerFloor, extra)
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale))
      setScale(s)
      setOrigin({
        x: size.w / 2 - cx * s,
        y: size.h / 2 + cy * s,
      })
    },
    [floor, lowerFloor, houseOutline, plotOutline, size],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Fit once when size is ready / floor switches
  useEffect(() => {
    viewFitted.current = false
  }, [activeFloorId, workbench])

  useEffect(() => {
    if (size.w < 10 || size.h < 10) return
    if (!viewFitted.current) {
      fitView(scale)
      viewFitted.current = true
    }
  }, [size, fitView, scale])

  useEffect(() => {
    if (lengthEdit && lengthInputRef.current) {
      lengthInputRef.current.focus()
      lengthInputRef.current.select()
    }
  }, [lengthEdit])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const t = e.target as HTMLElement
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
        spaceDown.current = true
        e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const toWorld = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - origin.x) / scale,
      y: (origin.y - sy) / scale,
    }),
    [origin, scale],
  )

  const toScreen = useCallback(
    (x: number, y: number) => ({
      x: origin.x + x * scale,
      y: origin.y - y * scale,
    }),
    [origin, scale],
  )

  const zoomAt = useCallback(
    (screenX: number, screenY: number, factor: number) => {
      const world = {
        x: (screenX - origin.x) / scale,
        y: (origin.y - screenY) / scale,
      }
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))
      setScale(next)
      setOrigin({
        x: screenX - world.x * next,
        y: screenY + world.y * next,
      })
    },
    [origin, scale],
  )

  const onWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      const stage = e.target.getStage()
      const pos = stage?.getPointerPosition()
      if (!pos) return
      const factor = e.evt.deltaY < 0 ? 1.12 : 1 / 1.12
      zoomAt(pos.x, pos.y, factor)
    },
    [zoomAt],
  )

  const commitLengthEdit = useCallback(() => {
    if (!lengthEdit) return
    const n = Number(lengthEdit.value.replace(',', '.'))
    if (Number.isFinite(n) && n >= 0.5) {
      setFixedLengthValue(lengthEdit.wallId, n)
    }
    setLengthEdit(null)
  }, [lengthEdit, setFixedLengthValue])

  const startLengthEdit = useCallback(
    (wall: Wall, screenX: number, screenY: number) => {
      const len = wallLength(floor, wall)
      setLengthEdit({
        wallId: wall.id,
        screenX,
        screenY,
        value: len.toFixed(2),
      })
    },
    [floor],
  )

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const evt = e.evt
    const isPan =
      evt.button === 1 ||
      (evt.button === 0 && (spaceDown.current || evt.altKey))
    if (isPan) {
      evt.preventDefault()
      panActive.current = true
      panMoved.current = false
      panLast.current = { x: evt.clientX, y: evt.clientY }
      marqueeActive.current = false
      setMarquee(null)
      return
    }
    if (isWallOpeningTool(tool) && evt.button === 0) {
      const stage = e.target.getStage()
      const pos = stage?.getPointerPosition()
      if (!pos) return
      const w = toWorld(pos.x, pos.y)
      openingDragActive.current = true
      beginOpening(w.x, w.y)
      return
    }
    if (isStairTool(tool) && evt.button === 0) {
      const stage = e.target.getStage()
      const pos = stage?.getPointerPosition()
      if (!pos) return
      const w = toWorld(pos.x, pos.y)
      slabDragActive.current = true
      beginSlabOpening(w.x, w.y)
      return
    }
    if (isFloorPlateTool(tool) && evt.button === 0) {
      const stage = e.target.getStage()
      const pos = stage?.getPointerPosition()
      if (!pos) return
      const w = toWorld(pos.x, pos.y)
      plateDragActive.current = true
      beginFloorPlate(w.x, w.y)
      return
    }
    if (isVolumeBoxTool(tool) && evt.button === 0) {
      const stage = e.target.getStage()
      const pos = stage?.getPointerPosition()
      if (!pos) return
      const w = toWorld(pos.x, pos.y)
      boxDragActive.current = true
      beginVolumeBox(w.x, w.y)
      return
    }
    if (isVolumeCutoutTool(tool) && evt.button === 0) {
      const stage = e.target.getStage()
      const pos = stage?.getPointerPosition()
      if (!pos) return
      const w = toWorld(pos.x, pos.y)
      cutoutDragActive.current = true
      beginVolumeCutout(w.x, w.y)
      return
    }
    if (tool !== 'select') return
    if (e.target !== e.target.getStage()) return
    if (lengthEdit) {
      commitLengthEdit()
      return
    }
    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!pos) return
    const w = toWorld(pos.x, pos.y)
    marqueeActive.current = true
    setMarquee({ x0: w.x, y0: w.y, x1: w.x, y1: w.y })
  }

  const onStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (panActive.current && panLast.current) {
      const dx = e.evt.clientX - panLast.current.x
      const dy = e.evt.clientY - panLast.current.y
      panLast.current = { x: e.evt.clientX, y: e.evt.clientY }
      if (dx !== 0 || dy !== 0) panMoved.current = true
      setOrigin((o) => ({ x: o.x + dx, y: o.y + dy }))
      return
    }
    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!pos) return
    const w = toWorld(pos.x, pos.y)
    setPointer(w)

    if (openingDragActive.current && openingDraft) {
      updateOpeningDraft(w.x, w.y)
      return
    }

    if (slabDragActive.current && slabOpeningDraft) {
      updateSlabOpeningDraft(w.x, w.y)
      return
    }

    if (plateDragActive.current && floorPlateDraft) {
      updateFloorPlateDraft(w.x, w.y)
      return
    }

    if (boxDragActive.current && boxDraft) {
      updateVolumeBoxDraft(w.x, w.y)
      return
    }

    if (cutoutDragActive.current && cutoutDraft) {
      updateVolumeCutoutDraft(w.x, w.y)
      return
    }

    if (openingMove.current) {
      const drag = openingMove.current
      const dx = w.x - drag.start.x
      const dy = w.y - drag.start.y
      if (!drag.moved && Math.hypot(dx, dy) < 0.02) return
      if (!drag.moved) {
        drag.moved = true
        pushHistory()
      }
      dragOpening(drag.id, w.x, w.y)
      return
    }

    if (slabMove.current) {
      const drag = slabMove.current
      const dx = w.x - drag.start.x
      const dy = w.y - drag.start.y
      if (!drag.moved && Math.hypot(dx, dy) < 0.02) return
      if (!drag.moved) {
        drag.moved = true
        pushHistory()
      }
      dragSlabOpening(drag.id, drag.origin.x + dx, drag.origin.y + dy)
      return
    }

    if (plateMove.current) {
      const drag = plateMove.current
      const dx = w.x - drag.start.x
      const dy = w.y - drag.start.y
      if (!drag.moved && Math.hypot(dx, dy) < 0.02) return
      if (!drag.moved) {
        drag.moved = true
        pushHistory()
      }
      dragFloorPlate(drag.id, drag.origin.x + dx, drag.origin.y + dy)
      return
    }

    if (boxMove.current) {
      const drag = boxMove.current
      const dx = w.x - drag.start.x
      const dy = w.y - drag.start.y
      if (!drag.moved && Math.hypot(dx, dy) < 0.02) return
      if (!drag.moved) {
        drag.moved = true
        pushHistory()
      }
      dragVolumeBox(drag.id, drag.origin.x + dx, drag.origin.y + dy)
      return
    }

    if (cutoutMove.current) {
      const drag = cutoutMove.current
      const dx = w.x - drag.start.x
      const dy = w.y - drag.start.y
      if (!drag.moved && Math.hypot(dx, dy) < 0.02) return
      if (!drag.moved) {
        drag.moved = true
        pushHistory()
      }
      dragVolumeCutout(drag.id, drag.origin.x + dx, drag.origin.y + dy)
      return
    }

    if (tileMove.current) {
      const drag = tileMove.current
      const dx = w.x - drag.start.x
      const dy = w.y - drag.start.y
      if (!drag.moved && Math.hypot(dx, dy) < 0.02) return
      if (!drag.moved) {
        drag.moved = true
        pushHistory()
      }
      dragTile(drag.id, drag.origin.u + dx, drag.origin.v + dy, drag.ids)
      return
    }

    if (objectMove.current) {
      const drag = objectMove.current
      const dx = w.x - drag.start.x
      const dy = w.y - drag.start.y
      if (!drag.moved && Math.hypot(dx, dy) < 0.02) return
      if (!drag.moved) {
        drag.moved = true
        pushHistory()
      }
      dragPlacedObject(drag.id, drag.origin.x + dx, drag.origin.y + dy)
      return
    }

    if (plantMove.current) {
      const drag = plantMove.current
      const dx = w.x - drag.start.x
      const dy = w.y - drag.start.y
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
      if (!drag.moved && Math.hypot(dx, dy) < 0.02) return
      if (!drag.moved) {
        drag.moved = true
        pushHistory()
      }
      dragPlant(drag.id, drag.origin.x + dx, drag.origin.y + dy)
      return
    }

    if (edgeDrag.current) {
      const drag = edgeDrag.current
      const dx = w.x - drag.startPointer.x
      const dy = w.y - drag.startPointer.y
      if (!drag.moved && Math.hypot(dx, dy) < 0.02) return
      if (!drag.moved) {
        drag.moved = true
        pushHistory()
      }
      const anchor = drag.startPositions[drag.anchorId]
      if (!anchor) return
      dragSelection(
        drag.anchorId,
        anchor.x + dx,
        anchor.y + dy,
        drag.startPositions,
      )
      return
    }

    if (marqueeActive.current && marquee) {
      setMarquee({ ...marquee, x1: w.x, y1: w.y })
    }
  }

  const onStageMouseUp = () => {
    if (panActive.current) {
      panActive.current = false
      panLast.current = null
      return
    }
    if (openingDragActive.current) {
      openingDragActive.current = false
      finishOpening()
      return
    }
    if (slabDragActive.current) {
      slabDragActive.current = false
      finishSlabOpening()
      return
    }
    if (plateDragActive.current) {
      plateDragActive.current = false
      finishFloorPlate()
      return
    }
    if (boxDragActive.current) {
      boxDragActive.current = false
      finishVolumeBox()
      return
    }
    if (cutoutDragActive.current) {
      cutoutDragActive.current = false
      finishVolumeCutout()
      return
    }
    if (openingMove.current) {
      openingMoveMoved.current = openingMove.current.moved
      openingMove.current = null
      marqueeActive.current = false
      setMarquee(null)
      return
    }
    if (slabMove.current) {
      slabMoveMoved.current = slabMove.current.moved
      slabMove.current = null
      marqueeActive.current = false
      setMarquee(null)
      return
    }
    if (plateMove.current) {
      plateMoveMoved.current = plateMove.current.moved
      plateMove.current = null
      marqueeActive.current = false
      setMarquee(null)
      return
    }
    if (boxMove.current) {
      boxMoveMoved.current = boxMove.current.moved
      boxMove.current = null
      marqueeActive.current = false
      setMarquee(null)
      return
    }
    if (cutoutMove.current) {
      cutoutMoveMoved.current = cutoutMove.current.moved
      cutoutMove.current = null
      marqueeActive.current = false
      setMarquee(null)
      return
    }
    if (tileMove.current) {
      tileMoveMoved.current = tileMove.current.moved
      tileMove.current = null
      marqueeActive.current = false
      setMarquee(null)
      return
    }
    if (objectMove.current) {
      objectMoveMoved.current = objectMove.current.moved
      objectMove.current = null
      marqueeActive.current = false
      setMarquee(null)
      return
    }
    if (plantMove.current) {
      plantMoveMoved.current = true
      plantMove.current = null
      marqueeActive.current = false
      setMarquee(null)
      return
    }
    if (edgeDrag.current) {
      edgeDragMoved.current = edgeDrag.current.moved
      if (edgeDrag.current.moved) endDrag()
      edgeDrag.current = null
      marqueeActive.current = false
      setMarquee(null)
      return
    }
    if (marqueeActive.current && marquee) {
      const dx = Math.abs(marquee.x1 - marquee.x0)
      const dy = Math.abs(marquee.y1 - marquee.y0)
      if (dx > 0.15 || dy > 0.15) {
        selectInRect(marquee.x0, marquee.y0, marquee.x1, marquee.y1)
      } else {
        selectAt(marquee.x0, marquee.y0)
      }
    }
    marqueeActive.current = false
    setMarquee(null)
  }

  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return
    if (panMoved.current) {
      panMoved.current = false
      return
    }
    if (plantMoveMoved.current) {
      plantMoveMoved.current = false
      return
    }
    if (
      tool === 'select' ||
      isWallOpeningTool(tool) ||
      isStairTool(tool) ||
      isVolumeBoxTool(tool) ||
      isVolumeCutoutTool(tool)
    )
      return
    const stage = e.target.getStage()
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const w = toWorld(pos.x, pos.y)

    if (tool === 'placeObject') {
      placeObjectAt(w.x, w.y)
      return
    }
    if (tool === 'plant') {
      placePlantAt(w.x, w.y)
      return
    }
    if (tool === 'placeTile') {
      placeTileOnHit({ type: 'floor' }, w.x, w.y)
      return
    }
    if (tool === 'fillTile') {
      fillTilesOnHit({ type: 'floor' }, w.x, w.y)
      return
    }
    if (tool === 'cutTile') {
      const hit = hitFloorTile(floor, w.x, w.y)
      const tileId = tileCutDraft?.tileId ?? hit?.id ?? selectedTileIds(selection)[0]
      if (!tileId) return
      if (!tileCutDraft?.a) beginTileCut(tileId, w.x, w.y)
      else finishTileCut(w.x, w.y, !e.evt.shiftKey)
      return
    }
    if (tool === 'wall') {
      if (!wallDraftFrom) beginWall(w.x, w.y)
      else finishWall(w.x, w.y)
      return
    }
    if (isMepDrawTool(tool) || isMepFixtureTool(tool)) {
      clickMepAt(w.x, w.y)
      return
    }
    if (
      tool === 'lockLength' ||
      tool === 'lockPoint' ||
      tool === 'horizontal' ||
      tool === 'vertical'
    ) {
      applyConstraintTool(w.x, w.y)
    }
  }

  const gridLines = useMemo(() => {
    const lines: ReactElement[] = []
    const worldLeft = toWorld(0, 0).x
    const worldRight = toWorld(size.w, 0).x
    const worldTop = toWorld(0, 0).y
    const worldBottom = toWorld(0, size.h).y
    const x0 = Math.floor(Math.min(worldLeft, worldRight) / GRID) * GRID
    const x1 = Math.ceil(Math.max(worldLeft, worldRight) / GRID) * GRID
    const y0 = Math.floor(Math.min(worldBottom, worldTop) / GRID) * GRID
    const y1 = Math.ceil(Math.max(worldBottom, worldTop) / GRID) * GRID
    for (let x = x0; x <= x1; x += GRID) {
      const a = toScreen(x, y0)
      const b = toScreen(x, y1)
      const major = Math.abs(x % 1) < 1e-6
      lines.push(
        <Line
          key={`gx${x}`}
          points={[a.x, a.y, b.x, b.y]}
          stroke={major ? '#c5b8a8' : '#e5ddd2'}
          strokeWidth={major ? 1 : 0.5}
          listening={false}
        />,
      )
    }
    for (let y = y0; y <= y1; y += GRID) {
      const a = toScreen(x0, y)
      const b = toScreen(x1, y)
      const major = Math.abs(y % 1) < 1e-6
      lines.push(
        <Line
          key={`gy${y}`}
          points={[a.x, a.y, b.x, b.y]}
          stroke={major ? '#c5b8a8' : '#e5ddd2'}
          strokeWidth={major ? 1 : 0.5}
          listening={false}
        />,
      )
    }
    return lines
  }, [size, toScreen, toWorld])

  const draftLine = useMemo(() => {
    if (!wallDraftFrom || !pointer) return null
    const from = floor.vertices.find((v) => v.id === wallDraftFrom)
    if (!from) return null
    const nearV = floor.vertices.find(
      (v) =>
        v.id !== wallDraftFrom &&
        Math.hypot(v.x - pointer.x, v.y - pointer.y) <= VERTEX_HIT_RADIUS,
    )
    let tx = pointer.x
    let ty = pointer.y
    let snapKind: 'none' | 'vertex' | 'edge' = 'none'
    if (nearV) {
      tx = nearV.x
      ty = nearV.y
      snapKind = 'vertex'
    } else {
      const edge = findWallEdgeNear(floor, pointer.x, pointer.y)
      if (edge) {
        tx = edge.x
        ty = edge.y
        snapKind = 'edge'
      }
    }
    const a = toScreen(from.x, from.y)
    const b = toScreen(tx, ty)
    return (
      <Group listening={false}>
        <Line
          points={[a.x, a.y, b.x, b.y]}
          stroke="#2a6f6a"
          strokeWidth={2}
          dash={[8, 6]}
        />
        {snapKind !== 'none' && (
          <Circle
            x={b.x}
            y={b.y}
            radius={snapKind === 'edge' ? 6 : 5}
            stroke={snapKind === 'edge' ? '#c45c26' : '#2a6f6a'}
            strokeWidth={2}
            fill="rgba(247, 243, 235, 0.9)"
          />
        )}
      </Group>
    )
  }, [wallDraftFrom, pointer, floor, toScreen])

  const marqueeRect = useMemo(() => {
    if (!marquee) return null
    const a = toScreen(marquee.x0, marquee.y0)
    const b = toScreen(marquee.x1, marquee.y1)
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(b.x - a.x)
    const h = Math.abs(b.y - a.y)
    return (
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="rgba(42, 111, 106, 0.12)"
        stroke="#2a6f6a"
        strokeWidth={1}
        dash={[4, 3]}
        listening={false}
      />
    )
  }, [marquee, toScreen])

  const renderThickWall = (
    fl: Floor,
    wall: Wall,
    opts: {
      key: string
      fill: string
      stroke: string
      opacity?: number
      listening?: boolean
      selected?: boolean
      cursor?: string
      onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void
      onDblClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void
      onMouseDown?: (e: Konva.KonvaEventObject<MouseEvent>) => void
    },
    footprints?: Map<string, Array<{ x: number; y: number }>>,
    cutOpenings = false,
  ) => {
    const cached = footprints?.get(wall.id)
    const baseFp =
      cached ??
      joinedWallFootprint(fl, wall) ??
      wallFootprint(fl, wall)
    if (!baseFp) return null

    const rings = cutOpenings
      ? wallFootprintMinusOpenings(fl, wall.id, baseFp)
      : [baseFp]

    return (
      <Group key={opts.key}>
        {rings.map((ring, ri) => {
          const screenPts = worldRingToScreen(ring, toScreen)
          if (screenPts.length < 6) return null
          return (
            <Line
              key={`${opts.key}-r${ri}`}
              points={screenPts}
              closed
              fill={opts.fill}
              stroke={opts.stroke}
              strokeWidth={opts.selected ? 2 : 1}
              opacity={opts.opacity ?? 1}
              listening={opts.listening ?? true}
              onClick={opts.onClick}
              onDblClick={opts.onDblClick}
              onMouseDown={opts.onMouseDown}
              onMouseEnter={
                opts.cursor
                  ? (e) => {
                      const c = e.target.getStage()?.container()
                      if (c) c.style.cursor = opts.cursor!
                    }
                  : undefined
              }
              onMouseLeave={
                opts.cursor
                  ? (e) => {
                      const c = e.target.getStage()?.container()
                      if (c) c.style.cursor = 'default'
                    }
                  : undefined
              }
            />
          )
        })}
      </Group>
    )
  }

  const floorFootprints = useMemo(
    () => allJoinedWallFootprints(floor),
    [floor],
  )
  const lowerFootprints = useMemo(
    () => (lowerFloor ? allJoinedWallFootprints(lowerFloor) : null),
    [lowerFloor],
  )

  return (
    <div
      ref={containerRef}
      className={`plan-canvas ${conflict ? 'has-conflict' : ''}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {floor.kind === 'ground' && workbench !== 'landscape' && (
        <div className="plan-ground-hint">
          Земля — задайте уровень в свойствах. Чертёж стен на этажах выше.
        </div>
      )}
      <div className="plan-zoom-bar">
        <button
          type="button"
          title="Отдалить"
          onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.25)}
        >
          −
        </button>
        <button
          type="button"
          className="plan-zoom-label"
          title="Сбросить вид"
          onClick={() => fitView(DEFAULT_SCALE)}
        >
          {Math.round((scale / DEFAULT_SCALE) * 100)}%
        </button>
        <button
          type="button"
          title="Приблизить"
          onClick={() => zoomAt(size.w / 2, size.h / 2, 1.25)}
        >
          +
        </button>
      </div>
      <Stage
        width={size.w}
        height={size.h}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onWheel={onWheel}
        onMouseLeave={() => {
          setPointer(null)
          panActive.current = false
          panLast.current = null
          if (plantMove.current) {
            plantMoveMoved.current = true
            plantMove.current = null
          }
          if (edgeDrag.current) {
            edgeDragMoved.current = edgeDrag.current.moved
            if (edgeDrag.current.moved) endDrag()
            edgeDrag.current = null
          }
          if (marqueeActive.current) {
            marqueeActive.current = false
            setMarquee(null)
          }
        }}
        onClick={onStageClick}
      >
        <Layer>
          {gridLines}

          {workbench === 'landscape' && plotOutline && (
            <Line
              points={worldRingToScreen(
                [
                  { x: plotOutline.minX, y: plotOutline.minY },
                  { x: plotOutline.maxX, y: plotOutline.minY },
                  { x: plotOutline.maxX, y: plotOutline.maxY },
                  { x: plotOutline.minX, y: plotOutline.maxY },
                ],
                toScreen,
              )}
              closed
              stroke="#c45c26"
              strokeWidth={1.5}
              dash={[8, 5]}
              listening={false}
            />
          )}

          {workbench === 'landscape' &&
            houseOutline.map((ring, i) => {
              const pts = worldRingToScreen(ring, toScreen)
              if (pts.length < 6) return null
              return (
                <Line
                  key={`house-outline-${i}`}
                  points={pts}
                  closed
                  fill="rgba(61, 52, 41, 0.16)"
                  stroke="#3d3429"
                  strokeWidth={2}
                  listening={false}
                />
              )
            })}

          {lowerFloor &&
            lowerFloor.walls.map((wall) =>
              renderThickWall(
                lowerFloor,
                wall,
                {
                  key: `lower-${wall.id}`,
                  fill: 'rgba(168, 168, 168, 0.45)',
                  stroke: '#a0a0a0',
                  opacity: 0.7,
                  listening: false,
                },
                lowerFootprints ?? undefined,
              ),
            )}
          {lowerFloor?.vertices.map((v) => {
            const s = toScreen(v.x, v.y)
            return (
              <Circle
                key={`lower-v-${v.id}`}
                x={s.x}
                y={s.y}
                radius={3}
                fill="#a8a8a8"
                listening={false}
                opacity={0.7}
              />
            )
          })}

          {floor.walls.map((wall) =>
            renderThickWall(
              floor,
              wall,
              {
                key: `${wall.id}-body`,
                fill: 'rgba(61, 52, 41, 0.22)',
                stroke: '#3d3429',
                listening: false,
              },
              floorFootprints,
              true,
            ),
          )}

          {selection?.kind === 'room' &&
            (() => {
              const room = detectRooms(floor).find((r) => r.key === selection.key)
              if (!room || room.polygon.length < 3) return null
              const pts = room.polygon.flatMap((p) => {
                const s = toScreen(p.x, p.y)
                return [s.x, s.y]
              })
              return (
                <Line
                  key={`room-${room.key}`}
                  points={pts}
                  closed
                  fill="rgba(42, 111, 106, 0.18)"
                  stroke="#2a6f6a"
                  strokeWidth={2}
                  listening={false}
                />
              )
            })()}

          {floor.walls.map((wall) => {
            const a = floor.vertices.find((v) => v.id === wall.a)
            const b = floor.vertices.find((v) => v.id === wall.b)
            if (!a || !b) return null
            const selected = isWallSelected(selection, wall.id)
            const locked = hasFixedLength(floor.constraints, wall.id)
            const mid = wallMidpoint(floor, wall)
            const label = mid ? toScreen(mid.x, mid.y) : null
            const len = wallLength(floor, wall)

            return (
              <Group key={wall.id}>
                {renderThickWall(
                  floor,
                  wall,
                  {
                    key: `${wall.id}-hit`,
                    fill: selected
                      ? 'rgba(196, 92, 38, 0.35)'
                      : locked
                        ? 'rgba(31, 78, 74, 0.15)'
                        : 'rgba(0,0,0,0)',
                    stroke: selected
                      ? '#c45c26'
                      : locked
                        ? '#1f4e4a'
                        : 'transparent',
                    selected,
                    cursor: tool === 'select' ? 'move' : undefined,
                    onMouseDown: (e) => {
                      if (tool !== 'select' || e.evt.button !== 0) return
                      if (e.evt.shiftKey || spaceDown.current || e.evt.altKey)
                        return
                      e.cancelBubble = true
                      marqueeActive.current = false
                      setMarquee(null)

                      const aVert = floor.vertices.find((v) => v.id === wall.a)
                      const bVert = floor.vertices.find((v) => v.id === wall.b)
                      if (!aVert || !bVert) return
                      if (
                        hasFixedPosition(floor.constraints, wall.a) &&
                        hasFixedPosition(floor.constraints, wall.b)
                      ) {
                        return
                      }

                      const stage = e.target.getStage()
                      const pos = stage?.getPointerPosition()
                      if (!pos) return
                      const w = toWorld(pos.x, pos.y)

                      if (!isWallSelected(selection, wall.id)) {
                        toggleSelectWall(wall.id, false)
                      }

                      const startPositions: Record<
                        string,
                        { x: number; y: number }
                      > = {}
                      if (!hasFixedPosition(floor.constraints, wall.a)) {
                        startPositions[wall.a] = { x: aVert.x, y: aVert.y }
                      }
                      if (!hasFixedPosition(floor.constraints, wall.b)) {
                        startPositions[wall.b] = { x: bVert.x, y: bVert.y }
                      }
                      if (Object.keys(startPositions).length === 0) return

                      const anchorId = startPositions[wall.a]
                        ? wall.a
                        : wall.b
                      edgeDrag.current = {
                        wallId: wall.id,
                        anchorId,
                        startPointer: { x: w.x, y: w.y },
                        startPositions,
                        moved: false,
                      }
                    },
                    onClick: (e) => {
                      e.cancelBubble = true
                      marqueeActive.current = false
                      setMarquee(null)
                      if (edgeDragMoved.current) {
                        edgeDragMoved.current = false
                        return
                      }
                      if (tool === 'wall') {
                        const stage = e.target.getStage()
                        const pos = stage?.getPointerPosition()
                        if (!pos) return
                        const w = toWorld(pos.x, pos.y)
                        if (!wallDraftFrom) beginWall(w.x, w.y)
                        else finishWall(w.x, w.y)
                        return
                      }
                      if (tool === 'select') {
                        if (e.evt.altKey) {
                          const stage = e.target.getStage()
                          const pos = stage?.getPointerPosition()
                          if (!pos) return
                          const w = toWorld(pos.x, pos.y)
                          if (selectEdgePoint(w.x, w.y, e.evt.shiftKey)) return
                        }
                        toggleSelectWall(wall.id, e.evt.shiftKey)
                      } else if (
                        tool === 'lockLength' ||
                        tool === 'horizontal' ||
                        tool === 'vertical'
                      ) {
                        applyConstraintTool((a.x + b.x) / 2, (a.y + b.y) / 2)
                      }
                    },
                    onDblClick: (e) => {
                      e.cancelBubble = true
                      marqueeActive.current = false
                      setMarquee(null)
                      const pos = e.target.getStage()?.getPointerPosition()
                      const sx = pos?.x ?? (label?.x ?? 0)
                      const sy = pos?.y ?? (label?.y ?? 0)
                      startLengthEdit(wall, sx, sy)
                    },
                  },
                  floorFootprints,
                  true,
                )}
                {label && (
                  <Text
                    x={label.x - 28}
                    y={label.y - 18}
                    width={56}
                    align="center"
                    text={`${len.toFixed(2)} м`}
                    fontSize={11}
                    fontFamily="IBM Plex Sans, sans-serif"
                    fill="#3d3429"
                    listening={false}
                  />
                )}
              </Group>
            )
          })}

          {draftLine}

          {(floor.openings ?? []).map((opening) => {
            const selected = isOpeningSelected(selection, opening.id)
            const rect = openingPlanRect(floor, opening)
            const hitPts = rect ? worldRingToScreen(rect, toScreen) : null
            return (
              <Group key={opening.id}>
                {hitPts && hitPts.length >= 6 && (
                  <Line
                    points={hitPts}
                    closed
                    fill={
                      selected
                        ? 'rgba(196, 92, 38, 0.25)'
                        : 'rgba(42, 111, 106, 0.08)'
                    }
                    stroke={selected ? '#c45c26' : 'transparent'}
                    strokeWidth={selected ? 2 : 0}
                    onMouseEnter={(e) => {
                      if (tool !== 'select') return
                      const c = e.target.getStage()?.container()
                      if (c) c.style.cursor = 'grab'
                    }}
                    onMouseLeave={(e) => {
                      const c = e.target.getStage()?.container()
                      if (c) c.style.cursor = 'default'
                    }}
                    onMouseDown={(e) => {
                      if (tool !== 'select' || e.evt.button !== 0) return
                      if (e.evt.shiftKey || spaceDown.current || e.evt.altKey)
                        return
                      e.cancelBubble = true
                      marqueeActive.current = false
                      setMarquee(null)
                      setSelection({ kind: 'opening', id: opening.id })
                      const stage = e.target.getStage()
                      const pos = stage?.getPointerPosition()
                      const w = pos ? toWorld(pos.x, pos.y) : { x: 0, y: 0 }
                      openingMove.current = {
                        id: opening.id,
                        start: { x: w.x, y: w.y },
                        moved: false,
                      }
                      const c = e.target.getStage()?.container()
                      if (c) c.style.cursor = 'grabbing'
                    }}
                    onClick={(e) => {
                      e.cancelBubble = true
                      if (openingMoveMoved.current) {
                        openingMoveMoved.current = false
                        return
                      }
                      if (tool === 'select') {
                        setSelection({ kind: 'opening', id: opening.id })
                      }
                    }}
                  />
                )}
                {openingSymbolLines(floor, opening, toScreen, selected)}
              </Group>
            )
          })}

          {(floor.slabOpenings ?? []).map((opening) => {
            const selected = isSlabOpeningSelected(selection, opening.id)
            const rect = slabOpeningRect(opening)
            const hitPts = worldRingToScreen(rect, toScreen)
            const mid = toScreen(opening.x, opening.y)
            return (
              <Group key={opening.id}>
                <Line
                  points={hitPts}
                  closed
                  fill={
                    selected
                      ? 'rgba(196, 92, 38, 0.22)'
                      : 'rgba(42, 111, 106, 0.12)'
                  }
                  stroke={selected ? '#c45c26' : '#2a6f6a'}
                  strokeWidth={selected ? 2 : 1.5}
                  dash={[6, 4]}
                  onMouseEnter={(e) => {
                    if (tool !== 'select') return
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'grab'
                  }}
                  onMouseLeave={(e) => {
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'default'
                  }}
                  onMouseDown={(e) => {
                    if (tool !== 'select' || e.evt.button !== 0) return
                    if (e.evt.shiftKey || spaceDown.current || e.evt.altKey)
                      return
                    e.cancelBubble = true
                    marqueeActive.current = false
                    setMarquee(null)
                    setSelection({ kind: 'slabOpening', id: opening.id })
                    const stage = e.target.getStage()
                    const pos = stage?.getPointerPosition()
                    const w = pos ? toWorld(pos.x, pos.y) : { x: 0, y: 0 }
                    slabMove.current = {
                      id: opening.id,
                      start: { x: w.x, y: w.y },
                      origin: { x: opening.x, y: opening.y },
                      moved: false,
                    }
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'grabbing'
                  }}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (slabMoveMoved.current) {
                      slabMoveMoved.current = false
                      return
                    }
                    if (tool === 'select') {
                      setSelection({ kind: 'slabOpening', id: opening.id })
                    }
                  }}
                />
                <Text
                  x={mid.x - 8}
                  y={mid.y - 8}
                  text="Л"
                  fontSize={14}
                  fontFamily="IBM Plex Sans, sans-serif"
                  fill={selected ? '#c45c26' : '#2a6f6a'}
                  listening={false}
                />
              </Group>
            )
          })}

          {(floor.plates ?? []).map((plate) => {
            const selected = isFloorPlateSelected(selection, plate.id)
            const rect = floorPlateRect(plate)
            const hitPts = worldRingToScreen(rect, toScreen)
            const mid = toScreen(plate.x, plate.y)
            return (
              <Group key={plate.id}>
                <Line
                  points={hitPts}
                  closed
                  fill={
                    selected
                      ? 'rgba(196, 92, 38, 0.18)'
                      : 'rgba(90, 122, 90, 0.16)'
                  }
                  stroke={selected ? '#c45c26' : '#5a7a5a'}
                  strokeWidth={selected ? 2 : 1.5}
                  onMouseEnter={(e) => {
                    if (tool !== 'select') return
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'grab'
                  }}
                  onMouseLeave={(e) => {
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'default'
                  }}
                  onMouseDown={(e) => {
                    if (tool !== 'select' || e.evt.button !== 0) return
                    if (e.evt.shiftKey || spaceDown.current || e.evt.altKey)
                      return
                    e.cancelBubble = true
                    marqueeActive.current = false
                    setMarquee(null)
                    setSelection({ kind: 'floorPlate', id: plate.id })
                    const stage = e.target.getStage()
                    const pos = stage?.getPointerPosition()
                    const w = pos ? toWorld(pos.x, pos.y) : { x: 0, y: 0 }
                    plateMove.current = {
                      id: plate.id,
                      start: { x: w.x, y: w.y },
                      origin: { x: plate.x, y: plate.y },
                      moved: false,
                    }
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'grabbing'
                  }}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (plateMoveMoved.current) {
                      plateMoveMoved.current = false
                      return
                    }
                    if (tool === 'select') {
                      setSelection({ kind: 'floorPlate', id: plate.id })
                    }
                  }}
                />
                <Text
                  x={mid.x - 8}
                  y={mid.y - 8}
                  text="П"
                  fontSize={14}
                  fontFamily="IBM Plex Sans, sans-serif"
                  fill={selected ? '#c45c26' : '#5a7a5a'}
                  listening={false}
                />
              </Group>
            )
          })}

          {(floor.tiles ?? [])
            .filter((t) => t.surface.type === 'floor')
            .map((tile) => {
              const selected = isTileSelected(selection, tile.id)
              return (
                <Group key={tile.id}>
                  <FloorTileShape
                    tile={tile}
                    toScreen={toScreen}
                    selected={selected}
                    onMouseEnter={(e) => {
                      if (tool !== 'select') return
                      const c = e.target.getStage()?.container()
                      if (c) c.style.cursor = 'grab'
                    }}
                    onMouseLeave={(e) => {
                      const c = e.target.getStage()?.container()
                      if (c) c.style.cursor = 'default'
                    }}
                    onMouseDown={(e) => {
                      if (tool !== 'select' || e.evt.button !== 0) return
                      if (spaceDown.current || e.evt.altKey) return
                      if (e.evt.shiftKey) return
                      e.cancelBubble = true
                      marqueeActive.current = false
                      setMarquee(null)
                      const already = isTileSelected(selection, tile.id)
                      const ids = already
                        ? selectedTileIds(selection)
                        : [tile.id]
                      if (!already) setSelection({ kind: 'tile', id: tile.id })
                      const stage = e.target.getStage()
                      const pos = stage?.getPointerPosition()
                      const w = pos ? toWorld(pos.x, pos.y) : { x: 0, y: 0 }
                      tileMove.current = {
                        id: tile.id,
                        ids,
                        start: { x: w.x, y: w.y },
                        origin: { u: tile.u, v: tile.v },
                        moved: false,
                      }
                      const c = e.target.getStage()?.container()
                      if (c) c.style.cursor = 'grabbing'
                    }}
                    onClick={(e) => {
                      e.cancelBubble = true
                      if (tileMoveMoved.current) {
                        tileMoveMoved.current = false
                        return
                      }
                      if (tool === 'select') {
                        toggleSelectTile(tile.id, e.evt.shiftKey)
                      }
                      if (tool === 'cutTile') {
                        const stage = e.target.getStage()
                        const pos = stage?.getPointerPosition()
                        const at = pos ? toWorld(pos.x, pos.y) : { x: tile.u, y: tile.v }
                        if (!tileCutDraft?.a) beginTileCut(tile.id, at.x, at.y)
                        else finishTileCut(at.x, at.y, !e.evt.shiftKey)
                      }
                    }}
                  />
                </Group>
              )
            })}

          {(floor.boxes ?? []).map((box) => {
            const selected = isVolumeBoxSelected(selection, box.id)
            const rect = volumeBoxRect(box)
            const hitPts = worldRingToScreen(rect, toScreen)
            const mid = toScreen(box.x, box.y)
            return (
              <Group key={box.id}>
                <Line
                  points={hitPts}
                  closed
                  fill={
                    selected
                      ? 'rgba(196, 92, 38, 0.2)'
                      : 'rgba(138, 106, 69, 0.2)'
                  }
                  stroke={selected ? '#c45c26' : '#8a6a45'}
                  strokeWidth={selected ? 2 : 1.5}
                  onMouseEnter={(e) => {
                    if (tool !== 'select') return
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'grab'
                  }}
                  onMouseLeave={(e) => {
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'default'
                  }}
                  onMouseDown={(e) => {
                    if (tool !== 'select' || e.evt.button !== 0) return
                    if (e.evt.shiftKey || spaceDown.current || e.evt.altKey)
                      return
                    e.cancelBubble = true
                    marqueeActive.current = false
                    setMarquee(null)
                    setSelection({ kind: 'volumeBox', id: box.id })
                    const stage = e.target.getStage()
                    const pos = stage?.getPointerPosition()
                    const w = pos ? toWorld(pos.x, pos.y) : { x: 0, y: 0 }
                    boxMove.current = {
                      id: box.id,
                      start: { x: w.x, y: w.y },
                      origin: { x: box.x, y: box.y },
                      moved: false,
                    }
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'grabbing'
                  }}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (boxMoveMoved.current) {
                      boxMoveMoved.current = false
                      return
                    }
                    if (tool === 'select') {
                      setSelection({ kind: 'volumeBox', id: box.id })
                    }
                  }}
                />
                <Text
                  x={mid.x - 8}
                  y={mid.y - 8}
                  text="К"
                  fontSize={14}
                  fontFamily="IBM Plex Sans, sans-serif"
                  fill={selected ? '#c45c26' : '#8a6a45'}
                  listening={false}
                />
              </Group>
            )
          })}

          {(floor.boxCutouts ?? []).map((cut) => {
            const selected = isVolumeCutoutSelected(selection, cut.id)
            const rect = volumeCutoutRect(cut)
            const hitPts = worldRingToScreen(rect, toScreen)
            const mid = toScreen(cut.x, cut.y)
            return (
              <Group key={cut.id}>
                <Line
                  points={hitPts}
                  closed
                  fill={
                    selected
                      ? 'rgba(196, 92, 38, 0.16)'
                      : 'rgba(90, 64, 48, 0.12)'
                  }
                  stroke={selected ? '#c45c26' : '#5a4030'}
                  strokeWidth={selected ? 2 : 1.5}
                  dash={[5, 4]}
                  onMouseEnter={(e) => {
                    if (tool !== 'select') return
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'grab'
                  }}
                  onMouseLeave={(e) => {
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'default'
                  }}
                  onMouseDown={(e) => {
                    if (tool !== 'select' || e.evt.button !== 0) return
                    if (e.evt.shiftKey || spaceDown.current || e.evt.altKey)
                      return
                    e.cancelBubble = true
                    marqueeActive.current = false
                    setMarquee(null)
                    setSelection({ kind: 'volumeCutout', id: cut.id })
                    const stage = e.target.getStage()
                    const pos = stage?.getPointerPosition()
                    const w = pos ? toWorld(pos.x, pos.y) : { x: 0, y: 0 }
                    cutoutMove.current = {
                      id: cut.id,
                      start: { x: w.x, y: w.y },
                      origin: { x: cut.x, y: cut.y },
                      moved: false,
                    }
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'grabbing'
                  }}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (cutoutMoveMoved.current) {
                      cutoutMoveMoved.current = false
                      return
                    }
                    if (tool === 'select') {
                      setSelection({ kind: 'volumeCutout', id: cut.id })
                    }
                  }}
                />
                <Text
                  x={mid.x - 7}
                  y={mid.y - 8}
                  text="В"
                  fontSize={13}
                  fontFamily="IBM Plex Sans, sans-serif"
                  fill={selected ? '#c45c26' : '#5a4030'}
                  listening={false}
                />
              </Group>
            )
          })}

          {(floor.objects ?? []).map((obj) => {
            const selected = isObjectSelected(selection, obj.id)
            const mid = toScreen(obj.x, obj.y)
            const half = planHalfSizeOf(obj)
            const w = Math.max(6, half.x * 2 * scale)
            const h = Math.max(6, half.y * 2 * scale)
            return (
              <Group key={obj.id}>
                <Rect
                  x={mid.x - w / 2}
                  y={mid.y - h / 2}
                  width={w}
                  height={h}
                  fill={
                    selected
                      ? 'rgba(196, 92, 38, 0.28)'
                      : 'rgba(42, 111, 106, 0.18)'
                  }
                  stroke={selected ? '#c45c26' : '#2a6f6a'}
                  strokeWidth={selected ? 2 : 1.5}
                  listening={workbench === 'furnish'}
                  onMouseDown={(e) => {
                    if (workbench !== 'furnish') return
                    if (tool !== 'select' || e.evt.button !== 0) return
                    if (e.evt.shiftKey || spaceDown.current || e.evt.altKey)
                      return
                    e.cancelBubble = true
                    marqueeActive.current = false
                    setMarquee(null)
                    setSelection({ kind: 'object', id: obj.id })
                    const stage = e.target.getStage()
                    const pos = stage?.getPointerPosition()
                    const world = pos ? toWorld(pos.x, pos.y) : { x: 0, y: 0 }
                    objectMove.current = {
                      id: obj.id,
                      start: { x: world.x, y: world.y },
                      origin: { x: obj.x, y: obj.y },
                      moved: false,
                    }
                  }}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (objectMoveMoved.current) {
                      objectMoveMoved.current = false
                      return
                    }
                    if (workbench === 'furnish' && tool === 'select') {
                      setSelection({ kind: 'object', id: obj.id })
                    }
                  }}
                />
              </Group>
            )
          })}

          {(workbench === 'landscape'
            ? (groundPlants ?? [])
            : (floor.plants ?? [])
          )
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
            .map((p) => {
            const selected = selection?.kind === 'plant' && selection.id === p.id
            const mid = toScreen(p.x, p.y)
            const landscape = workbench === 'landscape'
            const sideM = landscape
              ? plantPlanAabbSide(p, landscapeMonth)
              : 1.2 * p.scale
            const r = Math.max(landscape ? 2 : 6, (sideM / 2) * scale)
            const name = speciesByKey(p.species).name
            const labelW = Math.max(64, r * 2)
            return (
              <Group key={p.id}>
                <Circle
                  x={mid.x}
                  y={mid.y}
                  radius={r}
                  fill={
                    selected
                      ? 'rgba(45, 120, 62, 0.35)'
                      : 'rgba(45, 120, 62, 0.18)'
                  }
                  stroke={selected ? '#2d783e' : '#3d6b2e'}
                  strokeWidth={selected ? 2 : 1}
                  onMouseEnter={(e) => {
                    if (!landscape) return
                    if (tool !== 'select' && tool !== 'plant') return
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'grab'
                  }}
                  onMouseLeave={(e) => {
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'default'
                  }}
                  onMouseDown={(e) => {
                    if (e.evt.button !== 0) return
                    if (!landscape) {
                      e.cancelBubble = true
                      setSelection({ kind: 'plant', id: p.id })
                      return
                    }
                    if (tool !== 'select' && tool !== 'plant') return
                    if (e.evt.shiftKey || spaceDown.current || e.evt.altKey)
                      return
                    e.cancelBubble = true
                    marqueeActive.current = false
                    setMarquee(null)
                    setSelection({ kind: 'plant', id: p.id })
                    const stage = e.target.getStage()
                    const pos = stage?.getPointerPosition()
                    const world = pos ? toWorld(pos.x, pos.y) : { x: 0, y: 0 }
                    plantMove.current = {
                      id: p.id,
                      start: { x: world.x, y: world.y },
                      origin: { x: p.x, y: p.y },
                      moved: false,
                    }
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'grabbing'
                  }}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (plantMoveMoved.current) {
                      plantMoveMoved.current = false
                      return
                    }
                    if (landscape) {
                      setSelection({ kind: 'plant', id: p.id })
                    }
                  }}
                />
                {landscape && (
                  <Text
                    x={mid.x - labelW / 2}
                    y={mid.y - 7}
                    width={labelW}
                    align="center"
                    text={name}
                    fontSize={11}
                    fontFamily="IBM Plex Sans, sans-serif"
                    fill={selected ? '#1d4a28' : '#24331c'}
                    listening={false}
                  />
                )}
              </Group>
            )
          })}

          {openingDraft &&
            (() => {
              const preview = createOpeningFromDrag(
                floor,
                openingDraft.wallId,
                openingDraft.kind,
                openingDraft.t0,
                openingDraft.t1,
              )
              if (!preview) return null
              const rect = openingPlanRect(floor, preview)
              if (!rect) return null
              const pts = worldRingToScreen(rect, toScreen)
              return (
                <Line
                  points={pts}
                  closed
                  fill="rgba(42, 111, 106, 0.28)"
                  stroke="#2a6f6a"
                  strokeWidth={1.5}
                  dash={[5, 4]}
                  listening={false}
                />
              )
            })()}

          {slabOpeningDraft &&
            (() => {
              const preview = createSlabOpeningFromDrag(
                slabOpeningDraft.x0,
                slabOpeningDraft.y0,
                slabOpeningDraft.x1,
                slabOpeningDraft.y1,
              )
              const pts = worldRingToScreen(slabOpeningRect(preview), toScreen)
              return (
                <Line
                  points={pts}
                  closed
                  fill="rgba(42, 111, 106, 0.22)"
                  stroke="#2a6f6a"
                  strokeWidth={1.5}
                  dash={[5, 4]}
                  listening={false}
                />
              )
            })()}

          {floorPlateDraft &&
            (() => {
              const preview = createFloorPlateFromDrag(
                floorPlateDraft.x0,
                floorPlateDraft.y0,
                floorPlateDraft.x1,
                floorPlateDraft.y1,
              )
              const pts = worldRingToScreen(floorPlateRect(preview), toScreen)
              return (
                <Line
                  points={pts}
                  closed
                  fill="rgba(90, 122, 90, 0.22)"
                  stroke="#5a7a5a"
                  strokeWidth={1.5}
                  dash={[5, 4]}
                  listening={false}
                />
              )
            })()}

          {boxDraft &&
            (() => {
              const preview = createVolumeBoxFromDrag(
                boxDraft.x0,
                boxDraft.y0,
                boxDraft.x1,
                boxDraft.y1,
              )
              const pts = worldRingToScreen(volumeBoxRect(preview), toScreen)
              return (
                <Line
                  points={pts}
                  closed
                  fill="rgba(138, 106, 69, 0.22)"
                  stroke="#8a6a45"
                  strokeWidth={1.5}
                  dash={[5, 4]}
                  listening={false}
                />
              )
            })()}

          {cutoutDraft &&
            (() => {
              const host = (floor.boxes ?? [])[0]
              if (!host) {
                const preview = createVolumeBoxFromDrag(
                  cutoutDraft.x0,
                  cutoutDraft.y0,
                  cutoutDraft.x1,
                  cutoutDraft.y1,
                )
                const pts = worldRingToScreen(volumeBoxRect(preview), toScreen)
                return (
                  <Line
                    points={pts}
                    closed
                    fill="rgba(90, 64, 48, 0.16)"
                    stroke="#5a4030"
                    strokeWidth={1.5}
                    dash={[5, 4]}
                    listening={false}
                  />
                )
              }
              const preview = createVolumeCutoutFromDrag(
                cutoutDraft.x0,
                cutoutDraft.y0,
                cutoutDraft.x1,
                cutoutDraft.y1,
                host,
              )
              const pts = worldRingToScreen(volumeCutoutRect(preview), toScreen)
              return (
                <Line
                  points={pts}
                  closed
                  fill="rgba(90, 64, 48, 0.16)"
                  stroke="#5a4030"
                  strokeWidth={1.5}
                  dash={[5, 4]}
                  listening={false}
                />
              )
            })()}

          {floor.vertices.map((v) => {
            const s = toScreen(v.x, v.y)
            const selected = isVertexSelected(selection, v.id)
            const locked = hasFixedPosition(floor.constraints, v.id)
            return (
              <Circle
                key={v.id}
                x={s.x}
                y={s.y}
                radius={selected ? 7 : 5}
                fill={locked ? '#8b3a2a' : selected ? '#c45c26' : '#2a6f6a'}
                stroke="#fff"
                strokeWidth={selected ? 2 : 1.5}
                draggable={tool === 'select' && !locked}
                onDragStart={() => {
                  pushHistory()
                  const state = useBuildingStore.getState()
                  const fl = state.activeFloor()
                  const sel = state.selection
                  const ids = selectedVertexIds(sel)
                  const group =
                    ids.includes(v.id) && ids.length > 1 ? ids : [v.id]
                  const positions: Record<string, { x: number; y: number }> = {}
                  for (const id of group) {
                    const vv = fl.vertices.find((x) => x.id === id)
                    if (vv) positions[id] = { x: vv.x, y: vv.y }
                  }
                  dragStartPositions.current = positions
                }}
                onDragMove={(e) => {
                  const w = toWorld(e.target.x(), e.target.y())
                  const starts = dragStartPositions.current
                  const ids = Object.keys(starts)
                  if (ids.length > 1) {
                    dragSelection(v.id, w.x, w.y, starts)
                  } else {
                    dragVertex(v.id, w.x, w.y)
                  }
                  const updated = useBuildingStore
                    .getState()
                    .activeFloor()
                    .vertices.find((x) => x.id === v.id)
                  if (updated) {
                    const ns = toScreen(updated.x, updated.y)
                    e.target.position({ x: ns.x, y: ns.y })
                  }
                }}
                onDragEnd={() => {
                  endDrag()
                  dragStartPositions.current = {}
                }}
                onClick={(e) => {
                  e.cancelBubble = true
                  marqueeActive.current = false
                  setMarquee(null)
                  if (tool === 'lockPoint') {
                    applyConstraintTool(v.x, v.y)
                  } else if (tool === 'wall') {
                    if (!wallDraftFrom) beginWall(v.x, v.y)
                    else finishWall(v.x, v.y)
                  } else if (tool === 'select') {
                    toggleSelectVertex(v.id, e.evt.shiftKey)
                  }
                }}
              />
            )
          })}

          <MepPlanLayer
            floor={floor}
            toScreen={toScreen}
            toWorld={toWorld}
            pointer={pointer}
          />
          {workbench === 'draft' && (
            <ConstraintPictograms floor={floor} toScreen={toScreen} />
          )}
          {tileGhosts.map((tile) => (
            <FloorTileShape
              key={`ghost-${tile.id}`}
              tile={tile}
              toScreen={toScreen}
              ghost
              listening={false}
            />
          ))}
          {tileCutDraft?.a && pointer && (
            <Line
              points={[
                toScreen(tileCutDraft.a.u, tileCutDraft.a.v).x,
                toScreen(tileCutDraft.a.u, tileCutDraft.a.v).y,
                toScreen(
                  tileCutDraft.b?.u ?? pointer.x,
                  tileCutDraft.b?.v ?? pointer.y,
                ).x,
                toScreen(
                  tileCutDraft.b?.u ?? pointer.x,
                  tileCutDraft.b?.v ?? pointer.y,
                ).y,
              ]}
              stroke="#c45c26"
              strokeWidth={1.5}
              dash={[6, 4]}
              listening={false}
            />
          )}
          {marqueeRect}
        </Layer>
      </Stage>

      {lengthEdit && (
        <form
          className="length-edit"
          style={{ left: lengthEdit.screenX, top: lengthEdit.screenY }}
          onSubmit={(e) => {
            e.preventDefault()
            commitLengthEdit()
          }}
        >
          <input
            ref={lengthInputRef}
            type="text"
            inputMode="decimal"
            value={lengthEdit.value}
            onChange={(e) =>
              setLengthEdit({ ...lengthEdit, value: e.target.value })
            }
            onBlur={commitLengthEdit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setLengthEdit(null)
              }
            }}
            aria-label="Длина стены, м"
          />
          <span>м</span>
        </form>
      )}
    </div>
  )
}
