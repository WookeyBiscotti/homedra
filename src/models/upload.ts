import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createId } from '../engine/types'
import {
  createLocalId,
  putLocalModel,
  type LocalModelRecord,
} from './localStore'

const MAX_BYTES = 50 * 1024 * 1024
const GLB_MAGIC = 0x46546c67 // 'glTF'

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadValidationError'
  }
}

function readMagic(buf: ArrayBuffer): number {
  if (buf.byteLength < 4) return 0
  return new DataView(buf).getUint32(0, true)
}

function loadGltfFromBlob(blob: Blob): Promise<THREE.Group> {
  const url = URL.createObjectURL(blob)
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        URL.revokeObjectURL(url)
        resolve(gltf.scene)
      },
      undefined,
      (err) => {
        URL.revokeObjectURL(url)
        reject(err)
      },
    )
  })
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

async function renderThumb(root: THREE.Object3D): Promise<Blob | undefined> {
  try {
    const width = 256
    const height = 256
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(width, height, false)
    renderer.setClearColor(0x000000, 0)

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
    const blob = await new Promise<Blob | null>((resolve) =>
      renderer.domElement.toBlob((b) => resolve(b), 'image/webp', 0.85),
    )
    renderer.dispose()
    return blob ?? undefined
  } catch {
    return undefined
  }
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
  if (readMagic(buf) !== GLB_MAGIC) {
    throw new UploadValidationError('Ожидается файл GLB (magic glTF)')
  }

  const blob = new Blob([buf], { type: 'model/gltf-binary' })
  let scene: THREE.Group
  try {
    scene = await loadGltfFromBlob(blob)
  } catch {
    throw new UploadValidationError('Не удалось разобрать GLB')
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

/**
 * Cache a remote GLB into IndexedDB (after library pick).
 */
export async function cacheRemoteGlb(opts: {
  url: string
  name: string
  sourceLibrary: string
  attribution?: LocalModelRecord['attribution']
}): Promise<LocalModelRecord> {
  const res = await fetch(opts.url)
  if (!res.ok) throw new Error(`Скачивание не удалось (${res.status})`)
  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) {
    throw new UploadValidationError('Скачанный файл слишком большой')
  }
  // Some sources return glTF JSON — reject non-GLB for cache path simplicity
  const isGlb = readMagic(buf) === GLB_MAGIC
  const blob = new Blob([buf], {
    type: isGlb ? 'model/gltf-binary' : 'model/gltf+json',
  })
  if (!isGlb) {
    // Allow glTF URL for Poly Haven — store as-is; loader can fetch from original URL instead.
    // For cache we only persist GLB binaries.
    throw new UploadValidationError(
      'Удалённый файл не GLB — будет загружен по URL без кэша',
    )
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
  const record: LocalModelRecord = {
    id: createLocalId(),
    name: opts.name,
    blob,
    thumbBlob,
    bbox,
    createdAt: Date.now(),
    sourceLibrary: opts.sourceLibrary,
    attribution: opts.attribution,
  }
  await putLocalModel(record)
  return record
}
