import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildRoomFloorGeometry } from './wallFaces'

function xzPointInTriangle(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): boolean {
  const v0x = cx - ax
  const v0z = cz - az
  const v1x = bx - ax
  const v1z = bz - az
  const v2x = px - ax
  const v2z = pz - az
  const dot00 = v0x * v0x + v0z * v0z
  const dot01 = v0x * v1x + v0z * v1z
  const dot02 = v0x * v2x + v0z * v2z
  const dot11 = v1x * v1x + v1z * v1z
  const dot12 = v1x * v2x + v1z * v2z
  const inv = 1 / (dot00 * dot11 - dot01 * dot01)
  const u = (dot11 * dot02 - dot01 * dot12) * inv
  const v = (dot00 * dot12 - dot01 * dot02) * inv
  return u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6
}

function geometryCoversXZ(
  geo: THREE.BufferGeometry,
  x: number,
  z: number,
): boolean {
  const pos = geo.attributes.position
  const idx = geo.index
  if (!pos || !idx) return false
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i)
    const b = idx.getX(i + 1)
    const c = idx.getX(i + 2)
    if (
      xzPointInTriangle(
        x,
        z,
        pos.getX(a),
        pos.getZ(a),
        pos.getX(b),
        pos.getZ(b),
        pos.getX(c),
        pos.getZ(c),
      )
    ) {
      return true
    }
  }
  return false
}

describe('buildRoomFloorGeometry stair holes', () => {
  it('cuts a stair hole fully inside the room', () => {
    const room = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 0, y: 4 },
    ]
    const stair = [
      { x: 1.5, y: 1 },
      { x: 2.5, y: 1 },
      { x: 2.5, y: 3 },
      { x: 1.5, y: 3 },
    ]
    const geo = buildRoomFloorGeometry(room, 0, { holes: [stair] })
    expect(geo).not.toBeNull()
    expect(geo!.attributes.position.count).toBeGreaterThan(8)
    // world Z = −planY
    expect(geometryCoversXZ(geo!, 2, -2)).toBe(false)
    expect(geometryCoversXZ(geo!, 0.5, -0.5)).toBe(true)
    geo!.dispose()
  })

  it('still cuts when the stair rect overhangs the wall-inset room', () => {
    // Room inset like half-thickness walls; stair sticks past y=0 into the wall
    const room = [
      { x: 0.1, y: 0.1 },
      { x: 4.9, y: 0.1 },
      { x: 4.9, y: 3.9 },
      { x: 0.1, y: 3.9 },
    ]
    const stair = [
      { x: 1.5, y: -0.2 },
      { x: 2.5, y: -0.2 },
      { x: 2.5, y: 1.5 },
      { x: 1.5, y: 1.5 },
    ]
    const geo = buildRoomFloorGeometry(room, 0, { holes: [stair] })
    expect(geo).not.toBeNull()
    // Inside the overhanging stair, still over the room — must be open
    expect(geometryCoversXZ(geo!, 2, -0.5)).toBe(false)
    expect(geometryCoversXZ(geo!, 2, -1.0)).toBe(false)
    // Away from stair — still covered
    expect(geometryCoversXZ(geo!, 4, -2)).toBe(true)
    geo!.dispose()
  })
})
