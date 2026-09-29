import * as THREE from 'three'
import { type Floor, type PlacedTile } from '../types'
import { tileLocalPolygon, tileLocalRect } from './tiles'
import { tileSurfaceFrame, uvToWorld, type TileSurfaceFrame } from './tileSurfaces'

/** Keep the tile back just outside the host so it cannot sink into the solid. */
export const TILE_SURFACE_LIFT = 0.001
/** Bump when UV mapping changes so placed meshes rebuild. */
export const TILE_MESH_UV = 9

/** `u × v` along `n` — walls/some box faces are left-handed. */
export function tileFrameHandedness(frame: TileSurfaceFrame): number {
  const cx = frame.uDir.y * frame.vDir.z - frame.uDir.z * frame.vDir.y
  const cy = frame.uDir.z * frame.vDir.x - frame.uDir.x * frame.vDir.z
  const cz = frame.uDir.x * frame.vDir.y - frame.uDir.y * frame.vDir.x
  return cx * frame.nDir.x + cy * frame.nDir.y + cz * frame.nDir.z
}

function swapVertex(geo: THREE.BufferGeometry, a: number, b: number) {
  const pos = geo.attributes.position
  if (!pos) return
  const px = pos.getX(a)
  const py = pos.getY(a)
  const pz = pos.getZ(a)
  pos.setXYZ(a, pos.getX(b), pos.getY(b), pos.getZ(b))
  pos.setXYZ(b, px, py, pz)
  for (const name of ['uv', 'uv2'] as const) {
    const attr = geo.attributes[name]
    if (!attr) continue
    const u = attr.getX(a)
    const v = attr.getY(a)
    attr.setXY(a, attr.getX(b), attr.getY(b))
    attr.setXY(b, u, v)
    attr.needsUpdate = true
  }
}

function reverseWinding(geo: THREE.BufferGeometry) {
  const idx = geo.index
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i)
      idx.setX(i, idx.getX(i + 1))
      idx.setX(i + 1, a)
    }
    idx.needsUpdate = true
    return
  }
  const pos = geo.attributes.position
  if (!pos) return
  for (let i = 0; i < pos.count; i += 3) {
    swapVertex(geo, i, i + 1)
  }
  pos.needsUpdate = true
}

export function buildTileGeometry(
  tile: PlacedTile,
  frame: TileSurfaceFrame,
): THREE.BufferGeometry | null {
  const poly = tileLocalPolygon(tile)
  if (poly.length < 3) return null
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
  if (!pos) {
    geo.dispose()
    return null
  }

  const bounds = tileLocalRect(tile)
  const faceW = Math.max(1e-4, bounds.maxU - bounds.minU)
  const faceH = Math.max(1e-4, bounds.maxV - bounds.minV)
  const next = new Float32Array(pos.count * 3)
  const nextUv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i)
    const v = pos.getY(i)
    const n = pos.getZ(i)
    const p = uvToWorld(frame, u, v, n + TILE_SURFACE_LIFT)
    next[i * 3] = p.x
    next[i * 3 + 1] = p.y
    next[i * 3 + 2] = p.z
    // 0–1 over the unclipped tile so one stamp fills the face.
    nextUv[i * 2] = (u - bounds.minU) / faceW
    nextUv[i * 2 + 1] = (v - bounds.minV) / faceH
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(next, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(nextUv, 2))
  geo.setAttribute('uv2', geo.getAttribute('uv')!.clone())
  // Left-handed frames (wall u×v vs outward) flip ExtrudeGeometry winding
  // so the room-facing cap is culled and the back sits in the room.
  if (tileFrameHandedness(frame) < 0) reverseWinding(geo)
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
