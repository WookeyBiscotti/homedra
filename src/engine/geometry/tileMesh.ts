import * as THREE from 'three'
import type { Floor, PlacedTile } from '../types'
import { tileFaceUv, tileLocalPolygon, tileLocalRect } from './tiles'
import { tileSurfaceFrame, uvToWorld, type TileSurfaceFrame } from './tileSurfaces'

export function buildTileGeometry(
  tile: PlacedTile,
  frame: TileSurfaceFrame,
): THREE.BufferGeometry | null {
  const poly = tileLocalPolygon(tile)
  if (poly.length < 3) return null
  const bounds = tileLocalRect(tile)
  const w = Math.max(1e-4, bounds.maxU - bounds.minU)
  const h = Math.max(1e-4, bounds.maxV - bounds.minV)
  const thickness = Math.max(0.002, tile.thickness)

  const shape = new THREE.Shape()
  shape.moveTo(poly[0].x, poly[0].y)
  for (let i = 1; i < poly.length; i++) {
    shape.lineTo(poly[i].x, poly[i].y)
  }
  shape.closePath()

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  })

  const pos = geo.getAttribute('position')
  const uv = geo.getAttribute('uv')
  if (!pos) {
    geo.dispose()
    return null
  }

  const next = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i)
    const v = pos.getY(i)
    const n = pos.getZ(i)
    const p = uvToWorld(frame, u, v, n)
    next[i * 3] = p.x
    next[i * 3 + 1] = p.y
    next[i * 3 + 2] = p.z
    if (uv) {
      const mapped = tileFaceUv((u - bounds.minU) / w, (v - bounds.minV) / h, tile.texRegion)
      uv.setXY(i, mapped.u, mapped.v)
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(next, 3))
  geo.computeVertexNormals()
  try {
    geo.computeTangents()
  } catch {
    // ignore
  }
  geo.computeBoundingSphere()
  return geo
}

export function buildPlacedTileGeometry(
  floor: Floor,
  tile: PlacedTile,
): THREE.BufferGeometry | null {
  const frame = tileSurfaceFrame(floor, tile.surface)
  if (!frame) return null
  return buildTileGeometry(tile, frame)
}

export function tileWorldPolygon(
  floor: Floor,
  tile: PlacedTile,
  outset = 0,
): Array<{ x: number; y: number; z: number }> | null {
  const frame = tileSurfaceFrame(floor, tile.surface)
  if (!frame) return null
  return tileLocalPolygon(tile).map((p) => uvToWorld(frame, p.x, p.y, outset))
}
