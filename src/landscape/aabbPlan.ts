import * as THREE from 'three'

/** Larger horizontal AABB side of `root`, times uniform instance scale. */
export function aabbPlanSide(root: THREE.Object3D, scale = 1): number {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const x = Math.max(0.05, box.max.x - box.min.x)
  const z = Math.max(0.05, box.max.z - box.min.z)
  return Math.max(x, z) * scale
}
