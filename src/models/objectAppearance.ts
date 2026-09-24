/** List / apply paint + texture + PBR overrides on a GLB scene graph. */

import * as THREE from 'three'
import type {
  MaterialRef,
  ObjectAppearance,
  ObjectMaterialOverride,
} from '../engine/types'
import {
  applyTileRepeat,
  loadPbrMaps,
  type LoadedPbrMaps,
} from '../materials/ambientcg'

/** Native PBR sample for editor fallbacks. */
export type PbrSample = {
  color?: string
  roughness?: number
  metalness?: number
  emissive?: string
  emissiveIntensity?: number
  opacity?: number
  envMapIntensity?: number
  normalScale?: number
  aoMapIntensity?: number
}

export type SceneMaterialInfo = {
  /** Stable id for `appearance.slots` keys. */
  id: string
  label: string
  /** Sample base color as `#rrggbb` when available. */
  sampleColor?: string
  /** Native PBR scalars for editor fallbacks. */
  sample?: PbrSample
}

type ColorCapable = THREE.Material & {
  color?: THREE.Color
  emissive?: THREE.Color
  emissiveIntensity?: number
  map?: THREE.Texture | null
  normalMap?: THREE.Texture | null
  roughnessMap?: THREE.Texture | null
  metalnessMap?: THREE.Texture | null
  aoMap?: THREE.Texture | null
  roughness?: number
  metalness?: number
  opacity?: number
  transparent?: boolean
  aoMapIntensity?: number
  envMapIntensity?: number
  normalScale?: THREE.Vector2
  needsUpdate?: boolean
}

const ORIG_KEY = '__appearanceOrig'

type OrigSnapshot = {
  color?: string
  emissive?: string
  emissiveIntensity?: number
  map?: THREE.Texture | null
  normalMap?: THREE.Texture | null
  roughnessMap?: THREE.Texture | null
  metalnessMap?: THREE.Texture | null
  aoMap?: THREE.Texture | null
  roughness?: number
  metalness?: number
  opacity?: number
  transparent?: boolean
  aoMapIntensity?: number
  envMapIntensity?: number
  normalScaleX?: number
  normalScaleY?: number
}

const PBR_KEYS: (keyof ObjectMaterialOverride)[] = [
  'tint',
  'material',
  'roughness',
  'metalness',
  'emissive',
  'emissiveIntensity',
  'opacity',
  'envMapIntensity',
  'normalScale',
  'aoMapIntensity',
]

function asMats(mat: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(mat) ? mat : [mat]
}

function materialId(
  mat: THREE.Material,
  fallbackIndex: number,
  used: Set<string>,
): string {
  const raw = mat.name?.trim()
  let id = raw ? `name:${raw}` : `index:${fallbackIndex}`
  if (used.has(id)) id = `index:${fallbackIndex}`
  used.add(id)
  return id
}

function materialLabel(mat: THREE.Material, fallbackIndex: number): string {
  const raw = mat.name?.trim()
  return raw || `Материал ${fallbackIndex + 1}`
}

function sampleFromMat(mat: THREE.Material): PbrSample {
  const m = mat as ColorCapable
  const sample: PbrSample = {}
  if (m.color) sample.color = `#${m.color.getHexString()}`
  if (m.roughness !== undefined) sample.roughness = m.roughness
  if (m.metalness !== undefined) sample.metalness = m.metalness
  if (m.emissive) sample.emissive = `#${m.emissive.getHexString()}`
  if (m.emissiveIntensity !== undefined) {
    sample.emissiveIntensity = m.emissiveIntensity
  }
  if (m.opacity !== undefined) sample.opacity = m.opacity
  if (m.envMapIntensity !== undefined) sample.envMapIntensity = m.envMapIntensity
  if (m.normalScale) sample.normalScale = m.normalScale.x
  if (m.aoMapIntensity !== undefined) sample.aoMapIntensity = m.aoMapIntensity
  return sample
}

/** Unique materials under a scene root (stable ids for slot overrides). */
export function listSceneMaterials(root: THREE.Object3D): SceneMaterialInfo[] {
  const seen = new Map<THREE.Material, string>()
  const used = new Set<string>()
  const out: SceneMaterialInfo[] = []
  let auto = 0
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    for (const mat of asMats(mesh.material)) {
      if (seen.has(mat)) continue
      const id = materialId(mat, auto, used)
      seen.set(mat, id)
      const sample = sampleFromMat(mat)
      out.push({
        id,
        label: materialLabel(mat, auto),
        sampleColor: sample.color,
        sample,
      })
      auto += 1
    }
  })
  return out
}

/**
 * Clone mesh materials so appearance edits do not mutate the shared GLTF cache.
 * Idempotent via userData flag.
 */
export function detachSharedMaterials(root: THREE.Object3D): void {
  if (root.userData.__appearanceDetached) return
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => m.clone())
    } else {
      mesh.material = mesh.material.clone()
    }
  })
  root.userData.__appearanceDetached = true
}

function rememberOrig(mat: ColorCapable): OrigSnapshot {
  const existing = mat.userData?.[ORIG_KEY] as OrigSnapshot | undefined
  if (existing) return existing
  const snap: OrigSnapshot = {
    color: mat.color ? `#${mat.color.getHexString()}` : undefined,
    emissive: mat.emissive ? `#${mat.emissive.getHexString()}` : undefined,
    emissiveIntensity: mat.emissiveIntensity,
    map: mat.map ?? null,
    normalMap: mat.normalMap ?? null,
    roughnessMap: mat.roughnessMap ?? null,
    metalnessMap: mat.metalnessMap ?? null,
    aoMap: mat.aoMap ?? null,
    roughness: mat.roughness,
    metalness: mat.metalness,
    opacity: mat.opacity,
    transparent: mat.transparent,
    aoMapIntensity: mat.aoMapIntensity,
    envMapIntensity: mat.envMapIntensity,
    normalScaleX: mat.normalScale?.x,
    normalScaleY: mat.normalScale?.y,
  }
  mat.userData = { ...mat.userData, [ORIG_KEY]: snap }
  return snap
}

function restoreOrig(mat: ColorCapable, snap: OrigSnapshot): void {
  if (mat.color && snap.color) mat.color.set(snap.color)
  if (mat.emissive && snap.emissive) mat.emissive.set(snap.emissive)
  if (snap.emissiveIntensity !== undefined) {
    mat.emissiveIntensity = snap.emissiveIntensity
  }
  if ('map' in mat) mat.map = snap.map ?? null
  if ('normalMap' in mat) mat.normalMap = snap.normalMap ?? null
  if ('roughnessMap' in mat) mat.roughnessMap = snap.roughnessMap ?? null
  if ('metalnessMap' in mat) mat.metalnessMap = snap.metalnessMap ?? null
  if ('aoMap' in mat) mat.aoMap = snap.aoMap ?? null
  if (snap.roughness !== undefined) mat.roughness = snap.roughness
  if (snap.metalness !== undefined) mat.metalness = snap.metalness
  if (snap.opacity !== undefined) mat.opacity = snap.opacity
  if (snap.transparent !== undefined) mat.transparent = snap.transparent
  if (snap.aoMapIntensity !== undefined) mat.aoMapIntensity = snap.aoMapIntensity
  if (snap.envMapIntensity !== undefined) {
    mat.envMapIntensity = snap.envMapIntensity
  }
  if (mat.normalScale && snap.normalScaleX !== undefined) {
    mat.normalScale.set(
      snap.normalScaleX,
      snap.normalScaleY ?? snap.normalScaleX,
    )
  }
  mat.needsUpdate = true
}

function pick<T>(
  slot: ObjectMaterialOverride | undefined,
  global: ObjectAppearance,
  key: keyof ObjectMaterialOverride,
): T | undefined {
  if (slot && key in slot) {
    return slot[key] as T | undefined
  }
  return global[key] as T | undefined
}

function resolveOverride(
  appearance: ObjectAppearance | undefined,
  slotId: string,
): ObjectMaterialOverride {
  if (!appearance) return {}
  const slot = appearance.slots?.[slotId]
  const out: ObjectMaterialOverride = {}
  for (const key of PBR_KEYS) {
    const v = pick(slot, appearance, key)
    if (v !== undefined) {
      ;(out as Record<string, unknown>)[key] = v
    }
  }
  return out
}

function applyMapsToMat(mat: ColorCapable, maps: LoadedPbrMaps): void {
  if (!('map' in mat)) return
  mat.map = maps.map ?? null
  mat.normalMap = maps.normalMap ?? null
  mat.roughnessMap = maps.roughnessMap ?? null
  mat.metalnessMap = maps.metalnessMap ?? null
  mat.aoMap = maps.aoMap ?? null
  if (maps.roughnessMap) mat.roughness = 1
  if (maps.metalnessMap) mat.metalness = 1
  if (maps.aoMap) mat.aoMapIntensity = 1
  mat.envMapIntensity = 0.75
  // Map multiplies with color — keep white unless tinted.
  if (mat.color && maps.map) mat.color.set('#ffffff')
  mat.needsUpdate = true
}

function applyPbrScalars(mat: ColorCapable, ov: ObjectMaterialOverride): void {
  if (ov.tint && mat.color) mat.color.set(ov.tint)
  if (ov.roughness !== undefined && 'roughness' in mat) {
    mat.roughness = ov.roughness
  }
  if (ov.metalness !== undefined && 'metalness' in mat) {
    mat.metalness = ov.metalness
  }
  if (ov.emissive && mat.emissive) mat.emissive.set(ov.emissive)
  if (ov.emissiveIntensity !== undefined && 'emissiveIntensity' in mat) {
    mat.emissiveIntensity = ov.emissiveIntensity
  }
  if (ov.opacity !== undefined && 'opacity' in mat) {
    mat.opacity = ov.opacity
    mat.transparent = ov.opacity < 0.999
  }
  if (ov.envMapIntensity !== undefined && 'envMapIntensity' in mat) {
    mat.envMapIntensity = ov.envMapIntensity
  }
  if (ov.normalScale !== undefined && mat.normalScale) {
    mat.normalScale.set(ov.normalScale, ov.normalScale)
  }
  if (ov.aoMapIntensity !== undefined && 'aoMapIntensity' in mat) {
    mat.aoMapIntensity = ov.aoMapIntensity
  }
  mat.needsUpdate = true
}

/** True when override carries any stored field. */
export function overrideHasValues(ov: ObjectMaterialOverride): boolean {
  if (ov.tint || ov.material) return true
  if (ov.material === null) return true
  return (
    ov.roughness !== undefined ||
    ov.metalness !== undefined ||
    ov.emissive !== undefined ||
    ov.emissiveIntensity !== undefined ||
    ov.opacity !== undefined ||
    ov.envMapIntensity !== undefined ||
    ov.normalScale !== undefined ||
    ov.aoMapIntensity !== undefined
  )
}

function pruneOverride(ov: ObjectMaterialOverride): ObjectMaterialOverride | undefined {
  const next: ObjectMaterialOverride = {}
  if (ov.tint) next.tint = ov.tint
  if (ov.material) next.material = ov.material
  if (ov.roughness !== undefined) next.roughness = ov.roughness
  if (ov.metalness !== undefined) next.metalness = ov.metalness
  if (ov.emissive) next.emissive = ov.emissive
  if (ov.emissiveIntensity !== undefined) {
    next.emissiveIntensity = ov.emissiveIntensity
  }
  if (ov.opacity !== undefined) next.opacity = ov.opacity
  if (ov.envMapIntensity !== undefined) next.envMapIntensity = ov.envMapIntensity
  if (ov.normalScale !== undefined) next.normalScale = ov.normalScale
  if (ov.aoMapIntensity !== undefined) next.aoMapIntensity = ov.aoMapIntensity
  return overrideHasValues(next) ? next : undefined
}

/** Collect MaterialRefs referenced by an appearance (for prefetch). */
export function appearanceMaterialRefs(
  appearance: ObjectAppearance | undefined,
): MaterialRef[] {
  if (!appearance) return []
  const refs: MaterialRef[] = []
  if (appearance.material) refs.push(appearance.material)
  if (appearance.slots) {
    for (const slot of Object.values(appearance.slots) as ObjectMaterialOverride[]) {
      if (slot.material) refs.push(slot.material)
    }
  }
  return refs
}

export function appearanceHasOverrides(
  appearance: ObjectAppearance | undefined,
): boolean {
  if (!appearance) return false
  const { slots, ...global } = appearance
  if (overrideHasValues(global)) return true
  if (!slots) return false
  return Object.values(slots).some((s) => overrideHasValues(s))
}

/**
 * Apply tint + PBR scalars + optional preloaded maps. Restores originals when
 * overrides are cleared. Call after `detachSharedMaterials`.
 */
export function applyAppearanceToObject(
  root: THREE.Object3D,
  appearance: ObjectAppearance | undefined,
  pbrByAssetId: Map<string, LoadedPbrMaps> = new Map(),
): void {
  detachSharedMaterials(root)
  let auto = 0
  const seen = new Map<THREE.Material, string>()
  const used = new Set<string>()

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    for (const raw of asMats(mesh.material)) {
      const mat = raw as ColorCapable
      let id = seen.get(raw)
      if (!id) {
        id = materialId(raw, auto, used)
        seen.set(raw, id)
        auto += 1
      }
      const snap = rememberOrig(mat)
      const ov = resolveOverride(appearance, id)

      // Always restore first so clearing a slot returns to source look.
      restoreOrig(mat, snap)

      if (ov.material) {
        const maps = pbrByAssetId.get(ov.material.assetId)
        if (maps) {
          applyTileRepeat(maps, ov.material.tileSizeM, 1, 1)
          applyMapsToMat(mat, maps)
        }
      }

      applyPbrScalars(mat, ov)
    }
  })
}

/** Load all PBR maps needed by appearance. */
export async function loadAppearanceMaps(
  appearance: ObjectAppearance | undefined,
): Promise<Map<string, LoadedPbrMaps>> {
  const map = new Map<string, LoadedPbrMaps>()
  const refs = appearanceMaterialRefs(appearance)
  await Promise.all(
    refs.map(async (ref) => {
      if (map.has(ref.assetId)) return
      try {
        const loaded = await loadPbrMaps(ref)
        map.set(ref.assetId, loaded)
      } catch (err) {
        console.warn('[appearance] PBR load failed', ref.assetId, err)
      }
    }),
  )
  return map
}

/** Empty / normalize appearance for storage (omit empty slots). */
export function pruneAppearance(
  appearance: ObjectAppearance | undefined,
): ObjectAppearance | undefined {
  if (!appearance) return undefined
  const { slots: rawSlots, ...globalRaw } = appearance
  const global = pruneOverride(globalRaw) ?? {}
  const slots: Record<string, ObjectMaterialOverride> = {}
  if (rawSlots) {
    for (const [k, v] of Object.entries(rawSlots) as [
      string,
      ObjectMaterialOverride,
    ][]) {
      const pruned = pruneOverride(v)
      if (pruned) slots[k] = pruned
    }
  }
  const out: ObjectAppearance = { ...global }
  if (Object.keys(slots).length > 0) out.slots = slots
  if (!appearanceHasOverrides(out)) return undefined
  return out
}

/** Copy only defined PBR fields (for merging UI state into global). */
export function takeOverrideFields(
  ov: ObjectMaterialOverride,
): ObjectMaterialOverride {
  const next: ObjectMaterialOverride = {}
  for (const key of PBR_KEYS) {
    if (key in ov) {
      ;(next as Record<string, unknown>)[key] = ov[key]
    }
  }
  return next
}
