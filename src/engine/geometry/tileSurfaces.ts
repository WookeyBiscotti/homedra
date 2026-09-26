import type {
  BoxFace,
  Floor,
  PlacedTile,
  TileSurface,
  VolumeBox,
  VolumeCutout,
  WallSide,
} from '../types'
import { wallFaceFrame, FLOOR_FINISH_Y_OFFSET } from './wallFaces'
import { openingsForWall, openingSpan } from './openings'
import { volumeBoxCorners, cutoutsForBox } from './volumeBoxes'
import { hitFloorPaintRegion, orientPolygonCCW } from './floorPaint'

export type TilePoint = { x: number; y: number }

export type TileContour = {
  outer: TilePoint[]
  holes: TilePoint[][]
}

export type Vec3 = { x: number; y: number; z: number }

export type TileSurfaceFrame = {
  surface: TileSurface
  origin: Vec3
  uDir: Vec3
  vDir: Vec3
  nDir: Vec3
  uSize: number
  vSize: number
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

export function worldToUv(frame: TileSurfaceFrame, p: Vec3): { u: number; v: number } {
  const dx = p.x - frame.origin.x
  const dy = p.y - frame.origin.y
  const dz = p.z - frame.origin.z
  return {
    u: dx * frame.uDir.x + dy * frame.uDir.y + dz * frame.uDir.z,
    v: dx * frame.vDir.x + dy * frame.vDir.y + dz * frame.vDir.z,
  }
}

export function uvToWorld(
  frame: TileSurfaceFrame,
  u: number,
  v: number,
  outset = 0,
): Vec3 {
  return {
    x: frame.origin.x + frame.uDir.x * u + frame.vDir.x * v + frame.nDir.x * outset,
    y: frame.origin.y + frame.uDir.y * u + frame.vDir.y * v + frame.nDir.y * outset,
    z: frame.origin.z + frame.uDir.z * u + frame.vDir.z * v + frame.nDir.z * outset,
  }
}

function rectContour(u0: number, v0: number, u1: number, v1: number): TileContour {
  return {
    outer: [
      { x: u0, y: v0 },
      { x: u1, y: v0 },
      { x: u1, y: v1 },
      { x: u0, y: v1 },
    ],
    holes: [],
  }
}

function addHole(
  contour: TileContour,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  clampU: number,
  clampV: number,
): void {
  const minU = Math.max(0, Math.min(u0, u1))
  const maxU = Math.min(clampU, Math.max(u0, u1))
  const minV = Math.max(0, Math.min(v0, v1))
  const maxV = Math.min(clampV, Math.max(v0, v1))
  if (maxU - minU < 1e-4 || maxV - minV < 1e-4) return
  contour.holes.push([
    { x: minU, y: minV },
    { x: maxU, y: minV },
    { x: maxU, y: maxV },
    { x: minU, y: maxV },
  ])
}

export function floorTileFrame(floor: Floor): TileSurfaceFrame {
  return {
    surface: { type: 'floor' },
    origin: vec3(0, floor.elevation + FLOOR_FINISH_Y_OFFSET, 0),
    uDir: vec3(1, 0, 0),
    vDir: vec3(0, 0, -1),
    nDir: vec3(0, 1, 0),
    uSize: 100,
    vSize: 100,
  }
}

export function floorContourAt(
  floor: Floor,
  x: number,
  y: number,
): TileContour | null {
  const region = hitFloorPaintRegion(floor, x, y)
  if (!region || region.polygon.length < 3) return null
  return { outer: orientPolygonCCW(region.polygon), holes: [] }
}

export function wallTileFrame(
  floor: Floor,
  wallId: string,
  side: WallSide,
): TileSurfaceFrame | null {
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return null
  const face = wallFaceFrame(floor, wall, side)
  if (!face) return null
  return {
    surface: { type: 'wall', wallId, side },
    origin: vec3(face.ax, face.elevation, face.az),
    uDir: vec3(face.ux, 0, face.uz),
    vDir: vec3(0, 1, 0),
    nDir: vec3(face.wnx, 0, face.wnz),
    uSize: face.len,
    vSize: face.height,
  }
}

export function wallTileContour(
  floor: Floor,
  wallId: string,
  side: WallSide,
): TileContour | null {
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return null
  const face = wallFaceFrame(floor, wall, side)
  if (!face) return null
  const contour = rectContour(0, 0, face.len, face.height)
  for (const opening of openingsForWall(floor, wallId)) {
    const span = openingSpan(opening)
    const u0 = span.start - face.s0
    const u1 = span.end - face.s0
    addHole(
      contour,
      u0,
      opening.sillHeight,
      u1,
      opening.sillHeight + opening.height,
      face.len,
      face.height,
    )
  }
  return contour
}

function boxExtents(box: VolumeBox) {
  const c = volumeBoxCorners(box)
  return {
    minX: c.minX,
    maxX: c.maxX,
    minY: c.minY,
    maxY: c.maxY,
    width: box.width,
    depth: box.depth,
    height: box.height,
  }
}

export function boxTileFrame(
  floor: Floor,
  box: VolumeBox,
  face: BoxFace,
): TileSurfaceFrame {
  const e = boxExtents(box)
  const elev = floor.elevation + box.elevation
  switch (face) {
    case 'posX':
      return {
        surface: { type: 'box', boxId: box.id, face },
        origin: vec3(e.maxX, elev, -e.minY),
        uDir: vec3(0, 0, -1),
        vDir: vec3(0, 1, 0),
        nDir: vec3(1, 0, 0),
        uSize: e.depth,
        vSize: e.height,
      }
    case 'negX':
      return {
        surface: { type: 'box', boxId: box.id, face },
        origin: vec3(e.minX, elev, -e.maxY),
        uDir: vec3(0, 0, 1),
        vDir: vec3(0, 1, 0),
        nDir: vec3(-1, 0, 0),
        uSize: e.depth,
        vSize: e.height,
      }
    case 'posY':
      return {
        surface: { type: 'box', boxId: box.id, face },
        origin: vec3(e.minX, elev, -e.maxY),
        uDir: vec3(1, 0, 0),
        vDir: vec3(0, 1, 0),
        nDir: vec3(0, 0, -1),
        uSize: e.width,
        vSize: e.height,
      }
    case 'negY':
      return {
        surface: { type: 'box', boxId: box.id, face },
        origin: vec3(e.maxX, elev, -e.minY),
        uDir: vec3(-1, 0, 0),
        vDir: vec3(0, 1, 0),
        nDir: vec3(0, 0, 1),
        uSize: e.width,
        vSize: e.height,
      }
    case 'top':
      return {
        surface: { type: 'box', boxId: box.id, face },
        origin: vec3(e.minX, elev + e.height, -e.minY),
        uDir: vec3(1, 0, 0),
        vDir: vec3(0, 0, -1),
        nDir: vec3(0, 1, 0),
        uSize: e.width,
        vSize: e.depth,
      }
    case 'bottom':
      return {
        surface: { type: 'box', boxId: box.id, face },
        origin: vec3(e.minX, elev, -e.minY),
        uDir: vec3(1, 0, 0),
        vDir: vec3(0, 0, -1),
        nDir: vec3(0, -1, 0),
        uSize: e.width,
        vSize: e.depth,
      }
  }
}

function cutoutOnVerticalFace(
  box: VolumeBox,
  cut: VolumeCutout,
  face: 'posX' | 'negX' | 'posY' | 'negY',
): boolean {
  const b = volumeBoxCorners(box)
  const c = volumeBoxCorners(cut)
  const eps = 1e-4
  const yOverlap = c.minY < b.maxY - eps && c.maxY > b.minY + eps
  const xOverlap = c.minX < b.maxX - eps && c.maxX > b.minX + eps
  const zOverlap = cut.elevation < box.elevation + box.height - eps &&
    cut.elevation + cut.height > box.elevation + eps
  if (!zOverlap) return false
  if (face === 'posX') return xOverlap && yOverlap && c.maxX > b.maxX - 0.02
  if (face === 'negX') return xOverlap && yOverlap && c.minX < b.minX + 0.02
  if (face === 'posY') return xOverlap && yOverlap && c.maxY > b.maxY - 0.02
  return xOverlap && yOverlap && c.minY < b.minY + 0.02
}

function cutoutOnCap(
  box: VolumeBox,
  cut: VolumeCutout,
  face: 'top' | 'bottom',
): boolean {
  const b = volumeBoxCorners(box)
  const c = volumeBoxCorners(cut)
  const eps = 1e-4
  const plan =
    c.minX < b.maxX - eps &&
    c.maxX > b.minX + eps &&
    c.minY < b.maxY - eps &&
    c.maxY > b.minY + eps
  if (!plan) return false
  const cutTop = cut.elevation + cut.height
  const boxTop = box.elevation + box.height
  if (face === 'top') return cutTop > boxTop - 0.02
  return cut.elevation < box.elevation + 0.02
}

export function boxTileContour(
  floor: Floor,
  box: VolumeBox,
  face: BoxFace,
): TileContour {
  const e = boxExtents(box)
  const uSize =
    face === 'posX' || face === 'negX' || face === 'top' || face === 'bottom'
      ? face === 'top' || face === 'bottom'
        ? e.width
        : e.depth
      : e.width
  const vSize = face === 'top' || face === 'bottom' ? e.depth : e.height
  const contour = rectContour(0, 0, uSize, vSize)
  const cuts = cutoutsForBox(floor, box.id)
  for (const cut of cuts) {
    const cc = volumeBoxCorners(cut)
    if (face === 'posX' || face === 'negX') {
      if (!cutoutOnVerticalFace(box, cut, face)) continue
      const u0 = cc.minY - e.minY
      const u1 = cc.maxY - e.minY
      const v0 = cut.elevation - box.elevation
      const v1 = cut.elevation + cut.height - box.elevation
      addHole(contour, u0, v0, u1, v1, uSize, vSize)
    } else if (face === 'posY' || face === 'negY') {
      if (!cutoutOnVerticalFace(box, cut, face)) continue
      const u0 = face === 'posY' ? cc.minX - e.minX : e.maxX - cc.maxX
      const u1 = face === 'posY' ? cc.maxX - e.minX : e.maxX - cc.minX
      const v0 = cut.elevation - box.elevation
      const v1 = cut.elevation + cut.height - box.elevation
      addHole(contour, u0, v0, u1, v1, uSize, vSize)
    } else if (cutoutOnCap(box, cut, face)) {
      addHole(
        contour,
        cc.minX - e.minX,
        cc.minY - e.minY,
        cc.maxX - e.minX,
        cc.maxY - e.minY,
        uSize,
        vSize,
      )
    }
  }
  return contour
}

export function tileSurfaceFrame(
  floor: Floor,
  surface: TileSurface,
): TileSurfaceFrame | null {
  if (surface.type === 'floor') return floorTileFrame(floor)
  if (surface.type === 'wall') {
    return wallTileFrame(floor, surface.wallId, surface.side)
  }
  const box = (floor.boxes ?? []).find((b) => b.id === surface.boxId)
  if (!box) return null
  return boxTileFrame(floor, box, surface.face)
}

export function tileSurfaceContour(
  floor: Floor,
  surface: TileSurface,
  hint?: { u: number; v: number },
): TileContour | null {
  if (surface.type === 'floor') {
    if (!hint) return null
    return floorContourAt(floor, hint.u, hint.v)
  }
  if (surface.type === 'wall') {
    return wallTileContour(floor, surface.wallId, surface.side)
  }
  const box = (floor.boxes ?? []).find((b) => b.id === surface.boxId)
  if (!box) return null
  return boxTileContour(floor, box, surface.face)
}

export function tilesOnSurface(floor: Floor, surface: TileSurface): PlacedTile[] {
  return (floor.tiles ?? []).filter((t) => {
    const a = t.surface
    if (a.type !== surface.type) return false
    if (surface.type === 'floor') return true
    if (surface.type === 'wall' && a.type === 'wall') {
      return a.wallId === surface.wallId && a.side === surface.side
    }
    if (surface.type === 'box' && a.type === 'box') {
      return a.boxId === surface.boxId && a.face === surface.face
    }
    return false
  })
}
