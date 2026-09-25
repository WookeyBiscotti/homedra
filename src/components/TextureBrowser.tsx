import { useEffect, useState } from 'react'
import type { MaterialRef } from '../engine/types'
import { DEFAULT_DISPLACEMENT_SCALE, searchMaterials } from '../materials/ambientcg'
import { getLocalTexture, materialLabel } from '../materials/customTextures'
import { materialThumbnailUrl } from '../materials/textureCatalog'
import { TextureSourceTabs } from './CustomTextureLibrary'

export function useMaterialThumb(
  value: MaterialRef | null | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!value) {
      setUrl(null)
      return
    }
    if (value.source !== 'custom') {
      setUrl(materialThumbnailUrl(value))
      return
    }
    let revoke: string | null = null
    let alive = true
    void getLocalTexture(value.assetId).then((rec) => {
      if (!alive) return
      if (rec) {
        revoke = URL.createObjectURL(rec.blob)
        setUrl(revoke)
      } else if (value.url) {
        setUrl(value.url)
      } else {
        setUrl(null)
      }
    })
    return () => {
      alive = false
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [value?.source, value?.assetId, value?.url])

  return url
}

export function TextureBrowser({
  open,
  onClose,
  onSelect,
  title = 'Текстура',
  selected,
  preferCollection = false,
}: {
  open: boolean
  onClose: () => void
  onSelect: (ref: MaterialRef) => void
  title?: string
  selected?: MaterialRef | null
  preferCollection?: boolean
}) {
  useEffect(() => {
    void searchMaterials('', { limit: 1 }).catch(() => {})
  }, [])

  if (!open) return null

  return (
    <div className="tex-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="tex-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <header className="tex-modal-header">
          <h3>{title}</h3>
          <button type="button" className="ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>
        <TextureSourceTabs
          selected={selected}
          preferCollection={preferCollection}
          onSelect={(ref) => {
            onSelect(ref)
            onClose()
          }}
        />
      </div>
    </div>
  )
}

export function MaterialSlot({
  label,
  value,
  onChange,
  onClear,
  applyOnly = false,
  preferCollection = false,
}: {
  label: string
  value: MaterialRef | null | undefined
  onChange: (ref: MaterialRef) => void
  onClear: () => void
  applyOnly?: boolean
  preferCollection?: boolean
}) {
  const [open, setOpen] = useState(false)
  const thumb = useMaterialThumb(applyOnly ? null : value)

  return (
    <div className="mat-slot">
      <div className="mat-slot-head">
        <span>{label}</span>
        {!applyOnly && value && (
          <button type="button" className="ghost small" onClick={onClear}>
            Сбросить
          </button>
        )}
        {applyOnly && (
          <button type="button" className="ghost small" onClick={onClear}>
            Сбросить стены
          </button>
        )}
      </div>
      <button
        type="button"
        className="mat-slot-btn"
        onClick={() => setOpen(true)}
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            referrerPolicy="no-referrer"
            onError={(e) => {
              const el = e.currentTarget
              if (!value || value.source !== 'ambientcg' || el.dataset.fallback) {
                el.style.visibility = 'hidden'
                return
              }
              el.dataset.fallback = '1'
              el.src = `https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/${value.assetId}/${value.assetId}_SQ_Color.jpg`
            }}
          />
        ) : (
          <span className="mat-slot-empty">
            {applyOnly ? 'Задать…' : 'Выбрать…'}
          </span>
        )}
        <span className="mat-slot-id">
          {applyOnly
            ? 'Выбрать текстуру для всех стен'
            : materialLabel(value)}
        </span>
      </button>
      {!applyOnly && value && (
        <div className="mat-tile-row">
          <label className="mat-tile">
            Тайл, м
            <input
              type="number"
              min={0.2}
              max={10}
              step={0.1}
              value={value.tileSizeM}
              onChange={(e) =>
                onChange({
                  ...value,
                  tileSizeM: Math.max(0.2, Number(e.target.value) || 1.5),
                })
              }
            />
          </label>
          <label className="mat-tile">
            Рельеф, м
            <input
              type="number"
              min={0}
              max={0.15}
              step={0.005}
              value={value.displacementScale ?? DEFAULT_DISPLACEMENT_SCALE}
              onChange={(e) =>
                onChange({
                  ...value,
                  displacementScale: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </label>
        </div>
      )}
      <TextureBrowser
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onChange}
        title={label}
        selected={value}
        preferCollection={preferCollection}
      />
    </div>
  )
}
