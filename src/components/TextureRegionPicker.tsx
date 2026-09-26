import { useRef, type PointerEvent } from 'react'
import {
  defaultTileTexRegion,
  normalizeTileTexRegion,
  type MaterialRef,
  type TileTexRegion,
} from '../engine/types'
import { materialThumbnailUrl } from '../materials/textureCatalog'
import { useMaterialThumb } from './TextureBrowser'

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function clientToUv(
  el: HTMLElement,
  clientX: number,
  clientY: number,
): { u: number; v: number } {
  const r = el.getBoundingClientRect()
  const w = Math.max(1, r.width)
  const h = Math.max(1, r.height)
  return {
    u: clamp01((clientX - r.left) / w),
    v: clamp01((clientY - r.top) / h),
  }
}

type Drag =
  | { kind: 'move'; origin: TileTexRegion; start: { u: number; v: number } }
  | {
      kind: 'corner'
      corner: 'nw' | 'ne' | 'sw' | 'se'
      origin: TileTexRegion
    }

export function TextureRegionPicker({
  material,
  value,
  onChange,
}: {
  material: MaterialRef
  value?: TileTexRegion
  onChange: (region: TileTexRegion) => void
}) {
  const loaded = useMaterialThumb(material)
  const thumb = loaded ?? materialThumbnailUrl(material)
  const region = normalizeTileTexRegion(value)
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)

  const apply = (next: TileTexRegion) => onChange(normalizeTileTexRegion(next))

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current
    const state = drag.current
    if (!box || !state) return
    const uv = clientToUv(box, e.clientX, e.clientY)
    if (state.kind === 'move') {
      const du = uv.u - state.start.u
      const dv = uv.v - state.start.v
      const w = state.origin.u1 - state.origin.u0
      const h = state.origin.v1 - state.origin.v0
      let u0 = state.origin.u0 + du
      let v0 = state.origin.v0 + dv
      u0 = clamp01(u0)
      v0 = clamp01(v0)
      if (u0 + w > 1) u0 = 1 - w
      if (v0 + h > 1) v0 = 1 - h
      apply({ u0, v0, u1: u0 + w, v1: v0 + h })
      return
    }
    const next = { ...state.origin }
    if (state.corner.includes('w')) next.u0 = uv.u
    if (state.corner.includes('e')) next.u1 = uv.u
    if (state.corner.includes('n')) next.v0 = uv.v
    if (state.corner.includes('s')) next.v1 = uv.v
    apply(next)
  }

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    drag.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  return (
    <div className="tile-tex-picker">
      <div className="tile-tex-picker-head">
        <span>Область рисунка</span>
        <button
          type="button"
          className="ghost small"
          onClick={() => onChange(defaultTileTexRegion())}
        >
          Вся текстура
        </button>
      </div>
      <p className="hint">
        Рамка на текстуре — какой кусок попадёт на плитку. Тяните середину или углы.
      </p>
      <div
        ref={boxRef}
        className="tile-tex-picker-box"
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {thumb ? (
          <img src={thumb} alt="" referrerPolicy="no-referrer" draggable={false} />
        ) : (
          <div className="model-thumb-fallback" aria-hidden />
        )}
        <div
          className="tile-tex-region"
          style={{
            left: `${region.u0 * 100}%`,
            top: `${region.v0 * 100}%`,
            width: `${(region.u1 - region.u0) * 100}%`,
            height: `${(region.v1 - region.v0) * 100}%`,
          }}
          onPointerDown={(e) => {
            if (!boxRef.current) return
            e.preventDefault()
            e.stopPropagation()
            try {
              boxRef.current.setPointerCapture(e.pointerId)
            } catch {
              // ignore
            }
            drag.current = {
              kind: 'move',
              origin: region,
              start: clientToUv(boxRef.current, e.clientX, e.clientY),
            }
          }}
        />
        {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
          <button
            key={corner}
            type="button"
            className={`tile-tex-handle tile-tex-handle-${corner}`}
            style={{
              left: `${(corner.includes('w') ? region.u0 : region.u1) * 100}%`,
              top: `${(corner.includes('n') ? region.v0 : region.v1) * 100}%`,
            }}
            aria-label={`Угол ${corner}`}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              try {
                boxRef.current?.setPointerCapture(e.pointerId)
              } catch {
                // ignore
              }
              drag.current = { kind: 'corner', corner, origin: region }
            }}
          />
        ))}
      </div>
    </div>
  )
}
