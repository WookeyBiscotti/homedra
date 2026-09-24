import * as THREE from 'three'
import { createId } from '../engine/types'
import {
  getCachedAsset,
  putCachedAsset,
  type CachedAsset,
} from './assetCache'
import type { CollectionSource } from './collectionTypes'
import { createGltfLoader } from './createGltfLoader'
import {
  createLocalId,
  putLocalModel,
  type LocalModelRecord,
} from './localStore'
import { isGlbBuffer, MAX_BYTES } from './glbMagic'
import { cloneSceneSelection } from './sceneParts'

export { MAX_BYTES, isGlbBuffer } from './glbMagic'

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadValidationError'
  }
}

export async function loadGltfFromBlob(blob: Blob): Promise<THREE.Group> {
  const buf = await blob.arrayBuffer()
  const loader = createGltfLoader()
  const gltf = await loader.parseAsync(buf, '')
  return gltf.scene
}

/** Normalize so AABB sits on Y=0 and longest horizontal span ≈ targetMeters (optional). */
export function normalizeScene(
  root: THREE.Object3D,
  targetMaxHorizontal = 0,
): { bbox: { x: number; y: number; z: number } } {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = new THREE.Vector3()
  box.getSize(size)
  const center = new THREE.Vector3()
  box.getCenter(center)

  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= box.min.y

  if (targetMaxHorizontal > 0) {
    const horiz = Math.max(size.x, size.z, 1e-6)
    const s = targetMaxHorizontal / horiz
    root.scale.multiplyScalar(s)
    root.updateMatrixWorld(true)
    const box2 = new THREE.Box3().setFromObject(root)
    const size2 = new THREE.Vector3()
    box2.getSize(size2)
    root.position.y -= box2.min.y
    return { bbox: { x: size2.x, y: size2.y, z: size2.z } }
  }

  return { bbox: { x: size.x, y: size.y, z: size.z } }
}

function createThumbRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  })
  renderer.setSize(256, 256, false)
  renderer.setClearColor(0x000000, 0)
  return renderer
}

async function renderThumbWith(
  renderer: THREE.WebGLRenderer,
  root: THREE.Object3D,
): Promise<Blob | undefined> {
  const scene = new THREE.Scene()
  const clone = root.clone(true)
  scene.add(clone)
  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const dir = new THREE.DirectionalLight(0xffffff, 0.9)
  dir.position.set(2, 4, 3)
  scene.add(dir)

  const box = new THREE.Box3().setFromObject(clone)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  const maxDim = Math.max(size.x, size.y, size.z, 0.01)

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100)
  camera.position.set(
    center.x + maxDim * 1.2,
    center.y + maxDim * 0.8,
    center.z + maxDim * 1.2,
  )
  camera.lookAt(center)

  renderer.render(scene, camera)
  return new Promise<Blob | undefined>((resolve) =>
    renderer.domElement.toBlob(
      (b) => resolve(b ?? undefined),
      'image/webp',
      0.85,
    ),
  )
}

export async function renderThumb(root: THREE.Object3D): Promise<Blob | undefined> {
  try {
    const renderer = createThumbRenderer()
    const blob = await renderThumbWith(renderer, root)
    renderer.dispose()
    return blob
  } catch {
    return undefined
  }
}

/**
 * Pictograms framed on the selected sub-tree (or the whole scene).
 * Reuses one WebGL renderer for a batch of parts.
 */
export async function renderThumbsForSelections(
  scene: THREE.Object3D,
  objectIds: Array<string | undefined>,
): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>()
  if (objectIds.length === 0) return out
  let renderer: THREE.WebGLRenderer | undefined
  try {
    renderer = createThumbRenderer()
    for (const objectId of objectIds) {
      const key = objectId ?? ''
      if (out.has(key)) continue
      const part = cloneSceneSelection(scene, objectId)
      const blob = await renderThumbWith(renderer, part)
      if (blob) out.set(key, blob)
    }
  } catch {
    /* keep whatever we got */
  } finally {
    renderer?.dispose()
  }
  return out
}

export interface UploadResult {
  record: LocalModelRecord
}

/**
 * Validate a user GLB, normalize scale, store in IndexedDB.
 */
export async function uploadGlbFile(
  file: File,
  opts: { name?: string; normalizeHorizontalM?: number } = {},
): Promise<UploadResult> {
  if (!file.name.toLowerCase().endsWith('.glb') && file.type !== 'model/gltf-binary') {
    // Still allow if magic matches
  }
  if (file.size > MAX_BYTES) {
    throw new UploadValidationError(
      `Файл слишком большой (макс. ${MAX_BYTES / (1024 * 1024)} МБ)`,
    )
  }
  const buf = await file.arrayBuffer()
  if (!isGlbBuffer(buf)) {
    throw new UploadValidationError('Ожидается файл GLB (magic glTF)')
  }

  const blob = new Blob([buf], { type: 'model/gltf-binary' })
  let scene: THREE.Group
  try {
    scene = await loadGltfFromBlob(blob)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    throw new UploadValidationError(
      detail.includes('DRACO')
        ? 'GLB использует Draco-сжатие — обновите страницу и попробуйте снова'
        : `Не удалось разобрать GLB: ${detail}`,
    )
  }

  const { bbox } = normalizeScene(scene, opts.normalizeHorizontalM ?? 0)
  // Re-export is expensive; we store original blob and apply normalize at load time via scale.
  // Store measured bbox of original for UI; placement uses scale field.

  const thumbBlob = await renderThumb(scene)
  const id = createLocalId()
  const record: LocalModelRecord = {
    id,
    name: opts.name?.trim() || file.name.replace(/\.glb$/i, '') || createId('model'),
    blob,
    thumbBlob,
    bbox,
    createdAt: Date.now(),
  }
  await putLocalModel(record)
  return { record }
}

export type CacheRemoteResult = {
  asset: CachedAsset
  bbox: { x: number; y: number; z: number }
  thumbBlob?: Blob
}

/**
 * Upsert a remote (or already-fetched) GLB into the stable-key asset cache.
 */
export async function cacheRemoteGlb(opts: {
  cacheKey: string
  url?: string
  /** Pre-fetched blob (e.g. from blob: resolve). */
  blob?: Blob
  source: CollectionSource
}): Promise<CacheRemoteResult> {
  const existing = await getCachedAsset(opts.cacheKey)
  if (existing) {
    let bbox = { x: 1, y: 1, z: 1 }
    let thumbBlob: Blob | undefined
    try {
      const scene = await loadGltfFromBlob(existing.blob)
      bbox = normalizeScene(scene).bbox
      thumbBlob = await renderThumb(scene)
    } catch {
      /* keep defaults */
    }
    return { asset: existing, bbox, thumbBlob }
  }

  let blob = opts.blob
  if (!blob) {
    if (!opts.url) throw new Error('Нужен url или blob для кеша')
    const res = await fetch(opts.url)
    if (!res.ok) throw new Error(`Скачивание не удалось (${res.status})`)
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) {
      throw new UploadValidationError('Скачанный файл слишком большой')
    }
    if (!isGlbBuffer(buf)) {
      throw new UploadValidationError(
        'Удалённый файл не GLB — будет загружен по URL без кэша',
      )
    }
    blob = new Blob([buf], { type: 'model/gltf-binary' })
  } else {
    const buf = await blob.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) {
      throw new UploadValidationError('Файл слишком большой для кеша')
    }
    if (!isGlbBuffer(buf)) {
      throw new UploadValidationError(
        'Файл не GLB — будет загружен по URL без кэша',
      )
    }
    blob = new Blob([buf], { type: 'model/gltf-binary' })
  }

  let bbox = { x: 1, y: 1, z: 1 }
  let thumbBlob: Blob | undefined
  try {
    const scene = await loadGltfFromBlob(blob)
    bbox = normalizeScene(scene).bbox
    thumbBlob = await renderThumb(scene)
  } catch {
    /* keep defaults */
  }

  const asset: CachedAsset = {
    cacheKey: opts.cacheKey,
    blob,
    contentType: 'model/gltf-binary',
    fetchedAt: Date.now(),
    source: opts.source,
  }
  await putCachedAsset(asset)
  return { asset, bbox, thumbBlob }
}
