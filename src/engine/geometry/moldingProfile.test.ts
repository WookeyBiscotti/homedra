import { describe, expect, it } from 'vitest'
import {
  arcFromBulge,
  defaultRoundedSkirtingProfile,
  ensureProfileCcw,
  profileBounds,
  profileEdgeShadingNormals,
  profileSignedArea,
  tessellateProfile,
  tessellateProfileDetailed,
} from './moldingProfile'
import {
  addMoldings,
  addMoldingsReplacing,
  buildMoldingGeometry,
  fillRoomMoldings,
  freeMoldingIntervals,
  intervalContaining,
  moldingsOverlap,
  placeMoldingAtFaceU,
  roomEdgeTravel,
} from './moldings'
import {
  createEmptyFloor,
  createId,
  defaultMoldingSpec,
  type Floor,
  type Vertex,
  type Wall,
} from '../types'
import { wallFaceFrame } from './wallFaces'
import { detectRooms } from './wallSolid'

function rectFloor(): Floor {
  const v: Vertex[] = [
    { id: 'v0', x: 0, y: 0 },
    { id: 'v1', x: 4, y: 0 },
    { id: 'v2', x: 4, y: 3 },
    { id: 'v3', x: 0, y: 3 },
  ]
  const walls: Wall[] = [
    { id: 'w0', a: 'v0', b: 'v1', thickness: 0.2 },
    { id: 'w1', a: 'v1', b: 'v2', thickness: 0.2 },
    { id: 'w2', a: 'v2', b: 'v3', thickness: 0.2 },
    { id: 'w3', a: 'v3', b: 'v0', thickness: 0.2 },
  ]
  const floor = createEmptyFloor('Test', 0, 2.8)
  return { ...floor, vertices: v, walls }
}

describe('moldingProfile', () => {
  it('tessellates straight segments as vertices only', () => {
    const profile = {
      vertices: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      segments: [{ bulge: 0 }, { bulge: 0 }, { bulge: 0 }, { bulge: 0 }],
    }
    const pts = tessellateProfile(profile)
    expect(pts).toHaveLength(4)
    const detailed = tessellateProfileDetailed(profile)
    expect(detailed.smoothEdge).toEqual([false, false, false, false])
  })

  it('marks only arc chords as smooth', () => {
    const detailed = tessellateProfileDetailed(defaultRoundedSkirtingProfile())
    expect(detailed.smoothEdge.some(Boolean)).toBe(true)
    expect(detailed.smoothEdge.some((s) => !s)).toBe(true)
    // Straight bottom edge (first) is flat
    expect(detailed.smoothEdge[0]).toBe(false)
  })

  it('gives flat face normals on straight edges', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]
    const smooth = [false, false, false, false]
    const bottom = profileEdgeShadingNormals(pts, smooth, 0)
    expect(bottom.a.x).toBeCloseTo(bottom.b.x, 6)
    expect(bottom.a.y).toBeCloseTo(bottom.b.y, 6)
    // Bottom edge outward is −Y for CCW square
    expect(bottom.a.y).toBeLessThan(0)
    expect(Math.abs(bottom.a.x)).toBeLessThan(1e-6)
  })

  it('samples a semicircle for bulge=1', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 2, y: 0 }
    const arc = arcFromBulge(a, b, 1)
    expect(arc).not.toBeNull()
    expect(arc!.radius).toBeCloseTo(1, 5)
    expect(arc!.center.x).toBeCloseTo(1, 5)
    expect(arc!.center.y).toBeCloseTo(0, 5)

    const profile = {
      vertices: [a, b, { x: 1, y: -0.01 }],
      segments: [{ bulge: 1 }, { bulge: 0 }, { bulge: 0 }],
    }
    const pts = tessellateProfile(profile)
    // Coarse arc: few chords, not a millimetre polyline
    expect(pts.length).toBeGreaterThan(4)
    expect(pts.length).toBeLessThan(20)
    const mid = pts.find((p) => Math.abs(p.x - 1) < 0.2 && p.y < -0.5)
    expect(mid).toBeTruthy()
  })

  it('keeps fillet arcs to a small corner count', () => {
    const pts = tessellateProfile(defaultRoundedSkirtingProfile())
    // 5 base verts + a few fillet chords — not dozens
    expect(pts.length).toBeLessThan(14)
    expect(pts.length).toBeGreaterThanOrEqual(5)
  })

  it('flips winding to CCW', () => {
    const cw = {
      vertices: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
      ],
      segments: [{ bulge: 0 }, { bulge: 0 }, { bulge: 0 }, { bulge: 0 }],
    }
    expect(profileSignedArea(cw)).toBeLessThan(0)
    const ccw = ensureProfileCcw(cw)
    expect(profileSignedArea(ccw)).toBeGreaterThan(0)
  })
})

describe('molding intervals', () => {
  it('returns full face when no openings', () => {
    const floor = rectFloor()
    const ivs = freeMoldingIntervals(floor, 'w0', 'pos', 'skirting')
    expect(ivs.length).toBe(1)
    expect(ivs[0]!.s1 - ivs[0]!.s0).toBeGreaterThan(3)
  })

  it('cuts skirting at a door, not cove', () => {
    const floor = rectFloor()
    floor.openings = [
      {
        id: createId('op'),
        wallId: 'w0',
        kind: 'door',
        offset: 2,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
      },
    ]
    const skirt = freeMoldingIntervals(floor, 'w0', 'pos', 'skirting')
    expect(skirt.length).toBe(2)
    const cove = freeMoldingIntervals(floor, 'w0', 'pos', 'cove')
    expect(cove.length).toBe(1)
  })

  it('places molding on interval containing u', () => {
    const floor = rectFloor()
    const spec = defaultMoldingSpec('skirting')
    const placed = placeMoldingAtFaceU(floor, spec, 'w0', 'pos', 1.5)
    expect(placed).not.toBeNull()
    expect(placed!.s1 - placed!.s0).toBeGreaterThan(3)
    expect(
      intervalContaining([{ s0: 0, s1: 2 }, { s0: 3, s1: 4 }], 1.2)?.s0,
    ).toBe(0)
  })

  it('replaces overlapping moldings of the same kind on the same face', () => {
    const floor = rectFloor()
    const spec = defaultMoldingSpec('skirting')
    const first = placeMoldingAtFaceU(floor, spec, 'w0', 'pos', 1.5)!
    const withFirst = addMoldings(floor, [first])
    const second = placeMoldingAtFaceU(withFirst, spec, 'w0', 'pos', 2.0)!
    expect(moldingsOverlap(first, second)).toBe(true)
    const replaced = addMoldingsReplacing(withFirst, [second])
    expect(replaced.moldings).toHaveLength(1)
    expect(replaced.moldings![0]!.id).toBe(second.id)

    const cove = placeMoldingAtFaceU(
      replaced,
      defaultMoldingSpec('cove'),
      'w0',
      'pos',
      1.5,
    )!
    const both = addMoldingsReplacing(replaced, [cove])
    // Cove does not replace skirting
    expect(both.moldings).toHaveLength(2)
    expect(moldingsOverlap(second, cove)).toBe(false)
  })
})

describe('molding geometry orientation', () => {
  it('grows profile into the room along the wall normal', () => {
    const floor = rectFloor()
    const placed = placeMoldingAtFaceU(
      floor,
      defaultMoldingSpec('skirting'),
      'w0',
      'pos',
      1.5,
    )!
    const wall = floor.walls.find((w) => w.id === 'w0')!
    const face = wallFaceFrame(floor, wall, 'pos')!
    const geo = buildMoldingGeometry(floor, placed)!
    const pos = geo.getAttribute('position')
    let maxDot = -Infinity
    let minDot = Infinity
    const midS = (placed.s0 + placed.s1) * 0.5
    const originX = face.ax + face.ux * midS
    const originZ = face.az + face.uz * midS
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - originX
      const dz = pos.getZ(i) - originZ
      const dot = dx * face.wnx + dz * face.wnz
      maxDot = Math.max(maxDot, dot)
      minDot = Math.min(minDot, dot)
    }
    expect(minDot).toBeGreaterThan(-0.005)
    expect(maxDot).toBeGreaterThan(0.008)
    geo.dispose()
  })

  it('has outward-facing vertex normals', () => {
    const floor = rectFloor()
    const placed = placeMoldingAtFaceU(
      floor,
      defaultMoldingSpec('skirting'),
      'w0',
      'pos',
      1.5,
    )!
    const geo = buildMoldingGeometry(floor, placed)!
    const pos = geo.getAttribute('position')
    const nor = geo.getAttribute('normal')
    let cx = 0
    let cy = 0
    let cz = 0
    for (let i = 0; i < pos.count; i++) {
      cx += pos.getX(i)
      cy += pos.getY(i)
      cz += pos.getZ(i)
    }
    cx /= pos.count
    cy /= pos.count
    cz /= pos.count
    let outward = 0
    let inward = 0
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - cx
      const dy = pos.getY(i) - cy
      const dz = pos.getZ(i) - cz
      const dot = nor.getX(i) * dx + nor.getY(i) * dy + nor.getZ(i) * dz
      if (dot >= 0) outward++
      else inward++
    }
    expect(outward).toBeGreaterThan(inward)
    geo.dispose()
  })

  it('includes outward-facing end caps for rect, rounded, cove, and miters', () => {
    const floor = rectFloor()
    const specs = [
      defaultMoldingSpec('skirting'),
      {
        ...defaultMoldingSpec('skirting'),
        profile: defaultRoundedSkirtingProfile(),
      },
      defaultMoldingSpec('cove'),
    ]
    for (const spec of specs) {
      for (const side of ['pos', 'neg'] as const) {
        const placed = placeMoldingAtFaceU(floor, spec, 'w0', side, 1.5)!
        const geo = buildMoldingGeometry(floor, placed)!
        const pos = geo.getAttribute('position')
        const idx = geo.getIndex()!
        expect(pos.count).toBeGreaterThan(8)
        expect(idx.count).toBeGreaterThan(24)
        let cx = 0
        let cy = 0
        let cz = 0
        for (let i = 0; i < pos.count; i++) {
          cx += pos.getX(i)
          cy += pos.getY(i)
          cz += pos.getZ(i)
        }
        cx /= pos.count
        cy /= pos.count
        cz /= pos.count
        let outwardCap = 0
        let inwardCap = 0
        for (let t = 0; t < idx.count; t += 3) {
          const i0 = idx.getX(t)
          const i1 = idx.getX(t + 1)
          const i2 = idx.getX(t + 2)
          const ax = pos.getX(i0)
          const ay = pos.getY(i0)
          const az = pos.getZ(i0)
          const bx = pos.getX(i1)
          const by = pos.getY(i1)
          const bz = pos.getZ(i1)
          const px = pos.getX(i2)
          const py = pos.getY(i2)
          const pz = pos.getZ(i2)
          const e1x = bx - ax
          const e1y = by - ay
          const e1z = bz - az
          const e2x = px - ax
          const e2y = py - ay
          const e2z = pz - az
          let fx = e1y * e2z - e1z * e2y
          let fy = e1z * e2x - e1x * e2z
          let fz = e1x * e2y - e1y * e2x
          const fl = Math.hypot(fx, fy, fz) || 1
          fx /= fl
          fy /= fl
          fz /= fl
          const mx = (ax + bx + px) / 3
          const my = (ay + by + py) / 3
          const mz = (az + bz + pz) / 3
          const dot = fx * (mx - cx) + fy * (my - cy) + fz * (mz - cz)
          const alongRun = Math.abs(fy) < 0.45 && Math.hypot(fx, fz) > 0.55
          if (!alongRun) continue
          if (dot >= 0) outwardCap++
          else inwardCap++
        }
        expect(outwardCap).toBeGreaterThan(0)
        expect(inwardCap).toBe(0)
        geo.dispose()
      }
    }

    const rooms = detectRooms(floor)
    const moldings = fillRoomMoldings(
      floor,
      rooms[0]!.key,
      defaultMoldingSpec('skirting'),
    )
    expect(moldings.length).toBe(4)
    for (const m of moldings) {
      const geo = buildMoldingGeometry(floor, m)!
      expect(geo.getIndex()!.count).toBeGreaterThan(24)
      geo.dispose()
    }
  })

  it('uses ~45° miters on a rectangular room and keeps corners closed', () => {
    const floor = rectFloor()
    const rooms = detectRooms(floor)
    expect(rooms.length).toBeGreaterThan(0)
    const room = rooms[0]!
    const moldings = fillRoomMoldings(
      floor,
      room.key,
      defaultMoldingSpec('skirting'),
    )
    expect(moldings.length).toBe(4)
    for (const m of moldings) {
      const ang = Math.max(
        Math.abs(m.miterStart ?? 0),
        Math.abs(m.miterEnd ?? 0),
      )
      expect(ang).toBeGreaterThan(0.5) // > ~29°
      expect(ang).toBeLessThan(0.9) // < ~52°
    }

    const maxX = profileBounds(defaultMoldingSpec('skirting').profile).maxX
    // Order moldings as room edges; outer tips at shared corners must meet.
    for (let i = 0; i < room.edges.length; i++) {
      const edgeA = room.edges[i]!
      const edgeB = room.edges[(i + 1) % room.edges.length]!
      const a = moldings.find(
        (m) => m.wallId === edgeA.wallId && m.side === edgeA.side,
      )!
      const b = moldings.find(
        (m) => m.wallId === edgeB.wallId && m.side === edgeB.side,
      )!
      const tip = (
        m: (typeof moldings)[0],
        side: 'pos' | 'neg',
        atTravelEnd: boolean,
      ) => {
        const wall = floor.walls.find((w) => w.id === m.wallId)!
        const face = wallFaceFrame(floor, wall, side)!
        const travel = roomEdgeTravel(floor, m.wallId, side)!
        const useS1 = travel.forward ? atTravelEnd : !atTravelEnd
        const s = useS1 ? m.s1 : m.s0
        const miter = useS1 ? (m.miterEnd ?? 0) : (m.miterStart ?? 0)
        const shear = maxX * Math.tan(miter) * (useS1 ? -1 : 1)
        const ox = face.ax + face.ux * s
        const oz = face.az + face.uz * s
        return {
          x: ox + face.wnx * maxX + face.ux * shear,
          z: oz + face.wnz * maxX + face.uz * shear,
        }
      }
      const ta = tip(a, edgeA.side, true)
      const tb = tip(b, edgeB.side, false)
      const dist = Math.hypot(ta.x - tb.x, ta.z - tb.z)
      expect(dist).toBeLessThan(0.03)
    }
  })
})
