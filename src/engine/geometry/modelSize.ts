import * as THREE from 'three'

/** Skip helper / pick meshes that are not part of the authored model. */
function isAuthoredMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  if ((obj as THREE.Mesh).isMesh !== true) return false
  if (obj.userData?.pickKind != null) return false
  const geom = (obj as THREE.Mesh).geometry
  return geom != null
}

/**
 * Local AABB of authored mesh geometry (bind pose), ignoring instance
 * scale/rotation and skinned world bones.
 *
 * `Box3.setFromObject` on a live instance bakes parent scale and, for
 * skinned/animated models, bone matrices — that inflates sizeX and then
 * `scale × size` double-applies.
 */
export function localGeometrySize(
  root: THREE.Object3D,
): { x: number; y: number; z: number } | null {
  const box = new THREE.Box3()
  const tmp = new THREE.Box3()
  let found = false
  root.updateMatrixWorld(true)
  root.traverse((obj) => {
    if (!isAuthoredMesh(obj)) return
    const geom = obj.geometry
    if (!geom.boundingBox) geom.computeBoundingBox()
    if (!geom.boundingBox || geom.boundingBox.isEmpty()) return
    tmp.copy(geom.boundingBox)
    obj.updateWorldMatrix(true, false)
    // Local size only: geometry space × the mesh's own bind/local matrix
    // relative to `root`, not the instance parent scale.
    const rel = new THREE.Matrix4()
    rel.copy(root.matrixWorld).invert().multiply(obj.matrixWorld)
    tmp.applyMatrix4(rel)
    if (!Number.isFinite(tmp.min.x) || tmp.isEmpty()) return
    if (!found) {
      box.copy(tmp)
      found = true
    } else {
      box.union(tmp)
    }
  })
  if (!found || box.isEmpty() || !Number.isFinite(box.min.x)) return null
  const axis = (a: number, b: number) =>
    Math.max(0.05, Math.round((b - a) * 1000) / 1000)
  return {
    x: axis(box.min.x, box.max.x),
    y: axis(box.min.y, box.max.y),
    z: axis(box.min.z, box.max.z),
  }
}

const WORLD_SIZE_SANE = 8

/** True when stored size×scale looks like a baked / exploded AABB. */
export function worldSizeLooksExploded(world: {
  x: number
  y: number
  z: number
}): boolean {
  return world.x > WORLD_SIZE_SANE || world.y > WORLD_SIZE_SANE || world.z > WORLD_SIZE_SANE
}

export function measuredSizeLooksPlausible(local: {
  x: number
  y: number
  z: number
}): boolean {
  return local.x <= WORLD_SIZE_SANE && local.y <= WORLD_SIZE_SANE && local.z <= WORLD_SIZE_SANE
}

const SCALE_IDENTITY_EPS = 0.02

/**
 * When translate/gizmo persist baked scale=1 onto a cm-authored mesh while
 * sizeX still holds the catalog meters, world size explodes and the
 * properties slider cannot shrink it. Restore size=local and scale so
 * world size matches the stored catalog size.
 */
export function recoverExplodedInstance(
  stored: {
    sizeX: number
    sizeY: number
    sizeZ: number
    scaleX: number
    scaleY: number
    scaleZ: number
  },
  local: { x: number; y: number; z: number },
): {
  sizeX: number
  sizeY: number
  sizeZ: number
  scaleX: number
  scaleY: number
  scaleZ: number
} | null {
  if (local.x < 1e-4 || local.y < 1e-4 || local.z < 1e-4) return null
  const scaleIsIdentity =
    Math.abs(stored.scaleX - 1) < SCALE_IDENTITY_EPS &&
    Math.abs(stored.scaleY - 1) < SCALE_IDENTITY_EPS &&
    Math.abs(stored.scaleZ - 1) < SCALE_IDENTITY_EPS
  if (!scaleIsIdentity) return null

  const storedLooksMeters = measuredSizeLooksPlausible({
    x: stored.sizeX,
    y: stored.sizeY,
    z: stored.sizeZ,
  })
  const muchBigger =
    local.x > stored.sizeX * 2.5 ||
    local.y > stored.sizeY * 2.5 ||
    local.z > stored.sizeZ * 2.5
  if (storedLooksMeters && muchBigger) {
    return {
      sizeX: local.x,
      sizeY: local.y,
      sizeZ: local.z,
      scaleX: stored.sizeX / local.x,
      scaleY: stored.sizeY / local.y,
      scaleZ: stored.sizeZ / local.z,
    }
  }

  const world = {
    x: Math.abs(stored.sizeX * stored.scaleX),
    y: Math.abs(stored.sizeY * stored.scaleY),
    z: Math.abs(stored.sizeZ * stored.scaleZ),
  }
  if (!worldSizeLooksExploded(world)) return null
  return {
    sizeX: local.x,
    sizeY: local.y,
    sizeZ: local.z,
    scaleX: 0.01,
    scaleY: 0.01,
    scaleZ: 0.01,
  }
}
