import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import {
  defaultMoldingSpec,
  keepMaterialLook,
  normalizeMoldingProfile,
  type MoldingKind,
  type MoldingProfile,
  type MoldingSpec,
  type MoldingVertex,
} from '../engine/types'
import {
  ensureProfileCcw,
  moldingKindAxisHints,
  profileBounds,
  tessellateProfile,
} from '../engine/geometry/moldingProfile'
import { MaterialPbrFields } from './PbrMaterialEditor'
import { MaterialSlot } from './TextureBrowser'
import { PbrStandardMaterial } from './View3D/PbrStandardMaterial'

const PAD = 28
const SNAP_MM = 1

type DragState =
  | { type: 'vertex'; index: number }
  | { type: 'bulge'; index: number }
  | null

function mmRound(m: number): number {
  const mm = Math.round((m * 1000) / SNAP_MM) * SNAP_MM
  return mm / 1000
}

function bulgeHandlePoint(
  a: MoldingVertex,
  b: MoldingVertex,
  bulge: number,
): MoldingVertex {
  const mx = (a.x + b.x) * 0.5
  const my = (a.y + b.y) * 0.5
  const dx = b.x - a.x
  const dy = b.y - a.y
  const chord = Math.hypot(dx, dy) || 1
  const nx = -dy / chord
  const ny = dx / chord
  const sag = bulge * chord * 0.5
  return { x: mx + nx * sag, y: my + ny * sag }
}

function bulgeFromHandle(
  a: MoldingVertex,
  b: MoldingVertex,
  handle: MoldingVertex,
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const chord = Math.hypot(dx, dy)
  if (chord < 1e-9) return 0
  const mx = (a.x + b.x) * 0.5
  const my = (a.y + b.y) * 0.5
  const nx = -dy / chord
  const ny = dx / chord
  const sag = (handle.x - mx) * nx + (handle.y - my) * ny
  return (2 * sag) / chord
}

function ProfilePreview3D({
  profile,
  material,
}: {
  profile: MoldingProfile
  material: MoldingSpec['material']
}) {
  const geometry = useMemo(() => {
    const pts = tessellateProfile(ensureProfileCcw(profile), 0.0008)
    if (pts.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(pts[0]!.x, pts[0]!.y)
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo(pts[i]!.x, pts[i]!.y)
    }
    shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.28,
      bevelEnabled: false,
      steps: 1,
    })
    geo.rotateY(-Math.PI / 2)
    geo.computeVertexNormals()
    return geo
  }, [profile])

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!geometry) {
    return <p className="muted molding-preview-empty">Замкните контур для превью</p>
  }

  const b = profileBounds(profile)
  const span = Math.max(0.06, b.maxX - b.minX, b.maxY - b.minY)

  return (
    <Canvas
      camera={{
        position: [span * 2.8, span * 1.6, span * 3.2],
        fov: 35,
        near: 0.001,
        far: 20,
      }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={['#ebe4d6']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 3, 2]} intensity={1.1} />
      <mesh geometry={geometry} castShadow>
        <PbrStandardMaterial
          material={material}
          color="#d8cfc4"
          meterUvs
          worldWidthM={0.28}
          worldHeightM={Math.max(0.05, b.maxY - b.minY)}
          vertexDisplacement={false}
        />
      </mesh>
      <OrbitControls makeDefault target={[0, span * 0.35, 0]} />
    </Canvas>
  )
}

export function MoldingEditor({
  spec,
  title,
  onSave,
  onClose,
}: {
  spec: MoldingSpec
  title: string
  onSave: (spec: MoldingSpec) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<MoldingSpec>(() => ({
    ...spec,
    profile: normalizeMoldingProfile(spec.profile, spec.kind),
    material: { ...spec.material },
  }))
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState>(null)
  const [closed, setClosed] = useState(draft.profile.vertices.length >= 3)
  const hints = moldingKindAxisHints(draft.kind)

  const setProfile = (profile: MoldingProfile) => {
    setDraft((d) => ({
      ...d,
      profile: normalizeMoldingProfile(profile, d.kind),
    }))
  }

  const setKind = (kind: MoldingKind) => {
    setDraft((d) => ({
      ...d,
      kind,
      name:
        d.name === 'Плинтус' || d.name === 'Галтель'
          ? kind === 'cove'
            ? 'Галтель'
            : 'Плинтус'
          : d.name,
    }))
  }

  const worldToCanvas = useCallback(
    (
      p: MoldingVertex,
      w: number,
      h: number,
      bounds: ReturnType<typeof profileBounds>,
    ) => {
      const spanX = Math.max(0.08, bounds.maxX - bounds.minX + 0.02)
      const spanY = Math.max(0.08, bounds.maxY - bounds.minY + 0.02)
      const scale = Math.min((w - PAD * 2) / spanX, (h - PAD * 2) / spanY)
      const ox = PAD + (0 - bounds.minX + 0.01) * scale
      const oy = h - PAD - (0 - bounds.minY + 0.01) * scale
      return {
        x: ox + p.x * scale,
        y: oy - p.y * scale,
        scale,
        ox,
        oy,
      }
    },
    [],
  )

  const canvasToWorld = useCallback(
    (
      cx: number,
      cy: number,
      w: number,
      h: number,
      bounds: ReturnType<typeof profileBounds>,
    ): MoldingVertex => {
      const spanX = Math.max(0.08, bounds.maxX - bounds.minX + 0.02)
      const spanY = Math.max(0.08, bounds.maxY - bounds.minY + 0.02)
      const scale = Math.min((w - PAD * 2) / spanX, (h - PAD * 2) / spanY)
      const ox = PAD + (0 - bounds.minX + 0.01) * scale
      const oy = h - PAD - (0 - bounds.minY + 0.01) * scale
      return {
        x: mmRound((cx - ox) / scale),
        y: mmRound((oy - cy) / scale),
      }
    },
    [],
  )

  const viewBoundsOf = useCallback((profile: MoldingProfile) => {
    const bounds = profileBounds(profile)
    return {
      minX: Math.min(0, bounds.minX) - 0.005,
      maxX: Math.max(0.06, bounds.maxX) + 0.01,
      minY: Math.min(0, bounds.minY) - 0.005,
      maxY: Math.max(0.06, bounds.maxY) + 0.01,
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w < 2 || h < 2) return
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#f3f1ec'
    ctx.fillRect(0, 0, w, h)

    const viewBounds = viewBoundsOf(draft.profile)
    const origin = worldToCanvas({ x: 0, y: 0 }, w, h, viewBounds)

    // Grid every 10 mm
    ctx.strokeStyle = '#ddd8ce'
    ctx.lineWidth = 1
    for (let mm = -400; mm <= 400; mm += 10) {
      const m = mm / 1000
      const vx = worldToCanvas({ x: m, y: 0 }, w, h, viewBounds)
      const hy = worldToCanvas({ x: 0, y: m }, w, h, viewBounds)
      ctx.beginPath()
      ctx.moveTo(vx.x, PAD * 0.5)
      ctx.lineTo(vx.x, h - PAD * 0.5)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(PAD * 0.5, hy.y)
      ctx.lineTo(w - PAD * 0.5, hy.y)
      ctx.stroke()
    }
    // Major grid 50 mm
    ctx.strokeStyle = '#ccc4b6'
    ctx.lineWidth = 1.25
    for (let mm = -400; mm <= 400; mm += 50) {
      const m = mm / 1000
      const vx = worldToCanvas({ x: m, y: 0 }, w, h, viewBounds)
      const hy = worldToCanvas({ x: 0, y: m }, w, h, viewBounds)
      ctx.beginPath()
      ctx.moveTo(vx.x, PAD * 0.5)
      ctx.lineTo(vx.x, h - PAD * 0.5)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(PAD * 0.5, hy.y)
      ctx.lineTo(w - PAD * 0.5, hy.y)
      ctx.stroke()
    }

    ctx.strokeStyle = '#8a8378'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(PAD * 0.5, origin.y)
    ctx.lineTo(w - PAD * 0.5, origin.y)
    ctx.moveTo(origin.x, PAD * 0.5)
    ctx.lineTo(origin.x, h - PAD * 0.5)
    ctx.stroke()
    ctx.fillStyle = '#5c564c'
    ctx.font = '12px sans-serif'
    ctx.fillText(hints.xLabel, w - PAD - 80, origin.y - 8)
    ctx.fillText(hints.yLabel, origin.x + 8, PAD + 14)
    ctx.fillText('стена', origin.x - 40, origin.y + 16)

    const verts = draft.profile.vertices
    const tess = tessellateProfile(draft.profile, 0.0008)
    if (tess.length >= 2) {
      ctx.beginPath()
      const p0 = worldToCanvas(tess[0]!, w, h, viewBounds)
      ctx.moveTo(p0.x, p0.y)
      for (let i = 1; i < tess.length; i++) {
        const p = worldToCanvas(tess[i]!, w, h, viewBounds)
        ctx.lineTo(p.x, p.y)
      }
      if (closed && verts.length >= 3) ctx.closePath()
      ctx.fillStyle = 'rgba(120, 150, 110, 0.28)'
      if (closed && verts.length >= 3) ctx.fill()
      ctx.strokeStyle = '#3d5a3a'
      ctx.lineWidth = 2.5
      ctx.stroke()
    }

    if (closed || verts.length >= 2) {
      const n = verts.length
      const segCount = closed ? n : Math.max(0, n - 1)
      for (let i = 0; i < segCount; i++) {
        const a = verts[i]!
        const b = verts[(i + 1) % n]!
        const bulge = draft.profile.segments[i]?.bulge ?? 0
        const hp = bulgeHandlePoint(a, b, bulge)
        const c = worldToCanvas(hp, w, h, viewBounds)
        ctx.beginPath()
        ctx.arc(c.x, c.y, 6, 0, Math.PI * 2)
        ctx.fillStyle = Math.abs(bulge) > 1e-6 ? '#c45c26' : '#a89f92'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    for (let i = 0; i < verts.length; i++) {
      const c = worldToCanvas(verts[i]!, w, h, viewBounds)
      ctx.beginPath()
      ctx.arc(c.x, c.y, 7, 0, Math.PI * 2)
      ctx.fillStyle = i === 0 ? '#2f6fed' : '#1a1a1a'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.75
      ctx.stroke()
    }
  }, [closed, draft.profile, hints.xLabel, hints.yLabel, viewBoundsOf, worldToCanvas])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const wrap = canvasWrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', draw)
      return () => window.removeEventListener('resize', draw)
    }
    const ro = new ResizeObserver(() => draw())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [draw])

  const hitTest = (cx: number, cy: number): DragState => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const viewBounds = viewBoundsOf(draft.profile)
    const verts = draft.profile.vertices
    for (let i = 0; i < verts.length; i++) {
      const p = worldToCanvas(verts[i]!, w, h, viewBounds)
      if (Math.hypot(p.x - cx, p.y - cy) <= 12) return { type: 'vertex', index: i }
    }
    const n = verts.length
    const segCount = closed ? n : Math.max(0, n - 1)
    for (let i = 0; i < segCount; i++) {
      const a = verts[i]!
      const b = verts[(i + 1) % n]!
      const bulge = draft.profile.segments[i]?.bulge ?? 0
      const hp = bulgeHandlePoint(a, b, bulge)
      const p = worldToCanvas(hp, w, h, viewBounds)
      if (Math.hypot(p.x - cx, p.y - cy) <= 12) return { type: 'bulge', index: i }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const hit = hitTest(cx, cy)
    if (hit) {
      dragRef.current = hit
      canvas.setPointerCapture(e.pointerId)
      return
    }
    if (closed) return
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const viewBounds = viewBoundsOf(draft.profile)
    const world = canvasToWorld(cx, cy, w, h, viewBounds)
    const verts = [...draft.profile.vertices, world]
    const segs = [
      ...draft.profile.segments.slice(0, Math.max(0, verts.length - 1)),
      { bulge: 0 },
    ]
    setProfile({
      vertices: verts,
      segments: segs.slice(0, verts.length),
    })
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    const canvas = canvasRef.current
    if (!drag || !canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const viewBounds = viewBoundsOf(draft.profile)
    const world = canvasToWorld(cx, cy, w, h, viewBounds)
    if (drag.type === 'vertex') {
      const vertices = draft.profile.vertices.map((v, i) =>
        i === drag.index ? world : v,
      )
      setProfile({ ...draft.profile, vertices })
    } else {
      const n = draft.profile.vertices.length
      const a = draft.profile.vertices[drag.index]!
      const b = draft.profile.vertices[(drag.index + 1) % n]!
      const bulge = bulgeFromHandle(a, b, world)
      const segments = draft.profile.segments.map((s, i) =>
        i === drag.index ? { bulge } : s,
      )
      setProfile({ ...draft.profile, segments })
    }
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
    if (hit?.type === 'bulge') {
      const segments = draft.profile.segments.map((s, i) =>
        i === hit.index ? { bulge: 0 } : s,
      )
      setProfile({ ...draft.profile, segments })
    }
  }

  const closeProfile = () => {
    if (draft.profile.vertices.length < 3) return
    const n = draft.profile.vertices.length
    const segments = Array.from({ length: n }, (_, i) => ({
      bulge: draft.profile.segments[i]?.bulge ?? 0,
    }))
    setProfile({ vertices: draft.profile.vertices, segments })
    setClosed(true)
  }

  const resetProfile = () => {
    const kind = draft.kind
    setDraft((d) => ({
      ...d,
      profile: defaultMoldingSpec(kind).profile,
    }))
    setClosed(true)
  }

  const save = () => {
    let profile = draft.profile
    if (!closed || profile.vertices.length < 3) {
      if (profile.vertices.length < 3) return
      const n = profile.vertices.length
      profile = {
        vertices: profile.vertices,
        segments: Array.from({ length: n }, (_, i) => ({
          bulge: profile.segments[i]?.bulge ?? 0,
        })),
      }
      setClosed(true)
    }
    profile = normalizeMoldingProfile(profile, draft.kind)
    if (profile.vertices.length < 3) return
    onSave({
      ...draft,
      name:
        draft.name.trim() ||
        (draft.kind === 'cove' ? 'Галтель' : 'Плинтус'),
      profile,
    })
  }

  const dims = profileBounds(draft.profile)

  const modal: ReactNode = (
    <div
      className="tex-modal-backdrop molding-edit-backdrop"
      role="dialog"
      aria-modal
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="tex-modal molding-edit-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tex-modal-header">
          <h3>{title}</h3>
          <button type="button" className="ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <div className="molding-edit-body">
          <div className="molding-edit-canvas-wrap" ref={canvasWrapRef}>
            <canvas
              ref={canvasRef}
              className="molding-profile-canvas molding-profile-canvas-lg"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={onDoubleClick}
            />
            <p className="molding-edit-canvas-hint hint">
              Клик — вершина (прямая). Оранжевая ручка на ребре — дуга. Двойной
              клик по ручке — снова прямая. Сетка 10 мм.
            </p>
          </div>

          <aside className="molding-edit-controls">
            <label className="collection-edit-field">
              Название
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>

            <div className="molding-kind-row" role="group" aria-label="Тип">
              <button
                type="button"
                className={draft.kind === 'skirting' ? 'active' : undefined}
                onClick={() => setKind('skirting')}
              >
                Плинтус
              </button>
              <button
                type="button"
                className={draft.kind === 'cove' ? 'active' : undefined}
                onClick={() => setKind('cove')}
              >
                Галтель
              </button>
            </div>

            <p className="muted molding-edit-dims">
              Срез ≈ {Math.round(Math.max(0, dims.maxX) * 1000)}×
              {Math.round(Math.max(0, dims.maxY) * 1000)} мм · {hints.xLabel} /{' '}
              {hints.yLabel}
            </p>

            <div className="molding-profile-actions">
              {!closed && (
                <button type="button" className="ghost" onClick={closeProfile}>
                  Замкнуть
                </button>
              )}
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setClosed(false)
                  setProfile({ vertices: [], segments: [] })
                }}
              >
                Рисовать заново
              </button>
              <button type="button" className="ghost" onClick={resetProfile}>
                Сброс
              </button>
            </div>

            <div className="molding-edit-preview" aria-label="Превью планки">
              <ProfilePreview3D
                profile={draft.profile}
                material={draft.material}
              />
            </div>

            <MaterialSlot
              label="Текстура"
              value={draft.material}
              showRepeat
              onChange={(material) =>
                setDraft({
                  ...draft,
                  material: keepMaterialLook(draft.material, material),
                })
              }
              onClear={() =>
                setDraft({
                  ...draft,
                  material: keepMaterialLook(
                    draft.material,
                    defaultMoldingSpec(draft.kind).material,
                  ),
                })
              }
            />
            <p className="tool-group-title">PBR</p>
            <MaterialPbrFields
              value={draft.material}
              onChange={(material) => setDraft({ ...draft, material })}
            />

            <div className="model-preview-actions">
              <button type="button" className="prop-action" onClick={save}>
                Сохранить
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
