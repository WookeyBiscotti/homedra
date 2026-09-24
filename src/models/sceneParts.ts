import * as THREE from 'three'

export type ScenePart = {
  /** Stable id stored on ModelRef.objectId */
  id: string
  label: string
}

function hasMesh(obj: THREE.Object3D): boolean {
  let found = false
  obj.traverse((c) => {
    if (found) return
    if ((c as THREE.Mesh).isMesh) found = true
  })
  return found
}

/**
 * Find sibling placable pieces: unwrap single wrapper groups until we see
 * 2+ mesh-bearing children (common in multi-model GLB packs).
 */
export function findPartRoots(scene: THREE.Object3D): THREE.Object3D[] {
  let layer: THREE.Object3D[] = [scene]
  for (let depth = 0; depth < 6; depth++) {
    const meshKids: THREE.Object3D[] = []
    for (const node of layer) {
      for (const child of node.children) {
        if (hasMesh(child)) meshKids.push(child)
      }
    }
    if (meshKids.length >= 2) return meshKids
    if (meshKids.length === 1) {
      layer = meshKids
      continue
    }
    break
  }
  return []
}

/**
 * Placable pieces inside a glTF scene.
 * Empty when the file is a single model.
 */
export function listSceneParts(scene: THREE.Object3D): ScenePart[] {
  const kids = findPartRoots(scene)
  if (kids.length < 2) return []
  const used = new Set<string>()
  return kids.map((child, i) => {
    const raw = child.name?.trim()
    let id = raw ? `name:${raw}` : `index:${i}`
    if (used.has(id)) id = `index:${i}`
    used.add(id)
    return {
      id,
      label: raw || `Модель ${i + 1}`,
    }
  })
}

function resolvePart(
  scene: THREE.Object3D,
  objectId: string,
): THREE.Object3D | null {
  const kids = findPartRoots(scene)
  if (objectId.startsWith('index:')) {
    const i = Number(objectId.slice(6))
    return kids[i] ?? null
  }
  if (objectId.startsWith('name:')) {
    const name = objectId.slice(5)
    return (
      kids.find((c) => c.name === name) ??
      scene.getObjectByName(name) ??
      null
    )
  }
  return null
}

/** Clone whole scene or one selected part for preview / placement. */
export function cloneSceneSelection(
  scene: THREE.Object3D,
  objectId?: string,
): THREE.Object3D {
  if (!objectId) return scene.clone(true)
  const kid = resolvePart(scene, objectId)
  if (!kid) return scene.clone(true)
  const g = new THREE.Group()
  g.add(kid.clone(true))
  return g
}
