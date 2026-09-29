import {
  normalizeMoldingProfile,
  type MoldingKind,
  type MoldingProfile,
  type MoldingVertex,
} from '../types'

export type PlanPoint = { x: number; y: number }

/**
 * Circular arc through A→B with DXF bulge = tan(includedAngle/4).
 * Positive bulge = left of A→B (CCW).
 */
export function arcFromBulge(
  a: PlanPoint,
  b: PlanPoint,
  bulge: number,
): {
  center: PlanPoint
  radius: number
  startAngle: number
  endAngle: number
  ccw: boolean
} | null {
  if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-12) return null
  const dx = b.x - a.x
  const dy = b.y - a.y
  const chord = Math.hypot(dx, dy)
  if (chord < 1e-12) return null

  const absBulge = Math.abs(bulge)
  // sagitta = |bulge| * chord / 2  (from bulge = sagitta / (chord/2) for small…;
  // exact: radius = chord * (1 + bulge²) / (4 * |bulge|)
  const radius = (chord * (1 + absBulge * absBulge)) / (4 * absBulge)
  const sagitta = absBulge * chord * 0.5
  const midX = (a.x + b.x) * 0.5
  const midY = (a.y + b.y) * 0.5
  const nx = -dy / chord
  const ny = dx / chord
  // Distance from chord midpoint to center along normal
  const d = radius - sagitta
  const sign = bulge > 0 ? 1 : -1
  const center = { x: midX + nx * d * sign, y: midY + ny * d * sign }
  const startAngle = Math.atan2(a.y - center.y, a.x - center.x)
  const endAngle = Math.atan2(b.y - center.y, b.x - center.x)
  return {
    center,
    radius,
    startAngle,
    endAngle,
    ccw: bulge > 0,
  }
}

function sampleArc(
  arc: NonNullable<ReturnType<typeof arcFromBulge>>,
  /** Max central angle per chord, radians. ~18° keeps fillets coarse but smooth with normals. */
  maxSegAngle = Math.PI / 10,
): PlanPoint[] {
  let delta = arc.endAngle - arc.startAngle
  if (arc.ccw) {
    while (delta <= 0) delta += Math.PI * 2
  } else {
    while (delta >= 0) delta -= Math.PI * 2
  }
  const absDelta = Math.abs(delta)
  // Few corners: 2…8 chords per arc (quarter-circle → 5 verts with default angle).
  const steps = Math.max(2, Math.min(8, Math.ceil(absDelta / maxSegAngle)))
  const out: PlanPoint[] = []
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const ang = arc.startAngle + delta * t
    out.push({
      x: arc.center.x + Math.cos(ang) * arc.radius,
      y: arc.center.y + Math.sin(ang) * arc.radius,
    })
  }
  return out
}

export type TessellateProfileOpts = {
  /** Max central angle per arc chord (default ≈18°). */
  maxSegAngle?: number
}

export type TessellatedProfile = {
  vertices: MoldingVertex[]
  /**
   * For edge `i → (i+1)%n`: true when the edge is a chord of a bulge arc
   * (smooth shading). Straight segments are false (flat faces).
   */
  smoothEdge: boolean[]
}

/** Tessellate closed profile; tags arc chords for smooth normals. */
export function tessellateProfileDetailed(
  profile: MoldingProfile,
  tolMOrOpts: number | TessellateProfileOpts = {},
): TessellatedProfile {
  const opts: TessellateProfileOpts =
    typeof tolMOrOpts === 'number'
      ? { maxSegAngle: Math.PI / 10 }
      : tolMOrOpts
  const maxSegAngle = opts.maxSegAngle ?? Math.PI / 10
  const p = normalizeMoldingProfile(profile)
  const nSeg = p.vertices.length
  if (nSeg < 3) return { vertices: [], smoothEdge: [] }

  const vertices: MoldingVertex[] = []
  /** For each source segment: [startVert, endVertExclusive) in `vertices`. */
  const runs: Array<{ start: number; end: number; smooth: boolean }> = []

  for (let i = 0; i < nSeg; i++) {
    const a = p.vertices[i]!
    const start = vertices.length
    vertices.push({ x: a.x, y: a.y })
    const bulge = p.segments[i]?.bulge ?? 0
    const b = p.vertices[(i + 1) % nSeg]!
    const arc = arcFromBulge(a, b, bulge)
    if (arc) {
      for (const pt of sampleArc(arc, maxSegAngle)) {
        vertices.push({ x: pt.x, y: pt.y })
      }
    }
    runs.push({ start, end: vertices.length, smooth: !!arc })
  }

  const n = vertices.length
  const smoothEdge = new Array<boolean>(n).fill(false)
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r]!
    if (!run.smooth) continue
    // Chord edges inside the arc, and the last chord to the next segment start (B).
    for (let vi = run.start; vi < run.end; vi++) {
      smoothEdge[vi] = true
    }
  }

  return { vertices, smoothEdge }
}

/** Tessellate closed profile to a coarse polyline (first point not repeated at end). */
export function tessellateProfile(
  profile: MoldingProfile,
  tolMOrOpts: number | TessellateProfileOpts = {},
): MoldingVertex[] {
  return tessellateProfileDetailed(profile, tolMOrOpts).vertices
}

/**
 * Outward unit normals per profile edge (edge i = verts[i]→verts[i+1]).
 */
export function profileEdgeOutwardNormals(pts: MoldingVertex[]): PlanPoint[] {
  const n = pts.length
  if (n < 3) return []
  let cx = 0
  let cy = 0
  for (const p of pts) {
    cx += p.x
    cy += p.y
  }
  cx /= n
  cy /= n

  const edgeN: PlanPoint[] = []
  for (let i = 0; i < n; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % n]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    let nx = dy / len
    let ny = -dx / len
    const mx = (a.x + b.x) * 0.5 - cx
    const my = (a.y + b.y) * 0.5 - cy
    if (nx * mx + ny * my < 0) {
      nx = -nx
      ny = -ny
    }
    edgeN.push({ x: nx, y: ny })
  }
  return edgeN
}

/**
 * Per-vertex outward normals. Prefer `profileShadingNormals` for mesh building —
 * this averages all corners (smooth everywhere).
 */
export function profileOutwardNormals(pts: MoldingVertex[]): PlanPoint[] {
  const edgeN = profileEdgeOutwardNormals(pts)
  const n = edgeN.length
  if (n < 3) return []
  const out: PlanPoint[] = []
  for (let i = 0; i < n; i++) {
    const prev = edgeN[(i - 1 + n) % n]!
    const next = edgeN[i]!
    let nx = prev.x + next.x
    let ny = prev.y + next.y
    const len = Math.hypot(nx, ny)
    if (len < 1e-9) {
      nx = next.x
      ny = next.y
    } else {
      nx /= len
      ny /= len
    }
    out.push({ x: nx, y: ny })
  }
  return out
}

/**
 * Normals for the two endpoints of edge `i`, for extrusion shading.
 * Straight edges → constant face normal (flat). Arc chords → smooth blend
 * with neighbouring smooth edges only.
 */
export function profileEdgeShadingNormals(
  pts: MoldingVertex[],
  smoothEdge: boolean[],
  edgeIndex: number,
): { a: PlanPoint; b: PlanPoint } {
  const edgeN = profileEdgeOutwardNormals(pts)
  const n = edgeN.length
  const i = ((edgeIndex % n) + n) % n
  const j = (i + 1) % n
  const face = edgeN[i]!
  if (!smoothEdge[i]) {
    return { a: { ...face }, b: { ...face } }
  }
  const avg = (e0: PlanPoint, e1: PlanPoint): PlanPoint => {
    let nx = e0.x + e1.x
    let ny = e0.y + e1.y
    const len = Math.hypot(nx, ny)
    if (len < 1e-9) return { ...e1 }
    return { x: nx / len, y: ny / len }
  }
  const prev = (i - 1 + n) % n
  const next = j // edge from j
  const na =
    smoothEdge[prev] ? avg(edgeN[prev]!, face) : { ...face }
  const nb =
    smoothEdge[next] ? avg(face, edgeN[next]!) : { ...face }
  return { a: na, b: nb }
}

/** Reverse a closed ring of edge flags after reversing vertices. */
export function reverseSmoothEdges(smoothEdge: boolean[]): boolean[] {
  const n = smoothEdge.length
  if (n === 0) return []
  const out = new Array<boolean>(n)
  for (let i = 0; i < n; i++) {
    out[i] = smoothEdge[(n - 2 - i + n) % n]!
  }
  return out
}

/** Signed area of tessellated profile (positive = CCW in profile XY). */
export function profileSignedArea(profile: MoldingProfile): number {
  const pts = tessellateProfile(profile)
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const q = pts[(i + 1) % pts.length]!
    a += p.x * q.y - q.x * p.y
  }
  return a * 0.5
}

/** Ensure CCW winding for Three.js Shape / extrusion facing. */
export function ensureProfileCcw(profile: MoldingProfile): MoldingProfile {
  const p = normalizeMoldingProfile(profile)
  if (profileSignedArea(p) >= 0) return p
  return {
    vertices: [...p.vertices].reverse(),
    // Reverse segments: segment i (v_i→v_{i+1}) becomes between reversed verts;
    // new segment between rev[i] (= old[n-1-i]) and rev[i+1] (= old[n-2-i])
    // was old segment from old[n-2-i] → old[n-1-i], i.e. index n-2-i, with flipped bulge.
    segments: p.vertices.map((_, i) => {
      const n = p.vertices.length
      const oldSeg = (n - 2 - i + n) % n
      return { bulge: -(p.segments[oldSeg]?.bulge ?? 0) }
    }),
  }
}

export function defaultRoundedSkirtingProfile(): MoldingProfile {
  // 15×70 mm with a small fillet on the outer top corner.
  return {
    vertices: [
      { x: 0, y: 0 },
      { x: 0.015, y: 0 },
      { x: 0.015, y: 0.055 },
      { x: 0.008, y: 0.07 },
      { x: 0, y: 0.07 },
    ],
    segments: [
      { bulge: 0 },
      { bulge: 0 },
      { bulge: 0.2 },
      { bulge: 0 },
      { bulge: 0 },
    ],
  }
}

export function profileBounds(profile: MoldingProfile): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  const pts = tessellateProfile(profile)
  if (pts.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  }
  let minX = pts[0]!.x
  let maxX = pts[0]!.x
  let minY = pts[0]!.y
  let maxY = pts[0]!.y
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, maxX, minY, maxY }
}

export function moldingKindAxisHints(kind: MoldingKind): {
  xLabel: string
  yLabel: string
} {
  return kind === 'cove'
    ? { xLabel: 'В комнату', yLabel: 'Вниз от потолка' }
    : { xLabel: 'В комнату', yLabel: 'Вверх от пола' }
}
