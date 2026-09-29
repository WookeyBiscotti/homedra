import { buildingBounds, buildingFootprintHoles } from '../engine/extrude'
import { unionWallPlanRegions } from '../engine/geometry/wallSolid'
import {
  isStoryFloor,
  type Building,
  type Floor,
  type LandscapeGrass,
  type LandscapePaint,
  type LandscapeTerrain,
  type MepAnchor,
} from '../engine/types'
import {
  decodeBytes,
  decodeHeights,
  encodeBytes,
  encodeHeights,
  frameSizeX,
  frameSizeY,
  resamplePlanGrid,
  type LandscapeFrame,
} from './maps'

export const PLOT_MIN_M = 8
export const PLOT_MAX_M = 200
export const PLOT_HOUSE_MARGIN_M = 0.5

export type PlotEdge = 'x+' | 'x-' | 'y+' | 'y-'

export type PlotPatch = {
  sizeX?: number
  sizeY?: number
  originX?: number
  originY?: number
}

export function plotFrame(terrain?: LandscapeTerrain | null): LandscapeFrame {
  if (!terrain) return { size: 40, sizeY: 40, originX: 0, originY: 0 }
  const sizeX = Math.max(PLOT_MIN_M, Number(terrain.size) || 40)
  const sizeY = Math.max(
    PLOT_MIN_M,
    Number(terrain.sizeY) || Number(terrain.size) || sizeX,
  )
  return {
    size: sizeX,
    sizeY,
    originX: Number(terrain.originX) || 0,
    originY: Number(terrain.originY) || 0,
  }
}

export function plotRect(frame: LandscapeFrame): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  const hx = frameSizeX(frame) / 2
  const hy = frameSizeY(frame) / 2
  return {
    minX: frame.originX - hx,
    maxX: frame.originX + hx,
    minY: frame.originY - hy,
    maxY: frame.originY + hy,
  }
}

/** Plan rings of the house footprint for the landscape 2D site map. */
export function housePlanOutline(
  building: Building,
): Array<Array<{ x: number; y: number }>> {
  const holes = buildingFootprintHoles(building)
  if (holes.length > 0) {
    return holes.map((ring) => ring.map((p) => ({ x: p.x, y: p.z })))
  }
  const story = building.floors.find(isStoryFloor)
  if (!story) return []
  return unionWallPlanRegions(story).map((r) => r.outer)
}

export function housePlanCenter(building: Building): { x: number; y: number } {
  const b = buildingBounds(building)
  return {
    x: (b.minX + b.maxX) / 2,
    y: (b.minZ + b.maxZ) / 2,
  }
}

/** House centre relative to the plot centre (plan XY). */
export function houseOffsetOnPlot(
  building: Building,
  frame: LandscapeFrame,
): { x: number; y: number } {
  const c = housePlanCenter(building)
  return { x: c.x - frame.originX, y: c.y - frame.originY }
}

export function clampPlotSize(value: number, houseSpan: number): number {
  const min = Math.max(PLOT_MIN_M, houseSpan + 2 * PLOT_HOUSE_MARGIN_M)
  return Math.max(min, Math.min(PLOT_MAX_M, value))
}

export function clampPlotFrame(
  frame: LandscapeFrame,
  building: Building,
): LandscapeFrame {
  const house = buildingBounds(building)
  const spanX = house.maxX - house.minX
  const spanY = house.maxZ - house.minZ
  const sizeX = clampPlotSize(frameSizeX(frame), spanX)
  const sizeY = clampPlotSize(frameSizeY(frame), spanY)
  const minOriginX = house.maxX + PLOT_HOUSE_MARGIN_M - sizeX / 2
  const maxOriginX = house.minX - PLOT_HOUSE_MARGIN_M + sizeX / 2
  const minOriginY = house.maxZ + PLOT_HOUSE_MARGIN_M - sizeY / 2
  const maxOriginY = house.minZ - PLOT_HOUSE_MARGIN_M + sizeY / 2
  return {
    size: sizeX,
    sizeY,
    originX: Math.min(maxOriginX, Math.max(minOriginX, frame.originX)),
    originY: Math.min(maxOriginY, Math.max(minOriginY, frame.originY)),
  }
}

export function resizePlotEdge(
  frame: LandscapeFrame,
  edge: PlotEdge,
  world: number,
  building: Building,
): LandscapeFrame {
  const rect = plotRect(frame)
  let minX = rect.minX
  let maxX = rect.maxX
  let minY = rect.minY
  let maxY = rect.maxY
  if (edge === 'x+') maxX = world
  else if (edge === 'x-') minX = world
  else if (edge === 'y+') maxY = world
  else minY = world
  const next: LandscapeFrame = {
    size: Math.max(PLOT_MIN_M, maxX - minX),
    sizeY: Math.max(PLOT_MIN_M, maxY - minY),
    originX: (minX + maxX) / 2,
    originY: (minY + maxY) / 2,
  }
  return clampPlotFrame(next, building)
}

function shiftAnchor(anchor: MepAnchor, dx: number, dy: number): MepAnchor {
  if (anchor.type !== 'slab') return anchor
  return { type: 'slab', x: anchor.x + dx, y: anchor.y + dy }
}

export function translateStories(
  building: Building,
  dx: number,
  dy: number,
): Building {
  if (dx === 0 && dy === 0) return building
  return {
    ...building,
    floors: building.floors.map((floor) =>
      isStoryFloor(floor) ? translateFloor(floor, dx, dy) : floor,
    ),
  }
}

function translateFloor(floor: Floor, dx: number, dy: number): Floor {
  return {
    ...floor,
    vertices: floor.vertices.map((v) => ({ ...v, x: v.x + dx, y: v.y + dy })),
    slabOpenings: floor.slabOpenings.map((o) => ({
      ...o,
      x: o.x + dx,
      y: o.y + dy,
    })),
    plates: floor.plates?.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    boxes: floor.boxes?.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })),
    boxCutouts: floor.boxCutouts?.map((c) => ({
      ...c,
      x: c.x + dx,
      y: c.y + dy,
    })),
    objects: floor.objects?.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy })),
    pipes: floor.pipes
      ? {
          ...floor.pipes,
          nodes: floor.pipes.nodes.map((n) => ({
            ...n,
            anchor: shiftAnchor(n.anchor, dx, dy),
          })),
        }
      : undefined,
    cables: floor.cables
      ? {
          ...floor.cables,
          nodes: floor.cables.nodes.map((n) => ({
            ...n,
            anchor: shiftAnchor(n.anchor, dx, dy),
          })),
        }
      : undefined,
  }
}

export function clampHouseDelta(
  building: Building,
  dx: number,
  dy: number,
  frame: LandscapeFrame,
): { dx: number; dy: number } {
  const house = buildingBounds(building)
  const plot = plotRect(frame)
  const m = PLOT_HOUSE_MARGIN_M
  let ndx = dx
  let ndy = dy
  const minX = house.minX + ndx
  const maxX = house.maxX + ndx
  const minY = house.minZ + ndy
  const maxY = house.maxZ + ndy
  if (minX < plot.minX + m) ndx += plot.minX + m - minX
  if (maxX > plot.maxX - m) ndx += plot.maxX - m - maxX
  if (minY < plot.minY + m) ndy += plot.minY + m - minY
  if (maxY > plot.maxY - m) ndy += plot.maxY - m - maxY
  return { dx: ndx, dy: ndy }
}

export function applyPlotFrame(
  terrain: LandscapeTerrain,
  paint: LandscapePaint | undefined,
  grass: LandscapeGrass | undefined,
  nextFrame: LandscapeFrame,
): {
  terrain: LandscapeTerrain
  paint: LandscapePaint | undefined
  grass: LandscapeGrass | undefined
} {
  const prev = plotFrame(terrain)
  const same =
    Math.abs(frameSizeX(prev) - frameSizeX(nextFrame)) < 1e-6 &&
    Math.abs(frameSizeY(prev) - frameSizeY(nextFrame)) < 1e-6 &&
    Math.abs(prev.originX - nextFrame.originX) < 1e-6 &&
    Math.abs(prev.originY - nextFrame.originY) < 1e-6
  const outTerrain: LandscapeTerrain = {
    ...terrain,
    size: frameSizeX(nextFrame),
    sizeY: frameSizeY(nextFrame),
    originX: nextFrame.originX,
    originY: nextFrame.originY,
  }
  if (same) {
    return { terrain: outTerrain, paint, grass }
  }

  const res = terrain.resolution
  if (terrain.heightPng) {
    const heights = decodeHeights(terrain.heightPng, res * res)
    const next = resamplePlanGrid(heights, res, prev, res, nextFrame)
    outTerrain.heightPng = encodeHeights(next)
  }

  let outPaint = paint
  if (paint?.splatPng) {
    const pr = paint.resolution
    const src = decodeBytes(paint.splatPng, pr * pr * 4)
    const sampled = resamplePlanGrid(src, pr, prev, pr, nextFrame, 4)
    const bytes = new Uint8Array(sampled.length)
    for (let i = 0; i < sampled.length; i++) {
      bytes[i] = Math.max(0, Math.min(255, Math.round(sampled[i] ?? 0)))
    }
    outPaint = { ...paint, splatPng: encodeBytes(bytes) }
  }

  let outGrass = grass
  if (grass?.layers.some((l) => l.coveragePng)) {
    const gr = grass.resolution
    outGrass = {
      ...grass,
      layers: grass.layers.map((layer) => {
        if (!layer.coveragePng) return layer
        const src = decodeBytes(layer.coveragePng, gr * gr)
        const sampled = resamplePlanGrid(src, gr, prev, gr, nextFrame)
        const bytes = new Uint8Array(sampled.length)
        for (let i = 0; i < sampled.length; i++) {
          bytes[i] = Math.max(0, Math.min(255, Math.round(sampled[i] ?? 0)))
        }
        return { ...layer, coveragePng: encodeBytes(bytes) }
      }),
    }
  }

  return { terrain: outTerrain, paint: outPaint, grass: outGrass }
}
