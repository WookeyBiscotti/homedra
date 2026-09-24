import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type {
  ObjectAppearance,
  ObjectMaterialOverride,
} from '../engine/types'
import { sunDirection } from '../engine/types'
import {
  listFolders,
  putItem,
  type CollectionFolder,
  type CollectionItem,
} from '../models/collection'
import {
  listSceneMaterials,
  pruneAppearance,
  takeOverrideFields,
  type SceneMaterialInfo,
} from '../models/objectAppearance'
import { pendingFromCollectionItem } from '../models/placeCollectionItem'
import { resolveModelRef } from '../models/resolveModel'
import { cloneSceneSelection } from '../models/sceneParts'
import { useApplyAppearance } from '../hooks/useApplyAppearance'
import { PbrMaterialEditor } from './PbrMaterialEditor'
import * as THREE from 'three'

type EditorLighting = {
  ambientIntensity: number
  keyIntensity: number
  keyAzimuth: number
  keyElevation: number
  keyColor: string
  fillIntensity: number
  exposure: number
  shadowsEnabled: boolean
}

const DEFAULT_EDITOR_LIGHTING: EditorLighting = {
  ambientIntensity: 0.85,
  keyIntensity: 1.1,
  keyAzimuth: 45,
  keyElevation: 55,
  keyColor: '#ffffff',
  fillIntensity: 0.35,
  exposure: 1,
  shadowsEnabled: true,
}

/** Background greys/warms with total light so dark setups read as night. */
function backgroundFromLighting(l: EditorLighting): string {
  const energy =
    l.ambientIntensity * 0.45 +
    l.keyIntensity * 0.35 +
    l.fillIntensity * 0.2
  const t = Math.min(1, Math.max(0, (energy * l.exposure) / 2.2))
  const dark = new THREE.Color('#12141a')
  const mid = new THREE.Color('#8a9099')
  const bright = new THREE.Color('#e8e4dc')
  const c =
    t < 0.5
      ? dark.clone().lerp(mid, t * 2)
      : mid.clone().lerp(bright, (t - 0.5) * 2)
  // slight warm shift from key color at high intensity
  if (t > 0.35) {
    c.lerp(new THREE.Color(l.keyColor), 0.08 * Math.min(1, t))
  }
  return `#${c.getHexString()}`
}

function floorColorFromLighting(l: EditorLighting): string {
  const bg = new THREE.Color(backgroundFromLighting(l))
  bg.offsetHSL(0.02, 0.02, -0.08)
  return `#${bg.getHexString()}`
}

function LightSlider({
  label,
  value,
  min,
  max,
  step = 0.05,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (n: number) => void
}) {
  return (
    <label className="pbr-row pbr-row-set">
      <span className="pbr-row-label">
        {label}
        <strong>
          {step >= 1 ? Math.round(value) : value.toFixed(2)}
          {suffix}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function EditorLightingPanel({
  value,
  onChange,
  onReset,
}: {
  value: EditorLighting
  onChange: (next: EditorLighting) => void
  onReset: () => void
}) {
  const set = (patch: Partial<EditorLighting>) =>
    onChange({ ...value, ...patch })

  return (
    <div className="collection-edit-slot pbr-editor editor-lighting">
      <div className="collection-edit-slot-head">
        <strong>Свет превью</strong>
        <button type="button" className="ghost small" onClick={onReset}>
          Сбросить
        </button>
      </div>
      <p className="muted editor-lighting-hint">
        Только для оценки материалов в этом окне — на сцену здания не влияет.
      </p>

      <LightSlider
        label="Ambient"
        value={value.ambientIntensity}
        min={0}
        max={2}
        onChange={(n) => set({ ambientIntensity: n })}
      />
      <LightSlider
        label="Ключевой свет"
        value={value.keyIntensity}
        min={0}
        max={4}
        onChange={(n) => set({ keyIntensity: n })}
      />
      <LightSlider
        label="Азимут"
        value={value.keyAzimuth}
        min={0}
        max={360}
        step={1}
        suffix="°"
        onChange={(n) => set({ keyAzimuth: n })}
      />
      <LightSlider
        label="Высота"
        value={value.keyElevation}
        min={5}
        max={89}
        step={1}
        suffix="°"
        onChange={(n) => set({ keyElevation: n })}
      />
      <label className="pbr-row pbr-row-color pbr-row-set">
        <span className="pbr-row-label">Цвет ключа</span>
        <input
          type="color"
          value={value.keyColor}
          onChange={(e) => set({ keyColor: e.target.value })}
        />
        <code className="muted">{value.keyColor}</code>
      </label>
      <LightSlider
        label="Заполняющий"
        value={value.fillIntensity}
        min={0}
        max={2}
        onChange={(n) => set({ fillIntensity: n })}
      />
      <LightSlider
        label="Экспозиция"
        value={value.exposure}
        min={0.4}
        max={2.5}
        onChange={(n) => set({ exposure: n })}
      />
      <label className="pbr-row pbr-row-set check editor-lighting-check">
        <span className="pbr-row-label">Тени</span>
        <input
          type="checkbox"
          checked={value.shadowsEnabled}
          onChange={(e) => set({ shadowsEnabled: e.target.checked })}
        />
      </label>
      <p className="muted editor-lighting-hint">
        Фон осветляется вместе с ambient / ключом / экспозицией.
      </p>
    </div>
  )
}

function PreviewFloor({
  size,
  color,
  shadowsEnabled,
}: {
  size: { x: number; y: number; z: number }
  color: string
  shadowsEnabled: boolean
}) {
  const extent = Math.max(1.5, Math.ceil(Math.max(size.x, size.z) / 2 + 1.1))
  const plane = Math.max(2.5, extent * 2)
  const floorLines = useMemo(() => {
    const pts: number[] = []
    const e = Math.ceil(extent)
    for (let i = -e; i <= e; i++) {
      pts.push(-e, 0.003, i, e, 0.003, i)
      pts.push(i, 0.003, -e, i, 0.003, e)
    }
    return new Float32Array(pts)
  }, [extent])

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.001, 0]}
        receiveShadow={shadowsEnabled}
      >
        <planeGeometry args={[plane, plane]} />
        <meshStandardMaterial
          color={color}
          roughness={0.92}
          metalness={0.02}
        />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[floorLines, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#000000" transparent opacity={0.18} />
      </lineSegments>
    </group>
  )
}

function PreviewLights({
  lighting,
  floorSize,
}: {
  lighting: EditorLighting
  floorSize: { x: number; y: number; z: number }
}) {
  const { gl, invalidate } = useThree()
  const bg = backgroundFromLighting(lighting)
  const floorCol = floorColorFromLighting(lighting)
  const keyDir = useMemo(
    () => sunDirection(lighting.keyAzimuth, lighting.keyElevation),
    [lighting.keyAzimuth, lighting.keyElevation],
  )
  const keyPos = useMemo((): [number, number, number] => {
    const dist = Math.max(6, Math.max(floorSize.x, floorSize.z, floorSize.y) * 3.5)
    return [keyDir[0] * dist, keyDir[1] * dist, keyDir[2] * dist]
  }, [keyDir, floorSize.x, floorSize.y, floorSize.z])
  const fillPos = useMemo((): [number, number, number] => {
    return [-keyPos[0] * 0.6, Math.max(1.5, keyPos[1] * 0.4), -keyPos[2] * 0.6]
  }, [keyPos])

  const shadowExtent = Math.max(3, Math.max(floorSize.x, floorSize.z) * 1.8 + 1)

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = lighting.exposure
    gl.shadowMap.enabled = lighting.shadowsEnabled
    gl.shadowMap.type = THREE.PCFSoftShadowMap
    invalidate()
  }, [gl, lighting.exposure, lighting.shadowsEnabled, invalidate])

  return (
    <>
      <color attach="background" args={[bg]} />
      <ambientLight intensity={lighting.ambientIntensity} />
      <directionalLight
        position={keyPos}
        intensity={lighting.keyIntensity}
        color={lighting.keyColor}
        castShadow={lighting.shadowsEnabled}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.035}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
      />
      <directionalLight position={fillPos} intensity={lighting.fillIntensity} />
      <PreviewFloor
        size={floorSize}
        color={floorCol}
        shadowsEnabled={lighting.shadowsEnabled}
      />
    </>
  )
}

function normalizeRoot(root: THREE.Object3D): { x: number; y: number; z: number } {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  if (!Number.isFinite(box.min.x) || box.isEmpty()) {
    return { x: 1, y: 1, z: 1 }
  }
  const center = new THREE.Vector3()
  box.getCenter(center)
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= box.min.y
  const size = new THREE.Vector3()
  box.getSize(size)
  return {
    x: Math.max(0.01, size.x),
    y: Math.max(0.01, size.y),
    z: Math.max(0.01, size.z),
  }
}

function EditorMesh({
  url,
  objectId,
  scale,
  appearance,
  shadowsEnabled,
  onMaterials,
}: {
  url: string
  objectId?: string
  scale: number
  appearance?: ObjectAppearance
  shadowsEnabled: boolean
  onMaterials: (ids: SceneMaterialInfo[]) => void
}) {
  const gltf = useGLTF(url)
  const scene = useMemo(() => {
    const clone = cloneSceneSelection(gltf.scene, objectId)
    normalizeRoot(clone)
    return clone
  }, [gltf.scene, objectId])

  useApplyAppearance(scene, appearance)

  useEffect(() => {
    scene.traverse((c) => {
      const m = c as THREE.Mesh
      if (!m.isMesh) return
      m.castShadow = shadowsEnabled
      m.receiveShadow = shadowsEnabled
    })
  }, [scene, shadowsEnabled])

  useEffect(() => {
    onMaterials(listSceneMaterials(scene))
  }, [scene, onMaterials])

  return (
    <group scale={scale}>
      <primitive object={scene} />
    </group>
  )
}

function FitCamera({ size }: { size: { x: number; y: number; z: number } }) {
  const { camera } = useThree()
  useEffect(() => {
    const maxDim = Math.max(size.x, size.y, size.z, 0.4)
    const dist = maxDim * 2.4
    camera.position.set(dist * 0.7, dist * 0.45, dist * 0.85)
    camera.near = 0.01
    camera.far = 200
    camera.lookAt(0, size.y * 0.4, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.x, size.y, size.z])
  return null
}

function clearGlobalPbr(prev: ObjectAppearance): ObjectAppearance {
  const { slots } = prev
  return slots ? { slots } : {}
}

export function CollectionItemEditor({
  item,
  onClose,
  onSaved,
}: {
  item: CollectionItem
  onClose: () => void
  onSaved: (item: CollectionItem) => void
}) {
  const [name, setName] = useState(item.name)
  const [folderId, setFolderId] = useState<string | null>(item.folderId)
  const [folders, setFolders] = useState<CollectionFolder[]>([])
  const [targetM, setTargetM] = useState(() => {
    const h = Math.max(item.bbox.x, item.bbox.z, 1e-6)
    return item.defaultScale * h
  })
  const [appearance, setAppearance] = useState<ObjectAppearance>(
    () => item.appearance ?? {},
  )
  const [url, setUrl] = useState<string | null>(null)
  const [revoke, setRevoke] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mats, setMats] = useState<SceneMaterialInfo[]>([])
  const [tab, setTab] = useState<'global' | 'slots' | 'light'>('global')
  const [lighting, setLighting] = useState<EditorLighting>(DEFAULT_EDITOR_LIGHTING)

  const nativeHoriz = Math.max(item.bbox.x, item.bbox.z, 1e-6)
  const scale = targetM / nativeHoriz
  const sized = {
    x: item.bbox.x * scale,
    y: item.bbox.y * scale,
    z: item.bbox.z * scale,
  }

  const globalValue = useMemo((): ObjectMaterialOverride => {
    const { slots: _s, ...rest } = appearance
    return rest
  }, [appearance])

  useEffect(() => {
    void listFolders().then(setFolders)
  }, [])

  useEffect(() => {
    let alive = true
    const pending = pendingFromCollectionItem(item)
    if (!pending) {
      setError('Не удалось определить модель')
      return
    }
    void resolveModelRef(pending.model)
      .then((res) => {
        if (!alive) {
          if (res.revokeOnDispose) URL.revokeObjectURL(res.url)
          return
        }
        setUrl(res.url)
        setRevoke(!!res.revokeOnDispose)
      })
      .catch((e) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Не удалось загрузить модель')
      })
    return () => {
      alive = false
    }
  }, [item])

  useEffect(() => {
    return () => {
      if (revoke && url) URL.revokeObjectURL(url)
    }
  }, [revoke, url])

  const setGlobal = (ov: ObjectMaterialOverride) => {
    setAppearance((prev) => {
      const fields = takeOverrideFields(ov)
      if (ov.material === null) delete fields.material
      const { slots } = prev
      return slots ? { ...fields, slots } : { ...fields }
    })
  }

  const setSlot = (id: string, ov: ObjectMaterialOverride) => {
    setAppearance((prev) => {
      const slots = { ...prev.slots }
      const fields = takeOverrideFields(ov)
      if (ov.material === null) delete fields.material
      if (Object.keys(fields).length === 0) {
        delete slots[id]
      } else {
        slots[id] = fields
      }
      return { ...prev, slots }
    })
  }

  const onSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const next: CollectionItem = {
        ...item,
        name: name.trim() || item.name,
        folderId,
        defaultScale: scale,
        appearance: pruneAppearance(appearance),
      }
      await putItem(next)
      onSaved(next)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  const modal: ReactNode = (
    <div
      className="tex-modal-backdrop collection-edit-backdrop"
      role="dialog"
      aria-modal
      aria-label="Редактирование объекта"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="tex-modal collection-edit-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tex-modal-header">
          <h3>Редактировать</h3>
          <button type="button" className="ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <div className="collection-edit-body">
          <div className="collection-edit-canvas">
            {url ? (
              <Canvas
                shadows
                camera={{
                  position: [2.2, 1.4, 2.4],
                  fov: 40,
                  near: 0.01,
                  far: 200,
                }}
                dpr={[1, 1.5]}
                gl={{
                  antialias: true,
                  alpha: false,
                  toneMapping: THREE.ACESFilmicToneMapping,
                }}
              >
                <PreviewLights lighting={lighting} floorSize={sized} />
                <FitCamera size={sized} />
                <Suspense fallback={null}>
                  <EditorMesh
                    url={url}
                    objectId={item.objectId}
                    scale={scale}
                    appearance={pruneAppearance(appearance)}
                    shadowsEnabled={lighting.shadowsEnabled}
                    onMaterials={setMats}
                  />
                </Suspense>
                <OrbitControls
                  makeDefault
                  target={[0, sized.y * 0.4, 0]}
                  minDistance={0.25}
                  maxDistance={40}
                />
              </Canvas>
            ) : (
              <p className="muted collection-edit-loading">
                {error ?? 'Загрузка модели…'}
              </p>
            )}
          </div>

          <aside className="collection-edit-controls">
            <label className="collection-edit-field">
              Название
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className="collection-edit-field">
              Папка
              <select
                value={folderId ?? ''}
                onChange={(e) =>
                  setFolderId(e.target.value ? e.target.value : null)
                }
              >
                <option value="">Корень</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="size-calibrate-slider">
              <span>
                Макс. сторона (м): <strong>{targetM.toFixed(2)}</strong>
              </span>
              <input
                type="range"
                min={0.05}
                max={12}
                step={0.01}
                value={targetM}
                onChange={(e) => setTargetM(Number(e.target.value))}
              />
            </label>
            <p className="size-calibrate-readout">
              {sized.x.toFixed(2)} × {sized.y.toFixed(2)} × {sized.z.toFixed(2)}{' '}
              м
            </p>

            <div className="collection-edit-tabs" role="tablist">
              <button
                type="button"
                className={tab === 'global' ? 'active' : undefined}
                onClick={() => setTab('global')}
              >
                PBR · всё
              </button>
              <button
                type="button"
                className={tab === 'slots' ? 'active' : undefined}
                onClick={() => setTab('slots')}
              >
                По материалам ({mats.length})
              </button>
              <button
                type="button"
                className={tab === 'light' ? 'active' : undefined}
                onClick={() => setTab('light')}
              >
                Свет
              </button>
            </div>

            {tab === 'light' ? (
              <EditorLightingPanel
                value={lighting}
                onChange={setLighting}
                onReset={() => setLighting(DEFAULT_EDITOR_LIGHTING)}
              />
            ) : tab === 'global' ? (
              <PbrMaterialEditor
                label="Все материалы"
                value={globalValue}
                sample={mats[0]?.sample}
                onChange={setGlobal}
                onClear={() => setAppearance((prev) => clearGlobalPbr(prev))}
              />
            ) : mats.length === 0 ? (
              <p className="muted">Материалы появятся после загрузки модели.</p>
            ) : (
              <div className="collection-edit-slots">
                {mats.map((m) => (
                  <PbrMaterialEditor
                    key={m.id}
                    label={m.label}
                    sample={m.sample}
                    value={appearance.slots?.[m.id] ?? {}}
                    onChange={(ov) => setSlot(m.id, ov)}
                    onClear={() =>
                      setAppearance((prev) => {
                        if (!prev.slots?.[m.id]) return prev
                        const slots = { ...prev.slots }
                        delete slots[m.id]
                        return { ...prev, slots }
                      })
                    }
                  />
                ))}
              </div>
            )}

            {error && <p className="tex-error">{error}</p>}

            <div className="model-preview-actions">
              <button type="button" disabled={saving} onClick={() => void onSave()}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button type="button" className="ghost" onClick={onClose}>
                Отмена
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return modal
  return createPortal(modal, document.body)
}
