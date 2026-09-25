import * as THREE from 'three'

/** Max edge length (meters) so vertex displacement has something to move. */
export const PBR_DISPLACE_EDGE_M = 0.2

type Vert = {
  p: [number, number, number]
  n: [number, number, number]
  u: [number, number]
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`
}

function distSq(a: Vert, b: Vert): number {
  const dx = a.p[0] - b.p[0]
  const dy = a.p[1] - b.p[1]
  const dz = a.p[2] - b.p[2]
  return dx * dx + dy * dy + dz * dz
}

function lerpVert(a: Vert, b: Vert): Vert {
  const n: [number, number, number] = [
    (a.n[0] + b.n[0]) * 0.5,
    (a.n[1] + b.n[1]) * 0.5,
    (a.n[2] + b.n[2]) * 0.5,
  ]
  const len = Math.hypot(n[0], n[1], n[2]) || 1
  return {
    p: [
      (a.p[0] + b.p[0]) * 0.5,
      (a.p[1] + b.p[1]) * 0.5,
      (a.p[2] + b.p[2]) * 0.5,
    ],
    n: [n[0] / len, n[1] / len, n[2] / len],
    u: [(a.u[0] + b.u[0]) * 0.5, (a.u[1] + b.u[1]) * 0.5],
  }
}

function readVerts(geo: THREE.BufferGeometry): Vert[] {
  const pos = geo.attributes.position
  const nrm = geo.attributes.normal
  const uv = geo.attributes.uv
  const verts: Vert[] = []
  for (let i = 0; i < pos.count; i++) {
    verts.push({
      p: [pos.getX(i), pos.getY(i), pos.getZ(i)],
      n: nrm
        ? [nrm.getX(i), nrm.getY(i), nrm.getZ(i)]
        : [0, 1, 0],
      u: uv ? [uv.getX(i), uv.getY(i)] : [0, 0],
    })
  }
  return verts
}

function readTris(geo: THREE.BufferGeometry): Array<[number, number, number]> {
  const tris: Array<[number, number, number]> = []
  const index = geo.index
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      tris.push([index.getX(i), index.getX(i + 1), index.getX(i + 2)])
    }
    return tris
  }
  const count = geo.attributes.position.count
  for (let i = 0; i < count; i += 3) {
    tris.push([i, i + 1, i + 2])
  }
  return tris
}

function buildGeometry(verts: Vert[], tris: Array<[number, number, number]>) {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const v of verts) {
    positions.push(v.p[0], v.p[1], v.p[2])
    normals.push(v.n[0], v.n[1], v.n[2])
    uvs.push(v.u[0], v.u[1])
  }
  for (const t of tris) indices.push(t[0], t[1], t[2])
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  return geo
}

/**
 * Split triangles until no edge is longer than `maxEdge`.
 * Returns the original geometry when nothing needs splitting.
 */
export function tessellateByMaxEdge(
  geo: THREE.BufferGeometry,
  maxEdge = PBR_DISPLACE_EDGE_M,
  maxIterations = 8,
): THREE.BufferGeometry {
  const pos = geo.attributes.position
  if (!pos || pos.count < 3) return geo

  const maxEdgeSq = maxEdge * maxEdge
  let verts = readVerts(geo)
  let tris = readTris(geo)
  let changed = false

  for (let iter = 0; iter < maxIterations; iter++) {
    let needs = false
    for (const [a, b, c] of tris) {
      if (
        distSq(verts[a], verts[b]) > maxEdgeSq ||
        distSq(verts[b], verts[c]) > maxEdgeSq ||
        distSq(verts[c], verts[a]) > maxEdgeSq
      ) {
        needs = true
        break
      }
    }
    if (!needs) break

    const mid = new Map<string, number>()
    const midpoint = (a: number, b: number) => {
      const key = edgeKey(a, b)
      const hit = mid.get(key)
      if (hit !== undefined) return hit
      const i = verts.length
      verts.push(lerpVert(verts[a], verts[b]))
      mid.set(key, i)
      return i
    }

    const next: Array<[number, number, number]> = []
    for (const [a, b, c] of tris) {
      const ab = distSq(verts[a], verts[b]) > maxEdgeSq
      const bc = distSq(verts[b], verts[c]) > maxEdgeSq
      const ca = distSq(verts[c], verts[a]) > maxEdgeSq
      if (!ab && !bc && !ca) {
        next.push([a, b, c])
        continue
      }
      const mab = midpoint(a, b)
      const mbc = midpoint(b, c)
      const mca = midpoint(c, a)
      next.push([a, mab, mca], [mab, b, mbc], [mca, mbc, c], [mab, mbc, mca])
    }
    tris = next
    changed = true
  }

  if (!changed) return geo
  return buildGeometry(verts, tris)
}
