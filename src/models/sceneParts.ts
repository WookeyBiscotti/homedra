import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

export type ScenePart = {
  /** Stable id stored on ModelRef.objectId (`path:…`, `cluster:…`, legacy `name:` / `index:`) */
  id: string
  label: string
}

export type SceneTreeNode = {
  id: string
  label: string
  kind: 'group' | 'mesh'
  children: SceneTreeNode[]
}

function hasMesh(obj: THREE.Object3D): boolean {
  let found = false
  obj.traverse((c) => {
    if (found) return
    if ((c as THREE.Mesh).isMesh) found = true
  })
  return found
}

function isMeshNode(obj: THREE.Object3D): boolean {
  return (obj as THREE.Mesh).isMesh === true
}

function isContainerPart(obj: THREE.Object3D): boolean {
  if (!isMeshNode(obj)) return hasMesh(obj)
  return obj.children.some((c) => hasMesh(c))
}

/** Group/object with several mesh pieces — not a one-mesh wrapper. */
function isAssembly(obj: THREE.Object3D): boolean {
  let meshes = 0
  obj.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) meshes++
  })
  return meshes >= 2
}

const _size = new THREE.Vector3()
const _ca = new THREE.Vector3()
const _cb = new THREE.Vector3()

function looksLikeFlatMeshPack(nodes: THREE.Object3D[]): boolean {
  const boxes: THREE.Box3[] = []
  for (const n of nodes) {
    const b = new THREE.Box3().setFromObject(n)
    if (!b.isEmpty() && Number.isFinite(b.min.x)) boxes.push(b)
  }
  if (boxes.length < 2 || boxes.length > 12) return false

  const diags = boxes.map((b) => b.getSize(_size).length())
  diags.sort((a, b) => a - b)
  const medianDiag = diags[Math.floor(diags.length / 2)] ?? 0
  if (!(medianDiag > 1e-6)) return false

  let separate = 0
  let pairs = 0
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      pairs++
      const a = boxes[i]!
      const b = boxes[j]!
      a.getCenter(_ca)
      b.getCenter(_cb)
      const dist = _ca.distanceTo(_cb)
      const ra = a.getSize(_size).length() / 2
      const rb = b.getSize(_size).length() / 2
      if (dist > (ra + rb) * 1.08) separate++
    }
  }
  return pairs > 0 && separate / pairs >= 0.6
}

/** Index path from `root` down to `obj` (empty = root itself). */
export function indexPathOf(
  root: THREE.Object3D,
  obj: THREE.Object3D,
): number[] | null {
  if (obj === root) return []
  const path: number[] = []
  let cur: THREE.Object3D | null = obj
  while (cur && cur !== root) {
    const parent: THREE.Object3D | null = cur.parent
    if (!parent) return null
    const i = parent.children.indexOf(cur)
    if (i < 0) return null
    path.unshift(i)
    cur = parent
  }
  return cur === root ? path : null
}

export function pathIdFromIndices(path: number[]): string {
  return path.length === 0 ? 'path:' : `path:${path.join('/')}`
}

export function parsePathId(id: string): number[] | null {
  if (!id.startsWith('path:')) return null
  const rest = id.slice(5)
  if (rest === '') return []
  const parts = rest.split('/')
  const out: number[] = []
  for (const p of parts) {
    const n = Number(p)
    if (!Number.isInteger(n) || n < 0) return null
    out.push(n)
  }
  return out
}

export function resolveByPath(
  root: THREE.Object3D,
  path: number[],
): THREE.Object3D | null {
  let node: THREE.Object3D = root
  for (const i of path) {
    const next = node.children[i]
    if (!next) return null
    node = next
  }
  return node
}

export function clusterId(parentPathId: string, prefix: string): string {
  return `cluster:${parentPathId}|${prefix}`
}

export function parseClusterId(
  id: string,
): { parentPathId: string; prefix: string } | null {
  if (!id.startsWith('cluster:')) return null
  const rest = id.slice('cluster:'.length)
  const bar = rest.lastIndexOf('|')
  if (bar < 0) return null
  return { parentPathId: rest.slice(0, bar), prefix: rest.slice(bar + 1) }
}

export function nameMatchesPrefix(name: string, prefix: string): boolean {
  return name === prefix || name.startsWith(`${prefix}_`)
}

/**
 * Longest underscore-prefix shared with at least one other sibling name.
 * `Jalousie_narrow_fin1` + `Jalousie_narrow_frame` → `Jalousie_narrow`.
 * `fixed` + `fixed_lattice` → `fixed`.
 */
export function nameClusterKey(name: string, allNames: string[]): string {
  const raw = name.trim()
  if (!raw || raw === 'Mesh' || raw === 'Group') return raw
  const parts = raw.split('_')
  for (let i = parts.length - (parts.length > 1 ? 1 : 0); i >= 1; i--) {
    const prefix = parts.slice(0, i).join('_')
    let hits = 0
    for (const n of allNames) {
      if (nameMatchesPrefix(n, prefix)) hits++
      if (hits >= 2) return prefix
    }
  }
  return raw
}

function clusterChildren(
  children: SceneTreeNode[],
  parentPathId: string,
): SceneTreeNode[] {
  if (children.length < 4) return children
  const names = children.map((c) => c.label)
  const groups = new Map<string, SceneTreeNode[]>()
  for (const child of children) {
    const key = nameClusterKey(child.label, names)
    const list = groups.get(key) ?? []
    list.push(child)
    groups.set(key, list)
  }
  const out: SceneTreeNode[] = []
  for (const [key, members] of groups) {
    if (members.length === 1) {
      out.push(members[0]!)
      continue
    }
    out.push({
      id: clusterId(parentPathId, key),
      label: key,
      kind: 'group',
      children: members,
    })
  }
  // One mega-cluster or no reduction → keep the raw siblings.
  if (out.length < 2 || out.length >= children.length) return children
  return out
}

function labelFor(obj: THREE.Object3D, fallback: string): string {
  const raw = obj.name?.trim()
  return raw || fallback
}

function kindOf(obj: THREE.Object3D): 'group' | 'mesh' {
  return isMeshNode(obj) && !obj.children.some((c) => hasMesh(c))
    ? 'mesh'
    : 'group'
}

function buildNode(
  obj: THREE.Object3D,
  root: THREE.Object3D,
  path: number[],
  depth: number,
): SceneTreeNode | null {
  if (depth > 14 || !hasMesh(obj)) return null
  const meshKids = obj.children
    .map((child, i) => ({ child, i }))
    .filter(({ child }) => hasMesh(child))

  const rawChildren: SceneTreeNode[] = []
  for (const { child, i } of meshKids) {
    const n = buildNode(child, root, [...path, i], depth + 1)
    if (n) rawChildren.push(n)
  }

  if (rawChildren.length === 0 && !isMeshNode(obj) && meshKids.length === 0) {
    return null
  }

  const pathId = pathIdFromIndices(path)
  return {
    id: pathId,
    label: labelFor(obj, isMeshNode(obj) ? 'Mesh' : 'Group'),
    kind: kindOf(obj),
    children: clusterChildren(rawChildren, pathId),
  }
}

/**
 * Hierarchy of mesh-bearing nodes under the glTF scene root.
 * Siblings that share a name prefix are grouped into virtual cluster nodes.
 */
export function buildSceneTree(scene: THREE.Object3D): SceneTreeNode[] {
  const roots: SceneTreeNode[] = []
  scene.children.forEach((child, i) => {
    const n = buildNode(child, scene, [i], 0)
    if (n) roots.push(n)
  })
  if (roots.length === 0 && isMeshNode(scene) && hasMesh(scene)) {
    roots.push({
      id: pathIdFromIndices([]),
      label: labelFor(scene, 'Scene'),
      kind: 'mesh',
      children: [],
    })
    return roots
  }
  return clusterChildren(roots, pathIdFromIndices([]))
}

/** First branching layer (unwrap single wrappers). */
export function unwrapTreeLayer(tree: SceneTreeNode[]): SceneTreeNode[] {
  let layer = tree
  for (let i = 0; i < 8; i++) {
    if (layer.length === 1 && layer[0]!.children.length >= 2) {
      layer = layer[0]!.children
      continue
    }
    break
  }
  return layer
}

/**
 * Default checkboxes: assemblies / name-clusters at the first useful layer.
 * Never dumps a kit of dozens of mesh fragments.
 */
export function suggestedExplodeParts(tree: SceneTreeNode[]): ScenePart[] {
  const layer = unwrapTreeLayer(tree)
  if (layer.length < 2 || layer.length > 30) return []

  const objects = layer.filter(
    (n) =>
      n.id.startsWith('cluster:') ||
      n.kind === 'group' ||
      n.children.length >= 2,
  )
  if (objects.length >= 2 && objects.length === layer.length) {
    return layer.map((n) => ({ id: n.id, label: n.label }))
  }
  return []
}

/** Flatten tree depth-first. */
export function flattenSceneTree(nodes: SceneTreeNode[]): SceneTreeNode[] {
  const out: SceneTreeNode[] = []
  const walk = (list: SceneTreeNode[]) => {
    for (const n of list) {
      out.push(n)
      if (n.children.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

export function findTreeNode(
  nodes: SceneTreeNode[],
  id: string,
): SceneTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const hit = findTreeNode(n.children, id)
    if (hit) return hit
  }
  return null
}

/**
 * Shallowest sibling layer that looks like separate placable models.
 * Used for legacy name:/index: ids — not for auto-explode.
 */
export function findPartRoots(scene: THREE.Object3D): THREE.Object3D[] {
  let layer: THREE.Object3D[] = [scene]
  for (let depth = 0; depth < 8; depth++) {
    const meshKids: THREE.Object3D[] = []
    for (const node of layer) {
      for (const child of node.children) {
        if (hasMesh(child)) meshKids.push(child)
      }
    }
    if (meshKids.length >= 2) {
      const assemblies = meshKids.filter(isAssembly)
      if (assemblies.length >= 2 && assemblies.length <= 30) return assemblies
      if (assemblies.length === 1) {
        layer = assemblies
        continue
      }
      const containers = meshKids.filter(isContainerPart)
      if (
        containers.length >= 2 &&
        containers.length <= 24 &&
        containers.length === meshKids.length
      ) {
        return containers
      }
      if (looksLikeFlatMeshPack(meshKids)) return meshKids
      return []
    }
    if (meshKids.length === 1) {
      layer = meshKids
      continue
    }
    break
  }
  return []
}

function partFromObject(
  scene: THREE.Object3D,
  obj: THREE.Object3D,
  indexFallback: number,
): ScenePart {
  const path = indexPathOf(scene, obj)
  if (path) {
    return {
      id: pathIdFromIndices(path),
      label: labelFor(obj, `Модель ${indexFallback + 1}`),
    }
  }
  const raw = obj.name?.trim()
  return {
    id: raw ? `name:${raw}` : `index:${indexFallback}`,
    label: raw || `Модель ${indexFallback + 1}`,
  }
}

/**
 * Suggested explode parts (auto). Empty when the file is a single model
 * or only a pile of mesh fragments.
 */
export function listSceneParts(scene: THREE.Object3D): ScenePart[] {
  const fromTree = suggestedExplodeParts(buildSceneTree(scene))
  if (fromTree.length >= 2) return fromTree

  const kids = findPartRoots(scene)
  if (kids.length < 2 || kids.length > 24) return []
  const used = new Set<string>()
  return kids.map((child, i) => {
    const part = partFromObject(scene, child, i)
    let id = part.id
    if (used.has(id)) id = `index:${i}`
    used.add(id)
    return { ...part, id }
  })
}

function cloneCluster(
  scene: THREE.Object3D,
  objectId: string,
): THREE.Object3D | null {
  const parsed = parseClusterId(objectId)
  if (!parsed) return null
  const parentPath = parsePathId(parsed.parentPathId)
  if (!parentPath) return null
  const parent = resolveByPath(scene, parentPath)
  if (!parent) return null
  const matches = parent.children.filter((c) => {
    if (!hasMesh(c)) return false
    return nameMatchesPrefix(c.name?.trim() ?? '', parsed.prefix)
  })
  if (matches.length === 0) return null
  const g = new THREE.Group()
  g.name = parsed.prefix
  for (const kid of matches) {
    g.add(cloneSkinned(kid))
  }
  g.applyMatrix4(parent.matrixWorld)
  return g
}

export function resolvePart(
  scene: THREE.Object3D,
  objectId: string,
): THREE.Object3D | null {
  if (objectId.startsWith('cluster:')) {
    return cloneCluster(scene, objectId)
  }
  const path = parsePathId(objectId)
  if (path) {
    return resolveByPath(scene, path)
  }
  if (objectId.startsWith('index:')) {
    const i = Number(objectId.slice(6))
    return findPartRoots(scene)[i] ?? null
  }
  if (objectId.startsWith('name:')) {
    const name = objectId.slice(5)
    const kids = findPartRoots(scene)
    return (
      kids.find((c) => c.name === name) ??
      scene.getObjectByName(name) ??
      null
    )
  }
  return null
}

/**
 * Clone whole scene or one selected part for preview / placement.
 * Part clones bake ancestor transforms so root scale/offset is kept.
 * Cluster ids clone every sibling that shares the name prefix.
 */
export function cloneSceneSelection(
  scene: THREE.Object3D,
  objectId?: string,
): THREE.Object3D {
  if (!objectId) return cloneSkinned(scene)
  scene.updateMatrixWorld(true)
  if (objectId.startsWith('cluster:')) {
    return cloneCluster(scene, objectId) ?? cloneSkinned(scene)
  }
  const kid = resolvePart(scene, objectId)
  if (!kid) return cloneSkinned(scene)
  // Cluster resolve already returns a detached baked group.
  if (!kid.parent) return kid
  const clone = cloneSkinned(kid)
  clone.applyMatrix4(kid.parent.matrixWorld)
  const g = new THREE.Group()
  g.add(clone)
  return g
}
