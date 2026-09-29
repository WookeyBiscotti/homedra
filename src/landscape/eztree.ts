/**
 * EZ-Tree adapter (@dgreenheck/ez-tree).
 * Presets are generated in EZ-Tree units, then scaled to metres.
 */
import { Tree } from '@dgreenheck/ez-tree'
import * as THREE from 'three'
import type { PlantShape } from '../engine/types'
import { defaultPlantShape, plantShapeCacheKey } from './plantShape'
import { DEFAULT_LANDSCAPE_MONTH, seasonLook } from './season'
import { speciesByKey } from './species'

const cache = new Map<string, THREE.Group>()
const prototypes = new Set<InstanceType<typeof Tree>>()

function ratio(now: number, base: number): number {
  if (!Number.isFinite(now) || !Number.isFinite(base) || Math.abs(base) < 1e-6) {
    return 1
  }
  return now / base
}

function fitHeight(obj: THREE.Object3D, meters: number): void {
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(obj)
  const h = box.max.y - box.min.y
  if (h < 1e-4 || !Number.isFinite(meters) || meters <= 0) return
  obj.scale.multiplyScalar(meters / h)
  obj.updateMatrixWorld(true)
  const grounded = new THREE.Box3().setFromObject(obj)
  obj.position.y -= grounded.min.y
}

function tuneFromShape(
  tree: InstanceType<typeof Tree>,
  species: string,
  seed: number,
  shape: PlantShape,
): void {
  const d = defaultPlantShape(species)
  tree.options.seed = seed
  const levels = tree.options.branch.levels + (shape.levels - d.levels)
  tree.options.branch.levels = THREE.MathUtils.clamp(Math.round(levels), 1, 3)
  tree.options.branch.children[0] = Math.max(
    1,
    Math.round(tree.options.branch.children[0] * ratio(shape.branchDensity, d.branchDensity)),
  )
  tree.options.branch.angle[1] *= ratio(shape.branchAngle, d.branchAngle)
  tree.options.branch.gnarliness[0] *= ratio(shape.gnarliness, d.gnarliness)
  tree.options.branch.radius[0] *= ratio(shape.trunkThickness, d.trunkThickness)
  if (!shape.showLeaves) {
    tree.options.leaves.count = 0
    return
  }
  tree.options.leaves.count = Math.max(
    0,
    Math.round(tree.options.leaves.count * ratio(shape.leavesPerBranch, d.leavesPerBranch)),
  )
  tree.options.leaves.size *= ratio(shape.leafSize, d.leafSize)
  tree.options.leaves.angle *= ratio(shape.leafAngle, d.leafAngle)
  tree.options.leaves.start = THREE.MathUtils.clamp(
    tree.options.leaves.start * ratio(Math.max(0.02, shape.leafStart), Math.max(0.02, d.leafStart)),
    0,
    1,
  )
  tree.options.leaves.sizeVariance = THREE.MathUtils.clamp(
    tree.options.leaves.sizeVariance * ratio(shape.leafSizeVar, d.leafSizeVar),
    0,
    1,
  )
  tree.options.leaves.alphaTest = THREE.MathUtils.clamp(shape.leafAlpha, 0.08, 0.9)
}

export function growEzTree(
  preset: string,
  species: string,
  seed: number,
  shape: PlantShape,
  month: number = DEFAULT_LANDSCAPE_MONTH,
): THREE.Group {
  const season = seasonLook(species, month)
  const grown = {
    ...shape,
    showLeaves: shape.showLeaves && season.showLeaves,
  }
  const key = `ez2:${preset}:${species}:${seed}:m${month}:${plantShapeCacheKey(grown)}`
  const hit = cache.get(key)
  if (hit) return hit.clone(true)

  const tree = new Tree()
  tree.loadPreset(preset)
  const tune = speciesByKey(species).eztreeTune
  if (season.leafTint !== undefined) tree.options.leaves.tint = season.leafTint
  else if (tune?.leafTint !== undefined) tree.options.leaves.tint = tune.leafTint
  if (tune?.barkTint !== undefined) tree.options.bark.tint = tune.barkTint
  tuneFromShape(tree, species, seed, grown)
  if (season.blossom && grown.showLeaves && tree.options.leaves.count > 0) {
    tree.options.leaves.count = Math.max(
      4,
      Math.round(tree.options.leaves.count * 0.48),
    )
  }
  tree.generate()
  tree.traverse((obj) => {
    obj.frustumCulled = false
  })
  fitHeight(tree, shape.height)
  tree.name = `eztree:${preset}`
  cache.set(key, tree)
  prototypes.add(tree)
  return tree.clone(true)
}

export function tickEzTreeWind(time: number): void {
  for (const tree of prototypes) tree.update(time)
}
