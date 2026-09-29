import {
  sameTileSurface,
  type Floor,
  type PlacedTile,
  type TileFillPattern,
  type TileSpec,
  type TileSurface,
} from '../types'
import {
  applyTileClip,
  createPlacedTile,
  tileFootprintSize,
  tileOverlapsOthers,
} from './tiles'
import { snapFillOriginToFaces, snapTileCenter } from './tileSnap'
import {
  tileSurfaceContour,
  tilesOnSurface,
  type TileContour,
} from './tileSurfaces'

/** Lock a fill grid to already laid tiles so leftovers stay on the same net. */
export function alignFillOrigin(
  spec: TileSpec,
  surface: TileSurface,
  originU: number,
  originV: number,
  groutM: number,
  rotation: number,
  existing: PlacedTile[],
): { u: number; v: number } {
  const neighbors = existing.filter((t) => sameTileSurface(t.surface, surface))
  if (neighbors.length === 0) return { u: originU, v: originV }
  const probe = createPlacedTile(spec, surface, originU, originV, groutM, rotation)
  const size = tileFootprintSize(probe)
  const stepU = size.width + groutM
  const stepV = size.length + groutM
  if (stepU < 0.05 || stepV < 0.05) return { u: originU, v: originV }
  let ref = neighbors[0]!
  let best = Infinity
  for (const t of neighbors) {
    const d = (t.u - originU) ** 2 + (t.v - originV) ** 2
    if (d < best) {
      best = d
      ref = t
    }
  }
  return { u: ref.u, v: ref.v }
}

export function layoutTile(
  spec: TileSpec,
  surface: TileSurface,
  u: number,
  v: number,
  groutM: number,
  rotation: number,
  floor: Floor,
  opts?: {
    snap?: boolean
    excludeId?: string
    excludeIds?: string[]
    contour?: TileContour | null
    existing?: PlacedTile[]
  },
): PlacedTile | null {
  const contour =
    opts?.contour !== undefined
      ? opts.contour
      : tileSurfaceContour(floor, surface, { u, v })
  if (!contour) return null
  let tile = createPlacedTile(spec, surface, u, v, groutM, rotation)
  const existing = opts?.existing ?? tilesOnSurface(floor, surface)
  const excludeIds = [
    ...(opts?.excludeIds ?? []),
    ...(opts?.excludeId ? [opts.excludeId] : []),
  ]
  if (opts?.snap !== false) {
    const snapped = snapTileCenter(tile, existing, contour, {
      groutM,
      excludeIds,
    })
    tile = { ...tile, u: snapped.u, v: snapped.v }
  }
  const clipped = applyTileClip(tile, contour, {
    blockers: existing,
    groutM,
    excludeIds,
  })
  if (!clipped) return null
  if (tileOverlapsOthers(clipped, existing, excludeIds)) return null
  return clipped
}

export function fillTilesOnSurface(
  spec: TileSpec,
  surface: TileSurface,
  originU: number,
  originV: number,
  groutM: number,
  rotation: number,
  pattern: TileFillPattern,
  floor: Floor,
  opts?: { limit?: number; snap?: boolean },
): PlacedTile[] {
  const contour = tileSurfaceContour(floor, surface, {
    u: originU,
    v: originV,
  })
  if (!contour) return []
  const existing = tilesOnSurface(floor, surface)
  const aligned = alignFillOrigin(
    spec,
    surface,
    originU,
    originV,
    groutM,
    rotation,
    existing,
  )
  const probe = createPlacedTile(spec, surface, aligned.u, aligned.v, groutM, rotation)
  const size = tileFootprintSize(probe)
  const stepU = size.width + groutM
  const stepV = size.length + groutM
  if (stepU < 0.05 || stepV < 0.05) return []
  const grid =
    opts?.snap && existing.length === 0
      ? snapFillOriginToFaces(
          aligned.u,
          aligned.v,
          stepU,
          stepV,
          size.width / 2,
          size.length / 2,
          groutM,
          contour,
        )
      : aligned

  const xs = contour.outer.map((p) => p.x)
  const ys = contour.outer.map((p) => p.y)
  const minU = Math.min(...xs) - stepU
  const maxU = Math.max(...xs) + stepU
  const minV = Math.min(...ys) - stepV
  const maxV = Math.max(...ys) + stepV

  const i0 = Math.floor((minU - grid.u) / stepU) - 1
  const i1 = Math.ceil((maxU - grid.u) / stepU) + 1
  const j0 = Math.floor((minV - grid.v) / stepV) - 1
  const j1 = Math.ceil((maxV - grid.v) / stepV) + 1

  const clickI = Math.round((originU - grid.u) / stepU)
  const clickJ = Math.round((originV - grid.v) / stepV)
  const row0 = pattern === 'horizontal' ? clickJ : j0
  const row1 = pattern === 'horizontal' ? clickJ : j1
  const col0 = pattern === 'vertical' ? clickI : i0
  const col1 = pattern === 'vertical' ? clickI : i1

  const placed: PlacedTile[] = []
  const limit = opts?.limit
  // Grid cells do not overlap. Only subtract tiles that were already on the
  // surface — clipping each new cell against every sibling was O(n²).
  for (let j = row0; j <= row1; j++) {
    const rowShift = pattern === 'offset' && (j & 1) === 1 ? stepU / 2 : 0
    for (let i = col0; i <= col1; i++) {
      const u = grid.u + i * stepU + rowShift
      const v = grid.v + j * stepV
      const tile = layoutTile(spec, surface, u, v, groutM, rotation, floor, {
        snap: false,
        contour,
        existing,
      })
      if (!tile) continue
      placed.push(tile)
      if (limit != null && placed.length >= limit) return placed
    }
  }
  return placed
}
