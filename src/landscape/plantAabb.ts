import * as THREE from 'three'
import type { LandscapePlant, PlantShape } from '../engine/types'
import { plantShapeCacheKey, resolvePlantShape } from './plantShape'
import { DEFAULT_LANDSCAPE_MONTH } from './season'
import { growPlant } from './seedthree'

const sizeCache = new Map<string, { x: number; y: number; z: number }>()

function cacheKey(
  species: string,
  seed: number,
  shape: Partial<PlantShape> | undefined,
  month: number,
): string {
  const resolved = resolvePlantShape(species, shape)
  return `${species}:${seed}:m${month}:${plantShapeCacheKey(resolved)}`
}

/** Local mesh AABB of the unscaled plant prototype, metres. */
export function plantLocalAabb(
  species: string,
  seed: number,
  shape?: Partial<PlantShape> | null,
  month: number = DEFAULT_LANDSCAPE_MONTH,
): { x: number; y: number; z: number } {
  const key = cacheKey(species, seed, shape ?? undefined, month)
  const hit = sizeCache.get(key)
  if (hit) return hit
  const mesh = growPlant(species, seed, shape, month)
  mesh.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(mesh)
  const axis = (a: number, b: number) => Math.max(0.05, b - a)
  const size = {
    x: axis(box.min.x, box.max.x),
    y: axis(box.min.y, box.max.y),
    z: axis(box.min.z, box.max.z),
  }
  sizeCache.set(key, size)
  return size
}

/**
 * Plan-view AABB side in metres: the larger horizontal extent of the
 * tree box, times instance scale. Circle diameter on the 2D map.
 */
export function plantPlanAabbSide(
  plant: Pick<LandscapePlant, 'species' | 'seed' | 'shape' | 'scale'>,
  month: number = DEFAULT_LANDSCAPE_MONTH,
): number {
  try {
    const size = plantLocalAabb(plant.species, plant.seed, plant.shape, month)
    return Math.max(size.x, size.z) * plant.scale
  } catch {
    const h = resolvePlantShape(plant.species, plant.shape).height
    return Math.max(0.2, h * 0.35) * plant.scale
  }
}
